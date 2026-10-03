// Pessoas (convertidos): cada nível vê só as pessoas da cidade em que atua
const router = require('express').Router();
const db = require('../db');
const { autenticar, exigirNivel, pode } = require('../auth');
const { escopoPessoa, pessoa, id, erro, transacao } = require('../acompanhamento');

router.use(autenticar, exigirNivel(1, 2, 3, 4), (req, res, next) => {
  if (!req.usuario.cidade_id && req.usuario.nivel !== 1) {
    return res.status(409).json({ erro: req.usuario.nivel === 1
      ? 'Cadastre a cidade da igreja sede em Estrutura para começar a cadastrar pessoas.'
      : 'Seu usuário ainda não tem cidade definida. Fale com quem cadastrou você.' });
  }
  next();
});

const CAMPOS = ['congregacao_id','nome','foto','cpf','telefone','nascimento','endereco','numero','bairro','observacao',
  'como_chegou_id','data_conversao','autoriza_dados'];

router.get('/', async (req, res) => {
  const u = req.usuario;
  const escopo = escopoPessoa(u);
  const cidade = req.query.cidade_id ? id(req.query.cidade_id, 'Cidade') : null;
  const busca = req.query.busca ? `%${String(req.query.busca).trim()}%` : null;
  const status = ['CONVERTIDO','DISCIPULADO','BATIZADO','AFASTADO'].includes(req.query.status) ? req.query.status : null;
  const { rows } = await db.query(
    `SELECT p.id, p.nome, p.foto, p.telefone, p.status, p.data_conversao, p.data_batismo, p.congregacao_id,
            p.etapa_antes_afastar, p.data_afastamento,
            g.nome AS congregacao, ci.nome AS como_chegou
       FROM pessoas p
       LEFT JOIN congregacoes g ON g.id = p.congregacao_id
       LEFT JOIN config_itens ci ON ci.id = p.como_chegou_id
      WHERE ${escopo.sql}
        AND ($4::text IS NULL OR p.nome ILIKE $4 OR p.telefone ILIKE $4 OR p.cpf ILIKE $4)
        AND ($5::text IS NULL OR p.status = $5)
        AND ($6::bigint IS NULL OR p.cidade_id = $6)
      ORDER BY p.criado_em DESC LIMIT 500`, [...escopo.valores, busca, status, cidade]);
  res.json(rows);
});

async function buscar(req) {
  return pessoa(req.usuario, req.params.id);
}

router.get('/:id', async (req, res) => {
  const p = await buscar(req);
  if (!p) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
  res.json(p);
});

async function limpar(req, b, cidadeId) {
  const v = {};
  for (const k of CAMPOS) v[k] = b[k] === '' || b[k] === undefined ? null : b[k];
  v.autoriza_dados = !!b.autoriza_dados;
  const OBRIG = { nome: 'Nome completo', data_conversao: 'Data da conversão', congregacao_id: 'Congregação',
    como_chegou_id: 'Como chegou', endereco: 'Endereço', numero: 'Número' };
  const faltando = Object.keys(OBRIG).filter((k) => !v[k] || !String(v[k]).trim());
  if (faltando.length) throw Object.assign(new Error('Preencha os campos obrigatórios: ' + faltando.map((k) => OBRIG[k]).join(', ') + '.'), { status: 400 });
  if (v.cpf) v.cpf = String(v.cpf).replace(/\D/g, '').slice(0, 11);
  if (v.congregacao_id) {
    const ok = (await db.query('SELECT 1 FROM congregacoes WHERE id = $1 AND cidade_id = $2 AND denominacao_id = $3', [v.congregacao_id, cidadeId, req.usuario.denominacao_id])).rowCount;
    if (!ok) throw Object.assign(new Error('Congregação de outra cidade.'), { status: 400 });
  }
  if (v.como_chegou_id && !(await db.query(`SELECT 1 FROM config_itens i WHERE i.id = $1 AND i.denominacao_id = $2
    AND i.tipo = 'COMO_CHEGOU' AND i.ativo AND (i.cidade_id IS NULL OR i.cidade_id = $3)
    AND NOT EXISTS (SELECT 1 FROM config_desativados d WHERE d.item_id = i.id AND d.cidade_id = $3)`,
    [v.como_chegou_id, req.usuario.denominacao_id, cidadeId])).rowCount) throw erro(400, 'Origem inválida para esta cidade.');
  return v;
}

router.post('/', async (req, res) => {
  const u = req.usuario;
  if (!pode(u, 'pessoas.cadastrar')) return res.status(403).json({ erro: 'Você não tem permissão para cadastrar pessoas.' });
  const cidadeId = u.nivel === 1 ? id(req.body.cidade_id || u.cidade_id, 'Cidade') : id(u.cidade_id, 'Cidade');
  if (!(await db.query('SELECT 1 FROM cidades WHERE id=$1 AND denominacao_id=$2',[cidadeId,u.denominacao_id])).rowCount) throw erro(400,'Cidade inválida.');
  const v = await limpar(req, req.body, cidadeId);
  v.data_conversao = v.data_conversao || new Date().toISOString().slice(0, 10);
  const resultado = await transacao(async client => {
    // CPF informado: evita duplicar um cadastro já existente na cidade.
    if (v.cpf) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [u.denominacao_id + ':' + cidadeId + ':' + v.cpf]);
      if ((await client.query('SELECT 1 FROM pessoas WHERE denominacao_id=$1 AND cidade_id=$2 AND regexp_replace(cpf,\'[^0-9]\',\'\',\'g\')=$3',
        [u.denominacao_id,cidadeId,v.cpf])).rowCount) throw erro(409,'Já existe uma pessoa com este CPF. Busque o cadastro para vinculá-lo à campanha.');
    }
    const campanhaId = id(req.body.campanha_id, 'Campanha', true);
    if (campanhaId) {
      const camp = await client.query(`SELECT c.id FROM campanhas c WHERE c.id=$1 AND c.denominacao_id=$2 AND c.cidade_id=$3
        AND ($4::bigint IS NULL OR c.criado_por=$4 OR c.responsavel_id=$4 OR EXISTS (
          SELECT 1 FROM campanha_colaboradores cc WHERE cc.campanha_id=c.id AND cc.usuario_id=$4))`,
        [campanhaId,u.denominacao_id,cidadeId,u.nivel===4 ? u.id : null]);
      if (!camp.rowCount) throw erro(400,'Campanha indisponível para este cadastro.');
    }
    const { rows } = await client.query(
    `INSERT INTO pessoas (denominacao_id, cidade_id, criado_por, ${CAMPOS.join(', ')})
     VALUES ($1, $2, $3, ${CAMPOS.map((_, i) => '$' + (i + 4)).join(', ')}) RETURNING id`,
    [u.denominacao_id, cidadeId, u.id, ...CAMPOS.map(k => v[k])]);
    if (campanhaId) await client.query('INSERT INTO campanha_pessoas (campanha_id,pessoa_id,registrado_por) VALUES ($1,$2,$3)',
      [campanhaId,rows[0].id,u.id]);
    return rows[0];
  });
  res.status(201).json(resultado);
});

router.put('/:id', async (req, res) => {
  if (!pode(req.usuario, 'pessoas.editar')) return res.status(403).json({ erro: 'Você não tem permissão para alterar pessoas.' });
  const p = await buscar(req);
  if (!p) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
  const v = await limpar(req, req.body, p.cidade_id);
  v.data_conversao = v.data_conversao || p.data_conversao;
  await db.query(`UPDATE pessoas SET ${CAMPOS.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${CAMPOS.length + 1}`,
    [...CAMPOS.map(k => v[k]), p.id]);
  res.json({ ok: true });
});

// Etapas do fluxo: convertido → discipulado → batizado; em qualquer etapa a pessoa pode se afastar (e voltar)
router.post('/:id/status', async (req, res) => {
  const u = req.usuario;
  const resultado = await transacao(async client => {
  const p = await pessoa(u, req.params.id, client);
  await client.query('SELECT id FROM pessoas WHERE id = $1 FOR UPDATE', [p.id]);
  const registrar = async destino => client.query(
    `INSERT INTO pessoa_acompanhamentos (pessoa_id,usuario_id,tipo,observacao) VALUES ($1,$2,'ETAPA',$3)`,
    [p.id,u.id, 'Etapa atualizada: ' + p.status + ' → ' + destino]);
  if (!p) throw erro(404,'Pessoa não encontrada.');
  const { status, data_batismo, data_afastamento, motivo } = req.body;

  if (status === 'VOLTOU') {
    if (!pode(u, 'pessoas.editar')) throw erro(403,'Você não tem permissão para alterar pessoas.');
    if (p.status !== 'AFASTADO') throw erro(400,'Esta pessoa não está afastada.');
    await client.query(`UPDATE pessoas SET status = COALESCE(etapa_antes_afastar, 'CONVERTIDO'), etapa_antes_afastar = NULL,
                           data_afastamento = NULL, motivo_afastamento = NULL WHERE id = $1`, [p.id]);
    await registrar(status === 'VOLTOU' ? (p.etapa_antes_afastar || 'CONVERTIDO') : status);
    return { ok: true };
  }
  if (!['CONVERTIDO','DISCIPULADO','BATIZADO','AFASTADO'].includes(status)) throw erro(400,'Etapa inválida.');

  if (status === 'AFASTADO') {
    if (!pode(u, 'pessoas.editar')) throw erro(403,'Você não tem permissão para alterar pessoas.');
    if (p.status === 'AFASTADO') throw erro(400,'Esta pessoa já está como afastada.');
    await client.query(`UPDATE pessoas SET status = 'AFASTADO', etapa_antes_afastar = $1,
                           data_afastamento = COALESCE($2::date, CURRENT_DATE), motivo_afastamento = $3 WHERE id = $4`,
      [p.status, data_afastamento || null, motivo || null, p.id]);
    await registrar(status === 'VOLTOU' ? (p.etapa_antes_afastar || 'CONVERTIDO') : status);
    return { ok: true };
  }

  const limparAfastamento = 'etapa_antes_afastar = NULL, data_afastamento = NULL, motivo_afastamento = NULL';
  if (status === 'BATIZADO') {
    if (!pode(u, 'batismo.registrar')) throw erro(403,'O batismo é registrado pelo Pastor Local.');
    await client.query(`UPDATE pessoas SET status = 'BATIZADO', data_batismo = COALESCE($1::date, CURRENT_DATE), batizado_por = $2, ${limparAfastamento} WHERE id = $3`,
      [data_batismo || null, u.id, p.id]);
  } else {
    if (!pode(u, 'pessoas.editar')) throw erro(403,'Você não tem permissão para alterar pessoas.');
    await client.query(`UPDATE pessoas SET status = $1, data_batismo = NULL, batizado_por = NULL, ${limparAfastamento} WHERE id = $2`, [status, p.id]);
  }
  await registrar(status);
  return { ok: true };
  });
  res.json(resultado);
});

router.delete('/:id', async (req, res) => {
  if (!pode(req.usuario, 'pessoas.excluir')) return res.status(403).json({ erro: 'Você não tem permissão para excluir pessoas.' });
  const p = await buscar(req);
  if (!p) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
  await db.query('DELETE FROM pessoas WHERE id = $1', [p.id]);
  res.json({ ok: true });
});

module.exports = router;
