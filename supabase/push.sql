-- FaSt Themenbrett: Push einschalten
-- Erst ausführen, wenn die Edge Function "notify" angelegt ist (siehe EINRICHTUNG.md, Schritt 7).
-- Vorher die beiden Werte unten ersetzen:
--   DEIN-PROJEKT  -> die Kennung deines Projekts (steht in der Projekt-URL, z. B. abcdefghijkl)
--   DEIN-PASSWORT -> dasselbe lange Passwort, das du bei der Edge Function als NOTIFY_SECRET eingetragen hast

insert into private.config (key, value) values
  ('notify_url',    'https://DEIN-PROJEKT.supabase.co/functions/v1/notify'),
  ('notify_secret', 'DEIN-PASSWORT')
on conflict (key) do update set value = excluded.value;
