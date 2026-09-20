const db=require('../db');

async function permissionsFor(user){
  if(['MASTER','PASTOR_PRESIDENTE'].includes(String(user.perfil||'').toUpperCase())) return new Set(['*']);
  const q=await db.query(`
    SELECT DISTINCT p.codigo
    FROM usuario_permissoes up
    JOIN permissoes p ON p.id=up.permissao_id
    WHERE up.usuario_id=$1 AND up.ativo=TRUE
    UNION
    SELECT DISTINCT p.codigo
    FROM usuario_cargos uc
    JOIN cargo_permissoes cp ON cp.cargo_id=uc.cargo_id
    JOIN permissoes p ON p.id=cp.permissao_id
    WHERE uc.usuario_id=$1 AND uc.ativo=TRUE
  `,[user.id]);
  return new Set(q.rows.map(r=>r.codigo));
}
function requirePermission(code){
 return async(req,res,next)=>{
  try{const p=await permissionsFor(req.user);if(p.has('*')||p.has(code))return next();return res.status(403).json({erro:'Você não tem permissão para esta operação.'});}
  catch(e){console.error(e);return res.status(500).json({erro:'Erro ao validar permissão.'});}
 };
}
module.exports={permissionsFor,requirePermission};
