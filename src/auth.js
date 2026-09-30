const jwt = require('jsonwebtoken');
const db = require('./db');

// Permissões que cada nível já tem por natureza; o cargo acrescenta e a marcação individual
// (sim/não) prevalece sobre tudo. O Nível 1 tem acesso total.
const BASE_POR_NIVEL = {
  2: ['usuarios.gerenciar', 'cargos.gerenciar', 'pessoas.cadastrar', 'pessoas.editar', 'pessoas.excluir',
      'batismo.registrar', 'campanhas.gerenciar', 'discipulado.gerenciar', 'agenda.gerenciar',
      'config.gerenciar', 'relatorios.ver'],
  3: ['usuarios.gerenciar', 'pessoas.cadastrar', 'pessoas.editar', 'campanhas.gerenciar',
      'discipulado.gerenciar', 'agenda.gerenciar', 'relatorios.ver'],
  4: ['pessoas.cadastrar']
};

const SEGREDO = () => process.env.JWT_SECRET || 'dev-inseguro';

function gerarToken(usuario) {
  return jwt.sign({ id: usuario.id }, SEGREDO(), { expiresIn: '12h' });
}

async function autenticar(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Faça login para continuar.' });
  let dados;
  try { dados = jwt.verify(token, SEGREDO()); }
  catch { return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' }); }

  const { rows } = await db.query(
    `SELECT u.id, u.nivel, u.nome, u.email, u.foto, u.telefone, u.denominacao_id, u.cidade_id, u.cargo_id, u.ativo, u.trocar_senha,
            d.status AS denominacao_status
       FROM usuarios u LEFT JOIN denominacoes d ON d.id = u.denominacao_id
      WHERE u.id = $1`, [dados.id]);
  const u = rows[0];
  if (!u || !u.ativo) return res.status(401).json({ erro: 'Usuário inativo.' });
  if (u.nivel > 0 && u.denominacao_status !== 'ATIVO') {
    return res.status(403).json({ erro: 'Acesso suspenso. Fale com o administrador do IDE+.' });
  }

  // Senha provisória: antes de qualquer coisa, a pessoa precisa criar a própria senha
  if (u.trocar_senha && !/^\/api\/auth\/me\/?$/.test(req.originalUrl.split('?')[0])) {
    return res.status(403).json({ erro: 'Crie a sua senha para continuar.', trocar_senha: true });
  }

  if (u.nivel <= 1) {
    u.permissoes = null; // acesso total
  } else {
    const p = await db.query(
      `SELECT p.codigo,
              COALESCE(up.permitido, cp.codigo IS NOT NULL OR p.codigo = ANY($3::text[])) AS ok
         FROM permissoes p
         LEFT JOIN cargo_permissoes cp ON cp.codigo = p.codigo AND cp.cargo_id = $2
         LEFT JOIN usuario_permissoes up ON up.codigo = p.codigo AND up.usuario_id = $1`,
      [u.id, u.cargo_id, BASE_POR_NIVEL[u.nivel] || []]);
    u.permissoes = p.rows.filter(r => r.ok).map(r => r.codigo);
  }
  req.usuario = u;
  next();
}

const pode = (u, codigo) => u.nivel <= 1 || (u.permissoes || []).includes(codigo);

function exigirNivel(...niveis) {
  return (req, res, next) => niveis.includes(req.usuario.nivel)
    ? next() : res.status(403).json({ erro: 'Seu nível de acesso não permite esta ação.' });
}

function exigir(codigo) {
  return (req, res, next) => pode(req.usuario, codigo)
    ? next() : res.status(403).json({ erro: 'Você não tem permissão para esta ação.' });
}

module.exports = { BASE_POR_NIVEL, gerarToken, autenticar, exigirNivel, exigir, pode };
