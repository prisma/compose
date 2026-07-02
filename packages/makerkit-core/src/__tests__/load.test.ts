import { describe, expect, test } from "bun:test";
import { service } from "../service.ts";
import { postgres } from "../postgres.ts";
import { Load, LoadError } from "../load.ts";

describe("Load", () => {
  test("builds a graph of the service's declared Inputs", () => {
    const dbDescriptor = postgres();
    const svc = service({ db: dbDescriptor }, () => ({}));

    const graph = Load(svc);

    expect(graph.service).toBe(svc);
    expect(graph.inputs).toEqual([{ name: "db", descriptor: dbDescriptor }]);
  });

  test("validates every declared Input has a descriptor", () => {
    const svc = service(
      { db: postgres(), cache: postgres() },
      () => ({}),
    );

    const graph = Load(svc);

    expect(graph.inputs.map((i) => i.name).sort()).toEqual(["cache", "db"]);
  });

  test("executes nothing", () => {
    let calls = 0;
    const svc = service({ db: postgres() }, () => {
      calls += 1;
      return {};
    });

    Load(svc);

    expect(calls).toBe(0);
  });

  test("rejects a service with an Input that has no valid descriptor", () => {
    const svc = service(
      { db: { nope: true } as never },
      ({ db }) => ({ db }),
    );

    expect(() => Load(svc)).toThrow(LoadError);
    expect(() => Load(svc)).toThrow(/db/);
  });

  test("rejects something that isn't a service handle", () => {
    expect(() => Load({} as never)).toThrow(LoadError);
  });
});

describe("Load on a malformed service module", () => {
  test("fails with a clear error", async () => {
    const fixture = await import("./fixtures/malformed-service.ts");

    expect(() => Load(fixture.default)).toThrow(LoadError);
    expect(() => Load(fixture.default)).toThrow(/db/);
  });
});
