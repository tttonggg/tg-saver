import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

import webk from '../../src/platforms/webk.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, '../fixtures/webk-message.html'), 'utf8');

test('webk.iterMedia yields media children', () => {
  const dom = new JSDOM(fixture);
  const messageEl = dom.window.document.querySelector('.bubble');
  const items = Array.from(webk.iterMedia(messageEl));
  assert.equal(items.length, 1);
  assert.equal(items[0].dataset.documentId, 'abc');
});

test('webk.extractUrl pulls video src', () => {
  const dom = new JSDOM(fixture);
  const media = dom.window.document.querySelector('.bubble-video');
  const result = webk.extractUrl(media);
  assert.ok(result.url.startsWith('https://web.telegram.org/stream/'));
  assert.equal(result.type, 'video');
});
