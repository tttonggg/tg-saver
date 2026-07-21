import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlatform } from '../../src/platforms/index.js';

test('getPlatform returns the matching module', () => {
  assert.equal(getPlatform('weba').name, 'weba');
  assert.equal(getPlatform('webk').name, 'webk');
});

test('getPlatform throws for unknown', () => {
  assert.throws(() => getPlatform('nope'), /unknown platform/);
});
