# IDE+ — Fazendo discípulos em todo lugar

Plataforma configurável de evangelismo, discipulado e congregações (v2).

## Níveis
- **0 – Fornecedor:** clientes (denominações), planos e recebíveis.
- **1 – Pastor Presidente:** estrutura (denominação, cidades, congregações), usuários, cargos, pessoas da sede, configurações padrão e fechamento geral.
- **2 – Pastor Local:** congregações da cidade (dirigentes), usuários e cargos da cidade, batismo, configurações próprias.
- **3 – Coordenador:** equipe (Nível 4), pessoas, campanhas e discipulado.
- **4 – Líder / Equipe:** pessoas e atividades.

## Rodar
```
cp .env.example .env   # ajuste DATABASE_URL, JWT_SECRET e o login do Nível 0
npm install
npm start
```
O banco é criado/atualizado sozinho a cada inicialização (`db/schema.sql`).
A versão anterior do código está na branch `legado-v1`.
