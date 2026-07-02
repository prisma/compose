import { describe, expect, test } from "bun:test";
import { defineService } from "../service.ts";
import { postgres } from "../postgres.ts";
import { Load, LoadError } from "../load.ts";

describe("Load", () => {
  test("builds a graph of the service's declared Inputs", () => {
    const dbDescriptor = postgres();
    const service = defineService({ db: dbDescriptor }, () => ({}));

    const graph = Load(service);

    expect(graph.service).toBe(service);
    expect(graph.inputs).toEqual([{ name: "db", descriptor: dbDescriptor }]);
  });

  test("validates every declared Input has a descriptor", () => {
    const service = defineService(
      { db: postgres(), cache: postgres() },
      () => ({}),
    );

    const graph = Load(service);

    expect(graph.inputs.map((i) => i.name).sort()).toEqual(["cache", "db"]);
  });

  test("executes nothing", () => {
    let calls = 0;
    const service = defineService({ db: postgres() }, () => {
      calls += 1;
      return {};
    });

    Load(service);

    expect(calls).toBe(0);
  });

  test("rejects a service with an Input that has no valid descriptor", () => {
    const service = defineService(
      { db: { nope: true } as never },
      ({ db }) => ({ db }),
    );

    expect(() => Load(service)).toThrow(LoadError);
    expect(() => Load(service)).toThrow(/db/);
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
