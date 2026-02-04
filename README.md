# AuditFlow Timesheet

> desenvolvido por **[R² Solutions Group](https://orafarosa.github.io/R2-Solutions-Group/)** 🚀  
> tech & consulting

AuditFlow Timesheet é uma aplicação web moderna para gerenciamento de tempo e projetos, desenvolvida para facilitar o controle de horas trabalhadas em auditorias e projetos de consultoria. Construída com tecnologias de ponta, oferece uma interface intuitiva para usuários, gerentes e administradores.

## 🚀 Funcionalidades

### Para Usuários
- **Dashboard Pessoal**: Visualize suas horas trabalhadas, projetos ativos e alertas de limite diário.
- **Registro de Tempo**: Adicione entradas de tempo por projeto e data.
- **Relatórios Individuais**: Gere relatórios das suas horas trabalhadas.

### Para Gerentes
- **Dashboard Gerencial**: Monitore a equipe, aprove entradas e visualize métricas.
- **Aprovação de Horas**: Revise e aprove registros de tempo dos membros da equipe.
- **Relatórios de Equipe**: Acesse relatórios consolidados da equipe.
- **Delegação de Equipe**: Delegue temporariamente a gestão de sua equipe a outro gerente durante ausências. Todas as aprovações serão direcionadas ao gestor designado.

### Para Administradores
- **Painel Administrativo**: Gerencie usuários, projetos e configurações do sistema.
- **Centro de Ajuda**: Acesse documentação e suporte integrado.

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 18 com TypeScript
- **Build Tool**: Vite
- **Roteamento**: React Router DOM
- **Backend**: Supabase (PostgreSQL como banco de dados)
- **Estilização**: Tailwind CSS (via CDN)
- **Ícones**: Lucide React
- **Gráficos**: Recharts
- **Deploy**: GitHub Pages

## 📋 Pré-requisitos

- Node.js (versão 18 ou superior)
- Conta no Supabase para configuração do backend

## 🏃‍♂️ Como Executar Localmente

1. **Clone o repositório**:
   ```bash
   git clone https://github.com/oRafaRosa/AuditFlowTimesheet.git
   cd AuditFlowTimesheet
   ```

2. **Instale as dependências**:
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**:
   - Copie o arquivo `.env.example` para `.env`:
     ```bash
     cp .env.example .env
     ```
   - Edite o arquivo `.env` e adicione suas credenciais do Supabase:
     ```
     VITE_SUPABASE_URL=sua_url_do_supabase
     VITE_SUPABASE_KEY=sua_chave_publica_do_supabase
     ```
   - **IMPORTANTE**: Nunca commite o arquivo `.env` no Git!

4. **Configure o Supabase**:
   - Crie um projeto no [Supabase](https://supabase.com)
   - Configure as tabelas e políticas de segurança conforme necessário
   - Copie a URL do projeto e a chave pública (anon key) para o arquivo `.env`

5. **Execute o aplicativo**:
   ```bash
   npm run dev
   ```

5. **Acesse no navegador**:
   Abra [http://localhost:5173](http://localhost:5173)

## 🚀 Deploy

O deploy está configurado para **GitHub Pages via branch** (main / root).

### Para publicar via branch

1. **Build do projeto** (gera `index.html` e `assets/` na raiz):
   ```bash
   npm run build
   ```

2. **Commit dos artefatos de build**:
   ```bash
   git add index.html assets/
   git commit -m "build: update static bundle"
   ```

3. **Push para a branch `main`**:
   ```bash
   git push
   ```

4. **Configure no GitHub**:
   - Settings → Pages → Deploy from a branch
   - Branch: `main` / Folder: `/ (root)`

## 📁 Estrutura do Projeto

```
AuditFlowTimesheet/
├── public/                 # Arquivos estáticos
├── src/
│   ├── components/         # Componentes reutilizáveis
│   ├── pages/             # Páginas da aplicação
│   ├── services/          # Serviços (Supabase, notificações)
│   ├── App.tsx            # Componente principal
│   ├── index.tsx          # Ponto de entrada
│   └── types.ts           # Definições de tipos TypeScript
├── .github/workflows/     # Configurações do CI/CD
├── package.json           # Dependências e scripts
├── vite.config.ts         # Configuração do Vite
└── README.md             # Este arquivo
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 📞 Suporte

Para dúvidas ou suporte, acesse o Centro de Ajuda dentro da aplicação ou entre em contato com a equipe de desenvolvimento.

---

<div align="center">

**desenvolvido com 💙 por [R² Solutions Group](https://orafarosa.github.io/R2-Solutions-Group/)**

*tech & consulting - transformando ideias em soluções*

</div>
