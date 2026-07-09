import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findPackageDir } from '../package-anchor.ts';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'makerkit-cli-anchor-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('findPackageDir()', () => {
  test('finds package.json in the same directory as the file', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    const file = path.join(dir, 'service.ts');

    expect(findPackageDir(file, 'the service')).toBe(dir);
  });

  test('walks up through nested directories to find package.json', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    const nested = path.join(dir, 'src', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    const file = path.join(nested, 'service.ts');

    expect(findPackageDir(file, 'the service')).toBe(dir);
  });

  test('throws naming the failing path when no package.json exists above it', () => {
    // A tmp root has no package.json anywhere above it up to the filesystem root.
    const dir = makeTmpDir();
    const file = path.join(dir, 'service.ts');

    expect(() => findPackageDir(file, 'the service')).toThrow(/needs a package anchor/);
    expect(() => findPackageDir(file, 'the service')).toThrow(
      new RegExp(file.replace(/[/\\]/g, '.')),
    );
  });
});
