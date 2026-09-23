const express=require('express');
const db=require('../db');
const auth=require('../middleware/auth');
const {requirePermission}=require('../middleware/permissions');
const {filter}=require('../middleware/scope');
const router=express.Router();
router.use(auth);

router.get('/',requirePermission('congregacoes.visualizar'),async(req,res,next)=>{
  try {
    const s=filter(req.user,'cidade_ministerial_id','id',2);
    const q=await db.query('SELECT * FROM congregacoes WHERE denominacao_id=$1 AND ativo=TRUE'+s.sql+' ORDER BY nome',
      [req.user.denominacao_id,...s.values]);
    res.json(q.rows);
  } catch(e){ next(e); }
});
async function cidade(req,res) {
  if(req.user.escopo==='CONGREGACAO') {
    const q=await db.query(`SELECT cm.id,cm.nome,cm.estado FROM cidades_ministeriais cm
      JOIN congregacoes c ON c.cidade_ministerial_id=cm.id
      WHERE c.id=$1 AND c.denominacao_id=$2 AND c.ativo=TRUE`,
      [req.user.congregacao_id,req.user.denominacao_id]);
    if(!q.rowCount){res.status(404).json({erro:'Congregação não encontrada.'});return null;}
    return q.rows[0];
  }
  const id=req.user.escopo==='CIDADE'?req.user.cidade_ministerial_id:req.body.cidade_ministerial_id;
  if(!id){ res.status(400).json({erro:'Selecione a cidade.'});return null; }
  const q=await db.query('SELECT id,nome,estado FROM cidades_ministeriais WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE',
    [id,req.user.denominacao_id]);
  if(!q.rowCount){res.status(400).json({erro:'Cidade inválida.'});return null;}
  return q.rows[0];
}
router.post('/',requirePermission('congregacoes.inserir'),async(req,res,next)=>{
  try{
    if(req.user.escopo==='CONGREGACAO')return res.status(403).json({erro:'Sem acesso para criar congregações.'});
    const {nome,endereco,tipo}=req.body;
    if(!String(nome||'').trim())return res.status(400).json({erro:'Informe o nome da congregação.'});
    const cid=await cidade(req,res);if(!cid)return;
    const q=await db.query(`INSERT INTO congregacoes
      (denominacao_id,nome,cidade,estado,endereco,cidade_ministerial_id,sede,tipo)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.denominacao_id,nome.trim(),cid.nome,cid.estado,endereco||null,cid.id,tipo==='SEDE_LOCAL',tipo||'CONGREGACAO']);
    res.status(201).json(q.rows[0]);
  }catch(e){next(e);}
});
router.put('/:id',requirePermission('congregacoes.editar'),async(req,res,next)=>{
  try{
    const {nome,endereco,tipo}=req.body;
    if(!String(nome||'').trim())return res.status(400).json({erro:'Informe o nome da congregação.'});
    const s=filter(req.user,'cidade_ministerial_id','id',3);
    const target=await db.query('SELECT id FROM congregacoes WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE'+s.sql,
      [req.params.id,req.user.denominacao_id,...s.values]);
    if(!target.rowCount)return res.status(404).json({erro:'Congregação não encontrada.'});
    const cid=await cidade(req,res);if(!cid)return;
    const q=await db.query(`UPDATE congregacoes SET nome=$1,endereco=$2,cidade_ministerial_id=$3,
      cidade=$4,estado=$5,tipo=$6,sede=$7
      WHERE id=$8 AND denominacao_id=$9 AND ativo=TRUE RETURNING *`,
      [nome.trim(),endereco||null,cid.id,cid.nome,cid.estado,tipo||'CONGREGACAO',tipo==='SEDE_LOCAL',
        req.params.id,req.user.denominacao_id]);
    res.json(q.rows[0]);
  }catch(e){next(e);}
});
router.delete('/:id',requirePermission('congregacoes.excluir'),async(req,res,next)=>{
  try{
    const s=filter(req.user,'cidade_ministerial_id','id',3);
    const q=await db.query('UPDATE congregacoes SET ativo=FALSE WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE'+s.sql+' RETURNING id',
      [req.params.id,req.user.denominacao_id,...s.values]);
    if(!q.rowCount)return res.status(404).json({erro:'Congregação não encontrada.'});
    res.json({ok:true});
  }catch(e){next(e);}
});
module.exports=router;
