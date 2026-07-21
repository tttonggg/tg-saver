// src/scanner/mediaItem.js
// Normalizes a DOM media node into a plain MediaItem record.

let _seq = 0;

/**
 * @param {Element} node
 * @param {Element} messageEl
 * @param {import('../platforms/contract.js').Platform} platform
 */
export function buildMediaItem(node, messageEl, platform) {
  const extracted = platform.extractUrl(node);
  if (!extracted) return null;
  const msgId = messageEl?.dataset?.msgId || messageEl?.getAttribute('data-msg-id') || '';
  return {
    id: `mi_${++_seq}`,
    messageId: msgId,
    rawSrc: extracted.url,
    type: extracted.type,
    mime: extracted.mime,
    nodeRef: new WeakRef(node),
    messageRef: new WeakRef(messageEl),
  };
}
