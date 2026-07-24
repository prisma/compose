import { type } from 'arktype';
import service from '../../src/service.ts';

/**
 * `POST /session` — the explicit instant-logout lookup: resolve a session token
 * against the auth module's `session` port. Unlike `/me`, this hits the store,
 * so a revoked session returns `{ session: null, user: null }` immediately.
 */
export const dynamic = 'force-dynamic';

const sessionBody = type({ token: 'string' });

export async function POST(request: Request): Promise<Response> {
  const body = sessionBody(await request.json().catch(() => undefined));
  if (body instanceof type.errors)
    return Response.json({ error: 'token required' }, { status: 400 });
  return Response.json(await service.load().session.getSession({ token: body.token }));
}
