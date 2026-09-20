const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const q = await db.query(`
      SELECT p.id, p.nome, p.cpf, p.foto, p.telefone, p.email, p.origem,
             p.status, p.data_nascimento, p.cidade, p.bairro, p.endereco, p.numero, p.observacoes, p.congregacao_id, p.criado_em, c.nome AS congregacao
      FROM pessoas p
      LEFT JOIN congregacoes c
        ON c.id = p.congregacao_id AND c.denominacao_id = p.denominacao_id
      WHERE p.denominacao_id = $1 AND p.ativo = TRUE
      ORDER BY p.criado_em DESC
    `, [req.user.denominacao_id]);
    res.json(q.rows);
  } catch (e) {
    console.error('Erro ao listar pessoas:', e);
    res.status(500).json({ erro: 'Erro ao listar pessoas.' });
  }
});

router.post('/', async (req, res) => {
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
    const congregacao = await db.query(
      'SELECT id FROM congregacoes WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE',
      [congregacao_id, req.user.denominacao_id]
    );
    log('consulta congregacao concluida');
    if (!congregacao.rowCount) {
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

router.put('/:id', async (req,res)=>{
  try{
    const {nome,cpf,foto,telefone,email,data_nascimento,cidade,bairro,endereco,numero,origem,observacoes,congregacao_id}=req.body;
    if(!nome||!congregacao_id||!origem||!endereco||!numero)return res.status(400).json({erro:'Preencha os campos obrigatórios: nome, congregação, origem, endereço e número.'});
    const cpfLimpo=cpf?String(cpf).replace(/\D/g,''):null;
    if(cpfLimpo&&cpfLimpo.length!==11)return res.status(400).json({erro:'Informe um CPF válido com 11 dígitos.'});
    const cg=await db.query('SELECT id FROM congregacoes WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE',[congregacao_id,req.user.denominacao_id]);
    if(!cg.rowCount)return res.status(400).json({erro:'Congregação inválida.'});
    const q=await db.query(`UPDATE pessoas SET congregacao_id=$1,nome=$2,cpf=$3,foto=$4,telefone=$5,email=$6,data_nascimento=$7,cidade=$8,bairro=$9,endereco=$10,numero=$11,origem=$12,observacoes=$13,atualizado_em=NOW() WHERE id=$14 AND denominacao_id=$15 AND ativo=TRUE RETURNING *`,[congregacao_id,nome.trim(),cpfLimpo,foto||null,telefone?telefone.trim():null,email||null,data_nascimento||null,cidade||null,bairro||null,endereco.trim(),String(numero).trim(),origem,observacoes||null,req.params.id,req.user.denominacao_id]);
    if(!q.rowCount)return res.status(404).json({erro:'Pessoa não encontrada.'});res.json(q.rows[0]);
  }catch(e){console.error('Erro ao alterar pessoa:',e);if(e.code==='23505')return res.status(400).json({erro:'Este CPF já está cadastrado nesta denominação.'});res.status(500).json({erro:'Erro ao alterar pessoa.'});}
});
router.delete('/:id',async(req,res)=>{try{const q=await db.query('UPDATE pessoas SET ativo=FALSE,atualizado_em=NOW() WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE RETURNING id',[req.params.id,req.user.denominacao_id]);if(!q.rowCount)return res.status(404).json({erro:'Pessoa não encontrada.'});res.json({ok:true});}catch(e){console.error('Erro ao excluir pessoa:',e);res.status(500).json({erro:'Erro ao excluir pessoa.'});}});

router.get('/resumo', async (req, res) => {
  try {
    const q = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE ativo) pessoas_alcancadas,
        COUNT(*) FILTER (WHERE ativo AND status='EM_DISCIPULADO') em_discipulado,
        COUNT(*) FILTER (WHERE ativo AND status='PREPARANDO_BATISMO') preparando_batismo,
        COUNT(*) FILTER (
          WHERE ativo AND status='BATIZADO'
          AND EXTRACT(YEAR FROM atualizado_em)=EXTRACT(YEAR FROM CURRENT_DATE)
        ) batizados_ano
      FROM pessoas WHERE denominacao_id=$1
    `, [req.user.denominacao_id]);
    res.json(q.rows[0]);
  } catch (e) {
    console.error('Erro ao carregar resumo:', e);
    res.status(500).json({ erro: 'Erro ao carregar resumo.' });
  }
});

module.exports = router;
