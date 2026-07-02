// Runtime bundle entry (app-owned).
import { runHost } from "@makerkit/core/runtime";
import { runtime } from "@makerkit/prisma-cloud/runtime";
import service from "./service";

// This service declares no inputs, so no client is ever hydrated; the pack's
// RuntimeOptions nevertheless requires a postgres factory (a capability
// provision, not a dependency — flagged as a possible pack API refinement).
runHost(service, runtime({ clients: { postgres: ({ url }) => ({ url }) } }));
