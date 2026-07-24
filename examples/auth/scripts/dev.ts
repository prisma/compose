/**
 * Local dev, no cloud creds — the store-style fallback (spec § 5) for when the
 * `prisma-composer dev` pipeline has blocking friction for this module. Boots a
 * throwaway Postgres, the email module's `startLocalEmailServer` (its outbox is
 * where verification / magic-link emails land — local delivery is `none`), and
 * the auth module's `startLocalAuthServer` wired to send through that outbox,
 * then runs the api's `next dev` with the three auth ports + the outbox port
 * wired to those loopback servers.
 *
 * The auth server's `baseUrl` is the APP origin (not the auth server's own),
 * so verification / magic links point at `<app>/api/auth/*` → the proxy →
 * first-party cookies in the browser.
 *
 * The Next app reads its deps from `service.load()`, which resolves config from
 * the environment under the framework's address-free keys
 * (`COMPOSER_<input>_<param>` — the serializer's scheme). A dependency input's
 * value passes through as its raw URL string.
 */
import { authTemplates } from '@prisma/composer-prisma-cloud/auth';
import { startLocalAuthServer } from '@prisma/composer-prisma-cloud/auth/testing';
import { emailSender } from '@prisma/composer-prisma-cloud/email';
import { startLocalEmailServer } from '@prisma/composer-prisma-cloud/email/testing';
import { createTestDatabase, startTestPostgres } from '../tests/pg-harness.ts';

const port = Number(process.env['PORT'] ?? 3000);
const appOrigin = `http://localhost:${port}`;

const pgServer = startTestPostgres();
if (pgServer === undefined) {
  throw new Error(
    'local dev needs Postgres: set STATE_TEST_DATABASE_URL, or install initdb/pg_ctl (e.g. `brew install postgresql`).',
  );
}

const db = await createTestDatabase(pgServer.url);
const mailServer = await startLocalEmailServer();
const email = await emailSender(authTemplates).connection.hydrate({ url: mailServer.url });
const auth = await startLocalAuthServer({ databaseUrl: db.url, email, baseUrl: appOrigin });

console.log(`local postgres   ${db.url}`);
console.log(`local email      ${mailServer.url}`);
console.log(`local auth       ${auth.url}`);
console.log(`app              ${appOrigin}`);

const next = Bun.spawn(['pnpm', 'next', 'dev', '--port', String(port)], {
  cwd: new URL('../modules/api', import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(port),
    COMPOSER_AUTHAPI_URL: auth.url,
    COMPOSER_VERIFIER_URL: auth.url,
    COMPOSER_SESSION_URL: auth.url,
    COMPOSER_OUTBOX_URL: mailServer.url,
  },
  stdio: ['inherit', 'inherit', 'inherit'],
});

const shutdown = async () => {
  next.kill();
  await auth.stop();
  await mailServer.stop();
  await db.drop().catch(() => {});
  pgServer.stop();
};
process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));

await next.exited;
await shutdown();
