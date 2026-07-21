import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseContentRange, parseContentRangeTotal, formatRangeHeader } from '../../src/utils/range.js';

test('parseContentRange parses a byte range', () => {
  assert.deepEqual(parseContentRange('bytes 0-99/1000'), { start: 0, end: 99, total: 1000 });
});

test('parseContentRange returns null on garbage', () => {
  assert.equal(parseContentRange('not a range'), null);
});

test('parseContentRangeTotal parses only the total', () => {
  assert.equal(parseContentRangeTotal('bytes 0-99/12345'), 12345);
});

test('formatRangeHeader formats an open-ended range', () => {
  assert.equal(formatRangeHeader(100), 'bytes=100-');
});

test('formatRangeHeader formats a closed range', () => {
  assert.equal(formatRangeHeader(100, 199), 'bytes=100-199');
});
