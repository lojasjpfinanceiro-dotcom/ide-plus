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
    ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
    ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS foto TEXT;
    ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS numero VARCHAR(30);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_pessoas_cpf_denominacao ON pessoas(denominacao_id, cpf) WHERE cpf IS NOT NULL;
  `);
}

module.exports = initDb;
