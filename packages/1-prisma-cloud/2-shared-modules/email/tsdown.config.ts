import { baseConfig } from '@internal/tsdown-config';
import { defineConfig } from 'tsdown';

// D1: only the authoring barrel exists (index). Later dispatches add the
// email-service and email-entrypoint/testing passes, mirroring storage's
// multi-pass shape (storage/tsdown.config.ts) — kept as separate passes with
// a hand-maintained `package.json#exports` because email-entrypoint stands
// alone and must fully inline its graph the way storage-entrypoint does.
export default defineConfig([
  {
    ...baseConfig,
    entry: { index: 'src/exports/index.ts' },
    exports: false,
    clean: true,
  },
]);
