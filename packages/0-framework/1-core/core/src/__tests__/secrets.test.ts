import { describe, expect, test } from 'bun:test';
import { blindCast } from '@internal/foundation/casts';
import { Load } from '../graph.ts';
import type { SecretSource, Secrets } from '../node.ts';
import { envSecret, isSecretSource, module, resource, secret, service } from '../node.ts';
import { providerContract } from './helpers.ts';

const build = {
  extension: '@prisma/compose/node',
  type: 'node',
  module: 'file:///test/service.ts',
  entry: 'server.js',
};

// Generic so `svc('plain')` infers an EMPTY secret map (no required secrets),
// while `svc('auth', { k: secret() })` infers its declared slots.
const svc = <S extends Secrets = Record<never, never>>(
  name: string,
  secrets: S = blindCast<S, 'default empty secret map'>({}),
) =>
  service({
    name,
    extension: 'test/pack',
    type: 'fake/app',
    inputs: {},
    params: {},
    secrets,
    build,
  });

describe('secret sources', () => {
  test('envSecret is a secret source; secret() and plain values are not', () => {
    expect(isSecretSource(envSecret('AUTH_KEY'))).toBe(true);
    expect(isSecretSource(secret())).toBe(false);
    expect(isSecretSource({})).toBe(false);
    expect(isSecretSource(undefined)).toBe(false);
  });

  test('envSecret rejects empty, COMPOSE_-prefixed, and poisoned names', () => {
    expect(() => envSecret('')).toThrow(/non-empty/);
    expect(() => envSecret('COMPOSE_X')).toThrow(/COMPOSE_/);
    expect(() => envSecret('DATABASE_URL')).toThrow(/reserved/);
    expect(() => envSecret('DATABASE_URL_POOLED')).toThrow(/reserved/);
  });
});

describe('Load records secret bindings', () => {
  test('the root binds a service secret directly (the leaf case)', () => {
    const auth = svc('auth', { signingKey: secret() });
    const graph = Load(
      module('root', ({ provision }) => {
        provision(auth, { id: 'auth', secrets: { signingKey: envSecret('AUTH_SIGNING_KEY') } });
      }),
    );
    expect(graph.secrets).toEqual([
      { serviceAddress: 'auth', slot: 'signingKey', name: 'AUTH_SIGNING_KEY' },
    ]);
  });

  test('a module forwards a secret slot to an inner service (the multi-level case)', () => {
    const inner = svc('inner', { key: secret() });
    const authModule = module('auth', { secrets: { key: secret() } }, ({ secrets, provision }) => {
      provision(inner, { id: 'inner', secrets: { key: secrets.key } });
    });
    const graph = Load(
      module('root', ({ provision }) => {
        provision(authModule, { id: 'auth', secrets: { key: envSecret('AUTH_KEY') } });
      }),
    );
    // The name flows root -> module.secrets.key -> inner's slot; the binding is
    // recorded at the inner service's full address.
    expect(graph.secrets).toEqual([
      { serviceAddress: 'auth.inner', slot: 'key', name: 'AUTH_KEY' },
    ]);
  });

  test('a service with no secret slots yields no bindings', () => {
    const graph = Load(
      module('root', ({ provision }) => {
        provision(svc('plain'), { id: 'plain' });
      }),
    );
    expect(graph.secrets).toEqual([]);
  });
});

describe('Load validates secret wiring', () => {
  test('a module that declares a secret but never forwards it fails', () => {
    const m = module('auth', { secrets: { key: secret() } }, ({ provision }) => {
      provision(svc('plain'), { id: 'plain' }); // never forwards secrets.key
    });
    expect(() =>
      Load(
        module('root', ({ provision }) => {
          provision(m, { id: 'auth', secrets: { key: envSecret('AUTH_KEY') } });
        }),
      ),
    ).toThrow(/declares secret "key" but never forwards/);
  });

  test('a root module that declares its own secret slot fails — the root binds, it does not declare', () => {
    const root = module('root', { secrets: { key: secret() } }, () => {});
    expect(() => Load(root)).toThrow(/deployed as the root/);
  });

  test('a lone service that declares secret slots is rejected at Load', () => {
    const auth = svc('auth', { signingKey: secret() });
    expect(() => Load(auth)).toThrow(/no enclosing scope to bind them/);
  });

  test('a non-secret value wired into a secret slot is rejected', () => {
    const auth = svc('auth', { signingKey: secret() });
    expect(() =>
      Load(
        module('root', ({ provision }) => {
          // @ts-expect-error a secret slot must be bound with a secret source
          provision(auth, { id: 'auth', secrets: { signingKey: 'not-a-secret' } });
        }),
      ),
    ).toThrow(/non-secret value/);
  });

  test('a resource may not receive secrets', () => {
    const db = resource({
      name: 'db',
      extension: 'test/pack',
      provides: providerContract('fake/db', { url: '' }),
    });
    expect(() =>
      Load(
        module('root', ({ provision }) => {
          // The resource provision overload takes no `secrets`; inject it to
          // exercise the runtime rejection (load-module.ts).
          provision(
            db,
            blindCast<
              { id: string },
              'a resource takes no secrets — inject one to hit the runtime check'
            >({ id: 'db', secrets: { k: envSecret('K') } }),
          );
        }),
      ),
    ).toThrow(/resource has no secret slots/);
  });

  test('a declared secret slot left unbound in a provision fails at Load', () => {
    const auth = svc('auth', { signingKey: secret() });
    expect(() =>
      Load(
        module('root', ({ provision }) => {
          provision(
            auth,
            blindCast<
              { id: string; secrets: { signingKey: SecretSource } },
              'deliberately omit the binding to exercise the runtime not-bound check'
            >({ id: 'auth', secrets: {} }),
          );
        }),
      ),
    ).toThrow(/is not bound/);
  });

  test('an extra secrets key naming a non-slot fails at Load', () => {
    const auth = svc('auth', { signingKey: secret() });
    expect(() =>
      Load(
        module('root', ({ provision }) => {
          provision(
            auth,
            blindCast<
              { id: string; secrets: { signingKey: SecretSource } },
              'inject an extra non-slot key to exercise the runtime extra-key check'
            >({ id: 'auth', secrets: { signingKey: envSecret('K'), bogus: envSecret('B') } }),
          );
        }),
      ),
    ).toThrow(/"bogus", which is not a secret slot/);
  });

  test('branded copies keep used-tracking per-slot — the SAME source bound to two slots, forwarding only one, flags the other unused', () => {
    const inner = svc('inner', { key: secret() });
    const m = module('m', { secrets: { a: secret(), b: secret() } }, ({ secrets, provision }) => {
      // Forward only `a`; `b` is never forwarded.
      provision(inner, { id: 'inner', secrets: { key: secrets.a } });
    });
    // The SAME source object is bound to BOTH a and b. Without the per-slot
    // branded copies, forwarding secrets.a would alias-mark b used too; with
    // them, b is correctly flagged as never forwarded.
    const src = envSecret('SHARED');
    expect(() =>
      Load(
        module('root', ({ provision }) => {
          provision(m, { id: 'm', secrets: { a: src, b: src } });
        }),
      ),
    ).toThrow(/declares secret "b" but never forwards/);
  });
});
