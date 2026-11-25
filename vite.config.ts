import { defineConfig } from 'vite';

// Relative base so the build works under the GitHub Pages sub-path.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
  server: { host: true },
});
