// src/downloader/streamDownload.js
// Preferred path for large files. Uses the File System Access API to stream
// bytes straight to disk without holding the whole file in memory.
// Accepts the resolved descriptor from resolveUrl() so we don't double-probe.

import { formatRangeHeader } from '../utils/range.js';
import { log } from '../utils/logger.js';

const SEGMENT_PARALLEL = 20;

/**
 * @param {Object} args
 * @param {string} args.url
 * @param {string} args.filename
 * @param {number} args.size
 * @param {number} [args.segmentSize]     // from resolveUrl
 * @param {boolean} [args.rangeSupported]  // from resolveUrl
 * @param {string} [args.contentType]
 * @param {(percent: number) => void} [args.onProgress]
 * @param {AbortSignal} [args.signal]
 */
export async function streamToDisk({ url, filename, size, segmentSize, rangeSupported, contentType, onProgress, signal }) {
  if (!('showSaveFilePicker' in window)) {
    throw new Error('File System Access API unavailable');
  }

  const total = size;
  const ext = (contentType?.split('/')[1] || 'bin').split('+')[0];

  // File picker requires a user gesture — caller must invoke from a click handler.
  const handle = await window.showSaveFilePicker({
    suggestedName: filename,
    types: [{
      description: 'Media file',
      accept: { [contentType || 'application/octet-stream']: [`.${ext}`] },
    }],
  });
  const writable = await handle.createWritable();

  let done = 0;
  try {
    if (!rangeSupported) {
      // Single whole-body fetch (blob: or non-range server).
      if (signal?.aborted) throw new Error('aborted');
      const resp = await fetch(url, { signal });
      if (!resp.ok) throw new Error(`streamToDisk: HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        await writable.write({ type: 'write', data: value });
        done += value.byteLength;
        onProgress?.(total ? Math.round((done / total) * 100) : 100);
      }
      return;
    }

    if (!segmentSize || segmentSize < 1) {
      throw new Error('streamToDisk: missing segment size');
    }

    for (let start = 0; start < total; start += segmentSize * SEGMENT_PARALLEL) {
      if (signal?.aborted) throw new Error('aborted');
      const batch = [];
      for (let j = 0; j < SEGMENT_PARALLEL; j++) {
        const segStart = start + j * segmentSize;
        if (segStart >= total) break;
        const segEnd = Math.min(segStart + segmentSize - 1, total - 1);
        batch.push({ segStart, segEnd });
      }
      const results = await Promise.all(batch.map(async ({ segStart, segEnd }) => {
        const r = await fetch(url, { headers: { Range: formatRangeHeader(segStart, segEnd) }, signal });
        if (r.status !== 206) throw new Error(`segment HTTP ${r.status}`);
        return r.arrayBuffer();
      }));
      for (const buf of results) {
        await writable.write({ type: 'write', data: buf });
        done += buf.byteLength;
        onProgress?.(Math.round((done / total) * 100));
      }
      log.info(`streamed ${done}/${total} bytes`);
    }
  } finally {
    await writable.close();
  }
}

export function isStreamSupported() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}
