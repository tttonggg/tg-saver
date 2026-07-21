// DOM helpers used across scanner, UI, and downloader.
// All functions are safe to call with null/undefined input (return null/empty).

/** Returns a debounced version of fn. Leading edge = false, trailing = true. */
export function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Resolves when selector matches an element under root, or timeout ms elapses. */
export function waitFor(root, selector, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const existing = root.querySelector(selector);
    if (existing) return resolve(existing);
    const observer = new MutationObserver(() => {
      const found = root.querySelector(selector);
      if (found) { observer.disconnect(); resolve(found); }
    });
    observer.observe(root, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
  });
}

/** Closest ancestor (or self) matching any selector in the array. Returns null if none match. */
export function closestMatching(node, selectors) {
  let el = node;
  while (el && el.nodeType === 1) {
    for (const sel of selectors) {
      if (el.matches?.(sel)) return el;
    }
    el = el.parentElement;
  }
  return null;
}

/** querySelectorAll that tolerates a multi-selector array (tries each until one matches). */
export function safeQueryAll(root, selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const found = root.querySelectorAll(sel);
    if (found.length) return Array.from(found);
  }
  return [];
}

/** First element matching any selector in the array, or null. */
export function pickFirst(root, selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}
