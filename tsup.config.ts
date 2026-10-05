import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/server/index.ts' },
  outDir: 'dist/server',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  clean: true,
  // les dépendances restent dans node_modules (libsql a des binaires natifs par plateforme)
  skipNodeModulesBundle: true,
});
