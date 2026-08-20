import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/QUIZFINAL/',

  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        registro: path.resolve(__dirname, 'registro.html'),
        quiz: path.resolve(__dirname, 'quiz.html'),
        dashboard: path.resolve(__dirname, 'dashboard.html'),
        profesor: path.resolve(__dirname, 'profesor.html'),
      },
    },
  },

  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});