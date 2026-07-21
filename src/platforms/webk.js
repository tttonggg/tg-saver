// src/platforms/webk.js
// Selectors for web.telegram.org/k/. Based on the reference's
// `bubble-content-wrapper` + `.bubble-footer` layout.

/** @type {import('./contract.js').Platform} */
export default {
  name: 'webk',

  selectors: {
    messageFooter: ['.bubble-footer', '.MessageFooter'],
    messageBubble: ['.bubble', '[data-msg-id]'],
    messageContentWrapper: ['.bubble-content-wrapper'],
    mediaChild: ['.bubble-video', '.bubble-image', 'img[data-photo-id]', 'video[data-document-id]'],
    albumGroup: ['.album', '.bubbles-group'],
    albumThumb: ['.album .thumb'],
    scrollRoot: ['.bubbles-inner', '.chat'],
    storyViewer: ['.story-viewer'],
    mediaViewer: ['.media-viewer', '.viewer'],
    avatar: ['.avatar', '.dialog-avatar', '.user-avatar'],
    emoji: ['.emoji', '.reaction-emoji'],
    sticker: ['.sticker', '.bubble-sticker'],
    iconSprite: ['.icon', '.button-icon'],
  },

  isAlbum(messageEl) {
    return !!messageEl.querySelector('.album, .bubbles-group');
  },

  iterMedia(messageEl) {
    const nodes = messageEl.querySelectorAll('.bubble-video, .bubble-image, img[data-photo-id], video[data-document-id]');
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
