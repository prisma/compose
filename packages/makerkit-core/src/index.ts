/**
 * The authoring + control entry: node factories, Load, configOf, and the
 * model types. Imports nothing — bundling a module that uses this entry
 * ships only this code. (/control carves out of here when the control
 * surface grows.) Pure barrel — no implementations live here.
 */
export { resource, service, connectionEnd, hex, isNode } from "./node.ts";
export type {
  NodeBase,
  ResourceNode,
  ServiceNode,
  ConnectionEnd,
  HexNode,
  HexBuilder,
  ProvisionedRef,
  Deps,
  Hydrated,
  HydratedDeps,
  NodeBase,
  ResourceNode,
  ServiceHandler,
  ServiceNode,
} from './node.ts';
export { isNode, resource, service } from './node.ts';
