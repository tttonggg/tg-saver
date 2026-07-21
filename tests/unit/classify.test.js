import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

import weba from '../../src/platforms/weba.js';
import webk from '../../src/platforms/webk.js';
import { classifyMediaNode } from '../../src/scanner/classify.js';

const here = dirname(fileURLToPath(import.meta.url));
const webaHtml = readFileSync(join(here, '../fixtures/weba-album.html'), 'utf8');
const webkHtml = readFileSync(join(here, '../fixtures/webk-album.html'), 'utf8');

function allImgs(dom) { return Array.from(dom.window.document.querySelectorAll('img')); }

test('classify filters avatars, emoji, thumbnails; passes sticker by setting', () => {
  const dom = new JSDOM(webaHtml);
  const settings = { includeStickers: false };
  const tiers = allImgs(dom).map(img => classifyMediaNode(img, weba, settings));

  assert.equal(tiers.filter(t => t === 'PROFILE_PIC').length, 1);
  assert.equal(tiers.filter(t => t === 'EMOJI').length, 1);
  assert.equal(tiers.filter(t => t === 'THUMBNAIL').length, 3);
  assert.equal(tiers.filter(t => t === 'STICKER').length, 1);
  assert.equal(tiers.filter(t => t === 'REAL').length, 0);
});

test('includeStickers=true promotes stickers to REAL', () => {
  const dom = new JSDOM(webaHtml);
  const settings = { includeStickers: true };
  const tiers = allImgs(dom).map(img => classifyMediaNode(img, weba, settings));
  assert.equal(tiers.filter(t => t === 'REAL').length, 1);
  assert.equal(tiers.filter(t => t === 'STICKER').length, 0);
});

test('webk avatar and thumbs are classified correctly', () => {
  const dom = new JSDOM(webkHtml);
  const settings = { includeStickers: false };
  const tiers = allImgs(dom).map(img => classifyMediaNode(img, webk, settings));
  assert.equal(tiers.filter(t => t === 'PROFILE_PIC').length, 1);
  assert.equal(tiers.filter(t => t === 'THUMBNAIL').length, 2);
});

test('zero-rect nodes are NOT misclassified as UI_CHROME (regression for jsdom/display:none)', () => {
  // jsdom returns 0×0 rects for everything; production has the same issue for
  // nodes briefly display:none during render. A node that looks like media
  // (no ancestor matchers, no data-id) should fall through to REAL, not UI_CHROME.
  const dom = new JSDOM('<!doctype html><html><body><img src="x.jpg" id="t"></body></html>');
  const img = dom.window.document.getElementById('t');
  // No selectors match (using weba selectors), no data-id, zero rect → must be REAL.
  const tier = classifyMediaNode(img, weba, { includeStickers: false });
  assert.equal(tier, 'REAL');
});
