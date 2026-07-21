// src/downloader/index.js
// Picks between stream and blob based on file size + user settings + API availability.
// Passes the full resolved descriptor through so writers don't re-probe.

import { resolveUrl } from './resolveUrl.js';
import { streamToDisk, isStreamSupported } from './streamDownload.js';
import { blobToDisk } from './blobDownload.js';
import { buildFilename } from './filename.js';
import { log } from '../utils/logger.js';

const STREAM_THRESHOLD = 100 * 1024 * 1024; // 100 MB

function extFromType(contentType) {
  const sub = (contentType || '').split('/')[1] || 'bin';
  return sub.split('+')[0];
}

/**
 * @param {Object} args
 * @param {string} args.rawSrc
 * @param {Object} args.item
 * @param {boolean} args.streamEnabled  // from settings
 * @param {(percent: number) => void} [args.onProgress]
 * @param {AbortSignal} [args.signal]
 */
export async function download({ rawSrc, item, streamEnabled, onProgress, signal }) {
  const resolved = await resolveUrl(rawSrc);
  const filename = buildFilename({ item: { ...item, fileName: resolved.suggestedName, ext: extFromType(resolved.contentType) } });

  const useStream = streamEnabled && isStreamSupported() && resolved.size > STREAM_THRESHOLD;
  log.info(`download: ${filename} (${resolved.size} bytes) via ${useStream ? 'stream' : 'blob'}`);

  const passthrough = {
    url: resolved.url,
    filename,
    size: resolved.size,
    segmentSize: resolved.segmentSize,
    rangeSupported: resolved.rangeSupported,
    contentType: resolved.contentType,
    onProgress,
    signal,
  };

  if (useStream) {
    try {
      await streamToDisk(passthrough);
      return;
    } catch (err) {
      if (err.message === 'aborted') throw err;
      // Permission denied or API glitch → fall through to blob.
      log.warn('stream failed, falling back to blob:', err.message);
    }
  }

  await blobToDisk(passthrough);
}
