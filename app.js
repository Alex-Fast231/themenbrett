// FaSt Themenbrett: Oberfläche und Abläufe
import { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY } from './config.js';
import { createDemoBackend } from './backend-demo.js';
import { createSupabaseBackend } from './backend-supabase.js';
import { hasPin, setPin, verifyPin, fails, clearPin, MAX_FAILS } from './pin.js';
import { fmtD, fmtDT, short, esc } from './util.js';
import { savePdf } from './pdf.js';

const LOCK_AFTER_MS = 5 * 60 * 1000;
const B = SUPABASE_URL
  ? createSupabaseBackend({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY, vapidPublicKey: VAPID_PUBLIC_KEY })
  : createDemoBackend();

const $ = (id) => document.getElementById(id);
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privates Fenster */ } },
};

let me = null;                 // { id, name }
let S = { profiles: {}, cards: [], ideas: [], reads: {} };
let view = { tab: 'offen', q: '', open: null, edit: null };
let unlocked = false;
let hiddenSince = 0;
let unsubscribe = null;
let ideasSeenShown = 0;        // Stand der Sammlung beim Öffnen des Reiters (für die Punkte)
const marking = new Set();

/* ---------- Hilfen ---------- */

const nameOf = (id) => S.profiles[id] || (id ? 'Unbekannt' : '–');
const people = () => {
  const n = Object.values(S.profiles);
  return n.length ? n.join(' und ') : 'Alex und Matthias';
};
const live = () => S.cards.filter((c) => !c.deletedAt);
const lastMsg = (c) => (c.msgs.length ? c.msgs[c.msgs.length - 1] : null);
const unread = (c) => !c.deletedAt && c.activityBy && c.activityBy !== me.id && c.activityAt > (S.reads[c.id] || 0);
const ideasSeenKey = () => 'ftb-ideas-seen-' + me.id;
const ideasSeen = () => parseInt(ls.get(ideasSeenKey()) || '0', 10) || 0;
const newIdea = (i, since) => i.createdBy !== me.id && i.createdAt > since;

function toast(head, text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<b>' + esc(head) + '</b>' + esc(text);
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
const fail = (e) => toast('Nicht gespeichert', (e && e.message) || 'Unbekannter Fehler.');

// Führt eine Änderung aus, sperrt dabei den Knopf und lädt danach neu
async function act(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    await fn();
    await reload();
    return true;
  } catch (e) {
    fail(e);
    return false;
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
}

/* ---------- Laden und Live-Aktualisierung ---------- */

let reloadTimer = null;
let reloading = null;
async function reload() {
  if (reloading) { await reloading; }
  reloading = (async () => {
    try {
      S = await B.load();
    } catch (e) {
      toast('Laden fehlgeschlagen', e.message || 'Keine Verbindung.');
    }
    if (view.open && !S.cards.some((c) => c.id === view.open && !c.deletedAt)) {
      const gone = S.cards.find((c) => c.id === view.open);
      if (gone && gone.deletedAt && gone.deletedBy !== me.id) toast('Karte gelöscht', '„' + gone.name + '“ wurde von ' + nameOf(gone.deletedBy) + ' gelöscht.');
      view.open = null; view.edit = null;
    }
    render();
  })();
  try { await reloading; } finally { reloading = null; }
}
const reloadSoon = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(reload, 250); };

/* ---------- Darstellung ---------- */

// Eingaben und Fokus über ein Neuzeichnen hinweg behalten (z. B. wenn der andere gerade schreibt)
function keepInputs(container, draw) {
  const key = view.tab + '|' + view.open + '|' + view.edit;
  const vals = {};
  container.querySelectorAll('input[id],textarea[id]').forEach((el) => { vals[el.id] = el.value; });
  const a = document.activeElement;
  const focus = a && container.contains(a) && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  const scroll = container.scrollTop;
  const sameKey = container.dataset.key === key;
  draw();
  container.dataset.key = key;
  if (!sameKey) return;
  Object.entries(vals).forEach(([id, v]) => { const el = $(id); if (el && container.contains(el)) el.value = v; });
  container.scrollTop = scroll;
  if (focus) {
    const el = $(focus.id);
    if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(focus.s, focus.e); } catch (e) { /* kein Textfeld */ } }
  }
}

function renderTabs() {
  const L = live();
  const open = L.filter((c) => !c.closedAt), done = L.filter((c) => c.closedAt);
  const dot = (on) => (on ? '<i class="dot" title="Neu"></i>' : '');
  const seen = view.tab === 'sammlung' ? ideasSeenShown : ideasSeen();
  $('tabs').innerHTML =
    '<button type="button" data-tab="sammlung" aria-pressed="' + (view.tab === 'sammlung') + '">Sammlung<span class="n">' + S.ideas.length + '</span>' + dot(view.tab !== 'sammlung' && S.ideas.some((i) => newIdea(i, seen))) + '</button>' +
    '<button type="button" data-tab="offen" aria-pressed="' + (view.tab === 'offen') + '">Offen<span class="n">' + open.length + '</span>' + dot(open.some(unread)) + '</button>' +
    '<button type="button" data-tab="erledigt" aria-pressed="' + (view.tab === 'erledigt') + '">Erledigt<span class="n">' + done.length + '</span>' + dot(done.some(unread)) + '</button>' +
    '<button type="button" data-proto="1">Protokoll</button>';
}

function renderIdeas(q) {
  const L = S.ideas.filter((i) => !q || i.text.toLowerCase().includes(q)).sort((a, b) => b.createdAt - a.createdAt);
  keepInputs($('list'), () => {
    $('list').innerHTML =
      '<div class="addidea"><input class="inp" id="ideaIn" maxlength="500" placeholder="Thema notieren, das wir besprechen sollten" aria-label="Neues Thema für die Sammlung"><button type="button" class="btn" id="ideaAdd">Notieren</button></div>' +
      (L.length
        ? L.map((i) => '<div class="idea"><div class="tx"><div>' + (newIdea(i, ideasSeenShown) ? '<i class="dot" title="Neu"></i>' : '') + '<span>' + esc(i.text) + '</span></div><small>' + esc(nameOf(i.createdBy)) + ' · <span class="mono">' + fmtD(i.createdAt) + '</span></small></div>' +
            '<div class="ia"><button type="button" class="btn" data-openidea="' + esc(i.id) + '">Eröffnen</button><button type="button" class="linkbtn" data-dropidea="' + esc(i.id) + '" style="color:var(--muted)">Streichen</button></div></div>').join('')
        : '<div class="empty">' + (q ? 'Nichts gefunden.' : 'Noch nichts gesammelt. Oben einfach ein Stichwort eintragen.') + '</div>');
  });
  const add = async () => {
    const inp = $('ideaIn'), v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    inp.value = '';
    const ok = await act($('ideaAdd'), () => B.addIdea(v));
    if (!ok && $('ideaIn')) $('ideaIn').value = v;
    if ($('ideaIn')) $('ideaIn').focus();
  };
  $('ideaAdd').onclick = add;
  $('ideaIn').onkeydown = (e) => { if (e.key === 'Enter') add(); };
  document.querySelectorAll('[data-openidea]').forEach((b) => { b.onclick = () => newCard(S.ideas.find((x) => x.id === b.dataset.openidea)); });
  document.querySelectorAll('[data-dropidea]').forEach((b) => { b.onclick = () => act(b, () => B.dropIdea(b.dataset.dropidea)); });
}

function renderList() {
  const q = view.q.toLowerCase().trim();
  if (view.tab === 'sammlung') { renderIdeas(q); return; }
  $('list').dataset.key = '';
  const L = live()
    .filter((c) => (view.tab === 'offen') === !c.closedAt)
    .filter((c) => !q || (c.name + ' ' + c.topic + ' ' + c.result + ' ' + c.msgs.map((m) => m.text).join(' ')).toLowerCase().includes(q))
    .sort((a, b) => b.activityAt - a.activityAt);
  if (!L.length) {
    $('list').innerHTML = '<div class="empty">' + (q ? 'Keine Karte gefunden.' : view.tab === 'offen' ? 'Keine offenen Karten. Neue Karte unten rechts anlegen.' : 'Noch nichts abgeschlossen.') + '</div>';
    return;
  }
  $('list').innerHTML = L.map((c) => {
    const m = lastMsg(c);
    return '<button type="button" class="card" data-id="' + esc(c.id) + '" aria-current="' + (view.open === c.id) + '">' +
      '<div class="name"><span>' + esc(c.name) + '</span>' + (unread(c) ? '<i class="dot" title="Neu"></i>' : '') + (c.closedAt ? '<span class="done-mark">Erledigt</span>' : '') + '</div>' +
      '<div class="topic">' + esc(c.topic) + '</div>' +
      '<div class="last"><span>' + (c.closedAt ? 'Ergebnis festgehalten von ' + esc(nameOf(c.closedBy)) : m ? esc(nameOf(m.author)) + ': ' + esc(m.text) : 'Noch keine Antwort') + '</span><span class="mono">' + short(c.activityAt) + '</span></div></button>';
  }).join('');
}

function renderDetail() {
  const el = $('detail');
  const c = S.cards.find((x) => x.id === view.open && !x.deletedAt);
  if (!c) {
    el.classList.add('closed');
    el.dataset.key = '';
    el.innerHTML = '<div class="placeholder">Karte links antippen, um das Gespräch zu sehen.</div>';
    return;
  }
  el.classList.remove('closed');
  const cancel = '<button type="button" class="btn ghost" data-cancel="1">Abbrechen</button>';
  const head = view.edit === 'head'
    ? '<div class="field"><span class="label">Name der Karte</span><input class="inp" id="eName" maxlength="120" value="' + esc(c.name) + '"></div><div class="field"><span class="label">Thema</span><textarea id="eTopic">' + esc(c.topic) + '</textarea></div><div class="acts">' + cancel + '<button type="button" class="btn" id="eSave">Speichern</button></div>'
    : '<div class="field"><span class="label">Thema</span><div class="topicbox">' + (c.topic ? esc(c.topic) : '<span style="color:var(--muted)">Kein Thema eingetragen.</span>') + '</div><div><button type="button" class="linkbtn" id="eHead">Bearbeiten</button></div></div>';
  const thread = c.msgs.length
    ? c.msgs.map((m) => (view.edit === 'm:' + m.id
      ? '<div class="msg mine editing"><textarea id="eMsg">' + esc(m.text) + '</textarea><div class="acts" style="margin-top:6px">' + cancel + '<button type="button" class="btn" id="eMsgSave" data-mid="' + esc(m.id) + '">Speichern</button></div></div>'
      : '<div class="msg ' + (m.author === me.id ? 'mine' : '') + '"><div class="w"><b>' + esc(nameOf(m.author)) + '</b><span class="mono">' + fmtDT(m.at) + '</span>' + (m.editedAt ? '<span>bearbeitet</span>' : '') + (m.author === me.id ? '<button type="button" class="linkbtn" data-editmsg="' + esc(m.id) + '">Bearbeiten</button>' : '') + '</div><div class="b">' + esc(m.text) + '</div></div>')).join('')
    : '<p class="note">Noch keine Antwort.</p>';
  let foot;
  if (c.closedAt) {
    foot = view.edit === 'result'
      ? '<div class="result"><span class="label">Ergebnis</span><textarea id="eRes">' + esc(c.result) + '</textarea><div class="acts">' + cancel + '<button type="button" class="btn ok" id="eResSave">Speichern</button></div></div>'
      : '<div class="result"><span class="label">Ergebnis · ' + esc(nameOf(c.closedBy)) + ', ' + fmtD(c.closedAt) + '</span><div class="txt">' + esc(c.result) + '</div><div class="acts" style="justify-content:flex-start"><button type="button" class="btn ok" id="pdfOne">Als PDF</button><button type="button" class="btn ghost" id="eResEdit">Ergebnis bearbeiten</button><button type="button" class="btn ghost" id="reopen">Wieder öffnen</button></div></div>';
  } else {
    foot = '<div class="compose"><span class="label">Antworten</span><textarea id="msg" placeholder="Nachricht als ' + esc(me.name) + '"></textarea><div class="acts"><button type="button" class="btn" id="send">Senden</button></div></div>' +
      '<div class="compose"><span class="label">Geklärt?</span><textarea id="res" placeholder="Die wichtigsten Punkte und was ihr beschlossen habt. Das kommt ins Protokoll.">' + esc(c.result) + '</textarea><div class="acts"><button type="button" class="btn ghost" id="pdfOne">Zwischenstand als PDF</button><button type="button" class="btn ok" id="close">Ergebnis festhalten und abschließen</button></div></div>';
  }
  keepInputs(el, () => {
    el.innerHTML = '<div class="dh"><button type="button" class="back" id="back" aria-label="Zurück">←</button><h2>' + esc(c.name) + '</h2></div>' +
      '<div class="dbody">' + head + '<div class="field"><span class="label">Gespräch · angelegt von ' + esc(nameOf(c.createdBy)) + ' am ' + fmtD(c.createdAt) + '</span></div><div class="thread">' + thread + '</div>' + foot +
      '<div><button type="button" class="linkbtn danger" id="del">Karte löschen</button></div></div>';
  });

  if (unread(c) && !marking.has(c.id)) {
    marking.add(c.id);
    S.reads[c.id] = Date.now() + 1;
    B.markRead(c.id).catch(() => { /* Punkt kommt beim nächsten Laden wieder */ }).finally(() => marking.delete(c.id));
    renderTabs(); renderList();
  }

  const on = (id, fn) => { const x = $(id); if (x) x.onclick = fn; };
  on('back', () => { view.open = null; view.edit = null; render(); });
  on('eHead', () => { view.edit = 'head'; render(); $('eName').focus(); });
  el.querySelectorAll('[data-cancel]').forEach((b) => { b.onclick = () => { view.edit = null; render(); }; });
  on('eSave', async () => {
    const n = $('eName').value.trim();
    if (!n) { $('eName').focus(); return; }
    const t = $('eTopic').value.trim();
    view.edit = null;
    if (!(await act($('eSave'), () => B.updateCardHead(c.id, n, t)))) { view.edit = 'head'; }
  });
  el.querySelectorAll('[data-editmsg]').forEach((b) => { b.onclick = () => { view.edit = 'm:' + b.dataset.editmsg; render(); $('eMsg').focus(); }; });
  on('eMsgSave', async () => {
    const v = $('eMsg').value.trim();
    const mid = $('eMsgSave').dataset.mid;
    const m = c.msgs.find((x) => x.id === mid);
    if (!v || (m && m.text === v)) { view.edit = null; render(); return; }
    await act($('eMsgSave'), () => B.editMessage(c.id, mid, v)).then((ok) => { if (ok) { view.edit = null; render(); } });
  });
  on('send', async () => {
    const box = $('msg'), v = box.value.trim();
    if (!v) { box.focus(); return; }
    box.value = '';
    const ok = await act($('send'), () => B.addMessage(c.id, v));
    if (!ok && $('msg')) $('msg').value = v;
  });
  on('close', async () => {
    const v = $('res').value.trim();
    if (!v) { $('res').focus(); toast('Ergebnis fehlt', 'Bitte kurz festhalten, was geklärt wurde.'); return; }
    if (await act($('close'), () => B.closeCard(c.id, v))) { view.tab = 'erledigt'; render(); }
  });
  on('eResEdit', () => { view.edit = 'result'; render(); $('eRes').focus(); });
  on('eResSave', async () => {
    const v = $('eRes').value.trim();
    if (!v) { $('eRes').focus(); return; }
    view.edit = null;
    if (!(await act($('eResSave'), () => B.setResult(c.id, v)))) { view.edit = 'result'; render(); }
  });
  on('reopen', async () => { if (await act($('reopen'), () => B.reopenCard(c.id))) { view.tab = 'offen'; render(); } });
  on('pdfOne', () => protoSheet(c.id));
  on('del', () => openSheet(
    '<h2>Karte „' + esc(c.name) + '“ löschen?</h2><p class="note">Thema, Ergebnis und Gespräch werden für beide endgültig entfernt. Im Protokoll bleibt nur der Vermerk, dass ' + esc(me.name) + ' die Karte gelöscht hat.</p>' +
    '<div class="acts"><button type="button" class="btn ghost" id="dNo">Abbrechen</button><button type="button" class="btn danger" id="dYes">Löschen</button></div>',
    () => {
      $('dNo').onclick = closeSheet;
      $('dYes').onclick = async () => {
        const ok = await act($('dYes'), () => B.deleteCard(c.id));
        if (ok) { closeSheet(); view.open = null; view.edit = null; render(); toast('Gelöscht', '„' + c.name + '“ ist entfernt.'); }
      };
    }));
}

function render() {
  if (!me) return;
  $('menuBtn').textContent = me.name;
  renderTabs();
  renderList();
  renderDetail();
}

/* ---------- Sheets ---------- */

function openSheet(html, bind) {
  $('overlay').innerHTML = '<div class="ov" id="ov"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
  $('ov').addEventListener('click', (e) => { if (e.target.id === 'ov') closeSheet(); });
  if (bind) bind();
}
function closeSheet() { $('overlay').innerHTML = ''; }

function newCard(idea) {
  const pre = idea ? idea.text : '';
  openSheet('<h2>' + (idea ? 'Thema eröffnen' : 'Neue Karte') + '</h2>' +
    '<div class="field"><span class="label">Name</span><input class="inp" id="nName" maxlength="120" placeholder="z. B. Evelyn" value="' + esc(pre.slice(0, 120)) + '"></div>' +
    (idea ? '<p class="note">Aus der Sammlung von ' + esc(nameOf(idea.createdBy)) + '. Nach dem Anlegen verschwindet der Eintrag dort.</p>' : '') +
    '<div class="field"><span class="label">Thema</span><textarea id="nTopic" placeholder="Worum geht es?">' + esc(pre) + '</textarea></div>' +
    '<div class="acts"><button type="button" class="btn ghost" id="nCancel">Abbrechen</button><button type="button" class="btn" id="nSave">Karte anlegen</button></div>',
  () => {
    $('nCancel').onclick = closeSheet;
    $('nName').focus();
    $('nSave').onclick = async () => {
      const name = $('nName').value.trim();
      if (!name) { $('nName').focus(); return; }
      const topic = $('nTopic').value.trim();
      let id = null;
      const ok = await act($('nSave'), async () => {
        id = await B.addCard({ name, topic });
        if (idea) await B.dropIdea(idea.id);
      });
      if (ok) {
        closeSheet();
        view = { tab: 'offen', q: '', open: id, edit: null };
        $('search').value = '';
        render();
      }
    };
  });
}

function protoHTML(c) {
  let h = '<h1>Protokoll: ' + esc(c.name) + '</h1><div class="sub">FaSt Themenbrett · ' + esc(people()) + ' · erstellt am ' + fmtD(Date.now()) + '</div>';
  if (c.deletedAt) return h + '<p class="p">Thema „' + esc(c.name) + '“ gelöscht von ' + esc(nameOf(c.deletedBy)) + ' am ' + fmtD(c.deletedAt) + '.</p>';
  h += '<h2>Thema</h2><p class="p">' + esc(c.topic || '–') + '</p><h2>Ergebnis</h2>';
  h += c.closedAt
    ? '<div class="res"><b>' + esc(nameOf(c.closedBy)) + ', ' + fmtD(c.closedAt) + '</b>\n' + esc(c.result) + '</div>'
    : '<div class="res" style="border-left-color:#999">noch nicht abgeschlossen</div>';
  h += '<h2>Verlauf</h2><div class="ln">Angelegt von ' + esc(nameOf(c.createdBy)) + ' am ' + fmtDT(c.createdAt) + '</div>';
  c.msgs.forEach((m) => { h += '<div class="ln"><b>' + fmtDT(m.at) + ' · ' + esc(nameOf(m.author)) + (m.editedAt ? ' (bearbeitet)' : '') + '</b>\n' + esc(m.text) + '</div>'; });
  return h;
}

function pickSheet() {
  const rank = (c) => (c.deletedAt ? 2 : c.closedAt ? 0 : 1);
  const L = S.cards.slice().sort((a, b) => rank(a) - rank(b) || b.activityAt - a.activityAt);
  openSheet('<h2>Protokoll zu welchem Thema?</h2><p class="note">Jedes Thema hat sein eigenes Protokoll.</p>' +
    (L.length ? '<div class="list">' + L.map((c) => '<button type="button" class="card" data-pick="' + esc(c.id) + '"><div class="name"><span>' + esc(c.name) + '</span>' +
      (c.deletedAt ? '<span class="note" style="flex:none">gelöscht</span>' : c.closedAt ? '<span class="done-mark">Erledigt</span>' : '<span class="note" style="flex:none">noch offen</span>') + '</div>' +
      '<div class="topic">' + (c.deletedAt ? 'Gelöscht von ' + esc(nameOf(c.deletedBy)) + ' am ' + fmtD(c.deletedAt) : esc(c.topic)) + '</div></button>').join('') + '</div>'
      : '<div class="empty" style="border-radius:12px">Noch keine Karten.</div>') +
    '<div class="acts"><button type="button" class="btn ghost" id="pkClose">Schließen</button></div>',
  () => {
    $('pkClose').onclick = closeSheet;
    document.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => protoSheet(b.dataset.pick); });
  });
}

function protoSheet(cardId) {
  const c = S.cards.find((x) => x.id === cardId);
  if (!c) return;
  openSheet('<h2>Protokoll</h2><div class="paper" id="paper">' + protoHTML(c) + '</div>' +
    '<div class="acts"><button type="button" class="btn ghost" id="pClose">Schließen</button><button type="button" class="btn" id="pSave">Als PDF speichern</button></div>',
  () => {
    $('pClose').onclick = closeSheet;
    $('pSave').onclick = async () => {
      const b = $('pSave');
      b.disabled = true;
      try { await savePdf(c, nameOf, people()); } catch (e) { toast('PDF', e.message || 'Konnte nicht erstellt werden.'); }
      b.disabled = false;
    };
  });
}

/* ---------- Menü ---------- */

async function menuSheet() {
  const pushOn = await B.pushEnabled().catch(() => false);
  const pushLabel = B.mode === 'demo' ? 'erst nach Einrichtung' : !B.pushAvailable() ? 'nicht verfügbar' : pushOn ? 'An' : 'Aus';
  openSheet('<h2>' + esc(me.name) + '</h2>' +
    '<div class="menu">' +
    '<button type="button" id="mPin"><span>PIN ändern</span></button>' +
    '<button type="button" id="mPush"' + (B.mode === 'demo' || !B.pushAvailable() ? ' disabled' : '') + '><span>Benachrichtigungen</span><small>' + pushLabel + '</small></button>' +
    (B.mode === 'demo' ? '<button type="button" id="mReset"><span>Beispiele zurücksetzen</span></button>' : '') +
    '<button type="button" class="danger" id="mOut"><span>Abmelden</span></button>' +
    '</div>' +
    (pushOn || B.mode === 'demo' ? '' : '<p class="note">Mit Benachrichtigungen bekommst du auf diesem Gerät Bescheid, wenn es etwas Neues gibt. Der Hinweis enthält keine Inhalte.</p>') +
    '<div class="acts"><button type="button" class="btn ghost" id="mClose">Schließen</button></div>',
  () => {
    $('mClose').onclick = closeSheet;
    $('mPin').onclick = () => { closeSheet(); changePin(); };
    $('mPush').onclick = async () => {
      const b = $('mPush');
      b.disabled = true;
      try {
        if (pushOn) { await B.disablePush(); toast('Benachrichtigungen', 'Auf diesem Gerät ausgeschaltet.'); }
        else { await B.enablePush(); toast('Benachrichtigungen', 'Auf diesem Gerät eingeschaltet.'); }
        closeSheet();
      } catch (e) { toast('Benachrichtigungen', e.message || 'Hat nicht geklappt.'); b.disabled = false; }
    };
    if ($('mReset')) $('mReset').onclick = async () => { B.resetDemo(); closeSheet(); view = { tab: 'offen', q: '', open: null, edit: null }; $('search').value = ''; await reload(); };
    // Im Demo-Modus bleibt die PIN beim Personenwechsel erhalten
    $('mOut').onclick = () => { closeSheet(); signOut(undefined, B.mode !== 'demo'); };
  });
}

/* ---------- Anmeldung und PIN ---------- */

function gate(html) {
  $('gate').innerHTML = '<div class="lock" role="dialog" aria-modal="true"><div class="lockbox"><div class="brand">FaSt Themenbrett</div>' + html + '</div></div>';
}
function closeGate() { $('gate').innerHTML = ''; document.onkeydown = globalKeys; }

function showApp(on) {
  $('main').hidden = !on;
  $('fab').hidden = !on;
  $('menuBtn').hidden = !on;
  $('demoNote').hidden = !on || B.mode !== 'demo';
}

function loginScreen(msg) {
  showApp(false);
  closeSheet();
  if (B.mode === 'demo') {
    gate('<p class="note">Demo-Modus: Wer bist du?</p><div class="who-pick">' +
      B.demoUsers().map((u) => '<button type="button" class="btn" data-demo="' + esc(u.id) + '">' + esc(u.name) + '</button>').join('') + '</div>' +
      '<p class="note">Die Daten bleiben nur in diesem Browser. Echte Anmeldung, gemeinsame Daten und Benachrichtigungen gibt es nach der Einrichtung.</p>' +
      '<p class="err-note">' + esc(msg || '') + '</p>');
    document.querySelectorAll('[data-demo]').forEach((b) => { b.onclick = async () => { await B.signInDemo(b.dataset.demo); me = await B.currentUser(); afterLogin(); }; });
    return;
  }
  gate('<form id="loginForm" novalidate>' +
    '<input class="inp" id="lEmail" type="email" autocomplete="username" placeholder="E-Mail" aria-label="E-Mail" required>' +
    '<input class="inp" id="lPw" type="password" autocomplete="current-password" placeholder="Passwort" aria-label="Passwort" required>' +
    '<button type="submit" class="btn wide" id="lGo">Anmelden</button></form>' +
    '<p class="err-note" id="lErr">' + esc(msg || '') + '</p>');
  $('lEmail').focus();
  $('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('lEmail').value.trim(), pw = $('lPw').value;
    if (!email || !pw) { $('lErr').textContent = 'Bitte E-Mail und Passwort eingeben.'; return; }
    $('lGo').disabled = true;
    $('lErr').textContent = '';
    try { me = await B.signIn(email, pw); afterLogin(); }
    catch (err) { $('lErr').textContent = err.message; $('lGo').disabled = false; }
  };
}

function afterLogin() {
  if (hasPin(me.id)) unlockApp();
  else pinSetup(() => unlockApp());
}

// Ziffernfeld. onDone(pin, api) wird mit 4 Ziffern aufgerufen; api.error() setzt zurück.
function pinPad({ prompt, extra = '', onDone }) {
  gate('<p class="note" id="pinPrompt">' + esc(prompt) + '</p><div class="pins" id="pins"><i></i><i></i><i></i><i></i></div>' +
    '<div class="pad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => (k === '' ? '<span></span>' : '<button type="button" data-k="' + k + '" aria-label="' + (k === '⌫' ? 'Löschen' : k) + '">' + k + '</button>')).join('') + '</div>' +
    '<p class="err-note" id="pinErr"></p>' + extra);
  let v = '', busy = false;
  const draw = (err) => {
    document.querySelectorAll('#pins i').forEach((d, i) => d.classList.toggle('on', i < v.length));
    $('pins').classList.toggle('err', !!err);
  };
  const api = {
    error(msg) { v = ''; draw(true); $('pinErr').textContent = msg || ''; busy = false; },
    prompt(msg) { v = ''; draw(); $('pinPrompt').textContent = msg; $('pinErr').textContent = ''; busy = false; },
  };
  const press = async (k) => {
    if (busy) return;
    if (k === '⌫') v = v.slice(0, -1);
    else if (v.length < 4) v += k;
    draw();
    if (v.length === 4) { busy = true; await onDone(v, api); }
  };
  document.querySelector('.pad').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); };
  document.onkeydown = (e) => {
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('⌫');
  };
}

function pinSetup(done, { cancel } = {}) {
  const extra = cancel ? '<button type="button" class="linkbtn" id="pinCancel">Abbrechen</button>' : '';
  let first = null;
  pinPad({
    prompt: 'Lege eine 4-stellige PIN für dieses Gerät fest',
    extra,
    onDone: async (pin, api) => {
      if (!first) { first = pin; api.prompt('PIN wiederholen'); return; }
      if (pin !== first) { first = null; api.prompt('Lege eine 4-stellige PIN für dieses Gerät fest'); api.error('Die PINs stimmen nicht überein. Bitte noch einmal.'); return; }
      await setPin(me.id, pin);
      done();
    },
  });
  if (cancel) $('pinCancel').onclick = cancel;
}

function lockScreen() {
  unlocked = false;
  closeSheet();
  pinPad({
    prompt: me.name + ', bitte PIN eingeben',
    extra: '<div id="forgot"><button type="button" class="linkbtn" id="pinForgot">PIN vergessen?</button></div>',
    onDone: async (pin, api) => {
      if (await verifyPin(me.id, pin)) { unlockApp(); return; }
      const left = MAX_FAILS - fails(me.id);
      if (left <= 0) { await signOut('Zu viele falsche Versuche. Bitte neu anmelden.'); return; }
      api.error('Falsche PIN. Noch ' + left + (left === 1 ? ' Versuch.' : ' Versuche.'));
    },
  });
  $('pinForgot').onclick = () => {
    $('forgot').innerHTML = '<p class="note">Dann meldest du dich ab und gibst danach E-Mail und Passwort neu ein.</p><div class="acts" style="justify-content:center"><button type="button" class="btn ghost" id="fNo">Zurück</button><button type="button" class="btn" id="fYes">Abmelden</button></div>';
    $('fNo').onclick = lockScreen;
    $('fYes').onclick = () => signOut();
  };
}

function changePin() {
  pinPad({
    prompt: 'Aktuelle PIN eingeben',
    extra: '<button type="button" class="linkbtn" id="pinCancel">Abbrechen</button>',
    onDone: async (pin, api) => {
      if (await verifyPin(me.id, pin)) {
        pinSetup(() => { closeGate(); toast('PIN geändert', 'Die neue PIN gilt ab sofort auf diesem Gerät.'); }, { cancel: closeGate });
        return;
      }
      const left = MAX_FAILS - fails(me.id);
      if (left <= 0) { await signOut('Zu viele falsche Versuche. Bitte neu anmelden.'); return; }
      api.error('Falsche PIN. Noch ' + left + (left === 1 ? ' Versuch.' : ' Versuche.'));
    },
  });
  $('pinCancel').onclick = closeGate;
}

async function unlockApp() {
  closeGate();
  unlocked = true;
  showApp(true);
  if (!unsubscribe) {
    await reload();
    unsubscribe = B.subscribe(reloadSoon);
    if (B.refreshPush) B.refreshPush().catch(() => { /* nicht schlimm */ });
  } else {
    reloadSoon();
  }
}

async function signOut(msg, forgetPin = true) {
  const uid = me && me.id;
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  try { await B.signOut(); } catch (e) { /* lokal trotzdem abmelden */ }
  if (uid && forgetPin) clearPin(uid);
  me = null;
  unlocked = false;
  S = { profiles: {}, cards: [], ideas: [], reads: {} };
  view = { tab: 'offen', q: '', open: null, edit: null };
  $('search').value = '';
  $('list').innerHTML = '';
  $('detail').innerHTML = '';
  loginScreen(msg);
}

/* ---------- Ereignisse ---------- */

function globalKeys(e) {
  if (e.key !== 'Escape' || !unlocked) return;
  if ($('overlay').innerHTML) closeSheet();
  else if (view.edit) { view.edit = null; render(); }
  else if (view.open) { view.open = null; render(); }
}

$('tabs').onclick = (e) => {
  if (e.target.closest('[data-proto]')) { pickSheet(); return; }
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  if (view.tab === 'sammlung' && b.dataset.tab !== 'sammlung') ls.set(ideasSeenKey(), String(Date.now()));
  if (b.dataset.tab === 'sammlung' && view.tab !== 'sammlung') { ideasSeenShown = ideasSeen(); ls.set(ideasSeenKey(), String(Date.now())); }
  view.tab = b.dataset.tab; view.open = null; view.edit = null;
  render();
};
$('search').oninput = (e) => { view.q = e.target.value; renderList(); };
$('list').onclick = (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  view.open = b.dataset.id; view.edit = null;
  render();
};
$('fab').onclick = () => newCard();
$('menuBtn').onclick = menuSheet;
document.onkeydown = globalKeys;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenSince = Date.now();
    if (view.tab === 'sammlung' && me) ls.set(ideasSeenKey(), String(Date.now()));
    return;
  }
  if (!me || !unlocked) return;
  if (hiddenSince && Date.now() - hiddenSince > LOCK_AFTER_MS) lockScreen();
  else reloadSoon();
});
const netState = () => { $('offline').hidden = navigator.onLine !== false || B.mode === 'demo'; };
window.addEventListener('online', () => { netState(); if (unlocked) reloadSoon(); });
window.addEventListener('offline', netState);

/* ---------- Start ---------- */

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* z. B. in einer Vorschau nicht erlaubt */ });
}

(async function boot() {
  netState();
  try {
    await B.init();
    me = await B.currentUser();
  } catch (e) {
    me = null;
    if (/Verbindung|laden/i.test(e.message || '')) {
      gate('<p class="err-note">' + esc(e.message) + '</p><button type="button" class="btn" id="retry">Erneut versuchen</button>');
      $('retry').onclick = () => location.reload();
    } else {
      loginScreen(e.message);
    }
    return;
  }
  if (!me) { loginScreen(); return; }
  if (hasPin(me.id)) lockScreen();
  else pinSetup(() => unlockApp());
})();
