/**
 * The api service's request handling, separated from `service.load()` so
 * `createApiApp` is a pure function of its already-hydrated deps — typed as
 * exactly what `service.load()` infers from `compute({ deps })`. Routing is
 * Hono — the app brings its own HTTP framework (the email example's pattern),
 * and since Hono's handler is a plain `Request → Response` function, the same
 * app runs behind `Bun.serve` in the deployed service (server.ts) and, in the
 * local integration test, behind that same entry booted by `bootstrapService`.
 *
 *   /api/auth/*  → authProxy(authApi)   (the browser golden path)
 *   /me          → Authorization: Bearer <jwt> verified STATELESSLY
 *   /session     → POST { token } → the session port's getSession
 *   /health      → 200
 */
import { authProxy } from '@prisma/composer-prisma-cloud/auth';
import { type } from 'arktype';
import { Hono } from 'hono';
import type apiService from './service.ts';

const sessionBody = type({ token: 'string' });

export function createApiApp(
  deps: ReturnType<typeof apiService.load>,
): (request: Request) => Promise<Response> {
  const proxy = authProxy(deps.authApi);
  const app = new Hono();

  app.all('/api/auth', (c) => proxy(c.req.raw));
  app.all('/api/auth/*', (c) => proxy(c.req.raw));

  app.all('/me', async (c) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    // No DB access on this path — that is the JWT binding's whole value.
    const verified = token === '' ? null : await deps.verifier.verify(token);
    if (verified === null) return c.json({ error: 'unauthorized' }, 401);
    return c.json({
      userId: verified.userId,
      email: verified.email,
      sessionId: verified.sessionId,
    });
  });

  app.post('/session', async (c) => {
    const body = sessionBody(await c.req.json().catch(() => undefined));
    if (body instanceof type.errors) return c.json({ error: 'token required' }, 400);
    return c.json(await deps.session.getSession({ token: body.token }));
  });

  app.all('/health', (c) => c.json({ ok: true }));
  app.notFound((c) => c.json({ error: 'not found' }, 404));

  return async (request) => app.fetch(request);
}
