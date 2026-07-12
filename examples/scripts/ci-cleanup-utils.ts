/**
 * The pure logic behind `ci-cleanup.ts` — the name filter and the
 * project-teardown sequencing — split out so both are unit-testable
 * (node:test) with a mocked HTTP function, without touching the Management
 * API.
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

/** A minimal HTTP seam so the teardown sequencing tests with a mocked fetch. */
export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: string;
}
export type HttpCall = (method: 'GET' | 'DELETE', path: string) => Promise<HttpResponse>;

export interface ProjectRef {
  readonly id: string;
  readonly name: string;
}

export interface DeepDeleteOptions {
  readonly log: (line: string) => void;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Service-delete retries while the platform winds a deployment down (~2 min default). */
  readonly serviceDeleteAttempts?: number;
  readonly serviceDeleteDelayMs?: number;
  /** Project-delete retries after the services are gone (deletes are eventually consistent). */
  readonly projectDeleteAttempts?: number;
  readonly projectDeleteDelayMs?: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The platform 409s a project delete with this while a compute deployment is live. */
const isActiveDeployment409 = (r: HttpResponse): boolean =>
  r.status === 409 && r.body.includes('active deployment');

/**
 * The compute-service DELETE 409s with this exact wording while its
 * deployment is still winding down — the same "not delete-safe yet" match
 * alchemy's ComputeService provider retries on (everything else is a real
 * failure and must surface, not be retried).
 */
const isDeleteNotSafeYet409 = (r: HttpResponse): boolean =>
  r.status === 409 && r.body.includes('did not reach a delete-safe state');

function parseServiceRows(body: string): { id: string; name: string }[] {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || !('data' in parsed)) return [];
    const data = parsed.data;
    if (!Array.isArray(data)) return [];
    const rows: { id: string; name: string }[] = [];
    for (const entry of data) {
      if (typeof entry !== 'object' || entry === null) continue;
      const id = 'id' in entry && typeof entry.id === 'string' ? entry.id : undefined;
      const name = 'name' in entry && typeof entry.name === 'string' ? entry.name : '(unnamed)';
      if (id !== undefined) rows.push({ id, name });
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * Delete a matched project, cascading over live compute when necessary.
 *
 * `DELETE /v1/projects/{id}` refuses with `409 … active deployment` when a
 * run's destroy never completed and a compute deployment is still serving.
 * The teardown mirrors what alchemy's providers do at a real destroy: delete
 * each compute service — the platform tears the service's versions and
 * deployments down with it (alchemy's Deployment delete is a documented
 * no-op for exactly this reason) — retrying a service DELETE only while the
 * platform reports "did not reach a delete-safe state", then re-try the
 * project DELETE with a short bounded retry (deletes are eventually
 * consistent).
 *
 * Returns true when the project ends up gone (404 counts). Fail-soft: any
 * other failure is logged and yields false — the caller continues with the
 * remaining projects. Logs names and ids only, never tokens or DSNs.
 */
export async function deleteProjectDeep(
  http: HttpCall,
  project: ProjectRef,
  opts: DeepDeleteOptions,
): Promise<boolean> {
  const sleep = opts.sleep ?? defaultSleep;
  const serviceAttempts = opts.serviceDeleteAttempts ?? 15;
  const serviceDelayMs = opts.serviceDeleteDelayMs ?? 8_000;
  const projectAttempts = opts.projectDeleteAttempts ?? 6;
  const projectDelayMs = opts.projectDeleteDelayMs ?? 5_000;

  const first = await http('DELETE', `/projects/${project.id}`);
  if (first.ok || first.status === 404) return true;
  if (!isActiveDeployment409(first)) {
    opts.log(
      `  DELETE failed for "${project.name}" (${project.id}): ${first.status} ${first.body}`,
    );
    return false;
  }

  // Live compute blocks the project delete — enumerate and tear down.
  opts.log(`  "${project.name}" has an active deployment — tearing its compute services down…`);
  const listed = await http('GET', `/projects/${project.id}/compute-services?limit=100`);
  if (!listed.ok) {
    opts.log(
      `  could not list compute services for "${project.name}": ${listed.status} ${listed.body}`,
    );
    return false;
  }
  for (const service of parseServiceRows(listed.body)) {
    opts.log(`    deleting compute service "${service.name}" (${service.id})…`);
    for (let attempt = 1; attempt <= serviceAttempts; attempt++) {
      const res = await http('DELETE', `/compute-services/${service.id}`);
      if (res.ok || res.status === 404) break;
      if (isDeleteNotSafeYet409(res) && attempt < serviceAttempts) {
        // The deployment is still winding down — the one retryable state.
        await sleep(serviceDelayMs);
        continue;
      }
      opts.log(`    compute service "${service.name}" delete failed: ${res.status} ${res.body}`);
      break;
    }
  }

  // Services gone (or as gone as they get) — re-try the project delete.
  for (let attempt = 1; attempt <= projectAttempts; attempt++) {
    const res = await http('DELETE', `/projects/${project.id}`);
    if (res.ok || res.status === 404) return true;
    if (attempt < projectAttempts) {
      await sleep(projectDelayMs);
    } else {
      opts.log(
        `  DELETE still failing for "${project.name}" after compute teardown: ${res.status} ${res.body}`,
      );
    }
  }
  return false;
}
