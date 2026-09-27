const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const auth = require('../middleware/auth');
const { permissionsFor, president } = require('../middleware/permissions');
const router = express.Router();
router.use(auth);

const cargos = {
  VICE_PRESIDENTE: 'DENOMINACAO', SECRETARIO: 'DENOMINACAO', OUTRO: 'DENOMINACAO',
  PASTOR_LOCAL: 'CIDADE',
  SUPERINTENDENTE_CAMPANHAS: 'CIDADE', VICE_SUPERINTENDENTE_CAMPANHAS: 'CIDADE',
  SUPERINTENDENTE_DISCIPULADO: 'CIDADE', VICE_SUPERINTENDENTE_DISCIPULADO: 'CIDADE',
  DIRIGENTE: 'CONGREGACAO', VICE_DIRIGENTE: 'CONGREGACAO',
  SECRETARIO_CAMPANHA: 'CONGREGACAO'
};
const presidentOnly = (req,res,next) => president(req.user) ? next() :
  res.status(403).json({ erro: 'Somente o Pastor Presidente administra os acessos.' });
const cleanId = value => Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null;

router.get('/me', async (req,res,next) => {
  try {
    const p = await permissionsFor(req.user);
    res.json({ usuario:req.user, permissoes:[...p] });
  } catch(e) { next(e); }
});
router.get('/permissoes', presidentOnly, async(req,res,next) => {
  try {
    const q = await db.query('SELECT id,codigo,nome,modulo FROM permissoes ORDER BY modulo,nome');
    res.json(q.rows);
  } catch(e) { next(e); }
});
router.get('/usuarios', presidentOnly, async(req,res,next) => {
  try {
    const q = await db.query(`SELECT u.id,u.nome,u.email,u.telefone,u.perfil,u.cargo,u.escopo,
      u.cidade_ministerial_id,u.congregacao_id,u.ativo,cm.nome cidade,c.nome congregacao
      FROM usuarios u
      LEFT JOIN cidades_ministeriais cm ON cm.id=u.cidade_ministerial_id
      LEFT JOIN congregacoes c ON c.id=u.congregacao_id
      WHERE u.denominacao_id=$1 ORDER BY u.ativo DESC,u.nome`,[req.user.denominacao_id]);
    res.json(q.rows);
  } catch(e) { next(e); }
});
router.post('/usuarios', presidentOnly, async(req,res,next) => {
  const {nome,email,telefone,senha,permissoes} = req.body;
  const cargo = String(req.body.cargo || '').toUpperCase();
  const escopo = cargos[cargo];
  if (!String(nome || '').trim() || !String(email || '').trim() || !senha || String(senha).length<8 || !escopo)
    return res.status(400).json({erro:'Informe nome, e-mail, cargo válido e senha com pelo menos 8 caracteres.'});
  const cidadeId = cleanId(req.body.cidade_ministerial_id);
  const congregacaoId = cleanId(req.body.congregacao_id);
  if (escopo!=='DENOMINACAO' && !cidadeId)
    return res.status(400).json({erro:'Selecione a cidade deste usuário.'});
  if (escopo==='CONGREGACAO' && !congregacaoId)
    return res.status(400).json({erro:'Selecione a congregação deste usuário.'});
  const ids = Array.isArray(permissoes) ? [...new Set(permissoes.map(cleanId).filter(Boolean))] : [];
  const cx=await db.connect();
  try {
    await cx.query('BEGIN');
    if (cidadeId) {
      const city=await cx.query('SELECT id FROM cidades_ministeriais WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE',[cidadeId,req.user.denominacao_id]);
      if (!city.rowCount) { await cx.query('ROLLBACK'); return res.status(400).json({erro:'Cidade inválida.'}); }
    }
    if (congregacaoId) {
      const church=await cx.query('SELECT id FROM congregacoes WHERE id=$1 AND cidade_ministerial_id=$2 AND denominacao_id=$3 AND ativo=TRUE',
        [congregacaoId,cidadeId,req.user.denominacao_id]);
      if (!church.rowCount) { await cx.query('ROLLBACK'); return res.status(400).json({erro:'Congregação não pertence à cidade selecionada.'}); }
    }
    // Mesmo com um pedido manipulado, cargos locais nunca recebem permissões de administração geral.
    if (ids.length) {
      const q=await cx.query('SELECT id,codigo FROM permissoes WHERE id=ANY($1::bigint[])',[ids]);
      if (q.rowCount!==ids.length || (escopo!=='DENOMINACAO' && q.rows.some(x=>x.codigo.startsWith('cidades.') || x.codigo==='pastores_locais.cadastrar' || x.codigo==='usuarios.liberar')))
        { await cx.query('ROLLBACK'); return res.status(400).json({erro:'Permissões incompatíveis com este cargo.'}); }
    }
    const perfil = cargo==='PASTOR_LOCAL' ? 'PASTOR_LOCAL' :
      escopo==='DENOMINACAO' ? 'LIDERANCA_CONVENCAO' : 'LIDERANCA_LOCAL';
    const hash=await bcrypt.hash(String(senha),12);
    const q=await cx.query(`INSERT INTO usuarios
      (denominacao_id,nome,email,telefone,senha_hash,perfil,cargo,escopo,cidade_ministerial_id,congregacao_id)
      VALUES($1,$2,LOWER($3),$4,$5,$6,$7,$8,$9,$10)
      RETURNING id,nome,email,telefone,perfil,cargo,escopo,cidade_ministerial_id,congregacao_id,ativo`,
      [req.user.denominacao_id,String(nome).trim(),String(email).trim(),telefone||null,hash,perfil,cargo,escopo,
        escopo==='DENOMINACAO'?null:cidadeId,escopo==='CONGREGACAO'?congregacaoId:null]);
    for (const id of ids) await cx.query(`INSERT INTO usuario_permissoes(usuario_id,permissao_id,concedido_por)
      VALUES($1,$2,$3)`,[q.rows[0].id,id,req.user.id]);
    await cx.query('COMMIT');
    res.status(201).json(q.rows[0]);
  } catch(e) {
    await cx.query('ROLLBACK');
    if (e.code==='23505') return res.status(409).json({erro:'Este e-mail já possui acesso.'});
    next(e);
  } finally { cx.release(); }
});
router.post('/pastores-locais', presidentOnly, (req,res) => res.status(410).json({
  erro:'Cadastre o Pastor Local em Usuários e Permissões.'
}));
router.get('/coordenadores', async(req,res,next) => {
  const gestor=String(req.user.escopo||'').toUpperCase()==='CIDADE'&&['PASTOR_LOCAL','GESTOR_LOCAL'].includes(String(req.user.perfil||'').toUpperCase());
  if(!gestor)return res.status(403).json({erro:'Acesso restrito ao Gestor Local.'});
  try{
    const q=await db.query(`SELECT id,nome,email,telefone,perfil,cargo,ativo FROM usuarios
      WHERE denominacao_id=$1 AND cidade_ministerial_id=$2
      AND cargo IN ('SUPERINTENDENTE_CAMPANHAS','VICE_SUPERINTENDENTE_CAMPANHAS','SUPERINTENDENTE_DISCIPULADO','VICE_SUPERINTENDENTE_DISCIPULADO','DIRIGENTE','VICE_DIRIGENTE','PROFESSOR')
      ORDER BY ativo DESC,nome`,[req.user.denominacao_id,req.user.cidade_ministerial_id]);
    res.json(q.rows);
  }catch(e){next(e);}
});
router.post('/equipe-local', async(req,res,next) => {
  const gestor = String(req.user.escopo||'').toUpperCase()==='CIDADE' &&
    ['PASTOR_LOCAL','GESTOR_LOCAL'].includes(String(req.user.perfil||'').toUpperCase());
  if(!gestor) return res.status(403).json({erro:'Somente o Gestor Local pode criar coordenadores.'});
  const {nome,email,telefone,senha}=req.body;
  const cargo=String(req.body.cargo||'').toUpperCase();
  const cargosCoordenacao=['SUPERINTENDENTE_CAMPANHAS','VICE_SUPERINTENDENTE_CAMPANHAS','SUPERINTENDENTE_DISCIPULADO','VICE_SUPERINTENDENTE_DISCIPULADO','DIRIGENTE','VICE_DIRIGENTE','PROFESSOR'];
  if(!cargosCoordenacao.includes(cargo)||!String(nome||'').trim()||!String(email||'').trim()||!senha||String(senha).length<8)
    return res.status(400).json({erro:'Informe nome, e-mail, função e senha com pelo menos 8 caracteres.'});
  const hash=await bcrypt.hash(String(senha),12);
  try{
    const q=await db.query(`INSERT INTO usuarios
      (denominacao_id,nome,email,telefone,senha_hash,perfil,cargo,escopo,cidade_ministerial_id)
      VALUES($1,$2,LOWER($3),$4,$5,$8,$6,'CIDADE',$7)
      RETURNING id,nome,email,telefone,perfil,cargo,escopo,cidade_ministerial_id,ativo`,
      [req.user.denominacao_id,String(nome).trim(),String(email).trim(),telefone||null,hash,cargo,req.user.cidade_ministerial_id,
        ['DIRIGENTE','VICE_DIRIGENTE','PROFESSOR'].includes(cargo)?'EQUIPE_LOCAL':'LIDERANCA_LOCAL']);
    res.status(201).json(q.rows[0]);
  }catch(e){if(e.code==='23505')return res.status(409).json({erro:'Este e-mail já possui acesso.'});next(e);}
});
const coordenadorAtual = u => String(u.escopo||'').toUpperCase()==='CIDADE' &&
  ['SUPERINTENDENTE_CAMPANHAS','VICE_SUPERINTENDENTE_CAMPANHAS','SUPERINTENDENTE_DISCIPULADO','VICE_SUPERINTENDENTE_DISCIPULADO'].includes(String(u.cargo||'').toUpperCase());

router.get('/equipe-coordenacao', async(req,res,next)=>{
  if(!coordenadorAtual(req.user))return res.status(403).json({erro:'Acesso restrito à Coordenação.'});
  try{
    const f=await db.query('SELECT id,nome,modulo FROM funcoes_equipe WHERE coordenador_id=$1 AND ativo=TRUE ORDER BY modulo,nome',[req.user.id]);
    const u=await db.query(`SELECT u.id,u.nome,u.email,u.telefone,u.ativo,fe.nome funcao,fe.modulo
      FROM usuarios_funcoes_equipe uf JOIN usuarios u ON u.id=uf.usuario_id JOIN funcoes_equipe fe ON fe.id=uf.funcao_equipe_id
      WHERE fe.coordenador_id=$1 ORDER BY u.ativo DESC,u.nome`,[req.user.id]);
    res.json({funcoes:f.rows,usuarios:u.rows});
  }catch(e){next(e);}
});
router.post('/funcoes-equipe', async(req,res,next)=>{
  if(!coordenadorAtual(req.user))return res.status(403).json({erro:'Acesso restrito à Coordenação.'});
  const nome=String(req.body.nome||'').trim(),modulo=String(req.body.modulo||'').toUpperCase();
  if(!nome||!['CAMPANHAS','DISCIPULADO','GERAL'].includes(modulo))return res.status(400).json({erro:'Informe a função e a área.'});
  try{const q=await db.query(`INSERT INTO funcoes_equipe(denominacao_id,cidade_ministerial_id,coordenador_id,nome,modulo)
    VALUES($1,$2,$3,$4,$5) RETURNING id,nome,modulo`,[req.user.denominacao_id,req.user.cidade_ministerial_id,req.user.id,nome,modulo]);res.status(201).json(q.rows[0]);}catch(e){next(e);}
});
router.post('/usuarios-equipe', async(req,res,next)=>{
  if(!coordenadorAtual(req.user))return res.status(403).json({erro:'Acesso restrito à Coordenação.'});
  const {nome,email,telefone,senha}=req.body;const funcaoId=cleanId(req.body.funcao_id);
  if(!String(nome||'').trim()||!String(email||'').trim()||!senha||String(senha).length<8||!funcaoId)return res.status(400).json({erro:'Preencha nome, função, e-mail e senha com pelo menos 8 caracteres.'});
  const cx=await db.connect();
  try{
    const fun=(await cx.query('SELECT id,modulo FROM funcoes_equipe WHERE id=$1 AND coordenador_id=$2 AND ativo=TRUE',[funcaoId,req.user.id])).rows[0];
    if(!fun)return res.status(400).json({erro:'Função inválida.'});
    await cx.query('BEGIN');const hash=await bcrypt.hash(String(senha),12);
    const u=await cx.query(`INSERT INTO usuarios(denominacao_id,nome,email,telefone,senha_hash,perfil,cargo,escopo,cidade_ministerial_id)
      VALUES($1,$2,LOWER($3),$4,$5,'EQUIPE_LOCAL',$6,'CIDADE',$7) RETURNING id,nome,email,telefone,ativo`,
      [req.user.denominacao_id,String(nome).trim(),String(email).trim(),telefone||null,hash,fun.modulo==='CAMPANHAS'?'EQUIPE_CAMPANHAS':fun.modulo==='DISCIPULADO'?'EQUIPE_DISCIPULADO':'VISUALIZADOR',req.user.cidade_ministerial_id]);
    await cx.query('INSERT INTO usuarios_funcoes_equipe(usuario_id,funcao_equipe_id) VALUES($1,$2)',[u.rows[0].id,funcaoId]);
    await cx.query('COMMIT');res.status(201).json(u.rows[0]);
  }catch(e){await cx.query('ROLLBACK');if(e.code==='23505')return res.status(409).json({erro:'Este e-mail já possui acesso.'});next(e);}finally{cx.release();}
});

router.put('/equipe-local/:id', async(req,res,next)=>{
  const gestor=String(req.user.escopo||'').toUpperCase()==='CIDADE'&&['PASTOR_LOCAL','GESTOR_LOCAL'].includes(String(req.user.perfil||'').toUpperCase());
  if(!gestor)return res.status(403).json({erro:'Acesso restrito ao Gestor Local.'});
  const id=cleanId(req.params.id),nome=String(req.body.nome||'').trim(),email=String(req.body.email||'').trim(),telefone=req.body.telefone||null,cargo=String(req.body.cargo||'').toUpperCase();
  const permitidos=['SUPERINTENDENTE_CAMPANHAS','VICE_SUPERINTENDENTE_CAMPANHAS','SUPERINTENDENTE_DISCIPULADO','VICE_SUPERINTENDENTE_DISCIPULADO','DIRIGENTE','VICE_DIRIGENTE','PROFESSOR'];
  if(!id||!nome||!email||!permitidos.includes(cargo))return res.status(400).json({erro:'Informe nome, e-mail e função válida.'});
  try{
    const q=await db.query(`UPDATE usuarios SET nome=$1,email=LOWER($2),telefone=$3,cargo=$4,perfil=$5
      WHERE id=$6 AND denominacao_id=$7 AND cidade_ministerial_id=$8
      AND perfil NOT IN ('MASTER','PASTOR_PRESIDENTE','PASTOR_LOCAL')
      RETURNING id,nome,email,telefone,cargo,perfil,ativo`,
      [nome,email,telefone,cargo,['DIRIGENTE','VICE_DIRIGENTE','PROFESSOR'].includes(cargo)?'EQUIPE_LOCAL':'LIDERANCA_LOCAL',id,req.user.denominacao_id,req.user.cidade_ministerial_id]);
    if(!q.rowCount)return res.status(404).json({erro:'Acesso não encontrado.'});res.json(q.rows[0]);
  }catch(e){if(e.code==='23505')return res.status(409).json({erro:'Este e-mail já possui acesso.'});next(e);}
});
router.delete('/equipe-local/:id', async(req,res,next)=>{
  const gestor=String(req.user.escopo||'').toUpperCase()==='CIDADE'&&['PASTOR_LOCAL','GESTOR_LOCAL'].includes(String(req.user.perfil||'').toUpperCase());
  if(!gestor)return res.status(403).json({erro:'Acesso restrito ao Gestor Local.'});
  try{const q=await db.query(`DELETE FROM usuarios WHERE id=$1 AND denominacao_id=$2 AND cidade_ministerial_id=$3
    AND perfil NOT IN ('MASTER','PASTOR_PRESIDENTE','PASTOR_LOCAL') RETURNING id,nome`,[req.params.id,req.user.denominacao_id,req.user.cidade_ministerial_id]);
    if(!q.rowCount)return res.status(404).json({erro:'Acesso não encontrado.'});res.json({ok:true,...q.rows[0]});
  }catch(e){if(e.code==='23503')return res.status(409).json({erro:'Este acesso possui vínculos. Remova os vínculos antes de excluir.'});next(e);}
});
router.delete('/funcoes-equipe/:id', async(req,res,next)=>{
  if(!coordenadorAtual(req.user))return res.status(403).json({erro:'Acesso restrito à Coordenação.'});
  try{const q=await db.query('DELETE FROM funcoes_equipe WHERE id=$1 AND coordenador_id=$2 RETURNING id,nome',[req.params.id,req.user.id]);
    if(!q.rowCount)return res.status(404).json({erro:'Função não encontrada.'});res.json({ok:true,...q.rows[0]});
  }catch(e){if(e.code==='23503')return res.status(409).json({erro:'A função possui usuários vinculados.'});next(e);}
});
router.put('/funcoes-equipe/:id', async(req,res,next)=>{
  if(!coordenadorAtual(req.user))return res.status(403).json({erro:'Acesso restrito à Coordenação.'});
  const nome=String(req.body.nome||'').trim(),modulo=String(req.body.modulo||'').toUpperCase();
  if(!nome||!['CAMPANHAS','DISCIPULADO','GERAL'].includes(modulo))return res.status(400).json({erro:'Informe função e área.'});
  try{const q=await db.query('UPDATE funcoes_equipe SET nome=$1,modulo=$2 WHERE id=$3 AND coordenador_id=$4 RETURNING id,nome,modulo',[nome,modulo,req.params.id,req.user.id]);
    if(!q.rowCount)return res.status(404).json({erro:'Função não encontrada.'});res.json(q.rows[0]);}catch(e){next(e);}
});
router.delete('/usuarios-equipe/:id', async(req,res,next)=>{
  if(!coordenadorAtual(req.user))return res.status(403).json({erro:'Acesso restrito à Coordenação.'});
  try{const q=await db.query(`DELETE FROM usuarios u USING usuarios_funcoes_equipe uf,funcoes_equipe fe
    WHERE u.id=$1 AND uf.usuario_id=u.id AND fe.id=uf.funcao_equipe_id AND fe.coordenador_id=$2 RETURNING u.id,u.nome`,[req.params.id,req.user.id]);
    if(!q.rowCount)return res.status(404).json({erro:'Usuário não encontrado.'});res.json({ok:true,...q.rows[0]});}catch(e){next(e);}
});

router.get('/usuarios/:id/permissoes', presidentOnly, async(req,res,next) => {
  try {
    const q=await db.query(`SELECT p.id,p.codigo,p.nome,p.modulo,
      (up.usuario_id IS NOT NULL AND up.ativo=TRUE) liberada FROM permissoes p
      LEFT JOIN usuario_permissoes up ON up.permissao_id=p.id AND up.usuario_id=$1
      WHERE EXISTS(SELECT 1 FROM usuarios u WHERE u.id=$1 AND u.denominacao_id=$2)
      ORDER BY p.modulo,p.nome`,[req.params.id,req.user.denominacao_id]);
    res.json(q.rows);
  } catch(e) { next(e); }
});
router.put('/usuarios/:id/permissoes', presidentOnly, async(req,res,next) => {
  const cx=await db.connect();
  try {
    const alvo=(await cx.query('SELECT id,perfil,escopo FROM usuarios WHERE id=$1 AND denominacao_id=$2',
      [req.params.id,req.user.denominacao_id])).rows[0];
    if (!alvo) return res.status(404).json({erro:'Usuário não encontrado.'});
    if (president(alvo)) return res.status(403).json({erro:'Não é permitido alterar o acesso do Pastor Presidente.'});
    const ids=Array.isArray(req.body.permissoes) ? [...new Set(req.body.permissoes.map(cleanId).filter(Boolean))] : [];
    if (ids.length) {
      const p=await cx.query('SELECT id,codigo FROM permissoes WHERE id=ANY($1::bigint[])',[ids]);
      if (p.rowCount!==ids.length || (alvo.escopo!=='DENOMINACAO' &&
        p.rows.some(x=>x.codigo.startsWith('cidades.') || x.codigo==='pastores_locais.cadastrar' || x.codigo==='usuarios.liberar')))
        return res.status(400).json({erro:'Permissões incompatíveis com este cargo.'});
    }
    await cx.query('BEGIN');
    await cx.query('DELETE FROM usuario_permissoes WHERE usuario_id=$1',[alvo.id]);
    for (const id of ids) await cx.query(`INSERT INTO usuario_permissoes(usuario_id,permissao_id,concedido_por)
      VALUES($1,$2,$3)`,[alvo.id,id,req.user.id]);
    await cx.query('COMMIT');
    res.json({ok:true});
  } catch(e) { await cx.query('ROLLBACK'); next(e); }
  finally { cx.release(); }
});
router.delete('/usuarios/:id', presidentOnly, async(req,res,next) => {
  const cx=await db.connect();
  try{
    const alvo=(await cx.query('SELECT id,nome,perfil FROM usuarios WHERE id=$1 AND denominacao_id=$2',[req.params.id,req.user.denominacao_id])).rows[0];
    if(!alvo)return res.status(404).json({erro:'Usuário não encontrado.'});
    if(['MASTER','PASTOR_PRESIDENTE'].includes(String(alvo.perfil||'').toUpperCase()))
      return res.status(403).json({erro:'O acesso do Pastor Presidente não pode ser excluído.'});
    await cx.query('BEGIN');
    await cx.query('DELETE FROM usuarios WHERE id=$1 AND denominacao_id=$2',[alvo.id,req.user.denominacao_id]);
    await cx.query('COMMIT');
    res.json({ok:true,nome:alvo.nome});
  }catch(e){
    await cx.query('ROLLBACK');
    if(e.code==='23503')return res.status(409).json({erro:'Este acesso possui vínculo que impede a exclusão. Suspenda o usuário ou remova primeiro o vínculo relacionado.'});
    next(e);
  }finally{cx.release();}
});
router.patch('/usuarios/:id/ativo', presidentOnly, async(req,res,next) => {
  try {
    if (typeof req.body.ativo!=='boolean') return res.status(400).json({erro:'Informe o estado do acesso.'});
    const q=await db.query(`UPDATE usuarios SET ativo=$1 WHERE id=$2 AND denominacao_id=$3
      AND perfil NOT IN ('MASTER','PASTOR_PRESIDENTE') RETURNING id,ativo`,
      [req.body.ativo,req.params.id,req.user.denominacao_id]);
    if (!q.rowCount) return res.status(404).json({erro:'Usuário não encontrado ou acesso protegido.'});
    res.json(q.rows[0]);
  } catch(e) { next(e); }
});
module.exports=router;
