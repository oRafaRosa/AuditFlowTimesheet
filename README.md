# AuditFlow


## Visao geral

AuditFlow e uma plataforma privada voltada ao Grupo Casas Bahia para suportar operacao e evolucao das frentes de:

- Auditoria Interna;
- Riscos;
- Compliance;
- Canal de Denuncias.

Hoje, o produto ja opera com foco principal em timesheet, gestao de horas, capacidade e controles administrativos. A direcao do projeto e crescer de forma incremental ate uma suite GRC completa, sem quebrar os fluxos que ja estao estaveis em producao.

## Escopo atual em producao

Os modulos mais maduros hoje sao:

- registro de horas por colaborador;
- acompanhamento individual de horas e relatorios;
- visao gerencial de equipe, capacidade e orcamento;
- administracao de usuarios, projetos e configuracoes;
- folgas e ausencias de equipe;
- matriz de riscos com controle de acesso;
- recursos de engajamento, avisos e ajuda interna.

## Perfis de acesso

### Usuario

- login e sessao;
- dashboard pessoal;
- apontamento de horas;
- relatorios individuais;
- minhas folgas e ausencias;
- hub de conquistas.

### Gestor

- dashboard gerencial;
- relatorios consolidados;
- capacidade do time;
- folgas da equipe;
- acompanhamento de budget por projeto.

### Administrador

- painel administrativo;
- configuracoes gerais;
- gestao de usuarios, projetos e parametros;
- controle de acesso a funcionalidades mais sensiveis.

### Acesso especifico da matriz de riscos

O modulo de matriz de riscos possui controle adicional de permissao com niveis:

- `NONE`;
- `READ`;
- `EDIT`.

## Mapa rapido das rotas

Rotas principais identificadas hoje na aplicacao:

- `/` -> login;
- `/dashboard` -> dashboard do usuario;
- `/timesheet` -> entrada principal de apontamento;
- `/reports` -> relatorios do usuario;
- `/my-leaves` -> folgas e ausencias do usuario;
- `/achievements` -> hub de conquistas;
- `/risk-matrix` -> matriz de riscos;
- `/help` -> central de ajuda;
- `/manager` -> dashboard do gestor;
- `/manager/reports` -> relatorios gerenciais;
- `/manager/reports/capacity` -> capacidade do time;
- `/manager/team-leaves` -> ausencias da equipe;
- `/manager/budget` -> budget por projeto;
- `/admin/*` -> painel administrativo.

## Estrutura funcional do frontend

### Camada de paginas

As paginas principais ficam em `src/pages` e representam os fluxos de negocio e navegacao.

Paginas atuais mapeadas:

- `Login`;
- `UserDashboard`;
- `UserReports`;
- `UserMyLeaves`;
- `ManagerDashboard`;
- `ManagerReports`;
- `ManagerCapacity`;
- `ManagerTeamLeaves`;
- `ManagerProjectBudget`;
- `AdminDashboard`;
- `AchievementsHub`;
- `RiskMatrix`;
- `HelpCenter`.

### Camada de componentes

Os componentes em `src/components` concentram blocos reutilizaveis de UI e widgets de apoio, com destaque para:

- layout base da aplicacao;
- indicadores de carregamento;
- widget de status pessoal;
- recursos de aniversario;
- snapshot de gamificacao;
- tela de bloqueio de funcionalidade.

### Camada de servicos

Os servicos em `src/services` concentram regras transversais do app.

Hoje os arquivos mais relevantes sao:

- `store.ts` -> servico central de autenticacao, leitura e escrita de dados, sessao local e integracao com Supabase;
- `notifications.ts` -> notificacoes;
- `loadingState.ts` -> estado global de carregamento.

## Arquitetura tecnica resumida

- frontend em React 18 com TypeScript;
- build com Vite;
- roteamento com `HashRouter`;
- backend e banco em Supabase;
- graficos com Recharts;
- icones com Lucide React;
- exportacoes e planilhas com `xlsx`.

### Observacoes tecnicas relevantes

- a autenticacao atual trabalha em modelo hibrido, com sessao local e verificacao remota;
- o servico central do sistema esta bastante concentrado em `src/services/store.ts`;
- o projeto usa variaveis de ambiente para integracoes sensiveis, mas existem fallbacks no codigo para viabilizar determinados cenarios de build;
- a matriz de riscos possui camada propria de permissao e suporte a criptografia do payload.

## Estrutura do repositorio

```text
AuditFlowTimesheet/
|-- src/
|   |-- components/        componentes reutilizaveis
|   |-- config/            configuracoes internas
|   |-- pages/             paginas e fluxos principais
|   |-- services/          integracoes e regra transversal
|   |-- utils/             funcoes utilitarias
|   |-- App.tsx            definicao de rotas
|   |-- index.tsx          bootstrap do frontend
|   `-- types.ts           tipos compartilhados
|-- migrations/            scripts SQL versionados
|-- public/                arquivos publicos estaticos
|-- assets/                bundle publicado
|-- README.md              documento base do projeto
|-- IDEIAS_E_INSIGHTS.md   anotacoes de evolucao
|-- RISK_MATRIX_SETUP.md   referencia do modulo de riscos
`-- todo-capacity-mobile.md acompanhamento de pendencia especifica
```

## Banco de dados e migracoes

O banco esta no Supabase e deve ser tratado como ambiente sensivel.

Migracoes ja versionadas no repositorio indicam a evolucao recente de:

- area em projetos;
- campos de capacidade em perfis;
- estrutura da matriz de riscos;
- ajuste de RLS da matriz;
- data de aniversario em perfis;
- avisos da aplicacao;
- eventos de folga da equipe.

## Documentos de apoio no repositorio

Arquivos que ja servem como base para documentacao complementar:

- `AGENTS.md` -> regras locais de trabalho no projeto;
- `IDEIAS_E_INSIGHTS.md` -> backlog mais livre e anotacoes;
- `RISK_MATRIX_SETUP.md` -> contexto especifico da matriz de riscos;
- `todo-capacity-mobile.md` -> pendencias conhecidas sobre capacidade no mobile.

## Direcao de evolucao do produto

As proximas frentes devem continuar respeitando a visao de plataforma integrada entre segunda e terceira linha de defesa.

### Auditoria Interna

- planejamento anual;
- execucao de trabalhos;
- achados;
- recomendacoes;
- planos de acao.

### Riscos

- cadastro estruturado de riscos;
- avaliacao de probabilidade e impacto;
- resposta ao risco;
- monitoramento continuo.

### Compliance

- controles;
- evidencias;
- obrigacoes regulatorias;
- monitoramento de aderencia.

### Canal de Denuncias

- recebimento;
- triagem;
- investigacao;
- tratamento;
- trilha de auditoria.

## Checklist para futuras documentacoes

Quando uma nova feature for documentada, vale registrar pelo menos:

- objetivo funcional;
- perfil de acesso envolvido;
- regra de negocio principal;
- telas e rotas afetadas;
- tabelas ou migracoes impactadas;
- riscos de regressao;
- dependencia com outros modulos;
- pontos que precisam entrar em manual do usuario ou manual operacional.

## Resumo executivo

Se precisar explicar rapidamente o projeto para criar outro material, a definicao base hoje e:

> AuditFlow e uma plataforma privada em evolucao para GRC, com operacao atual centrada em timesheet, gestao de horas, capacidade, administracao e matriz de riscos, desenhada para evoluir de forma incremental para cobrir Auditoria Interna, Riscos, Compliance e Canal de Denuncias.


Desenvolvido por **R² Solutions Group**.
