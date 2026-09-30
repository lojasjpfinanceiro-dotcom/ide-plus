// Denominação, cidades e congregações — uma tela só no Nível 1
const router = require('express').Router();
const db = require('../db');
const { autenticar, exigirNivel, exigir } = require('../auth');

router.use(autenticar, exigirNivel(1, 2, 3, 4));

const d = (req) => req.usuario.denominacao_id;

// ---- Denominação
router.get('/denominacao', async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.id, d.nome, d.logo, p.nome AS plano, p.max_congregacoes
       FROM denominacoes d LEFT JOIN planos p ON p.id = d.plano_id WHERE d.id = $1`, [d(req)]);
  res.json(rows[0]);
});

router.put('/denominacao', exigirNivel(1), async (req, res) => {
  const { nome, logo } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da denominação.' });
  await db.query('UPDATE denominacoes SET nome = $1, logo = $2 WHERE id = $3', [nome, logo || null, d(req)]);
  res.json({ ok: true });
});

// ---- Árvore: cidades com suas congregações
router.get('/cidades', async (req, res) => {
  const u = req.usuario;
  const filtroCidade = u.nivel === 1 ? null : u.cidade_id;
  const cidades = (await db.query(
    `SELECT c.*, r.nome AS responsavel_nome, gc.estado_id AS geo_estado_id, ge.pais AS geo_pais
       FROM cidades c LEFT JOIN usuarios r ON r.id = c.responsavel_id
       LEFT JOIN geo_cidades gc ON gc.id = c.geo_cidade_id
       LEFT JOIN geo_estados ge ON ge.id = gc.estado_id
      WHERE c.denominacao_id = $1 AND ($2::bigint IS NULL OR c.id = $2)
      ORDER BY c.is_sede DESC, c.pais, c.estado, c.nome`, [d(req), filtroCidade])).rows;
  const congs = (await db.query(
    `SELECT g.*, r.nome AS responsavel_nome, di.nome AS dirigente_nome,
            (SELECT COUNT(*) FROM pessoas p WHERE p.congregacao_id = g.id)::int AS pessoas
       FROM congregacoes g
       LEFT JOIN usuarios r ON r.id = g.responsavel_id
       LEFT JOIN usuarios di ON di.id = g.dirigente_id
      WHERE g.denominacao_id = $1 AND ($2::bigint IS NULL OR g.cidade_id = $2)
      ORDER BY g.is_sede DESC, g.nome`, [d(req), filtroCidade])).rows;
  // O Pastor Presidente responde pela igreja sede
  const presidente = (await db.query(
    'SELECT nome FROM usuarios WHERE denominacao_id = $1 AND nivel = 1 ORDER BY id LIMIT 1', [d(req)])).rows[0];
  for (const c of cidades) {
    c.congregacoes = congs.filter(g => String(g.cidade_id) === String(c.id)).map(g => {
      const sedeCentral = c.is_sede && g.is_sede;
      const herdado = c.responsavel_todas && c.responsavel_id ? c.responsavel_nome : null;
      return {
        ...g,
        responsavel_efetivo: g.responsavel_nome || herdado || (sedeCentral ? presidente?.nome : null),
        // sem responsável próprio e a cidade não cobre todas → fica laranja (aguardando)
        aguardando: !g.responsavel_id && !herdado && !sedeCentral
      };
    });
  }
  res.json(cidades);
});

// Cidade escolhida na base geográfica → preenche cidade, estado e país sem digitação
async function resolverGeo(b) {
  if (!b.geo_cidade_id) return b;
  const g = (await db.query(
    `SELECT gc.id, gc.nome, ge.codigo AS uf, ge.nome AS estado, gp.codigo AS pais_cod, gp.nome AS pais
       FROM geo_cidades gc JOIN geo_estados ge ON ge.id = gc.estado_id JOIN geo_paises gp ON gp.codigo = ge.pais
      WHERE gc.id = $1`, [b.geo_cidade_id])).rows[0];
  if (!g) throw Object.assign(new Error('Cidade não encontrada na lista.'), { status: 400 });
  return { ...b, geo_cidade_id: g.id, nome: g.nome, estado: g.pais_cod === 'BR' ? g.uf : g.estado, pais: g.pais };
}

// Na cidade sede, o Pastor Presidente é o pastor local quando ninguém mais foi escolhido
async function responsavelDaCidade(req, responsavelId, isSede) {
  const resp = await validarResponsavel(req, responsavelId);
  if (resp || !isSede) return resp;
  if (req.usuario.nivel === 1) return req.usuario.id;
  return (await db.query('SELECT id FROM usuarios WHERE denominacao_id = $1 AND nivel = 1 ORDER BY id LIMIT 1', [d(req)])).rows[0]?.id || null;
}

async function validarResponsavel(req, usuarioId) {
  if (!usuarioId) return null;
  const { rowCount } = await db.query('SELECT 1 FROM usuarios WHERE id = $1 AND denominacao_id = $2', [usuarioId, d(req)]);
  if (!rowCount) throw Object.assign(new Error('Responsável inválido.'), { status: 400 });
  return usuarioId;
}

router.post('/cidades', exigirNivel(1), async (req, res) => {
  const { pais, estado, nome, is_sede, responsavel_id, responsavel_todas, geo_cidade_id } = await resolverGeo(req.body);
  if (!estado || !nome) return res.status(400).json({ erro: 'Escolha o estado e a cidade.' });
  const resp = await responsavelDaCidade(req, responsavel_id, is_sede);
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    if (is_sede) await c.query('UPDATE cidades SET is_sede = FALSE WHERE denominacao_id = $1', [d(req)]);
    const { rows } = await c.query(
      `INSERT INTO cidades (denominacao_id, pais, estado, nome, is_sede, responsavel_id, responsavel_todas, geo_cidade_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d(req), pais || 'Brasil', estado, nome, !!is_sede, resp, !!responsavel_todas, geo_cidade_id || null]);
    // o Pastor Local passa a atuar nesta cidade
    if (resp) await c.query('UPDATE usuarios SET cidade_id = $1 WHERE id = $2 AND nivel = 2', [rows[0].id, resp]);
    // a cidade sede é a cidade do Nível 1
    if (is_sede) await c.query('UPDATE usuarios SET cidade_id = $1 WHERE denominacao_id = $2 AND nivel = 1 AND cidade_id IS NULL', [rows[0].id, d(req)]);
    await c.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
});

router.put('/cidades/:id', exigirNivel(1), async (req, res) => {
  const { pais, estado, nome, is_sede, responsavel_id, responsavel_todas, geo_cidade_id } = await resolverGeo(req.body);
  if (!estado || !nome) return res.status(400).json({ erro: 'Escolha o estado e a cidade.' });
  const resp = await responsavelDaCidade(req, responsavel_id, is_sede);
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    if (is_sede) await c.query('UPDATE cidades SET is_sede = FALSE WHERE denominacao_id = $1 AND id <> $2', [d(req), req.params.id]);
    const { rows } = await c.query(
      `UPDATE cidades SET pais = $1, estado = $2, nome = $3, is_sede = $4, responsavel_id = $5, responsavel_todas = $6,
              geo_cidade_id = $9
        WHERE id = $7 AND denominacao_id = $8 RETURNING *`,
      [pais || 'Brasil', estado, nome, !!is_sede, resp, !!responsavel_todas, req.params.id, d(req), geo_cidade_id || null]);
    if (!rows[0]) { await c.query('ROLLBACK'); return res.status(404).json({ erro: 'Cidade não encontrada.' }); }
    if (resp) await c.query('UPDATE usuarios SET cidade_id = $1 WHERE id = $2 AND nivel = 2', [rows[0].id, resp]);
    await c.query('COMMIT');
    res.json(rows[0]);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
});

router.delete('/cidades/:id', exigirNivel(1), async (req, res) => {
  const n = (await db.query('SELECT COUNT(*)::int AS n FROM pessoas WHERE cidade_id = $1', [req.params.id])).rows[0].n;
  if (n && req.body?.confirmar !== true) {
    return res.status(409).json({ erro: `Esta cidade tem ${n} pessoa(s) cadastrada(s). Confirme para excluir tudo.`, precisa_confirmar: true });
  }
  await db.query('DELETE FROM cidades WHERE id = $1 AND denominacao_id = $2', [req.params.id, d(req)]);
  res.json({ ok: true });
});

// ---- Congregações
router.post('/congregacoes', exigirNivel(1), async (req, res) => {
  const { cidade_id, nome, endereco, bairro, is_sede, responsavel_id } = req.body;
  if (!cidade_id || !nome) return res.status(400).json({ erro: 'Informe a cidade e o nome da congregação.' });
  const lim = (await db.query(
    `SELECT p.max_congregacoes, (SELECT COUNT(*) FROM congregacoes WHERE denominacao_id = $1)::int AS total
       FROM denominacoes d LEFT JOIN planos p ON p.id = d.plano_id WHERE d.id = $1`, [d(req)])).rows[0];
  if (lim.max_congregacoes && lim.total >= lim.max_congregacoes) {
    return res.status(402).json({ erro: `Seu plano permite até ${lim.max_congregacoes} congregações. Fale com o suporte para mudar de plano.` });
  }
  const cid = (await db.query('SELECT id FROM cidades WHERE id = $1 AND denominacao_id = $2', [cidade_id, d(req)])).rows[0];
  if (!cid) return res.status(400).json({ erro: 'Cidade inválida.' });
  const resp = await validarResponsavel(req, responsavel_id);
  const { rows } = await db.query(
    `INSERT INTO congregacoes (denominacao_id, cidade_id, nome, endereco, bairro, is_sede, responsavel_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d(req), cidade_id, nome, endereco || null, bairro || null, !!is_sede, resp]);
  res.status(201).json(rows[0]);
});

router.put('/congregacoes/:id', exigirNivel(1, 2), async (req, res) => {
  const u = req.usuario;
  const atual = (await db.query('SELECT * FROM congregacoes WHERE id = $1 AND denominacao_id = $2', [req.params.id, d(req)])).rows[0];
  if (!atual) return res.status(404).json({ erro: 'Congregação não encontrada.' });

  if (u.nivel === 2) {
    // Nível 2 só define o dirigente das congregações da sua cidade
    if (String(atual.cidade_id) !== String(u.cidade_id)) return res.status(403).json({ erro: 'Congregação de outra cidade.' });
    const dir = await validarResponsavel(req, req.body.dirigente_id);
    await db.query('UPDATE congregacoes SET dirigente_id = $1 WHERE id = $2', [dir, atual.id]);
    return res.json({ ok: true });
  }

  const { cidade_id, nome, endereco, bairro, is_sede, responsavel_id, dirigente_id } = req.body;
  const resp = await validarResponsavel(req, responsavel_id);
  const dir = await validarResponsavel(req, dirigente_id);
  const { rows } = await db.query(
    `UPDATE congregacoes SET cidade_id = $1, nome = $2, endereco = $3, bairro = $4, is_sede = $5,
            responsavel_id = $6, dirigente_id = $7 WHERE id = $8 RETURNING *`,
    [cidade_id || atual.cidade_id, nome || atual.nome, endereco || null, bairro || null, !!is_sede, resp, dir, atual.id]);
  res.json(rows[0]);
});

router.delete('/congregacoes/:id', exigirNivel(1), async (req, res) => {
  await db.query('DELETE FROM congregacoes WHERE id = $1 AND denominacao_id = $2', [req.params.id, d(req)]);
  res.json({ ok: true });
});

module.exports = router;
