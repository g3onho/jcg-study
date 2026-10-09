import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base는 GitHub Pages 저장소 경로. 로컬 개발은 '/'.
export default defineConfig(({ command }) => ({
  plugins: [preact()],
  base: command === 'build' ? (process.env.APP_BASE || '/jcg-study/') : '/',
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 1500 },
  server: { host: '127.0.0.1', port: 5173 },
}));
