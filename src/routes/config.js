// Configurações: o Nível 1 define o padrão; o Nível 2 herda, desativa itens do padrão
// na sua cidade e acrescenta os seus (que valem para os níveis 3 e 4, nunca sobem ao 1)
const router = require('express').Router();
const db = require('../db');
const { autenticar, exigirNivel, pode } = require('../auth');

router.use(autenticar, exigirNivel(1, 2, 3, 4));

const TIPOS = {
  COMO_CHEGOU: 'Como chegou',
  TIPO_TRABALHO: 'Tipos de trabalho (campanhas)',
  TIPO_EVENTO: 'Tipos de evento',
  TIPO_VISITA: 'Tipos de visita (discipulado)'
};

router.get('/tipos', (req, res) => res.json(TIPOS));

// Itens efetivos para quem está logado
router.get('/', async (req, res) => {
  const u = req.usuario;
  const tipo = TIPOS[req.query.tipo] ? req.query.tipo : null;
  const { rows } = await db.query(
    `SELECT i.id, i.tipo, i.nome, i.ativo, (i.cidade_id IS NULL) AS padrao,
            (dz.item_id IS NOT NULL) AS desativado_na_cidade
       FROM config_itens i
       LEFT JOIN config_desativados dz ON dz.item_id = i.id AND dz.cidade_id = $2
      WHERE i.denominacao_id = $1
        AND ($3::text IS NULL OR i.tipo = $3)
        AND (i.cidade_id IS NULL OR ($4 > 1 AND i.cidade_id = $2))
      ORDER BY i.tipo, (i.cidade_id IS NULL) DESC, i.nome`,
    [u.denominacao_id, u.cidade_id, tipo, u.nivel]);
  // Para os níveis 3 e 4 (e para uso em formulários) só vale o que está ativo
  const soAtivos = req.query.ativos === '1' || u.nivel >= 3;
  res.json(soAtivos ? rows.filter(r => r.ativo && !(u.nivel > 1 && r.desativado_na_cidade)) : rows);
});

function podeMexer(u, item) {
  if (u.nivel === 1) return item.cidade_id === null;
  return u.nivel === 2 && pode(u, 'config.gerenciar') && String(item.cidade_id) === String(u.cidade_id);
}

router.post('/', exigirNivel(1, 2), async (req, res) => {
  const u = req.usuario;
  if (!pode(u, 'config.gerenciar')) return res.status(403).json({ erro: 'Você não tem permissão para alterar configurações.' });
  const { tipo, nome } = req.body;
  if (!TIPOS[tipo] || !nome) return res.status(400).json({ erro: 'Informe o tipo e o nome.' });
  if (u.nivel === 2 && !u.cidade_id) return res.status(409).json({ erro: 'Seu usuário ainda não tem cidade definida.' });
  const { rows } = await db.query(
    'INSERT INTO config_itens (denominacao_id, cidade_id, tipo, nome, criado_por) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [u.denominacao_id, u.nivel === 1 ? null : u.cidade_id, tipo, String(nome).trim(), u.id]);
  res.status(201).json(rows[0]);
});

async function buscar(req) {
  return (await db.query('SELECT * FROM config_itens WHERE id = $1 AND denominacao_id = $2',
    [req.params.id, req.usuario.denominacao_id])).rows[0];
}

router.put('/:id', exigirNivel(1, 2), async (req, res) => {
  const item = await buscar(req);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });
  if (!podeMexer(req.usuario, item)) return res.status(403).json({ erro: 'Este item é do padrão. Você pode desativá-lo na sua cidade.' });
  await db.query('UPDATE config_itens SET nome = COALESCE($1, nome), ativo = COALESCE($2, ativo) WHERE id = $3',
    [req.body.nome || null, typeof req.body.ativo === 'boolean' ? req.body.ativo : null, item.id]);
  res.json({ ok: true });
});

router.delete('/:id', exigirNivel(1, 2), async (req, res) => {
  const item = await buscar(req);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });
  if (!podeMexer(req.usuario, item)) return res.status(403).json({ erro: 'Você só exclui itens que você mesmo criou.' });
  await db.query('DELETE FROM config_itens WHERE id = $1', [item.id]);
  res.json({ ok: true });
});

// Nível 2: liga/desliga um item do padrão só na sua cidade
router.post('/:id/cidade', exigirNivel(2), async (req, res) => {
  const u = req.usuario;
  if (!pode(u, 'config.gerenciar')) return res.status(403).json({ erro: 'Você não tem permissão para alterar configurações.' });
  const item = await buscar(req);
  if (!item || item.cidade_id !== null) return res.status(404).json({ erro: 'Item do padrão não encontrado.' });
  if (req.body.ativo === false) {
    await db.query('INSERT INTO config_desativados (item_id, cidade_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [item.id, u.cidade_id]);
  } else {
    await db.query('DELETE FROM config_desativados WHERE item_id = $1 AND cidade_id = $2', [item.id, u.cidade_id]);
  }
  res.json({ ok: true });
});

module.exports = router;
