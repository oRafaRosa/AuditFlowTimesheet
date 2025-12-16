import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Importante: Isso garante que os assets carreguem na subpasta do GitHub Pages
  base: '/AuditFlowTimesheet/',
});