// Werkbank: het uitvoermodel (D2 §8.1, BOUWPLAN §3.7). Zuivere module, geen DOM.
// Een Uitvoer is het resultaat van één analyse: tabellen, meldingen, de uitleg ("Wat betekent dit?") en de zin in
// APA-stijl. Elk getal in een tabel is een ruw getal met een soort; de opmaak (decimalen, komma, ×) gebeurt in
// uitvoer-tekst.js. Een Uitvoer is al beschermd (privacyregels toegepast): veilig om te tonen, te exporteren, in
// een stuk te zetten of in een rapport vast te leggen.
//
// Uitvoer = { versie: 1, id, procedure, titel, gegevens: { bron, selectie, n, datum, open, instellingen },
//             onderdelen: [tabel | melding | grafiek], duiding: { zinnen, significant, effect },
//             apa: { rapport, apa } | null, methoden: string[], toetsen: number, kleinste_n: number|null, spec }
// tabel   = { soort: 'tabel', id, titel, kop: [{ tekst, uitlijning }], rijen: [[Cel]], voetnoten: [tekst], uitleg?,
//             weergave?: 'matrix', paren?: [...] }
// melding = { soort: 'melding', niveau: 'privacy'|'waarschuwing'|'info'|'fout', tekst }
// grafiek = { soort: 'grafiek', vorm: 'staaf', titel, reeksen: [{ label, waarde: number|null }] }
// Cel     = { w: number|null, soort: 'aantal'|'procent'|'gem'|'stat'|'p'|'r'|'df'|'coef'|'verwacht'|'tekst',
//             t?: tekst, verborgen?: true, ster?: '*'|'**', nadruk?: true }

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
let teller = 0;

export function maakUitvoer({ procedure, titel, gegevens, spec = null }) {
  teller += 1;
  return {
    versie: 1,
    id: `u-${Date.now().toString(36)}-${teller}`,
    procedure,
    titel,
    gegevens: { bron: '', selectie: null, n: null, datum: '', open: false, instellingen: '', ...gegevens },
    onderdelen: [],
    duiding: { zinnen: [], significant: null, effect: null },
    apa: null,
    methoden: [],
    toetsen: 0,
    kleinste_n: null,
    spec,
  };
}

/** Een getal met een soort; NaN, Infinity en undefined worden null ("–"). */
export const cel = (w, soort = 'stat', extra = {}) => ({ w: eindig(w) ? w : null, soort, ...extra });
/** Een tekstcel. */
export const tekstCel = (t, extra = {}) => ({ w: null, soort: 'tekst', t: String(t ?? ''), ...extra });
/** Een verborgen cel (getoond als ×). */
export const verborgenCel = (soort = 'aantal') => ({ w: null, soort, verborgen: true });
/** Een aantal, of verborgen. */
export const aantalCel = (n, verborgen = false) => (verborgen ? verborgenCel('aantal') : cel(n, 'aantal'));

/** Kolomkop: tekst links of rechts uitgelijnd (de eerste kolom links, de rest rechts). */
export function kop(...teksten) {
  return teksten.map((t, i) => (typeof t === 'object' ? t : { tekst: t, uitlijning: i === 0 ? 'links' : 'rechts' }));
}

export function tabel(id, titel, kolommen, rijen, { voetnoten = [], uitleg = null, ...rest } = {}) {
  return { soort: 'tabel', id, titel, kop: kop(...kolommen), rijen, voetnoten: voetnoten.filter(Boolean), ...(uitleg ? { uitleg } : {}), ...rest };
}

export function melding(niveau, tekst) {
  return { soort: 'melding', niveau, tekst };
}

/** Voegt onderdelen toe (null en false worden overgeslagen). */
export function voeg(u, ...onderdelen) {
  for (const o of onderdelen.flat()) if (o) u.onderdelen.push(o);
  return u;
}

export function methode(u, ...sleutels) {
  for (const s of sleutels) if (s && !u.methoden.includes(s)) u.methoden.push(s);
}

/** Is er iets verborgen in deze uitvoer? */
export function ietsVerborgen(u) {
  return u.onderdelen.some((o) => o.soort === 'tabel' && o.rijen.some((rij) => rij.some((c) => c && c.verborgen)));
}

/**
 * Rondt een uitvoer af: kleinste_n = het kleinste getoonde positieve aantal (cellen van soort 'aantal') of de n van
 * de analyse. Alleen soort 'aantal' telt: gebruik die soort uitsluitend voor aantallen mensen.
 */
export function sluitAf(u) {
  let kleinste = eindig(u.gegevens.n) && u.gegevens.n > 0 ? u.gegevens.n : null;
  for (const o of u.onderdelen) {
    if (o.soort !== 'tabel') continue;
    for (const rij of o.rijen) {
      for (const c of rij) {
        if (!c || c.verborgen || c.soort !== 'aantal' || !eindig(c.w) || c.w <= 0) continue;
        if (kleinste === null || c.w < kleinste) kleinste = c.w;
      }
    }
  }
  u.kleinste_n = kleinste;
  return u;
}

/** Een uitvoer met alleen een melding (de analyse kon niet of mocht niet). */
export function geweigerd(basis, niveau, tekst) {
  const u = maakUitvoer(basis);
  u.geweigerd = true;
  voeg(u, melding(niveau, tekst));
  return sluitAf(u);
}
