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
    CREATE UNIQUE INDEX IF NOT EXISTS ux_categorias_ministeriais_ativas
      ON categorias_ministeriais(denominacao_id,COALESCE(cidade_ministerial_id,0),
        COALESCE(congregacao_id,0),modulo,LOWER(nome)) WHERE ativo=TRUE;
    ALTER TABLE tipos_atividades ADD COLUMN IF NOT EXISTS categoria_id BIGINT
      REFERENCES categorias_ministeriais(id) ON DELETE RESTRICT;
    -- A coluna antiga permanece para compatibilidade com dados existentes.
    ALTER TABLE tipos_atividades ALTER COLUMN categoria DROP NOT NULL;
    INSERT INTO categorias_ministeriais
      (denominacao_id,cidade_ministerial_id,congregacao_id,modulo,nome)
    SELECT DISTINCT denominacao_id,cidade_ministerial_id,congregacao_id,'CAMPANHA',
      CASE categoria WHEN 'CULTO' THEN 'Culto' WHEN 'EVENTO' THEN 'Evento' END
    FROM tipos_atividades WHERE categoria_id IS NULL AND categoria IN ('CULTO','EVENTO')
    ON CONFLICT DO NOTHING;
    UPDATE tipos_atividades t SET categoria_id=c.id
    FROM categorias_ministeriais c
    WHERE t.categoria_id IS NULL AND c.denominacao_id=t.denominacao_id
      AND c.cidade_ministerial_id IS NOT DISTINCT FROM t.cidade_ministerial_id
      AND c.congregacao_id IS NOT DISTINCT FROM t.congregacao_id
      AND c.modulo='CAMPANHA'
      AND LOWER(c.nome)=CASE t.categoria WHEN 'CULTO' THEN 'culto' WHEN 'EVENTO' THEN 'evento' END;
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
}

module.exports = initDb;
