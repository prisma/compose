/**
 * The RPC kind's network adapter — the client `rpc(contract)` hydrates to.
 * Reads the method names off the contract's `__cmp`, POSTs JSON to
 * `<url>/rpc/<method>`, and returns the response body as-is: per-call
 * validation is the server's job (`serve()` validates input and output), so
 * the client does not validate the response a second time. When a
 * `serviceKey` is supplied (ADR-0030), every request also carries
 * `Authorization: Bearer <serviceKey>`.
 */

import type { Contract } from '@internal/core';
import { blindCast } from '@internal/foundation/casts';
import type { Client, RpcFns } from './rpc.ts';

/**
 * A fetch-shaped transport. Defaults to the real `fetch`; a served handler
 * (`serve()`'s return value) works too — the binding does not have to be a
 * network hop.
 */
export type Transport = (req: Request) => Promise<Response>;

/** `<base>/rpc/<method>`, preserving a base URL's own path (e.g. a mount point). */
function methodUrl(base: string, method: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(`rpc/${method}`, normalizedBase).toString();
}

/** The server's `{ error }` body, if the response has one — undefined otherwise. */
async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    return typeof body === 'object' && body !== null && 'error' in body
      ? String(body.error)
      : undefined;
  } catch {
    return undefined;
  }
}

export function makeClient<C extends Contract<'rpc', RpcFns>>(
  contract: C,
  url: string,
  opts?: { fetch?: Transport; serviceKey?: string },
): Client<C> {
  const send = opts?.fetch ?? fetch;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts?.serviceKey !== undefined) {
    headers['Authorization'] = `Bearer ${opts.serviceKey}`;
  }
  const client: Record<string, (input: unknown) => Promise<unknown>> = {};

  for (const method of Object.keys(contract.__cmp)) {
    client[method] = async (input: unknown) => {
      const res = await send(
        new Request(methodUrl(url, method), {
          method: 'POST',
          headers,
          body: JSON.stringify(input),
        }),
      );
      if (!res.ok) {
        const detail = await errorDetail(res);
        throw new Error(
          `RPC call "${method}" failed: ${res.status} ${res.statusText}` +
            (detail !== undefined ? ` — ${detail}` : ''),
        );
      }
      return res.json();
    };
  }

  return blindCast<
    Client<C>,
    'client is assembled dynamically from the contract methods; each entry matches Client<C> by construction'
  >(client);
}
