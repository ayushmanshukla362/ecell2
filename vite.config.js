import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const sourceAssets = fileURLToPath(new URL('./src/assets/', import.meta.url));
const rasterAsset = /\.(jpe?g|png|webp)$/i;

function optimizeImportedImages() {
  const references = new Map();
  return {
    name: 'optimize-imported-images',
    apply: 'build',
    enforce: 'pre',
    async load(id) {
      const file = id.split('?')[0];
      if (!file.startsWith(sourceAssets) || !rasterAsset.test(file)) return null;
      let reference = references.get(file);
      if (!reference) {
        const source = await sharp(file, { failOn: 'none' })
          .rotate()
          .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 })
          .toBuffer();
        reference = this.emitFile({ type: 'asset', name: `${path.basename(file, path.extname(file))}.webp`, source });
        references.set(file, reference);
      }
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
  };
}

export default defineConfig({
  plugins: [optimizeImportedImages(), react()],
  server: {
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
    proxy: { '/api': 'http://localhost:8000', '/uploads': 'http://localhost:8000' },
  },
});
