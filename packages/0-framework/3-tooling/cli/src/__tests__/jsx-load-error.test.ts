import { describe, expect, test } from 'bun:test';
import { explainJsxLoadError } from '../jsx-load-error.ts';

function unknownExtensionError(message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = 'ERR_UNKNOWN_FILE_EXTENSION';
  return error;
}

describe('explainJsxLoadError()', () => {
  test('names the offending file, the cause, and the fix for a .tsx', () => {
    const error = unknownExtensionError(
      'Unknown file extension ".tsx" for /app/src/mailer/templates.tsx',
    );
    const message = explainJsxLoadError(error, '/app/module.ts');

    expect(message).toBeDefined();
    expect(message).toContain('/app/src/mailer/templates.tsx');
    expect(message).toContain("node's own module loader");
    expect(message).toContain('JSX transform');
    expect(message).toContain('examples/email/scripts/build.ts');
  });

  test('handles .jsx the same way', () => {
    const error = unknownExtensionError('Unknown file extension ".jsx" for /app/src/widget.jsx');
    const message = explainJsxLoadError(error, '/app/module.ts');

    expect(message).toBeDefined();
    expect(message).toContain('/app/src/widget.jsx');
  });

  test('leaves an unknown-extension error for a non-JSX file alone', () => {
    const error = unknownExtensionError('Unknown file extension ".vue" for /app/src/widget.vue');
    expect(explainJsxLoadError(error, '/app/module.ts')).toBeUndefined();
  });

  test('leaves an unrelated error code alone', () => {
    const error = new Error('Cannot find module') as Error & { code: string };
    error.code = 'ERR_MODULE_NOT_FOUND';
    expect(explainJsxLoadError(error, '/app/module.ts')).toBeUndefined();
  });

  test('leaves a non-Error rejection alone', () => {
    expect(explainJsxLoadError('boom', '/app/module.ts')).toBeUndefined();
  });
});
