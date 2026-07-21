// src/platforms/weba.js
// Selectors for web.telegram.org/a/. Based on the reference's
// `message-content-wrapper` + `MessageFooter` layout.

/** @type {import('./contract.js').Platform} */
export default {
  name: 'weba',

  selectors: {
    messageFooter: ['.MessageFooter', '.message-footer'],
    messageBubble: ['.message', '[data-msg-id]'],
    messageContentWrapper: ['.message-content-wrapper'],
    mediaChild: ['.message-media', 'img[data-photo-id]', 'video[data-document-id]'],
    albumGroup: ['.album', '.media-container'],
    albumThumb: ['.album .thumbnail', '.album img.thumb'],
    scrollRoot: ['.messages-container', '.chat-container'],
    storyViewer: ['.story-viewer', '.StoryViewer'],
    mediaViewer: ['.media-viewer', '.MediaViewer'],
    avatar: ['.avatar', '.profile-photo'],
    emoji: ['.emoji', '.emoji-small'],
    sticker: ['.sticker', '.sticker-media'],
    iconSprite: ['.icon', '.button-icon'],
  },

  isAlbum(messageEl) {
    return !!messageEl.querySelector('.album, .media-container.multi');
  },

  iterMedia(messageEl) {
    const nodes = messageEl.querySelectorAll('.message-media, img[data-photo-id], video[data-document-id]');
    return Array.from(nodes);
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
