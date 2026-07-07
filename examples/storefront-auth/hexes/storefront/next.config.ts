import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The monorepo root: standalone file tracing must start here, or Next walks up
// to the outer checkout's lockfile and traces the wrong node_modules.
const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

// Standalone output is what Prisma Compute deploys — a self-contained server.js
// plus the minimal node_modules, not a `next start` dev server.
const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  // No `next/image` here. Default optimization traces `sharp` (a native binary)
  // into the standalone — built on this machine's platform (darwin), so on
  // Compute's linux VM its linux binary is missing and `bun` tries to auto-
  // install it at boot, filling the tiny disk (ENOSPC crash loop). Unoptimized
  // images drop the sharp dependency entirely.
  images: { unoptimized: true },
};

export default nextConfig;
