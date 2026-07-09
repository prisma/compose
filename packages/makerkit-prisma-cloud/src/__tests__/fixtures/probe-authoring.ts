// Bundle probe for the import-split guard: uses BOTH authoring entries (core
// and pack) the way a user service module would, with real value usage so
// nothing tree-shakes away.
import { configOf, Load } from '@makerkit/core';
import { compute, postgres } from '@makerkit/prisma-cloud';

const app = compute({
  name: 'test-service',
  url: 'file:///test/service.ts',
  deps: {
    db: postgres({
      name: 'test-resource',
      client: ({ url }) => ({ url }),
    }),
  },
  build: { kind: 'node', entry: 'server.js' },
});

export const graph = Load(app, { id: 'probe' });
export const manifest = configOf(app);
