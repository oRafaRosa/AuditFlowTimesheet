# AGENTS.md - Instrucoes Locais do Projeto

Este arquivo define como o assistente deve trabalhar neste app.
Escopo: todo o repositorio.
Objetivo: manter padrao tecnico, velocidade e previsibilidade.

## 1) Contexto do projeto
- Nome: AuditFlow
- Stack principal: React + TypeScript + Vite
- Idioma preferido para comunicacao: Portugues (pt-BR)
- Produto voltado principalmente ao Grupo Casas Bahia.
- Sistema ja em uso em producao, ainda em evolucao e aprimoramento continuo.
- Estado atual: modulo de registro de horas (timesheet) e modulo de gestao de horas e planejamento em producao.
- Direcao do produto: evoluir para uma plataforma completa de Auditoria Interna, Riscos, Compliance e Canal de Denuncias.
- Toda sugestao de arquitetura, regra de negocio e UX deve considerar essa visao de plataforma integrada (2a e 3a linha de defesa).

## 1.2) Norte funcional da plataforma
- Timesheet e planejamento continuam como base operacional e de rastreabilidade.
- Auditoria Interna: planejamento anual, execucao de trabalhos, achados, recomendacoes e planos de acao.
- Riscos: cadastro de riscos, avaliacao de probabilidade x impacto, resposta ao risco e monitoramento.
- Compliance: controles, evidencias, obrigacoes regulatorias e monitoramento de aderencia.
- Canal de Denuncias: recebimento, triagem, investigacao, tratamento e trilha de auditoria.
- Sempre propor entregas incrementais (MVP por modulo), sem quebrar o que ja esta estavel.

## 1.1) Estilo pessoal de implementacao (Rafael Rosa da Silva)
- A IA deve codar como se fosse o Rafael Rosa da Silva, respeitando o jeito de organizar e escrever codigo no projeto.
- Priorizar solucoes praticas, objetivas e sem excesso de complexidade.
- Evitar formalismo exagerado em mensagens, textos de apoio e comentarios.

## 2) Regras de implementacao
- Fazer mudancas pequenas e seguras, sem refatoracoes grandes sem necessidade.
- Preservar APIs e comportamento existentes, salvo quando solicitado.
- Priorizar legibilidade e manutencao.
- Evitar dependencias novas quando a solucao atual do projeto for suficiente.

## 3) Qualidade e validacao
- Sempre que possivel, validar com build/test/lint apos alteracoes relevantes.
- Se nao for possivel executar validacao local, informar claramente o que faltou.
- Nao mascarar erros: explicar causa provavel e impacto.

## 4) Convencoes de codigo
- Seguir o estilo ja existente no repositorio.
- Nomes de variaveis e funcoes claros e consistentes.
- Comentarios apenas quando agregarem contexto util.
- Quando comentar codigo, escrever em portugues (pt-BR).
- Comentarios devem ter tom natural, direto e pouco formal, mantendo clareza tecnica.
- Nao alterar arquivos fora do escopo da tarefa.

## 5) Frontend e UX
- Preservar design system existente quando houver.
- Garantir responsividade (desktop e mobile) em alteracoes de interface.
- Evitar regressao visual em telas existentes.

## 6) Fluxo esperado do assistente
- Entender requisito completo antes de editar.
- Mostrar rapidamente o que sera alterado.
- Implementar.
- Validar.
- Sempre que fizer qualquer alteracao em arquivo, fazer commit e push no GitHub logo apos validar a mudanca.
- Nao deixar alteracoes locais pendentes ao encerrar uma entrega, salvo se o usuario pedir explicitamente para nao commitar.
- Ao final, mostrar qual foi o commit realizado (hash + mensagem).
- Resumir o que mudou, com arquivos afetados e proximos passos.

## 7) Nao fazer
- Nao usar comandos destrutivos de git sem autorizacao explicita.
- Nao remover codigo legado sem avaliar impacto.

## 8) Template para regras especificas (edite livremente)
### Modulos criticos
- Exemplo: src/services/store.ts deve ser alterado com cautela por impactar estado global.
- Exemplo: fluxos de aprovacao, trilha de auditoria e controle de permissoes devem ser tratados como criticos.

### Regras de negocio
- Exemplo: Nao permitir apontamento de horas em finais de semana sem justificativa.
- Exemplo: separar claramente responsabilidade da 2a linha (Riscos e Compliance) e 3a linha (Auditoria Interna).
- Exemplo: no Canal de Denuncias, garantir confidencialidade do denunciante conforme perfil e permissao.

### Performance
- Exemplo: Evitar recalculos desnecessarios em componentes de dashboard.

### Testes minimos por mudanca
- Exemplo: Alteracoes em calculo de horas exigem teste de caso feliz + borda.
- Exemplo: alteracoes em workflow de achados, planos de acao ou denuncias exigem teste de status, permissao e rastreabilidade.

## 9) Supabase e banco de dados
- O banco de dados esta hospedado no **Supabase**.
- Os dados estao em **producao** — qualquer alteracao deve ser feita com extremo cuidado.

### Alteracoes na estrutura do banco
- Sempre que precisar editar a estrutura de alguma tabela e nao conseguir de forma autonoma:
  - Identificar o problema e reportar claramente.
  - Se for token vencido, solicitar atualizacao do token.
  - Se nao der de forma alguma, fornecer o SQL com as migrations para execucao manual no Supabase.

### Seguranca dos dados
- Se existir possibilidade de estragar os dados salvos, sugerir backup antes de prosseguir.
- Nunca executar comandos destrutivos (DROP, TRUNCATE, DELETE sem WHERE) sem confirmacao explicita.