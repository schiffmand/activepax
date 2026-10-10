import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('../core/src', import.meta.url));

// One self-contained dist/index.html (fonts, JS and CSS inlined) that works from file://.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { '@core': core } },
  server: { fs: { allow: ['..'] } },
  build: { assetsInlineLimit: 100_000_000, cssCodeSplit: false, target: 'es2020', chunkSizeWarningLimit: 4000 },
});
