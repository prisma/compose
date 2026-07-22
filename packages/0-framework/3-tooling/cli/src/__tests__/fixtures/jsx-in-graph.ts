// @ts-nocheck -- this package's tsconfig has no --jsx; this fixture exists
// only to be executed by real node (jsx-load-error.test.ts / node's own
// runtime failure), never typechecked.
//
// Stands in for a service.ts that imports a react-email (or any JSX) template
// a couple of hops from the entry — proves the offending path node reports is
// the transitively-imported .tsx, not this file.
export { Widget } from './jsx-in-graph.tsx';
