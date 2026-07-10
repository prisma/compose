import { defineConfig } from '@prisma/app-tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/deploy.ts', 'src/casts.ts', 'src/assertions.ts'],
});
