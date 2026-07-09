import { describe, expect, test } from 'bun:test';
import { parseArgs, UsageError } from '../main.ts';

describe('parseArgs()', () => {
  test('parses a bare deploy invocation', () => {
    expect(parseArgs(['deploy', 'src/service.ts'])).toEqual({
      command: 'deploy',
      entry: 'src/service.ts',
      name: undefined,
      stage: undefined,
    });
  });

  test('parses --name and --stage in either order', () => {
    expect(parseArgs(['destroy', 'src/service.ts', '--name', 'ci-run', '--stage', 'prod'])).toEqual(
      {
        command: 'destroy',
        entry: 'src/service.ts',
        name: 'ci-run',
        stage: 'prod',
      },
    );
    expect(parseArgs(['deploy', '--stage', 'prod', 'src/service.ts', '--name', 'ci-run'])).toEqual({
      command: 'deploy',
      entry: 'src/service.ts',
      name: 'ci-run',
      stage: 'prod',
    });
  });

  test('throws UsageError on a bare invocation (no command)', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
  });

  test('throws UsageError when the command is neither deploy nor destroy', () => {
    expect(() => parseArgs(['build', 'src/service.ts'])).toThrow(UsageError);
  });

  test('throws UsageError when the entry is missing', () => {
    expect(() => parseArgs(['deploy'])).toThrow(UsageError);
    expect(() => parseArgs(['deploy', '--name', 'x'])).toThrow(UsageError);
  });
});
