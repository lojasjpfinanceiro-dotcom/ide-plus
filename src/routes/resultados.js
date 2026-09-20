const express=require('express'),db=require('../db'),auth=require('../middleware/auth');const router=express.Router();router.use(auth);
router.get('/cidades',async(req,res)=>{try{const q=await db.query(`
SELECT cm.id,cm.nome,cm.estado,
 COUNT(p.id) FILTER(WHERE p.ativo=TRUE)::int alcancados,
 COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int convertidos,
 COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status IN('EM_DISCIPULADO','PERMANECEU','BATIZADO'))::int permaneceram,
 COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='SAIU')::int sairam
FROM cidades_ministeriais cm
LEFT JOIN congregacoes cg ON cg.cidade_ministerial_id=cm.id AND cg.ativo=TRUE
LEFT JOIN pessoas p ON p.congregacao_id=cg.id
WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE
GROUP BY cm.id ORDER BY cm.nome`,[req.user.denominacao_id]);res.json(q.rows);}catch(e){console.error(e);res.status(500).json({erro:'Erro ao consolidar resultados.'});}});
module.exports=router;