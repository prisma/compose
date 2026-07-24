import service from '../../src/service.ts';

/**
 * `/me` — stateless identity: verify the `Authorization: Bearer <jwt>` against
 * the auth instance's JWKS with NO database access (that is the JWT binding's
 * whole value). Survives session revocation until the JWT expires — the
 * stateless trade-off the session port makes explicit.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const verified = token === '' ? null : await service.load().verifier.verify(token);
  if (verified === null) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json({
    userId: verified.userId,
    email: verified.email,
    sessionId: verified.sessionId,
  });
}
