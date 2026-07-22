import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { loadEntry } from '../load-entry.ts';

const fixture = (name: string) => path.join(import.meta.dir, 'fixtures', name);

describe('loadEntry()', () => {
  test('accepts a service default export', async () => {
    const entry = await loadEntry(fixture('valid-service.ts'), import.meta.dir);
    expect(entry.root.kind).toBe('service');
    expect(entry.path).toBe(fixture('valid-service.ts'));
  });

  test('accepts a module default export', async () => {
    const entry = await loadEntry(fixture('valid-module.ts'), import.meta.dir);
    expect(entry.root.kind).toBe('module');
  });

  test('rejects a plain-object default export — names what the module must export', async () => {
    await expect(loadEntry(fixture('non-node-export.ts'), import.meta.dir)).rejects.toThrow(
      /must default-export a node \(a service or a module\)/,
    );
  });

  test('rejects a resource default export — a resource is not a valid root', async () => {
    await expect(loadEntry(fixture('resource-export.ts'), import.meta.dir)).rejects.toThrow(
      /must default-export a node \(a service or a module\)/,
    );
  });

  test('resolves the entry path against the given cwd', async () => {
    const entry = await loadEntry('fixtures/valid-service.ts', import.meta.dir);
    expect(entry.path).toBe(fixture('valid-service.ts'));
  });

  // Bun's own module loader transforms JSX — this failure is node-specific
  // (the CLI's shebang runtime; see node-compat.test.ts), so it's reproduced
  // by spawning real node against a small standalone driver rather than
  // calling loadEntry() in-process here.
  test('a .tsx transitively imported by the entry gets a tailored error under node', () => {
    const result = spawnSync('node', [fixture('run-load-entry.ts'), fixture('jsx-in-graph.ts')], {
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(fixture('jsx-in-graph.tsx'));
    expect(result.stderr).toContain("node's own module loader");
    expect(result.stderr).toContain('JSX transform');
    expect(result.stderr).toContain('examples/email/scripts/build.ts');
  }, 15000);
});
