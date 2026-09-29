const express=require('express');
const db=require('../db');
const auth=require('../middleware/auth');
const router=express.Router();
router.use(auth);
const clean=v=>String(v??'').trim();
const isNivel1=u=>String(u.escopo||'').toUpperCase()==='DENOMINACAO';

function agendaScope(user,start=3){
  // Nível 1: agenda administrativa privada da própria equipe/usuário.
  if(isNivel1(user)) return {sql:` AND a.cidade_ministerial_id IS NULL AND a.criado_por=$${start}`,values:[user.id]};
  // Níveis 2, 3 e 4: agenda compartilhada somente dentro da mesma cidade.
  if(user.cidade_ministerial_id) return {sql:` AND a.cidade_ministerial_id=$${start}`,values:[user.cidade_ministerial_id]};
  return {sql:' AND FALSE',values:[]};
}
router.get('/',async(req,res)=>{
  try{
    const mes=/^\d{4}-\d{2}$/.test(String(req.query.mes||''))?String(req.query.mes):new Date().toISOString().slice(0,7);
    const s=agendaScope(req.user,3);
    const q=await db.query(`SELECT a.* FROM agenda_eventos a
      WHERE a.denominacao_id=$1 AND a.ativo=TRUE AND TO_CHAR(a.data_evento,'YYYY-MM')=$2${s.sql}
      ORDER BY a.data_evento,a.hora_inicio NULLS LAST`,
      [req.user.denominacao_id,mes,...s.values]);
    res.json(q.rows);
  }catch(e){console.error('Agenda listar:',e);res.status(500).json({erro:'Erro ao carregar agenda.'});}
});
router.post('/',async(req,res)=>{
  try{
    const {modulo,titulo,data_evento,hora_inicio,hora_fim,local,responsavel,observacoes,congregacao_id}=req.body;
    if(!titulo||!data_evento)return res.status(400).json({erro:'Informe título e data.'});
    const m=['CAMPANHA','DISCIPULADO','OUTRO'].includes(modulo)?modulo:'OUTRO';
    const cidade=isNivel1(req.user)?null:(req.user.cidade_ministerial_id||null);
    if(!isNivel1(req.user)&&!cidade)return res.status(403).json({erro:'Seu acesso não possui cidade definida.'});
    let cong=null;
    if(!isNivel1(req.user)) cong=req.user.congregacao_id||congregacao_id||null;
    if(cong){
      const ok=await db.query('SELECT 1 FROM congregacoes WHERE id=$1 AND denominacao_id=$2 AND cidade_ministerial_id=$3 AND ativo=TRUE',
        [cong,req.user.denominacao_id,cidade]);
      if(!ok.rowCount)return res.status(400).json({erro:'A congregação não pertence à sua cidade.'});
    }
    const q=await db.query(`INSERT INTO agenda_eventos
      (denominacao_id,cidade_ministerial_id,congregacao_id,modulo,titulo,data_evento,hora_inicio,hora_fim,local,responsavel,observacoes,criado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.denominacao_id,cidade,cong,m,clean(titulo),data_evento,hora_inicio||null,hora_fim||null,
       clean(local)||null,clean(responsavel)||null,clean(observacoes)||null,req.user.id]);
    res.status(201).json(q.rows[0]);
  }catch(e){console.error('Agenda gravar:',e);res.status(500).json({erro:'Erro ao gravar evento.'});}
});
module.exports=router;
