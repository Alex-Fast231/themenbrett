# FaSt Themenbrett

Kleine Web-App (PWA) für Alex und Matthias: Themen schriftlich klären, jeder wann er Zeit hat. Was geklärt ist, wird festgehalten und als PDF-Protokoll exportiert.

- **Einrichtung:** siehe [EINRICHTUNG.md](EINRICHTUNG.md)
- **Demo-Modus:** Solange `config.js` leer ist, läuft die App mit Beispielkarten nur im Browser.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Seite und Gestaltung |
| `app.js` | Oberfläche und Abläufe |
| `backend-supabase.js` | Datenbank, Login, Live-Aktualisierung, Push-Abo |
| `backend-demo.js` | Demo-Modus (nur im Browser) |
| `pin.js` | PIN-Sperre (PBKDF2-Hash, nur lokal) |
| `pdf.js` | PDF-Protokoll (jsPDF) |
| `util.js` | Datum, sichere Textausgabe |
| `config.js` | Supabase-URL, öffentlicher Key, öffentlicher VAPID-Key |
| `sw.js`, `manifest.json`, `icons/` | Installierbare App, Push-Anzeige |
| `schluessel.html` | Erzeugt VAPID-Schlüssel und Push-Passwort im Browser |
| `vendor/` | supabase-js 2.118.0 und jsPDF 4.2.1 (lokal statt CDN, wegen Datenschutz) |
| `supabase/schema.sql` | Tabellen, Zugriffsregeln (RLS), Auslöser |
| `supabase/push.sql` | Adresse und Passwort der Push-Funktion |
| `supabase/functions/notify/index.ts` | Edge Function, verschickt die Benachrichtigungen |

Kein Build-Schritt, kein Framework: Dateien ändern, hochladen, fertig.
