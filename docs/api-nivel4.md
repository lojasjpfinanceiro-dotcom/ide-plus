# API IDE+ — Nível 4 (Professor/Líder)

Recursos profissionais para gerenciar turmas, alunos, aulas e acompanhamento em tempo real.

**Versão:** 2.0.0  
**Data:** 2026-10-02  
**Autenticação:** Bearer token (JWT via `/api/auth/login`)

---

## Estrutura de Dados

### Turma
```json
{
  "id": 1,
  "nome": "Discipulado Básico - Turma 2024",
  "curriculo_id": 5,
  "professor_id": 10,
  "co_professor_id": 11,
  "congregacao_id": 2,
  "data_inicio": "2024-10-01",
  "data_fim": "2024-12-20",
  "status": "ATIVA",
  "minimo_alunos": 2,
  "minimo_presenca": 75,
  "nota_minima_prova": 70,
  "total_alunos": 12
}
```

### Inscrição
```json
{
  "id": 1,
  "turma_id": 1,
  "pessoa_id": 25,
  "usuario_aluno_id": null,
  "status": "ATIVO",
  "presenca_total_aulas": 8,
  "nota_prova": 85.5,
  "prova_concluida": true,
  "data_conclusao": "2024-12-15"
}
```

### Aula Ministrada
```json
{
  "id": 1,
  "turma_id": 1,
  "licao_id": 10,
  "modulo_id": 3,
  "data_aula": "2024-10-08",
  "hora_inicio": "19:30",
  "hora_fim": "21:00",
  "tipo_aula": "PRESENCIAL",
  "local": "Sala 1",
  "link_live": null,
  "confirmada": true,
  "presentes": 11,
  "total_alunos": 12
}
```

### Diploma
```json
{
  "id": 1,
  "inscricao_id": 1,
  "pessoa_id": 25,
  "numero_diploma": "DIP-2024-A1B2C3",
  "data_emissao": "2024-12-15",
  "presenca_percentual": 95.8,
  "nota_final": 85.5
}
```

---

## Endpoints

### TURMAS

#### `GET /api/nivel4/turmas`
Listar todas as turmas do professor (Nível 4) ou coordenador (Nível 3).

**Resposta (200):**
```json
{
  "turmas": [
    {
      "id": 1,
      "nome": "Discipulado Básico",
      "professor_nome": "João Silva",
      "curriculo_nome": "Fundamentals",
      "status": "ATIVA",
      "data_inicio": "2024-10-01",
      "total_alunos": 12
    }
  ]
}
```

#### `POST /api/nivel4/turmas`
Criar nova turma.

**Body:**
```json
{
  "curriculo_id": 5,
  "congregacao_id": 2,
  "nome": "Discipulado Básico - Turma 2024",
  "professor_id": 10,
  "co_professor_id": 11,
  "data_inicio": "2024-10-01",
  "data_fim": "2024-12-20",
  "minimo_alunos": 2
}
```

**Resposta (201):**
```json
{
  "id": 1,
  "nome": "Discipulado Básico - Turma 2024",
  "status": "PLANEJAMENTO",
  "data_inicio": "2024-10-01"
}
```

#### `PUT /api/nivel4/turmas/:id`
Atualizar turma (nome, status, datas).

**Body:**
```json
{
  "nome": "Novo nome",
  "status": "ATIVA",
  "data_fim": "2024-12-31"
}
```

#### `DELETE /api/nivel4/turmas/:id`
Deletar turma (apenas se em planejamento).

---

### ALUNOS

#### `GET /api/nivel4/turmas/:turmaId/alunos`
Listar todos os alunos inscritos na turma com progresso.

**Resposta (200):**
```json
{
  "alunos": [
    {
      "id": 1,
      "nome": "Maria Santos",
      "cpf": "111.222.333-44",
      "status": "ATIVO",
      "presencas_confirmadas": 8,
      "total_aulas_ministradas": 10,
      "nota_prova": 85.5,
      "prova_concluida": true
    }
  ],
  "turma": {
    "id": 1,
    "nome": "Discipulado Básico",
    "status": "ATIVA"
  }
}
```

#### `POST /api/nivel4/turmas/:turmaId/alunos`
Inscrever aluno na turma.

**Body:**
```json
{
  "pessoa_id": 25
}
```

**Resposta (201):**
```json
{
  "id": 1,
  "status": "INSCRITO"
}
```

#### `PUT /api/nivel4/turmas/:turmaId/alunos/:alunoId`
Atualizar status do aluno (INSCRITO, ATIVO, CONCLUIDO, DESISTENTE).

**Body:**
```json
{
  "status": "CONCLUIDO"
}
```

---

### AULAS

#### `GET /api/nivel4/turmas/:turmaId/aulas`
Listar todas as aulas da turma com módulo, lição e presença.

**Resposta (200):**
```json
{
  "aulas": [
    {
      "id": 1,
      "data_aula": "2024-10-08",
      "hora_inicio": "19:30",
      "hora_fim": "21:00",
      "tipo_aula": "PRESENCIAL",
      "local": "Sala 1",
      "modulo_nome": "Módulo 1",
      "licao_titulo": "A Salvação",
      "confirmada": true,
      "presentes": 11,
      "presencas": 12
    }
  ]
}
```

#### `POST /api/nivel4/turmas/:turmaId/aulas`
Criar nova aula (agendar).

**Body:**
```json
{
  "licao_id": 10,
  "modulo_id": 3,
  "data_aula": "2024-10-08",
  "hora_inicio": "19:30",
  "hora_fim": "21:00",
  "tipo_aula": "PRESENCIAL",
  "local": "Sala 1"
}
```

**Resposta (201):**
```json
{
  "id": 1,
  "turma_id": 1,
  "data_aula": "2024-10-08"
}
```

#### `POST /api/nivel4/aulas/:aula_id/confirmar`
Professor confirma que a aula foi ministrada.

**Resposta (200):**
```json
{
  "ok": true
}
```

#### `POST /api/nivel4/aulas/:aula_id/presenca`
Registrar presença do aluno (professor marca presente/ausente).

**Body:**
```json
{
  "inscricao_id": 1,
  "presente": true
}
```

---

### PROVAS E DIPLOMAS

#### `GET /api/nivel4/alunos/:alunoId/provas`
Listar tentativas de prova do aluno.

**Resposta (200):**
```json
{
  "provas": [
    {
      "id": 1,
      "percentual": 85.5,
      "aprovado": true,
      "tempo_decorrido_minutos": 28,
      "respondida_em": "2024-12-15T15:30:00Z",
      "numero_tentativa": 1
    }
  ]
}
```

#### `POST /api/nivel4/alunos/:alunoId/diploma`
Gerar diploma em PDF (aluno deve ter concluído).

**Resposta (201):**
```json
{
  "diploma_id": 1,
  "numero": "DIP-2024-A1B2C3"
}
```

---

### RELATÓRIOS

#### `GET /api/nivel4/turmas/:turmaId/resumo`
Resumo executivo da turma (dashboard professor).

**Resposta (200):**
```json
{
  "resumo": {
    "total_alunos": 12,
    "alunos_concluidos": 10,
    "alunos_desistentes": 1,
    "total_aulas_planejadas": 12,
    "aulas_ministradas": 10,
    "media_notas": 82.3,
    "alunos_com_prova": 9
  },
  "turma": {
    "nome": "Discipulado Básico",
    "status": "ATIVA"
  }
}
```

#### `GET /api/nivel4/turmas/:turmaId/relatorio/presenca`
Relatório detalhado de presença (por aluno).

**Resposta (200):**
```json
{
  "presenca": [
    {
      "nome": "Maria Santos",
      "inscricao_id": 1,
      "total_presencas": 10,
      "percentual_presenca": 95.0
    }
  ]
}
```

#### `GET /api/nivel4/turmas/:turmaId/relatorio/desempenho`
Relatório de desempenho nas provas (por aluno).

**Resposta (200):**
```json
{
  "desempenho": [
    {
      "nome": "Maria Santos",
      "melhor_nota": 85.5,
      "total_tentativas": 1,
      "total_aulas": 12
    }
  ]
}
```

---

## Codes de Erro

| Código | Mensagem | Causa |
|--------|----------|-------|
| 400 | Informe currículo e nome da turma. | Dados obrigatórios faltando |
| 403 | Acesso restrito. | Usuário sem permissão |
| 404 | Turma não encontrada. | ID inválido ou fora de escopo |
| 409 | Turma com esse nome já existe. | Duplicata |
| 500 | Erro interno. | Erro do servidor |

---

## Fluxo Típico (Professor)

1. **Listar turmas:** `GET /api/nivel4/turmas`
2. **Criar turma:** `POST /api/nivel4/turmas` (selecionando currículo)
3. **Inscrever alunos:** `POST /api/nivel4/turmas/:id/alunos` (uma por uma)
4. **Agendar aulas:** `POST /api/nivel4/turmas/:id/aulas` (do currículo)
5. **Confirmar aula + presença:** `POST /api/nivel4/aulas/:id/confirmar`, `POST /api/nivel4/aulas/:id/presenca`
6. **Visualizar resumo:** `GET /api/nivel4/turmas/:id/resumo`
7. **Gerar diploma:** `POST /api/nivel4/alunos/:id/diploma` (quando aluno concluir)

---

## Notas de Implementação

- **Autenticação:** Todos os endpoints requerem token JWT válido
- **Escopo:** Professor/Coordenador vê apenas turmas e alunos da sua cidade
- **Permissões:** Nível 4 edita apenas suas turmas; Nível 3 (coordenador) tem acesso completo
- **Presença:** Registrada aula por aula, com sumário automático por aluno
- **Diplomas:** Gerados com número único, data, assinatura digital futura
- **Relatórios:** Atualizam em tempo real; agregam dados de presença e provas
