/**
 * The mailer example app's integration test: drives the app against the
 * email module's local stand-in (`startLocalEmailServer` — in-memory store,
 * mode `none`, no cloud credentials) and asserts the full chain the spec's
 * end-to-end requirement pins: an HTTP request to the app's OWN endpoint
 * causes the send, and the assertion reads the stored email back through a
 * SEPARATE app endpoint that itself reads the outbox port — the test never
 * calls `emailSendContract`/`emailOutboxContract` directly. The same
 * `createEmailApp` handler runs behind `Bun.serve` in the deployed service.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { rpc } from '@prisma/composer/service-rpc';
import { emailOutboxContract, emailSender } from '@prisma/composer-prisma-cloud/email';
import {
  type LocalEmailServer,
  startLocalEmailServer,
} from '@prisma/composer-prisma-cloud/email/testing';
import { createEmailApp } from '../src/mailer/app.ts';
import { templates } from '../src/mailer/templates.ts';

describe('mailer example app (against the local email stand-in)', () => {
  let server: LocalEmailServer;
  let app: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    server = await startLocalEmailServer();
    // The same wiring the app's own service.load() produces — hydrated
    // directly against the local server's URL, with no deploy graph, exactly
    // the way the deployed app's dependencies are wired for it at boot.
    // `connection.hydrate` is typed `C | Promise<C>` (some dependency kinds
    // hydrate async); both of this app's kinds hydrate synchronously, and
    // `await` resolves either shape.
    const email = await emailSender(templates).connection.hydrate({ url: server.url });
    const outbox = await rpc(emailOutboxContract).connection.hydrate({ url: server.url });
    app = createEmailApp(email, outbox);
  });

  afterAll(async () => {
    await server?.stop();
  });

  test('POST /send/welcome then GET /emails/:id round-trips the rendered body through the outbox', async () => {
    const sendRes = await app(
      new Request('http://mailer/send/welcome', {
        method: 'POST',
        body: JSON.stringify({ to: 'user@example.com', name: 'Ada' }),
      }),
    );
    expect(sendRes.status).toBe(201);
    const sent = (await sendRes.json()) as { id: string; status: string };
    expect(sent.status).toBe('stored');

    const getRes = await app(new Request(`http://mailer/emails/${sent.id}`));
    expect(getRes.status).toBe(200);
    const email = (await getRes.json()) as { subject: string; html: string; status: string };
    expect(email.subject).toBe('Welcome, Ada!');
    expect(email.html).toContain('Ada');
    expect(email.status).toBe('stored');
  });

  test('POST /send/verification renders the link into the stored body', async () => {
    const sendRes = await app(
      new Request('http://mailer/send/verification', {
        method: 'POST',
        body: JSON.stringify({ to: 'user@example.com', link: 'https://example.com/verify/abc' }),
      }),
    );
    const sent = (await sendRes.json()) as { id: string };

    const getRes = await app(new Request(`http://mailer/emails/${sent.id}`));
    const email = (await getRes.json()) as { html: string; text: string };
    expect(email.html).toContain('https://example.com/verify/abc');
    expect(email.text).toContain('https://example.com/verify/abc');
  });

  test('GET /emails lists what was sent, filterable by templateId', async () => {
    const res = await app(new Request('http://mailer/emails?templateId=welcome'));
    expect(res.status).toBe(200);
    const { emails } = (await res.json()) as { emails: { templateId: string }[] };
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((e) => e.templateId === 'welcome')).toBe(true);
  });

  test('a repeated idempotencyKey dedups — the second POST returns the same row, no re-send', async () => {
    const idempotencyKey = crypto.randomUUID();
    const first = await app(
      new Request('http://mailer/send/welcome', {
        method: 'POST',
        body: JSON.stringify({ to: 'dedup@example.com', name: 'First', idempotencyKey }),
      }),
    );
    const firstBody = (await first.json()) as { id: string };

    const second = await app(
      new Request('http://mailer/send/welcome', {
        method: 'POST',
        body: JSON.stringify({ to: 'dedup@example.com', name: 'Second, ignored', idempotencyKey }),
      }),
    );
    const secondBody = (await second.json()) as { id: string };
    expect(secondBody.id).toBe(firstBody.id);

    const getRes = await app(new Request(`http://mailer/emails/${firstBody.id}`));
    const email = (await getRes.json()) as { subject: string };
    expect(email.subject).toBe('Welcome, First!');
  });

  test('GET /emails/:id for an unknown id is 404', async () => {
    const res = await app(new Request('http://mailer/emails/does-not-exist'));
    expect(res.status).toBe(404);
  });
});
