/** `/health` — liveness for the deployed smoke and the platform. */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ ok: true });
}
