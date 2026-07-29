import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/** 默认 /admin/；子路径部署：VITE_BASE=/scu/admin/ */
const base = process.env.VITE_BASE || '/admin/';

export default defineConfig({
  plugins: [vue()],
  base,
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000',
    },
  },
});
