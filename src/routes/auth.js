const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { gerarToken, autenticar } = require('../auth');

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');
  if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  const { rows } = await db.query('SELECT * FROM usuarios WHERE LOWER(email) = $1', [email]);
  const u = rows[0];
  if (!u || !u.ativo || !(await bcrypt.compare(senha, u.senha_hash))) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }
  res.json({ token: gerarToken(u) });
});

router.get('/me', autenticar, async (req, res) => {
  const u = req.usuario;
  const extra = u.denominacao_id ? (await db.query(
    `SELECT d.nome AS denominacao, d.logo, c.nome AS cidade, c.estado, c.is_sede, cg.nome AS cargo
       FROM denominacoes d
       LEFT JOIN cidades c ON c.id = $2
       LEFT JOIN cargos cg ON cg.id = $3
      WHERE d.id = $1`, [u.denominacao_id, u.cidade_id, u.cargo_id])).rows[0] : {};
  res.json({ ...u, ...extra });
});

router.put('/me', autenticar, async (req, res) => {
  const { foto, telefone, senha_atual, senha_nova } = req.body;
  if (senha_nova) {
    if (String(senha_nova).length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter ao menos 6 caracteres.' });
    const { rows } = await db.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (!(await bcrypt.compare(String(senha_atual || ''), rows[0].senha_hash))) {
      return res.status(400).json({ erro: 'A senha atual não confere.' });
    }
    await db.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [await bcrypt.hash(senha_nova, 10), req.usuario.id]);
  }
  await db.query('UPDATE usuarios SET foto = COALESCE($1, foto), telefone = COALESCE($2, telefone) WHERE id = $3',
    [foto ?? null, telefone ?? null, req.usuario.id]);
  res.json({ ok: true });
});

module.exports = router;
