const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const {requirePermission}=require('../middleware/permissions');
const {filter}=require('../middleware/scope');
const router = express.Router();
router.use(auth);

router.get('/', requirePermission('cidades.visualizar'), async (req,res) => {
  try {
    const s=filter(req.user,'cm.id',null,2);
    const q=await db.query(`SELECT cm.*,
      COUNT(DISTINCT c.id)::int AS congregacoes,
      COUNT(DISTINCT p.id)::int AS pessoas
      FROM cidades_ministeriais cm
      LEFT JOIN congregacoes c ON c.cidade_ministerial_id=cm.id AND c.ativo=TRUE
      LEFT JOIN pessoas p ON p.congregacao_id=c.id AND p.ativo=TRUE
      WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE${s.sql}
      GROUP BY cm.id ORDER BY cm.nome`,[req.user.denominacao_id,...s.values]);
    res.json(q.rows);
  } catch(e){ console.error(e); res.status(500).json({erro:'Erro ao listar cidades.'}); }
});

router.put('/:id', requirePermission('cidades.editar'), async (req,res) => {
  try {
    const {nome,estado,pais}=req.body;
    if(!nome) return res.status(400).json({erro:'Informe o nome da cidade.'});
    const s=filter(req.user,'id',null,5);
    const q=await db.query('UPDATE cidades_ministeriais SET nome=$1,estado=$2,pais=$5 WHERE id=$3 AND denominacao_id=$4 AND ativo=TRUE'+s.sql+' RETURNING *',[nome.trim(),estado?estado.trim():null,req.params.id,req.user.denominacao_id,String(pais||'Brasil').trim(),...s.values]);
    if(!q.rowCount) return res.status(404).json({erro:'Cidade não encontrada.'});
    await db.query('UPDATE congregacoes SET cidade=$1,estado=$2 WHERE cidade_ministerial_id=$3 AND denominacao_id=$4',[q.rows[0].nome,q.rows[0].estado,req.params.id,req.user.denominacao_id]);
    res.json(q.rows[0]);
  } catch(e){if(e.code==='23505')return res.status(409).json({erro:'Esta cidade já está cadastrada.'});console.error(e);res.status(500).json({erro:'Erro ao alterar cidade.'});}
});

router.delete('/:id', requirePermission('cidades.excluir'), async (req,res) => {
  try {
    const uso=await db.query('SELECT COUNT(*)::int total FROM congregacoes WHERE cidade_ministerial_id=$1 AND denominacao_id=$2 AND ativo=TRUE',[req.params.id,req.user.denominacao_id]);
    if(uso.rows[0].total>0) return res.status(409).json({erro:'Esta cidade possui sede/congregações ativas. Exclua ou transfira essas igrejas primeiro.'});
    const s=filter(req.user,'id',null,3);
    const q=await db.query('UPDATE cidades_ministeriais SET ativo=FALSE WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE'+s.sql+' RETURNING id',[req.params.id,req.user.denominacao_id,...s.values]);
    if(!q.rowCount) return res.status(404).json({erro:'Cidade não encontrada.'});
    res.json({ok:true});
  } catch(e){console.error(e);res.status(500).json({erro:'Erro ao excluir cidade.'});}
});

router.post('/', requirePermission('cidades.inserir'), async (req,res) => {
  try {
    const {nome,estado,pais}=req.body;
    if(req.user.escopo!=='DENOMINACAO')return res.status(403).json({erro:'Somente a administração geral pode criar cidades.'});
    if(!nome) return res.status(400).json({erro:'Informe o nome da cidade.'});
    const q=await db.query('INSERT INTO cidades_ministeriais(denominacao_id,nome,estado,pais) VALUES($1,$2,$3,$4) RETURNING *',
      [req.user.denominacao_id,nome.trim(),estado?estado.trim():null,String(pais||'Brasil').trim()]);
    res.status(201).json(q.rows[0]);
  } catch(e){
    if(e.code==='23505') return res.status(409).json({erro:'Esta cidade já está cadastrada.'});
    console.error(e); res.status(500).json({erro:'Erro ao cadastrar cidade.'});
  }
});
module.exports=router;
