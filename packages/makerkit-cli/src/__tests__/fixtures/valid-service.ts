import { service } from '@makerkit/core';

export default service({
  name: 'fixture-service',
  pack: 'test/pack',
  type: 'fixture/service',
  url: import.meta.url,
  inputs: {},
  params: {},
  build: { kind: 'node', entry: 'server.js' },
});
