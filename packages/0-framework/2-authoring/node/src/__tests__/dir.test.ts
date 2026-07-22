import { describe, expect, test } from 'bun:test';
import dir from '../exports/dir.ts';

describe('dir({ module, dir, entry })', () => {
  test('returns a plain { extension, type, module, dir, entry } build adapter descriptor', () => {
    expect(
      dir({ module: 'file:///app/src/service.ts', dir: '../dist/server', entry: 'start.js' }),
    ).toEqual({
      extension: '@prisma/composer/dir',
      type: 'dir',
      module: 'file:///app/src/service.ts',
      dir: '../dist/server',
      entry: 'start.js',
    });
  });

  test('carries dir and a nested entry through unmodified — both resolve at assemble time, neither is rewritten', () => {
    const descriptor = dir({
      module: 'file:///app/src/service.ts',
      dir: '../dist/server',
      entry: 'nested/start.js',
    });

    expect(descriptor.dir).toBe('../dist/server');
    expect(descriptor.entry).toBe('nested/start.js');
  });

  test('is pure data — calling it twice with the same input yields equal, independent objects', () => {
    const a = dir({ module: 'file:///app/src/service.ts', dir: '../dist/server', entry: 'a.js' });
    const b = dir({ module: 'file:///app/src/service.ts', dir: '../dist/server', entry: 'a.js' });

    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('dir vs node', () => {
  test('dir requires dir and entry — omitting dir does not type-check', () => {
    const module = 'file:///app/src/service.ts';
    // @ts-expect-error — dir() is directory-only, unlike node()'s optional dir. Checked by
    // `tsc --noEmit`, which covers this directory: the directive fails the build if the call
    // ever compiles.
    const descriptor = dir({ module, entry: 'start.js' });

    // Defeating the type leaves the descriptor with no tree to copy.
    expect(descriptor.dir).toBeUndefined();
  });
});
