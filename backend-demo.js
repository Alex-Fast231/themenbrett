// Demo-Modus: Alles bleibt im Browser (localStorage). Zwei feste Personen, Beispielkarten.
// Gleiche Schnittstelle wie backend-supabase.js.

const KEY = 'ftb-demo-data-v1';
const USER_KEY = 'ftb-demo-user';
const PROFILES = { alex: 'Alex', matthias: 'Matthias' };
const DAY = 864e5, H = 36e5;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privates Fenster */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* egal */ } },
};

function seed() {
  const n = Date.now();
  const card = (o) => Object.assign({ id: uid(), result: '', closedAt: 0, closedBy: null, deletedAt: 0, deletedBy: null, msgs: [] }, o);
  const msg = (author, text, at) => ({ id: uid(), author, text, at, editedAt: 0 });
  const cards = [
    card({ name: 'Evelyn', topic: 'Einarbeitung ab November: Wer begleitet sie in den ersten zwei Wochen, und in welchen Häusern fängt sie an?', createdBy: 'alex', createdAt: n - 3 * DAY,
      msgs: [msg('alex', 'Ich würde sie die erste Woche selbst mitnehmen. Danach zwei Tage mit Jonas.', n - 3 * DAY),
        msg('matthias', 'Passt. Arbeitsvertrag ist unterschrieben, Dienstkleidung bestelle ich diese Woche.', n - 2 * DAY),
        msg('alex', 'Sie braucht noch einen Zugang zur Doku-App. Kümmerst du dich oder soll ich?', n - 3 * H)] }),
    card({ name: 'Ergo-Start', topic: 'Abrechnung der Ergo-Rezepte: eigene IK-Nummer oder über die bestehende?', createdBy: 'alex', createdAt: n - 6 * DAY,
      msgs: [msg('matthias', 'Kläre ich mit dem Steuerberater, gib mir bis Freitag.', n - 5 * DAY)] }),
    card({ name: 'Weihnachtsurlaub', topic: 'Drei aus dem Team wollen zwischen den Jahren frei. Wie viele müssen mindestens da sein?', createdBy: 'matthias', createdAt: n - 9 * DAY,
      msgs: [msg('matthias', 'Liste mit den Wünschen hängt im Büro. Mach mal einen Vorschlag.', n - 8 * DAY)] }),
    card({ name: 'Erstgespräch Heimleitung', topic: 'Allein hin oder zu zweit? Welche Unterlagen nehmen wir mit?', createdBy: 'alex', createdAt: n - 25 * DAY,
      msgs: [msg('alex', 'Soll ich allein hin oder kommst du mit?', n - 24 * DAY),
        msg('matthias', 'Geh allein, ich schick dir vorher Leistungsblatt und Preisliste.', n - 23 * DAY),
        msg('alex', 'Gespräch lief gut, Start im Januar mit zwei Wohnbereichen.', n - 15 * DAY)],
      result: 'Alex führt das Gespräch allein.\nMatthias schickt vorher Leistungsblatt und Preisliste.\nErgebnis: Start im Januar mit zwei Wohnbereichen.', closedAt: n - 14 * DAY, closedBy: 'alex' }),
  ];
  cards.forEach((c) => {
    const last = c.msgs[c.msgs.length - 1];
    const ev = [[c.createdAt, c.createdBy]];
    if (last) ev.push([last.at, last.author]);
    if (c.closedAt) ev.push([c.closedAt, c.closedBy]);
    ev.sort((a, b) => a[0] - b[0]);
    [c.activityAt, c.activityBy] = ev[ev.length - 1];
  });
  return {
    cards,
    ideas: [
      { id: uid(), text: 'Firmenhandys für die Therapeuten?', createdBy: 'alex', createdAt: n - 2 * DAY },
      { id: uid(), text: 'Teamabend im Dezember', createdBy: 'matthias', createdAt: n - 4 * DAY },
      { id: uid(), text: 'Preise für Hausbesuche 2027 anpassen', createdBy: 'matthias', createdAt: n - 6 * DAY },
    ],
    // Alex hat die letzte Nachricht von Matthias zu "Evelyn" schon gesehen, "Weihnachtsurlaub" noch nicht
    reads: { alex: { [cards[0].id]: n, [cards[1].id]: n, [cards[3].id]: n }, matthias: { [cards[1].id]: n - 4 * DAY, [cards[2].id]: n, [cards[3].id]: n } },
  };
}

export function createDemoBackend() {
  let D = null;
  let me = ls.get(USER_KEY);
  if (!PROFILES[me]) me = null;

  const read = () => {
    try { D = JSON.parse(ls.get(KEY) || 'null'); } catch (e) { D = null; }
    if (!D || !Array.isArray(D.cards)) { D = seed(); write(); }
  };
  const write = () => ls.set(KEY, JSON.stringify(D));
  const touch = (c) => { c.activityAt = Date.now(); c.activityBy = me; };
  const find = (id) => {
    const c = D.cards.find((x) => x.id === id && !x.deletedAt);
    if (!c) throw new Error('Karte nicht gefunden.');
    return c;
  };
  const change = (fn) => { read(); const r = fn(); write(); return r; };

  return {
    mode: 'demo',
    async init() { read(); },
    async currentUser() { return me ? { id: me, name: PROFILES[me] } : null; },
    demoUsers: () => Object.entries(PROFILES).map(([id, name]) => ({ id, name })),
    async signInDemo(id) { me = id; ls.set(USER_KEY, id); },
    async signIn() { throw new Error('Im Demo-Modus nicht nötig.'); },
    async signOut() { me = null; ls.del(USER_KEY); },
    resetDemo() { D = seed(); write(); },

    async load() {
      read();
      const cards = D.cards.map((c) => Object.assign({}, c, { msgs: c.msgs.map((m) => Object.assign({}, m)) }));
      return { profiles: Object.assign({}, PROFILES), cards, ideas: D.ideas.map((i) => Object.assign({}, i)), reads: Object.assign({}, (D.reads && D.reads[me]) || {}) };
    },
    subscribe(cb) {
      // Zweites Browserfenster: Änderungen kommen über das storage-Ereignis
      const h = (e) => { if (e.key === KEY) cb(); };
      window.addEventListener('storage', h);
      return () => window.removeEventListener('storage', h);
    },

    async addCard({ name, topic }) {
      return change(() => {
        const n = Date.now();
        const c = { id: uid(), name, topic, result: '', createdBy: me, createdAt: n, closedAt: 0, closedBy: null, deletedAt: 0, deletedBy: null, activityAt: n, activityBy: me, msgs: [] };
        D.cards.push(c);
        return c.id;
      });
    },
    async updateCardHead(id, name, topic) { change(() => { const c = find(id); c.name = name; c.topic = topic; touch(c); }); },
    async closeCard(id, result) { change(() => { const c = find(id); c.result = result; c.closedAt = Date.now(); c.closedBy = me; touch(c); }); },
    async setResult(id, result) { change(() => { const c = find(id); c.result = result; touch(c); }); },
    async reopenCard(id) { change(() => { const c = find(id); c.closedAt = 0; c.closedBy = null; touch(c); }); },
    async deleteCard(id) {
      change(() => {
        const c = find(id);
        Object.assign(c, { topic: '', result: '', msgs: [], deletedAt: Date.now(), deletedBy: me });
        touch(c);
      });
    },
    async addMessage(cardId, text) {
      change(() => { const c = find(cardId); c.msgs.push({ id: uid(), author: me, text, at: Date.now(), editedAt: 0 }); touch(c); });
    },
    async editMessage(cardId, msgId, text) {
      change(() => {
        const c = find(cardId);
        const m = c.msgs.find((x) => x.id === msgId);
        if (!m || m.author !== me) throw new Error('Nur eigene Nachrichten können bearbeitet werden.');
        m.text = text; m.editedAt = Date.now(); touch(c);
      });
    },
    async markRead(cardId) {
      change(() => { D.reads = D.reads || {}; D.reads[me] = D.reads[me] || {}; D.reads[me][cardId] = Date.now(); });
    },
    async addIdea(text) { change(() => { D.ideas.push({ id: uid(), text, createdBy: me, createdAt: Date.now() }); }); },
    async dropIdea(id) { change(() => { D.ideas = D.ideas.filter((x) => x.id !== id); }); },

    pushAvailable: () => false,
    async pushEnabled() { return false; },
    async enablePush() { throw new Error('Benachrichtigungen gibt es erst in der eingerichteten App.'); },
    async disablePush() {},
  };
}
