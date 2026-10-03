// Nível 4: Professor/Líder — Turmas, Alunos, Aulas e Acompanhamento
// Recursos completos para gerenciar aulas, presença, provas e diplomas.
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db');
const { autenticar, pode, exigirNivel } = require('../auth');
const { erro, id, transacao } = require('../acompanhamento');

const SEGREDO = () => process.env.JWT_SECRET || 'dev-inseguro';

// ======================== Autenticação e Acesso ========================
router.use(autenticar, exigirNivel(1,2,3,4));

// Carrega turma com verificação de acesso (professor ou coordenador)
async function carregarTurma(u, turmaId) {
  const turma = (await db.query(
    `SELECT t.*, cur.nome AS curriculo_nome, c.nome AS congregacao_nome
       FROM turmas t
       LEFT JOIN congregacoes c ON c.id = t.congregacao_id
       LEFT JOIN curriculos cur ON cur.id = t.curriculo_id
      WHERE t.id = $1 AND t.denominacao_id = $2 AND t.cidade_id = $3`,
    [turmaId, u.denominacao_id, u.cidade_id]
  )).rows[0];
  
  if (!turma) return null;
  
  // Professor da turma ou Coordenador (nível 3) podem acessar
  const ehProfessor = String(turma.professor_id) === String(u.id) || String(turma.co_professor_id) === String(u.id);
  const ehCoordenador = u.nivel <= 3 && pode(u, 'discipulado.turmas');
  
  return ehProfessor || ehCoordenador ? turma : null;
}

// ======================== TURMAS ========================

// Listar turmas do professor
router.get('/turmas', async (req, res) => {
  const u = req.usuario;
  if (u.nivel > 4) return res.status(403).json({ erro: 'Acesso restrito.' });
  
  const query = u.nivel === 4
    ? `SELECT t.*, u.nome AS professor_nome, cu.nome AS curriculo_nome, COUNT(it.id)::int AS total_alunos
         FROM turmas t
         JOIN usuarios u ON u.id = t.professor_id
         JOIN curriculos cu ON cu.id = t.curriculo_id
         LEFT JOIN inscricoes_turma it ON it.turma_id = t.id AND it.status IN ('ATIVO','INSCRITO')
        WHERE t.denominacao_id = $1 AND t.cidade_id = $2 AND (t.professor_id = $3 OR t.co_professor_id = $3)
        GROUP BY t.id, u.nome, cu.nome
        ORDER BY t.data_inicio DESC`
    : `SELECT t.*, u.nome AS professor_nome, cu.nome AS curriculo_nome, COUNT(it.id)::int AS total_alunos
         FROM turmas t
         JOIN usuarios u ON u.id = t.professor_id
         JOIN curriculos cu ON cu.id = t.curriculo_id
         LEFT JOIN inscricoes_turma it ON it.turma_id = t.id AND it.status IN ('ATIVO','INSCRITO')
        WHERE t.denominacao_id = $1 AND t.cidade_id = $2
        GROUP BY t.id, u.nome, cu.nome
        ORDER BY t.data_inicio DESC`;
  
  const { rows } = await db.query(query, u.nivel === 4 ? [u.denominacao_id, u.cidade_id, u.id] : [u.denominacao_id, u.cidade_id]);
  res.json({ turmas: rows });
});

// Criar turma
router.post('/turmas', async (req, res) => {
  const u = req.usuario;
  if (u.nivel > 4) return res.status(403).json({ erro: 'Acesso restrito.' });
  if (!pode(u,'discipulado.turmas')) throw erro(403,'Você não tem permissão para criar turmas.');
  
  const { curriculo_id, congregacao_id, nome, professor_id, co_professor_id, data_inicio, data_fim, minimo_alunos } = req.body;
  
  if (!curriculo_id || !nome) return res.status(400).json({ erro: 'Informe currículo e nome da turma.' });
  
  // Nível 4: cria turma própria. Nível 3: pode criar para qualquer professor
  const prof_id = u.nivel === 4 ? u.id : (professor_id || u.id);
  const valido = await db.query(`SELECT 1 FROM curriculos WHERE id=$1 AND denominacao_id=$2
    AND (cidade_id IS NULL OR cidade_id=$3)`,[curriculo_id,u.denominacao_id,u.cidade_id]);
  if (!valido.rowCount) throw erro(400,'Currículo de outra cidade ou denominação.');
  const professor = await db.query(`SELECT 1 FROM usuarios WHERE id=$1 AND denominacao_id=$2 AND cidade_id=$3 AND ativo`,
    [prof_id,u.denominacao_id,u.cidade_id]);
  if (!professor.rowCount) throw erro(400,'Professor inválido.');
  if (co_professor_id && !(await db.query('SELECT 1 FROM usuarios WHERE id=$1 AND denominacao_id=$2 AND cidade_id=$3 AND ativo',
    [co_professor_id,u.denominacao_id,u.cidade_id])).rowCount) throw erro(400,'Professor auxiliar inválido.');
  if (congregacao_id && !(await db.query('SELECT 1 FROM congregacoes WHERE id=$1 AND denominacao_id=$2 AND cidade_id=$3',
    [congregacao_id,u.denominacao_id,u.cidade_id])).rowCount) throw erro(400,'Congregação de outra cidade.');
  
  try {
    const { rows } = await db.query(
      `INSERT INTO turmas (denominacao_id, cidade_id, congregacao_id, curriculo_id, nome, professor_id, co_professor_id, 
                           data_inicio, data_fim, minimo_alunos, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [u.denominacao_id, u.cidade_id, congregacao_id || null, curriculo_id, nome, prof_id, co_professor_id || null,
       data_inicio || new Date().toISOString().split('T')[0], data_fim || null, minimo_alunos || 2, u.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Turma com esse nome já existe.' });
    throw e;
  }
});

// Atualizar turma
router.put('/turmas/:id', async (req, res) => {
  const u = req.usuario;
  const turma = await carregarTurma(u, req.params.id);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
  if (u.nivel === 4 && String(turma.professor_id) !== String(u.id)) 
    return res.status(403).json({ erro: 'Apenas o professor pode alterar.' });
  
  const { nome, data_fim, status, minimo_alunos } = req.body;
  
  await db.query(
    `UPDATE turmas SET nome = COALESCE($1, nome), data_fim = COALESCE($2, data_fim), 
                      status = COALESCE($3, status), minimo_alunos = COALESCE($4, minimo_alunos) 
     WHERE id = $5`,
    [nome, data_fim || null, status, minimo_alunos || null, turma.id]
  );
  res.json({ ok: true });
});

// Deletar turma (apenas se em planejamento)
router.delete('/turmas/:id', async (req, res) => {
  const u = req.usuario;
  const turma = await carregarTurma(u, req.params.id);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
  if (turma.status !== 'PLANEJAMENTO') return res.status(400).json({ erro: 'Só turmas em planejamento podem ser deletadas.' });
  
  await db.query('DELETE FROM turmas WHERE id = $1', [turma.id]);
  res.json({ ok: true });
});

// ======================== INSCRIÇÕES E ALUNOS ========================

// Listar alunos da turma
router.get('/turmas/:id/alunos', async (req, res) => {
  const u = req.usuario;
  const turma = await carregarTurma(u, req.params.id);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
  
  const { rows } = await db.query(
    `SELECT it.id, p.nome, p.cpf, p.telefone, p.foto, it.status, it.presenca_total_aulas, it.nota_prova,
            it.tentativas_prova, it.prova_concluida, it.data_conclusao,
            (SELECT COUNT(*) FROM presenca_aulas pa 
             JOIN aulas_ministradas am ON am.id = pa.aula_id 
             WHERE pa.inscricao_id = it.id AND pa.presente) AS presencas_confirmadas,
            (SELECT COUNT(*) FROM aulas_ministradas WHERE turma_id = $1) AS total_aulas_ministradas
       FROM inscricoes_turma it
       JOIN pessoas p ON p.id = it.pessoa_id
      WHERE it.turma_id = $1
      ORDER BY p.nome`,
    [turma.id]
  );
  
  res.json({ alunos: rows, turma: { id: turma.id, nome: turma.nome, status: turma.status } });
});

// Inscrever aluno na turma
router.post('/turmas/:id/alunos', async (req, res) => {
  const u = req.usuario;
  const turma = await carregarTurma(u, req.params.id);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
  
  const { pessoa_id } = req.body;
  if (!pessoa_id) return res.status(400).json({ erro: 'Informe a pessoa.' });
  if (!(await db.query(`SELECT 1 FROM pessoas WHERE id=$1 AND denominacao_id=$2 AND cidade_id=$3
    AND ($4::bigint IS NULL OR criado_por=$4 OR responsavel_id=$4)`,
    [pessoa_id,u.denominacao_id,u.cidade_id,u.nivel===4?u.id:null])).rowCount) throw erro(400,'Pessoa indisponível para esta turma.');
  
  try {
    const { rows } = await db.query(
      `INSERT INTO inscricoes_turma (turma_id, pessoa_id, data_inscricao, status)
       VALUES ($1, $2, CURRENT_DATE, 'INSCRITO') RETURNING id`,
      [turma.id, pessoa_id]
    );
    res.status(201).json({ id: rows[0].id, status: 'INSCRITO' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Aluno já inscrito nesta turma.' });
    throw e;
  }
});

// Atualizar status do aluno
router.put('/turmas/:turmaId/alunos/:alunoId', async (req, res) => {
  const u = req.usuario;
  const turma = await carregarTurma(u, req.params.turmaId);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
  
  const { status } = req.body;
  if (!status) return res.status(400).json({ erro: 'Informe o status.' });
  
  await db.query(
    `UPDATE inscricoes_turma SET status = $1 WHERE id = $2 AND turma_id = $3`,
    [status, req.params.alunoId, turma.id]
  );
  res.json({ ok: true });
});

// ======================== AULAS MINISTRADAS ========================

// Listar aulas da turma
router.get('/turmas/:id/aulas', async (req, res) => {
  const u = req.usuario;
  const turma = await carregarTurma(u, req.params.id);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
  
  const { rows } = await db.query(
    `SELECT am.id, am.data_aula, am.hora_inicio, am.hora_fim, am.tipo_aula, am.local, am.link_live,
            am.confirmada, am.professora_confirmou, l.titulo AS licao_titulo, l.objetivo, 
            m.nome AS modulo_nome, m.ordem AS modulo_ordem, l.ordem AS licao_ordem,
            COUNT(pa.id)::int AS presencas, COUNT(CASE WHEN pa.presente THEN 1 END)::int AS presentes
       FROM aulas_ministradas am
       JOIN licoes l ON l.id = am.licao_id
       JOIN modulos m ON m.id = am.modulo_id
       LEFT JOIN presenca_aulas pa ON pa.aula_id = am.id
      WHERE am.turma_id = $1
      GROUP BY am.id, l.titulo, l.objetivo, m.nome, m.ordem, l.ordem
      ORDER BY am.data_aula DESC`,
    [turma.id]
  );
  
  res.json({ aulas: rows });
});

// Criar aula
router.post('/turmas/:id/aulas', async (req, res) => {
  const u = req.usuario;
  const turma = await carregarTurma(u, req.params.id);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
  
  const { licao_id, modulo_id, data_aula, hora_inicio, hora_fim, tipo_aula, local, link_live } = req.body;
  
  if (!licao_id || !modulo_id || !data_aula) 
    return res.status(400).json({ erro: 'Informe lição, módulo e data.' });
  
  const { rows } = await db.query(
    `INSERT INTO aulas_ministradas (turma_id, licao_id, modulo_id, data_aula, hora_inicio, hora_fim, 
                                    tipo_aula, local, link_live, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [turma.id, licao_id, modulo_id, data_aula, hora_inicio || null, hora_fim || null, 
     tipo_aula || 'PRESENCIAL', local || null, link_live || null, u.id]
  );
  
  res.status(201).json(rows[0]);
});

// Confirmar aula (professor marca como concluída)
router.post('/aulas/:id/confirmar', async (req, res) => {
  const u = req.usuario;
  
  const aula = (await db.query('SELECT * FROM aulas_ministradas WHERE id = $1', [req.params.id])).rows[0];
  if (!aula) return res.status(404).json({ erro: 'Aula não encontrada.' });
  
  const turma = await carregarTurma(u, aula.turma_id);
  if (!turma) return res.status(403).json({ erro: 'Acesso negado.' });
  
  await db.query(
    `UPDATE aulas_ministradas SET professora_confirmou = TRUE, data_confirmacao = NOW() WHERE id = $1`,
    [aula.id]
  );
  
  res.json({ ok: true });
});

// Registrar presença do aluno na aula
router.post('/aulas/:id/presenca', async (req, res) => {
  const u = req.usuario;
  const { inscricao_id, presente } = req.body;
  
  if (!inscricao_id) return res.status(400).json({ erro: 'Informe o aluno.' });
  
  const aula = (await db.query('SELECT * FROM aulas_ministradas WHERE id = $1', [req.params.id])).rows[0];
  if (!aula) return res.status(404).json({ erro: 'Aula não encontrada.' });
  
  const turma = await carregarTurma(u, aula.turma_id);
  if (!turma) return res.status(403).json({ erro: 'Acesso negado.' });

  if (!(await db.query('SELECT 1 FROM inscricoes_turma WHERE id=$1 AND turma_id=$2', [inscricao_id,turma.id])).rowCount)
    return res.status(400).json({ erro: 'Aluno de outra turma.' });
  try {
    await db.query(
      `INSERT INTO presenca_aulas (aula_id, inscricao_id, presente)
       VALUES ($1, $2, $3)
       ON CONFLICT (aula_id, inscricao_id) DO UPDATE
       SET presente = $3`,
      [aula.id, inscricao_id, presente === true]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') return res.status(400).json({ erro: 'Aluno ou aula inválido.' });
    throw e;
  }
});

// ======================== PROVAS E RESULTADOS ========================

// Listar tentativas de prova do aluno
router.get('/alunos/:alunoId/provas', async (req, res) => {
  const u = req.usuario;
  
  const inscricao = (await db.query(
    `SELECT it.*, t.id AS turma_id FROM inscricoes_turma it
     JOIN turmas t ON t.id = it.turma_id
     WHERE it.id = $1 AND t.denominacao_id = $2`,
    [req.params.alunoId, u.denominacao_id]
  )).rows[0];
  
  if (!inscricao) return res.status(404).json({ erro: 'Aluno não encontrado.' });
  
  const turma = await carregarTurma(u, inscricao.turma_id);
  if (!turma) return res.status(403).json({ erro: 'Acesso negado.' });
  
  const { rows } = await db.query(
    `SELECT rp.id, rp.prova_id, rp.pontuacao, rp.percentual, rp.aprovado, rp.tempo_decorrido_minutos,
            rp.respondida_em, p.numero_tentativa
       FROM respostas_prova rp
       JOIN provas p ON p.id = rp.prova_id
      WHERE rp.inscricao_id = $1
      ORDER BY rp.respondida_em DESC`,
    [inscricao.id]
  );
  
  res.json({ provas: rows, aluno_nome: inscricao.pessoa_id });
});

// Gerar diploma para aluno
router.post('/alunos/:alunoId/diploma', async (req, res) => {
  const u = req.usuario;
  const inscricao = (await db.query(
    `SELECT it.*, t.id AS turma_id, p.nome AS pessoa_nome, p.cpf, p.foto
     FROM inscricoes_turma it
     JOIN turmas t ON t.id = it.turma_id
     JOIN pessoas p ON p.id = it.pessoa_id
     WHERE it.id = $1 AND t.denominacao_id = $2`,
    [req.params.alunoId, u.denominacao_id]
  )).rows[0];
  
  if (!inscricao) return res.status(404).json({ erro: 'Aluno não encontrado.' });
  
  if (inscricao.status !== 'CONCLUIDO') 
    return res.status(400).json({ erro: 'Aluno ainda não concluiu o discipulado.' });
  
  try {
    const numero = `DIP-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    const { rows } = await db.query(
      `INSERT INTO diplomas (inscricao_id, turma_id, pessoa_id, curriculo_id, numero_diploma, 
                            data_conclusao, presenca_percentual, nota_final)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 
               (SELECT ROUND(COUNT(*)::numeric / 
                       (SELECT COUNT(*) FROM aulas_ministradas WHERE turma_id = $2) * 100, 2)
                FROM presenca_aulas pa
                WHERE pa.inscricao_id = $1 AND pa.presente),
               $6)
       RETURNING id, numero_diploma`,
      [inscricao.id, inscricao.turma_id, inscricao.pessoa_id, 
       (await carregarTurma(u, inscricao.turma_id)).curriculo_id,
       numero, inscricao.nota_prova || 0]
    );
    
    res.status(201).json({ diploma_id: rows[0].id, numero: rows[0].numero_diploma });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Diploma já gerado para este aluno.' });
    throw e;
  }
});

// ======================== RELATÓRIOS ========================

// Resumo da turma (dashboard do professor)
router.get('/turmas/:id/resumo', async (req, res) => {
  const u = req.usuario;
  const turma = await carregarTurma(u, req.params.id);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
  
  const resumo = (await db.query(
    `SELECT 
      (SELECT COUNT(*) FROM inscricoes_turma WHERE turma_id = $1 AND status IN ('ATIVO','INSCRITO'))::int AS total_alunos,
      (SELECT COUNT(*) FROM inscricoes_turma WHERE turma_id = $1 AND status = 'CONCLUIDO')::int AS alunos_concluidos,
      (SELECT COUNT(*) FROM inscricoes_turma WHERE turma_id = $1 AND status = 'DESISTENTE')::int AS alunos_desistentes,
      (SELECT COUNT(*) FROM aulas_ministradas WHERE turma_id = $1)::int AS total_aulas_planejadas,
      (SELECT COUNT(*) FROM aulas_ministradas WHERE turma_id = $1 AND professora_confirmou)::int AS aulas_ministradas,
      (SELECT ROUND(AVG(CASE WHEN nota_prova IS NOT NULL THEN nota_prova ELSE 0 END), 2))::numeric AS media_notas,
      (SELECT COUNT(*) FROM inscricoes_turma WHERE turma_id = $1 AND prova_concluida)::int AS alunos_com_prova`,
    [turma.id]
  )).rows[0];
  
  res.json({ resumo, turma: { nome: turma.nome, status: turma.status, data_inicio: turma.data_inicio } });
});

// Relatório de presença (por aluno)
router.get('/turmas/:id/relatorio/presenca', async (req, res) => {
  const u = req.usuario;
  const turma = await carregarTurma(u, req.params.id);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
  
  const { rows } = await db.query(
    `SELECT p.nome, it.id AS inscricao_id, COUNT(pa.id)::int AS total_presencas,
            ROUND(COUNT(CASE WHEN pa.presente THEN 1 END)::numeric / 
                  NULLIF(COUNT(pa.id), 0) * 100, 2)::numeric AS percentual_presenca
       FROM inscricoes_turma it
       JOIN pessoas p ON p.id = it.pessoa_id
       LEFT JOIN presenca_aulas pa ON pa.inscricao_id = it.id
      WHERE it.turma_id = $1 AND it.status IN ('ATIVO','CONCLUIDO')
      GROUP BY p.nome, it.id
      ORDER BY p.nome`,
    [turma.id]
  );
  
  res.json({ presenca: rows });
});

// Relatório de desempenho (provas)
router.get('/turmas/:id/relatorio/desempenho', async (req, res) => {
  const u = req.usuario;
  const turma = await carregarTurma(u, req.params.id);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
  
  const { rows } = await db.query(
    `SELECT p.nome, it.id AS inscricao_id, MAX(rp.percentual)::numeric AS melhor_nota,
            COUNT(DISTINCT rp.prova_id)::int AS total_tentativas,
            (SELECT COUNT(*) FROM aulas_ministradas WHERE turma_id = $1)::int AS total_aulas
       FROM inscricoes_turma it
       JOIN pessoas p ON p.id = it.pessoa_id
       LEFT JOIN respostas_prova rp ON rp.inscricao_id = it.id
      WHERE it.turma_id = $1 AND it.status IN ('ATIVO','CONCLUIDO')
      GROUP BY p.nome, it.id
      ORDER BY melhor_nota DESC, p.nome`,
    [turma.id]
  );
  
  res.json({ desempenho: rows });
});

// ======================== SEED DE TESTE ========================
router.get('/seed-test', async (req, res) => {
  try {
    // Criar/buscar denominação
    let result = await db.query(
      `INSERT INTO denominacoes (nome, status, contato_nome, contato_telefone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (nome) DO UPDATE SET id = denominacoes.id
       RETURNING id`,
      ['Assembleia de Deus', 'ATIVO', 'Pr Ailton', '85987654321']
    );
    const denomId = result.rows[0].id;

    // Criar/buscar cidade
    result = await db.query(
      `INSERT INTO cidades (denominacao_id, pais, estado, nome, is_sede)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (denominacao_id, nome) DO UPDATE SET id = cidades.id
       RETURNING id`,
      [denomId, 'Brasil', 'Ceará', 'Fortaleza', true]
    );
    const cidadeId = result.rows[0].id;

    // Criar/buscar usuário teste (Nível 4)
    result = await db.query(
      `INSERT INTO usuarios (denominacao_id, nivel, nome, email, senha_hash, telefone, cidade_id, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (LOWER(email)) DO UPDATE SET id = usuarios.id
       RETURNING id`,
      [denomId, 4, 'Pr Ailton', 'ailton@test.local', 'hash_test', '85987654321', cidadeId, true]
    );
    const usuarioId = result.rows[0].id;

    // Criar currículos de teste
    const curriculos = [
      ['Novos Convertidos', 'Discipulado básico para novos convertidos', 75, 70, 2],
      ['Crescimento Espiritual', 'Aprofundamento na fé cristã e práticas espirituais', 80, 75, 2],
      ['Liderança Cristã', 'Treinamento para líderes e obreiros da igreja', 85, 75, 3]
    ];

    for (const [nome, desc, freq, nota, tent] of curriculos) {
      await db.query(
        `INSERT INTO curriculos (denominacao_id, cidade_id, nome, descricao, frequencia_minima, nota_minima, tentativas_prova, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (denominacao_id, nome) DO NOTHING`,
        [denomId, cidadeId, nome, desc, freq, nota, tent, usuarioId]
      );
    }

    res.json({ ok: true, msg: 'Dados de teste criados', denom_id: denomId, cidade_id: cidadeId, usuario_id: usuarioId });
  } catch (e) {
    console.error('[seed-test]', e);
    res.status(500).json({ erro: e.message });
  }
});

router.get('/aulas/:id/presencas', async (req,res) => {
  const aula = (await db.query('SELECT * FROM aulas_ministradas WHERE id=$1',[id(req.params.id)])).rows[0];
  if (!aula || !(await carregarTurma(req.usuario,aula.turma_id))) throw erro(404,'Aula não encontrada.');
  const alunos = (await db.query(`SELECT it.id AS inscricao_id,p.nome,COALESCE(pa.presente,FALSE) AS presente
    FROM inscricoes_turma it JOIN pessoas p ON p.id=it.pessoa_id
    LEFT JOIN presenca_aulas pa ON pa.inscricao_id=it.id AND pa.aula_id=$1
    WHERE it.turma_id=$2 AND it.status IN ('INSCRITO','ATIVO') ORDER BY p.nome`,[aula.id,aula.turma_id])).rows;
  res.json({alunos});
});
router.post('/aulas/:id/chamada', async (req,res) => {
  const u=req.usuario,aulaId=id(req.params.id);
  const aula=(await db.query('SELECT * FROM aulas_ministradas WHERE id=$1',[aulaId])).rows[0];
  if (!aula || !(await carregarTurma(u,aula.turma_id))) throw erro(404,'Aula não encontrada.');
  const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Recife'});
  if (aula.data_aula>hoje) throw erro(400,'A chamada só pode ser registrada no dia da aula ou depois.');
  if (u.nivel===4 && !pode(u,'acompanhamento.registrar')) throw erro(403,'Você não tem permissão para registrar a chamada.');
  const presencas=req.body.presencas;
  if (!Array.isArray(presencas) || !presencas.length || presencas.length>500) throw erro(400,'Chamada inválida.');
  const ids=presencas.map(x=>id(x.inscricao_id,'Aluno'));
  if (new Set(ids).size!==ids.length || presencas.some(x=>typeof x.presente!=='boolean')) throw erro(400,'Chamada inválida.');
  await transacao(async client=>{
    const alunos=await client.query(`SELECT id FROM inscricoes_turma WHERE turma_id=$1 AND id=ANY($2::bigint[]) AND status IN ('ATIVO','INSCRITO')`,[aula.turma_id,ids]);
    if (alunos.rowCount!==ids.length) throw erro(400,'Há um aluno que não pertence a esta turma.');
    for (const x of presencas) await client.query(`INSERT INTO presenca_aulas (aula_id,inscricao_id,presente) VALUES ($1,$2,$3)
      ON CONFLICT (aula_id,inscricao_id) DO UPDATE SET presente=EXCLUDED.presente`,[aulaId,x.inscricao_id,x.presente]);
    await client.query('UPDATE aulas_ministradas SET professora_confirmou=TRUE,data_confirmacao=NOW() WHERE id=$1',[aulaId]);
  });
  res.json({ok:true});
});
module.exports = router;
