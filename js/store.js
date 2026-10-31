// localStorage wrapper. Every key is forced to start with "imp_" so this app
// never reads or writes data from the other apps on kasene08.github.io.
// The dev preview uses "imp_dev_" instead (see devmode.js).
import { toStore, seedDev } from './devmode.js';

seedDev(); // dev preview only: copy the real data in on first open

const full = (key) => toStore(key);

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(full(key));
    return raw == null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(full(key), JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('Improve: could not save', key, e);
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(full(key)); } catch (_) {}
}
