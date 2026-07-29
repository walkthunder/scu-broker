import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/** 生产子路径部署：VITE_BASE=/scu/ */
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  plugins: [vue()],
  base,
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000',
    },
  },
});
