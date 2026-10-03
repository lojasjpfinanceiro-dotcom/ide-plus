const router = require('express').Router();
const db = require('../db');
const { autenticar, exigirNivel, pode } = require('../auth');
const { erro, id, texto, data, escopoPessoa, pessoa, podeAcompanhar, usuarioDaCidade, transacao } = require('../acompanhamento');
router.use(autenticar, exigirNivel(1,2,3,4));
const TIPOS = ['CONTATO','VISITA','AULA','OBSERVACAO'];
const CONTATO = `GREATEST(
  (SELECT MAX(a.data) FROM pessoa_acompanhamentos a WHERE a.pessoa_id = p.id AND a.tipo IN ('CONTATO','VISITA','AULA')),
  (SELECT MAX(v.data) FROM visitas v WHERE v.pessoa_id = p.id),
  (SELECT MAX(da.data) FROM discipulado_aulas da JOIN discipulados d ON d.id = da.discipulado_id WHERE d.pessoa_id = p.id AND da.presente),
  (SELECT MAX(am.data_aula) FROM presenca_aulas pa JOIN inscricoes_turma it ON it.id = pa.inscricao_id JOIN aulas_ministradas am ON am.id = pa.aula_id WHERE it.pessoa_id = p.id AND pa.presente)
)`;
router.get('/', async (req,res) => {
  const e = escopoPessoa(req.usuario);
  const filtro = req.query.filtro || 'PENDENTES';
  if (!['PENDENTES','TODOS','SEM_RESPONSAVEL','PRIMEIRO_CONTATO','ATRASADOS'].includes(filtro)) throw erro(400, 'Filtro inválido.');
  const busca = texto(req.query.busca,160,'Busca');
  const rows = (await db.query(`WITH base AS (
    SELECT p.id,p.nome,p.status,p.cidade_id,p.congregacao_id,p.responsavel_id,p.proxima_acao,p.proxima_acao_data,
      p.data_conversao,u.nome AS responsavel_nome,g.nome AS congregacao,c.nome AS cidade,
      c.prazo_contato_dias,${CONTATO} AS ultimo_contato
    FROM pessoas p JOIN cidades c ON c.id = p.cidade_id LEFT JOIN usuarios u ON u.id = p.responsavel_id
      LEFT JOIN congregacoes g ON g.id = p.congregacao_id WHERE ${e.sql}
    ), marcadas AS (
    SELECT *, responsavel_id IS NULL AS sem_responsavel,
      (status NOT IN ('AFASTADO','BATIZADO') AND ultimo_contato IS NULL) AS aguardando_contato,
      (status NOT IN ('AFASTADO','BATIZADO') AND ultimo_contato IS NULL AND CURRENT_DATE > data_conversao + prazo_contato_dias) AS contato_atrasado,
      (status NOT IN ('AFASTADO','BATIZADO') AND proxima_acao_data < CURRENT_DATE) AS acao_atrasada
    FROM base
    ) SELECT * FROM marcadas WHERE ($4::text IS NULL OR nome ILIKE $4)
      AND ($5 = 'TODOS' OR ($5 = 'PENDENTES' AND status NOT IN ('AFASTADO','BATIZADO')
        AND (sem_responsavel OR aguardando_contato OR acao_atrasada OR proxima_acao_data IS NULL))
        OR ($5 = 'SEM_RESPONSAVEL' AND sem_responsavel AND status NOT IN ('AFASTADO','BATIZADO'))
        OR ($5 = 'PRIMEIRO_CONTATO' AND aguardando_contato)
        OR ($5 = 'ATRASADOS' AND (acao_atrasada OR contato_atrasado)))
    ORDER BY acao_atrasada DESC,contato_atrasado DESC,sem_responsavel DESC,proxima_acao_data NULLS FIRST,nome LIMIT 500`,
    [...e.valores,busca ? '%'+busca+'%' : null,filtro])).rows;
  res.json({ pessoas: rows });
});
router.put('/prazo', async (req,res) => {
  const u = req.usuario;
  if (u.nivel > 2 || !pode(u,'config.gerenciar')) throw erro(403,'Somente a administração ou gestão local pode ajustar o prazo.');
  const cidadeId = u.nivel === 1 ? id(req.body.cidade_id,'Cidade') : u.cidade_id;
  const prazo = Number(req.body.dias);
  if (!Number.isInteger(prazo) || prazo < 1 || prazo > 90) throw erro(400,'Informe um prazo entre 1 e 90 dias.');
  const r = await db.query('UPDATE cidades SET prazo_contato_dias = $1 WHERE id = $2 AND denominacao_id = $3 RETURNING id',
    [prazo,cidadeId,u.denominacao_id]);
  if (!r.rowCount) throw erro(404,'Cidade não encontrada.');
  res.json({ok:true});
});
router.get('/pessoas/:id', async (req,res) => {
  const u = req.usuario, p = await pessoa(u,req.params.id);
  const [historico,campanhas,detalhe] = await Promise.all([
    db.query(`SELECT * FROM (
      SELECT a.id::text AS id,a.tipo,a.data,a.observacao,u.nome AS usuario_nome,a.criado_em FROM pessoa_acompanhamentos a
      LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE a.pessoa_id = $1
      UNION ALL SELECT 'visita-' || v.id,'VISITA',v.data,COALESCE(v.observacao,'Visita registrada'),u.nome,v.data::timestamptz
      FROM visitas v LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE v.pessoa_id = $1
    ) h ORDER BY data DESC,criado_em DESC LIMIT 100`,[p.id]),
    db.query(`SELECT c.id,c.nome,cp.registrado_em FROM campanha_pessoas cp JOIN campanhas c ON c.id = cp.campanha_id
      WHERE cp.pessoa_id = $1 AND c.denominacao_id = $2 AND c.cidade_id = $3 ORDER BY cp.registrado_em`,
      [p.id,u.denominacao_id,p.cidade_id]),
    db.query(`SELECT u.nome AS responsavel_nome,g.nome AS congregacao,c.nome AS cidade,${CONTATO} AS ultimo_contato
      FROM pessoas p JOIN cidades c ON c.id=p.cidade_id LEFT JOIN usuarios u ON u.id=p.responsavel_id
      LEFT JOIN congregacoes g ON g.id=p.congregacao_id WHERE p.id=$1`,[p.id])
  ]);
  res.json({pessoa:{...p,...detalhe.rows[0]},historico:historico.rows,campanhas:campanhas.rows,
    pode_registrar:podeAcompanhar(u,p),pode_encaminhar:u.nivel<=3 && pode(u,'discipulado.gerenciar')});
});
router.put('/pessoas/:id/plano', async (req,res) => {
  const u = req.usuario;
  await transacao(async client => {
    const p = await pessoa(u,req.params.id,client);
    if (!podeAcompanhar(u,p)) throw erro(403,'Você não tem permissão para acompanhar esta pessoa.');
    const acao = texto(req.body.proxima_acao,200,'Próxima ação'), quando = data(req.body.proxima_acao_data,'Data da próxima ação');
    if (!!acao !== !!quando) throw erro(400,'Informe a ação e a data juntas, ou deixe ambas vazias.');
    let responsavel = p.responsavel_id;
    if (Object.prototype.hasOwnProperty.call(req.body,'responsavel_id')) {
      if (u.nivel === 4 && String(req.body.responsavel_id || '') !== String(p.responsavel_id || ''))
        throw erro(403,'Somente a coordenação pode trocar o responsável.');
      responsavel = await usuarioDaCidade(u,req.body.responsavel_id,p.cidade_id,client);
    }
    await client.query('UPDATE pessoas SET responsavel_id=$1,proxima_acao=$2,proxima_acao_data=$3 WHERE id=$4',[responsavel,acao,quando,p.id]);
    await client.query(`INSERT INTO pessoa_acompanhamentos (pessoa_id,usuario_id,tipo,observacao)
      VALUES ($1,$2,'ENCAMINHAMENTO',$3)`,[p.id,u.id, 'Plano atualizado. ' + (acao ? 'Próxima ação: '+acao+' em '+quando+'.' : 'Sem próxima ação agendada.')]);
  });
  res.json({ok:true});
});
router.post('/pessoas/:id/registros', async (req,res) => {
  const u=req.usuario,b=req.body;
  if (!TIPOS.includes(b.tipo)) throw erro(400,'Tipo de registro inválido.');
  const quando=data(b.data,'Data do registro',true),observacao=texto(b.observacao,4000,'Descrição do acompanhamento',true);
  const hoje = new Date().toLocaleDateString('en-CA',{timeZone:'America/Recife'});
  if (quando>hoje) throw erro(400,'Registre atividades realizadas até hoje. Use o plano para agendar.');
  const resultado=await transacao(async client => {
    const p=await pessoa(u,req.params.id,client);
    if (!podeAcompanhar(u,p)) throw erro(403,'Você não tem permissão para acompanhar esta pessoa.');
    const acao=texto(b.proxima_acao,200,'Próxima ação'),proxima=data(b.proxima_acao_data,'Próxima data');
    if (!!acao !== !!proxima) throw erro(400,'Informe a próxima ação e sua data juntas.');
    if (proxima && proxima<quando) throw erro(400,'A próxima ação não pode anteceder o registro.');
    if (b.tipo==='VISITA') {
      await client.query('INSERT INTO visitas (pessoa_id,usuario_id,data,observacao) VALUES ($1,$2,$3,$4)',[p.id,u.id,quando,observacao]);
    } else {
      await client.query('INSERT INTO pessoa_acompanhamentos (pessoa_id,usuario_id,tipo,data,observacao) VALUES ($1,$2,$3,$4,$5)',[p.id,u.id,b.tipo,quando,observacao]);
    }
    if (acao || b.concluir_acao === true) {
      await client.query('UPDATE pessoas SET proxima_acao=$1,proxima_acao_data=$2 WHERE id=$3',[acao,proxima,p.id]);
    }
    return {ok:true};
  });
  res.status(201).json(resultado);
});
module.exports=router;
