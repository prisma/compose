import { defineConfig } from '@internal/tsdown-config';

export default defineConfig({
  entry: {
    index: 'src/exports/index.ts',
    control: 'src/exports/control.ts',
    dir: 'src/exports/dir.ts',
    'dir-control': 'src/exports/dir-control.ts',
  },
});
