const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { gerarToken, autenticar } = require('../auth');
const { limparCpf, mascararCpf } = require('../cpf');

// Login: CPF (quem está no Brasil) ou e-mail (Pastor Presidente e quem mora fora do país)
router.post('/login', async (req, res) => {
  const ident = String(req.body.login || req.body.email || '').trim();
  const senha = String(req.body.senha || '');
  if (!ident || !senha) return res.status(400).json({ erro: 'Informe o CPF (ou e-mail) e a senha.' });
  const porEmail = ident.includes('@');
  const valor = porEmail ? ident.toLowerCase() : limparCpf(ident);
  const { rows } = await db.query(
    porEmail ? 'SELECT * FROM usuarios WHERE LOWER(email) = $1' : 'SELECT * FROM usuarios WHERE cpf = $1', [valor]);
  const u = rows[0];
  const errado = () => res.status(401).json({ erro: porEmail ? 'E-mail ou senha incorretos.' : 'CPF ou senha incorretos.' });
  if (!u || !u.ativo) return errado();

  if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) {
    const min = Math.ceil((new Date(u.bloqueado_ate) - new Date()) / 60000);
    return res.status(429).json({ erro: `Muitas tentativas erradas. Tente de novo em ${min} minuto(s).` });
  }
  if (!(await bcrypt.compare(senha, u.senha_hash))) {
    const t = (u.tentativas_login || 0) + 1;
    await db.query(
      `UPDATE usuarios SET tentativas_login = $1::smallint,
              bloqueado_ate = CASE WHEN $3::boolean THEN NOW() + INTERVAL '10 minutes' END WHERE id = $2`,
      [t >= 5 ? 0 : t, u.id, t >= 5]);
    if (t >= 5) return res.status(429).json({ erro: 'Muitas tentativas erradas. O acesso ficou bloqueado por 10 minutos.' });
    return errado();
  }
  await db.query('UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = NULL WHERE id = $1', [u.id]);
  res.json({ token: gerarToken(u), trocar_senha: u.trocar_senha });
});

router.get('/me', autenticar, async (req, res) => {
  const u = req.usuario;
  const extra = u.denominacao_id ? (await db.query(
    `SELECT d.nome AS denominacao, d.logo, c.nome AS cidade, c.estado, c.is_sede, cg.nome AS cargo
       FROM denominacoes d
       LEFT JOIN cidades c ON c.id = $2
       LEFT JOIN cargos cg ON cg.id = $3
      WHERE d.id = $1`, [u.denominacao_id, u.cidade_id, u.cargo_id])).rows[0] : {};
  const cpf = (await db.query('SELECT cpf FROM usuarios WHERE id = $1', [u.id])).rows[0].cpf;
  res.json({ ...u, ...extra, cpf: mascararCpf(cpf) });
});

router.put('/me', autenticar, async (req, res) => {
  const { foto, telefone, senha_atual, senha_nova } = req.body;
  if (senha_nova) {
    if (String(senha_nova).length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter ao menos 6 caracteres.' });
    const { rows } = await db.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (req.usuario.trocar_senha) {
      // Troca obrigatória logo após entrar com a senha provisória
      if (await bcrypt.compare(String(senha_nova), rows[0].senha_hash)) {
        return res.status(400).json({ erro: 'A nova senha precisa ser diferente da senha provisória.' });
      }
    } else if (!(await bcrypt.compare(String(senha_atual || ''), rows[0].senha_hash))) {
      return res.status(400).json({ erro: 'A senha atual não confere.' });
    }
    await db.query('UPDATE usuarios SET senha_hash = $1, trocar_senha = FALSE WHERE id = $2',
      [await bcrypt.hash(senha_nova, 10), req.usuario.id]);
  } else if (req.usuario.trocar_senha) {
    return res.status(400).json({ erro: 'Crie a sua nova senha.' });
  }
  await db.query('UPDATE usuarios SET foto = COALESCE($1, foto), telefone = COALESCE($2, telefone) WHERE id = $3',
    [foto ?? null, telefone ?? null, req.usuario.id]);
  res.json({ ok: true });
});

module.exports = router;
