// src/downloader/filename.js
// Telegram-native naming. Mirrors what Telegram Web's own Save As produces.

// eslint-disable-next-line no-control-regex -- control chars are legitimately illegal in filenames
const ILLEGAL_RE = /[<>:"/\\|?*\x00-\x1f]/g;
const TRAILING_RE = /[.\s]+$/;
// Windows reserved device names (case-insensitive), with or without extension.
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

function pad2(n) { return String(n).padStart(2, '0'); }

function timestampStamp(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}`;
}

function sanitize(name) {
  let cleaned = name.replace(ILLEGAL_RE, '_').replace(/\s+/g, ' ').trim();
  // Strip trailing dots/spaces — Windows ignores them, causing silent collisions.
  cleaned = cleaned.replace(TRAILING_RE, '');
  // Prefix reserved Windows device names so they save correctly cross-platform.
  if (WIN_RESERVED.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned || 'download';
}

/**
 * @param {Object} args
 * @param {{ type?: string, messageId?: string, timestamp?: Date, fileName?: string, ext?: string }} args.item
 * @returns {string}
 */
export function buildFilename({ item }) {
  if (item.fileName) return sanitize(item.fileName);

  const ext = item.ext || defaultExtForType(item.type);

  if (item.type === 'image') {
    return `photo_${timestampStamp(item.timestamp)}.${ext}`;
  }
  if (item.type === 'video' || item.type === 'gif') {
    return `${item.messageId || 'media'}_video.${ext}`;
  }
  // Voice/audio/documents: messageId + ext.
  return `${item.messageId || 'media'}.${ext}`;
}

function defaultExtForType(type) {
  switch (type) {
    case 'image': return 'jpg';
    case 'video': return 'mp4';
    case 'gif': return 'mp4';
    case 'audio':
    case 'voice': return 'ogg';
    default: return 'bin';
  }
}
