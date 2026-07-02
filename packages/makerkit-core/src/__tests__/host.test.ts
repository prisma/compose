import { describe, expect, test } from "bun:test";
import { service, type RuntimeContext } from "../service.ts";
import { postgres } from "../postgres.ts";
import { runHost } from "../runtime/host.ts";

describe("runHost", () => {
  test("hydrates declared deps from env and calls the handler with them", () => {
    let received: unknown;
    const svc = service({ db: postgres() }, (deps) => {
      received = deps;
      return "served";
    });

    const result = runHost(svc, {
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    });

    expect(result).toBe("served");
    const deps = received as { db: unknown };
    expect(typeof deps.db).toBe("function");
    expect(typeof (deps.db as { close?: unknown }).close).toBe("function");
  });

  test("resolves PORT at the env boundary and passes it in the serving context", () => {
    let ctx: RuntimeContext | undefined;
    const svc = service({ db: postgres() }, (_deps, c) => {
      ctx = c;
    });

    runHost(svc, {
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      PORT: "8080",
    });

    expect(ctx).toEqual({ port: 8080 });
  });

  test("defaults the serving port when PORT is unset", () => {
    let ctx: RuntimeContext | undefined;
    const svc = service({ db: postgres() }, (_deps, c) => {
      ctx = c;
    });

    runHost(svc, { DATABASE_URL: "postgres://user:pass@localhost:5432/db" });

    expect(ctx).toEqual({ port: 3000 });
  });

  test("passes one hydrated client per declared dependency, keyed by name", () => {
    let received: Record<string, unknown> = {};
    const svc = service(
      { primary: postgres(), replica: postgres() },
      (deps) => {
        received = deps as Record<string, unknown>;
        return null;
      },
    );

    runHost(svc, { DATABASE_URL: "postgres://user:pass@localhost:5432/db" });

    expect(Object.keys(received).sort()).toEqual(["primary", "replica"]);
  });

  test("does not run the handler until invoked (service() is inert)", () => {
    let calls = 0;
    service({ db: postgres() }, () => {
      calls += 1;
    });

    expect(calls).toBe(0);
  });

  test("surfaces a missing DATABASE_URL as a hydration error", () => {
    const svc = service({ db: postgres() }, () => null);

    expect(() => runHost(svc, {})).toThrow(/DATABASE_URL/);
  });

  test("rejects anything that isn't a service handle", () => {
    expect(() => runHost({} as never, {})).toThrow(/service handle/);
  });
});
