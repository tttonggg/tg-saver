import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilename } from '../../src/downloader/filename.js';

const baseItem = { type: 'image', messageId: '42', timestamp: new Date('2026-07-21T21:04:00Z') };

test('uses fileName from stream metadata when present', () => {
  assert.equal(
    buildFilename({ item: { ...baseItem, fileName: 'report.pdf' } }),
    'report.pdf'
  );
});

test('photos get photo_YYYY-MM-DD_HH-MM.<ext>', () => {
  const ts = new Date('2026-07-21T21:04:00');
  const name = buildFilename({ item: { type: 'image', messageId: '42', timestamp: ts, ext: 'jpg' } });
  // Format is deterministic; the exact values depend on the host timezone,
  // so we assert the shape, not the date.
  assert.match(name, /^photo_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.jpg$/);
});

test('videos without metadata get <messageId>_video.mp4', () => {
  const name = buildFilename({ item: { type: 'video', messageId: '99', timestamp: new Date(0) } });
  assert.equal(name, '99_video.mp4');
});

test('strips filesystem-illegal characters', () => {
  const name = buildFilename({ item: { ...baseItem, fileName: 'bad/name?:*.txt' } });
  assert.equal(name, 'bad_name___.txt');
});

test('strips trailing dots/spaces (Windows collision guard)', () => {
  const name = buildFilename({ item: { ...baseItem, fileName: 'file.   ' } });
  assert.equal(name, 'file');
});

test('prefixes Windows-reserved device names', () => {
  assert.equal(buildFilename({ item: { ...baseItem, fileName: 'CON.mp4' } }), '_CON.mp4');
  assert.equal(buildFilename({ item: { ...baseItem, fileName: 'nul' } }), '_nul');
  assert.equal(buildFilename({ item: { ...baseItem, fileName: 'com1.txt' } }), '_com1.txt');
});
