// FaSt Themenbrett: Einstellungen
// Diese drei Werte sind öffentlich gedacht. Geschützt werden die Daten über die
// Zugriffsregeln (Row Level Security) in Supabase.
// Solange SUPABASE_URL leer ist, läuft die App im Demo-Modus: Die Daten bleiben
// dann nur in diesem Browser auf diesem Gerät.
export const SUPABASE_URL = '';          // z. B. 'https://abcdefghijkl.supabase.co'
export const SUPABASE_ANON_KEY = '';     // "Publishable key" bzw. "anon public" Key
export const VAPID_PUBLIC_KEY = '';      // öffentlicher Schlüssel aus schluessel.html
