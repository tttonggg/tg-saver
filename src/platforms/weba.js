// src/platforms/weba.js
// Selectors for web.telegram.org/a/.
// Updated 2026-07-21 against live Telegram Web markup. Key changes from the
// legacy reference selectors:
//   - Message bubble is now `.Message.message-list-item` with `data-message-id`
//     (was `.message` with `data-msg-id`).
//   - Time lives in `span.message-time` inside `span.MessageMeta` inside the
//     message content (was `.MessageFooter`).
//   - Scroll root is `.MessageList` (was `.messages-container`, which still
//     exists as an intermediate wrapper).
//   - Media uses `.media-inner` / `.media-photo` / `.media-container` /
//     `.media-preview--image`. The reference's `.message-media` is gone.
// Stale selectors are kept as fallbacks in case Telegram rolls back.

/** @type {import('./contract.js').Platform} */
export default {
  name: 'weba',

  selectors: {
    // Where the download button gets injected — the message-time meta row.
    messageFooter: ['.MessageMeta', '.message-footer', '.MessageFooter'],
    // The message bubble root.
    messageBubble: ['.Message.message-list-item', '[data-message-id]', '.message', '[data-msg-id]'],
    messageContentWrapper: ['.message-content-wrapper'],
    // Media elements inside a message.
    mediaChild: [
      '.media-inner img',
      '.media-inner video',
      '.media-photo',
      '.media-video',
      '.media-container img',
      '.media-container video',
      '.media-preview--image',
      'img[data-photo-id]',
      'video[data-document-id]',
    ],
    // Album grouping.
    albumGroup: ['.album-items', '.album', '.media-group'],
    albumThumb: ['.album-items img', '.album img', '.album-items .media-inner img'],
    // Chat scroll root (MutationObserver target).
    scrollRoot: ['.MessageList', '.messages-container', '.chat-container'],
    // Story + media viewer overlays.
    storyViewer: ['.StoryViewer', '.story-viewer'],
    mediaViewer: ['.MediaViewer', '.media-viewer'],
    // Decorative — to be filtered out by the classifier.
    avatar: ['.Avatar', '.avatar-media', '.avatar', '.Avatar__media'],
    emoji: ['.emoji', '.emoji-small'],
    sticker: ['.AnimatedSticker', '.sticker-media', '.sticker'],
    iconSprite: ['.icon', '.button-icon'],
  },

  isAlbum(messageEl) {
    return !!messageEl.querySelector('.album-items, .album, .media-group');
  },

  iterMedia(messageEl) {
    // Exclude avatars/emoji/stickers via :not() so we only get real media candidates.
    // The classifier still re-checks each result.
    const sel = [
      '.media-inner img',
      '.media-inner video',
      '.media-photo',
      '.media-video',
      '.media-container img',
      '.media-container video',
      '.media-preview--image',
      'img[data-photo-id]',
      'video[data-document-id]',
    ].join(', ');
    return Array.from(messageEl.querySelectorAll(sel));
  },

  extractUrl(mediaNode) {
    const url = mediaNode.src || mediaNode.getAttribute('src') || '';
    if (!url) return null;
    const tag = mediaNode.tagName.toLowerCase();
    const type = tag === 'video' ? 'video' : tag === 'img' ? 'image' : 'other';
    return { url, type, mime: mediaNode.type };
  },

  nativeViewerOpen(messageEl, mediaNode) {
    mediaNode?.click();
  },
};
