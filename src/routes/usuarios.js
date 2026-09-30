// Cadastro único de usuários (login e senha). Cada nível cadastra os níveis abaixo dele.
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { autenticar, exigirNivel, pode, BASE_POR_NIVEL } = require('../auth');

router.use(autenticar, exigirNivel(1, 2, 3));

const podeGerenciar = (u) => u.nivel === 1 || pode(u, 'usuarios.gerenciar');

// Nível 1 vê todos; 2 e 3 veem os da sua cidade em níveis abaixo do seu
function escopo(u, alias = 'u') {
  if (u.nivel === 1) return { sql: `${alias}.denominacao_id = $1`, params: [u.denominacao_id] };
  return {
    sql: `${alias}.denominacao_id = $1 AND ${alias}.cidade_id = $2 AND ${alias}.nivel > $3`,
    params: [u.denominacao_id, u.cidade_id, u.nivel]
  };
}

router.get('/', async (req, res) => {
  const e = escopo(req.usuario);
  const { rows } = await db.query(
    `SELECT u.id, u.nivel, u.nome, u.email, u.telefone, u.foto, u.cidade_id, u.cargo_id, u.ativo,
            c.nome AS cidade, cg.nome AS cargo
       FROM usuarios u
       LEFT JOIN cidades c ON c.id = u.cidade_id
       LEFT JOIN cargos cg ON cg.id = u.cargo_id
      WHERE ${e.sql}
      ORDER BY u.nivel, u.nome`, e.params);
  res.json(rows);
});

async function validar(req, dados, idAtual) {
  const u = req.usuario;
  const nivel = Number(dados.nivel);
  if (!(nivel >= 1 && nivel <= 4)) return 'Escolha o nível do usuário.';
  if (u.nivel !== 1 && nivel <= u.nivel) return 'Você só pode cadastrar usuários de níveis abaixo do seu.';
  if (!dados.nome || !dados.email) return 'Informe nome e e-mail.';
  if (!idAtual && String(dados.senha || '').length < 6) return 'A senha precisa ter ao menos 6 caracteres.';
  if (u.nivel !== 1) dados.cidade_id = u.cidade_id; // 2 e 3 só cadastram na própria cidade
  if (dados.cidade_id) {
    const ok = (await db.query('SELECT 1 FROM cidades WHERE id = $1 AND denominacao_id = $2', [dados.cidade_id, u.denominacao_id])).rowCount;
    if (!ok) return 'Cidade inválida.';
  } else if (nivel >= 2) return 'Informe a cidade em que o usuário vai atuar.';
  if (dados.cargo_id) {
    const ok = (await db.query('SELECT 1 FROM cargos WHERE id = $1 AND denominacao_id = $2', [dados.cargo_id, u.denominacao_id])).rowCount;
    if (!ok) return 'Cargo inválido.';
  }
  return null;
}

router.post('/', async (req, res) => {
  if (!podeGerenciar(req.usuario)) return res.status(403).json({ erro: 'Você não tem permissão para cadastrar usuários.' });
  const b = { ...req.body };
  const erro = await validar(req, b);
  if (erro) return res.status(400).json({ erro });
  try {
    const { rows } = await db.query(
      `INSERT INTO usuarios (denominacao_id, nivel, nome, email, senha_hash, telefone, foto, cidade_id, cargo_id, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [req.usuario.denominacao_id, Number(b.nivel), b.nome, String(b.email).trim().toLowerCase(),
       await bcrypt.hash(String(b.senha), 10), b.telefone || null, b.foto || null,
       b.cidade_id || null, b.cargo_id || null, req.usuario.id]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Este e-mail já está em uso.' });
    throw e;
  }
});

async function buscarNoEscopo(req, id) {
  const e = escopo(req.usuario);
  const { rows } = await db.query(`SELECT * FROM usuarios u WHERE ${e.sql} AND u.id = $${e.params.length + 1}`, [...e.params, id]);
  return rows[0];
}

router.put('/:id', async (req, res) => {
  if (!podeGerenciar(req.usuario)) return res.status(403).json({ erro: 'Você não tem permissão para alterar usuários.' });
  const alvo = await buscarNoEscopo(req, req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  const b = { ...req.body };
  const erro = await validar(req, b, alvo.id);
  if (erro) return res.status(400).json({ erro });
  if (String(alvo.id) === String(req.usuario.id) && Number(b.nivel) !== alvo.nivel) {
    return res.status(400).json({ erro: 'Você não pode mudar o seu próprio nível.' });
  }
  if (b.senha && String(b.senha).length < 6) return res.status(400).json({ erro: 'A senha precisa ter ao menos 6 caracteres.' });
  try {
    await db.query(
      `UPDATE usuarios SET nivel = $1, nome = $2, email = $3, telefone = $4, foto = $5, cidade_id = $6,
              cargo_id = $7, ativo = $8 WHERE id = $9`,
      [Number(b.nivel), b.nome, String(b.email).trim().toLowerCase(), b.telefone || null, b.foto || null,
       b.cidade_id || null, b.cargo_id || null, b.ativo !== false, alvo.id]);
    if (b.senha) {
      await db.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [await bcrypt.hash(String(b.senha), 10), alvo.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Este e-mail já está em uso.' });
    throw e;
  }
});

router.delete('/:id', async (req, res) => {
  if (!podeGerenciar(req.usuario)) return res.status(403).json({ erro: 'Você não tem permissão para excluir usuários.' });
  if (String(req.params.id) === String(req.usuario.id)) return res.status(400).json({ erro: 'Você não pode excluir o seu próprio usuário.' });
  const alvo = await buscarNoEscopo(req, req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  await db.query('DELETE FROM usuarios WHERE id = $1', [alvo.id]);
  res.json({ ok: true });
});

// ---- Permissões individuais (marcar quem tem acesso ou não)
router.get('/:id/permissoes', async (req, res) => {
  const alvo = await buscarNoEscopo(req, req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  const { rows } = await db.query(
    `SELECT p.codigo, p.modulo, p.descricao,
            (cp.codigo IS NOT NULL OR p.codigo = ANY($3::text[])) AS padrao, up.permitido AS individual,
            COALESCE(up.permitido, cp.codigo IS NOT NULL OR p.codigo = ANY($3::text[])) AS efetivo
       FROM permissoes p
       LEFT JOIN cargo_permissoes cp ON cp.codigo = p.codigo AND cp.cargo_id = $2
       LEFT JOIN usuario_permissoes up ON up.codigo = p.codigo AND up.usuario_id = $1
      ORDER BY p.ordem`, [alvo.id, alvo.cargo_id, BASE_POR_NIVEL[alvo.nivel] || []]);
  res.json({ nivel: alvo.nivel, acesso_total: alvo.nivel === 1, permissoes: rows });
});

router.put('/:id/permissoes', async (req, res) => {
  const alvo = await buscarNoEscopo(req, req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (alvo.nivel === 1) return res.status(400).json({ erro: 'O Nível 1 tem acesso total.' });
  const lista = Array.isArray(req.body.permissoes) ? req.body.permissoes : [];
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM usuario_permissoes WHERE usuario_id = $1', [alvo.id]);
    for (const p of lista) {
      if (p.individual === true || p.individual === false) {
        await c.query('INSERT INTO usuario_permissoes (usuario_id, codigo, permitido) VALUES ($1,$2,$3)', [alvo.id, p.codigo, p.individual]);
      }
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  res.json({ ok: true });
});

module.exports = router;
