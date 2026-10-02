-- Dados de teste para Nível 4 (Meus planos)

-- Se não houver denominação, criar uma
INSERT INTO denominacoes (nome, status, contato_nome, contato_telefone)
SELECT 'Assembleia de Deus', 'ATIVO', 'Pr Ailton', '85987654321'
WHERE NOT EXISTS (SELECT 1 FROM denominacoes WHERE nome = 'Assembleia de Deus')
RETURNING id INTO denom_id;

-- Fallback se não tiver retornado
DO $$
DECLARE
  denom_id BIGINT;
BEGIN
  SELECT id INTO denom_id FROM denominacoes WHERE nome = 'Assembleia de Deus' LIMIT 1;
  
  IF denom_id IS NULL THEN
    INSERT INTO denominacoes (nome, status, contato_nome, contato_telefone)
    VALUES ('Assembleia de Deus', 'ATIVO', 'Pr Ailton', '85987654321')
    RETURNING id INTO denom_id;
  END IF;

  -- Cidade
  INSERT INTO cidades (denominacao_id, pais, estado, nome, is_sede)
  SELECT denom_id, 'Brasil', 'Ceará', 'Fortaleza', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM cidades WHERE denominacao_id = denom_id AND nome = 'Fortaleza');

  -- Currículos de teste
  INSERT INTO curriculos (denominacao_id, nome, descricao, frequencia_minima, nota_minima, tentativas_prova, criado_por)
  SELECT denom_id, 'Novos Convertidos', 'Discipulado básico para novos convertidos', 75, 70, 2, NULL
  WHERE NOT EXISTS (SELECT 1 FROM curriculos WHERE denominacao_id = denom_id AND nome = 'Novos Convertidos');

  INSERT INTO curriculos (denominacao_id, nome, descricao, frequencia_minima, nota_minima, tentativas_prova, criado_por)
  SELECT denom_id, 'Crescimento Espiritual', 'Aprofundamento na fé cristã e práticas espirituais', 80, 75, 2, NULL
  WHERE NOT EXISTS (SELECT 1 FROM curriculos WHERE denominacao_id = denom_id AND nome = 'Crescimento Espiritual');

  INSERT INTO curriculos (denominacao_id, nome, descricao, frequencia_minima, nota_minima, tentativas_prova, criado_por)
  SELECT denom_id, 'Liderança Cristã', 'Treinamento para líderes e obreiros da igreja', 85, 75, 3, NULL
  WHERE NOT EXISTS (SELECT 1 FROM curriculos WHERE denominacao_id = denom_id AND nome = 'Liderança Cristã');

END $$;
