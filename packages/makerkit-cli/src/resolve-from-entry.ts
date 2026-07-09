/**
 * Resolves a pack's subpath entry (e.g. a target's `/target` or an adapter's
 * `/assemble`) anchored at the app's entry package, not at the CLI's own
 * location (ADR-0004's package-anchor idea, applied to module resolution).
 * This is what lets the CLI ship with no dependency on any specific pack: the
 * pack only needs to appear in the APP's own dependency tree.
 *
 * Anchoring uses `createRequire(entryPkgDir/package.json).resolve(...)`.
 * Node's CJS resolver still honors a package's `exports` map for require()
 * (not just import()), and bun's `createRequire` follows the same contract —
 * both verified against fixture packages under both runtimes. `import.meta.resolve()`
 * was ruled out: node's version resolves only relative to the calling module
 * with no parent argument, so it can't be anchored at an arbitrary directory.
 */
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CliError } from './cli-error.ts';

/**
 * The runtimes disagree on resolution-failure codes. A fully absent pack is
 * "MODULE_NOT_FOUND" on both. A pack that is present but does not export the
 * requested subpath is "ERR_PACKAGE_PATH_NOT_EXPORTED" on node but still
 * "MODULE_NOT_FOUND" on bun. Bun also throws its own ResolveMessage — NOT an
 * Error instance — so this checks .code directly rather than narrowing via
 * `instanceof Error` first.
 */
const RESOLUTION_FAILURE_CODES = new Set([
  'MODULE_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
]);

function resolutionFailureCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = String(error.code);
  return RESOLUTION_FAILURE_CODES.has(code) ? code : undefined;
}

/** The specifier `${pack}/${subpath}`, resolved from `entryPkgDir` and imported. */
export async function importFromEntry(
  entryPkgDir: string,
  pack: string,
  subpath: string,
): Promise<unknown> {
  const specifier = `${pack}/${subpath}`;
  const require = createRequire(path.join(entryPkgDir, 'package.json'));

  let resolved: string;
  try {
    resolved = require.resolve(specifier);
  } catch (error) {
    const code = resolutionFailureCode(error);
    if (code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
      throw new CliError(
        `"${pack}" is installed but does not export "./${subpath}" ` +
          `(resolved from ${entryPkgDir}) — the installed version may be too old or not a ` +
          'MakerKit pack.',
      );
    }
    if (code !== undefined) {
      throw new CliError(
        `Cannot resolve "${specifier}" from ${entryPkgDir} — the app's package (the one ` +
          `containing the entry module) must depend on "${pack}".`,
      );
    }
    throw error;
  }

  return import(pathToFileURL(resolved).href);
}
