/**
 * Pipeline step 5 (deploy-cli.md § The pipeline, ADR-0004/0005): for every
 * service node in the loaded graph, anchor its directory from `url`, route
 * its build adapter's `kind` to the matching `/assemble` entry, and run it.
 * A service root produces one bundle; a hex root produces one bundle per
 * provision id (graph.nodes' own ids for provisioned services — the same
 * correlation the interim `alchemy.run.ts`/`hex.ts` hand-wrote).
 */
import { fileURLToPath } from 'node:url';
import type { BuildAdapter, Graph, GraphNode, ServiceNode } from '@makerkit/core';
import { CliError } from './cli-error.ts';
import { findPackageDir } from './package-anchor.ts';
import { INLINE_EVERYTHING_EXCEPT_RUNTIME_BUILTINS } from './wrapper-inline.ts';

/** kind → the assembler module resolved for it (mirrors the pack's light/`/target` split). */
const ASSEMBLER_BY_KIND: Record<string, string> = {
  node: '@makerkit/node/assemble',
  nextjs: '@makerkit/nextjs/assemble',
};

export interface Bundle {
  readonly dir: string;
  readonly entry: string;
}

export interface AssembledServices {
  /** Set when the root is a lone service. */
  readonly bundle?: Bundle;
  /** Set when the root is a hex — keyed by each service's provision id. */
  readonly bundles?: Record<string, Bundle>;
}

export interface AssemblerInput {
  readonly serviceDir: string;
  readonly serviceModule: string;
  readonly build: BuildAdapter;
  readonly wrapperNoExternal: readonly RegExp[];
}

/** Runs the module at `specifier`'s `assemble()` export — the seam tests substitute to avoid a real build. */
export type RunAssembler = (specifier: string, input: AssemblerInput) => Promise<Bundle>;

const runAssembler: RunAssembler = async (specifier, input) => {
  // A dynamic import() with a non-literal specifier types as `any`.
  const mod = await import(specifier);
  return mod.assemble(input);
};

function assemblerSpecifierFor(node: ServiceNode): string {
  const specifier = ASSEMBLER_BY_KIND[node.build.kind];
  if (specifier === undefined) {
    throw new CliError(
      `Service "${node.name}" declares build kind "${node.build.kind}", which has no assembler ` +
        `(known kinds: ${Object.keys(ASSEMBLER_BY_KIND).sort().join(', ')}).`,
    );
  }
  return specifier;
}

async function assembleOne(node: ServiceNode, run: RunAssembler): Promise<Bundle> {
  const serviceModule = fileURLToPath(node.url);
  const serviceDir = findPackageDir(serviceModule, `service "${node.name}"`);
  const specifier = assemblerSpecifierFor(node);

  return run(specifier, {
    serviceDir,
    serviceModule,
    build: node.build,
    wrapperNoExternal: INLINE_EVERYTHING_EXCEPT_RUNTIME_BUILTINS,
  });
}

export async function assembleServices(
  graph: Graph,
  isHexRoot: boolean,
  run: RunAssembler = runAssembler,
): Promise<AssembledServices> {
  const serviceNodes = graph.nodes.filter(
    (n): n is GraphNode & { node: ServiceNode } => n.node.kind === 'service',
  );

  if (!isHexRoot) {
    const [only] = serviceNodes;
    if (only === undefined) {
      throw new CliError('The loaded graph has no service to assemble.');
    }
    return { bundle: await assembleOne(only.node, run) };
  }

  const bundles: Record<string, Bundle> = {};
  for (const { id, node } of serviceNodes) {
    bundles[id] = await assembleOne(node, run);
  }
  return { bundles };
}
