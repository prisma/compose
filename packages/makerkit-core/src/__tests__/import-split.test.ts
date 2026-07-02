import { describe, expect, test } from "bun:test";
import * as path from "node:path";

/**
 * The most foundational property of the package: bundling the `.` authoring
 * entry (what a user service imports for `defineService`/`postgres`) must not
 * drag in the control-plane provisioning stack (Alchemy/Effect/prisma-alchemy)
 * or execution-plane runtime code (`Bun.SQL`). A stray value import — e.g.
 * turning an `import type` into a value import — would silently reintroduce it.
 */
describe("control/execution import split", () => {
  test("the '.' authoring entry pulls in no control/execution plane", async () => {
    const entry = path.join(import.meta.dir, "..", "index.ts");

    const out = await Bun.build({ entrypoints: [entry], target: "bun" });
    expect(out.success).toBe(true);

    const js = await out.outputs[0].text();
    for (const token of ["alchemy", "effect", "prisma-alchemy", "new SQL(", "ProviderCollection"]) {
      expect(js).not.toContain(token);
    }
  });
});
