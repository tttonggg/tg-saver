// src/downloader/index.js
// Picks between stream and blob based on file size + user settings + API availability.

import { resolveUrl } from './resolveUrl.js';
import { streamToDisk, isStreamSupported } from './streamDownload.js';
import { blobToDisk } from './blobDownload.js';
import { buildFilename } from './filename.js';
import { log } from '../utils/logger.js';

const STREAM_THRESHOLD = 100 * 1024 * 1024; // 100 MB

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

  if (useStream) {
    try {
      await streamToDisk({
        url: resolved.url,
        filename,
        size: resolved.size,
        contentType: resolved.contentType,
        onProgress,
        signal,
      });
      return;
    } catch (err) {
      if (err.message === 'aborted') throw err;
      // Permission denied or API glitch → fall through to blob.
      log.warn('stream failed, falling back to blob:', err.message);
    }
  }

  await blobToDisk({
    url: resolved.url,
    filename,
    size: resolved.size,
    contentType: resolved.contentType,
    onProgress,
    signal,
  });
}

function extFromType(contentType) {
  const sub = (contentType || '').split('/')[1] || 'bin';
  return sub.split('+')[0];
}
