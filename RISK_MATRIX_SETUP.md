# Matriz de Riscos - Próximos Passos para Deploy

## ✅ Que foi implementado

### Backend (Store Service - `src/services/store.ts`)
- ✅ Métodos de criptografia AES-GCM para payloads de risco
- ✅ `getRiskMatrixRecords()` - carrega riscos decriptografados (acesso por permissão)
- ✅ `saveRiskMatrixRecord()` - salva riscos criptografados (permissão EDIT)
- ✅ `getRiskMatrixAccessForCurrentUser()` - verifica permissão do usuário
- ✅ Suporte a números com 5 casas decimais

### Frontend - Página Matriz de Riscos (`src/pages/RiskMatrix.tsx`)
- ✅ 3 Heatmaps: Risco Inerente, Risco Residual, Movimentação dos Riscos
- ✅ Escala infinita (adaptativa ao min/max dos dados)
- ✅ Tabela editável para usuários com EDIT
- ✅ Pop-up "Saiba mais" explicando segurança e criptografia
- ✅ Botão "Carregar base inicial" com dados de amostra
- ✅ Recarregar, Salvar, Bootstrap de dados

### Frontend - Admin Dashboard (`src/pages/AdminDashboard.tsx`)
- ✅ Seção de Permissões na aba "Configurações"
- ✅ Upload de permissões (NONE | READ | EDIT) por usuário
- ✅ Admins sempre com permissão EDIT

### Tipos (`src/types.ts`)
- ✅ `RiskMatrixAccess = 'NONE' | 'READ' | 'EDIT'`
- ✅ `RiskMatrixRecord` com todos os atributos

### Rota e Navegação (`src/App.tsx`)
- ✅ Rota `/risk-matrix` com proteção customizada
- ✅ Componente `ProtectedRiskMatrixRoute` que valida permissão

### SQL Migration (`migrations/20260320_create_risk_matrix_records.sql`)
- ✅ Tabela `risk_matrix_records` com RLS
- ✅ Policies de segurança (read para autenticados, write/update/delete apenas Admin)
- ✅ Coluna `risk_matrix_access` adicionada em `profiles`

---

## 🔧 Próximos Passos (Executor no Supabase)

### 1. Execute a Migration SQL no Supabase

1. Abra o [Supabase Console](https://supabase.com)
2. Selecione seu projeto
3. Vá para **SQL Editor** → **New Query**
4. Cole o conteúdo de: `migrations/20260320_create_risk_matrix_records.sql`
5. Clique em **Run**

### 2. Variáveis de Ambiente (.env)

Adicione ao seu `.env` local e defina como Secret no deploy:

```env
# Chave para criptografia de Matriz de Riscos (mínimo 16 caracteres)
# Copie e guarde com segurança em um password manager!
VITE_RISK_MATRIX_ENCRYPTION_KEY=sua_chave_super_segura_aqui_minimo_16_chars
```

**Segurança:**
- Esta chave NUNCA deve estar no Git
- Use diferentes chaves por ambiente (dev, staging, prod)
- Guarde em um Secret Manager (Azure Key Vault, AWS Secrets, etc)

### 3. Populate Dados Iniciais (Opcional)

Se quiser carregar riscos na planilha attachada:

1. Acesse a página `/risk-matrix` como Admin
2. Clique em **"Carregar base inicial"**
3. Dados de amostra serão criptografados e salvos no Supabase

Ou faça seed manual direto no SQL com dados decriptografados (não recomendado para produção).

### 4. Configurar Permissões no Admin

1. Login como Admin
2. Vá para **Administração** → **Configurações**
3. Scroll até **Permissões - Matriz de Riscos**
4. Configure por usuário: NONE | READ | EDIT
5. Clique em **Salvar permissões da Matriz**

---

## 📋 Fluxo de Segurança

```
Usuário acessa /risk-matrix
    ↓
App verifica riskMatrixAccess em profiles (READ/EDIT/NONE)
    ↓
Se NONE → Redireciona para dashboard
Se READ/EDIT → Renderiza página
    ↓
Ao carregar registros → App descriptografa payload on-the-fly
Ao salvar registros → App encripta payload antes de enviar
    ↓
Supabase recebe apenas encrypted blob + metadata
Policies garantem que só ADMIN pode escrever
```

---

## 📊 Estrutura da Tabela

```sql
risk_matrix_records (
  id: UUID (PK)
  risk_code: VARCHAR(50) UNIQUE
  payload_encrypted: TEXT ← Contém JSON criptografado com {
    title, category, ownerArea,
    inherentImpact, inherentProbability,
    residualImpact, residualProbability
  }
  updated_by: UUID
  updated_at: TIMESTAMP
  created_at: TIMESTAMP
)
```

---

## 🧪 Teste Local

1. Adicione `VITE_RISK_MATRIX_ENCRYPTION_KEY` ao `.env` local
2. Rode `npm run dev`
3. Login como Admin
4. Vá para `/risk-matrix`
5. Clique **"Carregar base inicial"** para popular com dados de amostra
6. Verifique os 3 heatmaps e a tabela
7. Tente editar um risco e salvar
8. Admin Dashboard → Configurações → ajuste permissão de um usuário para READ

---

## 🔐 Considerações de Segurança

- ✅ Dados criptografados em repouso (AES-GCM no BD)
- ✅ Chave de criptografia fora do código (variável de ambiente)
- ✅ RLS policies limitam acesso no SGBD
- ✅ Só ADMIN consegue escrever/editar
- ✅ Descriptografia apenas no front (usuário autorizado)
- ✅ Sem logs de dados sensíveis

---

## 📝 Commits Realizados

- **cb7ce2a**: Implementa Matriz de Riscos com criptografia AES-GCM e permissões granulares
- **ad067ef**: Adiciona migration SQL para tabela risk_matrix_records

---

## ❓ FAQ

**P: Se perder a chave de criptografia VITE_RISK_MATRIX_ENCRYPTION_KEY, recupero os dados?**
R: Não. Os dados ficarão ilegíveis. Guarde a chave em um Secret Manager!

**P: Posso alterar a chave em produção?**
R: Não sem re-encriptar todos os registros. Faça backup antes!

**P: Por que não salvar senhas junto com chaves no .env?**
R: Por segurança. Chaves devem estar em um vault, nunca no repositório.

**P: Usuários com READ conseguem editar via console?**
R: Não. O App força check antes de renderizar inputs, e as Policies do SGBD rejeitam writes não-admin.

---

## 🚀 Próximas Melhorias (Roadmap)

- [ ] Histórico de mudanças (audit log)
- [ ] Exportação de Matriz em PDF/Excel
- [ ] Alertas quando risco residual ultrapassa threshold
- [ ] Integração com Canal de Denúncias (se risco ≥ crítico)
- [ ] Dashboard de KRIs (Risk Indicators)
- [ ] Simulação de cenários ("what-if")
