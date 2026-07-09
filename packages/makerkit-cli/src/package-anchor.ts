/**
 * ADR-0004's resolution step: from a file on disk, walk up to the nearest
 * `package.json` — that directory anchors a build adapter's relative `entry`
 * paths. Used both for the entry module (where `.makerkit/` is generated)
 * and for each service node's `url` (where its assembler runs).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CliError } from './cli-error.ts';

export function findPackageDir(startFile: string, describe: string): string {
  let dir = path.dirname(startFile);
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new CliError(
        `No package.json found above "${startFile}" — ${describe} needs a package anchor ` +
          '(every service must live inside an npm/pnpm package; see ADR-0004).',
      );
    }
    dir = parent;
  }
}
