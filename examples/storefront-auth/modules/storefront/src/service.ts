import nextjs from '@prisma/compose/nextjs';
import { rpc } from '@prisma/compose/rpc';
import { compute } from '@prisma/compose-prisma-cloud';
import { authContract } from '@storefront-auth/auth/contract';

export default compute({
  name: 'storefront',
  deps: { auth: rpc(authContract) },
  // `appDir` is the Next app root; `next build` (output: standalone) is all the
  // app does — deploy assembly copies the standalone tree and the static/public
  // assets Next omits, and locates server.js itself.
  build: nextjs({ module: import.meta.url, appDir: '..' }),
});
