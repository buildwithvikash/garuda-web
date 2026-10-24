import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import pages from './plugins/vite-pages.js';

export default defineConfig({
  plugins: [react(), tailwindcss(), pages()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5180, proxy: { '/api': 'http://localhost:4000', '/GuideFiles': 'http://localhost:4000' } },
});
