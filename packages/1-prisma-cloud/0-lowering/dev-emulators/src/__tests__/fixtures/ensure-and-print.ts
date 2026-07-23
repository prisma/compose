/**
 * Test fixture: calls `ensureDaemon` and prints the result as JSON on
 * stdout, so a test driving TWO of these as separate OS processes can
 * compare what each one observed — the concurrent-ensure protocol is an
 * inter-process lock, so the mutex under test only exists across real
 * processes, never across two promises in one. Run standalone via
 * `bun <this file> <compute|buckets> <registryRoot>`.
 */
import { fileURLToPath } from 'node:url';
import { type DaemonName, ensureDaemon } from '../../daemon.ts';

function isDaemonName(value: string | undefined): value is DaemonName {
  return value === 'compute' || value === 'buckets';
}

const [, , name, registryRoot] = process.argv;
if (!isDaemonName(name)) {
  throw new Error(`ensure-and-print fixture: expected "compute" or "buckets", got ${String(name)}`);
}
if (!registryRoot) {
  throw new Error('ensure-and-print fixture: registryRoot argument is required');
}

const entry = fileURLToPath(import.meta.resolve(`@internal/dev-emulators/${name}-main`));
const result = await ensureDaemon(name, entry, { registryRoot });
console.log(JSON.stringify(result));
