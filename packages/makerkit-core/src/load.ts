import { isDescriptor, type Descriptor } from "./descriptors.ts";
import { isServiceHandle, type ServiceHandle } from "./service.ts";

/** One declared Input in a Loaded graph: its name and validated descriptor. */
export interface InputNode {
  readonly name: string;
  readonly descriptor: Descriptor;
}

/**
 * The in-memory graph `Load` builds from a service handle: every declared
 * Input, validated. Nothing has executed — the handler has not been called.
 */
export interface ServiceGraph {
  readonly service: ServiceHandle;
  readonly inputs: readonly InputNode[];
}

/** Thrown by `Load` when a service's declared dependencies are malformed. */
export class LoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoadError";
  }
}

/**
 * Builds and validates the in-memory graph of a service's declared Inputs.
 * Executes nothing — the handler is never called. Throws `LoadError` if any
 * declared Input lacks a valid descriptor.
 */
export function Load(service: ServiceHandle): ServiceGraph {
  if (!isServiceHandle(service)) {
    throw new LoadError("Load expects a service handle returned by defineService.");
  }

  const inputs: InputNode[] = [];

  for (const [name, descriptor] of Object.entries(service.dependencies)) {
    if (!isDescriptor(descriptor)) {
      throw new LoadError(
        `Service dependency "${name}" has no valid descriptor (got ${describe(descriptor)}).`,
      );
    }
    inputs.push({ name, descriptor });
  }

  return { service, inputs };
}

function describe(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
