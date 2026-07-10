/**
 * The accept/reject matrix for postgres()'s three argument shapes.
 *
 * Type-only (vitest `--typecheck`, never executed). Positive cases assert the
 * returned role via `expectTypeOf`; the negative argument shapes keep a
 * `// @ts-expect-error` on the offending line.
 */
import type { Dependable, ResourceEnd, ResourceNode } from '@makerkit/core';
import { expectTypeOf, test } from 'vitest';
import { postgres } from '../index.ts';

const identity = postgres({ name: 'db' });
const dep = postgres({ client: ({ url }) => ({ url }) });
const dual = postgres({ name: 'db', client: ({ url }) => ({ url }) });

test('{ name } yields the resource identity', () => {
  expectTypeOf(identity).toEqualTypeOf<ResourceNode<'postgres'>>();
});

test('{ client } yields the dependency slot, C inferred from the factory', () => {
  expectTypeOf(dep).toEqualTypeOf<ResourceEnd<{ url: string }, 'postgres'>>();
});

test('{ name, client } yields the dual — an identity that also describes its dependency', () => {
  expectTypeOf(dual).toEqualTypeOf<ResourceNode<'postgres'> & Dependable<{ url: string }, 'postgres'>>();
});

test('bad argument shapes do not compile', () => {
  // @ts-expect-error an empty argument is no shape at all
  postgres({});
  // @ts-expect-error the identity is not a dependency — no toDependency on it
  identity.toDependency();
  // @ts-expect-error a client must be a factory, not a config value
  postgres({ name: 'db', client: 'postgres://url' });
  // @ts-expect-error name is the identity's, not a factory
  postgres({ name: ({ url }: { url: string }) => ({ url }) });
});
