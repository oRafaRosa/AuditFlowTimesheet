import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  root: 'src',
  plugins: [react()],
  base: '/AuditFlowTimesheet/',
  publicDir: '../public',
  build: {
    outDir: '..',
    emptyOutDir: false,
  },
});
