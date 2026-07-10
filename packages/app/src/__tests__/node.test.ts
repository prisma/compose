import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Contract } from '../contract.ts';
import { dependency, hex, isNode, resource, service } from '../node.ts';
import { conn, providerContract } from './helpers.ts';

const fakeContract = <Cmp>(cmp: Cmp): Contract<'rpc', Cmp> => ({
  kind: 'rpc',
  __cmp: cmp,
  satisfies: (required) => required.__cmp === cmp,
});

const dbContract = () => providerContract('fake/db', { url: '' });

// A real, importable ES module written to a throwaway temp file — data: URL
// imports proved unreliable under bun for anything beyond a trivial body
// (member-expression-heavy sources silently fell back to a CJS-interop
// namespace), so this uses the same real-file approach every other package's
// dynamic-import test already relies on.
const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function dataModule(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'makerkit-core-node-test-'));
  tmpDirs.push(dir);
  const file = path.join(dir, 'mod.mjs');
  fs.writeFileSync(file, source);
  return pathToFileURL(file).href;
}

describe('resource()', () => {
  test('returns a branded, frozen resource identity — the routing type is the provided contract kind', () => {
    const provides = dbContract();
    const node = resource({
      name: 'db',
      pack: '@prisma/app-cloud',
      provides,
    });

    expect(isNode(node)).toBe(true);
    expect(node.kind).toBe('resource');
    expect(node.name).toBe('db');
    expect(node.pack).toBe('@prisma/app-cloud');
    expect(node.type).toBe('fake/db');
    expect(node.provides).toBe(provides);
    expect(Object.isFrozen(node)).toBe(true);
  });

  test('throws when provides is missing or not a contract (kind + satisfies)', () => {
    expect(() => resource({ name: 'db', pack: 'test/pack', provides: {} as never })).toThrow(
      /requires `provides`/,
    );
    expect(() =>
      resource({
        name: 'db',
        pack: 'test/pack',
        provides: { kind: '', satisfies: () => true } as never,
      }),
    ).toThrow(/requires `provides`/);
    expect(() =>
      resource({ name: 'db', pack: 'test/pack', provides: { kind: 'fake/db' } as never }),
    ).toThrow(/requires `provides`/);
  });

  test('throws on an empty name', () => {
    expect(() => resource({ name: '', pack: 'test/pack', provides: dbContract() })).toThrow(
      /non-empty name/,
    );
  });

  test('throws on an empty pack', () => {
    expect(() => resource({ name: 'db', pack: '', provides: dbContract() })).toThrow(
      /non-empty pack/,
    );
  });

  test('targetModule is absent by default, and set when given', () => {
    const bare = resource({ name: 'db', pack: 'test/pack', provides: dbContract() });
    expect(bare.targetModule).toBeUndefined();

    const withTarget = resource({
      name: 'db',
      pack: 'test/pack',
      provides: dbContract(),
      targetModule: '@prisma/app-cloud/target',
    });
    expect(withTarget.targetModule).toBe('@prisma/app-cloud/target');
  });
});

describe('dependency()', () => {
  test('returns a branded, frozen dependency end carrying its given name and connection', () => {
    const end = dependency({
      name: 'db',
      type: 'fake/db',
      connection: conn({ url: { type: 'string', secret: true } }, (v) => ({ url: v.url })),
    });

    expect(isNode(end)).toBe(true);
    expect(end.kind).toBe('dependency');
    expect(end.name).toBe('db');
    expect(end.type).toBe('fake/db');
    expect(end.connection.params).toEqual({ url: { type: 'string', secret: true } });
    expect(Object.isFrozen(end)).toBe(true);
    expect(Object.isFrozen(end.connection)).toBe(true);
    expect(Object.isFrozen(end.connection.params)).toBe(true);
    expect(Object.isFrozen(end.connection.params['url'])).toBe(true);
  });

  test('name is optional — an unnamed end falls back to its type', () => {
    const end = dependency({
      type: 'fake/http',
      connection: conn({}, () => ({})),
    });

    expect(end.name).toBe('fake/http');
  });

  test('carries the required contract when given — the value Load checks satisfies() against', () => {
    const required = dbContract();
    const end = dependency({
      type: 'fake/db',
      connection: conn({ url: { type: 'string' } }, (v) => ({ url: v.url })),
      required,
    });

    expect(end.required).toBe(required);
  });

  test("hydrate is the app's factory — called only when invoked", () => {
    let calls = 0;
    const end = dependency({
      type: 'fake/db',
      connection: conn({ url: { type: 'string' } }, (v) => {
        calls += 1;
        return { url: v.url };
      }),
    });

    expect(calls).toBe(0);
    expect(end.connection.hydrate({ url: 'postgres://x' })).toEqual({ url: 'postgres://x' });
    expect(calls).toBe(1);
  });

  test('throws on an empty type', () => {
    expect(() => dependency({ type: '', connection: conn({}, () => ({})) })).toThrow(
      /non-empty node type/,
    );
  });

  test('rejects an underscore in a param name (would collide with the config-key separator)', () => {
    expect(() =>
      dependency({
        name: 'db',
        type: 'fake/db',
        connection: conn({ db_url: { type: 'string' } }, () => ({})),
      }),
    ).toThrow(/param name "db_url" may not contain "_"/);
  });

  test('declares no targetModule — loadTarget() is a guarded error naming the node', async () => {
    const end = dependency({ type: 'fake/db', connection: conn({}, () => ({})) });
    expect(end.targetModule).toBeUndefined();
    await expect(end.loadTarget()).rejects.toThrow(
      /"fake\/db" \(kind "dependency"\) declares no targetModule/,
    );
  });
});

describe('service()', () => {
  const build = {
    kind: 'node',
    assembler: '@prisma/app-node/assemble',
    module: 'file:///app/src/service.ts',
    entry: 'dist/server.js',
  };

  test('returns a branded, frozen service node with frozen name, pack, inputs, params, and build', () => {
    const db = dependency({
      name: 'db',
      type: 'fake/db',
      connection: conn({}, () => ({})),
    });
    const node = service({
      name: 'hello',
      pack: '@prisma/app-cloud',
      type: 'fake/app',
      inputs: { db },
      params: { port: { type: 'number', default: 3000 } },
      build,
    });

    expect(isNode(node)).toBe(true);
    expect(node.kind).toBe('service');
    expect(node.name).toBe('hello');
    expect(node.pack).toBe('@prisma/app-cloud');
    expect(node.type).toBe('fake/app');
    expect(node.inputs.db).toBe(db);
    expect(node.params).toEqual({ port: { type: 'number', default: 3000 } });
    expect(node.build).toEqual({
      kind: 'node',
      assembler: '@prisma/app-node/assemble',
      module: 'file:///app/src/service.ts',
      entry: 'dist/server.js',
    });
    expect(Object.isFrozen(node)).toBe(true);
    expect(Object.isFrozen(node.inputs)).toBe(true);
    expect(Object.isFrozen(node.params)).toBe(true);
    expect(Object.isFrozen(node.params.port)).toBe(true);
    expect(Object.isFrozen(node.build)).toBe(true);
  });

  test('carries no handler — the node is a pure description', () => {
    const node = service({
      name: 'hello',
      pack: 'test/pack',
      type: 'fake/app',
      inputs: {
        db: dependency({
          name: 'db',
          type: 'fake/db',
          connection: conn({}, () => ({})),
        }),
      },
      params: { port: { type: 'number', default: 3000 } },
      build,
    });

    expect('invoke' in node).toBe(false);
    expect(node.build.kind).toBe('node');
  });

  test('throws on an empty type', () => {
    expect(() =>
      service({
        name: 'hello',
        pack: 'test/pack',
        type: '',
        inputs: {},
        params: {},
        build,
      }),
    ).toThrow(/non-empty node type/);
  });

  test('throws on an empty name', () => {
    expect(() =>
      service({
        name: '',
        pack: 'test/pack',
        type: 'fake/app',
        inputs: {},
        params: {},
        build,
      }),
    ).toThrow(/non-empty name/);
  });

  test('rejects an underscore in an input name', () => {
    const db = dependency({
      name: 'db',
      type: 'fake/db',
      connection: conn({}, () => ({})),
    });
    expect(() =>
      service({
        name: 'hello',
        pack: 'test/pack',
        type: 'fake/app',
        inputs: { my_db: db },
        params: {},
        build,
      }),
    ).toThrow(/input name "my_db" may not contain "_"/);
  });

  test('rejects an underscore in a service param name', () => {
    expect(() =>
      service({
        name: 'hello',
        pack: 'test/pack',
        type: 'fake/app',
        inputs: {},
        params: { max_conns: { type: 'number', default: 1 } },
        build,
      }),
    ).toThrow(/param name "max_conns" may not contain "_"/);
  });

  test('expose is absent by default', () => {
    const node = service({
      name: 'hello',
      pack: 'test/pack',
      type: 'fake/app',
      inputs: {},
      params: {},
      build,
    });

    expect(node.expose).toBeUndefined();
  });

  test('carries a frozen expose map of named output-port Contracts when declared', () => {
    const authContract = fakeContract({ verify: async () => ({ ok: true }) });
    const node = service({
      name: 'hello',
      pack: 'test/pack',
      type: 'fake/app',
      inputs: {},
      params: {},
      build,
      expose: { rpc: authContract },
    });

    expect(node.expose).toEqual({ rpc: authContract });
    expect(node.expose?.rpc).toBe(authContract);
    expect(Object.isFrozen(node.expose)).toBe(true);
  });

  test('targetModule is absent by default, and set when given', () => {
    const bare = service({
      name: 'hello',
      pack: 'test/pack',
      type: 'fake/app',
      inputs: {},
      params: {},
      build,
    });
    expect(bare.targetModule).toBeUndefined();

    const withTarget = service({
      name: 'hello',
      pack: 'test/pack',
      type: 'fake/app',
      inputs: {},
      params: {},
      build,
      targetModule: '@prisma/app-cloud/target',
    });
    expect(withTarget.targetModule).toBe('@prisma/app-cloud/target');
  });
});

describe('Node.loadTarget() — node-owned target loading', () => {
  test('imports a real module at targetModule and returns its namespace', async () => {
    const specifier = dataModule("export function fromEnv() { return 'ok'; }");
    const node = service({
      name: 'hello',
      pack: 'test/pack',
      type: 'fake/app',
      inputs: {},
      params: {},
      build: {
        kind: 'node',
        assembler: '@prisma/app-node/assemble',
        module: 'file:///app/src/service.ts',
        entry: 'dist/server.js',
      },
      targetModule: specifier,
    });

    const mod = await node.loadTarget();
    expect(
      typeof mod === 'object' &&
        mod !== null &&
        'fromEnv' in mod &&
        typeof mod.fromEnv === 'function'
        ? mod.fromEnv()
        : undefined,
    ).toBe('ok');
  });

  test('a failed resolution is wrapped naming the specifier and the fix, not a bare stack trace', async () => {
    const node = resource({
      name: 'db',
      pack: 'test/pack',
      provides: dbContract(),
      targetModule: '@prisma/does-not-exist-xyz/target',
    });

    await expect(node.loadTarget()).rejects.toThrow(
      /Cannot resolve the target module "@prisma\/does-not-exist-xyz\/target".*must depend on the package/s,
    );
  });

  test('a hex declares no targetModule — loadTarget() is a guarded error', async () => {
    const node = hex('shop', {}, () => ({}));
    await expect(node.loadTarget()).rejects.toThrow(
      /"shop" \(kind "hex"\) declares no targetModule/,
    );
  });
});

describe('ServiceNode.loadAssembler()/assemble() — node-owned build-adapter loading', () => {
  const makeService = (assembler: string) =>
    service({
      name: 'hello',
      pack: 'test/pack',
      type: 'fake/app',
      inputs: {},
      params: {},
      build: {
        kind: 'node',
        assembler,
        module: 'file:///app/src/service.ts',
        entry: 'dist/server.js',
      },
    });

  test('loadAssembler() imports build.assembler and returns its namespace', async () => {
    const specifier = dataModule("export function assemble() { return 'unused'; }");
    const mod = await makeService(specifier).loadAssembler();
    expect(
      typeof mod === 'object' &&
        mod !== null &&
        'assemble' in mod &&
        typeof mod.assemble === 'function'
        ? mod.assemble()
        : undefined,
    ).toBe('unused');
  });

  test('assemble() loads the assembler, calls it with { build, ...opts }, and returns its Bundle', async () => {
    const specifier = dataModule(
      'export async function assemble(input) { ' +
        "return { dir: '/bundles/' + input.build.kind, entry: input.wrapperNoExternal ? 'inlined.js' : 'server.js' }; " +
        '}',
    );
    const node = makeService(specifier);

    const bundle = await node.assemble({ wrapperNoExternal: [/^@storefront-auth\//] });

    expect(bundle).toEqual({ dir: '/bundles/node', entry: 'inlined.js' });
  });

  test('assemble() throws naming the specifier when the module has no assemble() export', async () => {
    const specifier = dataModule('export const notAssemble = 1;');
    await expect(makeService(specifier).assemble()).rejects.toThrow(
      new RegExp(
        `"${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" has no assemble\\(\\) export`,
      ),
    );
  });

  test('a failed assembler resolution is wrapped naming the specifier and the fix', async () => {
    const node = makeService('@prisma/does-not-exist-xyz/assemble');
    await expect(node.assemble()).rejects.toThrow(
      /Cannot resolve the build assembler "@prisma\/does-not-exist-xyz\/assemble".*must depend on the package/s,
    );
  });
});

describe('hex()', () => {
  test('construction is INERT — the body runs only at Load', () => {
    let bodyCalls = 0;
    const node = hex('shop', {}, () => {
      bodyCalls += 1;
      return {};
    });

    expect(bodyCalls).toBe(0);
    expect(isNode(node)).toBe(true);
    expect(node.kind).toBe('hex');
    expect(node.name).toBe('shop');
    expect(Object.isFrozen(node)).toBe(true);
  });

  test('throws on an empty name', () => {
    expect(() => hex('', {}, () => ({}))).toThrow(/non-empty name/);
  });
});
