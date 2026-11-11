import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = `http://127.0.0.1:${process.env.PORT ?? 4400}`;

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: { port: Number(process.env.WEB_PORT ?? 5173), proxy: { '/api': { target: api, changeOrigin: true } } },
  build: { outDir: 'dist', emptyOutDir: true },
});
