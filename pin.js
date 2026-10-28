// PIN nur auf diesem Gerät: gespeichert als PBKDF2-Hash mit Salt, nie im Klartext.
// Sie schützt vor neugierigen Blicken, ersetzt aber kein Passwort.

const ITER = 150000;
const k = (uid) => 'ftb-pin-' + uid;
const kf = (uid) => 'ftb-pin-fails-' + uid;
export const MAX_FAILS = 5;

const ls = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* privates Fenster */ } },
  del(key) { try { localStorage.removeItem(key); } catch (e) { /* egal */ } },
};
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256);
}

export function hasPin(uid) {
  return !!ls.get(k(uid));
}

export async function setPin(uid, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITER);
  ls.set(k(uid), JSON.stringify({ v: 1, iter: ITER, salt: toB64(salt), hash: toB64(hash) }));
  ls.del(kf(uid));
}

// Liefert true bei richtiger PIN. Zählt Fehlversuche mit.
export async function verifyPin(uid, pin) {
  let rec;
  try { rec = JSON.parse(ls.get(k(uid)) || 'null'); } catch (e) { rec = null; }
  if (!rec) return false;
  const hash = toB64(await derive(pin, fromB64(rec.salt), rec.iter));
  if (hash === rec.hash) { ls.del(kf(uid)); return true; }
  ls.set(kf(uid), String(fails(uid) + 1));
  return false;
}

export function fails(uid) {
  return parseInt(ls.get(kf(uid)) || '0', 10) || 0;
}

export function clearPin(uid) {
  ls.del(k(uid));
  ls.del(kf(uid));
}
