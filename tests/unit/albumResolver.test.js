import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

import weba from '../../src/platforms/weba.js';
import { groupIntoAlbum } from '../../src/scanner/albumResolver.js';
import { buildMediaItem } from '../../src/scanner/mediaItem.js';

const here = dirname(fileURLToPath(import.meta.url));
const webaAlbum = readFileSync(join(here, '../fixtures/weba-album.html'), 'utf8');

test('album message groups thumbs into an Album (full-res comes later)', () => {
  const dom = new JSDOM(webaAlbum);
  const messageEl = dom.window.document.querySelector('.Message');
  // Pretend all 3 album thumbs are REAL for grouping purposes.
  const thumbs = Array.from(messageEl.querySelectorAll('.media-preview--image'));
  const items = thumbs.map(t => buildMediaItem(t, messageEl, weba)).filter(Boolean);
  const result = groupIntoAlbum(items, messageEl, weba);
  assert.equal(result.kind, 'album');
  assert.equal(result.items.length, 3);
});

test('single item is not an album', () => {
  const dom = new JSDOM(webaAlbum);
  const messageEl = dom.window.document.querySelector('.Message');
  const one = messageEl.querySelector('.media-preview--image');
  const items = [buildMediaItem(one, messageEl, weba)].filter(Boolean);
  const result = groupIntoAlbum(items, messageEl, weba);
  assert.equal(result.kind, 'single');
});
