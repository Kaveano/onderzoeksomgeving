// Opmaak van getallen en datums in het Nederlands, voor rapporten, het Overzicht, de werkbank en exports.
// Zuivere module (geen DOM, geen fetch), dus ook bruikbaar in de Worker en in de tests.
// Modules die opmaak nodig hebben, importeren die hiervandaan (niet uit rapport-feiten.js),
// zodat er geen kringverwijzingen ontstaan.

const MIN = '−';

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);

/** 3,2 · −0,4 · 1.234,5 (echt minteken, nooit "−0,0"); '–' als er geen getal is. */
export function nlGetal(x, decimalen = 1) {
  if (!eindig(x)) return '–';
  const t = x.toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
  // Een echt minteken (−) in plaats van een streepje; en geen "−0,0".
  return /^-0(,0+)?$/.test(t) ? t.slice(1) : t.replace(/^-/, MIN);
}

/** Afgerond percentage: 48% (het getal is al een percentage, dus 48 en niet 0,48). */
export function nlProcent(x) {
  return eindig(x) ? `${Math.round(x)}%` : '–';
}

/** Verschil met teken: +0,4 · −0,2 · 0,0 */
export function metTeken(x, decimalen = 1) {
  if (!eindig(x)) return '–';
  const afgerond = Number(x.toFixed(decimalen));
  if (afgerond === 0) return nlGetal(0, decimalen);
  return `${afgerond > 0 ? '+' : MIN}${nlGetal(Math.abs(afgerond), decimalen)}`;
}

/** p = 0,036 · p < 0,001 */
export function pTekst(p) {
  if (!eindig(p)) return 'p onbekend';
  return p < 0.001 ? 'p < 0,001' : `p = ${nlGetal(p, 3)}`;
}

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/** '2026-11-26' wordt '26 november 2026'. */
export function nlDatum(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return `${Number(m[3])} ${MAANDEN[Number(m[2]) - 1] || ''} ${m[1]}`;
}
