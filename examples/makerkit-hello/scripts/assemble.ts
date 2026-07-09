// Thin caller of @makerkit/node/assemble (ADR-0005): the tsdown build above
// already produced dist/server.js (the app's runnable); this bundles the
// MakerKit wrapper and normalizes both into dist/bundle, the dir
// alchemy.run.ts's `bundle` points `lower()` at.
import { fileURLToPath } from 'node:url';
import { assemble } from '@makerkit/node/assemble';

const serviceDir = fileURLToPath(new URL('..', import.meta.url));

const result = await assemble({
  serviceDir,
  serviceModule: fileURLToPath(new URL('../src/service.ts', import.meta.url)),
  build: { kind: 'node', entry: 'dist/server.js' },
});

console.log(`Assembled ${result.dir}/${result.entry}`);
