-- IDE+ v2 — estrutura de banco
-- Hierarquia: Denominação → Cidade (com país/estado) → Congregação
-- Níveis: 0 Fornecedor · 1 Pastor Presidente · 2 Pastor Local · 3 Coordenador · 4 Líder/Equipe
-- Idempotente: pode rodar a cada inicialização.

CREATE TABLE IF NOT EXISTS ide_versao (
  versao INTEGER PRIMARY KEY,
  aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ Nível 0: fornecedor, planos e recebíveis ============
CREATE TABLE IF NOT EXISTS planos (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  preco_mensal NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_congregacoes INTEGER,              -- NULL = ilimitado
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS denominacoes (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  logo TEXT,                              -- data URI (imagem reduzida)
  plano_id BIGINT REFERENCES planos(id),
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','SUSPENSO','CANCELADO')),
  contato_nome VARCHAR(160),
  contato_telefone VARCHAR(30),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cobrancas (
  id BIGSERIAL PRIMARY KEY,
  denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
  competencia DATE NOT NULL,              -- primeiro dia do mês
  valor NUMERIC(10,2) NOT NULL,
  vencimento DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA','PAGA','CANCELADA')),
  pago_em DATE,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (denominacao_id, competencia)
);

-- ============ Estrutura ministerial ============
CREATE TABLE IF NOT EXISTS cidades (
  id BIGSERIAL PRIMARY KEY,
  denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
  pais VARCHAR(80) NOT NULL DEFAULT 'Brasil',
  estado VARCHAR(80) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  is_sede BOOLEAN NOT NULL DEFAULT FALSE, -- cidade da igreja sede (Nível 1)
  responsavel_id BIGINT,                  -- Pastor Local (usuário nível 2)
  responsavel_todas BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS congregacoes (
  id BIGSERIAL PRIMARY KEY,
  denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
  cidade_id BIGINT NOT NULL REFERENCES cidades(id) ON DELETE CASCADE,
  nome VARCHAR(160) NOT NULL,
  endereco VARCHAR(200),
  bairro VARCHAR(100),
  is_sede BOOLEAN NOT NULL DEFAULT FALSE,
  responsavel_id BIGINT,                  -- pastor/evangelista/presbítero da congregação
  dirigente_id BIGINT,                    -- dirigente definido pelo Nível 2
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ Usuários, cargos e permissões ============
CREATE TABLE IF NOT EXISTS cargos (
  id BIGSERIAL PRIMARY KEY,
  denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
  cidade_id BIGINT REFERENCES cidades(id) ON DELETE CASCADE, -- NULL = padrão do Nível 1
  nivel SMALLINT NOT NULL CHECK (nivel BETWEEN 1 AND 4),
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  denominacao_id BIGINT REFERENCES denominacoes(id) ON DELETE CASCADE, -- NULL só no Nível 0
  nivel SMALLINT NOT NULL CHECK (nivel BETWEEN 0 AND 4),
  nome VARCHAR(160) NOT NULL,
  email VARCHAR(180) NOT NULL,
  senha_hash VARCHAR(200) NOT NULL,
  telefone VARCHAR(30),
  foto TEXT,
  cidade_id BIGINT REFERENCES cidades(id) ON DELETE SET NULL,
  cargo_id BIGINT REFERENCES cargos(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unq ON usuarios (LOWER(email));

DO $$ BEGIN
  ALTER TABLE cidades ADD CONSTRAINT cidades_resp_fk FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE congregacoes ADD CONSTRAINT congregacoes_resp_fk FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE congregacoes ADD CONSTRAINT congregacoes_dir_fk FOREIGN KEY (dirigente_id) REFERENCES usuarios(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS permissoes (
  codigo VARCHAR(60) PRIMARY KEY,
  modulo VARCHAR(40) NOT NULL,
  descricao VARCHAR(160) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cargo_permissoes (
  cargo_id BIGINT NOT NULL REFERENCES cargos(id) ON DELETE CASCADE,
  codigo VARCHAR(60) NOT NULL REFERENCES permissoes(codigo) ON DELETE CASCADE,
  PRIMARY KEY (cargo_id, codigo)
);

-- Exceção individual: marca acesso sim/não para um usuário específico
CREATE TABLE IF NOT EXISTS usuario_permissoes (
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo VARCHAR(60) NOT NULL REFERENCES permissoes(codigo) ON DELETE CASCADE,
  permitido BOOLEAN NOT NULL,
  PRIMARY KEY (usuario_id, codigo)
);

-- ============ Configurações (padrão do N1, herdado e ampliado pelo N2) ============
CREATE TABLE IF NOT EXISTS config_itens (
  id BIGSERIAL PRIMARY KEY,
  denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
  cidade_id BIGINT REFERENCES cidades(id) ON DELETE CASCADE, -- NULL = padrão do Nível 1
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('COMO_CHEGOU','TIPO_TRABALHO','TIPO_EVENTO','TIPO_VISITA')),
  nome VARCHAR(120) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Item padrão desativado por uma cidade (Nível 2), sem afetar o Nível 1
CREATE TABLE IF NOT EXISTS config_desativados (
  item_id BIGINT NOT NULL REFERENCES config_itens(id) ON DELETE CASCADE,
  cidade_id BIGINT NOT NULL REFERENCES cidades(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, cidade_id)
);

-- ============ Pessoas (convertidos) ============
CREATE TABLE IF NOT EXISTS pessoas (
  id BIGSERIAL PRIMARY KEY,
  denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
  cidade_id BIGINT NOT NULL REFERENCES cidades(id) ON DELETE CASCADE,
  congregacao_id BIGINT REFERENCES congregacoes(id) ON DELETE SET NULL,
  nome VARCHAR(160) NOT NULL,
  foto TEXT,
  cpf VARCHAR(14),
  telefone VARCHAR(30),
  nascimento DATE,
  endereco VARCHAR(200),
  numero VARCHAR(20),
  bairro VARCHAR(100),
  observacao TEXT,
  como_chegou_id BIGINT REFERENCES config_itens(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CONVERTIDO' CHECK (status IN ('CONVERTIDO','DISCIPULADO','BATIZADO')),
  data_conversao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_batismo DATE,
  batizado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  autoriza_dados BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pessoas_cidade_idx ON pessoas (cidade_id, status);

-- ============ Campanhas, agenda e discipulado (telas nas próximas etapas) ============
CREATE TABLE IF NOT EXISTS campanhas (
  id BIGSERIAL PRIMARY KEY,
  denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
  cidade_id BIGINT NOT NULL REFERENCES cidades(id) ON DELETE CASCADE,
  nome VARCHAR(160) NOT NULL,
  tipo_trabalho_id BIGINT REFERENCES config_itens(id) ON DELETE SET NULL,
  inicio DATE,
  fim DATE,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campanha_colaboradores (
  campanha_id BIGINT NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  funcao VARCHAR(100),
  PRIMARY KEY (campanha_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS agenda_eventos (
  id BIGSERIAL PRIMARY KEY,
  denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
  cidade_id BIGINT REFERENCES cidades(id) ON DELETE CASCADE,
  campanha_id BIGINT REFERENCES campanhas(id) ON DELETE SET NULL,
  tipo_evento_id BIGINT REFERENCES config_itens(id) ON DELETE SET NULL,
  titulo VARCHAR(160) NOT NULL,
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ,
  local VARCHAR(200),
  privado BOOLEAN NOT NULL DEFAULT FALSE,  -- agenda privada do Nível 1
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS licoes (
  id BIGSERIAL PRIMARY KEY,
  denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
  cidade_id BIGINT REFERENCES cidades(id) ON DELETE CASCADE, -- NULL = padrão do Nível 1
  ordem INTEGER NOT NULL DEFAULT 1,
  titulo VARCHAR(160) NOT NULL,
  resumo TEXT,
  slides_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS discipulados (
  id BIGSERIAL PRIMARY KEY,
  pessoa_id BIGINT NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  discipulador_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  concluido_em DATE,
  token_aluno VARCHAR(40) UNIQUE,           -- link pessoal do aluno, sem senha
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discipulado_aulas (
  id BIGSERIAL PRIMARY KEY,
  discipulado_id BIGINT NOT NULL REFERENCES discipulados(id) ON DELETE CASCADE,
  licao_id BIGINT REFERENCES licoes(id) ON DELETE SET NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  presente BOOLEAN NOT NULL DEFAULT TRUE,
  observacao TEXT
);

CREATE TABLE IF NOT EXISTS visitas (
  id BIGSERIAL PRIMARY KEY,
  pessoa_id BIGINT NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo_visita_id BIGINT REFERENCES config_itens(id) ON DELETE SET NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao TEXT
);

INSERT INTO ide_versao (versao) VALUES (2) ON CONFLICT DO NOTHING;

-- ============ Base geográfica (países, estados e cidades para seleção) ============
CREATE TABLE IF NOT EXISTS geo_paises (
  codigo CHAR(2) PRIMARY KEY,           -- ISO 3166-1 (BR, US, PT…)
  nome VARCHAR(120) NOT NULL
);
CREATE TABLE IF NOT EXISTS geo_estados (
  id SERIAL PRIMARY KEY,
  pais CHAR(2) NOT NULL REFERENCES geo_paises(codigo),
  codigo VARCHAR(10) NOT NULL,          -- sigla (PE, SP…) ou código ISO
  nome VARCHAR(120) NOT NULL,
  UNIQUE (pais, codigo)
);
CREATE TABLE IF NOT EXISTS geo_cidades (
  id SERIAL PRIMARY KEY,
  estado_id INTEGER NOT NULL REFERENCES geo_estados(id),
  nome VARCHAR(160) NOT NULL,
  ibge INTEGER                           -- código IBGE (municípios do Brasil)
);
CREATE INDEX IF NOT EXISTS geo_cidades_estado_idx ON geo_cidades (estado_id, nome);

ALTER TABLE cidades ADD COLUMN IF NOT EXISTS geo_cidade_id INTEGER REFERENCES geo_cidades(id);

-- ============ Login por CPF (Brasil) ou e-mail (fora do país) ============
ALTER TABLE usuarios ALTER COLUMN email DROP NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cpf VARCHAR(11);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fora_do_brasil BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS trocar_senha BOOLEAN NOT NULL DEFAULT FALSE;   -- senha provisória
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tentativas_login SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_ate TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_cpf_unq ON usuarios (cpf) WHERE cpf IS NOT NULL;

-- ============ Afastados ============
ALTER TABLE pessoas DROP CONSTRAINT IF EXISTS pessoas_status_check;
ALTER TABLE pessoas ADD CONSTRAINT pessoas_status_check CHECK (status IN ('CONVERTIDO','DISCIPULADO','BATIZADO','AFASTADO'));
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS etapa_antes_afastar VARCHAR(20);  -- etapa em que estava quando se afastou
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS data_afastamento DATE;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS motivo_afastamento TEXT;
