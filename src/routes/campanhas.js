const router = require('express').Router();
const db = require('../db');
const { autenticar, exigirNivel, pode } = require('../auth');
const { erro, id, texto, data, pessoa, usuarioDaCidade, transacao } = require('../acompanhamento');
router.use(autenticar, exigirNivel(1, 2, 3, 4));

function escopo(u, alias = 'c') {
  return {
    sql: `${alias}.denominacao_id = $1 AND ($2::bigint IS NULL OR ${alias}.cidade_id = $2)
      AND ($3::bigint IS NULL OR ${alias}.criado_por = $3 OR ${alias}.responsavel_id = $3
        OR EXISTS (SELECT 1 FROM campanha_colaboradores cc WHERE cc.campanha_id = ${alias}.id AND cc.usuario_id = $3))`,
    valores: [u.denominacao_id, u.nivel === 1 ? null : u.cidade_id, u.nivel === 4 ? u.id : null]
  };
}
async function campanha(u, campanhaId, client = db) {
  const e = escopo(u);
  const r = (await client.query(`SELECT c.* FROM campanhas c WHERE ${e.sql} AND c.id = $4`,
    [...e.valores, id(campanhaId)])).rows[0];
  if (!r) throw erro(404, 'Campanha não encontrada.');
  return r;
}
function exigirGestao(u, c) {
  if (!pode(u, 'campanhas.gerenciar') || (u.nivel === 4 && c && String(c.criado_por) !== String(u.id)))
    throw erro(403, 'Você não tem permissão para gerenciar esta campanha.');
}
const RESULTADOS = `LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS alcancadas,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM pessoa_acompanhamentos a WHERE a.pessoa_id = p.id AND a.tipo IN ('CONTATO','VISITA','AULA'))
      OR EXISTS (SELECT 1 FROM visitas v WHERE v.pessoa_id = p.id))::int AS contatadas,
    COUNT(*) FILTER (WHERE p.status IN ('DISCIPULADO','BATIZADO') OR p.etapa_antes_afastar IN ('DISCIPULADO','BATIZADO'))::int AS discipulados,
    COUNT(*) FILTER (WHERE p.status = 'BATIZADO' OR p.data_batismo IS NOT NULL)::int AS batizados,
    COUNT(*) FILTER (WHERE p.responsavel_id IS NULL)::int AS sem_responsavel
  FROM campanha_pessoas cp JOIN pessoas p ON p.id = cp.pessoa_id
  WHERE cp.campanha_id = c.id AND p.denominacao_id = c.denominacao_id AND p.cidade_id = c.cidade_id
    AND ($3::bigint IS NULL OR p.criado_por = $3 OR p.responsavel_id = $3)
) r ON TRUE`;

router.get('/', async (req, res) => {
  const e = escopo(req.usuario);
  const status = req.query.status || null;
  if (status && !['PLANEJADA','EM_ANDAMENTO','CONCLUIDA','CANCELADA'].includes(status)) throw erro(400, 'Situação inválida.');
  const q = texto(req.query.busca, 160, 'Busca');
  const rows = (await db.query(`SELECT c.*, ci.nome AS cidade, u.nome AS responsavel_nome, t.nome AS tipo_nome, r.*,
      (SELECT COUNT(*)::int FROM campanha_colaboradores cc WHERE cc.campanha_id = c.id) AS total_equipe
    FROM campanhas c JOIN cidades ci ON ci.id = c.cidade_id
    LEFT JOIN usuarios u ON u.id = c.responsavel_id LEFT JOIN config_itens t ON t.id = c.tipo_trabalho_id
    ${RESULTADOS} WHERE ${e.sql}
      AND ($4::text IS NULL OR c.status = $4) AND ($5::text IS NULL OR c.nome ILIKE $5)
    ORDER BY c.inicio DESC NULLS LAST, c.id DESC LIMIT 200`,
    [...e.valores, status, q ? '%' + q + '%' : null])).rows;
  res.json({ campanhas: rows, pode_criar: pode(req.usuario, 'campanhas.gerenciar') });
});

// Opções mínimas, sem expor os cadastros e permissões completas dos usuários.
router.get('/opcoes', async (req, res) => {
  const u = req.usuario;
  const cidadeId = u.nivel === 1 ? id(req.query.cidade_id || u.cidade_id, 'Cidade', true) : u.cidade_id;
  const cidades = (await db.query(`SELECT id, nome, estado, prazo_contato_dias FROM cidades
    WHERE denominacao_id = $1 AND ($2::bigint IS NULL OR id = $2) ORDER BY nome`,
    [u.denominacao_id, u.nivel === 1 ? null : u.cidade_id])).rows;
  if (cidadeId && !cidades.some(c => String(c.id) === String(cidadeId))) throw erro(400, 'Cidade inválida.');
  const [equipe, congregacoes, tipos] = await Promise.all([
    db.query(`SELECT id, nome, nivel FROM usuarios WHERE denominacao_id = $1 AND cidade_id = $2
      AND ativo AND nivel BETWEEN 1 AND 4 ORDER BY nome`, [u.denominacao_id, cidadeId]),
    db.query('SELECT id, nome FROM congregacoes WHERE denominacao_id = $1 AND cidade_id = $2 ORDER BY nome', [u.denominacao_id, cidadeId]),
    db.query(`SELECT i.id, i.nome FROM config_itens i WHERE i.denominacao_id = $1
      AND i.tipo = 'TIPO_TRABALHO' AND i.ativo AND (i.cidade_id IS NULL OR i.cidade_id = $2)
      AND NOT EXISTS (SELECT 1 FROM config_desativados d WHERE d.item_id = i.id AND d.cidade_id = $2) ORDER BY i.nome`,
      [u.denominacao_id, cidadeId])
  ]);
  res.json({ cidades, equipe: equipe.rows, congregacoes: congregacoes.rows, tipos: tipos.rows, cidade_id: cidadeId });
});

router.get('/:id', async (req, res) => {
  const u = req.usuario;
  const c = await campanha(u, req.params.id);
  const e = escopo(u);
  const [equipe, congregacoes, pessoas, resultados] = await Promise.all([
    db.query('SELECT cc.usuario_id AS id, u.nome FROM campanha_colaboradores cc JOIN usuarios u ON u.id = cc.usuario_id WHERE cc.campanha_id = $1 ORDER BY u.nome', [c.id]),
    db.query('SELECT cg.congregacao_id AS id, g.nome FROM campanha_congregacoes cg JOIN congregacoes g ON g.id = cg.congregacao_id WHERE cg.campanha_id = $1 ORDER BY g.nome', [c.id]),
    db.query(`SELECT p.id, p.nome, p.status, p.responsavel_id, u.nome AS responsavel_nome, p.proxima_acao, p.proxima_acao_data, g.nome AS congregacao
      FROM campanha_pessoas cp JOIN pessoas p ON p.id = cp.pessoa_id LEFT JOIN usuarios u ON u.id = p.responsavel_id
      LEFT JOIN congregacoes g ON g.id = p.congregacao_id WHERE cp.campanha_id = $1
      AND p.denominacao_id = $2 AND p.cidade_id = $3
      AND ($4::bigint IS NULL OR p.criado_por = $4 OR p.responsavel_id = $4) ORDER BY p.nome`,
      [c.id, u.denominacao_id, c.cidade_id, u.nivel === 4 ? u.id : null]),
    db.query(`SELECT r.* FROM campanhas c ${RESULTADOS} WHERE ${e.sql} AND c.id = $4`, [...e.valores, c.id])
  ]);
  res.json({ ...c, equipe: equipe.rows, congregacoes: congregacoes.rows, pessoas: pessoas.rows, resultados: resultados.rows[0],
    pode_editar: pode(u, 'campanhas.gerenciar') && (u.nivel !== 4 || String(c.criado_por) === String(u.id)),
    pode_vincular: pode(u, 'pessoas.cadastrar') });
});

async function salvar(req, existente) {
  const u = req.usuario;
  exigirGestao(u, existente);
  const b = req.body;
  const cidadeId = existente ? existente.cidade_id : (u.nivel === 1 ? id(b.cidade_id || u.cidade_id, 'Cidade') : id(u.cidade_id, 'Cidade'));
  const cidade = (await db.query('SELECT id FROM cidades WHERE id = $1 AND denominacao_id = $2', [cidadeId, u.denominacao_id])).rows[0];
  if (!cidade) throw erro(400, 'Cidade inválida.');
  const v = {
    nome: texto(b.nome, 160, 'Nome da campanha', true), local: texto(b.local, 200, 'Local', true),
    descricao: texto(b.descricao, 4000, 'Descrição'), inicio: data(b.inicio, 'Data de início', true), fim: data(b.fim, 'Data final'),
    status: b.status || 'PLANEJADA', recorrencia: b.recorrencia || 'UNICA',
    tipo: id(b.tipo_trabalho_id, 'Tipo de campanha', true)
  };
  if (v.fim && v.fim < v.inicio) throw erro(400, 'A data final deve ser igual ou posterior ao início.');
  if (!['PLANEJADA','EM_ANDAMENTO','CONCLUIDA','CANCELADA'].includes(v.status)) throw erro(400, 'Situação inválida.');
  if (!['UNICA','SEMANAL','QUINZENAL','MENSAL'].includes(v.recorrencia)) throw erro(400, 'Recorrência inválida.');
  const lista = (valor, nome) => {
    if (!Array.isArray(valor) || valor.length > 200) throw erro(400, nome + ' inválida.');
    return [...new Set(valor.map(k => id(k, nome)))];
  };
  const equipe = lista(b.equipe_ids || [], 'Equipe'), congregacoes = lista(b.congregacao_ids || [], 'Congregações');
  return transacao(async client => {
    const responsavel = await usuarioDaCidade(u, b.responsavel_id || u.id, cidadeId, client);
    if (u.nivel === 4 && responsavel !== String(u.id)) throw erro(403, 'Crie campanhas sob sua responsabilidade.');
    if (!equipe.includes(responsavel)) equipe.push(responsavel);
    const er = await client.query(`SELECT id FROM usuarios WHERE id = ANY($1::bigint[]) AND denominacao_id = $2
      AND cidade_id = $3 AND ativo AND nivel BETWEEN 1 AND 4`, [equipe, u.denominacao_id, cidadeId]);
    const gr = await client.query('SELECT id FROM congregacoes WHERE id = ANY($1::bigint[]) AND denominacao_id = $2 AND cidade_id = $3', [congregacoes, u.denominacao_id, cidadeId]);
    if (er.rowCount !== equipe.length || gr.rowCount !== congregacoes.length) throw erro(400, 'Equipe ou congregação de outra cidade.');
    if (v.tipo && !(await client.query(`SELECT 1 FROM config_itens i WHERE id = $1 AND denominacao_id = $2
      AND tipo = 'TIPO_TRABALHO' AND ativo AND (cidade_id IS NULL OR cidade_id = $3)
      AND NOT EXISTS (SELECT 1 FROM config_desativados d WHERE d.item_id = i.id AND d.cidade_id = $3)`,
      [v.tipo, u.denominacao_id, cidadeId])).rowCount) throw erro(400, 'Tipo de campanha inválido.');
    const valores = [v.nome,v.local,v.descricao,v.inicio,v.fim,v.status,v.recorrencia,v.tipo,responsavel];
    let campanhaId = existente?.id;
    if (existente) {
      // Serializa edições da mesma campanha antes de substituir a equipe.
      await client.query('SELECT id FROM campanhas WHERE id = $1 FOR UPDATE', [campanhaId]);
      await client.query(`UPDATE campanhas SET nome=$1, local=$2, descricao=$3, inicio=$4, fim=$5, status=$6,
        recorrencia=$7, tipo_trabalho_id=$8, responsavel_id=$9 WHERE id=$10`, [...valores, campanhaId]);
    } else {
      campanhaId = (await client.query(`INSERT INTO campanhas (nome,local,descricao,inicio,fim,status,recorrencia,tipo_trabalho_id,responsavel_id,denominacao_id,cidade_id,criado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [...valores,u.denominacao_id,cidadeId,u.id])).rows[0].id;
    }
    await client.query('DELETE FROM campanha_colaboradores WHERE campanha_id = $1', [campanhaId]);
    await client.query('DELETE FROM campanha_congregacoes WHERE campanha_id = $1', [campanhaId]);
    await client.query(`INSERT INTO campanha_colaboradores (campanha_id,usuario_id) SELECT $1, unnest($2::bigint[])`, [campanhaId,equipe]);
    await client.query(`INSERT INTO campanha_congregacoes (campanha_id,congregacao_id) SELECT $1, unnest($2::bigint[])`, [campanhaId,congregacoes]);
    return { id: campanhaId };
  });
}
router.post('/', async (req, res) => res.status(201).json(await salvar(req)));
router.put('/:id', async (req, res) => res.json(await salvar(req, await campanha(req.usuario, req.params.id))));

router.post('/:id/pessoas', async (req, res) => {
  const u = req.usuario;
  if (!pode(u, 'pessoas.cadastrar')) throw erro(403, 'Você não tem permissão para registrar pessoas.');
  const c = await campanha(u, req.params.id);
  const p = await pessoa(u, req.body.pessoa_id);
  if (String(p.cidade_id) !== String(c.cidade_id)) throw erro(400, 'A pessoa e a campanha devem ser da mesma cidade.');
  const r = await db.query(`INSERT INTO campanha_pessoas (campanha_id,pessoa_id,registrado_por) VALUES ($1,$2,$3)
    ON CONFLICT DO NOTHING RETURNING pessoa_id`, [c.id,p.id,u.id]);
  res.status(r.rowCount ? 201 : 200).json({ ok: true, ja_vinculada: !r.rowCount });
});
module.exports = router;
