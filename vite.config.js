import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Un solo index.html autocontenido: se puede abrir directo, subir a GitHub Pages o publicar como Artifact.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  resolve: { alias: { postprocessing: fileURLToPath(new URL('./src/shims/postprocessing.js', import.meta.url)) } },
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 2000 },
});
