// PDF-Protokoll für genau eine Karte. Schlicht schwarz-weiß, A4, mit Seitenumbruch.
import { fmtD, fmtDT, isoDay } from './util.js';

const JSPDF_SRC = 'vendor/jspdf-4.2.1.umd.min.js';
let loading = null;

function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSPDF_SRC;
      s.onload = () => resolve(window.jspdf);
      s.onerror = () => { loading = null; reject(new Error('PDF-Modul konnte nicht geladen werden.')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

// Die eingebaute PDF-Schrift kennt nur westeuropäische Zeichen (Windows-1252).
// Umlaute, ß, € und deutsche Anführungszeichen gehen, Emojis werden ersetzt.
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function clean(s) {
  return Array.from(String(s ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    '))
    .map((ch) => {
      const c = ch.codePointAt(0);
      if (ch === '\n') return ch;
      if ((c >= 0x20 && c < 0x7f) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch)) return ch;
      if (c === 0x2212) return '-';
      if (c === 0x2009 || c === 0x202f || c === 0x200b) return ' ';
      return c < 0x20 ? '' : '?';
    })
    .join('');
}

export function pdfFileName(name, now = Date.now()) {
  const base = String(name || 'Karte')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    .slice(0, 60) || 'Karte';
  return 'Protokoll_' + base + '_' + isoDay(now) + '.pdf';
}

// card: normalisierte Karte, nameOf: id -> Anzeigename, people: z. B. "Alex und Matthias"
export async function buildPdf(card, nameOf, people) {
  const { jsPDF } = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 20, CW = W - 2 * M, BOTTOM = H - 18;
  let y = M;

  const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
  const text = (s, { size = 10.5, bold = false, gray = 0, gap = 0, indent = 0, lh = 1.35 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(gray);
    const lineH = size * 0.3528 * lh;
    const lines = doc.splitTextToSize(clean(s), CW - indent);
    lines.forEach((ln) => { ensure(lineH); doc.text(ln, M + indent, y + size * 0.3528); y += lineH; });
    y += gap;
  };
  const rule = () => { ensure(4); doc.setDrawColor(160); doc.setLineWidth(0.2); doc.line(M, y, W - M, y); y += 5; };

  text('Protokoll: ' + card.name, { size: 17, bold: true, gap: 1 });
  text('FaSt Themenbrett · ' + people + ' · erstellt am ' + fmtD(Date.now()), { size: 9, gray: 90, gap: 2 });
  rule();

  if (card.deletedAt) {
    text('Thema „' + card.name + '“ gelöscht von ' + nameOf(card.deletedBy) + ' am ' + fmtD(card.deletedAt) + '.', { gap: 2 });
  } else {
    text('Thema', { size: 12, bold: true, gap: 1 });
    text(card.topic || '–', { gap: 4 });
    text('Ergebnis', { size: 12, bold: true, gap: 1 });
    if (card.closedAt) {
      text('festgehalten von ' + nameOf(card.closedBy) + ' am ' + fmtD(card.closedAt), { size: 9, gray: 90, gap: 1 });
      text(card.result || '–', { gap: 4 });
    } else {
      text('noch nicht abgeschlossen', { gap: 4 });
    }
    text('Verlauf', { size: 12, bold: true, gap: 1 });
    text('Angelegt von ' + nameOf(card.createdBy) + ' am ' + fmtDT(card.createdAt), { size: 9, gray: 90, gap: 2 });
    if (!card.msgs.length) text('Keine Nachrichten.', { gap: 2 });
    card.msgs.forEach((m) => {
      ensure(12);
      text(fmtDT(m.at) + ' · ' + nameOf(m.author) + (m.editedAt ? ' (bearbeitet)' : ''), { size: 9, bold: true, gray: 60, gap: 0.5 });
      text(m.text, { gap: 3 });
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(doc.splitTextToSize(clean('Protokoll: ' + card.name), CW - 30)[0], M, H - 10);
    doc.text('Seite ' + i + ' von ' + pages, W - M, H - 10, { align: 'right' });
  }
  return doc;
}

export async function savePdf(card, nameOf, people) {
  const doc = await buildPdf(card, nameOf, people);
  doc.save(pdfFileName(card.name));
}
