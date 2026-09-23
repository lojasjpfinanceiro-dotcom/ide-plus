const express=require('express');
const db=require('../db');
const auth=require('../middleware/auth');
const {requirePermission}=require('../middleware/permissions');
const {filter}=require('../middleware/scope');
const router=express.Router();
router.use(auth);
router.get('/cidades',requirePermission('resultados.cidades'),async(req,res,next)=>{
  try{
    const s=filter(req.user,'cm.id','cg.id',2);
    const q=await db.query(`
      SELECT cm.id,cm.nome,cm.estado,
        COUNT(p.id) FILTER(WHERE p.ativo=TRUE)::int alcancados,
        COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int convertidos,
        COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status IN('EM_DISCIPULADO','PERMANECEU','BATIZADO'))::int permaneceram,
        COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='SAIU')::int sairam
      FROM cidades_ministeriais cm
      LEFT JOIN congregacoes cg ON cg.cidade_ministerial_id=cm.id AND cg.ativo=TRUE
      LEFT JOIN pessoas p ON p.congregacao_id=cg.id
      WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE${s.sql}
      GROUP BY cm.id ORDER BY cm.nome`,[req.user.denominacao_id,...s.values]);
    res.json(q.rows);
  }catch(e){next(e);}
});
module.exports=router;
