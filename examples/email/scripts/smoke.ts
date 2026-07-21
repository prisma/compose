#!/usr/bin/env bun
/**
 * Verifies a DEPLOYED email example end to end (spec's end-to-end
 * requirement): resolves the mailer service's URL via the Management API,
 * `POST`s to the mailer's OWN `/send/welcome` endpoint (never the email
 * module's `send` port directly), then `GET`s the mailer's OWN
 * `/emails/:id` endpoint (never the module's `outbox` port directly) and
 * asserts the stored body round-trips. Proves the `none`-mode preview-stage
 * story: a real deploy with a junk credential, no Resend account, storing
 * and reading back through the app a consumer would actually write.
 *
 *   [EMAIL_STACK_NAME=…] bun scripts/smoke.ts
 *
 * Requires PRISMA_SERVICE_TOKEN (run via `pnpm smoke:deployed`, which
 * sources the deploy env file).
 */
import { blindCast } from '@prisma/composer/casts';

const api = 'https://api.prisma.io/v1';
const token = process.env['PRISMA_SERVICE_TOKEN'];
if (token === undefined || token === '') {
  throw new Error('PRISMA_SERVICE_TOKEN is required to resolve the deployed URL');
}
const stack = process.env['EMAIL_STACK_NAME'] ?? 'email-example';

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/** The list shape every Management API collection endpoint returns; only `data` is read. */
const rows = (body: unknown): Record<string, unknown>[] =>
  blindCast<
    { data?: Record<string, unknown>[] },
    'every Management API collection endpoint returns { data: [...] }'
  >(body).data ?? [];

const asId = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || value === '') throw new Error(`${what} is not a string id`);
  return value;
};

const project = rows(await get('/projects?limit=100')).find((p) => p['name'] === stack);
if (project === undefined) throw new Error(`no project named "${stack}" in the workspace`);
const projectId = asId(project['id'], 'project.id');

const branches = rows(await get(`/projects/${projectId}/branches?limit=100`));
const branch = branches.find((b) => b['isDefault'] === true);
if (branch === undefined) throw new Error('project has no default branch');
const branchId = asId(branch['id'], 'branch.id');

const candidates = rows(await get(`/apps?projectId=${projectId}&limit=100`)).filter(
  (s) => s['name'] === 'mailer',
);
const service = candidates.find((s) => s['branchId'] === branchId);
if (service === undefined) {
  throw new Error(`no "mailer" app on the production branch (candidates: ${candidates.length})`);
}
const domain = service['appEndpointDomain'];
if (typeof domain !== 'string' || domain === '')
  throw new Error('service has no endpoint domain yet');
const baseUrl = (domain.startsWith('http') ? domain : `https://${domain}`).replace(/\/$/, '');
console.log(`mailer URL: ${baseUrl}`);

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`ok   - ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL - ${name}`);
    console.error(error);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** A cold start after deploy (PRO-200) — poll the health route until it answers. */
async function waitUntilUp(): Promise<void> {
  const deadline = Date.now() + 180_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(6_000);
  }
  throw new Error(`mailer never came up within the deadline: ${String(lastError)}`);
}

async function main(): Promise<void> {
  await waitUntilUp();

  const marker = `smoke-${Date.now()}@example.com`;
  let sentId = '';

  await check('POST /send/welcome (the mailer’s own endpoint) stores mode "none"', async () => {
    const res = await fetch(`${baseUrl}/send/welcome`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: marker, name: 'Smoke Test' }),
    });
    assert(res.status === 201, `expected 201, got ${res.status}`);
    const body = blindCast<
      { id: string; status: string },
      'the mailer proxies the send port’s { id, status } result unchanged'
    >(await res.json());
    assert(body.status === 'stored', `expected status "stored" (mode none), got "${body.status}"`);
    sentId = body.id;
  });

  await check(
    'GET /emails/:id (the mailer’s own endpoint) reads the stored body back',
    async () => {
      const res = await fetch(`${baseUrl}/emails/${sentId}`);
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const email = blindCast<
        { to: string[]; subject: string; html: string; status: string },
        'the mailer proxies the outbox port’s email record unchanged'
      >(await res.json());
      assert(
        email.to.includes(marker),
        `expected "to" to include ${marker}, got ${JSON.stringify(email.to)}`,
      );
      assert(email.subject === 'Welcome, Smoke Test!', `unexpected subject: ${email.subject}`);
      assert(email.html.includes('Smoke Test'), `rendered body did not round-trip: ${email.html}`);
      assert(email.status === 'stored', `expected status "stored", got "${email.status}"`);
    },
  );

  await check('GET /emails lists the sent email through the outbox port', async () => {
    const res = await fetch(`${baseUrl}/emails?to=${encodeURIComponent(marker)}`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = blindCast<{ emails: { id: string }[] }, 'listEmails returns { emails }'>(
      await res.json(),
    );
    assert(
      body.emails.some((e) => e.id === sentId),
      `expected the sent email (${sentId}) in the list`,
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
