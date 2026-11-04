import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/** 生产子路径部署：VITE_BASE=/ */
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  plugins: [vue()],
  base,
  server: {
    port: 5176,
  },
});
