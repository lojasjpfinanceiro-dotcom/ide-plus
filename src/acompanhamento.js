const db = require('./db');
const { pode } = require('./auth');

const erro = (status, message) => Object.assign(new Error(message), { status });
function id(v, nome = 'Identificador', opcional = false) {
  if ((v === null || v === undefined || v === '') && opcional) return null;
  if (!/^[1-9]\d*$/.test(String(v))) throw erro(400, nome + ' inválido.');
  return String(v);
}
function texto(v, max, nome, obrigatorio = false) {
  const t = String(v ?? '').trim();
  if ((obrigatorio && !t) || t.length > max) throw erro(400, nome + ' inválido.');
  return t || null;
}
function data(v, nome = 'Data', obrigatoria = false) {
  if (!v && !obrigatoria) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw erro(400, nome + ' inválida.');
  const d = new Date(v + 'T12:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw erro(400, nome + ' inválida.');
  return v;
}
// Todos os acessos à pessoa compartilham o mesmo escopo, inclusive pelo cadastro.
function escopoPessoa(u, alias = 'p', inicio = 1) {
  return {
    sql: `${alias}.denominacao_id = $${inicio}
      AND ($${inicio + 1}::bigint IS NULL OR ${alias}.cidade_id = $${inicio + 1})
      AND ($${inicio + 2}::bigint IS NULL OR ${alias}.criado_por = $${inicio + 2} OR ${alias}.responsavel_id = $${inicio + 2})`,
    valores: [u.denominacao_id, u.nivel === 1 ? null : u.cidade_id, u.nivel === 4 ? u.id : null]
  };
}
async function pessoa(u, pessoaId, client = db) {
  const e = escopoPessoa(u);
  const p = (await client.query(`SELECT p.* FROM pessoas p WHERE ${e.sql} AND p.id = $4${client !== db ? ' FOR UPDATE' : ''}`,
    [...e.valores, id(pessoaId)])).rows[0];
  if (!p) throw erro(404, 'Pessoa não encontrada.');
  return p;
}
function podeAcompanhar(u, p) {
  return pode(u, 'discipulado.gerenciar') || (u.nivel === 4 && pode(u, 'acompanhamento.registrar')
    && (String(p.responsavel_id) === String(u.id) || String(p.criado_por) === String(u.id)));
}
async function usuarioDaCidade(u, usuarioId, cidadeId, client = db) {
  const k = id(usuarioId, 'Responsável', true);
  if (!k) return null;
  const r = await client.query(`SELECT id FROM usuarios WHERE id = $1 AND denominacao_id = $2
    AND cidade_id = $3 AND ativo AND nivel BETWEEN 1 AND 4`, [k, u.denominacao_id, cidadeId]);
  if (!r.rowCount) throw erro(400, 'Escolha um responsável ativo da mesma cidade.');
  return k;
}
async function transacao(fn) {
  const c = await db.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
module.exports = { erro, id, texto, data, escopoPessoa, pessoa, podeAcompanhar, usuarioDaCidade, transacao };
