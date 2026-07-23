/** Shared test-only helpers: temp dirs, fixture bootstraps, small async waits. */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DaemonName } from '../daemon.ts';

/**
 * `ensureDaemon` no longer resolves its own entry (spec § 2's publish note —
 * the caller does, so the published dist can point at its own public
 * subpaths). In-repo tests resolve the in-repo `@internal/dev-emulators/*-main`
 * subpaths directly — the same resolution `daemon.ts` used to do internally.
 */
export function entryFor(name: DaemonName): string {
  return fileURLToPath(import.meta.resolve(`@internal/dev-emulators/${name}-main`));
}

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
