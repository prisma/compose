/// <reference types="bun" />
/**
 * The ops service's integration proof (spec §7): the back office booted through
 * the framework's seam. `bootstrapService` boots ops's real built entry
 * (`dist/ops/server.mjs`) in-process with its dependency inputs pointed at the
 * running local servers, so `service.load()` hydrates the same client shapes a
 * deploy would — deps INFERRED from the service node, no hand-declared OpsDeps.
 *
 * The api side is a Next.js standalone and is covered by
 * `api.integration.test.ts`; this test drives ops directly: a user is created
 * against the local auth server (which sends a verification email to the email
 * module's outbox), then ops reads that email back through its OWN
 * find-sent-email route (the outbox port) and exercises the admin port
 * (find-user, revoke) — the module-to-module + least-privilege proof.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { authTemplates } from '@prisma/composer-prisma-cloud/auth';
import type { LocalAuthServer } from '@prisma/composer-prisma-cloud/auth/testing';
import { startLocalAuthServer } from '@prisma/composer-prisma-cloud/auth/testing';
import { emailSender } from '@prisma/composer-prisma-cloud/email';
import type { LocalEmailServer } from '@prisma/composer-prisma-cloud/email/testing';
import { startLocalEmailServer } from '@prisma/composer-prisma-cloud/email/testing';
import type { BootstrappedService } from '@prisma/composer-prisma-cloud/testing';
import { bootstrapService } from '@prisma/composer-prisma-cloud/testing';
import opsService from '../src/ops/service.ts';
import {
  createTestDatabase,
  startTestPostgres,
  type TestDatabase,
  type TestPostgres,
} from './pg-harness.ts';

const pgServer: TestPostgres | undefined = startTestPostgres();

if (pgServer === undefined) {
  console.warn(
    '[example-auth] skipping ops integration test: no Postgres available. ' +
      'Set STATE_TEST_DATABASE_URL or install initdb/pg_ctl on PATH.',
  );
}

const EMAIL = 'ops@example.com';
const PASSWORD = 'correct-horse-battery';
const OPS_PORT = 4521;

describe.skipIf(pgServer === undefined)('the ops service, booted via bootstrapService', () => {
  if (pgServer === undefined) return;
  let db: TestDatabase;
  let mailServer: LocalEmailServer;
  let auth: LocalAuthServer;
  let opsApp: BootstrappedService;

  const call = (path: string, init?: RequestInit) => opsApp.fetch(new URL(path, opsApp.url), init);
  const json = (body: unknown, headers: Record<string, string> = {}) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    db = await createTestDatabase(pgServer.url);
    mailServer = await startLocalEmailServer();
    const email = await emailSender(authTemplates).connection.hydrate({ url: mailServer.url });
    auth = await startLocalAuthServer({ databaseUrl: db.url, email });

    opsApp = await bootstrapService(opsService, {
      service: { port: OPS_PORT },
      inputs: { admin: { url: auth.url }, outbox: { url: mailServer.url } },
    });

    // Create a verified-flow user against the auth server directly (the api
    // service's job in the deployed loop); the signup sends a verification
    // email to the outbox ops reads.
    const signup = await fetch(new URL('/api/auth/sign-up/email', auth.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: auth.url },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'Ops' }),
    });
    if (signup.status !== 200) throw new Error(`auth signup failed: ${signup.status}`);
  });
  afterAll(async () => {
    await auth?.stop();
    await mailServer?.stop();
    await db?.drop().catch(() => {});
    pgServer.stop();
  });

  test('find-sent-email reads the verification email back through the outbox port', async () => {
    const res = await call(
      '/admin/find-sent-email',
      json({ to: EMAIL, templateId: 'verification' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subject: string; text: string | null };
    expect(body.subject).toBe('Verify your email address');
    expect(body.text ?? '').toContain('http');
  });

  test('the admin port finds and revokes the user', async () => {
    const found = await call('/admin/find-user', json({ email: EMAIL.toUpperCase() }));
    const user = ((await found.json()) as { user: { id: string } | null }).user;
    expect(user).not.toBeNull();

    const revoked = await call('/admin/revoke-user-sessions', json({ userId: user?.id ?? '' }));
    expect(revoked.status).toBe(200);
  });
});
