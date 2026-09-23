const express=require('express'); const bcrypt=require('bcryptjs'); const jwt=require('jsonwebtoken'); const db=require('../db');
const router=express.Router(); const auth=require('../middleware/auth'); const crypto=require('crypto'); const {enviarCodigoRecuperacao}=require('../email');
router.post('/cadastro',async(req,res)=>{ const c=await db.connect(); try{ const {denominacao,nome,email,telefone,cidade,estado,senha}=req.body; if(!denominacao||!nome||!email||!senha||String(senha).length<8) return res.status(400).json({erro:'Preencha os campos e use uma senha de pelo menos 8 caracteres.'}); await c.query('BEGIN'); const d=await c.query('INSERT INTO denominacoes(nome,telefone,cidade,estado) VALUES($1,$2,$3,$4) RETURNING id,nome',[denominacao,telefone||null,cidade||null,estado||null]); const hash=await bcrypt.hash(senha,12); const u=await c.query("INSERT INTO usuarios(denominacao_id,nome,email,telefone,senha_hash,perfil,cargo,escopo) VALUES($1,$2,LOWER($3),$4,$5,'PASTOR_PRESIDENTE','PASTOR_PRESIDENTE','DENOMINACAO') RETURNING id,nome,email,perfil,cargo,escopo",[d.rows[0].id,nome,email,telefone||null,hash]); await c.query('COMMIT'); res.status(201).json({ok:true,denominacao:d.rows[0],usuario:u.rows[0]}); }catch(e){ await c.query('ROLLBACK'); if(e.code==='23505') return res.status(409).json({erro:'Este e-mail já está cadastrado.'}); console.error(e); res.status(500).json({erro:'Não foi possível criar a conta.'}); }finally{c.release();}});
router.post('/login',async(req,res)=>{ try{ const {email,senha}=req.body; const q=await db.query("SELECT u.*,d.nome denominacao FROM usuarios u JOIN denominacoes d ON d.id=u.denominacao_id WHERE LOWER(u.email)=LOWER($1) AND u.ativo=TRUE AND d.ativo=TRUE",[email||'']); const u=q.rows[0]; if(!u||!(await bcrypt.compare(senha||'',u.senha_hash))) return res.status(401).json({erro:'E-mail ou senha inválidos.'}); const token=jwt.sign({id:u.id,denominacao_id:u.denominacao_id,cidade_ministerial_id:u.cidade_ministerial_id,congregacao_id:u.congregacao_id,nome:u.nome,perfil:u.perfil,cargo:u.cargo,escopo:u.escopo},process.env.JWT_SECRET,{expiresIn:'12h'}); res.json({token,usuario:{id:u.id,nome:u.nome,email:u.email,perfil:u.perfil,cargo:u.cargo,escopo:u.escopo,denominacao:u.denominacao,cidade_ministerial_id:u.cidade_ministerial_id,congregacao_id:u.congregacao_id}}); }catch(e){console.error(e);res.status(500).json({erro:'Erro ao entrar.'});}});
router.post('/esqueci-senha',async(req,res)=>{
  const resposta={ok:true,mensagem:'Se o e-mail estiver cadastrado, enviaremos um código de confirmação.'};
  try{
    const email=String(req.body.email||'').trim().toLowerCase();
    if(!email) return res.status(400).json({erro:'Informe seu e-mail.'});
    const q=await db.query('SELECT id,email FROM usuarios WHERE LOWER(email)=LOWER($1) AND ativo=TRUE LIMIT 1',[email]);
    if(!q.rowCount) return res.json(resposta);
    const usuario=q.rows[0];
    const recente=await db.query("SELECT 1 FROM recuperacoes_senha WHERE usuario_id=$1 AND criado_em > NOW()-INTERVAL '60 seconds' LIMIT 1",[usuario.id]);
    if(recente.rowCount) return res.json(resposta);
    const codigo=String(crypto.randomInt(0,1000000)).padStart(6,'0');
    const codigoHash=crypto.createHash('sha256').update(codigo).digest('hex');
    await db.query('UPDATE recuperacoes_senha SET usado=TRUE WHERE usuario_id=$1 AND usado=FALSE',[usuario.id]);
    const ins=await db.query("INSERT INTO recuperacoes_senha(usuario_id,codigo_hash,expira_em) VALUES($1,$2,NOW()+INTERVAL '10 minutes') RETURNING id",[usuario.id,codigoHash]);
    try{ await enviarCodigoRecuperacao(usuario.email,codigo); }
    catch(e){ await db.query('DELETE FROM recuperacoes_senha WHERE id=$1',[ins.rows[0].id]); console.error('Falha SMTP:',e.message); return res.status(503).json({erro:'O envio de e-mail ainda não está configurado no IDE+.'}); }
    res.json(resposta);
  }catch(e){console.error(e);res.status(500).json({erro:'Não foi possível iniciar a recuperação de senha.'});}
});

router.post('/confirmar-codigo-senha',async(req,res)=>{
  try{
    const email=String(req.body.email||'').trim().toLowerCase(), codigo=String(req.body.codigo||'').trim();
    if(!email||!/^\\d{6}$/.test(codigo)) return res.status(400).json({erro:'E-mail ou código inválido.'});
    const q=await db.query("SELECT r.id,r.codigo_hash,r.tentativas,u.id usuario_id FROM recuperacoes_senha r JOIN usuarios u ON u.id=r.usuario_id WHERE LOWER(u.email)=LOWER($1) AND u.ativo=TRUE AND r.usado=FALSE AND r.expira_em>NOW() ORDER BY r.criado_em DESC LIMIT 1",[email]);
    if(!q.rowCount) return res.status(400).json({erro:'Código inválido ou expirado. Solicite um novo código.'});
    const r=q.rows[0];
    if(r.tentativas>=5){await db.query('UPDATE recuperacoes_senha SET usado=TRUE WHERE id=$1',[r.id]);return res.status(429).json({erro:'Limite de tentativas atingido. Solicite um novo código.'});}
    const hash=crypto.createHash('sha256').update(codigo).digest('hex');
    if(hash!==r.codigo_hash){await db.query('UPDATE recuperacoes_senha SET tentativas=tentativas+1 WHERE id=$1',[r.id]);return res.status(400).json({erro:'Código inválido.'});}
    await db.query('UPDATE recuperacoes_senha SET confirmado_em=NOW() WHERE id=$1',[r.id]);
    const resetToken=jwt.sign({tipo:'RESET_SENHA',usuario_id:r.usuario_id,recuperacao_id:r.id},process.env.JWT_SECRET,{expiresIn:'10m'});
    res.json({ok:true,resetToken});
  }catch(e){console.error(e);res.status(500).json({erro:'Não foi possível confirmar o código.'});}
});

router.post('/redefinir-senha',async(req,res)=>{
  try{
    const {resetToken,novaSenha}=req.body;
    if(!resetToken||!novaSenha||String(novaSenha).length<8) return res.status(400).json({erro:'Informe uma nova senha com pelo menos 8 caracteres.'});
    let p; try{p=jwt.verify(resetToken,process.env.JWT_SECRET);}catch(_){return res.status(400).json({erro:'Autorização expirada. Solicite um novo código.'});}
    if(p.tipo!=='RESET_SENHA') return res.status(400).json({erro:'Autorização inválida.'});
    const q=await db.query('SELECT id FROM recuperacoes_senha WHERE id=$1 AND usuario_id=$2 AND usado=FALSE AND confirmado_em IS NOT NULL AND expira_em>NOW()',[p.recuperacao_id,p.usuario_id]);
    if(!q.rowCount) return res.status(400).json({erro:'Autorização inválida ou expirada.'});
    const hash=await bcrypt.hash(String(novaSenha),12);
    const client=await db.connect();
    try{await client.query('BEGIN');await client.query('UPDATE usuarios SET senha_hash=$1 WHERE id=$2',[hash,p.usuario_id]);await client.query('UPDATE recuperacoes_senha SET usado=TRUE WHERE usuario_id=$1 AND usado=FALSE',[p.usuario_id]);await client.query('COMMIT');}
    catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    res.json({ok:true});
  }catch(e){console.error(e);res.status(500).json({erro:'Não foi possível redefinir a senha.'});}
});

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
