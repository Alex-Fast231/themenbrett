// FaSt Themenbrett: Edge Function "notify"
// Wird von der Datenbank aufgerufen, wenn einer etwas Neues schreibt, und schickt an alle
// Geräte des anderen eine Benachrichtigung. Die Benachrichtigung hat keinen Inhalt; den festen
// Text zeigt der Service Worker der App an. Deshalb reicht ein leerer Web-Push mit VAPID,
// und es wird keine zusätzliche Bibliothek gebraucht.
//
// Benötigte Secrets (Edge Functions -> Secrets):
//   NOTIFY_SECRET      langes Passwort, gleich wie in supabase/push.sql
//   VAPID_PUBLIC_KEY   aus schluessel.html
//   VAPID_PRIVATE_KEY  aus schluessel.html
//   VAPID_SUBJECT      optional, z. B. mailto:deine@adresse.de
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.

const env = (k: string) => Deno.env.get(k) ?? '';

const b64uToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const bytesToB64u = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const strToB64u = (s: string) => bytesToB64u(new TextEncoder().encode(s));

let signingKey: CryptoKey | null = null;
async function vapidKey(): Promise<CryptoKey> {
  if (signingKey) return signingKey;
  const pub = b64uToBytes(env('VAPID_PUBLIC_KEY'));
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY ist ungültig');
  signingKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: env('VAPID_PRIVATE_KEY'), x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return signingKey;
}

async function vapidJwt(audience: string): Promise<string> {
  const header = strToB64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = strToB64u(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env('VAPID_SUBJECT') || 'mailto:themenbrett@example.org',
  }));
  const data = new TextEncoder().encode(header + '.' + claims);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(), data));
  return header + '.' + claims + '.' + bytesToB64u(sig);
}

async function sendPush(endpoint: string): Promise<number> {
  const jwt = await vapidJwt(new URL(endpoint).origin);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'vapid t=' + jwt + ', k=' + env('VAPID_PUBLIC_KEY'),
      TTL: String(24 * 3600),
      Urgency: 'normal',
      'Content-Length': '0',
    },
  });
  await res.body?.cancel();
  return res.status;
}

function db(path: string, init: RequestInit = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  return fetch(env('SUPABASE_URL') + '/rest/v1/' + path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = env('NOTIFY_SECRET');
  if (!secret || req.headers.get('x-notify-secret') !== secret) return new Response('Forbidden', { status: 403 });

  let actor = '';
  try { actor = String((await req.json()).actor ?? ''); } catch { /* leer */ }
  if (!/^[0-9a-f-]{36}$/i.test(actor)) return new Response('Bad request', { status: 400 });

  // Alle Geräte des anderen Nutzers
  const r = await db('push_subscriptions?select=id,endpoint&user_id=neq.' + actor);
  if (!r.ok) return new Response('DB error ' + r.status, { status: 500 });
  const subs: { id: string; endpoint: string }[] = await r.json();

  const results = await Promise.all(subs.map(async (s) => {
    try {
      const status = await sendPush(s.endpoint);
      // Abgelaufene Abos aufräumen
      if (status === 404 || status === 410) await db('push_subscriptions?id=eq.' + s.id, { method: 'DELETE' });
      return status;
    } catch (e) {
      console.error('push failed', e);
      return 0;
    }
  }));

  return new Response(JSON.stringify({ sent: results.filter((s) => s >= 200 && s < 300).length, total: subs.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
