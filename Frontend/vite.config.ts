import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2020' },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
