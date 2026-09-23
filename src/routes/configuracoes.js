const express=require('express');
const db=require('../db');
const auth=require('../middleware/auth');
const {requirePermission}=require('../middleware/permissions');
const router=express.Router();
router.use(auth);
function city(req) {
  if(req.user.escopo==='CIDADE')return req.user.cidade_ministerial_id;
  if(req.user.escopo==='CONGREGACAO')return null;
  return req.body?.cidade_ministerial_id || req.query?.cidade_ministerial_id || null;
}
async function validCity(req,id) {
  if(!id)return false;
  const q=await db.query('SELECT id FROM cidades_ministeriais WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE',
    [id,req.user.denominacao_id]);
  return q.rowCount>0;
}
router.get('/tipos-congregacao',requirePermission('configuracoes.visualizar'),async(req,res,next)=>{
  try{
    const id=city(req);
    if(!await validCity(req,id))return res.status(400).json({erro:'Selecione uma cidade válida.'});
    const q=await db.query('SELECT * FROM tipos_congregacao WHERE denominacao_id=$1 AND ativo=TRUE AND cidade_ministerial_id=$2 ORDER BY nome',
      [req.user.denominacao_id,id]);
    res.json(q.rows);
  }catch(e){next(e);}
});
router.post('/tipos-congregacao',requirePermission('configuracoes.tipos_congregacao'),async(req,res,next)=>{
  try{
    const nome=String(req.body.nome||'').trim(),id=city(req);
    if(!nome||!await validCity(req,id))return res.status(400).json({erro:'Informe o tipo e uma cidade válida.'});
    const q=await db.query('INSERT INTO tipos_congregacao(denominacao_id,cidade_ministerial_id,nome,codigo) VALUES($1,$2,$3,$4) RETURNING *',
      [req.user.denominacao_id,id,nome,'TIPO_'+Date.now()]);
    res.status(201).json(q.rows[0]);
  }catch(e){if(e.code==='23505')return res.status(409).json({erro:'Este tipo já existe.'});next(e);}
});
router.put('/tipos-congregacao/:id',requirePermission('configuracoes.tipos_congregacao'),async(req,res,next)=>{
  try{
    const id=city(req),nome=String(req.body.nome||'').trim();
    if(!nome||!await validCity(req,id))return res.status(400).json({erro:'Informe o tipo e a cidade.'});
    const q=await db.query('UPDATE tipos_congregacao SET nome=$1 WHERE id=$2 AND denominacao_id=$3 AND cidade_ministerial_id=$4 AND ativo=TRUE RETURNING *',
      [nome,req.params.id,req.user.denominacao_id,id]);
    if(!q.rowCount)return res.status(404).json({erro:'Tipo não encontrado.'});
    res.json(q.rows[0]);
  }catch(e){next(e);}
});
router.delete('/tipos-congregacao/:id',requirePermission('configuracoes.tipos_congregacao'),async(req,res,next)=>{
  try{
    const id=city(req);
    if(!await validCity(req,id))return res.status(400).json({erro:'Selecione uma cidade válida.'});
    const q=await db.query('UPDATE tipos_congregacao SET ativo=FALSE WHERE id=$1 AND denominacao_id=$2 AND cidade_ministerial_id=$3 AND ativo=TRUE RETURNING id',
      [req.params.id,req.user.denominacao_id,id]);
    if(!q.rowCount)return res.status(404).json({erro:'Tipo não encontrado.'});
    res.json({ok:true});
  }catch(e){next(e);}
});
module.exports=router;
