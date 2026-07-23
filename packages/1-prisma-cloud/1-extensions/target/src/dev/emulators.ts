/**
 * Dev emulator bring-up (local-dev spec § 5, ADR-0041 D4): ensures the
 * machine-scoped daemons this topology's node kinds need. Compute is always
 * ensured — every app has services; buckets only when the graph actually
 * uses the `s3` resource kind. Postgres needs no pre-start — its instances
 * are created lazily by `Database`'s local provider through the ORM CLI.
 *
 * Idempotent: `ensureDaemon` itself adopts an already-healthy daemon, so
 * repeated `prisma-composer dev` sessions are cheap.
 *
 * Entry resolution (spec § 2's publish note): `ensureDaemon` no longer
 * resolves its own daemon program — it takes the resolved `entry` path from
 * its caller. This extension resolves against the PUBLIC
 * `@prisma/composer-prisma-cloud/dev/*` subpaths (not the private
 * `@internal/dev-emulators` ones), so a published install's `dev` command
 * finds its daemon programs in its own dependency tree.
 */
import type { DevEmulatorsInput } from '@internal/core/config';
import type { DaemonName } from '@internal/dev-emulators';
import { ensureDaemon } from '@internal/dev-emulators';
import { resolvePackageEntry } from '@internal/lowering/dev';

function usesBuckets(input: DevEmulatorsInput): boolean {
  return input.graph.nodes.some((n) => n.node.kind === 'resource' && n.node.type === 's3');
}

/** The resolved absolute path to this daemon's published entrypoint. */
function daemonEntry(name: DaemonName): string {
  return resolvePackageEntry(`@prisma/composer-prisma-cloud/dev/${name}-main`);
}

export async function runDevEmulators(input: DevEmulatorsInput): Promise<void> {
  const { url: computeUrl } = await ensureDaemon('compute', daemonEntry('compute'));
  console.log(`[dev] compute emulator ready at ${computeUrl}`);

  if (usesBuckets(input)) {
    const { url: bucketsUrl } = await ensureDaemon('buckets', daemonEntry('buckets'));
    console.log(`[dev] buckets emulator ready at ${bucketsUrl}`);
  }
}
