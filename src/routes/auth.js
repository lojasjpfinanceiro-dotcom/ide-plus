const express=require('express'); const bcrypt=require('bcryptjs'); const jwt=require('jsonwebtoken'); const db=require('../db');
const router=express.Router(); const auth=require('../middleware/auth');
router.post('/cadastro',async(req,res)=>{ const c=await db.connect(); try{ const {denominacao,nome,email,telefone,cidade,estado,senha}=req.body; if(!denominacao||!nome||!email||!senha||String(senha).length<8) return res.status(400).json({erro:'Preencha os campos e use uma senha de pelo menos 8 caracteres.'}); await c.query('BEGIN'); const d=await c.query('INSERT INTO denominacoes(nome,telefone,cidade,estado) VALUES($1,$2,$3,$4) RETURNING id,nome',[denominacao,telefone||null,cidade||null,estado||null]); const hash=await bcrypt.hash(senha,12); const u=await c.query("INSERT INTO usuarios(denominacao_id,nome,email,telefone,senha_hash,perfil,cargo,escopo) VALUES($1,$2,LOWER($3),$4,$5,'PASTOR_PRESIDENTE','PASTOR_PRESIDENTE','DENOMINACAO') RETURNING id,nome,email,perfil,cargo,escopo",[d.rows[0].id,nome,email,telefone||null,hash]); await c.query('COMMIT'); res.status(201).json({ok:true,denominacao:d.rows[0],usuario:u.rows[0]}); }catch(e){ await c.query('ROLLBACK'); if(e.code==='23505') return res.status(409).json({erro:'Este e-mail já está cadastrado.'}); console.error(e); res.status(500).json({erro:'Não foi possível criar a conta.'}); }finally{c.release();}});
router.post('/login',async(req,res)=>{ try{ const {email,senha}=req.body; const q=await db.query("SELECT u.*,d.nome denominacao FROM usuarios u JOIN denominacoes d ON d.id=u.denominacao_id WHERE LOWER(u.email)=LOWER($1) AND u.ativo=TRUE AND d.ativo=TRUE",[email||'']); const u=q.rows[0]; if(!u||!(await bcrypt.compare(senha||'',u.senha_hash))) return res.status(401).json({erro:'E-mail ou senha inválidos.'}); const token=jwt.sign({id:u.id,denominacao_id:u.denominacao_id,cidade_ministerial_id:u.cidade_ministerial_id,congregacao_id:u.congregacao_id,nome:u.nome,perfil:u.perfil,cargo:u.cargo,escopo:u.escopo},process.env.JWT_SECRET,{expiresIn:'12h'}); res.json({token,usuario:{id:u.id,nome:u.nome,email:u.email,perfil:u.perfil,cargo:u.cargo,escopo:u.escopo,denominacao:u.denominacao,cidade_ministerial_id:u.cidade_ministerial_id,congregacao_id:u.congregacao_id}}); }catch(e){console.error(e);res.status(500).json({erro:'Erro ao entrar.'});}});
router.post('/alterar-senha',auth,async(req,res,next)=>{
  try{
    const {senhaAtual,novaSenha}=req.body;
    if(!senhaAtual||!novaSenha||String(novaSenha).length<8)
      return res.status(400).json({erro:'Informe a senha atual e uma nova senha com pelo menos 8 caracteres.'});
    const q=await db.query('SELECT senha_hash FROM usuarios WHERE id=$1 AND ativo=TRUE',[req.user.id]);
    if(!q.rowCount||!await bcrypt.compare(String(senhaAtual),q.rows[0].senha_hash))
      return res.status(400).json({erro:'Senha atual incorreta.'});
    const hash=await bcrypt.hash(String(novaSenha),12);
    await db.query('UPDATE usuarios SET senha_hash=$1 WHERE id=$2',[hash,req.user.id]);
    res.json({ok:true});
  }catch(e){next(e);}
});
module.exports=router;
