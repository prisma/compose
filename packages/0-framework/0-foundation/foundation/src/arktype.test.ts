import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import { secretString } from './arktype.ts';
import { SecretBox } from './secret.ts';

describe('secretString', () => {
  const schema = type({ signingKey: secretString() });

  test('accepts a secret box, and the validated field reads back as a SecretString', () => {
    const out = schema({ signingKey: new SecretBox('sk_live_abc') });
    if (out instanceof type.errors) throw new Error(out.summary);
    // `.expose()` compiles only because the field's inferred type is SecretString.
    expect(out.signingKey.expose()).toBe('sk_live_abc');
  });

  test('rejects a plain string — a credential cannot arrive unboxed', () => {
    expect(schema({ signingKey: 'sk_live_abc' })).toBeInstanceOf(type.errors);
  });

  test('rejects an unbranded look-alike', () => {
    const lookalike = { expose: () => 'sk_live_abc', toString: () => '[REDACTED]' };
    expect(schema({ signingKey: lookalike })).toBeInstanceOf(type.errors);
  });
});
