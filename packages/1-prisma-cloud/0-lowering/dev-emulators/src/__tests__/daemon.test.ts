/**
 * The shared daemon layer (local-dev spec § 2 `daemon.ts`): ensure/health,
 * version-skew restart, and survival past the calling process's exit. Every
 * test uses a temp `registryRoot` and stops every daemon it started.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bucketsClient, computeClient } from '../client.ts';
import {
  type DaemonName,
  ensureDaemon,
  isPidAlive,
  type RegistryEntry,
  readOwnVersion,
  registryFilePath,
  stopDaemon,
} from '../daemon.ts';
import { tempDir, waitFor } from './helpers.ts';

let registryRoot: string;
const started = new Set<DaemonName>();

beforeEach(() => {
  registryRoot = tempDir('daemon-registry');
  started.clear();
});

afterEach(async () => {
  for (const name of started) {
    await stopDaemon(name, { registryRoot }).catch(() => undefined);
  }
  fs.rmSync(registryRoot, { recursive: true, force: true });
});

async function ensure(name: DaemonName): Promise<{ url: string }> {
  const result = await ensureDaemon(name, { registryRoot });
  started.add(name);
  return result;
}

function readEntry(name: DaemonName): RegistryEntry {
  const raw = fs.readFileSync(registryFilePath(registryRoot, name), 'utf8');
  return JSON.parse(raw) as RegistryEntry;
}

/** Runs the `ensure-and-print` fixture as a real, separate OS process and resolves with what it printed. */
function ensureInSeparateProcess(name: DaemonName): Promise<{ url: string }> {
  const fixture = fileURLToPath(new URL('./fixtures/ensure-and-print.ts', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn('bun', [fixture, name, registryRoot], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`ensure-and-print exited ${String(code)}: ${err}`));
        return;
      }
      try {
        resolve(JSON.parse(out.trim()) as { url: string });
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

/** A real, spawned scratch process — used as a fake lock holder with a genuine, checkable pid. */
function spawnScratchProcess(script: string): ChildProcess {
  return spawn('bun', ['-e', script], { stdio: 'ignore' });
}

function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
  });
}

describe('ensureDaemon', () => {
  test('starts a fresh daemon and its /health reports this package version', async () => {
    const { url } = await ensure('compute');
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string };
    expect(body.version).toBe(readOwnVersion());
  });

  test('is idempotent — a second call returns the same daemon without restarting it', async () => {
    const first = await ensure('compute');
    const before = readEntry('compute');
    const second = await ensureDaemon('compute', { registryRoot });
    expect(second.url).toBe(first.url);
    const after = readEntry('compute');
    expect(after.pid).toBe(before.pid);
  });

  test('compute health lives at /health, buckets health at /_pcdev/health', async () => {
    const compute = await ensure('compute');
    const buckets = await ensure('buckets');
    expect((await fetch(`${compute.url}/health`)).status).toBe(200);
    expect((await fetch(`${buckets.url}/_pcdev/health`)).status).toBe(200);
    expect((await fetch(`${buckets.url}/health`)).status).toBe(200);
  });

  test('compute and buckets get distinct ports starting at 4300', async () => {
    const compute = await ensure('compute');
    const buckets = await ensure('buckets');
    const computePort = new URL(compute.url).port;
    const bucketsPort = new URL(buckets.url).port;
    expect(computePort).not.toBe(bucketsPort);
    expect(Number(computePort)).toBeGreaterThanOrEqual(4300);
    expect(Number(bucketsPort)).toBeGreaterThanOrEqual(4300);
  });

  test('a daemon reporting a stale version at /health is stopped and replaced by a fresh daemon on the same port', async () => {
    // A real, killable process standing in for "our daemon, but started by
    // an older build" — /health's OWN response is what ensureDaemon
    // compares against this package's version, not the registry file's
    // (merely persisted, not re-verified) `version` field.
    const fixture = fileURLToPath(new URL('./fixtures/fake-versioned-daemon.ts', import.meta.url));
    const port = 4300;
    const logPath = path.join(registryRoot, 'compute.log');
    const fake = spawn('bun', [fixture, '--port', String(port), '--version', '0.0.0-stale'], {
      stdio: 'ignore',
    });
    const fakePid = fake.pid;
    if (fakePid === undefined) throw new Error('failed to spawn the fake daemon fixture');

    await waitFor(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${String(port)}/health`);
        return res.ok;
      } catch {
        return false;
      }
    }, 5000);

    fs.mkdirSync(registryRoot, { recursive: true });
    fs.writeFileSync(
      registryFilePath(registryRoot, 'compute'),
      JSON.stringify({ pid: fakePid, port, version: '0.0.0-stale', logPath }),
    );

    const second = await ensureDaemon('compute', { registryRoot });
    started.add('compute');

    expect(isPidAlive(fakePid)).toBe(false);
    const after = readEntry('compute');
    expect(after.pid).not.toBe(fakePid);
    expect(after.version).toBe(readOwnVersion());
    expect(new URL(second.url).port).toBe(String(port));

    const health = (await (await fetch(`${second.url}/health`)).json()) as { version: string };
    expect(health.version).toBe(readOwnVersion());
  }, 15_000);

  test('failed start surfaces the pinned error naming the daemon, port, and log path', async () => {
    // A foreign process squatting on the port the daemon would use: health
    // never succeeds, so `ensureDaemon` must time out with the pinned
    // message rather than hang or throw something else.
    const squatter = Bun.serve({ port: 0, fetch: () => new Response('not the emulator') });
    try {
      await expect(
        (async () => {
          fs.mkdirSync(registryRoot, { recursive: true });
          fs.writeFileSync(
            registryFilePath(registryRoot, 'compute'),
            JSON.stringify({
              pid: process.pid,
              port: squatter.port,
              version: readOwnVersion(),
              logPath: path.join(registryRoot, 'compute.log'),
            }),
          );
          return ensureDaemon('compute', { registryRoot });
        })(),
      ).rejects.toThrow(
        new RegExp(
          `compute emulator failed to start on port ${String(squatter.port)} — see .*compute\\.log`,
        ),
      );
    } finally {
      squatter.stop(true);
    }
  }, 15_000);
});

describe('stopDaemon', () => {
  test('terminates the process and removes the registry entry', async () => {
    await ensure('compute');
    const entry = readEntry('compute');
    expect(isPidAlive(entry.pid)).toBe(true);

    await stopDaemon('compute', { registryRoot });
    started.delete('compute');

    expect(isPidAlive(entry.pid)).toBe(false);
    expect(fs.existsSync(registryFilePath(registryRoot, 'compute'))).toBe(false);
  });
});

describe('daemon survival', () => {
  test('the daemon outlives the process that called ensureDaemon', async () => {
    const fixture = fileURLToPath(new URL('./fixtures/spawn-and-exit.ts', import.meta.url));
    const child = spawn('bun', [fixture, 'compute', registryRoot], { stdio: 'pipe' });
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code));
    });
    expect(exitCode).toBe(0);
    started.add('compute');

    const entry = readEntry('compute');
    expect(isPidAlive(entry.pid)).toBe(true);
    const res = await fetch(`http://127.0.0.1:${String(entry.port)}/health`);
    expect(res.status).toBe(200);
  });
});

describe('loopback clients', () => {
  test('computeClient throws the pinned not-running error when no daemon is registered', () => {
    expect(() => computeClient({ registryRoot })).toThrow(
      "the compute emulator is not running — `prisma-composer dev` starts it via the extension's dev.emulators hook.",
    );
  });

  test('bucketsClient throws the pinned not-running error when no daemon is registered', () => {
    expect(() => bucketsClient({ registryRoot })).toThrow(
      "the buckets emulator is not running — `prisma-composer dev` starts it via the extension's dev.emulators hook.",
    );
  });

  test('computeClient throws when the registered pid is dead', async () => {
    await ensure('compute');
    const entry = readEntry('compute');
    await stopDaemon('compute', { registryRoot });
    started.delete('compute');
    // Recreate a registry entry pointing at the now-dead pid — a crash
    // without a clean unregister, the "dead" half of "dead or absent".
    fs.writeFileSync(registryFilePath(registryRoot, 'compute'), JSON.stringify(entry));
    expect(() => computeClient({ registryRoot })).toThrow(/not running/);
  });

  test('computeClient works end to end once a daemon is running', async () => {
    await ensure('compute');
    const client = computeClient({ registryRoot });
    const health = await client.health();
    expect(health.version).toBe(readOwnVersion());
  });
});

describe('concurrent-ensure protocol', () => {
  test('two concurrent ensureDaemon calls from separate processes produce exactly one daemon and agree on its URL', async () => {
    // Truly concurrent: both processes are spawned before either is
    // awaited, so the race is real, not just two promises in one event
    // loop — the mutex under test is an inter-process lock.
    const [a, b] = await Promise.all([
      ensureInSeparateProcess('compute'),
      ensureInSeparateProcess('compute'),
    ]);
    started.add('compute');

    expect(a.url).toBe(b.url);

    const entry = readEntry('compute');
    expect(isPidAlive(entry.pid)).toBe(true);
    expect(`http://127.0.0.1:${String(entry.port)}`).toBe(a.url);

    // Exactly one compute-main process is actually running for this
    // registryRoot — not two racing spawns that both happened to land on
    // the daemon eventually reporting the same (winning) URL. `-fl`
    // (not `-af` — macOS's `pgrep -a` means "include ancestors", unlike
    // GNU pgrep) matches the full argument list and prints it, so we can
    // filter by this test's own registryRoot. Polled briefly: under a
    // heavily loaded machine (many other daemons from concurrent test
    // files) a bare snapshot can transiently race the OS reporting the
    // just-spawned process, which is a verification-timing gap, not
    // evidence of a double-spawn.
    function matchCount(): number {
      const pgrep = spawnSync('pgrep', ['-fl', 'compute-main.mjs']);
      return (pgrep.stdout?.toString() ?? '')
        .split('\n')
        .filter((line) => line.includes(registryRoot)).length;
    }
    await waitFor(() => matchCount() === 1, 3000, 100);
    expect(matchCount()).toBe(1);
  }, 20_000);

  test('a stale lock dir (dead holder pid) is broken and ensure proceeds', async () => {
    const lockDir = path.join(registryRoot, '.lock-compute');
    fs.mkdirSync(lockDir, { recursive: true });

    // A real pid, guaranteed dead: spawn a scratch process and wait for it
    // to exit before recording its (now-reaped) pid as the lock holder.
    const scratch = spawnScratchProcess('process.exit(0)');
    await waitForExit(scratch);
    const deadPid = scratch.pid;
    if (deadPid === undefined) throw new Error('failed to spawn a scratch process for a dead pid');
    fs.writeFileSync(path.join(lockDir, 'pid'), String(deadPid));

    const result = await ensure('compute');
    expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    // The lock is released once ensureDaemon is done with it.
    expect(fs.existsSync(lockDir)).toBe(false);
  });

  test('a held lock with a live holder times out with the pinned error', async () => {
    const lockDir = path.join(registryRoot, '.lock-compute');
    fs.mkdirSync(lockDir, { recursive: true });

    // A real, long-lived scratch process standing in as the lock holder.
    const holder = spawnScratchProcess('setInterval(() => {}, 1000);');
    const holderPid = holder.pid;
    if (holderPid === undefined) throw new Error('failed to spawn a scratch holder process');
    fs.writeFileSync(path.join(lockDir, 'pid'), String(holderPid));

    try {
      await expect(ensureDaemon('compute', { registryRoot })).rejects.toThrow(
        `timed out waiting for another process ensuring the compute emulator — remove ${lockDir} if stale.`,
      );
    } finally {
      holder.kill('SIGKILL');
    }
  }, 15_000);
});
