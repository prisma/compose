/**
 * Type-level tests for cron() (ADR-0020, S2 dispatch 3): the returned
 * system's boundary deps are exactly the router's own deps, and a router
 * that doesn't expose `{ trigger: triggerContract }` is rejected at compile
 * time.
 *
 * Type-only (vitest --typecheck, never executed) — mirrors
 * serve-schedule.test-d.ts.
 */
import type { SystemNode } from '@prisma/app';
import { compute } from '@prisma/app-cloud';
import node from '@prisma/app-node';
import { contract, rpc } from '@prisma/app-rpc';
import { type } from 'arktype';
import { test } from 'vitest';
import { triggerContract } from '../contract.ts';
import { defineSchedule } from '../schedule.ts';
import { cron } from '../system.ts';

const build = node({ module: import.meta.url, entry: '../dist/service.mjs' });

const workerContract = contract({
  work: rpc({ input: type({ jobId: 'string' }), output: type({ ok: 'boolean' }) }),
});

const router = compute({
  name: 'router',
  deps: { worker: rpc(workerContract) },
  build,
  expose: { trigger: triggerContract },
});

const notARouter = compute({
  name: 'not-a-router',
  deps: {},
  build,
  expose: { work: workerContract },
});

const schedule = defineSchedule({ tick: '2s' });

test("cron() yields a SystemNode whose boundary deps are exactly the router's own deps", () => {
  const cronSystem = cron('cron', { schedule, router });
  // Fails to compile unless cron()'s inferred RD is exactly typeof router.inputs.
  const asRouterDeps: SystemNode<typeof router.inputs, Record<never, never>> = cronSystem;
  void asRouterDeps;
});

test('a router that does not expose { trigger: triggerContract } is rejected', () => {
  // @ts-expect-error notARouter exposes `work`, not the required `trigger`
  cron('cron', { schedule, router: notARouter });
});
