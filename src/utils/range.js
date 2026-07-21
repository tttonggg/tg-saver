// src/utils/range.js
// Parsing for HTTP Range / Content-Range headers. Mirrors the reference's
// /^bytes (\d+)-(\d+)\/(\d+)$/ pattern.

const CONTENT_RANGE_RE = /^bytes (\d+)-(\d+)\/(\d+)$/;

/** Parse a Content-Range header. Returns null if malformed. */
export function parseContentRange(header) {
  if (!header) return null;
  const m = String(header).match(CONTENT_RANGE_RE);
  if (!m) return null;
  return { start: +m[1], end: +m[2], total: +m[3] };
}

/** Return only the total from a Content-Range, or null if malformed. */
export function parseContentRangeTotal(header) {
  const parsed = parseContentRange(header);
  return parsed ? parsed.total : null;
}

/** Format a Range request header. If `end` omitted, requests an open-ended range. */
export function formatRangeHeader(start, end) {
  return end === undefined ? `bytes=${start}-` : `bytes=${start}-${end}`;
}
