const jwt = require('jsonwebtoken');
const db = require('../db');

module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Não autenticado.' });
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    const q = await db.query(`SELECT u.id,u.nome,u.perfil,u.cargo,u.escopo,u.denominacao_id,
      u.cidade_ministerial_id,u.congregacao_id FROM usuarios u
      JOIN denominacoes d ON d.id=u.denominacao_id AND d.ativo=TRUE
      WHERE u.id=$1 AND u.ativo=TRUE AND u.denominacao_id=$2`,
      [claims.id, claims.denominacao_id]);
    if (!q.rowCount) return res.status(401).json({ erro: 'Acesso inativo ou sessão expirada.' });
    req.user = q.rows[0];
    next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError')
      return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    next(e);
  }
};
