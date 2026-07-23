import { type SecretBinding, type SecretSource, secretSource } from '@internal/core';
import { blindCast } from '@internal/foundation/casts';

/**
 * Brands the payloads this module builds. Core's `secretSource()` is a public
 * SPI, so a user could bypass `envSecret`/`mintedSecret` and bind a raw
 * `secretSource('x')`; the brand lets the deploy-side readers reject such a
 * source (or another target's) with a clear error instead of reading an
 * absent field.
 */
const PRISMA_CLOUD_SECRET_SOURCE: unique symbol = blindCast<
  never,
  'unique-symbol brand for the prisma-cloud secret source payloads'
>(Symbol.for('prisma:prisma-cloud-secret-source'));

/** The env-sourced payload: the platform env-var name the slot resolves to, under a brand only `envSecret` sets. */
export interface EnvSecretPayload {
  readonly [PRISMA_CLOUD_SECRET_SOURCE]: true;
  readonly name: string;
}

/** The minted payload: no data — the deploy mints the value and provisions the platform var itself. */
export interface MintedSecretPayload {
  readonly [PRISMA_CLOUD_SECRET_SOURCE]: true;
  readonly minted: true;
}

const RESERVED_SECRET_PREFIX = 'COMPOSER_';
const POISONED_SECRET_NAMES: ReadonlySet<string> = new Set(['DATABASE_URL', 'DATABASE_URL_POOLED']);

/**
 * Binds a secret slot to a named Prisma Cloud platform env var (ADR-0029). The
 * value is provisioned out-of-band; only the name is carried. The name may not
 * use the framework's reserved `COMPOSER_` prefix or the poisoned
 * `DATABASE_URL(_POOLED)` keys.
 */
export function envSecret(name: string): SecretSource<EnvSecretPayload> {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(
      "envSecret() requires a non-empty platform env-var name, e.g. envSecret('STRIPE_SECRET_KEY').",
    );
  }
  if (name.startsWith(RESERVED_SECRET_PREFIX)) {
    throw new Error(
      `envSecret name "${name}" may not start with "${RESERVED_SECRET_PREFIX}" — that prefix is ` +
        "reserved for the framework's own generated config keys.",
    );
  }
  if (POISONED_SECRET_NAMES.has(name)) {
    throw new Error(
      `envSecret name "${name}" is reserved — ${[...POISONED_SECRET_NAMES].join(' and ')} are ` +
        'poisoned at project provision and cannot back a secret.',
    );
  }
  return secretSource<EnvSecretPayload>({ [PRISMA_CLOUD_SECRET_SOURCE]: true, name });
}

/**
 * Binds a secret slot to a value the DEPLOY mints (ADR-0029's second source,
 * beside `envSecret`): 32 random bytes, base64, generated once at first
 * deploy and kept stable across redeploys — nobody supplies or ever reads it.
 * Rotation is destroy/recreate. The typical binder is a module factory whose
 * service needs an instance secret no human should hold (e.g. `auth()`);
 * consumers of such a module see no secret slot at all.
 */
export function mintedSecret(): SecretSource<MintedSecretPayload> {
  return secretSource<MintedSecretPayload>({ [PRISMA_CLOUD_SECRET_SOURCE]: true, minted: true });
}

/** True only for a payload that this module built — i.e. one carrying the brand. */
function isBrandedPayload(payload: unknown): payload is EnvSecretPayload | MintedSecretPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    blindCast<
      Record<PropertyKey, unknown>,
      'reading the prisma-cloud secret-source brand off an unknown payload'
    >(payload)[PRISMA_CLOUD_SECRET_SOURCE] === true
  );
}

/** True only for a payload that `envSecret` built. */
function isEnvSecretPayload(payload: unknown): payload is EnvSecretPayload {
  return isBrandedPayload(payload) && 'name' in payload && typeof payload.name === 'string';
}

/** True iff the binding's source was built by `mintedSecret()` — the deploy mints its value instead of pointing at a user-provisioned platform var. */
export function isMintedSecretBinding(binding: SecretBinding): boolean {
  const payload = binding.source.payload;
  return isBrandedPayload(payload) && 'minted' in payload && payload.minted === true;
}

/**
 * Reads the Prisma Cloud env-var name back out of an env-sourced secret
 * binding's opaque source. A source not built by `envSecret` (a raw
 * `secretSource(...)`, another target's source, or a `mintedSecret()` — which
 * carries no name; callers branch on `isMintedSecretBinding` first) is
 * rejected here. `secretName` runs in preflight before any provisioning, so a
 * foreign source fails early and clearly rather than producing a broken
 * deploy with an undefined name.
 */
export function secretName(binding: SecretBinding): string {
  const payload = binding.source.payload;
  if (isMintedSecretBinding(binding)) {
    throw new Error(
      `secret slot "${binding.slot}" of service "${binding.serviceAddress}" is bound to ` +
        'mintedSecret(), which has no platform env-var name — the deploy mints and provisions ' +
        'its value itself.',
    );
  }
  if (!isEnvSecretPayload(payload)) {
    throw new Error(
      `secret slot "${binding.slot}" of service "${binding.serviceAddress}" is bound to a source ` +
        "not created by envSecret() — bind secrets with envSecret('NAME') from " +
        '@prisma/composer-prisma-cloud.',
    );
  }
  return payload.name;
}
