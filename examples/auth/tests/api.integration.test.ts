/// <reference types="bun" />
/**
 * The Next api service's integration proof (testing.md § Integration): the REAL
 * request path — the actual Next.js standalone entry, served over real HTTP
 * against a loopback fake for `deps.authApi`. Deps are INFERRED from the service
 * node (no hand-declared ApiDeps); the standalone reads them from the
 * framework's address-free config keys (`COMPOSER_<input>_URL`), the same rows a
 * deploy writes.
 *
 * The standalone is booted as a child `node` process via the same seam the
 * deploy assembler uses to locate `server.js` (`standaloneServerPath`). A deploy
 * boots it as a subprocess through `bootstrap.js`, not in-process, so this test
 * does the same. It proves the Next service boots and its wiring is live: the
 * Better Auth UI renders, the JSON demo routes answer, and `/api/auth/*`
 * forwards to `deps.authApi`. The full signup → verify → sign-in loop against a
 * REAL auth server is proven in the browser (README: `pnpm dev`).
 *
 * Requires `next build` to have produced `.next/standalone` (turbo's `test` task
 * depends on `build`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import apiService from '@example-auth/api';
import type { BuildAdapter } from '@prisma/composer';
import type { NextjsBuildAdapter } from '@prisma/composer/nextjs';
import { standaloneServerPath } from '@prisma/composer/nextjs/control';
import type { Server, Subprocess } from 'bun';

const PORT = 4318;
const BASE = `http://localhost:${PORT}`;

function isNextjsBuild(build: BuildAdapter): build is NextjsBuildAdapter {
  return build.type === 'nextjs' && 'appDir' in build && typeof build.appDir === 'string';
}

async function waitForReady(): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(150);
  }
  throw new Error('standalone did not become ready on /health within 15s');
}

describe('the Next api standalone, booted as a deploy-shaped subprocess', () => {
  let upstream: Server<undefined>;
  let server: Subprocess;

  beforeAll(async () => {
    if (!isNextjsBuild(apiService.build)) {
      throw new Error('the api service must use the nextjs build adapter');
    }
    // A loopback stand-in for the auth service: the proxy forwards here.
    upstream = Bun.serve({
      port: 0,
      fetch: (req) => Response.json({ proxied: new URL(req.url).pathname }),
    });
    const dep = upstream.url.href;
    server = Bun.spawn(['node', standaloneServerPath(apiService.build)], {
      env: {
        ...process.env,
        PORT: String(PORT),
        COMPOSER_AUTHAPI_URL: dep,
        COMPOSER_VERIFIER_URL: dep,
        COMPOSER_SESSION_URL: dep,
        COMPOSER_OUTBOX_URL: dep,
      },
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await waitForReady();
  });
  afterAll(() => {
    server?.kill();
    upstream?.stop(true);
  });

  it('serves /health', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('renders the Better Auth UI sign-in view', async () => {
    const res = await fetch(`${BASE}/auth/sign-in`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Login');
  });

  it('forwards /api/auth/* to deps.authApi through the proxy', async () => {
    const res = await fetch(`${BASE}/api/auth/get-session`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ proxied: '/api/auth/get-session' });
  });

  it('/me rejects a missing bearer with 401 (stateless JWT path)', async () => {
    expect((await fetch(`${BASE}/me`)).status).toBe(401);
  });
});
