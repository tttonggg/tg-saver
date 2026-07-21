import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

import weba from '../../src/platforms/weba.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, '../fixtures/weba-message.html'), 'utf8');

test('weba.iterMedia yields media children', () => {
  const dom = new JSDOM(fixture);
  const messageEl = dom.window.document.querySelector('.Message');
  const items = Array.from(weba.iterMedia(messageEl));
  assert.equal(items.length, 1);
  assert.equal(items[0].dataset.photoId, '123');
});

test('weba.extractUrl pulls the src', () => {
  const dom = new JSDOM(fixture);
  const media = dom.window.document.querySelector('.media-photo');
  const result = weba.extractUrl(media);
  assert.equal(result.url, 'blob:https://web.telegram.org/photo-123');
  assert.equal(result.type, 'image');
});
