/**
 * The app's control-plane config (ADR-0017) — read ONLY by `prisma-composer
 * deploy`/`destroy`, never imported by app code. The api service is a Next.js
 * app, so `nextjsBuild()` is registered alongside `nodeBuild()` (ops) — deploy
 * assembly routes the standalone build through it (ADR-0005/ADR-0017).
 */
import { defineConfig } from '@prisma/composer/config';
import { nextjsBuild } from '@prisma/composer/nextjs/control';
import { nodeBuild } from '@prisma/composer/node/control';
import { prismaCloud, prismaState } from '@prisma/composer-prisma-cloud/control';

export default defineConfig({
  extensions: [prismaCloud(), nodeBuild(), nextjsBuild()],
  state: prismaState(),
});
