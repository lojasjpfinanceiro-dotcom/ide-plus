const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();
router.use(auth);

router.get('/', async (req,res) => {
  try {
    const q=await db.query(`SELECT cm.*,
      COUNT(DISTINCT c.id)::int AS congregacoes,
      COUNT(DISTINCT p.id)::int AS pessoas
      FROM cidades_ministeriais cm
      LEFT JOIN congregacoes c ON c.cidade_ministerial_id=cm.id AND c.ativo=TRUE
      LEFT JOIN pessoas p ON p.congregacao_id=c.id AND p.ativo=TRUE
      WHERE cm.denominacao_id=$1 AND cm.ativo=TRUE
      GROUP BY cm.id ORDER BY cm.nome`,[req.user.denominacao_id]);
    res.json(q.rows);
  } catch(e){ console.error(e); res.status(500).json({erro:'Erro ao listar cidades.'}); }
});

router.post('/', async (req,res) => {
  try {
    const {nome,estado}=req.body;
    if(!nome) return res.status(400).json({erro:'Informe o nome da cidade.'});
    const q=await db.query('INSERT INTO cidades_ministeriais(denominacao_id,nome,estado) VALUES($1,$2,$3) RETURNING *',
      [req.user.denominacao_id,nome.trim(),estado?estado.trim().toUpperCase():null]);
    res.status(201).json(q.rows[0]);
  } catch(e){
    if(e.code==='23505') return res.status(409).json({erro:'Esta cidade já está cadastrada.'});
    console.error(e); res.status(500).json({erro:'Erro ao cadastrar cidade.'});
  }
});
module.exports=router;
