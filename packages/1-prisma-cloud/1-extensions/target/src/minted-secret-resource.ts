/**
 * The `MintedSecret` Alchemy resource — mints a random 32-byte secret ONCE at
 * create and keeps it STABLE across deploys, so an unchanged service no-ops
 * on redeploy. The secret is generated with the Web Crypto global
 * (`crypto.getRandomValues` — no `node:` import, matching this package's
 * runtime-coupling invariant) and persisted in Alchemy state; on every later
 * apply the provider returns the persisted attributes (`reconcile`'s
 * `output`) unchanged — the same way `S3Credentials` keeps its pair stable.
 * Rotation is destroy/recreate.
 *
 * One resource per `mintedSecret()`-bound secret slot, provisioned by the
 * compute descriptor's serialize step; the resource id derives from the
 * slot's config key, so the value is stable per service+slot.
 *
 * Deploy-time only: imports `alchemy`. Imported by `control/extension.ts` and
 * tests, never by `index.ts` / the authoring entry.
 */
import { Resource } from 'alchemy';
import * as Provider from 'alchemy/Provider';
import * as Effect from 'effect/Effect';

/** No inputs — the secret is generated, not derived. */
export type MintedSecretProps = Record<never, never>;

export interface MintedSecretAttributes {
  readonly value: string;
}

export type MintedSecret = Resource<
  'PrismaCloud.MintedSecret',
  MintedSecretProps,
  MintedSecretAttributes
>;

/** The `MintedSecret` resource constructor — `yield* MintedSecret(id, {})` in the lowering. */
export const MintedSecret = Resource<MintedSecret>('PrismaCloud.MintedSecret');

/** A fresh secret value: 32 random bytes, base64. */
export function mintSecretValue(): MintedSecretAttributes {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { value: btoa(String.fromCharCode(...bytes)) };
}

/**
 * The `MintedSecret` provider service. `reconcile` runs for create and
 * update; it returns the persisted `output` when present (a redeploy reuses
 * the stored secret — the no-op property) and mints a fresh secret only on
 * first create. Nothing to enumerate (`list` → `[]`) or tear down (`delete` →
 * no-op; the secret lives only in state). Exported so tests can drive it
 * directly.
 */
export const mintedSecretProviderService: Provider.ProviderService<MintedSecret> = {
  list: () => Effect.succeed([]),
  reconcile: ({ output }) => Effect.sync(() => output ?? mintSecretValue()),
  delete: () => Effect.void,
};

/** The `MintedSecret` provider layer — merged into the extension descriptor's `providers()`. */
export const MintedSecretProvider = () =>
  Provider.effect(MintedSecret, Effect.succeed(mintedSecretProviderService));
