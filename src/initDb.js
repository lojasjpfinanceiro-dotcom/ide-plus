const db = require('./db');

async function initDb() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS denominacoes (
      id BIGSERIAL PRIMARY KEY,
      nome VARCHAR(160) NOT NULL,
      telefone VARCHAR(30),
      cidade VARCHAR(100),
      estado VARCHAR(2),
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      nome VARCHAR(160) NOT NULL,
      email VARCHAR(180) NOT NULL,
      telefone VARCHAR(30),
      senha_hash TEXT NOT NULL,
      perfil VARCHAR(40) NOT NULL DEFAULT 'ADMIN',
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(denominacao_id, email)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_email_global
      ON usuarios(LOWER(email));

    CREATE TABLE IF NOT EXISTS congregacoes (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      nome VARCHAR(160) NOT NULL,
      cidade VARCHAR(100),
      estado VARCHAR(2),
      endereco TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pessoas (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      congregacao_id BIGINT REFERENCES congregacoes(id) ON DELETE SET NULL,
      nome VARCHAR(180) NOT NULL,
      telefone VARCHAR(30), email VARCHAR(180), data_nascimento DATE,
      cidade VARCHAR(100), bairro VARCHAR(100), endereco TEXT,
      origem VARCHAR(100), observacoes TEXT,
      status VARCHAR(40) NOT NULL DEFAULT 'NOVO_CONTATO',
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_pessoas_denominacao ON pessoas(denominacao_id);

    -- Hierarquia nativa do IDE+: Denominação -> Cidade -> Congregação -> Usuários/Funções.
    CREATE TABLE IF NOT EXISTS cidades_ministeriais (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      nome VARCHAR(120) NOT NULL,
      estado VARCHAR(2),
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(denominacao_id, nome, estado)
    );
    CREATE INDEX IF NOT EXISTS ix_cidades_ministeriais_denominacao ON cidades_ministeriais(denominacao_id);

    ALTER TABLE congregacoes ADD COLUMN IF NOT EXISTS cidade_ministerial_id BIGINT REFERENCES cidades_ministeriais(id) ON DELETE SET NULL;
    ALTER TABLE congregacoes ADD COLUMN IF NOT EXISTS sede BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE congregacoes ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) NOT NULL DEFAULT 'CONGREGACAO';
    ALTER TABLE denominacoes ADD COLUMN IF NOT EXISTS sede_mae_nome VARCHAR(160);
    ALTER TABLE denominacoes ADD COLUMN IF NOT EXISTS sede_mae_cidade VARCHAR(120);
    ALTER TABLE denominacoes ADD COLUMN IF NOT EXISTS sede_mae_estado VARCHAR(2);
    ALTER TABLE denominacoes ADD COLUMN IF NOT EXISTS pastor_presidente VARCHAR(160);
    ALTER TABLE denominacoes ADD COLUMN IF NOT EXISTS pastor_vice_presidente VARCHAR(160);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cidade_ministerial_id BIGINT REFERENCES cidades_ministeriais(id) ON DELETE SET NULL;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS congregacao_id BIGINT REFERENCES congregacoes(id) ON DELETE SET NULL;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(80);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS escopo VARCHAR(30) NOT NULL DEFAULT 'DENOMINACAO';

    CREATE INDEX IF NOT EXISTS ix_congregacoes_cidade_ministerial ON congregacoes(cidade_ministerial_id);
    CREATE INDEX IF NOT EXISTS ix_usuarios_cidade_ministerial ON usuarios(cidade_ministerial_id);
    CREATE INDEX IF NOT EXISTS ix_usuarios_congregacao ON usuarios(congregacao_id);

    -- Cargos e permissões configuráveis. Nenhuma tabela existente é apagada.
    CREATE TABLE IF NOT EXISTS cargos (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      nome VARCHAR(120) NOT NULL,
      nivel VARCHAR(30) NOT NULL DEFAULT 'CONGREGACAO',
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(denominacao_id,nome,nivel)
    );
    CREATE TABLE IF NOT EXISTS permissoes (
      id BIGSERIAL PRIMARY KEY,
      codigo VARCHAR(100) NOT NULL UNIQUE,
      nome VARCHAR(160) NOT NULL,
      modulo VARCHAR(60) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cargo_permissoes (
      cargo_id BIGINT NOT NULL REFERENCES cargos(id) ON DELETE CASCADE,
      permissao_id BIGINT NOT NULL REFERENCES permissoes(id) ON DELETE CASCADE,
      PRIMARY KEY(cargo_id,permissao_id)
    );
    CREATE TABLE IF NOT EXISTS usuario_cargos (
      usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      cargo_id BIGINT NOT NULL REFERENCES cargos(id) ON DELETE CASCADE,
      cidade_ministerial_id BIGINT REFERENCES cidades_ministeriais(id) ON DELETE CASCADE,
      congregacao_id BIGINT REFERENCES congregacoes(id) ON DELETE CASCADE,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(usuario_id,cargo_id)
    );
    INSERT INTO permissoes(codigo,nome,modulo) VALUES
      ('cidades.visualizar','Visualizar cidades','CIDADES'),
      ('cidades.inserir','Inserir cidades','CIDADES'),
      ('cidades.editar','Editar cidades','CIDADES'),
      ('cidades.excluir','Excluir/desativar cidades','CIDADES'),
      ('congregacoes.visualizar','Visualizar congregações','CONGREGACOES'),
      ('congregacoes.inserir','Inserir congregações','CONGREGACOES'),
      ('congregacoes.editar','Editar congregações','CONGREGACOES'),
      ('congregacoes.excluir','Excluir/desativar congregações','CONGREGACOES'),
      ('pessoas.visualizar','Visualizar pessoas','PESSOAS'),
      ('pessoas.inserir','Inserir pessoas','PESSOAS'),
      ('pessoas.editar','Editar pessoas','PESSOAS'),
      ('pessoas.excluir','Excluir/desativar pessoas','PESSOAS'),
      ('usuarios.liberar','Liberar acessos de usuários','USUARIOS'),
      ('relatorios.visualizar','Visualizar relatórios','RELATORIOS')
    ON CONFLICT(codigo) DO NOTHING;
    CREATE TABLE IF NOT EXISTS tipos_congregacao (
 id BIGSERIAL PRIMARY KEY, denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
 cidade_ministerial_id BIGINT REFERENCES cidades_ministeriais(id) ON DELETE CASCADE,
 nome VARCHAR(120) NOT NULL, codigo VARCHAR(60) NOT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tipos_congregacao_contexto ON tipos_congregacao(denominacao_id, COALESCE(cidade_ministerial_id,0), LOWER(nome)) WHERE ativo=TRUE;
INSERT INTO permissoes(codigo,nome,modulo) VALUES
 ('configuracoes.visualizar','Visualizar configurações locais','CONFIGURACOES'),
 ('configuracoes.tipos_congregacao','Cadastrar/editar tipos de congregação','CONFIGURACOES')
ON CONFLICT(codigo) DO NOTHING;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
    ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS foto TEXT;
    ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS numero VARCHAR(30);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_pessoas_cpf_denominacao ON pessoas(denominacao_id, cpf) WHERE cpf IS NOT NULL;
  `);
}

module.exports = initDb;
