// Cargos configuráveis (padrão do Nível 1 + cargos próprios da cidade) e suas permissões
const router = require('express').Router();
const db = require('../db');
const { autenticar, exigirNivel, pode } = require('../auth');

router.use(autenticar, exigirNivel(1, 2, 3));

router.get('/permissoes', async (req, res) => {
  res.json((await db.query('SELECT * FROM permissoes ORDER BY ordem')).rows);
});

router.get('/', async (req, res) => {
  const u = req.usuario;
  const { rows } = await db.query(
    `SELECT c.*, (c.cidade_id IS NULL) AS padrao,
            COALESCE(array_agg(cp.codigo) FILTER (WHERE cp.codigo IS NOT NULL), '{}') AS permissoes,
            (SELECT COUNT(*) FROM usuarios x WHERE x.cargo_id = c.id)::int AS usuarios
       FROM cargos c LEFT JOIN cargo_permissoes cp ON cp.cargo_id = c.id
      WHERE c.denominacao_id = $1 AND ($2 = 1 OR c.cidade_id IS NULL OR c.cidade_id = $3)
        AND ($2 = 1 OR c.nivel > $2)
      GROUP BY c.id ORDER BY c.nivel, c.nome`, [u.denominacao_id, u.nivel, u.cidade_id]);
  res.json(rows);
});

function podeEditar(u, cargo) {
  if (u.nivel === 1) return true;
  return String(cargo.cidade_id) === String(u.cidade_id) && cargo.nivel > u.nivel && pode(u, 'cargos.gerenciar');
}

async function salvarPermissoes(c, cargoId, lista) {
  await c.query('DELETE FROM cargo_permissoes WHERE cargo_id = $1', [cargoId]);
  for (const codigo of lista || []) {
    await c.query('INSERT INTO cargo_permissoes (cargo_id, codigo) VALUES ($1,$2) ON CONFLICT DO NOTHING', [cargoId, codigo]);
  }
}

router.post('/', async (req, res) => {
  const u = req.usuario;
  const { nome, nivel, permissoes } = req.body;
  if (!nome || !(nivel >= 1 && nivel <= 4)) return res.status(400).json({ erro: 'Informe o nome e o nível do cargo.' });
  const novo = { nivel: Number(nivel), cidade_id: u.nivel === 1 ? null : u.cidade_id };
  if (!podeEditar(u, novo)) return res.status(403).json({ erro: 'Você só cria cargos para níveis abaixo do seu.' });
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query(
      'INSERT INTO cargos (denominacao_id, cidade_id, nivel, nome, criado_por) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [u.denominacao_id, novo.cidade_id, novo.nivel, nome, u.id]);
    await salvarPermissoes(c, rows[0].id, permissoes);
    await c.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
});

router.put('/:id', async (req, res) => {
  const u = req.usuario;
  const cargo = (await db.query('SELECT * FROM cargos WHERE id = $1 AND denominacao_id = $2', [req.params.id, u.denominacao_id])).rows[0];
  if (!cargo) return res.status(404).json({ erro: 'Cargo não encontrado.' });
  if (!podeEditar(u, cargo)) return res.status(403).json({ erro: 'Este cargo foi criado por outro nível.' });
  const { nome, nivel, permissoes, ativo } = req.body;
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('UPDATE cargos SET nome = $1, nivel = $2, ativo = $3 WHERE id = $4',
      [nome || cargo.nome, u.nivel === 1 ? Number(nivel || cargo.nivel) : cargo.nivel, ativo !== false, cargo.id]);
    if (Array.isArray(permissoes)) await salvarPermissoes(c, cargo.id, permissoes);
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
});

router.delete('/:id', async (req, res) => {
  const u = req.usuario;
  const cargo = (await db.query('SELECT * FROM cargos WHERE id = $1 AND denominacao_id = $2', [req.params.id, u.denominacao_id])).rows[0];
  if (!cargo) return res.status(404).json({ erro: 'Cargo não encontrado.' });
  if (!podeEditar(u, cargo)) return res.status(403).json({ erro: 'Este cargo foi criado por outro nível.' });
  await db.query('DELETE FROM cargos WHERE id = $1', [cargo.id]);
  res.json({ ok: true });
});

module.exports = router;
