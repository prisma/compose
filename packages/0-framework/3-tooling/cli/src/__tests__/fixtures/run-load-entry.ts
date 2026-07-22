/**
 * A minimal driver for `loadEntry` alone, spawned under real node (see
 * `jsx-load-error.test.ts`) — the full CLI (`bin.ts`) also requires a
 * discovered `prisma-composer.config.ts`, which this fixture doesn't need
 * to prove.
 */
import { loadEntry } from '../../load-entry.ts';

const entryArg = process.argv[2];
if (entryArg === undefined) throw new Error('usage: run-load-entry.ts <entry>');

loadEntry(entryArg, process.cwd())
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
