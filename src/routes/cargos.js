// Cargos configuráveis (padrão do Nível 1 + cargos próprios da cidade) e suas permissões.
// Um cargo padrão não é alterado nem excluído pelas cidades: elas podem desativá-lo
// ou personalizar as permissões só para a própria cidade (tabela cargo_cidade_ajustes).
const router = require('express').Router();
const db = require('../db');
const { autenticar, exigirNivel, pode } = require('../auth');

router.use(autenticar, exigirNivel(1, 2, 3));

router.get('/permissoes', async (req, res) => {
  res.json((await db.query('SELECT * FROM permissoes ORDER BY ordem')).rows);
});

router.get('/', async (req, res) => {
  const u = req.usuario;
  const cidade = u.nivel === 1 ? null : u.cidade_id;
  const { rows } = await db.query(
    `SELECT c.*, (c.cidade_id IS NULL) AS padrao,
            (aj.permissoes IS NOT NULL) AS personalizado,
            (c.ativo AND COALESCE(aj.ativo, TRUE)) AS ativo,
            COALESCE(aj.permissoes,
              (SELECT COALESCE(array_agg(cp.codigo), '{}') FROM cargo_permissoes cp WHERE cp.cargo_id = c.id)) AS permissoes,
            (SELECT COUNT(*) FROM usuarios x
              WHERE x.cargo_id = c.id AND ($3::bigint IS NULL OR x.cidade_id = $3))::int AS usuarios
       FROM cargos c
       LEFT JOIN cargo_cidade_ajustes aj ON aj.cargo_id = c.id AND aj.cidade_id = $3
      WHERE c.denominacao_id = $1 AND ($2 = 1 OR c.cidade_id IS NULL OR c.cidade_id = $3)
        AND ($2 = 1 OR c.nivel > $2)
      ORDER BY c.nivel, c.nome`, [u.denominacao_id, u.nivel, cidade]);
  res.json(rows);
});

// Cargo que o usuário pode alterar e excluir por inteiro
function podeEditar(u, cargo) {
  if (u.nivel === 1) return true;
  return cargo.cidade_id != null && String(cargo.cidade_id) === String(u.cidade_id)
    && cargo.nivel > u.nivel && pode(u, 'cargos.gerenciar');
}

// Cargo padrão que a cidade pode só desativar ou personalizar
function podeAjustar(u, cargo) {
  return u.nivel > 1 && cargo.cidade_id == null && cargo.nivel > u.nivel && pode(u, 'cargos.gerenciar');
}

async function usuariosDoCargo(cargoId, cidadeId) {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS n FROM usuarios WHERE cargo_id = $1 AND ($2::bigint IS NULL OR cidade_id = $2)',
    [cargoId, cidadeId]);
  return rows[0].n;
}

const bloqueio = (n, acao) => `Este cargo tem ${n} usuário(s). Mova-os para outro cargo antes de ${acao}.`;

async function salvarPermissoes(c, cargoId, lista) {
  await c.query('DELETE FROM cargo_permissoes WHERE cargo_id = $1', [cargoId]);
  for (const codigo of lista || []) {
    await c.query('INSERT INTO cargo_permissoes (cargo_id, codigo) VALUES ($1,$2) ON CONFLICT DO NOTHING', [cargoId, codigo]);
  }
}

async function buscar(u, id) {
  return (await db.query('SELECT * FROM cargos WHERE id = $1 AND denominacao_id = $2', [id, u.denominacao_id])).rows[0];
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
  const cargo = await buscar(u, req.params.id);
  if (!cargo) return res.status(404).json({ erro: 'Cargo não encontrado.' });
  const { nome, nivel, permissoes, ativo } = req.body;

  // Cargo padrão visto por uma cidade: ajuste local
  if (podeAjustar(u, cargo)) {
    if (ativo === false) {
      const n = await usuariosDoCargo(cargo.id, u.cidade_id);
      if (n) return res.status(400).json({ erro: bloqueio(n, 'desativar') });
    }
    const atual = (await db.query('SELECT * FROM cargo_cidade_ajustes WHERE cargo_id = $1 AND cidade_id = $2',
      [cargo.id, u.cidade_id])).rows[0] || { ativo: true, permissoes: null };
    const novoAtivo = typeof ativo === 'boolean' ? ativo : atual.ativo;
    const novasPerms = req.body.restaurar ? null : Array.isArray(permissoes) ? permissoes : atual.permissoes;
    await db.query(
      `INSERT INTO cargo_cidade_ajustes (cargo_id, cidade_id, ativo, permissoes) VALUES ($1,$2,$3,$4)
       ON CONFLICT (cargo_id, cidade_id) DO UPDATE SET ativo = EXCLUDED.ativo, permissoes = EXCLUDED.permissoes`,
      [cargo.id, u.cidade_id, novoAtivo, novasPerms]);
    return res.json({ ok: true });
  }

  if (!podeEditar(u, cargo)) return res.status(403).json({ erro: 'Este cargo foi criado por outro nível.' });
  if (ativo === false && cargo.ativo) {
    const n = await usuariosDoCargo(cargo.id, null);
    if (n) return res.status(400).json({ erro: bloqueio(n, 'desativar') });
  }
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('UPDATE cargos SET nome = $1, nivel = $2, ativo = $3 WHERE id = $4',
      [nome || cargo.nome, u.nivel === 1 ? Number(nivel || cargo.nivel) : cargo.nivel,
       typeof ativo === 'boolean' ? ativo : cargo.ativo, cargo.id]);
    if (Array.isArray(permissoes)) await salvarPermissoes(c, cargo.id, permissoes);
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
});

router.delete('/:id', async (req, res) => {
  const u = req.usuario;
  const cargo = await buscar(u, req.params.id);
  if (!cargo) return res.status(404).json({ erro: 'Cargo não encontrado.' });
  if (!podeEditar(u, cargo)) {
    return res.status(403).json({ erro: cargo.cidade_id == null
      ? 'Cargo padrão da denominação: você pode desativá-lo para a sua cidade, mas não excluí-lo.'
      : 'Este cargo foi criado por outro nível.' });
  }
  const n = await usuariosDoCargo(cargo.id, null);
  if (n) return res.status(400).json({ erro: bloqueio(n, 'excluir') });
  await db.query('DELETE FROM cargos WHERE id = $1', [cargo.id]);
  res.json({ ok: true });
});

module.exports = router;
