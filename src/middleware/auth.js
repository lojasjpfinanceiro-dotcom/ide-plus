const jwt = require('jsonwebtoken');

module.exports = function auth(req,res,next){
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):null;
  if(!token) return res.status(401).json({erro:'Não autenticado.'});
  try{ req.user=jwt.verify(token,process.env.JWT_SECRET); next(); }
  catch{ return res.status(401).json({erro:'Sessão inválida ou expirada.'}); }
};
