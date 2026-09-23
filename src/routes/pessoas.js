const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const {requirePermission}=require('../middleware/permissions');
const {filter,congregation}=require('../middleware/scope');
const router = express.Router();

router.use(auth);

router.get('/', requirePermission('pessoas.visualizar'), async (req, res) => {
  try {
    const s=filter(req.user,'c.cidade_ministerial_id','p.congregacao_id',2);
    const q = await db.query(`
      SELECT p.id, p.nome, p.cpf, p.foto, p.telefone, p.email, p.origem,
             p.status, p.data_nascimento, p.cidade, p.bairro, p.endereco, p.numero, p.observacoes, p.congregacao_id, p.criado_em, c.nome AS congregacao
      FROM pessoas p
      LEFT JOIN congregacoes c
        ON c.id = p.congregacao_id AND c.denominacao_id = p.denominacao_id
      WHERE p.denominacao_id = $1 AND p.ativo = TRUE${s.sql}
      ORDER BY p.criado_em DESC
    `, [req.user.denominacao_id,...s.values]);
    res.json(q.rows);
  } catch (e) {
    console.error('Erro ao listar pessoas:', e);
    res.status(500).json({ erro: 'Erro ao listar pessoas.' });
  }
});

router.post('/', requirePermission('pessoas.inserir'), async (req, res) => {
  const inicio = Date.now();
  const reqId = String(req.get('X-Request-Id') || ('pessoa-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)));
  res.set('X-Request-Id', reqId);
  const log = (etapa, extra='') => console.log('[PESSOA]['+reqId+'] '+etapa+' +'+(Date.now()-inicio)+'ms'+(extra?' '+extra:''));
  log('POST recebido');
  try {
    const {
      nome, cpf, foto, telefone, email, data_nascimento, cidade, bairro,
      endereco, numero, origem, observacoes, congregacao_id
    } = req.body;

    if (!nome || !congregacao_id || !origem || !endereco || !numero) {
      return res.status(400).json({
        erro: 'Preencha os campos obrigatórios: nome, congregação, origem, endereço e número.'
      });
    }

    const cpfLimpo = cpf ? String(cpf).replace(/\D/g, '') : null;
    if (cpfLimpo && cpfLimpo.length !== 11) {
      return res.status(400).json({ erro: 'Informe um CPF válido com 11 dígitos.' });
    }

    log('validacao concluida');
    log('consulta congregacao iniciada');
    const congregacao = await congregation(req.user,congregacao_id);
    log('consulta congregacao concluida');
    if (!congregacao) {
      return res.status(400).json({ erro: 'Congregação inválida.' });
    }

    log('insert pessoa iniciado');
    const q = await db.query(`
      INSERT INTO pessoas (
        denominacao_id, congregacao_id, nome, cpf, foto, telefone, email,
        data_nascimento, cidade, bairro, endereco, numero, origem, observacoes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      req.user.denominacao_id, congregacao_id, nome.trim(), cpfLimpo, foto || null,
      telefone ? telefone.trim() : null, email || null, data_nascimento || null, cidade || null,
      bairro || null, endereco.trim(), String(numero).trim(), origem, observacoes || null
    ]);

    log('insert pessoa concluido');
    log('respondendo 201');
    res.status(201).json({...q.rows[0], request_id:reqId, tempo_ms:Date.now()-inicio});
  } catch (e) {
    console.error('[PESSOA]['+reqId+'] ERRO +'+(Date.now()-inicio)+'ms', e);
    if (e.code === '23505') {
      return res.status(400).json({ erro: 'Este CPF já está cadastrado nesta denominação.' });
    }
    res.status(500).json({ erro: 'Erro ao cadastrar pessoa.' });
  }
});

router.put('/:id', requirePermission('pessoas.editar'), async (req,res)=>{
  try{
    const {nome,cpf,foto,telefone,email,data_nascimento,cidade,bairro,endereco,numero,origem,observacoes,congregacao_id}=req.body;
    if(!nome||!congregacao_id||!origem||!endereco||!numero)return res.status(400).json({erro:'Preencha os campos obrigatórios: nome, congregação, origem, endereço e número.'});
    const cpfLimpo=cpf?String(cpf).replace(/\D/g,''):null;
    if(cpfLimpo&&cpfLimpo.length!==11)return res.status(400).json({erro:'Informe um CPF válido com 11 dígitos.'});
    if(!await congregation(req.user,congregacao_id))return res.status(400).json({erro:'Congregação inválida ou fora do seu acesso.'});
    const s=filter(req.user,'c.cidade_ministerial_id','p.congregacao_id',16);
    const q=await db.query(`UPDATE pessoas p SET congregacao_id=$1,nome=$2,cpf=$3,foto=$4,telefone=$5,email=$6,data_nascimento=$7,cidade=$8,bairro=$9,endereco=$10,numero=$11,origem=$12,observacoes=$13,atualizado_em=NOW() FROM congregacoes c WHERE c.id=p.congregacao_id AND p.id=$14 AND p.denominacao_id=$15 AND p.ativo=TRUE${s.sql} RETURNING p.*`,[congregacao_id,nome.trim(),cpfLimpo,foto||null,telefone?telefone.trim():null,email||null,data_nascimento||null,cidade||null,bairro||null,endereco.trim(),String(numero).trim(),origem,observacoes||null,req.params.id,req.user.denominacao_id,...s.values]);
    if(!q.rowCount)return res.status(404).json({erro:'Pessoa não encontrada.'});res.json(q.rows[0]);
  }catch(e){console.error('Erro ao alterar pessoa:',e);if(e.code==='23505')return res.status(400).json({erro:'Este CPF já está cadastrado nesta denominação.'});res.status(500).json({erro:'Erro ao alterar pessoa.'});}
});
router.delete('/:id',requirePermission('pessoas.excluir'),async(req,res)=>{try{const s=filter(req.user,'c.cidade_ministerial_id','p.congregacao_id',3);const q=await db.query('UPDATE pessoas p SET ativo=FALSE,atualizado_em=NOW() FROM congregacoes c WHERE c.id=p.congregacao_id AND p.id=$1 AND p.denominacao_id=$2 AND p.ativo=TRUE'+s.sql+' RETURNING p.id',[req.params.id,req.user.denominacao_id,...s.values]);if(!q.rowCount)return res.status(404).json({erro:'Pessoa não encontrada.'});res.json({ok:true});}catch(e){console.error('Erro ao excluir pessoa:',e);res.status(500).json({erro:'Erro ao excluir pessoa.'});}});

router.get('/resumo', requirePermission('pessoas.visualizar'), async (req, res) => {
  try {
    const s=filter(req.user,'c.cidade_ministerial_id','p.congregacao_id',2);
    const q = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE p.ativo) pessoas_alcancadas,
        COUNT(*) FILTER (WHERE p.ativo AND p.status='EM_DISCIPULADO') em_discipulado,
        COUNT(*) FILTER (WHERE p.ativo AND p.status='PREPARANDO_BATISMO') preparando_batismo,
        COUNT(*) FILTER (
          WHERE p.ativo AND p.status='BATIZADO'
          AND EXTRACT(YEAR FROM p.atualizado_em)=EXTRACT(YEAR FROM CURRENT_DATE)
        ) batizados_ano
      FROM pessoas p JOIN congregacoes c ON c.id=p.congregacao_id
      WHERE p.denominacao_id=$1${s.sql}
    `, [req.user.denominacao_id,...s.values]);
    res.json(q.rows[0]);
  } catch (e) {
    console.error('Erro ao carregar resumo:', e);
    res.status(500).json({ erro: 'Erro ao carregar resumo.' });
  }
});

module.exports = router;
