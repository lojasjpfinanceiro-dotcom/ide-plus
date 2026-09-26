const express=require('express');
const db=require('../db');
const auth=require('../middleware/auth');
const router=express.Router();
router.use(auth);
const clean=v=>String(v??'').trim();
function scopeSql(user,start=2){
  if(user.escopo==='DENOMINACAO')return {sql:'',values:[]};
  if(user.escopo==='CIDADE'&&user.cidade_ministerial_id)return {sql:` AND a.cidade_ministerial_id=$${start}`,values:[user.cidade_ministerial_id]};
  if(user.escopo==='CONGREGACAO'&&user.congregacao_id)return {sql:` AND a.congregacao_id=$${start}`,values:[user.congregacao_id]};
  return {sql:' AND FALSE',values:[]};
}
router.get('/',async(req,res)=>{
  try{
    const mes=/^\d{4}-\d{2}$/.test(String(req.query.mes||''))?String(req.query.mes):new Date().toISOString().slice(0,7);
    const s=scopeSql(req.user,3);
    const q=await db.query(`SELECT a.* FROM agenda_eventos a WHERE a.denominacao_id=$1 AND a.ativo=TRUE AND TO_CHAR(a.data_evento,'YYYY-MM')=$2${s.sql} ORDER BY a.data_evento,a.hora_inicio NULLS LAST`,[req.user.denominacao_id,mes,...s.values]);
    res.json(q.rows);
  }catch(e){console.error('Agenda listar:',e);res.status(500).json({erro:'Erro ao carregar agenda.'});}
});
router.post('/',async(req,res)=>{
  try{
    const {modulo,titulo,data_evento,hora_inicio,hora_fim,local,responsavel,observacoes,congregacao_id}=req.body;
    if(!titulo||!data_evento)return res.status(400).json({erro:'Informe título e data.'});
    const m=['CAMPANHA','DISCIPULADO','OUTRO'].includes(modulo)?modulo:'OUTRO';
    const cidade=req.user.cidade_ministerial_id||null;
    const cong=req.user.escopo==='CONGREGACAO'?req.user.congregacao_id:(congregacao_id||null);
    const q=await db.query(`INSERT INTO agenda_eventos(denominacao_id,cidade_ministerial_id,congregacao_id,modulo,titulo,data_evento,hora_inicio,hora_fim,local,responsavel,observacoes,criado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[req.user.denominacao_id,cidade,cong,m,clean(titulo),data_evento,hora_inicio||null,hora_fim||null,clean(local)||null,clean(responsavel)||null,clean(observacoes)||null,req.user.id]);
    res.status(201).json(q.rows[0]);
  }catch(e){console.error('Agenda gravar:',e);res.status(500).json({erro:'Erro ao gravar evento.'});}
});
module.exports=router;
