import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isEphemeralCiProjectName, PROTECTED_PROJECT_NAMES } from './ci-cleanup-utils.ts';

const PREFIXES = ['storefront-auth', 'pn-widgets'];

describe('isEphemeralCiProjectName', () => {
  it('matches exactly <prefix>-ci-<digits> for each given prefix', () => {
    assert.equal(isEphemeralCiProjectName('storefront-auth-ci-12345', PREFIXES), true);
    assert.equal(isEphemeralCiProjectName('pn-widgets-ci-29186523608', PREFIXES), true);
  });

  it('rejects the standing (non-ci) app names', () => {
    assert.equal(isEphemeralCiProjectName('storefront-auth', PREFIXES), false);
    assert.equal(isEphemeralCiProjectName('pn-widgets', PREFIXES), false);
  });

  it('rejects near-misses: wrong prefix, missing run id, non-digit id, extra suffix', () => {
    assert.equal(isEphemeralCiProjectName('datahub-ci-123', PREFIXES), false);
    assert.equal(isEphemeralCiProjectName('pn-widgets-ci-', PREFIXES), false);
    assert.equal(isEphemeralCiProjectName('pn-widgets-ci-abc', PREFIXES), false);
    assert.equal(isEphemeralCiProjectName('pn-widgets-ci-123-extra', PREFIXES), false);
    assert.equal(isEphemeralCiProjectName('a-pn-widgets-ci-123', PREFIXES), false);
  });

  it('never matches the hosted deploy-state project, even with a hostile prefix', () => {
    assert.equal(isEphemeralCiProjectName('prisma-app-state', PREFIXES), false);
    // Even a prefix crafted so the pattern WOULD match is hard-denied.
    assert.equal(isEphemeralCiProjectName('prisma-app-state', ['prisma-app-state']), false);
    assert.ok(PROTECTED_PROJECT_NAMES.includes('prisma-app-state'));
  });

  it('treats prefixes literally — regex metacharacters cannot widen the match', () => {
    assert.equal(isEphemeralCiProjectName('pn-widgetsX-ci-1', ['pn-widgets.']), false);
    assert.equal(isEphemeralCiProjectName('anything-ci-1', ['.*']), false);
  });

  it('requires at least one prefix', () => {
    assert.throws(() => isEphemeralCiProjectName('pn-widgets-ci-1', []));
  });
});
