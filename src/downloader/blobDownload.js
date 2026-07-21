// src/downloader/blobDownload.js
// Fallback path for small files (<100 MB) or when File System Access is unavailable.
// Mirrors the reference's Range fetch → Blob concatenation → <a download>.

import { formatRangeHeader, parseContentRange } from '../utils/range.js';
import { log } from '../utils/logger.js';

const SEGMENT_PARALLEL = 20;

/**
 * @param {Object} args
 * @param {string} args.url
 * @param {string} args.filename
 * @param {number} args.size
 * @param {string} [args.contentType]
 * @param {(percent: number) => void} [args.onProgress]
 * @param {AbortSignal} [args.signal]
 */
export async function blobToDisk({ url, filename, size: _size, contentType, onProgress, signal }) {
  const resp = await fetch(url, { headers: { Range: formatRangeHeader(0) }, signal });
  if (![200, 206].includes(resp.status)) throw new Error(`blobToDisk: HTTP ${resp.status}`);

  const contentRange = resp.headers.get('content-range');
  if (!contentRange) throw new Error('blobToDisk: no Content-Range');
  const parsed = parseContentRange(contentRange);
  if (!parsed) throw new Error('blobToDisk: malformed Content-Range');

  const total = parsed.total;
  const segmentSize = Number(resp.headers.get('content-length')) || 1;

  // Build a list of Range requests covering the whole file.
  const ranges = [];
  for (let start = 0; start < total; start += segmentSize) {
    const end = Math.min(start + segmentSize - 1, total - 1);
    ranges.push({ start, end });
  }

  const buffers = new Array(ranges.length);
  let done = 0;

  // Run SEGMENT_PARALLEL at a time.
  for (let i = 0; i < ranges.length; i += SEGMENT_PARALLEL) {
    if (signal?.aborted) throw new Error('aborted');
    const batch = ranges.slice(i, i + SEGMENT_PARALLEL);
    const results = await Promise.all(batch.map(async (r, j) => {
      const segResp = await fetch(url, { headers: { Range: formatRangeHeader(r.start, r.end) }, signal });
      if (segResp.status !== 206) throw new Error(`segment HTTP ${segResp.status}`);
      const buf = await segResp.arrayBuffer();
      const idx = i + j;
      buffers[idx] = buf;
      done += buf.byteLength;
      onProgress?.(Math.round((done / total) * 100));
      return buf;
    }));
    log.info(`batch complete: ${results.length} segments, ${done}/${total} bytes`);
  }

  const blob = new Blob(buffers, { type: contentType || 'application/octet-stream' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
