#!/usr/bin/env bun
/**
 * Sweep the CI workspace's leaked per-run projects (run under bun).
 *
 * Under stage-as-branch the CLI resolves the app's Project OUTSIDE the
 * Alchemy stack (ADR-0019: `ensureContainers` creates it before alchemy
 * runs), so `destroy --production` tears down only the stack-tracked
 * resources — the per-run Project itself, and the database the platform
 * auto-provisions with it, persist after every E2E run. This script is the
 * guaranteed teardown: list every project in the workspace (the CI log is
 * our only window into that workspace), delete the ones whose name matches
 * the strict ephemeral pattern `^(<prefix>|...)-ci-<digits>$`, and log —
 * never touch — everything else. `prisma-app-state` (the hosted deploy-state
 * control plane) is hard-denied on top of the pattern.
 *
 * Usage: `bun ci-cleanup.ts <prefix> [<prefix> ...]`, e.g.
 * `bun ci-cleanup.ts storefront-auth pn-widgets`. Requires
 * PRISMA_SERVICE_TOKEN. Logs project names and timestamps only — never
 * tokens or connection strings.
 *
 * Failure posture: a per-project delete failure is logged and skipped
 * (cleanup must not redden a green run over one stuck project), but the run
 * exits non-zero when matches existed and NOT ONE could be deleted — and an
 * API/auth failure at listing time always surfaces.
 */

import { isEphemeralCiProjectName } from './ci-cleanup-utils.ts';

const API = 'https://api.prisma.io/v1';

const token = process.env['PRISMA_SERVICE_TOKEN'];
if (token === undefined || token.length === 0) {
  console.error('PRISMA_SERVICE_TOKEN is required');
  process.exit(1);
}
const prefixes = process.argv.slice(2);
if (prefixes.length === 0) {
  console.error('Usage: ci-cleanup.ts <project-name-prefix> [<prefix> ...]');
  process.exit(1);
}

interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null;
}

function toProjectRow(value: unknown): ProjectRow | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, createdAt } = value;
  if (typeof id !== 'string' || typeof name !== 'string') return undefined;
  return { id, name, createdAt: typeof createdAt === 'string' ? createdAt : '(unknown)' };
}

/** List every project in the workspace, following cursor pagination. A failure here is fatal (auth/API problems must surface). */
async function listAllProjects(): Promise<ProjectRow[]> {
  const rows: ProjectRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor !== undefined) query.set('cursor', cursor);
    const response = await fetch(`${API}/projects?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`GET /projects failed: ${response.status} ${await response.text()}`);
    }
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body['data'])) break;
    for (const entry of body['data']) {
      const row = toProjectRow(entry);
      if (row !== undefined) rows.push(row);
    }
    const pagination = isRecord(body['pagination']) ? body['pagination'] : undefined;
    const nextCursor = pagination?.['nextCursor'];
    if (pagination?.['hasMore'] !== true || typeof nextCursor !== 'string') break;
    cursor = nextCursor;
  }
  return rows;
}

async function deleteProject(project: ProjectRow): Promise<boolean> {
  const response = await fetch(`${API}/projects/${project.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok || response.status === 404) return true;
  console.error(
    `  DELETE failed for "${project.name}" (${project.id}): ${response.status} ${await response.text()}`,
  );
  return false;
}

const projects = await listAllProjects();
console.log(`Workspace has ${projects.length} project(s):`);
for (const project of projects) {
  console.log(`  ${project.name}  (created ${project.createdAt})`);
}

const matches = projects.filter((p) => isEphemeralCiProjectName(p.name, prefixes));
const skipped = projects.filter((p) => !isEphemeralCiProjectName(p.name, prefixes));
for (const project of skipped) {
  console.log(`Keeping "${project.name}" — not an ephemeral CI project.`);
}
if (matches.length === 0) {
  console.log('No ephemeral CI projects to sweep.');
  process.exit(0);
}

let deleted = 0;
for (const project of matches) {
  console.log(`Sweeping "${project.name}" (created ${project.createdAt})…`);
  if (await deleteProject(project)) deleted++;
}
console.log(`Swept ${deleted}/${matches.length} ephemeral CI project(s).`);

// Fail only when the sweep achieved nothing at all — one stuck project must
// not redden an otherwise green run, but a wholly-failing sweep must.
if (deleted === 0) process.exit(1);
