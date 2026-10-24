// localStorage wrapper. Every key is forced to start with "imp_" so this app
// never reads or writes data from the other apps on kasene08.github.io.

const PREFIX = 'imp_';

const full = (key) => (key.startsWith(PREFIX) ? key : PREFIX + key);

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
