import { baseConfig } from '@internal/tsdown-config';
import { defineConfig } from 'tsdown';

// Single pass today (index only). D3/D4 add storage-service/storage-entrypoint
// passes alongside this one, following cron's tsdown.config.ts shape.
export default defineConfig([
  {
    ...baseConfig,
    entry: { index: 'src/index.ts' },
    exports: false,
    clean: true,
  },
]);
