# FaSt Themenbrett einrichten

Diese Anleitung führt dich Schritt für Schritt durch die Einrichtung. Du brauchst keine Programmierkenntnisse. Rechne mit etwa einer Stunde. Am besten machst du das am Computer, nur Schritt 11 und 12 am Handy.

Supabase und GitHub ändern ab und zu die Beschriftung ihrer Menüs. Wenn ein Knopf etwas anders heißt als hier beschrieben, such nach einem ähnlichen Wort an derselben Stelle.

**Übersicht**

0. App im Demo-Modus ansehen (geht sofort, ohne Supabase)
1. Supabase-Konto und Projekt in Frankfurt anlegen
2. Auftragsverarbeitungsvertrag (AVV) abschließen
3. Datenbank anlegen (SQL ausführen)
4. Registrierung abschalten
5. Die zwei Nutzer anlegen und in `profiles` eintragen
6. Schlüssel für Benachrichtigungen erzeugen
7. Edge Function `notify` anlegen und Secrets setzen
8. Push in der Datenbank einschalten
9. `config.js` ausfüllen
10. Kontrolle
11. App auf dem Android-Handy installieren
12. Anmelden, PIN festlegen, Benachrichtigungen aktivieren
13. Testliste für Alex und Matthias

---

## 0. App im Demo-Modus ansehen

Solange in `config.js` nichts eingetragen ist, läuft die App im **Demo-Modus**. Sie sieht genauso aus wie später, speichert aber nur im eigenen Browser und hat Beispielkarten. So kannst du alles in Ruhe anschauen, bevor du dich bei Supabase registrierst.

**GitHub Pages einschalten** (einmalig, damit die App eine Adresse bekommt):

1. Öffne auf github.com dein Repo **themenbrett**.
2. Klicke oben auf **Settings** (Zahnrad).
3. Links in der Leiste auf **Pages**.
4. Unter „Build and deployment“ bei **Source**: „Deploy from a branch“.
5. Bei **Branch**: `main` auswählen, daneben `/ (root)`, dann **Save**.
6. Nach 1–2 Minuten die Seite neu laden. Oben steht dann „Your site is live at **https://alex-fast231.github.io/themenbrett/**“.

Öffne die Adresse. Tippe auf „Alex“, lege eine Test-PIN fest und probiere alles aus. Um die Seite von Matthias zu sehen: oben rechts auf deinen Namen → **Abmelden** → „Matthias“.

> Hinweis: GitHub Pages ist nur bei **öffentlichen** Repos kostenlos. Den Code kann dann jeder sehen. Das ist in Ordnung, weil im Code keine Geheimnisse stehen. Eure Inhalte liegen später nicht bei GitHub, sondern geschützt in Supabase.

---

## 1. Supabase-Konto und Projekt anlegen

1. Gehe auf **https://supabase.com** und klicke auf **Start your project**.
2. Registriere dich (mit E-Mail oder mit deinem GitHub-Konto).
3. Falls gefragt: Lege eine **Organization** an. Name z. B. „FaSt“, Typ „Company“, Plan **Free**.
4. Klicke auf **New project**:
   - **Name:** `themenbrett`
   - **Database Password:** auf **Generate a password** klicken und das Passwort in deinem Passwort-Manager speichern. Du brauchst es im Alltag nicht.
   - **Region:** **Central EU (Frankfurt)** (eu-central-1). Wichtig wegen Datenschutz.
   - Plan: **Free**
5. **Create new project** klicken und 1–2 Minuten warten, bis das Projekt fertig ist.

> Kostenlose Projekte werden nach etwa einer Woche **ohne jede Nutzung** pausiert. Solange ihr die App benutzt, passiert das nicht. Falls doch: Supabase schickt eine E-Mail, und im Dashboard reicht ein Klick auf **Restore project**. Es gehen dabei keine Daten verloren.

---

## 2. Auftragsverarbeitungsvertrag (AVV) abschließen

Supabase speichert für euch Daten, in denen Personen vorkommen (eure Namen und E-Mail-Adressen, Namen von Mitarbeitern in den Karten). Dafür verlangt die DSGVO einen **Auftragsverarbeitungsvertrag** (englisch DPA). Bei Supabase ist der kostenlos und in ein paar Minuten erledigt.

1. Im Supabase-Dashboard oben links auf den Namen deiner **Organization** klicken → **Organization settings** (oder Zahnrad).
2. Dort den Bereich **Legal Documents** öffnen.
3. Beim **Data Processing Addendum (DPA)** auf **Request/Sign** klicken und das Formular mit den Firmendaten ausfüllen und unterschreiben.
4. Das unterschriebene PDF kommt per E-Mail. Leg es zu deinen Datenschutz-Unterlagen.

Falls du den Bereich nicht findest: Auf **https://supabase.com/legal/dpa** steht, wie man den DPA anfordert.

---

## 3. Datenbank anlegen

1. Im Projekt links auf **SQL Editor** klicken.
2. Oben auf **+ New query** (bzw. „New SQL snippet“).
3. Öffne im GitHub-Repo die Datei **`supabase/schema.sql`**, klicke rechts oben auf das Kopier-Symbol („Copy raw file“).
4. Im SQL Editor alles einfügen und unten rechts auf **Run** klicken.
5. Unten muss **„Success. No rows returned“** erscheinen. Wenn eine Warnung kommt, dass die Abfrage „destructive operations“ enthält: **Run this query** bestätigen. Das Skript löscht nichts von euren Daten.

---

## 4. Registrierung abschalten

Niemand soll sich selbst ein Konto anlegen können.

1. Links auf **Authentication**.
2. Im Untermenü auf **Sign In / Providers** (bei manchen Versionen: **Settings** oder **Providers**).
3. Den Schalter **Allow new users to sign up** **ausschalten**.
4. Unten auf **Save changes**.

Selbst wenn sich doch jemand registrieren würde: Ohne Eintrag in der Tabelle `profiles` sieht diese Person nichts. Das regeln die Zugriffsregeln aus Schritt 3.

---

## 5. Die zwei Nutzer anlegen

**Konten anlegen**

1. Links auf **Authentication** → **Users**.
2. Oben rechts **Add user** → **Create new user**.
3. E-Mail von Alex eintragen, ein gutes Passwort vergeben, Haken bei **Auto Confirm User** setzen → **Create user**.
4. Dasselbe für Matthias (mit seiner E-Mail und seinem eigenen Passwort).

Gib Matthias sein Passwort persönlich weiter, nicht per E-Mail.

**Namen eintragen**

1. Links auf **SQL Editor** → **+ New query**.
2. Folgendes einfügen, die beiden E-Mail-Adressen anpassen und auf **Run** klicken:

```sql
insert into public.profiles (id, name)
select id, 'Alex' from auth.users where email = 'alex@beispiel.de'
on conflict (id) do update set name = excluded.name;

insert into public.profiles (id, name)
select id, 'Matthias' from auth.users where email = 'matthias@beispiel.de'
on conflict (id) do update set name = excluded.name;

select name from public.profiles;
```

3. Unten müssen jetzt **Alex** und **Matthias** stehen. Steht dort nichts, passt eine E-Mail-Adresse nicht genau.

---

## 6. Schlüssel für Benachrichtigungen erzeugen

1. Öffne **https://alex-fast231.github.io/themenbrett/schluessel.html**.
2. Klicke auf **Schlüssel erzeugen**.
3. Lass das Fenster offen. Du brauchst gleich alle drei Werte:
   - **Öffentlicher Schlüssel** (VAPID_PUBLIC_KEY)
   - **Privater Schlüssel** (VAPID_PRIVATE_KEY)
   - **Passwort für die Push-Funktion** (NOTIFY_SECRET)

Die Seite erzeugt alles nur in deinem Browser und schickt nichts weg. Wenn du sie neu lädst, sind die Werte weg. Dann einfach neu erzeugen und überall die neuen Werte nehmen.

---

## 7. Edge Function `notify` anlegen

**Funktion anlegen**

1. Links auf **Edge Functions**.
2. **Deploy a new function** → **Via Editor**.
3. Als Namen genau **`notify`** eintragen.
4. Den vorhandenen Beispielcode im Editor komplett löschen.
5. Öffne im GitHub-Repo **`supabase/functions/notify/index.ts`**, kopiere den Inhalt (Kopier-Symbol) und füge ihn im Editor ein.
6. Unten rechts auf **Deploy function** klicken.

**JWT-Prüfung abschalten**

Die Funktion wird von der Datenbank aufgerufen und prüft selbst ein Passwort. Die Standardprüfung von Supabase muss deshalb aus.

1. In der Funktion `notify` auf den Reiter **Details** (oder **Settings**).
2. **Enforce JWT verification** bzw. **Verify JWT** **ausschalten**.
3. **Save changes**.

**Secrets setzen**

1. Links auf **Edge Functions** → **Secrets** (manchmal unter **Project Settings → Edge Functions**).
2. Vier Einträge anlegen (Name links, Wert rechts), dann **Save**:

| Name | Wert |
|---|---|
| `NOTIFY_SECRET` | das Passwort aus Schritt 6 |
| `VAPID_PUBLIC_KEY` | der öffentliche Schlüssel aus Schritt 6 |
| `VAPID_PRIVATE_KEY` | der private Schlüssel aus Schritt 6 |
| `VAPID_SUBJECT` | `mailto:` und deine E-Mail, z. B. `mailto:alex@beispiel.de` |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase automatisch bereit. Die musst du nicht eintragen.

> Der private Schlüssel und das Passwort gehören **nur** hierher. Nie in `config.js`, nie ins Repo, nicht per Mail.

---

## 8. Push in der Datenbank einschalten

1. Deine **Projekt-Kennung** finden: Sie steht in der Adresse deines Projekts, z. B. `https://supabase.com/dashboard/project/abcdefghijkl`. Die Kennung ist hier `abcdefghijkl`.
2. **SQL Editor** → **+ New query**.
3. Inhalt von **`supabase/push.sql`** einfügen.
4. Darin ersetzen:
   - `DEIN-PROJEKT` durch deine Projekt-Kennung
   - `DEIN-PASSWORT` durch das NOTIFY_SECRET aus Schritt 6
5. **Run** klicken.

---

## 9. `config.js` ausfüllen

**Werte holen**

1. In Supabase links unten auf **Project Settings** (Zahnrad).
2. Auf **Data API** bzw. **API**: Dort steht die **Project URL**, z. B. `https://abcdefghijkl.supabase.co`.
3. Auf **API Keys**: Dort den **Publishable key** kopieren (beginnt mit `sb_publishable_…`). Gibt es nur den Reiter „Legacy API keys“, nimm den **anon public** Key.

Den **secret** bzw. **service_role** Key **niemals** verwenden. Der gehört nicht in die App.

**Eintragen**

1. Im GitHub-Repo die Datei **`config.js`** öffnen.
2. Oben rechts auf den **Stift** („Edit this file“).
3. Die drei Werte zwischen die Anführungszeichen setzen:

```js
export const SUPABASE_URL = 'https://abcdefghijkl.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_…';
export const VAPID_PUBLIC_KEY = 'B…';   // öffentlicher Schlüssel aus Schritt 6
```

4. Oben rechts auf **Commit changes…** → nochmal **Commit changes**.
5. 1–2 Minuten warten, bis GitHub Pages die neue Version ausliefert.

Ab jetzt läuft die App nicht mehr im Demo-Modus, sondern zeigt das Anmeldefeld.

---

## 10. Kontrolle

Öffne die App am Computer (https://alex-fast231.github.io/themenbrett/). Du solltest jetzt **E-Mail und Passwort** sehen statt der Demo-Auswahl. Wenn noch die Demo-Auswahl kommt: Seite mit **Strg + F5** neu laden.

---

## 11. App auf dem Android-Handy installieren

1. Öffne in **Chrome** die Adresse **https://alex-fast231.github.io/themenbrett/**.
2. Oben rechts auf die **drei Punkte ⋮**.
3. **App installieren** bzw. **Zum Startbildschirm hinzufügen** → **Installieren**.
4. Auf dem Startbildschirm erscheint das schwarze **FT**-Symbol. Ab jetzt die App immer darüber öffnen.

Das macht Matthias genauso auf seinem Handy. Am Desktop (Chrome oder Edge) geht es über das kleine Installieren-Symbol rechts in der Adressleiste.

---

## 12. Anmelden, PIN festlegen, Benachrichtigungen aktivieren

1. App öffnen, **E-Mail und Passwort** eingeben, **Anmelden**.
2. Eine **4-stellige PIN** eingeben und wiederholen. Ab jetzt fragt die App bei jedem Öffnen nur noch nach der PIN, und auch dann, wenn sie länger als 5 Minuten im Hintergrund war.
3. Oben rechts auf deinen **Namen** → **Benachrichtigungen** antippen → Chrome fragt nach der Erlaubnis → **Zulassen**.
4. Fertig. Jedes Gerät (Handy, Laptop) hat sein eigenes Abo. Das also auf jedem Gerät einmal machen.

**Gut zu wissen**

- **PIN vergessen?** Unten im PIN-Feld antippen. Du wirst abgemeldet, meldest dich mit E-Mail und Passwort neu an und legst eine neue PIN fest.
- **5 falsche PINs** hintereinander melden dich ebenfalls ab.
- **Kommen keine Benachrichtigungen an?** In den Android-Einstellungen → Apps → Chrome (bzw. Themenbrett) → Benachrichtigungen prüfen. Manche Handys (z. B. Samsung, Xiaomi) schicken Chrome im Energiesparmodus schlafen; dann bei „Akku“ für Chrome „Nicht eingeschränkt“ wählen.
- **Abmelden** im Menü entfernt auch das Benachrichtigungs-Abo dieses Geräts.

---

## 13. Testliste für Alex und Matthias

Am besten zu zweit, jeder mit seinem Handy. Haken setzen, wenn es klappt.

- [ ] **Login:** Beide können sich mit E-Mail und Passwort anmelden. Ein falsches Passwort zeigt „E-Mail oder Passwort stimmt nicht.“
- [ ] **PIN:** Nach dem Login PIN festlegen. App schließen und wieder öffnen: Es kommt nur die PIN-Abfrage. Eine falsche PIN zeigt „Noch 4 Versuche“.
- [ ] **Karte anlegen:** Alex tippt auf „+ Neue Karte“, Name „Test“, Thema „Probe“ → Karte anlegen.
- [ ] **Push kommt an:** Auf Matthias’ Handy erscheint „FaSt Themenbrett – Neuigkeiten im Themenbrett“, auch wenn die App zu ist.
- [ ] **Live:** Haben beide die App offen, erscheint die neue Karte bei Matthias sofort, mit Punkt.
- [ ] **Antworten:** Matthias antwortet in der Karte. Alex bekommt eine Benachrichtigung und sieht den Punkt. Nach dem Öffnen der Karte ist der Punkt weg.
- [ ] **Bearbeiten:** Matthias bearbeitet seine Nachricht. Sie zeigt „bearbeitet“. Bei Alex’ Nachrichten gibt es für Matthias keinen „Bearbeiten“-Link.
- [ ] **Abschließen:** Alex schreibt unter „Geklärt?“ ein Ergebnis → „Ergebnis festhalten und abschließen“. Die Karte steht unter „Erledigt“, Matthias bekommt eine Benachrichtigung.
- [ ] **PDF:** In der erledigten Karte „Als PDF“ → „Als PDF speichern“. Die Datei heißt `Protokoll_Test_<Datum>.pdf` und enthält Thema, Ergebnis und Verlauf.
- [ ] **Wieder öffnen:** „Wieder öffnen“ holt die Karte zurück nach „Offen“.
- [ ] **Löschen:** „Karte löschen“ → Rückfrage → Löschen. Die Karte ist weg. Unter „Protokoll“ steht sie als „gelöscht“, und das PDF enthält nur den Vermerk.
- [ ] **Sammlung:** Matthias notiert ein Stichwort. Alex bekommt eine Benachrichtigung und sieht es in der Sammlung. „Eröffnen“ macht daraus eine Karte, „Streichen“ entfernt es.
- [ ] **Abmelden:** Menü → Abmelden. Danach wird wieder E-Mail und Passwort verlangt.

Wenn alles abgehakt ist: Die Testkarten löschen, und es kann losgehen.

---

## Datenschutz, kurz zusammengefasst

- **Supabase** (Datenbank und Login) speichert in **Frankfurt**. Mit dem AVV aus Schritt 2 ist das sauber geregelt.
- **GitHub Pages** liefert nur die App-Dateien aus, keine Inhalte. GitHub ist ein US-Anbieter und unter dem EU-US Data Privacy Framework zertifiziert.
- **Benachrichtigungen** laufen über den Push-Dienst von Google (Chrome). Sie enthalten **keinen Inhalt**, nur „Neuigkeiten im Themenbrett“.
- Die App lädt **keine fremden Schriften oder Skripte** aus dem Internet (kein Google Fonts, kein CDN). Alles liegt im Repo.
- **Keine Patientendaten** in die Karten schreiben. Das Themenbrett ist für Geschäftsinternes gedacht.
- Die **PIN** liegt nur verschlüsselt (als Hash) auf dem jeweiligen Gerät. Sie schützt vor neugierigen Blicken, ist aber kein Ersatz für ein Passwort.
