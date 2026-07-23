/**
 * The generic minted secret source, proven WITHOUT Alchemy:
 *   - the `MintedSecret` provider `reconcile` mints a fresh secret on first
 *     create (no prior `output`) and returns the persisted secret UNCHANGED
 *     on every later apply — the no-op-redeploy property modules like auth
 *     rely on (rotation would invalidate sessions). Driven directly against
 *     the exported provider service (the s3-credentials.test.ts pattern).
 *   - `mintedSecret()` is a real core secret source, distinguishable from an
 *     `envSecret` binding, and `secretPointerRows` classifies a slot by how
 *     it was bound (env pointer vs deploy-minted).
 */
import { describe, expect, test } from 'bun:test';
import { isSecretSource, Load, module, secret } from '@internal/core';
import * as Effect from 'effect/Effect';
import { compute } from '../exports/index.ts';
import {
  type MintedSecretAttributes,
  mintedSecretProviderService,
  mintSecretValue,
} from '../minted-secret-resource.ts';
import { envSecret, isMintedSecretBinding, mintedSecret, secretName } from '../secret.ts';
import { mintedSecretVarName, secretKey, secretPointerRows } from '../serializer.ts';

const reconcile = (output: MintedSecretAttributes | undefined) =>
  mintedSecretProviderService.reconcile({
    id: 'secret',
    instanceId: 'secret',
    news: {},
    olds: output === undefined ? undefined : {},
    output,
    session: undefined as never,
    bindings: undefined as never,
  });

describe('MintedSecret mint provider', () => {
  test('first create mints a fresh 32-byte base64 secret', async () => {
    const minted = await Effect.runPromise(reconcile(undefined));
    // 32 bytes base64-encode to 44 chars (43 + one '=' pad).
    expect(minted.value).toHaveLength(44);
    expect(atob(minted.value)).toHaveLength(32);
  });

  test('a redeploy returns the persisted secret unchanged (idempotent no-op)', async () => {
    const first = await Effect.runPromise(reconcile(undefined));
    const second = await Effect.runPromise(reconcile(first));
    expect(second).toEqual(first);
  });

  test('two independent mints differ (the secret is random, not derived)', () => {
    expect(mintSecretValue()).not.toEqual(mintSecretValue());
  });
});

const build = {
  extension: '@prisma/composer/node',
  type: 'node',
  module: 'file:///test/service.ts',
  entry: 'server.js',
};

/** One service whose `token` slot is bound to `mintedSecret()` by its enclosing module. */
const mintedGraph = () =>
  Load(
    module('app', ({ provision }) => {
      provision(compute({ name: 'svc', deps: {}, secrets: { token: secret() }, build }), {
        id: 'svc',
        secrets: { token: mintedSecret() },
      });
    }),
  );

describe('mintedSecret() — the deploy-minted secret source', () => {
  test('is a core secret source (bindable wherever envSecret is)', () => {
    expect(isSecretSource(mintedSecret())).toBe(true);
  });

  test('its binding is recognized as minted; an envSecret binding is not', () => {
    const graph = mintedGraph();
    const binding = graph.secrets.find((b) => b.serviceAddress === 'svc' && b.slot === 'token');
    expect(binding).toBeDefined();
    expect(isMintedSecretBinding(binding!)).toBe(true);

    const envBinding = { ...binding!, source: envSecret('STRIPE_SECRET_KEY') };
    expect(isMintedSecretBinding(envBinding)).toBe(false);
  });

  test('secretName rejects a minted binding with a clear error', () => {
    const graph = mintedGraph();
    const binding = graph.secrets.find((b) => b.slot === 'token');
    expect(() => secretName(binding!)).toThrow(/mintedSecret\(\).*no platform env-var name/);
  });
});

describe('secretPointerRows — env vs minted classification', () => {
  test('a minted slot yields a minted row; an env slot yields a pointer row with its name', () => {
    const graph = Load(
      module('app', ({ provision }) => {
        provision(
          compute({
            name: 'svc',
            deps: {},
            secrets: { instanceKey: secret(), stripeKey: secret() },
            build,
          }),
          {
            id: 'svc',
            secrets: { instanceKey: mintedSecret(), stripeKey: envSecret('STRIPE_SECRET_KEY') },
          },
        );
      }),
    );
    const node = graph.nodes.find((n) => n.id === 'svc')!.node;
    if (node.kind !== 'service') throw new Error('expected a service node');
    const rows = secretPointerRows(node, 'svc', graph.secrets);
    expect(rows).toContainEqual({ kind: 'minted', key: secretKey('svc', 'instanceKey') });
    expect(rows).toContainEqual({
      kind: 'env',
      key: secretKey('svc', 'stripeKey'),
      name: 'STRIPE_SECRET_KEY',
    });
  });

  test('the minted platform var lives beside the pointer key, in the reserved namespace', () => {
    const key = secretKey('svc', 'instanceKey');
    expect(mintedSecretVarName(key)).toBe(`${key}_MINTED`);
    expect(mintedSecretVarName(key).startsWith('COMPOSER_')).toBe(true);
  });
});
