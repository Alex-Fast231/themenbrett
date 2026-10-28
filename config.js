// FaSt Themenbrett: Einstellungen
// Diese drei Werte sind öffentlich gedacht. Geschützt werden die Daten über die
// Zugriffsregeln (Row Level Security) in Supabase.
// Solange SUPABASE_URL leer ist, läuft die App im Demo-Modus: Die Daten bleiben
// dann nur in diesem Browser auf diesem Gerät.
export const SUPABASE_URL = 'https://zbmoytckslcqmmwvekak.supabase.co';          // z. B. 'https://abcdefghijkl.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_N8Jq6Wt03nx-UK9lSI2ZUA_VJoB9azL';     // "Publishable key" bzw. "anon public" Key
export const VAPID_PUBLIC_KEY = 'BL2vaqtCSTGsvxfBuWM2iLcMC4Zjo2Ea1_T1AmIBwBF6p28OOIXeFnq7v3aEOyfEXQundLS_W-Vm7Pj6tBv1Xbw';      // öffentlicher Schlüssel aus schluessel.html
