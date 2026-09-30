// Nível 0 — painel do fornecedor: clientes (denominações), planos e recebíveis
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { autenticar, exigirNivel } = require('../auth');

router.use(autenticar, exigirNivel(0));

router.get('/resumo', async (req, res) => {
  const { rows } = await db.query(`
    SELECT (SELECT COUNT(*) FROM denominacoes WHERE status = 'ATIVO')::int AS clientes_ativos,
           (SELECT COUNT(*) FROM denominacoes)::int AS clientes,
           (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status = 'ABERTA') AS a_receber,
           (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status = 'ABERTA' AND vencimento < CURRENT_DATE) AS vencido,
           (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status = 'PAGA'
                AND date_trunc('month', pago_em) = date_trunc('month', CURRENT_DATE)) AS recebido_mes`);
  res.json(rows[0]);
});

// ---- Planos
router.get('/planos', async (req, res) => {
  const { rows } = await db.query(`SELECT p.*, (SELECT COUNT(*) FROM denominacoes d WHERE d.plano_id = p.id)::int AS clientes
                                     FROM planos p ORDER BY preco_mensal, nome`);
  res.json(rows);
});
router.post('/planos', async (req, res) => {
  const { nome, preco_mensal, max_congregacoes } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do plano.' });
  const { rows } = await db.query(
    'INSERT INTO planos (nome, preco_mensal, max_congregacoes) VALUES ($1,$2,$3) RETURNING *',
    [nome, Number(preco_mensal) || 0, max_congregacoes ? Number(max_congregacoes) : null]);
  res.status(201).json(rows[0]);
});
router.put('/planos/:id', async (req, res) => {
  const { nome, preco_mensal, max_congregacoes, ativo } = req.body;
  const { rows } = await db.query(
    `UPDATE planos SET nome = $1, preco_mensal = $2, max_congregacoes = $3, ativo = COALESCE($4, ativo)
      WHERE id = $5 RETURNING *`,
    [nome, Number(preco_mensal) || 0, max_congregacoes ? Number(max_congregacoes) : null, ativo ?? null, req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Plano não encontrado.' });
  res.json(rows[0]);
});
router.delete('/planos/:id', async (req, res) => {
  const uso = (await db.query('SELECT 1 FROM denominacoes WHERE plano_id = $1 LIMIT 1', [req.params.id])).rowCount;
  if (uso) return res.status(409).json({ erro: 'Há clientes neste plano. Mude o plano deles ou desative este plano.' });
  await db.query('DELETE FROM planos WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ---- Clientes (cada um recebe o sistema vazio + o primeiro usuário Nível 1)
router.get('/clientes', async (req, res) => {
  const { rows } = await db.query(`
    SELECT d.id, d.nome, d.status, d.plano_id, d.contato_nome, d.contato_telefone, d.criado_em,
           p.nome AS plano, p.preco_mensal,
           (SELECT COUNT(*) FROM congregacoes c WHERE c.denominacao_id = d.id)::int AS congregacoes,
           (SELECT COUNT(*) FROM usuarios u WHERE u.denominacao_id = d.id)::int AS usuarios,
           (SELECT u.email FROM usuarios u WHERE u.denominacao_id = d.id AND u.nivel = 1 ORDER BY u.id LIMIT 1) AS email_admin
      FROM denominacoes d LEFT JOIN planos p ON p.id = d.plano_id
     ORDER BY d.criado_em DESC`);
  res.json(rows);
});

router.post('/clientes', async (req, res) => {
  const { nome, plano_id, contato_nome, contato_telefone, admin_nome, admin_email, admin_senha } = req.body;
  if (!nome || !admin_nome || !admin_email || !admin_senha) {
    return res.status(400).json({ erro: 'Preencha a denominação e os dados do Pastor Presidente.' });
  }
  if (String(admin_senha).length < 6) return res.status(400).json({ erro: 'A senha inicial precisa ter ao menos 6 caracteres.' });
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const d = (await c.query(
      `INSERT INTO denominacoes (nome, plano_id, contato_nome, contato_telefone) VALUES ($1,$2,$3,$4) RETURNING *`,
      [nome, plano_id || null, contato_nome || admin_nome, contato_telefone || null])).rows[0];
    await c.query(
      `INSERT INTO usuarios (denominacao_id, nivel, nome, email, senha_hash) VALUES ($1, 1, $2, $3, $4)`,
      [d.id, admin_nome, String(admin_email).trim().toLowerCase(), await bcrypt.hash(admin_senha, 10)]);
    await c.query('COMMIT');
    res.status(201).json(d);
  } catch (e) {
    await c.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ erro: 'Este e-mail já está em uso.' });
    throw e;
  } finally { c.release(); }
});

router.put('/clientes/:id', async (req, res) => {
  const { nome, plano_id, status, contato_nome, contato_telefone } = req.body;
  const { rows } = await db.query(
    `UPDATE denominacoes SET nome = COALESCE($1, nome), plano_id = $2, status = COALESCE($3, status),
            contato_nome = $4, contato_telefone = $5 WHERE id = $6 RETURNING *`,
    [nome || null, plano_id || null, status || null, contato_nome || null, contato_telefone || null, req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  res.json(rows[0]);
});

router.delete('/clientes/:id', async (req, res) => {
  if (req.body?.confirmar !== 'EXCLUIR') {
    return res.status(400).json({ erro: 'Para excluir definitivamente, confirme digitando EXCLUIR.' });
  }
  await db.query('DELETE FROM denominacoes WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ---- Recebíveis
router.get('/cobrancas', async (req, res) => {
  const { rows } = await db.query(`
    SELECT c.*, d.nome AS cliente,
           (c.status = 'ABERTA' AND c.vencimento < CURRENT_DATE) AS atrasada
      FROM cobrancas c JOIN denominacoes d ON d.id = c.denominacao_id
     ORDER BY c.competencia DESC, d.nome`);
  res.json(rows);
});

// Gera as cobranças do mês para todos os clientes ativos em planos pagos
router.post('/cobrancas/gerar', async (req, res) => {
  const dia = Math.min(Math.max(Number(req.body.dia_vencimento) || 10, 1), 28);
  const { rowCount } = await db.query(`
    INSERT INTO cobrancas (denominacao_id, competencia, valor, vencimento)
    SELECT d.id, date_trunc('month', CURRENT_DATE)::date, p.preco_mensal,
           (date_trunc('month', CURRENT_DATE) + ($1 - 1) * INTERVAL '1 day')::date
      FROM denominacoes d JOIN planos p ON p.id = d.plano_id
     WHERE d.status = 'ATIVO' AND p.preco_mensal > 0
    ON CONFLICT (denominacao_id, competencia) DO NOTHING`, [dia]);
  res.json({ geradas: rowCount });
});

router.post('/cobrancas', async (req, res) => {
  const { denominacao_id, competencia, valor, vencimento, observacao } = req.body;
  if (!denominacao_id || !competencia || !valor || !vencimento) return res.status(400).json({ erro: 'Preencha cliente, mês, valor e vencimento.' });
  try {
    const { rows } = await db.query(
      `INSERT INTO cobrancas (denominacao_id, competencia, valor, vencimento, observacao)
       VALUES ($1, date_trunc('month', $2::date)::date, $3, $4, $5) RETURNING *`,
      [denominacao_id, competencia, Number(valor), vencimento, observacao || null]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Já existe cobrança deste cliente neste mês.' });
    throw e;
  }
});

router.put('/cobrancas/:id', async (req, res) => {
  const { status, valor, vencimento, observacao } = req.body;
  const { rows } = await db.query(
    `UPDATE cobrancas SET status = COALESCE($1, status), valor = COALESCE($2, valor),
            vencimento = COALESCE($3, vencimento), observacao = COALESCE($4, observacao),
            pago_em = CASE WHEN COALESCE($1, status) = 'PAGA' THEN COALESCE(pago_em, CURRENT_DATE) ELSE NULL END
      WHERE id = $5 RETURNING *`,
    [status || null, valor ? Number(valor) : null, vencimento || null, observacao ?? null, req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Cobrança não encontrada.' });
  res.json(rows[0]);
});

router.delete('/cobrancas/:id', async (req, res) => {
  await db.query('DELETE FROM cobrancas WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
