// Kleine Hilfsfunktionen für Datum und sichere Textausgabe

export const p2 = (n) => String(n).padStart(2, '0');
export const fmtD = (t) => { const d = new Date(t); return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear(); };
export const fmtT = (t) => { const d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
export const fmtDT = (t) => fmtD(t) + ', ' + fmtT(t);
export const isoDay = (t) => { const d = new Date(t); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
export const short = (t) => {
  const d = new Date(t), n = new Date();
  return d.toDateString() === n.toDateString() ? fmtT(t) : p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.';
};
// Jeder Nutzertext läuft vor der Anzeige hier durch
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
