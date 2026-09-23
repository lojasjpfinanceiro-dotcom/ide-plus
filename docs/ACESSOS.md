# Acessos e implantação do IDE+

## Regra central

Cada usuário possui um cargo, um vínculo territorial e permissões por ação.

- **Cargo**: função da pessoa (Pastor Local, Superintendente, Dirigente etc.).
- **Vínculo**: denominação, cidade ou congregação. Toda consulta e toda alteração devem respeitar esse vínculo no servidor.
- **Permissões**: ações habilitadas em cada módulo. A interface apenas reflete as permissões; a API as valida novamente.
- **Pastor Presidente**: acesso completo à sua denominação e único responsável por criar, suspender ou reativar logins.
- **Pastor Local**: administra congregações e pessoas somente em sua cidade. Não cria logins.
- **Demais cargos**: recebem somente as permissões marcadas pelo Pastor Presidente e atuam no vínculo escolhido.

As tabelas de cargos e permissões já permitem evoluir para múltiplas atribuições. A primeira versão apresenta um cargo e um vínculo principal por login para manter o cadastro simples.

## Ordem de implantação

1. Primeiro acesso do Pastor Presidente e cadastro da denominação.
2. Cadastro das cidades, sedes e congregações.
3. Criação dos acessos e seleção das ações permitidas.
4. Ficha de pessoas e resultados por área.
5. Campanhas de evangelismo com responsáveis, origem e metas.
6. Discipulado com histórico, responsáveis, encontros e situação.
7. Batismo e relatórios consolidados.

Antes de publicar cada novo módulo, acrescentar códigos de permissão em `src/initDb.js`, proteger **todas** as suas rotas e aplicar filtro de denominação/cidade/congregação nos dados. Exibir o módulo na Home somente depois que ele funcionar.

## Fluxos para validar antes do deploy

- Pastor Presidente cria login de cada nível e suspende um acesso.
- Usuário suspenso perde acesso mesmo com token previamente emitido.
- Pastor Local vê somente sua cidade e não cria logins.
- Dirigente vê apenas sua congregação nas listas e nos indicadores.
- Permissão de visualização não libera inserção, edição ou exclusão.
- Usuário de uma denominação não acessa registros de outra.

Referência de produto: Planning Center usa administração por áreas e unidades; o IDE+ adota uma interface menor e concentra a provisão dos acessos na Presidência.
