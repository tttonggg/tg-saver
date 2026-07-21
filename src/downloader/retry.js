// src/downloader/retry.js
// CDN-aware fetch with retry on 5xx and network errors.
// Ported from the working tgdwn userscript — Telegram's CDN throws 500s
// regularly and you MUST retry or downloads fail at random offsets.

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

/**
 * Fetch with retry logic for CDN errors.
 * @param {string} url
 * @param {Object} [init]
 * @param {number} [maxRetries]
 * @returns {Promise<Response|null>} null if all retries exhausted on non-retryable error
 */
export async function fetchWithRetry(url, init = {}, maxRetries = MAX_RETRIES) {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const res = await fetch(url, init);
      if ([200, 206].includes(res.status)) return res;
      // 5xx is retryable (CDN flap); 4xx is not.
      if (res.status >= 500 && i < maxRetries) {
        console.warn(`[tg-saver] CDN ${res.status}, retry ${i + 1}/${maxRetries} in ${BASE_DELAY_MS * (i + 1) / 1000}s...`);
        await sleep(BASE_DELAY_MS * (i + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i >= maxRetries) throw err;
      console.warn(`[tg-saver] Fetch error: ${err.message}, retry ${i + 1}/${maxRetries}...`);
      await sleep(BASE_DELAY_MS * (i + 1));
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
