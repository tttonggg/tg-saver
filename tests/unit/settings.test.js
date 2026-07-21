import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, applyChanges } from '../../src/settings/store.js';

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    async get(keys) {
      const out = {};
      for (const k of Object.keys(keys)) out[k] = store[k] ?? keys[k];
      return out;
    },
    async set(obj) { Object.assign(store, obj); },
    _store: store,
  };
}

test('loadSettings returns defaults for missing keys', async () => {
  const s = await loadSettings(fakeStorage());
  assert.equal(s.silentMode, false);
  assert.equal(s.streamEnabled, true);
  assert.equal(s.includeStickers, false);
  assert.equal(s.debug, false);
});

test('applyChanges returns new settings with overrides merged', () => {
  const base = { silentMode: false, streamEnabled: true, includeStickers: false, debug: false };
  const next = applyChanges(base, { debug: { newValue: true } });
  assert.equal(next.debug, true);
  assert.equal(next.silentMode, false); // untouched
});
