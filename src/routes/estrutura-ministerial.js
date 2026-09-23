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
async function categoriaAcessivel(req,res,value){
  if(!id(value)){res.status(400).json({erro:'Categoria inválida.'});return null;}
  const s=visible(req.user,'c',3);
  const q=await db.query(`SELECT c.* FROM categorias_ministeriais c
    WHERE c.id=$1 AND c.denominacao_id=$2 AND c.ativo=TRUE${s.sql}`,
    [id(value),req.user.denominacao_id,...s.params]);
  if(!q.rowCount){res.status(404).json({erro:'Categoria não encontrada nesta área.'});return null;}
  return q.rows[0];
}
router.get('/categorias',async(req,res,next)=>{
  try{
    const modulo=clean(req.query.modulo).toUpperCase();
    if(!await autorizado(req,res,modulo,'ler'))return;
    const s=visible(req.user,'c',3);
    const q=await db.query(`SELECT c.* FROM categorias_ministeriais c
      WHERE c.denominacao_id=$1 AND c.ativo=TRUE AND c.modulo=$2${s.sql}
      ORDER BY c.nome`,[req.user.denominacao_id,modulo,...s.params]);
    res.json(q.rows.map(x=>({...x,pode_editar:canEdit(req.user,x)})));
  }catch(e){next(e);}
});
router.post('/categorias',async(req,res,next)=>{
  try{
    const modulo=clean(req.body.modulo).toUpperCase(),nome=clean(req.body.nome),s=scope(req.user);
    if(!await autorizado(req,res,modulo,'editar'))return;
    if(!s)return res.status(403).json({erro:'Seu acesso precisa de uma área definida.'});
    if(!nome||nome.length>120)return res.status(400).json({erro:'Informe um nome de até 120 caracteres.'});
    const q=await db.query(`INSERT INTO categorias_ministeriais
      (denominacao_id,cidade_ministerial_id,congregacao_id,modulo,nome,descricao,criado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.denominacao_id,s.city,s.church,modulo,nome,clean(req.body.descricao)||null,req.user.id]);
    res.status(201).json(q.rows[0]);
  }catch(e){error(e,res,next);}
});
router.put('/categorias/:id',async(req,res,next)=>{
  try{
    const row=await owned(req,res,'categorias_ministeriais',req.params.id);if(!row)return;
    if(!await autorizado(req,res,row.modulo,'editar'))return;
    const nome=clean(req.body.nome);
    if(!nome||nome.length>120)return res.status(400).json({erro:'Informe um nome de até 120 caracteres.'});
    const q=await db.query(`UPDATE categorias_ministeriais SET nome=$1,descricao=$2
      WHERE id=$3 AND denominacao_id=$4 RETURNING *`,
      [nome,clean(req.body.descricao)||null,row.id,req.user.denominacao_id]);
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
    const s=visible(req.user,'t',3);
    const q=await db.query(`SELECT t.*,c.nome AS categoria_nome,c.modulo
      FROM tipos_atividades t JOIN categorias_ministeriais c
        ON c.id=t.categoria_id AND c.ativo=TRUE AND c.denominacao_id=t.denominacao_id
      WHERE t.denominacao_id=$1 AND c.modulo=$2 AND t.ativo=TRUE${s.sql}
      ORDER BY c.nome,t.nome`,[req.user.denominacao_id,modulo,...s.params]);
    res.json(q.rows.map(x=>({...x,pode_editar:canEdit(req.user,x)})));
  }catch(e){next(e);}
});
router.post('/tipos',async(req,res,next)=>{
  try{
    const categoria=await categoriaAcessivel(req,res,req.body.categoria_id);if(!categoria)return;
    if(!await autorizado(req,res,categoria.modulo,'editar'))return;
    const s=scope(req.user),nome=clean(req.body.nome);
    if(!s)return res.status(403).json({erro:'Seu acesso precisa de uma área definida.'});
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
    if(categoria.modulo!==oldCategory.modulo)
      return res.status(400).json({erro:'Escolha uma categoria do mesmo módulo.'});
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
    await db.query('UPDATE tipos_atividades SET ativo=FALSE WHERE id=$1 AND denominacao_id=$2',
      [row.id,req.user.denominacao_id]);
    res.json({ok:true});
  }catch(e){next(e);}
});
router.get('/planos',requirePermission('discipulado.estrutura.visualizar'),async(req,res,next)=>{
  try{
    const s=visible(req.user,'p');
    const q=await db.query(`SELECT p.*,COUNT(a.id)::int AS total_aulas
      FROM planos_discipulado p LEFT JOIN aulas_discipulado a ON a.plano_id=p.id AND a.ativo=TRUE
      WHERE p.denominacao_id=$1 AND p.ativo=TRUE${s.sql}
      GROUP BY p.id ORDER BY p.nome`,[req.user.denominacao_id,...s.params]);
    res.json(q.rows.map(x=>({...x,pode_editar:canEdit(req.user,x)})));
  }catch(e){next(e);}
});
router.post('/planos',requirePermission('discipulado.estrutura.gerenciar'),async(req,res,next)=>{
  try{
    const s=scope(req.user),nome=clean(req.body.nome);
    if(!s)return res.status(403).json({erro:'Seu acesso precisa de uma área definida.'});
    if(!nome||nome.length>160)return res.status(400).json({erro:'Informe um nome de até 160 caracteres.'});
    const q=await db.query(`INSERT INTO planos_discipulado
      (denominacao_id,cidade_ministerial_id,congregacao_id,nome,descricao,criado_por)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.denominacao_id,s.city,s.church,nome,clean(req.body.descricao)||null,req.user.id]);
    res.status(201).json(q.rows[0]);
  }catch(e){error(e,res,next);}
});
router.put('/planos/:id',requirePermission('discipulado.estrutura.gerenciar'),async(req,res,next)=>{
  try{
    const row=await owned(req,res,'planos_discipulado',req.params.id);if(!row)return;
    const nome=clean(req.body.nome);
    if(!nome||nome.length>160)return res.status(400).json({erro:'Informe um nome de até 160 caracteres.'});
    const q=await db.query('UPDATE planos_discipulado SET nome=$1,descricao=$2 WHERE id=$3 AND denominacao_id=$4 RETURNING *',
      [nome,clean(req.body.descricao)||null,row.id,req.user.denominacao_id]);
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
  return {titulo,ordem,duracao,objetivo:clean(body.objetivo)||null,conteudo:clean(body.conteudo)||null};
}
router.post('/planos/:id/aulas',requirePermission('discipulado.estrutura.gerenciar'),async(req,res,next)=>{
  try{
    const plan=await owned(req,res,'planos_discipulado',req.params.id);if(!plan)return;
    const a=lessonBody(req.body);
    if(!a)return res.status(400).json({erro:'Informe número e título da aula; duração deve ser positiva.'});
    const q=await db.query(`INSERT INTO aulas_discipulado
      (plano_id,ordem,titulo,objetivo,conteudo,duracao_minutos)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [plan.id,a.ordem,a.titulo,a.objetivo,a.conteudo,a.duracao]);
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
      conteudo=$4,duracao_minutos=$5 WHERE id=$6 AND plano_id=$7 RETURNING *`,
      [a.ordem,a.titulo,a.objetivo,a.conteudo,a.duracao,q.rows[0].id,q.rows[0].plano_id]);
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
