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

router.get('/painel',async(req,res,next)=>{
  try{
    const s=filter(req.user,'cm.id','cg.id',2);
    const base=[req.user.denominacao_id,...s.values];
    const resumo=await db.query(`SELECT COUNT(DISTINCT cm.id)::int cidades,COUNT(DISTINCT cg.id)::int congregacoes,
      COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE)::int alcancados,
      COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int convertidos,
      COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='EM_DISCIPULADO')::int em_discipulado,
      COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='PREPARANDO_BATISMO')::int preparando_batismo,
      COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='BATIZADO')::int batizados
      FROM cidades_ministeriais cm LEFT JOIN congregacoes cg ON cg.cidade_ministerial_id=cm.id AND cg.ativo=TRUE
      LEFT JOIN pessoas p ON p.congregacao_id=cg.id
      WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE${s.sql}`,base);
    const cidades=await db.query(`SELECT cm.id,cm.nome,cm.estado,COUNT(DISTINCT cg.id)::int congregacoes,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE)::int alcancados,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int convertidos,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='EM_DISCIPULADO')::int em_discipulado
      FROM cidades_ministeriais cm LEFT JOIN congregacoes cg ON cg.cidade_ministerial_id=cm.id AND cg.ativo=TRUE
      LEFT JOIN pessoas p ON p.congregacao_id=cg.id
      WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE${s.sql} GROUP BY cm.id ORDER BY convertidos DESC,cm.nome`,base);
    const congregacoes=await db.query(`SELECT cg.id,cg.nome,cm.nome cidade,cm.estado,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE)::int alcancados,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int convertidos,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='EM_DISCIPULADO')::int em_discipulado
      FROM congregacoes cg JOIN cidades_ministeriais cm ON cm.id=cg.cidade_ministerial_id
      LEFT JOIN pessoas p ON p.congregacao_id=cg.id
      WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE AND cg.ativo=TRUE${s.sql}
      GROUP BY cg.id,cm.nome,cm.estado ORDER BY convertidos DESC,cg.nome`,base);
    res.json({resumo:resumo.rows[0],cidades:cidades.rows,congregacoes:congregacoes.rows});
  }catch(e){next(e);}
});
module.exports=router;
