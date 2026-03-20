# Configurar Secrets no GitHub Pages

## 🔐 Chave de Criptografia da Matriz de Riscos

Sua chave gerada:
```
8d5634631150293494ebec23ed68ce34f8842ad3c2048732d8c74542124af703
```

---

## 📋 Passo a Passo: GitHub Secrets (Recomendado)

### 1. Abra seu repositório no GitHub

https://github.com/oRafaRosa/AuditFlowTimesheet

### 2. Vá para Settings

Clique em **Settings** no menu superior direito.

### 3. Secrets and Variables

No menu esquerdo, clique em **Secrets and variables** → **Actions**.

### 4. New Repository Secret

Clique no botão verde **New repository secret**.

### 5. Adicione a chave

- **Name:** `VITE_RISK_MATRIX_ENCRYPTION_KEY`
- **Secret:** Cole a chave gerada:
  ```
  8d5634631150293494ebec23ed68ce34f8842ad3c2048732d8c74542124af703
  ```

### 6. Save

Clique em **Add secret**.

---

## ✅ Usando no GitHub Actions

Se você usa um workflow (`.github/workflows/deploy.yml`), a variável já estará disponível durante o build:

```yaml
- name: Build
  env:
    VITE_RISK_MATRIX_ENCRYPTION_KEY: ${{ secrets.VITE_RISK_MATRIX_ENCRYPTION_KEY }}
  run: npm run build
```

---

## 🖥️ Para Testes Locais (Desenvolvimento)

No seu `.env` local (NÃO commitar):

```env
VITE_SUPABASE_URL=sua_url_aqui
VITE_SUPABASE_KEY=sua_key_aqui
VITE_RISK_MATRIX_ENCRYPTION_KEY=8d5634631150293494ebec23ed68ce34f8842ad3c2048732d8c74542124af703
```

Depois rode:
```bash
npm run dev
```

---

## ⚠️ Importante

- **Nunca** commite `.env` no Git
- **Nunca** coloque a chave no código-fonte
- GitHub Secrets é o jeito seguro para produção
- Arquivo `.gitignore` já deve ter `.env` para evitar acidentes

---

## 🧪 Testar a Matriz de Riscos

Após configurar a chave:

1. `npm run dev` (local) ou faz deploy (GitHub Pages)
2. Login como **Admin**
3. Acesse `/risk-matrix` no menu ou direto: `/#/risk-matrix`
4. Clique em **"Carregar base inicial"** para popular com dados de teste
5. Veja os 3 heatmaps funcionando! 🎉

---

## 📞 Se não funcionar

- ✅ Conferir se a chave está salva no GitHub Secrets
- ✅ Conferir se o workflow (build) está usando a secret
- ✅ Rebuilda e redeploy (limpa cache)
- ✅ Abra DevTools (F12) e veja console para erros de descriptografia
