/**
 * Marks a service's runnable as a whole built directory — a server plus the
 * sibling files it needs at runtime (a client bundle, CSS, images), as a
 * build like Bun's HTML import emits.
 *
 * `dir({ module, dir, entry })`: `module` is the authoring module's
 * `import.meta.url`; `dir` names the built directory and `entry` the file
 * inside it that boots, both resolved relative to `dirname(module)` — `dir`
 * like an import specifier (ADR-0004), `entry` then inside `dir` and may be
 * nested. Nothing is discovered: the author names the directory and the
 * entry, and the assembler copies exactly that, verbatim.
 *
 * `dir()` is the directory-only sibling of `node()` — reach for `node()`
 * when the build is a single self-contained file.
 *
 * Returns plain data — nothing runs on import. `extension` + `type` are the
 * control-plane registry key: deploy tooling routes assembly through the
 * app's `prisma-composer.config.ts` to this package's `/dir/control`
 * descriptor (ADR-0017).
 */
import type { BuildAdapter } from '@internal/core';

/** The `dir()` build adapter's descriptor — `dir` is always present, unlike `node()`'s optional directory form. */
export interface DirBuildAdapter extends BuildAdapter {
  readonly type: 'dir';
  readonly dir: string;
}

interface DirBuildOptions {
  readonly module: string;
  readonly dir: string;
  readonly entry: string;
}

const dirBuild = (opts: DirBuildOptions): DirBuildAdapter => ({
  extension: '@prisma/composer/dir',
  type: 'dir',
  module: opts.module,
  dir: opts.dir,
  entry: opts.entry,
});

export default dirBuild;
