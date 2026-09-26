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
    UPDATE usuarios u SET perfil='PASTOR_PRESIDENTE', cargo='PASTOR_PRESIDENTE', escopo='DENOMINACAO'
    WHERE u.id=(SELECT u2.id FROM usuarios u2 WHERE u2.denominacao_id=u.denominacao_id AND u2.ativo=TRUE AND u2.perfil IN ('ADMIN','MASTER','PASTOR_PRESIDENTE') ORDER BY u2.criado_em,u2.id LIMIT 1)
      AND u.perfil IN ('ADMIN','MASTER','PASTOR_PRESIDENTE');

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
    CREATE TABLE IF NOT EXISTS agenda_eventos (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      cidade_ministerial_id BIGINT REFERENCES cidades_ministeriais(id) ON DELETE CASCADE,
      congregacao_id BIGINT REFERENCES congregacoes(id) ON DELETE SET NULL,
      modulo VARCHAR(20) NOT NULL CHECK (modulo IN ('CAMPANHA','DISCIPULADO','OUTRO')),
      titulo VARCHAR(180) NOT NULL,
      data_evento DATE NOT NULL,
      hora_inicio TIME,
      hora_fim TIME,
      local VARCHAR(200),
      responsavel VARCHAR(160),
      observacoes TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_agenda_eventos_data
      ON agenda_eventos(denominacao_id,data_evento) WHERE ativo=TRUE;

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
    CREATE TABLE IF NOT EXISTS usuario_permissoes (
 usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 permissao_id BIGINT NOT NULL REFERENCES permissoes(id) ON DELETE CASCADE,
 concedido_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
 ativo BOOLEAN NOT NULL DEFAULT TRUE,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(usuario_id,permissao_id)
);
INSERT INTO permissoes(codigo,nome,modulo) VALUES
 ('pastores_locais.cadastrar','Cadastrar/liberar Pastor Local','CONVENCAO'),
 ('resultados.cidades','Visualizar resultados por cidade','RESULTADOS'),
 ('congregacoes.gerenciar','Cadastrar e administrar congregações da cidade','GESTAO_LOCAL'),
 ('campanhas.gerenciar','Cadastrar e administrar campanhas evangelizadoras','CAMPANHAS'),
 ('campanhas.equipe','Cadastrar equipe da campanha','CAMPANHAS'),
 ('discipulado.gerenciar','Administrar acompanhamento e discipulado','DISCIPULADO')
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

    -- Recuperação segura de senha por código enviado ao e-mail cadastrado.
    CREATE TABLE IF NOT EXISTS recuperacoes_senha (
      id BIGSERIAL PRIMARY KEY,
      usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      codigo_hash VARCHAR(64) NOT NULL,
      tentativas INTEGER NOT NULL DEFAULT 0,
      expira_em TIMESTAMPTZ NOT NULL,
      confirmado_em TIMESTAMPTZ,
      usado BOOLEAN NOT NULL DEFAULT FALSE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_recuperacoes_senha_usuario
      ON recuperacoes_senha(usuario_id,criado_em DESC);

    -- Catálogos configurados pela própria denominação, cidade ou congregação.
    CREATE TABLE IF NOT EXISTS tipos_atividades (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      cidade_ministerial_id BIGINT REFERENCES cidades_ministeriais(id) ON DELETE CASCADE,
      congregacao_id BIGINT REFERENCES congregacoes(id) ON DELETE CASCADE,
      categoria VARCHAR(10) NOT NULL CHECK (categoria IN ('CULTO','EVENTO')),
      nome VARCHAR(120) NOT NULL,
      descricao TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (congregacao_id IS NULL OR cidade_ministerial_id IS NOT NULL)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_tipos_atividades_ativos
      ON tipos_atividades(denominacao_id,COALESCE(cidade_ministerial_id,0),
        COALESCE(congregacao_id,0),categoria,LOWER(nome)) WHERE ativo=TRUE;

    -- Categorias configuráveis separadas por Campanha e Discipulado.
    CREATE TABLE IF NOT EXISTS categorias_ministeriais (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      cidade_ministerial_id BIGINT REFERENCES cidades_ministeriais(id) ON DELETE CASCADE,
      congregacao_id BIGINT REFERENCES congregacoes(id) ON DELETE CASCADE,
      modulo VARCHAR(20) NOT NULL CHECK (modulo IN ('CAMPANHA','DISCIPULADO')),
      nome VARCHAR(120) NOT NULL,
      descricao TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (congregacao_id IS NULL OR cidade_ministerial_id IS NOT NULL)
    );
    ALTER TABLE categorias_ministeriais ADD COLUMN IF NOT EXISTS estrutura_aulas BOOLEAN NOT NULL DEFAULT FALSE;
    -- Preferências locais: ocultar uma categoria recebida da denominação ou cidade.
    CREATE TABLE IF NOT EXISTS categorias_ocultas (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      cidade_ministerial_id BIGINT REFERENCES cidades_ministeriais(id) ON DELETE CASCADE,
      congregacao_id BIGINT REFERENCES congregacoes(id) ON DELETE CASCADE,
      categoria_id BIGINT NOT NULL REFERENCES categorias_ministeriais(id) ON DELETE CASCADE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (cidade_ministerial_id IS NOT NULL)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_categorias_ocultas_contexto
      ON categorias_ocultas(denominacao_id,cidade_ministerial_id,
        COALESCE(congregacao_id,0),categoria_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_categorias_ministeriais_ativas
      ON categorias_ministeriais(denominacao_id,COALESCE(cidade_ministerial_id,0),
        COALESCE(congregacao_id,0),modulo,LOWER(nome)) WHERE ativo=TRUE;
    ALTER TABLE tipos_atividades ADD COLUMN IF NOT EXISTS categoria_id BIGINT
      REFERENCES categorias_ministeriais(id) ON DELETE RESTRICT;
    -- A coluna antiga permanece para compatibilidade com dados existentes.
    ALTER TABLE tipos_atividades ALTER COLUMN categoria DROP NOT NULL;
    -- Catálogos legados CULTO/EVENTO não geram categorias automaticamente.
    CREATE UNIQUE INDEX IF NOT EXISTS ux_tipos_atividades_categoria_ativos
      ON tipos_atividades(denominacao_id,COALESCE(cidade_ministerial_id,0),
        COALESCE(congregacao_id,0),categoria_id,LOWER(nome))
      WHERE ativo=TRUE AND categoria_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS planos_discipulado (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      cidade_ministerial_id BIGINT REFERENCES cidades_ministeriais(id) ON DELETE CASCADE,
      congregacao_id BIGINT REFERENCES congregacoes(id) ON DELETE CASCADE,
      nome VARCHAR(160) NOT NULL,
      descricao TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (congregacao_id IS NULL OR cidade_ministerial_id IS NOT NULL)
    );
    ALTER TABLE planos_discipulado ADD COLUMN IF NOT EXISTS tipo_atividade_id BIGINT
      REFERENCES tipos_atividades(id) ON DELETE SET NULL;
    ALTER TABLE planos_discipulado ADD COLUMN IF NOT EXISTS data_prevista DATE;
    ALTER TABLE planos_discipulado ADD COLUMN IF NOT EXISTS hora_prevista TIME;
    ALTER TABLE planos_discipulado ADD COLUMN IF NOT EXISTS local VARCHAR(200);
    ALTER TABLE planos_discipulado ADD COLUMN IF NOT EXISTS roteiro TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_planos_discipulado_ativos
      ON planos_discipulado(denominacao_id,COALESCE(cidade_ministerial_id,0),
        COALESCE(congregacao_id,0),LOWER(nome)) WHERE ativo=TRUE;

    CREATE TABLE IF NOT EXISTS aulas_discipulado (
      id BIGSERIAL PRIMARY KEY,
      plano_id BIGINT NOT NULL REFERENCES planos_discipulado(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL CHECK (ordem>0),
      titulo VARCHAR(180) NOT NULL,
      objetivo TEXT,
      conteudo TEXT,
      duracao_minutos INTEGER CHECK (duracao_minutos IS NULL OR duracao_minutos>0),
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE aulas_discipulado ADD COLUMN IF NOT EXISTS data_prevista DATE;
    ALTER TABLE aulas_discipulado ADD COLUMN IF NOT EXISTS hora_prevista TIME;
    ALTER TABLE aulas_discipulado ADD COLUMN IF NOT EXISTS metodologia TEXT;
    ALTER TABLE aulas_discipulado ADD COLUMN IF NOT EXISTS materiais TEXT;
    ALTER TABLE aulas_discipulado ADD COLUMN IF NOT EXISTS atividade TEXT;
    CREATE INDEX IF NOT EXISTS ix_aulas_discipulado_plano ON aulas_discipulado(plano_id,ordem) WHERE ativo=TRUE;
    INSERT INTO permissoes(codigo,nome,modulo) VALUES
      ('atividades.visualizar','Visualizar tipos de culto e evento','ATIVIDADES'),
      ('atividades.gerenciar','Criar e alterar tipos de culto e evento','ATIVIDADES'),
      ('discipulado.estrutura.visualizar','Visualizar planos e aulas','DISCIPULADO_ESTRUTURA'),
      ('discipulado.estrutura.gerenciar','Criar e alterar planos e aulas','DISCIPULADO_ESTRUTURA')
    ON CONFLICT(codigo) DO NOTHING;
    UPDATE permissoes SET nome='Visualizar categorias e tipos de campanha'
      WHERE codigo='atividades.visualizar';
    UPDATE permissoes SET nome='Configurar categorias e tipos de campanha'
      WHERE codigo='atividades.gerenciar';
    UPDATE permissoes SET nome='Visualizar categorias, tipos, planos e aulas de discipulado'
      WHERE codigo='discipulado.estrutura.visualizar';
    UPDATE permissoes SET nome='Configurar categorias, tipos, planos e aulas de discipulado'
      WHERE codigo='discipulado.estrutura.gerenciar';
  `);

  // Acompanhamento individual do discípulo.
  await db.query(`
-- Acompanhamento individual do discípulo.
    CREATE TABLE IF NOT EXISTS discipulados (
      id BIGSERIAL PRIMARY KEY,
      denominacao_id BIGINT NOT NULL REFERENCES denominacoes(id) ON DELETE CASCADE,
      pessoa_id BIGINT NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
      nivel VARCHAR(40) NOT NULL DEFAULT 'INICIO',
      local_estudo VARCHAR(200),
      situacao VARCHAR(40) NOT NULL DEFAULT 'ATIVO',
      proxima_acao TEXT,
      proxima_data DATE,
      observacoes TEXT,
      iniciado_em DATE NOT NULL DEFAULT CURRENT_DATE,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(denominacao_id,pessoa_id)
    );
    CREATE TABLE IF NOT EXISTS discipulado_visitas (
      id BIGSERIAL PRIMARY KEY,
      discipulado_id BIGINT NOT NULL REFERENCES discipulados(id) ON DELETE CASCADE,
      data_visita DATE NOT NULL DEFAULT CURRENT_DATE,
      tipo VARCHAR(60) NOT NULL DEFAULT 'ACOMPANHAMENTO',
      responsavel VARCHAR(160),
      resumo TEXT,
      situacao_encontrada VARCHAR(120),
      criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_discipulado_pessoa ON discipulados(denominacao_id,pessoa_id);
    CREATE INDEX IF NOT EXISTS ix_discipulado_visitas ON discipulado_visitas(discipulado_id,data_visita DESC);
  `);

  // Planos sem tipo pertencem ao fluxo antigo, anterior à escolha de categoria/tipo.
  // Exclui também as lições desses planos pela chave estrangeira ON DELETE CASCADE.
  await db.query(`DELETE FROM planos_discipulado
    WHERE tipo_atividade_id IS NULL`);

  // Remove o tipo genérico antigo na denominação, sem afetar tipos locais.
  // Uma eventual referência histórica a plano mantém o registro, mas inativo.
  await db.query(`DELETE FROM tipos_atividades t USING categorias_ministeriais c
    WHERE t.categoria_id=c.id AND t.cidade_ministerial_id IS NULL
      AND t.congregacao_id IS NULL AND c.cidade_ministerial_id IS NULL
      AND c.congregacao_id IS NULL AND c.modulo='CAMPANHA'
      AND c.criado_por IS NULL AND c.descricao IS NULL
      AND LOWER(BTRIM(c.nome))='campanha evangelizadora'
      AND LOWER(BTRIM(t.nome))='campanha evangelizadora'
      AND NOT EXISTS (SELECT 1 FROM planos_discipulado p
        WHERE p.tipo_atividade_id=t.id)`);
  await db.query(`UPDATE tipos_atividades t SET ativo=FALSE
    FROM categorias_ministeriais c
    WHERE t.categoria_id=c.id AND t.cidade_ministerial_id IS NULL
      AND t.congregacao_id IS NULL AND c.cidade_ministerial_id IS NULL
      AND c.congregacao_id IS NULL AND c.modulo='CAMPANHA'
      AND c.criado_por IS NULL AND c.descricao IS NULL
      AND LOWER(BTRIM(c.nome))='campanha evangelizadora'
      AND LOWER(BTRIM(t.nome))='campanha evangelizadora'
      AND t.ativo=TRUE`);

  // Apaga a categoria automática quando ela ficou sem tipos; se houver apenas
  // registros históricos inativos, retira a categoria da listagem.
  await db.query(`DELETE FROM categorias_ministeriais c
    WHERE c.modulo='CAMPANHA' AND c.cidade_ministerial_id IS NULL
      AND c.congregacao_id IS NULL AND c.criado_por IS NULL
      AND c.descricao IS NULL
      AND LOWER(BTRIM(c.nome)) IN ('evento','campanha evangelizadora')
      AND NOT EXISTS (SELECT 1 FROM tipos_atividades t WHERE t.categoria_id=c.id)`);
  await db.query(`UPDATE categorias_ministeriais c SET ativo=FALSE
    WHERE c.modulo='CAMPANHA' AND c.criado_por IS NULL
      AND LOWER(BTRIM(c.nome))='evento'
      AND NOT EXISTS (SELECT 1 FROM tipos_atividades t
        WHERE t.categoria_id=c.id AND t.ativo=TRUE)`);
  await db.query(`UPDATE categorias_ministeriais c SET ativo=FALSE
    WHERE c.modulo='CAMPANHA' AND c.cidade_ministerial_id IS NULL
      AND c.congregacao_id IS NULL AND c.criado_por IS NULL
      AND c.descricao IS NULL
      AND LOWER(BTRIM(c.nome))='campanha evangelizadora'
      AND NOT EXISTS (SELECT 1 FROM tipos_atividades t
        WHERE t.categoria_id=c.id AND t.ativo=TRUE)`);
}

module.exports = initDb;
