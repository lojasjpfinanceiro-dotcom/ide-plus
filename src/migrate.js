const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const zlib = require('zlib');
const db = require('./db');

// Carrega países, estados e cidades uma única vez (Brasil: lista oficial do IBGE)
async function carregarGeo() {
  const ja = (await db.query('SELECT COUNT(*)::int AS n FROM geo_cidades')).rows[0].n;
  if (ja > 0) return;
  const inicio = Date.now();
  const dados = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'db', 'geo.json.gz'))));
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `INSERT INTO geo_paises (codigo, nome) SELECT * FROM unnest($1::text[], $2::text[]) ON CONFLICT DO NOTHING`,
      [dados.paises.map(p => p[0]), dados.paises.map(p => p[1])]);
    await c.query(
      `INSERT INTO geo_estados (pais, codigo, nome) SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) ON CONFLICT DO NOTHING`,
      [dados.estados.map(e => e[0]), dados.estados.map(e => e[1]), dados.estados.map(e => e[2])]);
    const ids = {};
    for (const r of (await c.query('SELECT id, pais, codigo FROM geo_estados')).rows) ids[r.pais + '|' + r.codigo] = r.id;
    const cidades = dados.cidades.filter(x => ids[x[0] + '|' + x[1]]);
    for (let i = 0; i < cidades.length; i += 10000) {
      const lote = cidades.slice(i, i + 10000);
      await c.query(
        `INSERT INTO geo_cidades (estado_id, nome, ibge) SELECT * FROM unnest($1::int[], $2::text[], $3::int[])`,
        [lote.map(x => ids[x[0] + '|' + x[1]]), lote.map(x => x[2]), lote.map(x => x[3])]);
    }
    await c.query('COMMIT');
    console.log(`[geo] ${dados.paises.length} países, ${dados.estados.length} estados e ${cidades.length} cidades carregados em ${((Date.now() - inicio) / 1000).toFixed(1)}s.`);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

const PERMISSOES = [
  ['estrutura.gerenciar', 'Estrutura', 'Cadastrar cidades e congregações', 1],
  ['usuarios.gerenciar', 'Usuários', 'Cadastrar, alterar e excluir usuários', 2],
  ['cargos.gerenciar', 'Usuários', 'Criar cargos e definir permissões', 3],
  ['pessoas.cadastrar', 'Pessoas', 'Cadastrar convertidos', 4],
  ['pessoas.editar', 'Pessoas', 'Alterar cadastro de convertidos', 5],
  ['pessoas.excluir', 'Pessoas', 'Excluir convertidos', 6],
  ['batismo.registrar', 'Pessoas', 'Registrar batismo', 7],
  ['campanhas.gerenciar', 'Campanhas', 'Criar campanhas e eventos', 8],
  ['discipulado.gerenciar', 'Discipulado', 'Aulas, lições e visitas', 9],
  ['discipulado.curriculo', 'Discipulado', 'Montar currículo, módulos e lições', 10],
  ['discipulado.turmas', 'Discipulado', 'Criar e gerenciar turmas', 11],
  ['agenda.gerenciar', 'Agenda', 'Criar e alterar eventos da agenda', 12],
  ['config.gerenciar', 'Configurações', 'Alterar listas e opções do sistema', 13],
  ['relatorios.ver', 'Relatórios', 'Ver números e fechamentos', 14]
];

module.exports = async function migrate() {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(4242001)');

    // Dados da versão antiga descartados a pedido do responsável (o schema "legado" deixa de existir)
    await c.query('DROP SCHEMA IF EXISTS legado CASCADE');

    await c.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

    for (const [codigo, modulo, descricao, ordem] of PERMISSOES) {
      await c.query(
        `INSERT INTO permissoes (codigo, modulo, descricao, ordem) VALUES ($1,$2,$3,$4)
         ON CONFLICT (codigo) DO UPDATE SET modulo = EXCLUDED.modulo, descricao = EXCLUDED.descricao, ordem = EXCLUDED.ordem`,
        [codigo, modulo, descricao, ordem]
      );
    }

    const temPlano = (await c.query('SELECT 1 FROM planos LIMIT 1')).rowCount;
    if (!temPlano) {
      await c.query(`INSERT INTO planos (nome, preco_mensal, max_congregacoes) VALUES ('Gratuito', 0, 2)`);
    }

    const email = process.env.FORNECEDOR_EMAIL;
    const senha = process.env.FORNECEDOR_SENHA;
    if (email && senha) {
      const existe = (await c.query('SELECT 1 FROM usuarios WHERE nivel = 0 LIMIT 1')).rowCount;
      if (!existe) {
        await c.query(
          `INSERT INTO usuarios (nivel, nome, email, senha_hash) VALUES (0, 'Fornecedor IDE+', $1, $2)`,
          [email.trim().toLowerCase(), await bcrypt.hash(senha, 10)]
        );
        console.log('[migrate] usuário do Nível 0 criado:', email);
      }
    } else {
      console.warn('[migrate] FORNECEDOR_EMAIL/FORNECEDOR_SENHA não definidos — Nível 0 não será criado.');
    }

    // Cidade sede sem pastor local → o Pastor Presidente assume
    await c.query(`
      UPDATE cidades c SET responsavel_id = (
        SELECT u.id FROM usuarios u WHERE u.denominacao_id = c.denominacao_id AND u.nivel = 1 ORDER BY u.id LIMIT 1)
       WHERE c.is_sede AND c.responsavel_id IS NULL`);

    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
  await carregarGeo();
};
