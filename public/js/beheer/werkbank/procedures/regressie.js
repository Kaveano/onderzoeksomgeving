// Werkbank: lineaire regressie (D2 §5.2, §6.3). Zuivere module, geen DOM.
// - ols(X, y): kleinste kwadraten met constante (QR uit matrix.js), met B, SE, t, p, 95%-BI, β (gestandaardiseerd,
//   ook voor dummy's, zoals SPSS), tolerantie en VIF, R², F en de gestandaardiseerde residuen;
// - waldF / fVerandering: een voorspeller met groepen als geheel, en de R²-verandering van een tweede blok;
// - ontwerp(...): de voorspellers als kolommen, met de privacyregels (gedeeld met logistisch.js): een indeling wordt
//   dummy's, met kleine groepen in de steekproef samengevoegd (regel A) en regel D voor de groepen; getallen met
//   twee waarden (B6), indelingen als getal (B26) en scores met weggevallen respondenten (B7) doen niet mee;
// - regressie(ds, spec, ctx): de analyse zelf. Geen residuen of voorspelde waarden per persoon (regel G); het aantal
//   residuen groter dan 3 SD is verborgen als het 1 tot 4 is.

import { isGetal, isIndeling } from '../dataset.js';
import { tCdf, tKwantiel, fSf, momenten } from '../../statistiek.js';
import { kleinsteKwadraten, inverseSpd, correlatieMatrix } from '../matrix.js';
import { tweeWaardenRegel, weggevallenRegel } from '../privacy-selectie.js';
import { tabel, cel, tekstCel, aantalCel, voeg, melding, sluitAf, methode } from '../uitvoer.js';
import {
  P_TE_WEINIG, P_SAMENGEVOEGD, P_WEGGEVALLEN, P_LOGIT_CEL, P_AFHANKELIJK, P_WEINIG_RESPONDENTEN_MODEL, P_VIF, LET_OP_VERBAND,
  uitlegRegressie, g, apaZinnen,
} from '../uitvoer-tekst.js';
import {
  geldigMasker, inSelectie, iedereen, tel, groepVanRijen, selectieControle, begin, weiger, overlapFout, ordinaalMelding, variabelenUit,
  indelingAlsGetalFout, getalFout,
} from './basis.js';
import { voegKleineSamen, herindeel, randenMetBuren } from './kruistabel.js';
import { vorm } from './beschrijven.js';

const ALFA = 0.05;
const MAX_KOLOMMEN = 40;
const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
const geenNaN = (x) => (eindig(x) ? x : null);

// ---------- Rekenen ----------

/**
 * Lineaire regressie met constante. X: n rijen met p voorspellers (zonder constante), y: n waarden.
 * @returns null (niet te berekenen) | { afhankelijk: j } (kolom j van X is te voorspellen uit de andere of constant)
 *   | { n, k (aantal voorspellers), dfRes, beta [constante, …], se, t, p, ciLaag, ciHoog, bStd [per voorspeller], vif, tolerantie,
 *       r, r2, r2adj, seSchatting, f, pF, ssReg, ssRes, ssTot, cov, residuen: { gemiddelde, sd, scheef, kurtosis, boven3 } }
 */
export function ols(X, y) {
  if (!Array.isArray(X) || !(Array.isArray(y) || ArrayBuffer.isView(y))) return null;
  const n = y.length;
  if (!n || X.length !== n) return null;
  const k = X[0]?.length ?? 0;
  if (!X.every((r) => r && r.length === k && Array.from(r).every(eindig)) || !Array.from(y).every(eindig)) return null;
  if (n < k + 2) return null;
  const f = kleinsteKwadraten(X.map((r) => [1, ...r]), Array.from(y));
  if (!f) return null;
  if (f.afhankelijk !== undefined) return f.afhankelijk === 0 ? null : { afhankelijk: f.afhankelijk - 1 };
  const dfRes = n - k - 1;
  const my = momenten(y);
  const ssTot = my.ss;
  if (!(ssTot > 0)) return null;
  const e = new Float64Array(n);
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    let v = f.beta[0];
    for (let j = 0; j < k; j++) v += f.beta[j + 1] * X[i][j];
    e[i] = y[i] - v;
    ssRes += e[i] * e[i];
  }
  const s2 = ssRes / dfRes;
  const kritiek = tKwantiel(0.975, dfRes);
  const se = f.beta.map((_, j) => Math.sqrt(Math.max(0, s2 * f.inverseXtX[j][j])));
  const t = f.beta.map((b, j) => (se[j] > 0 ? b / se[j] : null));
  const p = t.map((x) => (eindig(x) ? Math.min(1, 2 * tCdf(-Math.abs(x), dfRes)) : null));
  const sdY = Math.sqrt(ssTot / (n - 1));
  const sdX = Array.from({ length: k }, (_, j) => Math.sqrt(momenten(X.map((r) => r[j])).ss / (n - 1)));
  const bStd = sdX.map((s, j) => geenNaN((f.beta[j + 1] * s) / sdY));
  let vif = k === 1 ? [1] : null;
  if (k > 1) {
    const R = correlatieMatrix(X);
    const inv = R ? inverseSpd(R) : null;
    vif = Array.from({ length: k }, (_, j) => (inv && inv[j][j] >= 1 - 1e-12 ? inv[j][j] : null));
  }
  const ssReg = Math.max(0, ssTot - ssRes);
  const r2 = Math.max(0, Math.min(1, 1 - ssRes / ssTot));
  const fWaarde = k > 0 && ssRes > 0 ? (ssReg / k) / s2 : null;
  const z = Array.from(e, (x) => (s2 > 0 ? x / Math.sqrt(s2) : 0));
  const mz = momenten(z);
  const vz = vorm(z);
  const uit = {
    n, k, dfRes,
    beta: Array.from(f.beta), se, t, p,
    ciLaag: f.beta.map((b, j) => geenNaN(b - kritiek * se[j])),
    ciHoog: f.beta.map((b, j) => geenNaN(b + kritiek * se[j])),
    bStd, vif, tolerantie: vif.map((x) => (eindig(x) && x > 0 ? 1 / x : null)),
    r: Math.sqrt(r2), r2, r2adj: 1 - ((1 - r2) * (n - 1)) / dfRes, seSchatting: Math.sqrt(s2),
    f: geenNaN(fWaarde), pF: eindig(fWaarde) ? fSf(fWaarde, k, dfRes) : null,
    ssReg, ssRes, ssTot,
    cov: f.inverseXtX.map((rij) => Array.from(rij, (x) => x * s2)),
    residuen: { gemiddelde: mz.m, sd: n > 1 ? Math.sqrt(mz.ss / (n - 1)) : null, scheef: vz.scheef, kurtosis: vz.kurtosis, boven3: z.filter((x) => Math.abs(x) > 3).length },
  };
  for (const s of ['r', 'r2adj', 'seSchatting']) uit[s] = geenNaN(uit[s]);
  return uit;
}

/** Toets of een groep kolommen (de dummy's van één voorspeller) samen iets toevoegt: F = βᵀ Cov⁻¹ β / q. */
export function waldF(fit, kolommen) {
  if (!fit?.cov || !kolommen.length) return null;
  const idx = kolommen.map((j) => j + 1);
  const b = idx.map((i) => fit.beta[i]);
  const C = idx.map((i) => idx.map((j) => fit.cov[i][j]));
  const inv = inverseSpd(C);
  if (!inv) return null;
  let w = 0;
  for (let i = 0; i < b.length; i++) for (let j = 0; j < b.length; j++) w += b[i] * inv[i][j] * b[j];
  const q = b.length;
  const f = w / q;
  return eindig(f) ? { f, df1: q, df2: fit.dfRes, p: fSf(f, q, fit.dfRes) } : null;
}

/** R²-verandering van model 1 (kleiner) naar model 2 (met een extra blok), op dezelfde respondenten. */
export function fVerandering(fit1, fit2) {
  if (!fit1 || !fit2 || !(fit2.k > fit1.k)) return null;
  const m = fit2.k - fit1.k;
  const verandering = fit2.r2 - fit1.r2;
  const f = (verandering / m) / ((1 - fit2.r2) / fit2.dfRes);
  return eindig(f) ? { r2Verandering: verandering, f: Math.max(0, f), df1: m, df2: fit2.dfRes, p: fSf(Math.max(0, f), m, fit2.dfRes) } : null;
}

// ---------- Voorspellers klaarzetten (gedeeld met de logistische regressie) ----------

/** Gebruikt de analyse deze voorspeller als indeling (dummy's) of als getal? */
export function soortVoorspeller(v) {
  if (isIndeling(v) && (v.meetniveau === 'nominaal' || v.groepering)) return 'groep';
  if (isGetal(v)) return 'getal';
  return null;
}

/** Aantal verschillende waarden in de basis (stopt bij 3). */
function verschillend(v, basis) {
  const gezien = [];
  for (let r = 0; r < basis.length; r++) {
    if (!basis[r] || gezien.includes(v.waarden[r])) continue;
    gezien.push(v.waarden[r]);
    if (gezien.length > 2) break;
  }
  return gezien;
}

/**
 * Zet de voorspellers klaar voor regressie of logistische regressie.
 * uitkomst: de variabele die voorspeld wordt (of null), uitkomstGeldig: extra masker (logistisch: rij heeft een groep
 * van de uitkomst); blokken: [[{ id, v }], …]; referentie: 'grootste' | 'eerste' | 'laatste'.
 * @returns {{ fout, niveau } | { basis, geldig, n, rijen: number[], X: number[][], kolommen: [{ label, voorspeller, blok }],
 *            voorspellers: [{ v, soort, blok, kolommen: number[], groep?, groepen?, aantallen?, referentie? }], meldingen }}
 */
export function ontwerp(ds, ctx, { uitkomst = null, uitkomstGeldig = null, blokken, referentie = 'grootste' }) {
  const lijst = [];
  const gezien = new Set();
  for (const [b, blok] of blokken.entries()) {
    for (const { id, v } of blok) {
      if (!v) return { fout: `Deze analyse gebruikt een variabele die niet meer bestaat: “${id}”. Pas de analyse aan of verwijder hem.`, niveau: 'fout' };
      if (gezien.has(v.id)) return { fout: `“${v.label}” staat twee keer bij de voorspellers.`, niveau: 'fout' };
      if (uitkomst && v.id === uitkomst.id) return { fout: `“${v.label}” is de uitkomst en kan dus geen voorspeller zijn.`, niveau: 'fout' };
      gezien.add(v.id);
      const soort = soortVoorspeller(v);
      if (!soort) return { fout: `“${v.label}” is niet als voorspeller te gebruiken: kies een getal of een indeling met vaste groepen.`, niveau: 'fout' };
      lijst.push({ v, soort, blok: b });
    }
  }
  if (!lijst.length) return { fout: 'Kies minstens één voorspeller.', niveau: 'fout' };
  const overlap = overlapFout(ds, ctx, lijst.filter((x) => x.soort === 'groep').map((x) => x.v));
  if (overlap) return { fout: overlap, niveau: 'privacy' };
  // Wie meedoet: een geldige uitkomst en een geldige waarde (of groep) op elke voorspeller (lijstgewijs, zoals SPSS).
  const geldig = geldigMasker(ds, [...(uitkomst ? [uitkomst] : []), ...lijst.map((x) => x.v)]);
  if (uitkomstGeldig) for (let r = 0; r < ds.n; r++) if (!uitkomstGeldig[r]) geldig[r] = 0;
  for (const x of lijst) {
    if (x.soort !== 'groep') continue;
    x.groep = groepVanRijen(ds, x.v);
    for (let r = 0; r < ds.n; r++) if (x.groep[r] < 0) geldig[r] = 0;
  }
  const sel = selectieControle(ctx, geldig);
  if (sel) return { fout: sel, niveau: 'privacy' };
  const basis = inSelectie(geldig, ctx.selectie);
  const meldingen = [];
  const mee = [];
  for (const x of lijst) {
    const { v } = x;
    if (x.soort === 'getal') {
      const alsGetal = indelingAlsGetalFout(v, basis, ctx.d);
      if (alsGetal) { meldingen.push(melding('privacy', alsGetal)); continue; }
      if (v.score && weggevallenRegel(v.reden, ctx.selectie ? ctx.selectie.F : iedereen(ds), null, 1, ctx.d)[0]) {
        meldingen.push(melding('privacy', `“${v.label}”: ${P_WEGGEVALLEN}.`));
        continue;
      }
      const w = verschillend(v, basis);
      if (w.length < 2) { meldingen.push(melding('waarschuwing', `“${v.label}” heeft bij iedereen dezelfde waarde en doet daarom niet mee.`)); continue; }
      if (w.length === 2) {
        if (tweeWaardenRegel(v.waarden, basis, null, 1, ctx.d, ctx.selectie)?.[0]) {
          meldingen.push(melding('privacy', `“${v.label}” heeft maar twee waarden en een daarvan komt bij minder dan ${ctx.d} mensen voor. Daarom doet hij niet mee.`));
          continue;
        }
        x.tweeWaarden = w.sort((a, b) => a - b);
      }
      mee.push(x);
      continue;
    }
    // Een indeling: kleine groepen in de steekproef samenvoegen (regel A), daarna regel D voor de groepen.
    const groepen = v.beschermd.groepen;
    const t = new Array(groepen.length).fill(0);
    for (let r = 0; r < ds.n; r++) if (basis[r]) t[x.groep[r]]++;
    const s = voegKleineSamen(t, groepen, ctx.d);
    let groep = s.bruikbaar ? herindeel(x.groep, s.naar) : null;
    let gr = s.groepen;
    if (groep) {
      const d = randenMetBuren(ctx, geldig, groep, gr);
      if (d) { groep = d.groep; gr = d.groepen; } else groep = null;
    }
    if (!groep) {
      meldingen.push(melding('privacy', `“${v.label}” doet niet mee: er blijven geen twee groepen van minstens ${ctx.d} respondenten over.`));
      continue;
    }
    const aantallen = new Array(gr.length).fill(0);
    for (let r = 0; r < ds.n; r++) if (basis[r]) aantallen[groep[r]]++;
    for (const gg of gr.filter((y) => y.samengevoegd)) meldingen.push(melding('privacy', `${v.label}: ${P_SAMENGEVOEGD(gg.labels)}`));
    let ref = 0;
    if (referentie === 'laatste') ref = gr.length - 1;
    else if (referentie !== 'eerste') aantallen.forEach((a, i) => { if (a > aantallen[ref]) ref = i; });
    Object.assign(x, { groep, groepen: gr, aantallen, referentie: ref });
    mee.push(x);
  }
  // De kolommen van de ontwerpmatrix: per getal één kolom, per indeling een kolom voor elke groep behalve de referentie.
  const kolommen = [];
  for (const [i, x] of mee.entries()) {
    x.kolommen = [];
    if (x.soort === 'getal') {
      x.kolommen.push(kolommen.length);
      kolommen.push({ label: x.v.label, voorspeller: i, blok: x.blok });
    } else {
      x.groepen.forEach((gr, k) => {
        if (k === x.referentie) return;
        x.kolommen.push(kolommen.length);
        kolommen.push({ label: `${x.v.label}: ${gr.label}`, voorspeller: i, blok: x.blok, groep: k });
      });
    }
  }
  const rijen = [];
  for (let r = 0; r < ds.n; r++) if (basis[r]) rijen.push(r);
  const X = rijen.map((r) => {
    const rij = new Array(kolommen.length);
    for (const x of mee) {
      if (x.soort === 'getal') rij[x.kolommen[0]] = x.v.waarden[r];
      else {
        let c = 0;
        x.groepen.forEach((_, k) => {
          if (k === x.referentie) return;
          rij[x.kolommen[c++]] = x.groep[r] === k ? 1 : 0;
        });
      }
    }
    return rij;
  });
  return { basis, geldig, n: rijen.length, rijen, X, kolommen, voorspellers: mee, meldingen };
}

/** Alleen deze kolommen van de ontwerpmatrix. */
export const kolommenUit = (X, welke) => X.map((rij) => welke.map((j) => rij[j]));

/** De tabel met de groepen van de voorspellers die indelingen zijn (alle groepen hebben minstens d respondenten). */
export function groepenTabel(o) {
  const rijen = [];
  const samenstelling = [];
  for (const x of o.voorspellers.filter((y) => y.soort === 'groep')) {
    x.groepen.forEach((gr, k) => {
      rijen.push([tekstCel(k === 0 ? x.v.label : ''), tekstCel(gr.label), cel(x.aantallen[k], 'aantal'), tekstCel(k === x.referentie ? 'referentiegroep' : 'apart in het model')]);
      samenstelling.push({ voorspeller: x.v.id, labels: gr.labels });
    });
  }
  return rijen.length ? tabel('groepen', 'Voorspellers met groepen', ['Voorspeller', 'Groep', 'N', 'Rol'], rijen,
    { voetnoten: ['Elke groep wordt vergeleken met de referentiegroep van dezelfde voorspeller.'], samenstelling }) : null;
}

/**
 * Past het model aan zolang er een kolom te voorspellen is uit de andere (die gaat eruit, met een melding).
 * fit(Xdeel) → fit | { afhankelijk } | null. Geeft { fit, kolommen, meldingen } of null.
 */
export function pasAanZonderAfhankelijke(o, welke, fit) {
  const kolommen = [...welke];
  const meldingen = [];
  for (let poging = 0; poging <= welke.length; poging++) {
    if (!kolommen.length) return { fit: null, kolommen, meldingen };
    const f = fit(kolommenUit(o.X, kolommen));
    if (!f || f.afhankelijk === undefined) return { fit: f, kolommen, meldingen };
    meldingen.push(melding('waarschuwing', P_AFHANKELIJK(o.kolommen[kolommen[f.afhankelijk]].label)));
    kolommen.splice(f.afhankelijk, 1);
  }
  return { fit: null, kolommen, meldingen };
}

// ---------- De analyse ----------

const biTekst = (a, b) => (eindig(a) && eindig(b) ? `${g(a, 3)} tot ${g(b, 3)}` : '–');

function coefficientenTabel(id, titel, o, kolommen, f) {
  const rijen = [[tekstCel('(Constante)'), cel(f.beta[0], 'coef'), cel(f.se[0], 'coef'), tekstCel(''), cel(f.t[0], 'stat'), cel(f.p[0], 'p'), tekstCel(biTekst(f.ciLaag[0], f.ciHoog[0])), tekstCel(''), tekstCel('')]];
  kolommen.forEach((k, j) => {
    rijen.push([tekstCel(o.kolommen[k].label), cel(f.beta[j + 1], 'coef'), cel(f.se[j + 1], 'coef'), cel(f.bStd[j], 'r'), cel(f.t[j + 1], 'stat'), cel(f.p[j + 1], 'p'),
      tekstCel(biTekst(f.ciLaag[j + 1], f.ciHoog[j + 1])), cel(f.tolerantie[j], 'r'), cel(f.vif[j], 'stat')]);
  });
  const ref = o.voorspellers.filter((x) => x.soort === 'groep' && x.kolommen.some((k) => kolommen.includes(k)));
  return tabel(id, titel, ['Voorspeller', 'B', 'SE', 'β', 't', 'p', '95%-BI van B', 'Tolerantie', 'VIF'], rijen, {
    voetnoten: [
      'β = gestandaardiseerde coëfficiënt: maakt de voorspellers onderling vergelijkbaar.',
      ...ref.map((x) => `Referentiegroep van “${x.v.label}”: “${x.groepen[x.referentie].label}”.`),
    ],
  });
}

function geheelTabel(id, o, kolommen, f) {
  const rijen = [];
  for (const x of o.voorspellers) {
    if (x.soort !== 'groep') continue;
    const welke = x.kolommen.map((k) => kolommen.indexOf(k)).filter((j) => j >= 0);
    if (welke.length < 2) continue;
    const w = waldF(f, welke);
    rijen.push([tekstCel(`“${x.v.label}” als geheel`), cel(w?.f, 'stat'), cel(w?.df1, 'df'), cel(w?.df2, 'df'), cel(w?.p, 'p')]);
  }
  return rijen.length ? tabel(id, 'Voorspellers met meer dan twee groepen, als geheel', ['Voorspeller', 'F', 'df1', 'df2', 'p'], rijen,
    { voetnoten: ['Deze toets kijkt of de groepen van de voorspeller samen iets toevoegen aan het model.'] }) : null;
}

export async function regressie(ds, spec, ctx) {
  const titel = 'Lineaire regressie';
  const [{ id: yId, v: y } = {}] = variabelenUit(ds, spec, 'afhankelijk');
  const blok1 = variabelenUit(ds, spec, 'voorspellers');
  const blok2 = variabelenUit(ds, spec, 'blok2');
  const naam = (lijst) => lijst.map((x) => x.v?.label || x.id).join(', ');
  const u = begin(ds, spec, ctx, titel, `Score: ${y?.label || yId}; voorspellers: ${naam(blok1)}${blok2.length ? `; tweede blok: ${naam(blok2)}` : ''}`);
  const fout = getalFout(y);
  if (fout) return weiger(ds, spec, ctx, titel, 'fout', fout);
  const o = ontwerp(ds, ctx, { uitkomst: y, blokken: [blok1, blok2], referentie: spec.opties?.referentie || 'grootste' });
  if (o.fout) return weiger(ds, spec, ctx, titel, o.niveau, o.fout);
  await ctx.pauze();
  // De uitkomst: als getal te gebruiken (B26), geen weggevallen respondenten (B7), en bij twee waarden de
  // kruistabelregel per groep van elke voorspeller (B6): dan is een B een verschil in percentages.
  const alsGetal = indelingAlsGetalFout(y, o.basis, ctx.d);
  if (alsGetal) return weiger(ds, spec, ctx, titel, 'privacy', alsGetal);
  if (y.score && weggevallenRegel(y.reden, ctx.selectie ? ctx.selectie.F : iedereen(ds), null, 1, ctx.d)[0]) return weiger(ds, spec, ctx, titel, 'privacy', `“${y.label}”: ${P_WEGGEVALLEN}.`);
  const yWaarden = verschillend(y, o.basis);
  if (yWaarden.length < 2) return weiger(ds, spec, ctx, titel, 'fout', `“${y.label}” heeft bij iedereen dezelfde waarde; dan is er niets te voorspellen.`);
  if (yWaarden.length === 2) {
    if (tweeWaardenRegel(y.waarden, o.basis, null, 1, ctx.d, ctx.selectie)?.[0]) {
      return weiger(ds, spec, ctx, titel, 'privacy', `“${y.label}” heeft maar twee waarden en een daarvan komt bij minder dan ${ctx.d} mensen voor.`);
    }
    for (const x of o.voorspellers) {
      let groep = x.groep;
      let ng = x.groepen?.length;
      if (x.tweeWaarden) {
        groep = Int32Array.from(x.v.waarden, (w, r) => (o.basis[r] ? x.tweeWaarden.indexOf(w) : -1));
        ng = 2;
      }
      if (groep && tweeWaardenRegel(y.waarden, o.basis, groep, ng, ctx.d, ctx.selectie)?.some(Boolean)) {
        return weiger(ds, spec, ctx, titel, 'privacy', P_LOGIT_CEL(x.v.label, `${y.label}: ${y.labels.find((l) => l.code === Math.max(...yWaarden))?.label || g(Math.max(...yWaarden), 0)}`));
      }
    }
    voeg(u, melding('info', `“${y.label}” heeft maar twee waarden. Een lineaire regressie kan dan, maar een logistische regressie past meestal beter.`));
  }
  voeg(u, o.meldingen);
  const p = o.kolommen.length;
  if (!p) return weiger(ds, spec, ctx, titel, 'privacy', o.meldingen.at(-1)?.tekst || 'Er blijft geen voorspeller over.');
  if (p > MAX_KOLOMMEN) return weiger(ds, spec, ctx, titel, 'fout', `Dit model heeft ${p} kolommen; het kan er hooguit ${MAX_KOLOMMEN}. Deel voorspellers met veel groepen eerst in minder groepen in.`);
  const minN = Math.max(20, p + 10);
  if (o.n < minN) return weiger(ds, spec, ctx, titel, 'fout', `${P_TE_WEINIG(minN)} Alleen respondenten met een antwoord op alle gekozen variabelen tellen mee.`);
  const ys = o.rijen.map((r) => y.waarden[r]);
  const alle = o.kolommen.map((_, j) => j);
  const groot = pasAanZonderAfhankelijke(o, alle, (X) => ols(X, ys));
  voeg(u, groot.meldingen);
  if (!groot.fit) return weiger(ds, spec, ctx, titel, 'fout', 'Het model is niet te berekenen met deze voorspellers.');
  await ctx.pauze();
  const metBlok = blok2.length > 0 && groot.kolommen.some((k) => o.kolommen[k].blok === 1) && groot.kolommen.some((k) => o.kolommen[k].blok === 0);
  const modellen = [];
  if (metBlok) {
    const k1 = groot.kolommen.filter((k) => o.kolommen[k].blok === 0);
    const f1 = ols(kolommenUit(o.X, k1), ys);
    if (f1 && f1.afhankelijk === undefined) modellen.push({ kolommen: k1, fit: f1 });
  }
  modellen.push({ kolommen: groot.kolommen, fit: groot.fit });
  const verandering = modellen.length === 2 ? fVerandering(modellen[0].fit, modellen[1].fit) : null;
  u.gegevens.n = o.n;
  const nr = (i) => (modellen.length > 1 ? `Model ${i + 1}` : 'Model');
  voeg(u,
    tabel('model', 'Modeloverzicht', ['Model', 'R', 'R²', 'Gecorrigeerde R²', 'SE van de schatting', ...(verandering ? ['R²-verandering', 'F-verandering', 'df1', 'df2', 'p'] : [])],
      modellen.map((m, i) => [tekstCel(nr(i)), cel(m.fit.r, 'r'), cel(m.fit.r2, 'r'), cel(m.fit.r2adj, 'r'), cel(m.fit.seSchatting, 'coef'),
        ...(verandering ? (i === 0 ? [cel(m.fit.r2, 'r'), cel(m.fit.f, 'stat'), cel(m.fit.k, 'df'), cel(m.fit.dfRes, 'df'), cel(m.fit.pF, 'p')]
          : [cel(verandering.r2Verandering, 'r'), cel(verandering.f, 'stat'), cel(verandering.df1, 'df'), cel(verandering.df2, 'df'), cel(verandering.p, 'p')]) : [])]),
      { voetnoten: [verandering ? 'Model 2 voegt het tweede blok voorspellers toe aan model 1, bij dezelfde respondenten.' : null] }),
    tabel('anova', 'Variantieanalyse', ['Bron', 'Kwadratensom', 'df', 'Gemiddeld kwadraat', 'F', 'p'], modellen.flatMap((m, i) => {
      const voor = modellen.length > 1 ? `${nr(i)}: ` : '';
      return [
        [tekstCel(`${voor}Regressie`), cel(m.fit.ssReg, 'stat'), cel(m.fit.k, 'df'), cel(m.fit.ssReg / m.fit.k, 'stat'), cel(m.fit.f, 'stat'), cel(m.fit.pF, 'p')],
        [tekstCel(`${voor}Residu`), cel(m.fit.ssRes, 'stat'), cel(m.fit.dfRes, 'df'), cel(m.fit.ssRes / m.fit.dfRes, 'stat'), tekstCel(''), tekstCel('')],
        [tekstCel(`${voor}Totaal`, { nadruk: true }), cel(m.fit.ssTot, 'stat'), cel(m.fit.n - 1, 'df'), tekstCel(''), tekstCel(''), tekstCel('')],
      ];
    })));
  modellen.forEach((m, i) => voeg(u,
    coefficientenTabel(`coef-${i + 1}`, modellen.length > 1 ? `Coëfficiënten (${nr(i).toLowerCase()})` : 'Coëfficiënten', o, m.kolommen, m.fit),
    geheelTabel(`geheel-${i + 1}`, o, m.kolommen, m.fit)));
  voeg(u, groepenTabel(o));
  const res = groot.fit.residuen;
  // Het aantal grote residuen: 1 tot 4 wordt verborgen (dat zijn een paar personen).
  voeg(u, tabel('residuen', 'Gestandaardiseerde residuen', ['', 'Waarde'], [
    [tekstCel('Gemiddelde'), cel(Math.abs(res.gemiddelde) < 1e-9 ? 0 : res.gemiddelde, 'gem')],
    [tekstCel('SD'), cel(res.sd, 'gem')],
    [tekstCel('Scheefheid'), cel(res.scheef, 'stat')],
    [tekstCel('Kurtosis'), cel(res.kurtosis, 'stat')],
    [tekstCel('Aantal met een residu groter dan 3 SD'), aantalCel(res.boven3, res.boven3 > 0 && res.boven3 < ctx.d)],
  ], { voetnoten: ['Er worden geen residuen of voorspelde waarden per persoon getoond of bewaard.'] }));
  methode(u, 'regressie');
  u.toetsen = modellen.length + groot.kolommen.length + (verandering ? 1 : 0);
  // Waarschuwingen over de opzet (Green 1991; samenhang tussen voorspellers).
  const pm = groot.kolommen.length;
  if (o.n < 50 + 8 * pm) voeg(u, melding('waarschuwing', P_WEINIG_RESPONDENTEN_MODEL));
  const hoog = groot.kolommen.filter((_, j) => groot.fit.vif[j] > 5).map((k) => o.kolommen[k].label);
  if (hoog.length) voeg(u, melding('waarschuwing', P_VIF(hoog)));
  voeg(u, ordinaalMelding([y, ...o.voorspellers.filter((x) => x.soort === 'getal').map((x) => x.v)]));

  // "Wat betekent dit?" en de zin in APA-stijl (over het volledige model).
  const f = groot.fit;
  const pct = Math.round(f.r2 * 100);
  const significant = eindig(f.pF) && f.pF < ALFA;
  u.duiding.significant = significant;
  u.duiding.zinnen.push(uitlegRegressie(y.label, pct),
    significant ? 'Het model als geheel is statistisch significant: het is onwaarschijnlijk dat de samenhang alleen door toeval komt.' : 'Niet significant: de samenhang tussen de voorspellers en de score kan goed door toeval komen.');
  const sterkste = groot.kolommen.map((k, j) => ({ k, j, beta: f.bStd[j], p: f.p[j + 1], b: f.beta[j + 1] })).filter((x) => eindig(x.beta))
    .sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))[0];
  if (sterkste) {
    const kol = o.kolommen[sterkste.k];
    const x = o.voorspellers[kol.voorspeller];
    const sig = sterkste.p < ALFA ? '' : ' Dit verband is niet significant: het kan goed door toeval komen.';
    if (x.soort === 'getal') {
      u.duiding.zinnen.push(`De sterkste voorspeller is “${x.v.label}” (β = ${g(sterkste.beta)}): hoe hoger “${x.v.label}”, hoe ${sterkste.beta > 0 ? 'hoger' : 'lager'} meestal “${y.label}”, als de andere voorspellers gelijk blijven.${sig}`);
    } else {
      u.duiding.zinnen.push(`De sterkste voorspeller is “${kol.label}” (β = ${g(sterkste.beta)}): die groep scoort gemiddeld ${g(Math.abs(sterkste.b))} punt ${sterkste.b > 0 ? 'hoger' : 'lager'} op “${y.label}” dan de referentiegroep “${x.groepen[x.referentie].label}”, als de andere voorspellers gelijk blijven.${sig}`);
    }
  }
  if (verandering) u.duiding.zinnen.push(`Het tweede blok voorspellers verklaart ${Math.round(verandering.r2Verandering * 100)}% extra${verandering.p < ALFA ? '; dat is statistisch significant' : ', maar dat kan goed door toeval komen'}.`);
  u.duiding.zinnen.push(LET_OP_VERBAND);
  u.apa = apaZinnen((s) => {
    let zin = `Het model verklaarde ${pct}% van de variantie in “${y.label}”, *F*(${s.df(f.k)}; ${s.df(f.dfRes)}) = ${s.g(f.f)}; ${s.p(f.pF)}; *R*² = ${s.begrensd(f.r2)}.`;
    if (verandering) zin += ` Het tweede blok voegde ${Math.round(verandering.r2Verandering * 100)}% verklaarde variantie toe, *F*(${s.df(verandering.df1)}; ${s.df(verandering.df2)}) = ${s.g(verandering.f)}; ${s.p(verandering.p)}.`;
    if (sterkste) {
      const kol = o.kolommen[sterkste.k];
      zin += ` “${kol.label}” hing ${sterkste.p < ALFA ? '' : 'niet significant '}${sterkste.beta > 0 ? 'positief' : 'negatief'} samen met “${y.label}”, β = ${s.begrensd(sterkste.beta)}; *t*(${s.df(f.dfRes)}) = ${s.g(f.t[sterkste.j + 1])}; ${s.p(sterkste.p)}.`;
    }
    return zin;
  });
  return sluitAf(u);
}
