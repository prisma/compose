/**
 * The ops service's request handling — a minimal admin passthrough proving
 * the admin port wires to a SECOND service (least-privilege by wiring).
 * Routing is Hono, the email example's pattern.
 *
 *   /admin/find-user             → POST { email } → findUser
 *   /admin/revoke-user-sessions  → POST { userId } → revokeUserSessions
 *   /health                      → 200
 */
import type { Client } from '@prisma/composer/service-rpc';
import type { authAdminContract } from '@prisma/composer-prisma-cloud/auth';
import { type } from 'arktype';
import { Hono } from 'hono';

const findUserBody = type({ email: 'string' });
const revokeBody = type({ userId: 'string' });

export interface OpsDeps {
  /** The admin rpc port, typed straight off its contract — the same client shape `rpc(authAdminContract)` hydrates. */
  readonly admin: Client<typeof authAdminContract>;
}

export function createOpsApp(deps: OpsDeps): (request: Request) => Promise<Response> {
  const app = new Hono();

  app.post('/admin/find-user', async (c) => {
    const body = findUserBody(await c.req.json().catch(() => undefined));
    if (body instanceof type.errors) return c.json({ error: 'email required' }, 400);
    return c.json(await deps.admin.findUser({ email: body.email }));
  });

  app.post('/admin/revoke-user-sessions', async (c) => {
    const body = revokeBody(await c.req.json().catch(() => undefined));
    if (body instanceof type.errors) return c.json({ error: 'userId required' }, 400);
    return c.json(await deps.admin.revokeUserSessions({ userId: body.userId }));
  });

  app.all('/health', (c) => c.json({ ok: true }));
  app.notFound((c) => c.json({ error: 'not found' }, 404));

  return async (request) => app.fetch(request);
}
