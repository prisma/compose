/**
 * The Prisma Next migration step of the deploy lowering (ADR-0022, slice 2) —
 * the safety-critical decision that brings a live database to a contract's
 * `storageHash` using ONLY Prisma Next's authored migrations.
 *
 * Deploy-time only: this module imports `@prisma-next/postgres/control` (which
 * transitively pulls PN's control/migration machinery + `pg`). It is imported
 * by `control.ts` and this package's tests, NEVER by `index.ts` / the
 * `./prisma-next` authoring entry — so it never lands in an app runtime bundle
 * (the index-isolation invariant holds).
 *
 * The decision, given the live marker and the target hash:
 *   - marker already at target      → no-op (idempotent redeploy)
 *   - no marker (fresh/empty DB)     → `dbInit({ mode: 'apply' })`
 *   - marker at a different hash      → `migrate` (walk the AUTHORED graph)
 *
 * Never `dbUpdate`: synthesized diff-and-apply plans are never run against a
 * deployed database. A no-authored-path (`MIGRATION_PATH_NOT_FOUND`) or a
 * runner failure fails the deploy as a typed `PnMigrationError` (not swallowed).
 * PN applies each migration in its own transaction, so a failed apply is atomic
 * and resume-safe — the marker and schema are left as the last committed step.
 */
import { createPostgresControlClient } from '@prisma-next/postgres/control';

/** Which authored path the migration step took. */
export type PnMigrationAction = 'noop' | 'init' | 'migrate';

/** The migration step's decision + outcome — what the lowering records/logs. */
export interface PnMigrationOutcome {
  readonly action: PnMigrationAction;
  /** The contract's `storageHash` the DB was brought to (or already at). */
  readonly targetHash: string;
  /** The live marker's `storageHash` before this step, or `null` for a fresh DB. */
  readonly markerHashBefore: string | null;
}

/**
 * Why a migration failed the deploy. `MIGRATION_PATH_NOT_FOUND` — no authored
 * migration path from the marker's hash to the target. `RUNNER_FAILED` — a
 * migration errored while applying. `INIT_FAILED` — the first-apply `dbInit`
 * failed (planning or runner).
 */
export type PnMigrationFailureCode = 'MIGRATION_PATH_NOT_FOUND' | 'RUNNER_FAILED' | 'INIT_FAILED';

/** A deploy-failing migration error — surfaced, never swallowed. */
export class PnMigrationError extends Error {
  readonly code: PnMigrationFailureCode;
  /** PN's structured explanation, when present. */
  readonly why: string | undefined;
  constructor(code: PnMigrationFailureCode, summary: string, why?: string) {
    super(`prisma-next migrate (${code}): ${summary}`);
    this.name = 'PnMigrationError';
    this.code = code;
    this.why = why;
  }
}

/**
 * The target `storageHash` a contract heads to — `contractJson.storage.storageHash`.
 * Read defensively: `contractJson` crosses the boundary as `unknown`.
 */
export function targetStorageHash(contractJson: unknown): string {
  if (typeof contractJson === 'object' && contractJson !== null && 'storage' in contractJson) {
    // `'storage' in contractJson` narrows so `.storage` reads as `unknown` — no cast.
    const storage = contractJson.storage;
    if (typeof storage === 'object' && storage !== null && 'storageHash' in storage) {
      const hash = storage.storageHash;
      if (typeof hash === 'string' && hash.length > 0) return hash;
    }
  }
  throw new PnMigrationError(
    'INIT_FAILED',
    'the contract has no storage.storageHash — cannot determine the target schema version',
  );
}

/**
 * Bring the database at `url` to the contract's `storageHash` via PN's authored
 * migrations. Reads the live marker, decides no-op / init / migrate, applies,
 * and throws a typed {@link PnMigrationError} on a no-path or runner failure.
 * `migrationsDir` is the on-disk migrations root (resolved from the resource's
 * `prisma-next.config.ts` by the caller).
 */
/**
 * Pin a deprecating TLS `sslmode` to the explicit `verify-full` so the deploy
 * connection is warning-free and future-proof.
 *
 * Prisma Postgres DSNs carry `sslmode=require`. node-postgres's
 * `pg-connection-string` (8.21) treats `require`/`prefer`/`verify-ca` as
 * aliases for `verify-full` (strict certificate + hostname verification) and
 * emits a `deprecatedSslModeWarning` warning that these will get weaker libpq
 * semantics in pg v9. PPG's certificate is publicly trusted, so `verify-full`
 * connects fine (proven live against a real PPG database — every ssl posture
 * connects once the DB is warm); the connection failures were never TLS. This
 * just rewrites those modes to the explicit `verify-full` they already mean,
 * which silences the deprecation warning and keeps full verification when the
 * pg-9 semantics change lands. A DSN with no `sslmode`, or `disable`/`no-verify`,
 * is left untouched (a plain local Postgres still connects without TLS).
 *
 * The control driver builds its client as `new Client({ connectionString: url })`
 * — no `ssl` config object is accepted — so this is necessarily URL-level.
 */
export function normalizeSslMode(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a parseable URL — leave it; the driver surfaces its own error.
    return url;
  }
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode === 'require' || sslmode === 'prefer' || sslmode === 'verify-ca') {
    parsed.searchParams.set('sslmode', 'verify-full');
    return parsed.toString();
  }
  return url;
}

/**
 * Retry a connection-bearing operation past Prisma Postgres's cold-start.
 *
 * A freshly-provisioned PPG database's edge proxy rejects the first
 * connection(s) with `Failed to connect to upstream database` (a fast,
 * `err.code`-less server reject — not TLS, network, or auth; confirmed live)
 * while its upstream warms up, recovering on a later attempt — the same
 * FT-5219 transient the runtime verify scripts retry for. The deploy migration
 * connects immediately after provisioning, so it hits that window; retrying the
 * connect+operation rides it out. A real migration failure (`PnMigrationError`
 * — no authored path, runner error) is NOT a transient: it is surfaced
 * immediately, never retried.
 */
export async function withConnectionRetry<T>(
  operation: () => Promise<T>,
  opts: {
    readonly attempts?: number;
    readonly delayMs?: number;
    readonly sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 12;
  const delayMs = opts.delayMs ?? 5000;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PnMigrationError) throw error;
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

export async function applyPnMigration(opts: {
  readonly url: string;
  readonly contractJson: unknown;
  readonly migrationsDir: string;
}): Promise<PnMigrationOutcome> {
  const target = targetStorageHash(opts.contractJson);
  const connection = normalizeSslMode(opts.url);
  // Retry the connect+operation past PPG's cold-start (see withConnectionRetry).
  return withConnectionRetry(() =>
    runMigration(connection, opts.contractJson, opts.migrationsDir, target),
  );
}

async function runMigration(
  connection: string,
  contractJson: unknown,
  migrationsDir: string,
  target: string,
): Promise<PnMigrationOutcome> {
  const client = createPostgresControlClient({ connection });
  await client.connect();
  try {
    const marker = await client.readMarker();
    const markerHashBefore = marker?.storageHash ?? null;

    // Already at the target — idempotent redeploy, nothing to apply.
    if (markerHashBefore === target) {
      return { action: 'noop', targetHash: target, markerHashBefore };
    }

    // Fresh/empty DB (no marker) — first apply. `dbInit` is additive-only and
    // signs the marker; it never runs a destructive step.
    if (marker === null) {
      const result = await client.dbInit({
        contract: contractJson,
        mode: 'apply',
        migrationsDir,
      });
      if (!result.ok) {
        throw new PnMigrationError('INIT_FAILED', result.failure.summary, result.failure.why);
      }
      return { action: 'init', targetHash: target, markerHashBefore };
    }

    // Existing marker at a different hash — walk the AUTHORED migration graph
    // toward the target. Fails on no path / runner error; never synthesizes.
    const result = await client.migrate({
      contract: contractJson,
      migrationsDir,
    });
    if (!result.ok) {
      const code: PnMigrationFailureCode =
        result.failure.code === 'MIGRATION_PATH_NOT_FOUND'
          ? 'MIGRATION_PATH_NOT_FOUND'
          : 'RUNNER_FAILED';
      throw new PnMigrationError(code, result.failure.summary, result.failure.why);
    }
    return { action: 'migrate', targetHash: target, markerHashBefore };
  } finally {
    await client.close();
  }
}
