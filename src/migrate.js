const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

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
  ['agenda.gerenciar', 'Agenda', 'Criar e alterar eventos da agenda', 10],
  ['config.gerenciar', 'Configurações', 'Alterar listas e opções do sistema', 11],
  ['relatorios.ver', 'Relatórios', 'Ver números e fechamentos', 12]
];

module.exports = async function migrate() {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(4242001)');

    // Primeira subida da v2: guarda as tabelas antigas no schema "legado" (não apaga dados)
    const jaV2 = (await c.query("SELECT to_regclass('public.ide_versao') AS t")).rows[0].t;
    if (!jaV2) {
      const antigas = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows;
      if (antigas.length) {
        await c.query('CREATE SCHEMA IF NOT EXISTS legado');
        for (const { tablename } of antigas) {
          await c.query(`ALTER TABLE public."${tablename}" SET SCHEMA legado`);
        }
        console.log(`[migrate] ${antigas.length} tabelas antigas movidas para o schema "legado".`);
      }
    }

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

    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
};
