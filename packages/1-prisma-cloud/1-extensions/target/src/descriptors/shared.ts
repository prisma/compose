/** Helpers shared by the per-node-kind descriptors under `src/descriptors/` and the extension factory in `control.ts`. */

import { blindCast } from '@internal/foundation/casts';
import type * as Prisma from '@internal/lowering';
import type * as Output from 'alchemy/Output';
import type { ProviderParamEntry } from '../serializer.ts';

/**
 * The provider-side reserved param for one brand's minted values (ADR-0031:
 * "the provisioner owns mint, size, **aggregation**, stability, and
 * rotation", and ADR-0019: the physical encoding is the target's). `value`
 * is deploy-side: given every inbound edge's minted ref for one provider
 * (possibly empty), it returns the typed value to store, or `undefined` to
 * write no row. The returned value is encoded through the serializer's
 * normal service-own literal path (JSON) — the same path any declared param
 * takes — never a brand-invented wire format.
 *
 * This is the seam that keeps `descriptors/compute.ts` brand-blind: a
 * `ProviderParam` is registered beside its brand's provisioner in
 * `control.ts`; the descriptor asks every registered entry about every
 * exposing service and writes whatever comes back.
 */
export interface ProviderParam extends ProviderParamEntry {
  /**
   * Every inbound edge's minted ref for this provider — POSSIBLY EMPTY. A
   * provider with no wired consumers is still asked, because "no edges" and
   * "no var" mean different things at boot: an absent var reads as "never
   * provisioned" (local dev, tests). What an empty set means is this param's
   * own call — deny everything, or emit nothing and let its reader fail closed.
   */
  readonly value: (refs: readonly unknown[]) => Output.Output<unknown> | unknown | undefined;
}

/**
 * The factory's resolved options each node descriptor closes over. `projectId`
 * and `branchId` come from the CLI (stage-as-branch): a named stage sets
 * `branchId`, routing every branch-scoped resource there with the `preview` class.
 */
export interface ResolvedCloudOptions {
  readonly workspaceId: string;
  readonly region?: Prisma.ComputeRegion;
  readonly projectId: string | undefined;
  readonly branchId: string | undefined;
  /**
   * This extension's reserved provider params, keyed by need brand — the
   * mirror of the `provisions` registry core resolves mints through. Passed
   * as data so the descriptors never import a brand's module (and so
   * control.ts, which owns both registries, stays the only place a brand is
   * named).
   */
  readonly providerParams: ReadonlyMap<symbol, ProviderParam>;
}

/** Where a resource lands when the deploy names no region. */
export const DEFAULT_REGION: Prisma.ComputeRegion = 'us-east-1';

// Prisma's Connection create constrains `name` to 3–65 chars (Management API:
// POST /v1/connections); applied here to every id-derived resource name as the
// tightest of the API's name-length rules.
const PRISMA_NAME_MIN = 3;
const PRISMA_NAME_MAX = 65;

export function validateName(value: string, source: string): void {
  if (value.length < PRISMA_NAME_MIN || value.length > PRISMA_NAME_MAX) {
    throw new Error(
      `prisma-cloud: ${source} "${value}" (${value.length} characters) is not a valid Prisma ` +
        `resource name — Prisma requires ${PRISMA_NAME_MIN}–${PRISMA_NAME_MAX} characters. ` +
        'Rename the provision id (or the deploy --name) to fit.',
    );
  }
}

/** The application/provisioned hook's `projectId` output — `LoweredNode.outputs` is typed `unknown`, so this is the one asserted read. */
export const projectIdOf = (hook: {
  readonly outputs: Readonly<Record<string, unknown>>;
}): string =>
  blindCast<
    string,
    'the projectId output is a provisioning string ref the application hook produced; LoweredNode.outputs is typed unknown'
  >(hook.outputs['projectId']);
