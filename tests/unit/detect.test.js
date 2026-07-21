import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform } from '../../src/platforms/detect.js';

function fakeLocation(pathname) {
  return { pathname, href: `https://web.telegram.org${pathname}` };
}

test('detectPlatform returns weba for /a paths', () => {
  assert.equal(detectPlatform(fakeLocation('/a/')), 'weba');
  assert.equal(detectPlatform(fakeLocation('/a/#123')), 'weba');
});

test('detectPlatform returns webk for /k paths', () => {
  assert.equal(detectPlatform(fakeLocation('/k/')), 'webk');
  assert.equal(detectPlatform(fakeLocation('/k/?p=u123')), 'webk');
});

test('detectPlatform returns null for unsupported paths', () => {
  assert.equal(detectPlatform(fakeLocation('/')), null);
  assert.equal(detectPlatform(fakeLocation('/foo')), null);
});
