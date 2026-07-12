/**
 * The pure name-filter behind `ci-cleanup.ts` — split out so it can be
 * unit-tested (node:test) without touching the Management API.
 *
 * A project is an ephemeral CI leftover ONLY when its name is exactly
 * `<prefix>-ci-<digits>` for one of the given prefixes — the shape the E2E
 * workflow's per-run stack names use (`storefront-auth-ci-<run_id>`,
 * `pn-widgets-ci-<run_id>`). Anything else — including the hosted
 * deploy-state control plane `prisma-app-state`, which is additionally
 * hard-denied by name — must never be deleted.
 */

/** Never deleted, even if a prefix argument would somehow match them. */
export const PROTECTED_PROJECT_NAMES: readonly string[] = ['prisma-app-state'];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The strict per-run pattern: `^(<prefix>|...)-ci-\d+$`. */
export function ephemeralCiNamePattern(prefixes: readonly string[]): RegExp {
  if (prefixes.length === 0) {
    throw new Error('ci-cleanup: at least one project-name prefix argument is required.');
  }
  return new RegExp(`^(${prefixes.map(escapeRegExp).join('|')})-ci-\\d+$`);
}

/** True only for an exact ephemeral CI project name that is not protected. */
export function isEphemeralCiProjectName(name: string, prefixes: readonly string[]): boolean {
  if (PROTECTED_PROJECT_NAMES.includes(name)) return false;
  return ephemeralCiNamePattern(prefixes).test(name);
}
