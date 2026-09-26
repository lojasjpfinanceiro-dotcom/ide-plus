const express=require('express');
const db=require('../db');
const auth=require('../middleware/auth');
const {requirePermission}=require('../middleware/permissions');
const {filter}=require('../middleware/scope');
const router=express.Router();
router.use(auth);

router.get('/',requirePermission('pessoas.visualizar'),async(req,res)=>{
  try{
    const s=filter(req.user,'c.cidade_ministerial_id','p.congregacao_id',2);
    const q=await db.query(`
      SELECT p.id pessoa_id,p.nome,p.telefone,c.nome congregacao,
        d.id discipulado_id,COALESCE(d.nivel,'INICIO') nivel,
        COALESCE(d.situacao,'ATIVO') situacao,d.local_estudo,d.proxima_acao,d.proxima_data,
        COUNT(v.id)::int visitas,MAX(v.data_visita) ultima_visita
      FROM pessoas p JOIN congregacoes c ON c.id=p.congregacao_id
      LEFT JOIN discipulados d ON d.pessoa_id=p.id AND d.denominacao_id=p.denominacao_id
      LEFT JOIN discipulado_visitas v ON v.discipulado_id=d.id
      WHERE p.denominacao_id=$1 AND p.ativo=TRUE
        AND (p.status='EM_DISCIPULADO' OR d.id IS NOT NULL)${s.sql}
      GROUP BY p.id,p.nome,p.telefone,c.nome,d.id,d.nivel,d.situacao,d.local_estudo,d.proxima_acao,d.proxima_data
      ORDER BY p.nome`,[req.user.denominacao_id,...s.values]);
    res.json(q.rows);
  }catch(e){console.error('Discipulado listar:',e);res.status(500).json({erro:'Erro ao carregar acompanhamentos.'});}
});

router.get('/:pessoaId',requirePermission('pessoas.visualizar'),async(req,res)=>{
  try{
    const s=filter(req.user,'c.cidade_ministerial_id','p.congregacao_id',3);
    const p=await db.query(`SELECT p.id,p.nome,p.telefone,p.status,c.nome congregacao,d.*
      FROM pessoas p JOIN congregacoes c ON c.id=p.congregacao_id
      LEFT JOIN discipulados d ON d.pessoa_id=p.id AND d.denominacao_id=p.denominacao_id
      WHERE p.id=$1 AND p.denominacao_id=$2 AND p.ativo=TRUE${s.sql}`,[req.params.pessoaId,req.user.denominacao_id,...s.values]);
    if(!p.rowCount)return res.status(404).json({erro:'Discípulo não encontrado.'});
    const d=p.rows[0];
    const v=d.id?await db.query('SELECT * FROM discipulado_visitas WHERE discipulado_id=$1 ORDER BY data_visita DESC,id DESC',[d.id]):{rows:[]};
    res.json({pessoa:d,visitas:v.rows});
  }catch(e){console.error('Discipulado detalhe:',e);res.status(500).json({erro:'Erro ao carregar acompanhamento.'});}
});

router.put('/:pessoaId',requirePermission('pessoas.editar'),async(req,res)=>{
  try{
    const {nivel,local_estudo,situacao,proxima_acao,proxima_data,observacoes}=req.body;
    const s=filter(req.user,'c.cidade_ministerial_id','p.congregacao_id',3);
    const p=await db.query(`SELECT p.id FROM pessoas p JOIN congregacoes c ON c.id=p.congregacao_id
      WHERE p.id=$1 AND p.denominacao_id=$2 AND p.ativo=TRUE${s.sql}`,[req.params.pessoaId,req.user.denominacao_id,...s.values]);
    if(!p.rowCount)return res.status(404).json({erro:'Pessoa não encontrada.'});
    const q=await db.query(`INSERT INTO discipulados(denominacao_id,pessoa_id,nivel,local_estudo,situacao,proxima_acao,proxima_data,observacoes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(denominacao_id,pessoa_id) DO UPDATE SET nivel=EXCLUDED.nivel,local_estudo=EXCLUDED.local_estudo,
      situacao=EXCLUDED.situacao,proxima_acao=EXCLUDED.proxima_acao,proxima_data=EXCLUDED.proxima_data,
      observacoes=EXCLUDED.observacoes,atualizado_em=NOW() RETURNING *`,
      [req.user.denominacao_id,req.params.pessoaId,nivel||'INICIO',local_estudo||null,situacao||'ATIVO',proxima_acao||null,proxima_data||null,observacoes||null]);
    await db.query("UPDATE pessoas SET status=CASE WHEN $1='CONCLUIDO' THEN 'PREPARANDO_BATISMO' ELSE 'EM_DISCIPULADO' END,atualizado_em=NOW() WHERE id=$2",[situacao,req.params.pessoaId]);
    res.json(q.rows[0]);
  }catch(e){console.error('Discipulado salvar:',e);res.status(500).json({erro:'Erro ao salvar acompanhamento.'});}
});

router.post('/:pessoaId/visitas',requirePermission('pessoas.editar'),async(req,res)=>{
  try{
    const {data_visita,tipo,responsavel,resumo,situacao_encontrada}=req.body;
    const d=await db.query('SELECT id FROM discipulados WHERE denominacao_id=$1 AND pessoa_id=$2',[req.user.denominacao_id,req.params.pessoaId]);
    if(!d.rowCount)return res.status(400).json({erro:'Salve primeiro o acompanhamento do discípulo.'});
    const q=await db.query(`INSERT INTO discipulado_visitas(discipulado_id,data_visita,tipo,responsavel,resumo,situacao_encontrada,criado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[d.rows[0].id,data_visita||new Date().toISOString().slice(0,10),tipo||'ACOMPANHAMENTO',responsavel||null,resumo||null,situacao_encontrada||null,req.user.id]);
    res.status(201).json(q.rows[0]);
  }catch(e){console.error('Visita salvar:',e);res.status(500).json({erro:'Erro ao registrar visita.'});}
});
module.exports=router;