/** Shared test-only helpers: temp dirs, fixture bootstraps, small async waits. */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ComputeClient } from '../client.ts';
import { type DaemonName, ensureDaemon } from '../daemon.ts';

export function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dev-emulators-${prefix}-`));
}

/** Writes a `bootstrap.js` a real `bun` process can run, into a fresh temp artifact dir. */
export function writeBootstrap(source: string): string {
  const dir = tempDir('artifact');
  fs.writeFileSync(path.join(dir, 'bootstrap.js'), source);
  return dir;
}

/** A tiny HTTP server on `process.env['PORT']` that answers with `body`. */
export function servingBootstrap(body: string): string {
  return `Bun.serve({ port: Number(process.env['PORT']), fetch: () => new Response(${JSON.stringify(body)}) });\nconsole.log('booted: ${body}');\n`;
}

/** Exits immediately with a nonzero code — a fast-crashing service. */
export const CRASHING_BOOTSTRAP = 'process.exit(1);\n';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    }
    await sleep(intervalMs);
  }
}

/**
 * `compute-main` marks a service `running` as soon as it spawns the child —
 * matching the spec (spawning IS the observable action) — not once the
 * child has finished booting and bound its own port. Tests that then fetch
 * the service's own HTTP server need to retry past that short boot window.
 */
export async function waitForHttp(url: string, timeoutMs: number): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await fetch(url);
    } catch (err) {
      if (Date.now() >= deadline) throw err;
      await sleep(100);
    }
  }
}

const DEFAULT_MIN_PORT = 4300;

interface BindAttempt {
  readonly free: boolean;
  readonly code?: string;
}

/**
 * Binding is the only reliable way to ask "is this port free" — attempt it
 * and read the OS's own verdict rather than guessing. `EADDRINUSE` (someone
 * else is listening) and `EACCES` (privileged port, permission denied) both
 * mean "taken" for our purposes. Any other errno is a genuine surprise —
 * rethrow it loudly rather than silently treating it as "taken", which is
 * exactly the bug that made `findFreePort` fail closed on every port on a
 * CI runner that raised an errno this function didn't expect.
 */
function attemptBind(port: number, host: string): Promise<BindAttempt> {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve({ free: false, code: err.code });
        return;
      }
      reject(err);
    });
    probe.listen(port, host, () => {
      probe.close(() => resolve({ free: true }));
    });
  });
}

/**
 * A process already bound to `0.0.0.0` (all interfaces — e.g. `Bun.serve`'s
 * own default, unlike this package's own daemons, which always bind
 * `127.0.0.1` explicitly) does not stop a SEPARATE, narrower `127.0.0.1`
 * bind on the same port from succeeding — the two sockets coexist, and
 * which one actually receives an incoming request becomes ambiguous. A
 * port only counts as free here when NEITHER bind scope is already taken.
 *
 * The two attempts run SEQUENTIALLY, not concurrently: binding both
 * `127.0.0.1` and `0.0.0.0` to the very same port at the same time makes
 * the two probe sockets themselves overlap, and the kernel can refuse the
 * second bind with `EADDRINUSE` even though nothing else was ever using
 * the port — a self-inflicted collision, not a real one. Concurrent probes
 * happened to not collide on macOS but did on Linux CI, which is what
 * produced "no free port found in [4300, 4500)" on a runner where
 * virtually every port is genuinely free.
 */
async function checkPort(port: number): Promise<BindAttempt> {
  const loopback = await attemptBind(port, '127.0.0.1');
  if (!loopback.free) return loopback;
  return attemptBind(port, '0.0.0.0');
}

/** The first genuinely free port at or above `startFrom` — a shared machine may have unrelated processes already bound near the default port range. */
export async function findFreePort(startFrom: number = DEFAULT_MIN_PORT): Promise<number> {
  const codeCounts = new Map<string, number>();
  for (let port = startFrom; port < startFrom + 200; port++) {
    const result = await checkPort(port);
    if (result.free) return port;
    const code = result.code ?? 'unknown';
    codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
  }
  const observed = [...codeCounts.entries()]
    .map(([code, count]) => `${code}=${String(count)}`)
    .join(', ');
  throw new Error(
    `findFreePort: no free port found in [${String(startFrom)}, ${String(startFrom + 200)}) — observed errnos: ${observed}`,
  );
}

/**
 * Starts a daemon on a FRESH `registryRoot`, steered away from any port near
 * the default range occupied by a process this test doesn't control —
 * another local dev-emulators daemon on this machine, another concurrent
 * test run. Those are invisible to both this test's own registry and to
 * ensureDaemon's port-uniqueness bookkeeping (each is scoped to its own
 * registryRoot), so left unhandled they make an unrelated external bind
 * failure look like this suite's own flake. Only for a registryRoot with no
 * daemon started yet — later calls on the same root should use
 * `ensureDaemon` directly.
 */
export async function ensureFreshDaemon(
  name: DaemonName,
  registryRoot: string,
): Promise<{ url: string }> {
  const freePort = await findFreePort(DEFAULT_MIN_PORT);
  fs.mkdirSync(registryRoot, { recursive: true });
  for (let port = DEFAULT_MIN_PORT; port < freePort; port++) {
    fs.writeFileSync(
      path.join(registryRoot, `fake-occupant-${String(port)}.json`),
      JSON.stringify({ pid: process.pid, port, version: 'fake', logPath: '/dev/null' }),
    );
  }
  return ensureDaemon(name, { registryRoot });
}

const DEFAULT_MIN_SERVICE_PORT = 3000;

/**
 * Reserves dummy services on a fresh Compute daemon to push every REAL
 * service this test reserves afterward past any port near the default
 * service range already bound by a process outside this test's control —
 * unlike the daemon-registry case, a service's port is only chosen (never
 * verified against the real OS) at reservation time, so a service that
 * lands on a contended port fails to bind only once something actually
 * tries to `Bun.serve()` there.
 */
export async function skipContendedServicePorts(
  client: Pick<ComputeClient, 'ensureService'>,
  minPort: number = DEFAULT_MIN_SERVICE_PORT,
): Promise<void> {
  const freePort = await findFreePort(minPort);
  for (let i = 0; i < freePort - minPort; i++) {
    await client.ensureService('port-skip', `dummy-${String(i)}`);
  }
}
