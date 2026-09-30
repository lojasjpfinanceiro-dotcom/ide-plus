// Pessoas (convertidos): cada nível vê só as pessoas da cidade em que atua
const router = require('express').Router();
const db = require('../db');
const { autenticar, exigirNivel, pode } = require('../auth');

router.use(autenticar, exigirNivel(1, 2, 3, 4), (req, res, next) => {
  if (!req.usuario.cidade_id) {
    return res.status(409).json({ erro: req.usuario.nivel === 1
      ? 'Cadastre a cidade da igreja sede em Estrutura para começar a cadastrar pessoas.'
      : 'Seu usuário ainda não tem cidade definida. Fale com quem cadastrou você.' });
  }
  next();
});

const CAMPOS = ['congregacao_id','nome','foto','cpf','telefone','nascimento','endereco','numero','bairro','observacao',
  'como_chegou_id','data_conversao','autoriza_dados'];

router.get('/', async (req, res) => {
  const u = req.usuario;
  const busca = req.query.busca ? `%${String(req.query.busca).trim()}%` : null;
  const status = ['CONVERTIDO','DISCIPULADO','BATIZADO','AFASTADO'].includes(req.query.status) ? req.query.status : null;
  const { rows } = await db.query(
    `SELECT p.id, p.nome, p.foto, p.telefone, p.status, p.data_conversao, p.data_batismo, p.congregacao_id,
            p.etapa_antes_afastar, p.data_afastamento,
            g.nome AS congregacao, ci.nome AS como_chegou
       FROM pessoas p
       LEFT JOIN congregacoes g ON g.id = p.congregacao_id
       LEFT JOIN config_itens ci ON ci.id = p.como_chegou_id
      WHERE p.denominacao_id = $1 AND p.cidade_id = $2
        AND ($3::text IS NULL OR p.nome ILIKE $3 OR p.telefone ILIKE $3 OR p.cpf ILIKE $3)
        AND ($4::text IS NULL OR p.status = $4)
      ORDER BY p.criado_em DESC LIMIT 500`, [u.denominacao_id, u.cidade_id, busca, status]);
  res.json(rows);
});

async function buscar(req) {
  const { rows } = await db.query('SELECT * FROM pessoas WHERE id = $1 AND denominacao_id = $2 AND cidade_id = $3',
    [req.params.id, req.usuario.denominacao_id, req.usuario.cidade_id]);
  return rows[0];
}

router.get('/:id', async (req, res) => {
  const p = await buscar(req);
  if (!p) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
  res.json(p);
});

async function limpar(req, b) {
  const v = {};
  for (const k of CAMPOS) v[k] = b[k] === '' || b[k] === undefined ? null : b[k];
  v.autoriza_dados = !!b.autoriza_dados;
  const OBRIG = { nome: 'Nome completo', telefone: 'Telefone', data_conversao: 'Data da conversão', congregacao_id: 'Congregação',
    como_chegou_id: 'Como chegou', endereco: 'Endereço', numero: 'Número', bairro: 'Bairro' };
  const faltando = Object.keys(OBRIG).filter((k) => !v[k] || !String(v[k]).trim());
  if (faltando.length) throw Object.assign(new Error('Preencha os campos obrigatórios: ' + faltando.map((k) => OBRIG[k]).join(', ') + '.'), { status: 400 });
  if (v.cpf) v.cpf = String(v.cpf).replace(/\D/g, '').slice(0, 11);
  if (v.congregacao_id) {
    const ok = (await db.query('SELECT 1 FROM congregacoes WHERE id = $1 AND cidade_id = $2', [v.congregacao_id, req.usuario.cidade_id])).rowCount;
    if (!ok) throw Object.assign(new Error('Congregação de outra cidade.'), { status: 400 });
  }
  return v;
}

router.post('/', async (req, res) => {
  const u = req.usuario;
  if (!pode(u, 'pessoas.cadastrar')) return res.status(403).json({ erro: 'Você não tem permissão para cadastrar pessoas.' });
  const v = await limpar(req, req.body);
  v.data_conversao = v.data_conversao || new Date().toISOString().slice(0, 10);
  const { rows } = await db.query(
    `INSERT INTO pessoas (denominacao_id, cidade_id, criado_por, ${CAMPOS.join(', ')})
     VALUES ($1, $2, $3, ${CAMPOS.map((_, i) => '$' + (i + 4)).join(', ')}) RETURNING id`,
    [u.denominacao_id, u.cidade_id, u.id, ...CAMPOS.map(k => v[k])]);
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  if (!pode(req.usuario, 'pessoas.editar')) return res.status(403).json({ erro: 'Você não tem permissão para alterar pessoas.' });
  const p = await buscar(req);
  if (!p) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
  const v = await limpar(req, req.body);
  v.data_conversao = v.data_conversao || p.data_conversao;
  await db.query(`UPDATE pessoas SET ${CAMPOS.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${CAMPOS.length + 1}`,
    [...CAMPOS.map(k => v[k]), p.id]);
  res.json({ ok: true });
});

// Etapas do fluxo: convertido → discipulado → batizado; em qualquer etapa a pessoa pode se afastar (e voltar)
router.post('/:id/status', async (req, res) => {
  const u = req.usuario;
  const p = await buscar(req);
  if (!p) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
  const { status, data_batismo, data_afastamento, motivo } = req.body;

  if (status === 'VOLTOU') {
    if (!pode(u, 'pessoas.editar')) return res.status(403).json({ erro: 'Você não tem permissão para alterar pessoas.' });
    if (p.status !== 'AFASTADO') return res.status(400).json({ erro: 'Esta pessoa não está afastada.' });
    await db.query(`UPDATE pessoas SET status = COALESCE(etapa_antes_afastar, 'CONVERTIDO'), etapa_antes_afastar = NULL,
                           data_afastamento = NULL, motivo_afastamento = NULL WHERE id = $1`, [p.id]);
    return res.json({ ok: true });
  }
  if (!['CONVERTIDO','DISCIPULADO','BATIZADO','AFASTADO'].includes(status)) return res.status(400).json({ erro: 'Etapa inválida.' });

  if (status === 'AFASTADO') {
    if (!pode(u, 'pessoas.editar')) return res.status(403).json({ erro: 'Você não tem permissão para alterar pessoas.' });
    if (p.status === 'AFASTADO') return res.status(400).json({ erro: 'Esta pessoa já está como afastada.' });
    await db.query(`UPDATE pessoas SET status = 'AFASTADO', etapa_antes_afastar = $1,
                           data_afastamento = COALESCE($2::date, CURRENT_DATE), motivo_afastamento = $3 WHERE id = $4`,
      [p.status, data_afastamento || null, motivo || null, p.id]);
    return res.json({ ok: true });
  }

  const limparAfastamento = 'etapa_antes_afastar = NULL, data_afastamento = NULL, motivo_afastamento = NULL';
  if (status === 'BATIZADO') {
    if (!pode(u, 'batismo.registrar')) return res.status(403).json({ erro: 'O batismo é registrado pelo Pastor Local.' });
    await db.query(`UPDATE pessoas SET status = 'BATIZADO', data_batismo = COALESCE($1::date, CURRENT_DATE), batizado_por = $2, ${limparAfastamento} WHERE id = $3`,
      [data_batismo || null, u.id, p.id]);
  } else {
    if (!pode(u, 'pessoas.editar')) return res.status(403).json({ erro: 'Você não tem permissão para alterar pessoas.' });
    await db.query(`UPDATE pessoas SET status = $1, data_batismo = NULL, batizado_por = NULL, ${limparAfastamento} WHERE id = $2`, [status, p.id]);
  }
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  if (!pode(req.usuario, 'pessoas.excluir')) return res.status(403).json({ erro: 'Você não tem permissão para excluir pessoas.' });
  const p = await buscar(req);
  if (!p) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
  await db.query('DELETE FROM pessoas WHERE id = $1', [p.id]);
  res.json({ ok: true });
});

module.exports = router;
