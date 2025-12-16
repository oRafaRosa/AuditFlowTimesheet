import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Alterado para './' para permitir caminhos relativos.
  // Isso corrige o erro de carregamento (404) se o nome do repositório
  // no GitHub Pages for diferente de 'AuditFlowTimesheet'.
  base: './',
});