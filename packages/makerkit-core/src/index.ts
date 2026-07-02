/**
 * The control-plane surface: define services, declare dependencies, and
 * Load the graph they describe. Importing this module never hydrates a
 * dependency or runs a handler — see `@makerkit/core/runtime` for that.
 */
export { defineService, isServiceHandle } from "./service.ts";
export type {
  ServiceHandle,
  ServiceHandler,
  HydratedDeps,
  RuntimeContext,
} from "./service.ts";

export { postgres } from "./postgres.ts";

export { Load, LoadError } from "./load.ts";
export type { ServiceGraph, InputNode } from "./load.ts";

export { isDescriptor } from "./descriptors.ts";
export type { Descriptor, Dependencies, PostgresDescriptor } from "./descriptors.ts";
