import { defineService, postgres } from "../../index.ts";

// Importing this module must not increment this counter — only calling
// `.run(...)` on the exported handle should.
export let handlerCallCount = 0;

export default defineService({ db: postgres() }, ({ db }) => {
  handlerCallCount += 1;
  return { db };
});
