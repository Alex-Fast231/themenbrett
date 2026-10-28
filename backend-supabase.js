// Echte Datenhaltung über Supabase (Datenbank, Login, Live-Aktualisierung, Push-Abos).
// Gleiche Schnittstelle wie backend-demo.js.

const ms = (t) => (t ? Date.parse(t) : 0);

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Datei konnte nicht geladen werden: ' + src));
    document.head.appendChild(s);
  });
}

function friendly(error) {
  if (!error) return null;
  const m = String(error.message || error);
  if (/Invalid login credentials/i.test(m)) return new Error('E-Mail oder Passwort stimmt nicht.');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return new Error('Keine Verbindung zum Server.');
  if (/row-level security|permission denied/i.test(m)) return new Error('Keine Berechtigung. Ist dein Konto in der Tabelle „profiles“ eingetragen?');
  return new Error(m);
}
const check = ({ data, error }) => { if (error) throw friendly(error); return data; };

export function createSupabaseBackend({ url, key, vapidPublicKey }) {
  let sb = null;
  let me = null;

  async function myProfile() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data, error } = await sb.from('profiles').select('id,name').eq('id', session.user.id).maybeSingle();
    if (error) throw friendly(error);
    if (!data) {
      await sb.auth.signOut();
      throw new Error('Dein Konto ist noch nicht freigeschaltet (kein Eintrag in „profiles“).');
    }
    return data;
  }

  async function currentSubscription() {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }

  async function saveSubscription(sub) {
    const j = sub.toJSON();
    check(await sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }));
  }

  return {
    mode: 'live',
    async init() {
      if (!window.supabase) await loadScript('vendor/supabase-2.118.0.js');
      sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    },
    async currentUser() {
      me = await myProfile();
      return me;
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw friendly(error);
      me = await myProfile();
      return me;
    },
    async signOut() {
      // Push-Abo dieses Geräts entfernen, damit hier nach dem Abmelden nichts mehr ankommt
      try { await this.disablePush(); } catch (e) { /* trotzdem abmelden */ }
      await sb.auth.signOut({ scope: 'local' });
      me = null;
    },

    async load() {
      const [profiles, cards, messages, ideas, reads] = await Promise.all([
        sb.from('profiles').select('id,name'),
        sb.from('cards').select('*'),
        sb.from('messages').select('*').order('created_at', { ascending: true }),
        sb.from('ideas').select('*'),
        sb.from('card_reads').select('card_id,last_read_at').eq('user_id', me.id),
      ].map((p) => p.then(check)));
      const byCard = {};
      messages.forEach((m) => {
        (byCard[m.card_id] = byCard[m.card_id] || []).push({ id: m.id, author: m.author, text: m.text, at: ms(m.created_at), editedAt: ms(m.edited_at) });
      });
      return {
        profiles: Object.fromEntries(profiles.map((p) => [p.id, p.name])),
        cards: cards.map((c) => ({
          id: c.id, name: c.name, topic: c.topic || '', result: c.result || '',
          createdBy: c.created_by, createdAt: ms(c.created_at),
          closedAt: ms(c.closed_at), closedBy: c.closed_by,
          deletedAt: ms(c.deleted_at), deletedBy: c.deleted_by,
          activityAt: ms(c.activity_at), activityBy: c.activity_by,
          msgs: byCard[c.id] || [],
        })),
        ideas: ideas.map((i) => ({ id: i.id, text: i.text, createdBy: i.created_by, createdAt: ms(i.created_at) })),
        reads: Object.fromEntries(reads.map((r) => [r.card_id, ms(r.last_read_at)])),
      };
    },
    subscribe(cb) {
      const ch = sb.channel('themenbrett');
      ['cards', 'messages', 'ideas'].forEach((table) => ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb()));
      ch.subscribe((status) => { if (status === 'SUBSCRIBED') cb(); });
      return () => sb.removeChannel(ch);
    },

    async addCard({ name, topic }) {
      return check(await sb.from('cards').insert({ name, topic }).select('id').single()).id;
    },
    async updateCardHead(id, name, topic) { check(await sb.from('cards').update({ name, topic }).eq('id', id)); },
    async closeCard(id, result) { check(await sb.from('cards').update({ result, closed_at: new Date().toISOString() }).eq('id', id)); },
    async setResult(id, result) { check(await sb.from('cards').update({ result }).eq('id', id)); },
    async reopenCard(id) { check(await sb.from('cards').update({ closed_at: null }).eq('id', id)); },
    async deleteCard(id) { check(await sb.rpc('delete_card', { p_card: id })); },
    async addMessage(cardId, text) { check(await sb.from('messages').insert({ card_id: cardId, text })); },
    async editMessage(cardId, msgId, text) { check(await sb.from('messages').update({ text }).eq('id', msgId)); },
    async markRead(cardId) { check(await sb.rpc('mark_read', { p_card: cardId })); },
    async addIdea(text) { check(await sb.from('ideas').insert({ text })); },
    async dropIdea(id) { check(await sb.from('ideas').delete().eq('id', id)); },

    pushAvailable: () => !!vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    async pushEnabled() {
      if (!this.pushAvailable() || Notification.permission !== 'granted') return false;
      return !!(await currentSubscription());
    },
    async enablePush() {
      if (!this.pushAvailable()) throw new Error('Dieser Browser unterstützt keine Benachrichtigungen.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Benachrichtigungen sind im Browser blockiert. Bitte in den Website-Einstellungen erlauben.');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(vapidPublicKey) });
      await saveSubscription(sub);
    },
    async disablePush() {
      const sub = await currentSubscription();
      if (!sub) return;
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      check(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
    },
    // Beim Start: vorhandenes Abo erneut speichern, falls es in der Datenbank fehlt
    async refreshPush() {
      if (!this.pushAvailable() || Notification.permission !== 'granted') return;
      const sub = await currentSubscription();
      if (sub) await saveSubscription(sub);
    },
  };
}
