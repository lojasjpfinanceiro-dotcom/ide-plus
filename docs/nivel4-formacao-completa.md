# IDE+ — Nível 4 Professor / Formação Completa

Fluxo oficial: Turma → Curso/Currículo → Módulos → Aulas → Atividades → Avaliações/Provas → Resultado → Conclusão → Diploma.

## Regras
- Conteúdo do curso separado da turma para reutilização e histórico.
- Nível 1 configura currículo, módulos, lições, materiais, critérios e modelos.
- Nível 2 gerencia a aplicação local e acompanha resultados.
- Nível 3 cria/coordena turmas, calendário e professores.
- Nível 4 executa aulas e acompanha apenas suas turmas/alunos.

## Aula multimídia
Cada aula pode combinar: presencial, live, slides, vídeo, PDF/apostila, áudio, texto/estudo, links, materiais complementares e atividades.

## Professor
Home: Minhas Turmas, Próxima Aula, Meus Alunos, Planejamento, Frequência, Avaliações e Progresso.

Turma: alunos, presença, aulas, atividades, média, progresso e situação.

Planejamento: módulos, aulas, datas, professor, materiais, atividades e avaliações.

## Avaliações
Banco de questões com múltipla escolha, verdadeiro/falso, resposta escrita e avaliação manual. Configuração por currículo/módulo: prova inexistente, opcional ou obrigatória; nota mínima; tentativas; recuperação; peso de atividades/prova.

## Acompanhamento
Ficha individual integra dados pessoais, discipulado, turma, frequência, aulas, atividades, provas, notas, visitas, observações, progresso e situação.

## Conclusão
Estados: EM_ANDAMENTO → PENDENCIAS → APTO_CONCLUSAO → CONCLUIDO → DIPLOMA_EMITIDO.

Critérios configuráveis incluem módulos obrigatórios, frequência mínima, atividades obrigatórias, média mínima e acompanhamento concluído. A interface deve informar exatamente cada pendência.

## Diploma
PDF com aluno, curso, denominação, congregação, cidade, professor, carga horária, período, data de conclusão, número único e QR Code/token público de validação.

## Compatibilidade
A implementação deve evoluir as tabelas e rotas existentes (`curriculos`, `modulos`, `licoes`, `turmas`, `aulas_ministradas`, `presenca_aulas`, provas e diplomas) sem destruir histórico existente.
