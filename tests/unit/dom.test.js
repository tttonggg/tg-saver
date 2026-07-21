import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debounce, closestMatching } from '../../src/utils/dom.js';

test('debounce fires once for rapid calls', async () => {
  let calls = 0;
  const fn = debounce(() => { calls++; }, 10);
  fn(); fn(); fn();
  await new Promise(r => setTimeout(r, 30));
  assert.equal(calls, 1);
});

test('closestMatching returns nearest matching ancestor', () => {
  const leaf = { nodeType: 1, matches: (s) => s === '.thumb', parentElement: null };
  assert.equal(closestMatching(leaf, ['.thumb', '.avatar']), leaf);

  const parent = { nodeType: 1, matches: (s) => s === '.avatar', parentElement: null };
  const child = { nodeType: 1, matches: () => false, parentElement: parent };
  assert.equal(closestMatching(child, ['.thumb', '.avatar']), parent);
});
