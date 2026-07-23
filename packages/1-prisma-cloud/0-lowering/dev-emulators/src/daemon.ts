/**
 * The shared daemon layer (local-dev spec § 2): a machine-scoped registry of
 * running emulator daemons (`compute`, `buckets`), and `ensureDaemon` /
 * `stopDaemon` to start, adopt, or replace them. Every daemon is a detached,
 * `unref()`'d child process that outlives whatever called `ensureDaemon` —
 * the registry is how a later call finds it again.
 *
 * `registryRoot` defaults to `~/.prisma-composer/emulators/` and governs
 * every path this module manages for a given daemon: the registry JSON
 * itself, the daemon's own state directory, and its stdio log file. The
 * `{ registryRoot }` override exists solely so tests never touch the real
 * home directory; production code never passes it.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, StateFile } from './state-file.ts';

export type DaemonName = 'compute' | 'buckets';

export interface RegistryEntry {
  readonly pid: number;
  readonly port: number;
  readonly version: string;
  readonly logPath: string;
}

export interface DaemonRootOptions {
  /** Test-only isolation seam (local-dev spec § 2). Never passed by production code. */
  readonly registryRoot?: string;
}

const MIN_PORT = 4300;
const EXISTING_HEALTH_TIMEOUT_MS = 2000;
const START_HEALTH_BUDGET_MS = 10_000;
const HEALTH_POLL_INTERVAL_MS = 200;
const TERMINATE_GRACE_MS = 5000;
const TERMINATE_POLL_INTERVAL_MS = 150;
const LOCK_POLL_INTERVAL_MS = 250;
const LOCK_WAIT_BUDGET_MS = 10_000;

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function isEnoent(err: unknown): boolean {
  return isErrnoException(err) && err.code === 'ENOENT';
}

function isRegistryEntry(value: unknown): value is RegistryEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pid' in value &&
    typeof value.pid === 'number' &&
    'port' in value &&
    typeof value.port === 'number' &&
    'version' in value &&
    typeof value.version === 'string' &&
    'logPath' in value &&
    typeof value.logPath === 'string'
  );
}

interface HealthBody {
  readonly version: string;
}

function isHealthBody(value: unknown): value is HealthBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string'
  );
}

interface PackageJson {
  readonly version: string;
}

function isPackageJson(value: unknown): value is PackageJson {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `~/.prisma-composer/emulators/` — `registryRoot`'s default. */
export function defaultRegistryRoot(): string {
  return path.join(os.homedir(), '.prisma-composer', 'emulators');
}

/** `<registryRoot>/<name>.json`. */
export function registryFilePath(registryRoot: string, name: DaemonName): string {
  return path.join(registryRoot, `${name}.json`);
}

/** `<registryRoot>/<name>/` — the daemon's own `--state-dir`. */
export function daemonStateDir(registryRoot: string, name: DaemonName): string {
  return path.join(registryRoot, name);
}

/** `<registryRoot>/<name>.log` — the daemon's stdio log. */
export function daemonLogPath(registryRoot: string, name: DaemonName): string {
  return path.join(registryRoot, `${name}.log`);
}

/** Compute's root namespace is its own JSON admin API; buckets' root namespace is the S3 wire, so its health lives under `/_pcdev/`. */
export function healthPathFor(name: DaemonName): string {
  return name === 'compute' ? '/health' : '/_pcdev/health';
}

/**
 * The version of whichever package this compiled `daemon.ts` copy ended up
 * shipped inside — "this package's own version" everywhere in this module.
 * Walks UP from this file's own location to the nearest `package.json`,
 * rather than assuming a fixed directory depth: `ensureDaemon` (the caller
 * side) and the daemon program (`compute-main.mjs`/`buckets-main.mjs`) are
 * two separately bundled outputs that can land at different depths under
 * their package's `dist/` — in-repo, both are one level under
 * `@internal/dev-emulators/dist/`; published, `ensureDaemon`'s caller is one
 * level under `@prisma/composer-prisma-cloud/dist/` but the re-emitted
 * daemon program is two levels under `dist/dev/` (spec § 2's publish note).
 * Both still resolve to the SAME nearest package.json — their shared
 * package's — so the two sides' version strings agree.
 */
export function readOwnVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!isPackageJson(parsed)) {
        throw new Error(`could not read a version string from ${pkgPath}`);
      }
      return parsed.version;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `could not find a package.json above ${path.dirname(fileURLToPath(import.meta.url))}`,
      );
    }
    dir = parent;
  }
}

/** `process.kill(pid, 0)` existence probe — true unless the pid is provably gone (ESRCH). */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (isErrnoException(err) && err.code === 'EPERM') return true; // exists, just not ours
    return false;
  }
}

export async function readRegistryEntry(
  registryRoot: string,
  name: DaemonName,
): Promise<RegistryEntry | undefined> {
  return readJsonFile(registryFilePath(registryRoot, name), isRegistryEntry);
}

async function probeHealth(
  port: number,
  healthPath: string,
  timeoutMs: number,
): Promise<HealthBody | undefined> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${healthPath}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return undefined;
    const body: unknown = await res.json();
    return isHealthBody(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

async function pollUntilHealthy(
  port: number,
  healthPath: string,
  budgetMs: number,
): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  do {
    const remaining = deadline - Date.now();
    const health = await probeHealth(port, healthPath, Math.max(200, Math.min(1000, remaining)));
    if (health) return true;
    await sleep(HEALTH_POLL_INTERVAL_MS);
  } while (Date.now() < deadline);
  return false;
}

/** SIGTERM, wait up to `graceMs` for the pid to exit, then SIGKILL. A no-op if the pid is already gone. */
async function terminate(pid: number, graceMs: number): Promise<void> {
  if (!isPidAlive(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return; // gone between the liveness check and the signal
  }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return;
    await sleep(TERMINATE_POLL_INTERVAL_MS);
  }
  if (isPidAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

/** Every port recorded by any registry entry under `registryRoot` — the two daemons share one port pool. */
async function usedPorts(registryRoot: string): Promise<Set<number>> {
  let names: string[];
  try {
    names = await fsp.readdir(registryRoot);
  } catch (err) {
    if (isEnoent(err)) return new Set();
    throw err;
  }
  const ports = new Set<number>();
  for (const fname of names) {
    if (!fname.endsWith('.json')) continue;
    const entry = await readJsonFile(path.join(registryRoot, fname), isRegistryEntry);
    if (entry) ports.add(entry.port);
  }
  return ports;
}

function smallestUnused(used: ReadonlySet<number>, min: number): number {
  let port = min;
  while (used.has(port)) port++;
  return port;
}

type ObserveResult =
  | { readonly kind: 'healthy'; readonly entry: RegistryEntry }
  | { readonly kind: 'stale-version'; readonly entry: RegistryEntry }
  | { readonly kind: 'dead-or-unhealthy'; readonly entry: RegistryEntry }
  | { readonly kind: 'absent' };

/**
 * Reads the registry entry and classifies it. "dead-or-unhealthy" covers
 * both a provably dead pid AND a live pid that fails health — the latter
 * can't be confirmed as our daemon (a reused pid after a reboot, a hung
 * foreign process), so it is never signaled, only dropped.
 */
async function observeExisting(
  registryFile: string,
  healthPath: string,
  ownVersion: string,
): Promise<ObserveResult> {
  const entry = await readJsonFile(registryFile, isRegistryEntry);
  if (!entry) return { kind: 'absent' };
  if (!isPidAlive(entry.pid)) return { kind: 'dead-or-unhealthy', entry };
  const health = await probeHealth(entry.port, healthPath, EXISTING_HEALTH_TIMEOUT_MS);
  if (health && health.version === ownVersion) return { kind: 'healthy', entry };
  if (health && health.version !== ownVersion) return { kind: 'stale-version', entry };
  return { kind: 'dead-or-unhealthy', entry };
}

/** `<registryRoot>/.lock-<name>` — the concurrent-ensure protocol's atomic directory lock. */
function lockDirPath(registryRoot: string, name: DaemonName): string {
  return path.join(registryRoot, `.lock-${name}`);
}

/** The pid the lock's directory records, or `undefined` when the pid file doesn't exist yet (still mid-acquire) or is unreadable. */
async function readLockHolderPid(lockDir: string): Promise<number | undefined> {
  let raw: string;
  try {
    raw = await fsp.readFile(path.join(lockDir, 'pid'), 'utf8');
  } catch {
    return undefined;
  }
  const pid = Number(raw.trim());
  return Number.isInteger(pid) ? pid : undefined;
}

/**
 * Acquires `<registryRoot>/.lock-<name>` (spec § 2 "Concurrent-ensure
 * protocol"): atomic `mkdir` IS acquisition. On `EEXIST`, a dead holder's
 * lock is stale and removed for an immediate retry; a live (or
 * still-being-written) holder is polled every 250 ms up to a 10 s budget,
 * after which the pinned timeout error is thrown.
 */
async function acquireLock(registryRoot: string, name: DaemonName): Promise<void> {
  await fsp.mkdir(registryRoot, { recursive: true });
  const lockDir = lockDirPath(registryRoot, name);
  const deadline = Date.now() + LOCK_WAIT_BUDGET_MS;
  for (;;) {
    try {
      await fsp.mkdir(lockDir);
      await fsp.writeFile(path.join(lockDir, 'pid'), String(process.pid));
      return;
    } catch (err) {
      if (!isErrnoException(err) || err.code !== 'EEXIST') throw err;

      const holderPid = await readLockHolderPid(lockDir);
      if (holderPid !== undefined && !isPidAlive(holderPid)) {
        // A dead holder's lock is stale — remove it and retry immediately,
        // no budget consumed.
        await fsp.rm(lockDir, { recursive: true, force: true });
        continue;
      }
      // Alive holder, or the pid file hasn't been written yet (another
      // process is mid-acquire) — never remove a lock we can't prove is
      // stale. Poll within the budget.
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out waiting for another process ensuring the ${name} emulator — remove ${lockDir} if stale.`,
        );
      }
      await sleep(LOCK_POLL_INTERVAL_MS);
    }
  }
}

async function releaseLock(registryRoot: string, name: DaemonName): Promise<void> {
  await fsp.rm(lockDirPath(registryRoot, name), { recursive: true, force: true });
}

/**
 * Ensure the named daemon is running and healthy at this package's version,
 * starting or replacing it as needed (spec § 2 `daemon.ts`). Idempotent —
 * safe to call repeatedly, including across unrelated processes on the same
 * machine, and safe under concurrent callers across processes: the
 * observe→spawn→persist critical section is serialized per daemon name by
 * an atomic directory lock (the "Concurrent-ensure protocol").
 *
 * `entry` is the resolved absolute path to the daemon program to spawn —
 * the CALLER resolves it (local-dev spec § 2's publish note). This module
 * used to resolve it itself via `import.meta.resolve('@internal/dev-emulators/…')`,
 * which only works in-repo: `@internal/*` are private workspace packages a
 * published npm consumer never receives. The target extension resolves its
 * entries against the PUBLIC `@prisma/composer-prisma-cloud/dev/*` subpaths
 * instead, so the published dist is self-contained; tests resolve the
 * in-repo `@internal/dev-emulators/*-main` subpaths directly.
 */
export async function ensureDaemon(
  name: DaemonName,
  entry: string,
  opts: DaemonRootOptions = {},
): Promise<{ url: string }> {
  const registryRoot = opts.registryRoot ?? defaultRegistryRoot();
  const registryFile = registryFilePath(registryRoot, name);
  const healthPath = healthPathFor(name);
  const ownVersion = readOwnVersion();

  // Optimistic, unlocked fast path: the common case is "already running and
  // healthy", which needs no cross-process coordination at all.
  const quick = await observeExisting(registryFile, healthPath, ownVersion);
  if (quick.kind === 'healthy') {
    return { url: `http://127.0.0.1:${quick.entry.port}` };
  }

  await acquireLock(registryRoot, name);
  try {
    // Re-read under the lock — the previous holder may have already
    // finished the job while we were waiting to acquire it.
    const observed = await observeExisting(registryFile, healthPath, ownVersion);
    if (observed.kind === 'healthy') {
      return { url: `http://127.0.0.1:${observed.entry.port}` };
    }

    let reusablePort: number | undefined;
    if (observed.kind === 'stale-version') {
      // This IS our daemon, just stale — replace it.
      reusablePort = observed.entry.port;
      await terminate(observed.entry.pid, TERMINATE_GRACE_MS);
      await fsp.rm(registryFile, { force: true });
    } else if (observed.kind === 'dead-or-unhealthy') {
      reusablePort = observed.entry.port;
      await fsp.rm(registryFile, { force: true });
    }

    // Port allocation happens inside the lock, so two daemons can never
    // claim one port.
    const port = reusablePort ?? smallestUnused(await usedPorts(registryRoot), MIN_PORT);
    const stateDir = daemonStateDir(registryRoot, name);
    const logPath = daemonLogPath(registryRoot, name);
    await fsp.mkdir(stateDir, { recursive: true });
    await fsp.mkdir(path.dirname(logPath), { recursive: true });

    const logFd = fs.openSync(logPath, 'a');
    let child: ChildProcess;
    try {
      child = spawn(process.execPath, [entry, '--port', String(port), '--state-dir', stateDir], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
      });
    } finally {
      fs.closeSync(logFd);
    }
    child.unref();
    if (child.pid === undefined) {
      throw new Error(`failed to spawn the ${name} emulator — see ${logPath}.`);
    }

    await new StateFile<RegistryEntry>(registryFile).write({
      pid: child.pid,
      port,
      version: ownVersion,
      logPath,
    });

    const healthy = await pollUntilHealthy(port, healthPath, START_HEALTH_BUDGET_MS);
    if (!healthy) {
      // Never leave an unsupervised, never-healthy process running: a spawn
      // that didn't come up (a squatted port, a broken build) must not
      // leak, even though the happy-path child is deliberately detached to
      // outlive this call. Drop the registry entry too — it would
      // otherwise point at a pid we just killed.
      await terminate(child.pid, TERMINATE_GRACE_MS);
      await fsp.rm(registryFile, { force: true });
      throw new Error(`${name} emulator failed to start on port ${port} — see ${logPath}.`);
    }
    return { url: `http://127.0.0.1:${port}` };
  } finally {
    await releaseLock(registryRoot, name);
  }
}

/** SIGTERM/SIGKILL + registry cleanup. Not called by any v1 command — an operator escape hatch, exported for tests. */
export async function stopDaemon(name: DaemonName, opts: DaemonRootOptions = {}): Promise<void> {
  const registryRoot = opts.registryRoot ?? defaultRegistryRoot();
  const registryFile = registryFilePath(registryRoot, name);
  const entry = await readJsonFile(registryFile, isRegistryEntry);
  if (entry) {
    await terminate(entry.pid, TERMINATE_GRACE_MS);
  }
  await fsp.rm(registryFile, { force: true });
}
