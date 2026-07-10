import { hex, service } from '@prisma/app';

const makeService = (name: string) =>
  service({
    name,
    pack: 'test/pack',
    type: 'fixture/service',
    inputs: {},
    params: {},
    build: { kind: 'node', pack: '@prisma/app-node', module: import.meta.url, entry: 'server.js' },
  });

export default hex('fixture-hex', (h) => {
  h.provision('one', makeService('one'));
  h.provision('two', makeService('two'));
});
