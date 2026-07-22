/**
 * The extension's control entry (ADR-0017): `dirBuild()` returns the build
 * descriptor `prisma-composer.config.ts` lists. Deploy-only (ADR-0005): the
 * user builds their own runnable directory; `assemble` copies it verbatim
 * under `bundle/` and adds the framework's boot wrapper — it never bundles
 * or transforms the app's code.
 *
 * Unlike `node()`'s optional directory form, `dir()` is directory-only: `dir`
 * is always the built tree, resolved against `dirname(module)` (ADR-0004)
 * and copied whole, and `entry` names the file inside it that boots. Neither
 * path is discovered — the author states both and assemble copies exactly
 * what's named. Resolution, the symlink hard error, and the wrapper build
 * are shared with `node()`'s directory form (`../control/assemble-shared.ts`)
 * so the two can't drift.
 *
 * Artifact layout, identical to `node()`: `<workDir>/main.mjs` (the wrapper)
 * + `<workDir>/bundle/` (the copied tree). `Bundle.watch` is the resolved
 * `dir` (ADR-0041) — the whole directory is watched, recursively.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildAdapter } from '@internal/core';
import type { ExtensionDescriptor } from '@internal/core/config';
import type { AssembleInput, Bundle } from '@internal/core/deploy';
import type { DirBuildAdapter } from '../dir.ts';
import { assertOutsideWorkDir, buildWrapper, resolveDir } from './assemble-shared.ts';

export type { AssembleInput, Bundle } from '@internal/core/deploy';

/** Narrows the shared BuildAdapter to this extension's own descriptor — the value-level mirror of the registry routing on (extension, type). */
function isDirBuild(descriptor: BuildAdapter): descriptor is DirBuildAdapter {
  return descriptor.type === 'dir' && 'dir' in descriptor && typeof descriptor.dir === 'string';
}

export async function assemble(input: AssembleInput): Promise<Bundle> {
  if (!isDirBuild(input.build)) {
    throw new Error(
      `@prisma/composer/dir/control: expected a "dir" build adapter, got "${input.build.type}".`,
    );
  }
  const buildDescriptor = input.build;

  const serviceModule = fileURLToPath(buildDescriptor.module);
  const moduleDir = path.dirname(serviceModule);
  const resolved = await resolveDir(buildDescriptor.dir, buildDescriptor.entry, moduleDir);

  const workDir = path.join(input.cwd, '.prisma-composer', 'artifacts', input.address);
  assertOutsideWorkDir(resolved.dirPath, 'dir', workDir);

  await fs.promises.rm(workDir, { recursive: true, force: true });
  await fs.promises.mkdir(workDir, { recursive: true });

  await buildWrapper(serviceModule, workDir);

  await fs.promises.cp(resolved.dirPath, path.join(workDir, 'bundle'), { recursive: true });

  return {
    dir: workDir,
    entry: path.posix.join('bundle', resolved.entryRel),
    watch: [resolved.dirPath],
  };
}

/** The dir build extension descriptor — `prisma-composer.config.ts` lists it under `extensions`. */
export const dirBuild = (): ExtensionDescriptor => ({
  id: '@prisma/composer/dir',
  nodes: {
    dir: { kind: 'build', assemble },
  },
});
