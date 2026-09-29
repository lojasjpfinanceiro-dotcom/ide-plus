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
      SELECT cm.id,cm.nome,cm.estado,cm.pais,
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
    const resumo=await db.query(`SELECT COUNT(DISTINCT cm.id)::int cidades,COUNT(DISTINCT cg.id) FILTER(WHERE cg.ativo=TRUE)::int congregacoes,
      COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE)::int alcancados,
      COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int convertidos,
      COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='EM_DISCIPULADO')::int em_discipulado,
      COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='PREPARANDO_BATISMO')::int preparando_batismo,
      COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='BATIZADO')::int batizados
      FROM cidades_ministeriais cm LEFT JOIN congregacoes cg ON cg.cidade_ministerial_id=cm.id
      LEFT JOIN pessoas p ON p.congregacao_id=cg.id
      WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE${s.sql}`,base);
    const cidades=await db.query(`SELECT cm.id,cm.nome,cm.estado,cm.pais,COUNT(DISTINCT cg.id) FILTER(WHERE cg.ativo=TRUE)::int congregacoes,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE)::int alcancados,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int convertidos,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='EM_DISCIPULADO')::int em_discipulado,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int nao_discipulados,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='SAIU')::int desistidos,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='BATIZADO')::int batizados
      FROM cidades_ministeriais cm LEFT JOIN congregacoes cg ON cg.cidade_ministerial_id=cm.id
      LEFT JOIN pessoas p ON p.congregacao_id=cg.id
      WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE${s.sql} GROUP BY cm.id ORDER BY convertidos DESC,cm.nome`,base);
    const congregacoes=await db.query(`SELECT cg.id,cg.nome,cm.nome cidade,cm.estado,cm.pais,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE)::int alcancados,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int convertidos,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='EM_DISCIPULADO')::int em_discipulado,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int nao_discipulados,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='SAIU')::int desistidos,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='BATIZADO')::int batizados
      FROM congregacoes cg JOIN cidades_ministeriais cm ON cm.id=cg.cidade_ministerial_id
      LEFT JOIN pessoas p ON p.congregacao_id=cg.id
      WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE${s.sql}
      GROUP BY cg.id,cm.nome,cm.estado,cm.pais ORDER BY convertidos DESC,cg.nome`,base);
    const paises=await db.query(`SELECT COALESCE(cm.pais,'Brasil') pais,COUNT(DISTINCT cm.id)::int cidades,COUNT(DISTINCT cg.id) FILTER(WHERE cg.ativo=TRUE)::int congregacoes,COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE)::int alcancados,COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int convertidos,COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='EM_DISCIPULADO')::int em_discipulado,COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int nao_discipulados,COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='SAIU')::int desistidos,COUNT(DISTINCT p.id) FILTER(WHERE p.ativo=TRUE AND p.status='BATIZADO')::int batizados FROM cidades_ministeriais cm LEFT JOIN congregacoes cg ON cg.cidade_ministerial_id=cm.id LEFT JOIN pessoas p ON p.congregacao_id=cg.id WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE${s.sql} GROUP BY COALESCE(cm.pais,'Brasil') ORDER BY convertidos DESC,pais`,base);
    const estados=await db.query(`SELECT COALESCE(cm.pais,'Brasil') pais,COALESCE(cm.estado,'Sem região') estado,COUNT(DISTINCT cm.id)::int cidades,COUNT(DISTINCT cg.id)::int congregacoes,COUNT(p.id) FILTER(WHERE p.ativo=TRUE)::int alcancados,COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int convertidos,COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='EM_DISCIPULADO')::int em_discipulado,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='CONVERTIDO')::int nao_discipulados,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='SAIU')::int desistidos,
      COUNT(p.id) FILTER(WHERE p.ativo=TRUE AND p.status='BATIZADO')::int batizados FROM cidades_ministeriais cm LEFT JOIN congregacoes cg ON cg.cidade_ministerial_id=cm.id AND cg.ativo=TRUE LEFT JOIN pessoas p ON p.congregacao_id=cg.id WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE${s.sql} GROUP BY COALESCE(cm.pais,'Brasil'),COALESCE(cm.estado,'Sem região') ORDER BY convertidos DESC,estado`,base);
    const crescimento=await db.query(`SELECT EXTRACT(YEAR FROM p.criado_em)::int ano,COUNT(DISTINCT p.id)::int total
      FROM pessoas p LEFT JOIN congregacoes cg ON cg.id=p.congregacao_id LEFT JOIN cidades_ministeriais cm ON cm.id=cg.cidade_ministerial_id
      WHERE p.denominacao_id=$1 AND p.ativo=TRUE${s.sql}
      GROUP BY EXTRACT(YEAR FROM p.criado_em) ORDER BY ano`,base);
    const atividades=await db.query(`SELECT tipo,descricao,criado_em FROM (
      SELECT 'PAIS' tipo,'Novo país cadastrado: '||COALESCE(cm.pais,'Brasil') descricao,MIN(cm.criado_em) criado_em FROM cidades_ministeriais cm WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE GROUP BY COALESCE(cm.pais,'Brasil')
      UNION ALL SELECT 'ESTADO','Novo estado cadastrado: '||COALESCE(cm.estado,'Sem região'),MIN(cm.criado_em) FROM cidades_ministeriais cm WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE GROUP BY COALESCE(cm.estado,'Sem região')
      UNION ALL SELECT 'CIDADE','Nova cidade cadastrada: '||cm.nome,cm.criado_em FROM cidades_ministeriais cm WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE
      UNION ALL SELECT 'CONGREGACAO','Nova congregação cadastrada: '||cg.nome,cg.criado_em FROM congregacoes cg WHERE cg.denominacao_id=$1 AND cg.ativo=TRUE
    ) x ORDER BY criado_em DESC LIMIT 6`,[req.user.denominacao_id]);
    res.json({resumo:resumo.rows[0],paises:paises.rows,estados:estados.rows,cidades:cidades.rows,congregacoes:congregacoes.rows,crescimento:crescimento.rows,atividades:atividades.rows});
  }catch(e){next(e);}
});
module.exports=router;
