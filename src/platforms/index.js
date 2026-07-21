import weba from './weba.js';
import webk from './webk.js';

const REGISTRY = { weba, webk };

/**
 * @param {'weba'|'webk'} name
 * @returns {import('./contract.js').Platform}
 */
export function getPlatform(name) {
  const mod = REGISTRY[name];
  if (!mod) throw new Error(`unknown platform: ${name}`);
  return mod;
}
