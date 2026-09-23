const express=require('express');
const db=require('../db');
const auth=require('../middleware/auth');
const {requirePermission,permissionsFor,president}=require('../middleware/permissions');
const router=express.Router();
router.use(auth);

const clean=v=>String(v??'').trim();
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
function scope(user){
  if(user.escopo==='DENOMINACAO')return {city:null,church:null};
  if(user.escopo==='CIDADE'&&user.cidade_ministerial_id)
    return {city:user.cidade_ministerial_id,church:null};
  if(user.escopo==='CONGREGACAO'&&user.cidade_ministerial_id&&user.congregacao_id)
    return {city:user.cidade_ministerial_id,church:user.congregacao_id};
  return null;
}
function visible(user,alias,start=2){
  if(user.escopo==='DENOMINACAO')return {sql:'',params:[]};
  if(user.escopo==='CIDADE'&&user.cidade_ministerial_id)
    return {sql:` AND (${alias}.cidade_ministerial_id IS NULL OR
      (${alias}.cidade_ministerial_id=$${start} AND ${alias}.congregacao_id IS NULL))`,
      params:[user.cidade_ministerial_id]};
  if(user.escopo==='CONGREGACAO'&&user.cidade_ministerial_id&&user.congregacao_id)
    return {sql:` AND (${alias}.cidade_ministerial_id IS NULL OR
      (${alias}.cidade_ministerial_id=$${start} AND
       (${alias}.congregacao_id IS NULL OR ${alias}.congregacao_id=$${start+1})))`,
      params:[user.cidade_ministerial_id,user.congregacao_id]};
  return {sql:' AND FALSE',params:[]};
}
function canEdit(user,row){
  if(president(user))return true;
  const s=scope(user);
  return !!s && String(row.cidade_ministerial_id??'')===String(s.city??'') &&
    String(row.congregacao_id??'')===String(s.church??'');
}
async function owned(req,res,table,value){
  if(!id(value)){res.status(400).json({erro:'Identificador inválido.'});return null;}
  const q=await db.query(`SELECT * FROM ${table} WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE`,
    [id(value),req.user.denominacao_id]);
  if(!q.rowCount){res.status(404).json({erro:'Cadastro não encontrado.'});return null;}
  if(!canEdit(req.user,q.rows[0])){
    res.status(403).json({erro:'Este cadastro pertence a outra área.'});return null;
  }
  return q.rows[0];
}
async function readablePlan(req,res,value){
  if(!id(value)){res.status(400).json({erro:'Plano inválido.'});return null;}
  const s=visible(req.user,'p',3);
  const q=await db.query(`SELECT p.* FROM planos_discipulado p
    WHERE p.id=$1 AND p.denominacao_id=$2 AND p.ativo=TRUE${s.sql}`,
    [id(value),req.user.denominacao_id,...s.params]);
  if(!q.rowCount){res.status(404).json({erro:'Plano não encontrado.'});return null;}
  return q.rows[0];
}
function error(e,res,next){
  if(e.code==='23505')return res.status(409).json({erro:'Já existe um cadastro com esse nome nesta área.'});
  next(e);
}

const moduloValido=m=>['CAMPANHA','DISCIPULADO'].includes(m);
const permissao=(modulo,acao)=>modulo==='CAMPANHA'
  ?'atividades.'+(acao==='ler'?'visualizar':'gerenciar')
  :'discipulado.estrutura.'+(acao==='ler'?'visualizar':'gerenciar');
async function autorizado(req,res,modulo,acao){
  if(!moduloValido(modulo)){res.status(400).json({erro:'Módulo inválido.'});return false;}
  const p=await permissionsFor(req.user);
  if(p.has('*')||p.has(permissao(modulo,acao)))return true;
  res.status(403).json({erro:'Você não tem permissão para este módulo.'});return false;
}
function categoriaCompativel(categoria,alvo){
  return (!categoria.cidade_ministerial_id ||
    String(categoria.cidade_ministerial_id)===String(alvo.city)) &&
    (!categoria.congregacao_id ||
    String(categoria.congregacao_id)===String(alvo.church));
}
async function categoriaAcessivel(req,res,value){
  if(!id(value)){res.status(400).json({erro:'Categoria inválida.'});return null;}
  const s=visible(req.user,'c',3);
  const q=await db.query(`SELECT c.* FROM categorias_ministeriais c
    WHERE c.id=$1 AND c.denominacao_id=$2 AND c.ativo=TRUE${s.sql}`,
    [id(value),req.user.denominacao_id,...s.params]);
  if(!q.rowCount){res.status(404).json({erro:'Categoria não encontrada nesta área.'});return null;}
  return q.rows[0];
}
async function categoriaOculta(req,categoriaId){
  const local=scope(req.user);
  if(!local?.city)return false;
  const q=await db.query(`SELECT 1 FROM categorias_ocultas
    WHERE denominacao_id=$1 AND categoria_id=$2 AND cidade_ministerial_id=$3
      AND (congregacao_id IS NULL OR congregacao_id IS NOT DISTINCT FROM $4::bigint)
    LIMIT 1`,[req.user.denominacao_id,categoriaId,local.city,local.church]);
  return !!q.rowCount;
}
router.get('/categorias',async(req,res,next)=>{
  try{
    const modulo=clean(req.query.modulo).toUpperCase();
    if(!await autorizado(req,res,modulo,'ler'))return;
    const local=scope(req.user),s=visible(req.user,'c',5);
    const q=await db.query(`SELECT c.*,
      EXISTS(SELECT 1 FROM categorias_ocultas o
        WHERE o.categoria_id=c.id AND o.denominacao_id=c.denominacao_id
          AND o.cidade_ministerial_id IS NOT DISTINCT FROM $3::bigint
          AND (o.congregacao_id IS NULL OR o.congregacao_id IS NOT DISTINCT FROM $4::bigint)) AS oculta,
      EXISTS(SELECT 1 FROM categorias_ocultas o
        WHERE o.categoria_id=c.id AND o.denominacao_id=c.denominacao_id
          AND o.cidade_ministerial_id IS NOT DISTINCT FROM $3::bigint
          AND o.congregacao_id IS NOT DISTINCT FROM $4::bigint) AS oculta_propria
      FROM categorias_ministeriais c
      WHERE c.denominacao_id=$1 AND c.ativo=TRUE AND c.modulo=$2
        AND NOT (c.modulo='CAMPANHA' AND LOWER(BTRIM(c.nome))='evento')${s.sql}
        AND NOT (c.modulo='CAMPANHA' AND EXISTS (
          SELECT 1 FROM categorias_ministeriais local_categoria
          WHERE local_categoria.denominacao_id=c.denominacao_id
            AND local_categoria.modulo=c.modulo AND local_categoria.ativo=TRUE
            AND LOWER(BTRIM(local_categoria.nome))=LOWER(BTRIM(c.nome))
            AND $3::bigint IS NOT NULL
            AND local_categoria.cidade_ministerial_id=$3::bigint
            AND (local_categoria.congregacao_id IS NULL
              OR local_categoria.congregacao_id IS NOT DISTINCT FROM $4::bigint)
            AND (CASE WHEN local_categoria.congregacao_id IS NOT NULL THEN 2 ELSE 1 END)
              > (CASE WHEN c.congregacao_id IS NOT NULL THEN 2
                      WHEN c.cidade_ministerial_id IS NOT NULL THEN 1 ELSE 0 END)
        ))
      ORDER BY c.nome`,[req.user.denominacao_id,modulo,local?.city??null,local?.church??null,...s.params]);
    res.json(q.rows.map(x=>({...x,pode_editar:canEdit(req.user,x),
      pode_ocultar:!!local?.city&&!canEdit(req.user,x)&&!x.oculta,
      pode_restaurar:!!local?.city&&!canEdit(req.user,x)&&x.oculta_propria})));
  }catch(e){next(e);}
});
router.post('/categorias/:id/ocultar',async(req,res,next)=>{
  try{
    const row=await categoriaAcessivel(req,res,req.params.id);if(!row)return;
    if(!await autorizado(req,res,row.modulo,'editar'))return;
    const local=scope(req.user);
    if(!local?.city||canEdit(req.user,row))
      return res.status(403).json({erro:'Esta categoria deve ser administrada pela área que a cadastrou.'});
    await db.query(`INSERT INTO categorias_ocultas
      (denominacao_id,cidade_ministerial_id,congregacao_id,categoria_id)
      VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [req.user.denominacao_id,local.city,local.church,row.id]);
    res.json({ok:true});
  }catch(e){next(e);}
});
router.delete('/categorias/:id/ocultar',async(req,res,next)=>{
  try{
    const row=await categoriaAcessivel(req,res,req.params.id);if(!row)return;
    if(!await autorizado(req,res,row.modulo,'editar'))return;
    const local=scope(req.user);
    if(!local?.city||canEdit(req.user,row))
      return res.status(403).json({erro:'Esta categoria deve ser administrada pela área que a cadastrou.'});
    await db.query(`DELETE FROM categorias_ocultas
      WHERE denominacao_id=$1 AND cidade_ministerial_id=$2
        AND congregacao_id IS NOT DISTINCT FROM $3::bigint AND categoria_id=$4`,
      [req.user.denominacao_id,local.city,local.church,row.id]);
    res.json({ok:true});
  }catch(e){next(e);}
});
router.post('/categorias',async(req,res,next)=>{
  try{
    const modulo=clean(req.body.modulo).toUpperCase(),nome=clean(req.body.nome),s=scope(req.user);
    if(!await autorizado(req,res,modulo,'editar'))return;
    if(!s)return res.status(403).json({erro:'Seu acesso precisa de uma área definida.'});
    if(!nome||nome.length>120)return res.status(400).json({erro:'Informe um nome de até 120 caracteres.'});
    const q=await db.query(`INSERT INTO categorias_ministeriais
      (denominacao_id,cidade_ministerial_id,congregacao_id,modulo,nome,descricao,estrutura_aulas,criado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.denominacao_id,s.city,s.church,modulo,nome,clean(req.body.descricao)||null,
        modulo==='DISCIPULADO'&&req.body.estrutura_aulas===true,req.user.id]);
    res.status(201).json(q.rows[0]);
  }catch(e){error(e,res,next);}
});
router.put('/categorias/:id',async(req,res,next)=>{
  try{
    const row=await owned(req,res,'categorias_ministeriais',req.params.id);if(!row)return;
    if(!await autorizado(req,res,row.modulo,'editar'))return;
    const nome=clean(req.body.nome);
    if(!nome||nome.length>120)return res.status(400).json({erro:'Informe um nome de até 120 caracteres.'});
    const aulas=row.modulo==='DISCIPULADO'&&req.body.estrutura_aulas===true;
    if(row.estrutura_aulas&&!aulas){
      const linked=await db.query(`SELECT 1 FROM planos_discipulado p
        JOIN tipos_atividades t ON t.id=p.tipo_atividade_id
        WHERE t.categoria_id=$1 AND p.ativo=TRUE LIMIT 1`,[row.id]);
      if(linked.rowCount)return res.status(409).json({erro:'Há planos vinculados a esta categoria de aulas.'});
    }
    const q=await db.query(`UPDATE categorias_ministeriais SET nome=$1,descricao=$2,estrutura_aulas=$3
      WHERE id=$4 AND denominacao_id=$5 RETURNING *`,
      [nome,clean(req.body.descricao)||null,aulas,row.id,req.user.denominacao_id]);
    res.json(q.rows[0]);
  }catch(e){error(e,res,next);}
});
router.delete('/categorias/:id',async(req,res,next)=>{
  try{
    const row=await owned(req,res,'categorias_ministeriais',req.params.id);if(!row)return;
    if(!await autorizado(req,res,row.modulo,'editar'))return;
    const linked=await db.query('SELECT 1 FROM tipos_atividades WHERE categoria_id=$1 AND ativo=TRUE LIMIT 1',[row.id]);
    if(linked.rowCount)return res.status(409).json({erro:'Exclua primeiro os tipos desta categoria.'});
    await db.query('UPDATE categorias_ministeriais SET ativo=FALSE WHERE id=$1 AND denominacao_id=$2',
      [row.id,req.user.denominacao_id]);
    res.json({ok:true});
  }catch(e){next(e);}
});
router.get('/tipos',async(req,res,next)=>{
  try{
    const modulo=clean(req.query.modulo).toUpperCase();
    if(!await autorizado(req,res,modulo,'ler'))return;
    const local=scope(req.user),s=visible(req.user,'t',5);
    const q=await db.query(`SELECT t.*,c.nome AS categoria_nome,c.modulo,c.estrutura_aulas
      FROM tipos_atividades t JOIN categorias_ministeriais c
        ON c.id=t.categoria_id AND c.ativo=TRUE AND c.denominacao_id=t.denominacao_id
      WHERE t.denominacao_id=$1 AND c.modulo=$2 AND t.ativo=TRUE
        AND NOT (c.modulo='CAMPANHA' AND LOWER(BTRIM(c.nome))='evento')${s.sql}
        AND NOT EXISTS(SELECT 1 FROM categorias_ocultas o
          WHERE o.categoria_id=c.id AND o.denominacao_id=c.denominacao_id
            AND o.cidade_ministerial_id IS NOT DISTINCT FROM $3::bigint
            AND (o.congregacao_id IS NULL OR o.congregacao_id IS NOT DISTINCT FROM $4::bigint))
      ORDER BY c.nome,t.nome`,
      [req.user.denominacao_id,modulo,local?.city??null,local?.church??null,...s.params]);
    res.json(q.rows.map(x=>({...x,pode_editar:canEdit(req.user,x)})));
  }catch(e){next(e);}
});
router.post('/tipos',async(req,res,next)=>{
  try{
    const categoria=await categoriaAcessivel(req,res,req.body.categoria_id);if(!categoria)return;
    if(!await autorizado(req,res,categoria.modulo,'editar'))return;
    if(await categoriaOculta(req,categoria.id))return res.status(400).json({erro:'Restaure a categoria nesta área antes de usá-la.'});
    const s=scope(req.user),nome=clean(req.body.nome);
    if(!s)return res.status(403).json({erro:'Seu acesso precisa de uma área definida.'});
    if(!categoriaCompativel(categoria,s))return res.status(400).json({erro:'A categoria pertence a outra área.'});
    if(!nome||nome.length>120)return res.status(400).json({erro:'Informe um nome de até 120 caracteres.'});
    const q=await db.query(`INSERT INTO tipos_atividades
      (denominacao_id,cidade_ministerial_id,congregacao_id,categoria_id,nome,descricao,criado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.denominacao_id,s.city,s.church,categoria.id,nome,clean(req.body.descricao)||null,req.user.id]);
    res.status(201).json(q.rows[0]);
  }catch(e){error(e,res,next);}
});
router.put('/tipos/:id',async(req,res,next)=>{
  try{
    const row=await owned(req,res,'tipos_atividades',req.params.id);if(!row)return;
    const oldCategory=await categoriaAcessivel(req,res,row.categoria_id);if(!oldCategory)return;
    if(!await autorizado(req,res,oldCategory.modulo,'editar'))return;
    const categoria=await categoriaAcessivel(req,res,req.body.categoria_id);if(!categoria)return;
    if(await categoriaOculta(req,categoria.id))return res.status(400).json({erro:'Restaure a categoria nesta área antes de usá-la.'});
    if(categoria.modulo!==oldCategory.modulo)
      return res.status(400).json({erro:'Escolha uma categoria do mesmo módulo.'});
    if(oldCategory.estrutura_aulas&&!categoria.estrutura_aulas){
      const used=await db.query('SELECT 1 FROM planos_discipulado WHERE tipo_atividade_id=$1 AND ativo=TRUE LIMIT 1',[row.id]);
      if(used.rowCount)return res.status(409).json({erro:'Este tipo está vinculado a um plano de aulas.'});
    }
    if(!categoriaCompativel(categoria,{city:row.cidade_ministerial_id,church:row.congregacao_id}))
      return res.status(400).json({erro:'A categoria pertence a outra área.'});
    const nome=clean(req.body.nome);
    if(!nome||nome.length>120)return res.status(400).json({erro:'Informe um nome de até 120 caracteres.'});
    const q=await db.query(`UPDATE tipos_atividades SET categoria_id=$1,categoria=NULL,nome=$2,descricao=$3
      WHERE id=$4 AND denominacao_id=$5 RETURNING *`,
      [categoria.id,nome,clean(req.body.descricao)||null,row.id,req.user.denominacao_id]);
    res.json(q.rows[0]);
  }catch(e){error(e,res,next);}
});
router.delete('/tipos/:id',async(req,res,next)=>{
  try{
    const row=await owned(req,res,'tipos_atividades',req.params.id);if(!row)return;
    const categoria=await categoriaAcessivel(req,res,row.categoria_id);if(!categoria)return;
    if(!await autorizado(req,res,categoria.modulo,'editar'))return;
    const used=await db.query('SELECT 1 FROM planos_discipulado WHERE tipo_atividade_id=$1 AND ativo=TRUE LIMIT 1',[row.id]);
    if(used.rowCount)return res.status(409).json({erro:'Este tipo está vinculado a um plano de aulas.'});
    await db.query('UPDATE tipos_atividades SET ativo=FALSE WHERE id=$1 AND denominacao_id=$2',
      [row.id,req.user.denominacao_id]);
    res.json({ok:true});
  }catch(e){next(e);}
});
async function tipoAulaAcessivel(req,res,value,target){
  if(!id(value)){res.status(400).json({erro:'Escolha um tipo de aula.'});return null;}
  const s=visible(req.user,'t',3);
  const q=await db.query(`SELECT t.*,c.estrutura_aulas FROM tipos_atividades t
    JOIN categorias_ministeriais c ON c.id=t.categoria_id
    WHERE t.id=$1 AND t.denominacao_id=$2 AND t.ativo=TRUE AND c.ativo=TRUE
      AND c.modulo='DISCIPULADO' AND c.estrutura_aulas=TRUE${s.sql}`,
    [id(value),req.user.denominacao_id,...s.params]);
  if(!q.rowCount){res.status(400).json({erro:'Selecione um tipo vinculado a uma categoria de aulas.'});return null;}
  if(!categoriaCompativel(q.rows[0],target)){
    res.status(400).json({erro:'Este tipo de aula pertence a outra área.'});return null;
  }
  return q.rows[0];
}
router.get('/planos',requirePermission('discipulado.estrutura.visualizar'),async(req,res,next)=>{
  try{
    const s=visible(req.user,'p');
    const q=await db.query(`SELECT p.*,t.nome AS tipo_nome,c.nome AS categoria_nome,COUNT(a.id)::int AS total_aulas
      FROM planos_discipulado p LEFT JOIN aulas_discipulado a ON a.plano_id=p.id AND a.ativo=TRUE
      LEFT JOIN tipos_atividades t ON t.id=p.tipo_atividade_id
      LEFT JOIN categorias_ministeriais c ON c.id=t.categoria_id
      WHERE p.denominacao_id=$1 AND p.ativo=TRUE${s.sql}
      GROUP BY p.id,t.nome,c.nome ORDER BY p.nome`,[req.user.denominacao_id,...s.params]);
    res.json(q.rows.map(x=>({...x,pode_editar:canEdit(req.user,x)})));
  }catch(e){next(e);}
});
router.post('/planos',requirePermission('discipulado.estrutura.gerenciar'),async(req,res,next)=>{
  try{
    const s=scope(req.user),nome=clean(req.body.nome);
    if(!s)return res.status(403).json({erro:'Seu acesso precisa de uma área definida.'});
    if(!nome||nome.length>160)return res.status(400).json({erro:'Informe um nome de até 160 caracteres.'});
    const tipo=await tipoAulaAcessivel(req,res,req.body.tipo_atividade_id,s);if(!tipo)return;
    const q=await db.query(`INSERT INTO planos_discipulado
      (denominacao_id,cidade_ministerial_id,congregacao_id,nome,descricao,tipo_atividade_id,criado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.denominacao_id,s.city,s.church,nome,clean(req.body.descricao)||null,tipo.id,req.user.id]);
    res.status(201).json(q.rows[0]);
  }catch(e){error(e,res,next);}
});
router.put('/planos/:id',requirePermission('discipulado.estrutura.gerenciar'),async(req,res,next)=>{
  try{
    const row=await owned(req,res,'planos_discipulado',req.params.id);if(!row)return;
    const nome=clean(req.body.nome);
    if(!nome||nome.length>160)return res.status(400).json({erro:'Informe um nome de até 160 caracteres.'});
    const typeId=req.body.tipo_atividade_id||row.tipo_atividade_id;
    if(typeId){
      const tipo=await tipoAulaAcessivel(req,res,typeId,
        {city:row.cidade_ministerial_id,church:row.congregacao_id});
      if(!tipo)return;
    }
    const q=await db.query(`UPDATE planos_discipulado SET nome=$1,descricao=$2,tipo_atividade_id=$3
      WHERE id=$4 AND denominacao_id=$5 RETURNING *`,
      [nome,clean(req.body.descricao)||null,typeId||null,row.id,req.user.denominacao_id]);
    res.json(q.rows[0]);
  }catch(e){error(e,res,next);}
});
router.delete('/planos/:id',requirePermission('discipulado.estrutura.gerenciar'),async(req,res,next)=>{
  try{
    const row=await owned(req,res,'planos_discipulado',req.params.id);if(!row)return;
    await db.query('UPDATE planos_discipulado SET ativo=FALSE WHERE id=$1 AND denominacao_id=$2',
      [row.id,req.user.denominacao_id]);
    res.json({ok:true});
  }catch(e){next(e);}
});
router.get('/planos/:id/aulas',requirePermission('discipulado.estrutura.visualizar'),async(req,res,next)=>{
  try{
    if(!await readablePlan(req,res,req.params.id))return;
    const q=await db.query('SELECT * FROM aulas_discipulado WHERE plano_id=$1 AND ativo=TRUE ORDER BY ordem,id',
      [id(req.params.id)]);
    res.json(q.rows);
  }catch(e){next(e);}
});
function lessonBody(body){
  const titulo=clean(body.titulo),ordem=Number(body.ordem);
  const duracao=clean(body.duracao_minutos)?Number(body.duracao_minutos):null;
  if(!titulo||titulo.length>180||!Number.isSafeInteger(ordem)||ordem<1||
     (duracao!==null&&(!Number.isSafeInteger(duracao)||duracao<1)))return null;
  const data=clean(body.data_prevista),hora=clean(body.hora_prevista);
  if((data&&!/^\d{4}-\d{2}-\d{2}$/.test(data))||(hora&&!/^\d{2}:\d{2}$/.test(hora)))
    return null;
  if(data){
    const d=new Date(data+'T00:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==data)return null;
  }
  if(hora&&(Number(hora.slice(0,2))>23||Number(hora.slice(3,5))>59))return null;
  return {titulo,ordem,duracao,data:data||null,hora:hora||null,
    objetivo:clean(body.objetivo)||null,conteudo:clean(body.conteudo)||null,
    metodologia:clean(body.metodologia)||null,materiais:clean(body.materiais)||null,
    atividade:clean(body.atividade)||null};
}
router.post('/planos/:id/aulas',requirePermission('discipulado.estrutura.gerenciar'),async(req,res,next)=>{
  try{
    const plan=await owned(req,res,'planos_discipulado',req.params.id);if(!plan)return;
    const a=lessonBody(req.body);
    if(!a)return res.status(400).json({erro:'Informe número e título da aula; duração deve ser positiva.'});
    const q=await db.query(`INSERT INTO aulas_discipulado
      (plano_id,ordem,titulo,objetivo,conteudo,duracao_minutos,data_prevista,hora_prevista,metodologia,materiais,atividade)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [plan.id,a.ordem,a.titulo,a.objetivo,a.conteudo,a.duracao,a.data,a.hora,a.metodologia,a.materiais,a.atividade]);
    res.status(201).json(q.rows[0]);
  }catch(e){next(e);}
});
router.put('/aulas/:id',requirePermission('discipulado.estrutura.gerenciar'),async(req,res,next)=>{
  try{
    if(!id(req.params.id))return res.status(400).json({erro:'Aula inválida.'});
    const q=await db.query(`SELECT a.id,a.plano_id FROM aulas_discipulado a
      JOIN planos_discipulado p ON p.id=a.plano_id
      WHERE a.id=$1 AND a.ativo=TRUE AND p.denominacao_id=$2 AND p.ativo=TRUE`,
      [id(req.params.id),req.user.denominacao_id]);
    if(!q.rowCount)return res.status(404).json({erro:'Aula não encontrada.'});
    if(!await owned(req,res,'planos_discipulado',q.rows[0].plano_id))return;
    const a=lessonBody(req.body);
    if(!a)return res.status(400).json({erro:'Informe número e título da aula; duração deve ser positiva.'});
    const result=await db.query(`UPDATE aulas_discipulado SET ordem=$1,titulo=$2,objetivo=$3,
      conteudo=$4,duracao_minutos=$5,data_prevista=$6,hora_prevista=$7,metodologia=$8,materiais=$9,atividade=$10
      WHERE id=$11 AND plano_id=$12 RETURNING *`,
      [a.ordem,a.titulo,a.objetivo,a.conteudo,a.duracao,a.data,a.hora,a.metodologia,a.materiais,a.atividade,q.rows[0].id,q.rows[0].plano_id]);
    res.json(result.rows[0]);
  }catch(e){next(e);}
});
router.delete('/aulas/:id',requirePermission('discipulado.estrutura.gerenciar'),async(req,res,next)=>{
  try{
    if(!id(req.params.id))return res.status(400).json({erro:'Aula inválida.'});
    const q=await db.query(`SELECT a.id,a.plano_id FROM aulas_discipulado a
      JOIN planos_discipulado p ON p.id=a.plano_id
      WHERE a.id=$1 AND a.ativo=TRUE AND p.denominacao_id=$2 AND p.ativo=TRUE`,
      [id(req.params.id),req.user.denominacao_id]);
    if(!q.rowCount)return res.status(404).json({erro:'Aula não encontrada.'});
    if(!await owned(req,res,'planos_discipulado',q.rows[0].plano_id))return;
    await db.query('UPDATE aulas_discipulado SET ativo=FALSE WHERE id=$1 AND plano_id=$2',
      [q.rows[0].id,q.rows[0].plano_id]);
    res.json({ok:true});
  }catch(e){next(e);}
});
module.exports=router;
