import { describe, expect, test } from "bun:test";
import { service, isServiceHandle } from "../index.ts";
import { postgres } from "../postgres.ts";

describe("service", () => {
  test("returns a handle exposing the declared dependency descriptors", () => {
    const db = postgres();
    const svc = service({ db }, () => ({}));

    expect(isServiceHandle(svc)).toBe(true);
    expect(svc.dependencies).toEqual({ db: { kind: "postgres" } });
    expect(svc.dependencies.db).toBe(db);
  });

  test("returns a handle runnable with hydrated deps", () => {
    const svc = service(
      { db: postgres() },
      ({ db }) => ({ echoed: db }),
    );

    const fakeDb = { query: () => "fake" } as never;
    const result = svc.run({ db: fakeDb }, { port: 3000 });

    expect(result).toEqual({ echoed: fakeDb });
  });

  test("does not run the handler when defined", () => {
    let calls = 0;
    service({ db: postgres() }, () => {
      calls += 1;
      return {};
    });

    expect(calls).toBe(0);
  });
});

describe("importing a service module", () => {
  test("does not execute the handler", async () => {
    const fixture = await import("./fixtures/side-effect-service.ts");

    expect(fixture.handlerCallCount).toBe(0);
    expect(isServiceHandle(fixture.default)).toBe(true);

    fixture.default.run({ db: {} as never }, { port: 3000 });
    expect(fixture.handlerCallCount).toBe(1);
  });
});
