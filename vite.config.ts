import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

const getGitCommitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'local';
  }
};

const appCommitHash = getGitCommitHash();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/AuditFlowTimesheet/',
  define: {
    'import.meta.env.VITE_APP_COMMIT': JSON.stringify(appCommitHash),
  },
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
