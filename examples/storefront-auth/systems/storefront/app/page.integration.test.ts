/// <reference types="bun" />
/**
 * Integration proof (testing.md § Integration): the real request path — the
 * actual Next.js standalone entry, the real RPC client, real HTTP — driven
 * by `bootstrapService` against a fake auth listening on a loopback port. No
 * cloud, no deploy; `server.ts`/the Next build output are untouched. Run via
 * `bun test` (not vitest — the unit test's runner): it needs `Bun.serve` for
 * the loopback fake, and the H3 teardown decision (no `close()`) rests on
 * bun-test's per-file process isolation.
 *
 * storefront's build adapter is `nextjs()`: its `entry` is a bare filename
 * inside Next's standalone OUTPUT directory, not a path relative to
 * `build.module` — `bootstrapService`'s default derivation fits the `node`
 * adapter (see auth), not this one, so this test supplies its own boot
 * thunk, reusing the same standalone-path math
 * `@prisma/app-nextjs/control`'s deploy assembly uses (`nextStandaloneDir`).
 * Requires `next build` to have already produced `.next/standalone` (turbo's
 * `test` task depends on `build`, so `pnpm -w test` always has it).
 */
import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BuildAdapter } from '@prisma/app';
import { bootstrapService } from '@prisma/app/testing';
import type { NextjsBuildAdapter } from '@prisma/app-nextjs';
import { nextStandaloneDir } from '@prisma/app-nextjs/control';
import fakeAuthHandler from '@storefront-auth/auth/fake';
import storefrontService from '../src/service.ts';

const PORT = 4310;

function isNextjsBuild(build: BuildAdapter): build is NextjsBuildAdapter {
  return build.type === 'nextjs' && 'appDir' in build && typeof build.appDir === 'string';
}

/** Imports the built standalone `server.js` — Next's own entry, unmodified — exactly as the deploy artifact's bootstrap would. */
function bootStandaloneNext(build: NextjsBuildAdapter): () => Promise<void> {
  const moduleDir = path.dirname(fileURLToPath(build.module));
  const appDir = path.resolve(moduleDir, build.appDir);
  const entryPath = path.join(nextStandaloneDir(appDir), build.entry);
  return async () => {
    await import(pathToFileURL(entryPath).href);
  };
}

/** React renders adjacent text/expression children with an interleaved `<!-- -->` comment marker — strip it before asserting on rendered text (mirrors scripts/e2e-verify.sh's own technique). */
const stripComments = (html: string): string => html.replace(/<!--[^>]*-->/g, '');

describe('storefront -> auth round trip, driven over real HTTP (bootstrapService)', () => {
  it('renders auth.verify() -> { ok: true } served by the fake auth on a loopback port', async () => {
    if (!isNextjsBuild(storefrontService.build)) {
      throw new Error('expected the storefront service to use the nextjs build adapter');
    }

    const fake = Bun.serve({ port: 0, fetch: fakeAuthHandler });

    const app = await bootstrapService(
      storefrontService,
      { service: { port: PORT }, inputs: { auth: { url: fake.url.href } } },
      bootStandaloneNext(storefrontService.build),
    );

    const res = await app.fetch(new Request(app.url));
    const html = stripComments(await res.text());

    expect(html).toContain('Auth /verify says: true');
  });
});
