import { describe, expect, test } from "bun:test";
import { service } from "../service.ts";
import { postgres } from "../postgres.ts";
import { toResourcePlan, type LowerOptions } from "../lower.ts";

const baseOpts: LowerOptions = {
  workspaceId: "ws_123",
  name: "hello",
  artifactPath: "/tmp/hello.tar.gz",
  artifactHash: "abc123",
};

describe("toResourcePlan", () => {
  test("maps a single postgres-backed service to Project + ComputeService + Deployment", () => {
    const svc = service({ db: postgres() }, () => null);

    const plan = toResourcePlan(svc, baseOpts);

    expect(plan.project).toEqual({
      id: "hello-project",
      workspaceId: "ws_123",
      name: "hello",
    });
    expect(plan.computeService).toEqual({
      id: "hello-svc",
      projectId: "hello-project",
      name: "hello",
      region: "us-east-1",
    });
    expect(plan.deployment).toEqual({
      id: "hello-deploy",
      computeServiceId: "hello-svc",
      artifactPath: "/tmp/hello.tar.gz",
      artifactHash: "abc123",
      port: 3000,
    });
  });

  test("routes postgres() Inputs to the project's default database (no extra resource)", () => {
    const svc = service({ db: postgres() }, () => null);

    const plan = toResourcePlan(svc, baseOpts);

    expect(plan.defaultDatabaseInputs).toEqual(["db"]);
  });

  test("honors region and port overrides", () => {
    const svc = service({ db: postgres() }, () => null);

    const plan = toResourcePlan(svc, { ...baseOpts, region: "eu-west-3", port: 8080 });

    expect(plan.computeService.region).toBe("eu-west-3");
    expect(plan.deployment.port).toBe(8080);
  });

  test("validates the graph before mapping (malformed descriptor rejected)", () => {
    const svc = service({ db: { nope: true } as never }, () => null);

    expect(() => toResourcePlan(svc, baseOpts)).toThrow(/db/);
  });

  test("rejects an unknown dependency kind", () => {
    const svc = service(
      { cache: { kind: "redis" } as never },
      () => null,
    );

    expect(() => toResourcePlan(svc, baseOpts)).toThrow(/cache/);
  });

  test("runs no handler", () => {
    let calls = 0;
    const svc = service({ db: postgres() }, () => {
      calls += 1;
    });

    toResourcePlan(svc, baseOpts);

    expect(calls).toBe(0);
  });
});
