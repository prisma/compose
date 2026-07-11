/**
 * The auth package's fake (testing.md § "the doubles"): an in-memory `verify`
 * — no Postgres, no db input — sharing the real `authContract` so its handler
 * map is typed against the same contract the real service exposes. Never
 * provisioned into a System (it has no db to own); consumed directly by
 * tests, `serve()`d on a loopback port for the integration proof.
 */
import { compute } from '@prisma/app-cloud';
import node from '@prisma/app-node';
import { serve } from '@prisma/app-rpc';
import { authContract } from './contract.ts';

const fakeAuth = compute({
  name: 'auth-fake',
  deps: {},
  build: node({ module: import.meta.url, entry: '../dist/fake.js' }),
  expose: { rpc: authContract },
});

export default serve(fakeAuth, {
  rpc: {
    verify: async ({ token }) => ({ ok: token.length > 0 }),
  },
});
