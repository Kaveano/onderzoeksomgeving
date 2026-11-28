// Werkbank: schalen – betrouwbaarheid (Cronbachs alfa met item-totaalstatistieken) en factoranalyse
// (hoofdcomponenten of principale assen, varimax, KMO en Bartlett) (D2 §5.2, §6.3). Zuivere module, geen DOM.
// Er komen nooit factorscores per persoon uit (regel G).

import { REDEN } from '../dataset.js';
import { cronbachAlpha, momenten, pearson, chi2Sf } from '../../statistiek.js';
import { tweeWaardenRegel, weggevallenRegel } from '../privacy-selectie.js';
import { correlatieMatrix, inverseSpd, cholesky, logDeterminant, jacobiEigen } from '../matrix.js';
import { tabel, cel, tekstCel, voeg, melding, sluitAf, methode } from '../uitvoer.js';
import {
  ALFA_UITLEG, P_TE_WEINIG, pWeggevallen, P_CIJFER_ITEM, P_BEREIK_VERSCHILT, P_NIET_PD, P_HEYWOOD, P_WEINIG_FACTOR, UITLEG_FACTOR, apaZinnen, g, opsomming,
} from '../uitvoer-tekst.js';
import { getalFout, begin, weiger, variabelenUit, indelingAlsGetalFout, inSelectie, iedereen, selectieControle, tel } from './basis.js';

const MIN_N = 10;

/** Oordeel bij alfa (zoals bij Analyse: op het getal zoals het getoond wordt). */
export function alfaOordeel(ruw) {
  const alpha = Math.round(ruw * 100) / 100;
  if (alpha < 0.6) return 'onvoldoende';
  if (alpha < 0.7) return 'matig';
  if (alpha < 0.8) return 'voldoende';
  if (alpha < 0.9) return 'goed';
  return 'zeer goed';
}

/**
 * Betrouwbaarheid van k items (rijen: één rij per respondent met k waarden, alle geldig).
 * @returns { alpha, gestandaardiseerd, k, n, items: [{ gemiddelde, sd, schaalGemZonder, schaalVarZonder, itemTotaal, smc, alfaZonder }],
 *            inter: { gemiddelde, laagste, hoogste } } | null
 */
export function betrouwbaarheidVan(ruw) {
  if (!Array.isArray(ruw) || !ruw.length || !Array.isArray(ruw[0])) return null;
  const k = ruw[0].length;
  const rijen = ruw.filter((r) => Array.isArray(r) && r.length === k && r.every((x) => typeof x === 'number' && Number.isFinite(x)));
  const n = rijen.length;
  if (n < 2 || k < 2) return null;
  const a = cronbachAlpha(rijen);
  if (!a) return null;
  const R = correlatieMatrix(rijen);
  const inter = [];
  if (R) for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) inter.push(R[i][j]);
  const rGem = inter.length ? inter.reduce((t, x) => t + x, 0) / inter.length : null;
  const inv = R ? inverseSpd(R) : null;
  const totalen = rijen.map((r) => r.reduce((t, x) => t + x, 0));
  const items = [];
  for (let j = 0; j < k; j++) {
    const kol = rijen.map((r) => r[j]);
    const mj = momenten(kol);
    const zonder = totalen.map((t, i) => t - rijen[i][j]);
    const mz = momenten(zonder);
    const rest = rijen.map((r) => r.filter((_, x) => x !== j));
    const az = k > 2 ? cronbachAlpha(rest) : null;
    const it = pearson(kol, zonder);
    items.push({
      gemiddelde: mj.m,
      sd: n > 1 ? Math.sqrt(mj.ss / (n - 1)) : null,
      schaalGemZonder: mz.m,
      schaalVarZonder: n > 1 ? mz.ss / (n - 1) : null,
      itemTotaal: it ? it.r : null,
      smc: inv && inv[j][j] > 0 ? 1 - 1 / inv[j][j] : null,
      alfaZonder: az ? az.alpha : null,
    });
  }
  return {
    alpha: a.alpha,
    gestandaardiseerd: rGem === null ? null : (k * rGem) / (1 + (k - 1) * rGem),
    k,
    n,
    items,
    inter: inter.length ? { gemiddelde: rGem, laagste: Math.min(...inter), hoogste: Math.max(...inter) } : null,
  };
}

/** J3: een cijfervraag (0 tot 10 of 1 tot 10) hoort nooit bij de vragen van een schaal (BOUWPLAN §1.1). */
export const isCijfervraag = (v) => !!v && v.bron === 'vraag' && v.type === 'cijfer';

/** Hebben de items een verschillend bereik (bijvoorbeeld 1 tot 5 naast een eigen score zonder vast bereik)? */
function bereikVerschilt(vars) {
  return new Set(vars.map((v) => (v.bereik ? `${v.bereik.laag}:${v.bereik.hoog}` : 'geen'))).size > 1;
}

export function betrouwbaarheid(ds, spec, ctx) {
  const titel = 'Betrouwbaarheid (Cronbachs alfa)';
  const lijst = variabelenUit(ds, spec, 'items');
  const omscoren = new Set(spec.opties?.omscoren || []);
  const u = begin(ds, spec, ctx, titel, `Vragen: ${lijst.map((x) => `${x.v?.label || x.id}${omscoren.has(x.id) ? ' (omgescoord)' : ''}`).join(', ')}`);
  const items = [];
  for (const { id, v } of lijst) {
    const fout = getalFout(v);
    if (fout) return weiger(ds, spec, ctx, titel, 'fout', fout);
    if (isCijfervraag(v)) return weiger(ds, spec, ctx, titel, 'fout', P_CIJFER_ITEM(v.label));
    if (omscoren.has(id) && !v.bereik) return weiger(ds, spec, ctx, titel, 'fout', `“${v.label}” heeft geen vaste schaal; omscoren kan dan niet.`);
    items.push({ id, v, om: omscoren.has(id) });
  }
  if (items.length < 2) return weiger(ds, spec, ctx, titel, 'fout', 'Kies minstens twee vragen.');
  if (bereikVerschilt(items.map((x) => x.v))) voeg(u, melding('waarschuwing', P_BEREIK_VERSCHILT));
  const geldig = new Uint8Array(ds.n).fill(1);
  for (const { v } of items) for (let r = 0; r < ds.n; r++) if (v.reden[r] !== REDEN.GELDIG) geldig[r] = 0;
  const sel = selectieControle(ctx, geldig);
  if (sel) return weiger(ds, spec, ctx, titel, 'privacy', sel);
  const basis = inSelectie(geldig, ctx.selectie);
  for (const { v } of items) {
    const t = indelingAlsGetalFout(v, basis, ctx.d, ctx.selectie?.F);
    if (t) return weiger(ds, spec, ctx, titel, 'privacy', t);
    if (tweeWaardenRegel(v.waarden, basis, null, 1, ctx.d)?.[0]) return weiger(ds, spec, ctx, titel, 'privacy', `“${v.label}” heeft maar twee waarden en een daarvan komt bij minder dan ${ctx.d} mensen voor.`);
    if (v.score && weggevallenRegel(v.reden, ctx.selectie ? ctx.selectie.F : iedereen(ds), null, 1, ctx.d)[0]) return weiger(ds, spec, ctx, titel, 'privacy', pWeggevallen(v));
  }
  const rijen = [];
  for (let r = 0; r < ds.n; r++) {
    if (!basis[r]) continue;
    rijen.push(items.map(({ v, om }) => (om ? v.bereik.laag + v.bereik.hoog - v.waarden[r] : v.waarden[r])));
  }
  if (rijen.length < MIN_N) return weiger(ds, spec, ctx, titel, 'fout', `${P_TE_WEINIG(MIN_N)} Alleen respondenten die alle gekozen vragen beantwoordden, tellen mee.`);
  const b = betrouwbaarheidVan(rijen);
  if (!b) return weiger(ds, spec, ctx, titel, 'fout', 'De betrouwbaarheid is niet te berekenen: er is te weinig spreiding in de antwoorden.');
  u.gegevens.n = b.n;
  const naam = (x) => `${x.v.label}${x.om ? ' (omgescoord)' : ''}`;
  voeg(u,
    tabel('alfa', 'Betrouwbaarheid', ['', 'Cronbachs α', 'Gestandaardiseerde α', 'Aantal vragen', 'N'], [[tekstCel('Schaal'), cel(b.alpha, 'r'), cel(b.gestandaardiseerd, 'r'), cel(b.k, 'df'), cel(b.n, 'aantal')]]),
    tabel('items', 'Itemstatistieken', ['Vraag', 'Gemiddelde', 'SD', 'N'], items.map((x, j) => [tekstCel(naam(x)), cel(b.items[j].gemiddelde, 'gem'), cel(b.items[j].sd, 'gem'), cel(b.n, 'aantal')])),
    tabel('itemtotaal', 'Item-totaalstatistieken', ['Vraag', 'Schaalgemiddelde zonder vraag', 'Schaalvariantie zonder vraag', 'Gecorrigeerde item-totaalcorrelatie', 'Kwadratische meervoudige correlatie', 'α zonder deze vraag'],
      items.map((x, j) => {
        const it = b.items[j];
        return [tekstCel(naam(x)), cel(it.schaalGemZonder, 'gem'), cel(it.schaalVarZonder, 'gem'), cel(it.itemTotaal, 'r', it.itemTotaal < 0 ? { nadruk: true } : {}), cel(it.smc, 'r'), cel(it.alfaZonder, 'r')];
      }), { voetnoten: [b.items.some((it) => it.smc === null) ? 'Een kwadratische meervoudige correlatie is niet te berekenen als vragen (bijna) volledig samenvallen.' : null] }),
    b.inter ? tabel('inter', 'Samenhang tussen de vragen', ['', 'Gemiddelde', 'Laagste', 'Hoogste'], [[tekstCel('Correlatie tussen de vragen'), cel(b.inter.gemiddelde, 'r'), cel(b.inter.laagste, 'r'), cel(b.inter.hoogste, 'r')]]) : null);
  methode(u, 'cronbach');
  for (const [j, x] of items.entries()) {
    if (b.items[j].itemTotaal < 0) voeg(u, melding('waarschuwing', `“${x.v.label}”: deze vraag gaat tegen de andere in. Moet hij misschien omgescoord worden?`));
  }
  const oordeel = alfaOordeel(b.alpha);
  const uitleg = ALFA_UITLEG.find(([o]) => o === oordeel);
  u.duiding.zinnen.push(`Cronbachs alfa is ${g(b.alpha)}: ${oordeel} (${uitleg[1]}): ${uitleg[2]}`,
    'De gecorrigeerde item-totaalcorrelatie laat zien hoe sterk een vraag samenhangt met de andere vragen samen. Is die laag of negatief, dan meet de vraag iets anders. "α zonder deze vraag" laat zien wat alfa wordt als je de vraag weglaat.');
  u.duiding.effect = oordeel;
  u.schaalscore = { variabelen: items.map((x) => (x.om ? { id: x.id, omscoren: true } : x.id)) };
  // Met drie vragen of minder staan hun namen in de zin; anders "deze k vragen" (geen dubbele woorden).
  const label = items.length <= 3 ? items.map((x) => `“${x.v.label}”`).join(', ') : `deze ${b.k} vragen`;
  u.apa = apaZinnen((f) => `Cronbachs α van ${label} (*n* = ${f.n(b.n)}) was ${f.begrensd(b.alpha)}.`);
  return sluitAf(u);
}

// ---------- Factoranalyse ----------

/**
 * KMO (met MSA per vraag), de toets van Bartlett en de SMC's van een correlatiematrix R bij n respondenten.
 * null als R niet positief definiet is (bijvoorbeeld twee keer dezelfde vraag).
 */
export function kmoBartlett(R, n) {
  const L = cholesky(R);
  const inv = L ? inverseSpd(R) : null;
  if (!L || !inv) return null;
  const k = R.length;
  let somR = 0;
  let somP = 0;
  const msa = [];
  for (let i = 0; i < k; i++) {
    let ri = 0;
    let pi = 0;
    for (let j = 0; j < k; j++) {
      if (i === j) continue;
      ri += R[i][j] * R[i][j];
      const pij = -inv[i][j] / Math.sqrt(inv[i][i] * inv[j][j]);
      pi += pij * pij;
    }
    msa.push(ri + pi > 0 ? ri / (ri + pi) : null);
    somR += ri;
    somP += pi;
  }
  const logdet = logDeterminant(L);
  const chi2 = Math.max(0, -(n - 1 - (2 * k + 5) / 6) * logdet);
  const df = (k * (k - 1)) / 2;
  return {
    kmo: somR + somP > 0 ? somR / (somR + somP) : null, msa, chi2, df, p: chi2Sf(chi2, df), logdet,
    smc: Array.from({ length: k }, (_, j) => 1 - 1 / inv[j][j]),
  };
}

/** Ladingen uit eigenvectoren: L_ij = v_j[i] · √max(λ_j, 0), voor de eerste m. */
function ladingenUit(e, m) {
  const k = e.vectoren[0].length;
  return Array.from({ length: k }, (_, i) => Float64Array.from({ length: m }, (_, j) => e.vectoren[j][i] * Math.sqrt(Math.max(0, e.waarden[j]))));
}
const rijKwadraten = (L) => L.map((rij) => rij.reduce((t, x) => t + x * x, 0));

/** Hoofdcomponenten (PCA): eigenwaarden van R en de ladingen van de eerste m componenten. */
export function pcaLadingen(R, m) {
  const e = jacobiEigen(R);
  if (!e || !(m >= 1)) return null;
  const ladingen = ladingenUit(e, m);
  return { eigenwaarden: e.waarden, ladingen, communaliteiten: rijKwadraten(ladingen) };
}

/**
 * Principale assen (PAF) stap voor stap: begin met de SMC op de diagonaal; herhaal eigen-ontbinding en nieuwe
 * communaliteiten (rijsommen van L²) tot ze minder dan 1e-6 veranderen of na 250 stappen. Een communaliteit van 1 of
 * meer (Heywood-geval) stopt de berekening (heywood: de nummers van die vragen). De generator geeft na elke stap de
 * stand; de laatste waarde is de uitkomst. Zo kan de procedure tussendoor het scherm de beurt geven.
 */
export function* pafStappen(R, m, { smc = null, maxStappen = 250, tol = 1e-6 } = {}) {
  const k = R.length;
  let h2 = smc ? Float64Array.from(smc) : null;
  if (!h2) {
    const inv = inverseSpd(R);
    if (!inv) return null;
    h2 = Float64Array.from({ length: k }, (_, j) => 1 - 1 / inv[j][j]);
  }
  let vorige = null;
  let ladingen = null;
  let stappen = 0;
  let geconvergeerd = false;
  let heywood = [];
  for (let it = 0; it < maxStappen; it++) {
    const Rs = R.map((rij, i) => Float64Array.from(rij, (x, j) => (i === j ? h2[i] : x)));
    const e = jacobiEigen(Rs, { start: vorige });
    if (!e) return null;
    vorige = e.vectoren;
    ladingen = ladingenUit(e, m);
    const nieuw = rijKwadraten(ladingen);
    let verschil = 0;
    for (let j = 0; j < k; j++) verschil = Math.max(verschil, Math.abs(nieuw[j] - h2[j]));
    h2 = Float64Array.from(nieuw);
    stappen = it + 1;
    heywood = nieuw.map((x, j) => (x >= 1 ? j : -1)).filter((j) => j >= 0);
    if (heywood.length) break;
    if (verschil < tol) { geconvergeerd = true; break; }
    yield stappen;
  }
  return { ladingen, communaliteiten: Array.from(h2), stappen, geconvergeerd, heywood };
}

/** Principale assen in één keer (zie pafStappen). */
export function pafLadingen(R, m, opties = {}) {
  const g = pafStappen(R, m, opties);
  for (;;) {
    const s = g.next();
    if (s.done) return s.value;
  }
}

/**
 * Varimax met Kaiser-normalisatie (Kaiser 1958, per paar factoren): rijen eerst door hun lengte h_i delen, per paar de
 * hoek φ = ¼·atan2(D − 2AB/k, C − (A² − B²)/k), rondes tot elke |φ| < 1e-8 (hooguit 100). Daarna terugschalen en elke
 * kolom zo omdraaien dat zijn som positief is; de volgorde van de factoren blijft.
 */
export function varimax(Lruw, { maxRondes = 100, tol = 1e-8 } = {}) {
  if (!Array.isArray(Lruw) || !Lruw.length) return null;
  const k = Lruw.length;
  const m = Lruw[0]?.length ?? 0;
  if (!m || !Lruw.every((rij) => rij && rij.length === m && Array.from(rij).every((x) => typeof x === 'number' && Number.isFinite(x)))) return null;
  const h = Lruw.map((rij) => Math.sqrt(rij.reduce((t, x) => t + x * x, 0)));
  const L = Lruw.map((rij, i) => Float64Array.from(rij, (x) => (h[i] > 0 ? x / h[i] : 0)));
  let rondes = 0;
  if (m >= 2) {
    for (let ronde = 0; ronde < maxRondes; ronde++) {
      rondes = ronde + 1;
      let grootste = 0;
      for (let a = 0; a < m - 1; a++) {
        for (let b = a + 1; b < m; b++) {
          let A = 0;
          let B = 0;
          let C = 0;
          let D = 0;
          for (let i = 0; i < k; i++) {
            const x = L[i][a];
            const y = L[i][b];
            const uu = x * x - y * y;
            const vv = 2 * x * y;
            A += uu;
            B += vv;
            C += uu * uu - vv * vv;
            D += 2 * uu * vv;
          }
          const phi = Math.atan2(D - (2 * A * B) / k, C - (A * A - B * B) / k) / 4;
          grootste = Math.max(grootste, Math.abs(phi));
          if (Math.abs(phi) < 1e-15) continue;
          const c = Math.cos(phi);
          const s = Math.sin(phi);
          for (let i = 0; i < k; i++) {
            const x = L[i][a];
            const y = L[i][b];
            L[i][a] = x * c + y * s;
            L[i][b] = -x * s + y * c;
          }
        }
      }
      if (grootste < tol) break;
    }
  }
  const uit = L.map((rij, i) => Float64Array.from(rij, (x) => x * h[i]));
  for (let j = 0; j < m; j++) {
    let som = 0;
    for (let i = 0; i < k; i++) som += uit[i][j];
    if (som < 0) for (let i = 0; i < k; i++) uit[i][j] = -uit[i][j];
  }
  return { ladingen: uit, rondes };
}

const MAX_FACTOREN = 10;
const LADING_TONEN = 0.3;
const LADING_SCHAAL = 0.4;

export async function factoranalyse(ds, spec, ctx) {
  const titel = 'Factoranalyse';
  const lijst = variabelenUit(ds, spec, 'items');
  const pca = spec.opties?.methode === 'pca';
  const aantalKeuze = spec.opties?.aantal || 'kaiser';
  const roteren = spec.opties?.rotatie !== 'geen';
  const sorteren = spec.opties?.sorteren !== false;
  const kleinWeg = spec.opties?.klein !== false;
  const woord = pca ? 'Component' : 'Factor';
  const u = begin(ds, spec, ctx, titel, `Vragen: ${lijst.map((x) => x.v?.label || x.id).join(', ')}; ${pca ? 'hoofdcomponenten (PCA)' : 'principale assen (PAF)'}; aantal: ${aantalKeuze === 'kaiser' ? 'eigenwaarde groter dan 1' : aantalKeuze}; rotatie: ${roteren ? 'varimax' : 'geen'}`);
  const items = [];
  for (const { v } of lijst) {
    const fout = getalFout(v);
    if (fout) return weiger(ds, spec, ctx, titel, 'fout', fout);
    if (isCijfervraag(v)) return weiger(ds, spec, ctx, titel, 'fout', P_CIJFER_ITEM(v.label));
    items.push(v);
  }
  if (items.length < 3) return weiger(ds, spec, ctx, titel, 'fout', 'Kies minstens drie vragen.');
  if (bereikVerschilt(items)) voeg(u, melding('waarschuwing', P_BEREIK_VERSCHILT));
  const k = items.length;
  const geldig = new Uint8Array(ds.n).fill(1);
  for (const v of items) for (let r = 0; r < ds.n; r++) if (v.reden[r] !== REDEN.GELDIG) geldig[r] = 0;
  const sel = selectieControle(ctx, geldig);
  if (sel) return weiger(ds, spec, ctx, titel, 'privacy', sel);
  const basis = inSelectie(geldig, ctx.selectie);
  for (const v of items) {
    const t = indelingAlsGetalFout(v, basis, ctx.d, ctx.selectie?.F);
    if (t) return weiger(ds, spec, ctx, titel, 'privacy', t);
    if (tweeWaardenRegel(v.waarden, basis, null, 1, ctx.d, ctx.selectie)?.[0]) return weiger(ds, spec, ctx, titel, 'privacy', `“${v.label}” heeft maar twee waarden en een daarvan komt bij minder dan ${ctx.d} mensen voor.`);
    if (v.score && weggevallenRegel(v.reden, ctx.selectie ? ctx.selectie.F : iedereen(ds), null, 1, ctx.d)[0]) return weiger(ds, spec, ctx, titel, 'privacy', pWeggevallen(v));
  }
  const n = tel(basis);
  const minN = Math.max(50, 2 * k);
  if (n < minN) return weiger(ds, spec, ctx, titel, 'fout', `${P_TE_WEINIG(minN)} Alleen respondenten die alle gekozen vragen beantwoordden, tellen mee.`);
  const rijen = [];
  for (let r = 0; r < ds.n; r++) if (basis[r]) rijen.push(items.map((v) => v.waarden[r]));
  await ctx.pauze();
  const R = correlatieMatrix(rijen);
  if (!R) {
    const constant = items.find((_, j) => momenten(rijen.map((rij) => rij[j])).ss === 0);
    return weiger(ds, spec, ctx, titel, 'fout', `“${constant?.label || 'Een vraag'}” heeft bij iedereen hetzelfde antwoord en kan niet meedoen.`);
  }
  const kb = kmoBartlett(R, n);
  if (!kb) return weiger(ds, spec, ctx, titel, 'fout', P_NIET_PD);
  const eigen = jacobiEigen(R);
  if (!eigen) return weiger(ds, spec, ctx, titel, 'fout', P_NIET_PD);
  const kaiser = Math.max(1, eigen.waarden.filter((x) => x > 1).length);
  let m = aantalKeuze === 'kaiser' ? kaiser : Number(aantalKeuze);
  const maxM = Math.min(MAX_FACTOREN, k - 1);
  if (m > maxM) {
    voeg(u, melding('waarschuwing', `Met ${k} vragen kunnen er hooguit ${maxM} ${pca ? 'componenten' : 'factoren'} worden berekend; het zijn er nu ${maxM}.`));
    m = maxM;
  }
  await ctx.pauze();
  let extractie;
  if (pca) {
    extractie = { ladingen: ladingenUit(eigen, m), geconvergeerd: true, heywood: [] };
    extractie.communaliteiten = rijKwadraten(extractie.ladingen);
  } else {
    // Stap voor stap, met af en toe een pauze: zo blijft het scherm bruikbaar en werkt Stoppen.
    const stappen = pafStappen(R, m, { smc: kb.smc });
    for (;;) {
      const s = stappen.next();
      if (s.done) { extractie = s.value; break; }
      if (s.value % 10 === 0) {
        ctx.voortgang?.(`Bezig met rekenen… (stap ${s.value})`);
        await ctx.pauze();
      }
    }
    if (!extractie) return weiger(ds, spec, ctx, titel, 'fout', P_NIET_PD);
  }
  const L = extractie.ladingen;
  const rot = roteren && m >= 2 ? varimax(L)?.ladingen || null : null;
  const kwadratensom = (M) => Array.from({ length: m }, (_, j) => M.reduce((t, rij) => t + rij[j] * rij[j], 0));
  const ssExtractie = kwadratensom(L);
  const ssRotatie = rot ? kwadratensom(rot) : null;
  u.gegevens.n = n;

  voeg(u, tabel('kmo', 'KMO en de toets van Bartlett', ['', 'Waarde'], [
    [tekstCel('Kaiser-Meyer-Olkin (KMO)'), cel(kb.kmo, 'r')],
    [tekstCel('Toets van Bartlett: χ²'), cel(kb.chi2, 'stat')],
    [tekstCel('df'), cel(kb.df, 'df')],
    [tekstCel('p'), cel(kb.p, 'p')],
  ], { uitleg: 'KMO boven 0,6 en een kleine p bij de toets van Bartlett: de vragen hangen genoeg samen voor een factoranalyse.' }));
  voeg(u, tabel('communaliteiten', 'Communaliteiten', ['Vraag', 'Begin', 'Na extractie', 'MSA'],
    items.map((v, j) => [tekstCel(v.label), cel(pca ? 1 : kb.smc[j], 'r'), cel(extractie.communaliteiten[j], 'r'), cel(kb.msa[j], 'r')]),
    { voetnoten: [pca ? 'Begin = 1 bij hoofdcomponenten.' : 'Begin = de kwadratische meervoudige correlatie (SMC) van de vraag met de andere vragen.', 'MSA = KMO per vraag.'] }));
  let cumBegin = 0;
  let cumExtr = 0;
  let cumRot = 0;
  const pctVan = (x) => (x / k) * 100;
  voeg(u, tabel('variantie', 'Verklaarde variantie', [woord, 'Eigenwaarde', '% variantie', 'Cumulatief %', 'Na extractie', '% variantie', 'Cumulatief %', ...(rot ? ['Na rotatie', '% variantie', 'Cumulatief %'] : [])],
    eigen.waarden.map((w, j) => {
      cumBegin += pctVan(w);
      const rij = [tekstCel(String(j + 1)), cel(w, 'stat'), cel(pctVan(w), 'procent'), cel(cumBegin, 'procent')];
      if (j < m) {
        cumExtr += pctVan(ssExtractie[j]);
        rij.push(cel(ssExtractie[j], 'stat'), cel(pctVan(ssExtractie[j]), 'procent'), cel(cumExtr, 'procent'));
        if (rot) {
          cumRot += pctVan(ssRotatie[j]);
          rij.push(cel(ssRotatie[j], 'stat'), cel(pctVan(ssRotatie[j]), 'procent'), cel(cumRot, 'procent'));
        }
      } else rij.push(...Array.from({ length: rot ? 6 : 3 }, () => tekstCel('')));
      return rij;
    }),
    { voetnoten: [`Eigenwaarde, na extractie en na rotatie: kwadratensommen van de ladingen. ${aantalKeuze === 'kaiser' ? `Gekozen: ${m} met een eigenwaarde groter dan 1.` : `Gekozen: ${m}.`}`] }));
  voeg(u, { soort: 'grafiek', vorm: 'staaf', eenheid: 'getal', titel: 'Screeplot: de eigenwaarden van groot naar klein', reeksen: eigen.waarden.slice(0, Math.min(k, 20)).map((w, j) => ({ label: `${woord} ${j + 1}`, waarde: Math.max(0, w) })) });
  // De ladingen: op volgorde van de factor waar een vraag het sterkst bij hoort, kleine ladingen leeg (geen ×).
  const toon = rot || L;
  const hoogste = items.map((_, i) => {
    let b = 0;
    for (let j = 1; j < m; j++) if (Math.abs(toon[i][j]) > Math.abs(toon[i][b])) b = j;
    return b;
  });
  const volgorde = items.map((_, i) => i);
  if (sorteren) volgorde.sort((a, b) => hoogste[a] - hoogste[b] || Math.abs(toon[b][hoogste[b]]) - Math.abs(toon[a][hoogste[a]]) || a - b);
  const ladingTabel = (id, kop, M, extra) => tabel(id, kop, ['Vraag', ...Array.from({ length: m }, (_, j) => `${woord} ${j + 1}`)],
    volgorde.map((i) => [tekstCel(items[i].label), ...Array.from({ length: m }, (_, j) => (kleinWeg && Math.abs(M[i][j]) < LADING_TONEN ? tekstCel('') : cel(M[i][j], 'r')))]),
    { voetnoten: [kleinWeg ? `Ladingen kleiner dan 0,30 (positief of negatief) staan er niet bij.` : null, sorteren ? 'De vragen staan op volgorde van de factor waar ze het sterkst bij horen.' : null], ...extra });
  if (rot) {
    voeg(u, ladingTabel('ladingen-voor', `Ladingen voor rotatie (${pca ? 'componentmatrix' : 'factormatrix'})`, L, { verborgenStandaard: true, uitklap: 'Ladingen voor rotatie tonen' }));
    voeg(u, ladingTabel('ladingen', 'Ladingen na rotatie (varimax)', rot, {}));
  } else {
    voeg(u, ladingTabel('ladingen', pca ? 'Ladingen (componentmatrix)' : 'Ladingen (factormatrix)', L, {}));
    if (roteren && m < 2) voeg(u, melding('info', `Met één ${pca ? 'component' : 'factor'} is er niets te roteren.`));
  }
  methode(u, pca ? 'pca' : 'paf', rot ? 'varimax' : null);
  u.toetsen = 1;
  if (extractie.heywood.length) voeg(u, melding('waarschuwing', P_HEYWOOD(extractie.heywood.map((j) => items[j].label))));
  else if (!extractie.geconvergeerd) voeg(u, melding('waarschuwing', 'De berekening kwam binnen 250 stappen niet tot een vaste uitkomst. De uitkomst is onzeker; probeer minder factoren.'));
  if (n < 100 || n < 5 * k) voeg(u, melding('waarschuwing', P_WEINIG_FACTOR));
  if (kb.kmo < 0.5) voeg(u, melding('waarschuwing', 'KMO is lager dan 0,5: de vragen hangen te weinig samen voor een goede factoranalyse.'));
  // Per factor een voorstel voor een schaalscore: vragen die daar het sterkst bij horen, met een lading van 0,40 of meer.
  u.schaalscores = [];
  for (let j = 0; j < m; j++) {
    const leden = volgorde.filter((i) => hoogste[i] === j && Math.abs(toon[i][j]) >= LADING_SCHAAL);
    const variabelen = [];
    for (const i of leden) {
      if (toon[i][j] >= 0) variabelen.push(items[i].id);
      else if (items[i].bereik) variabelen.push({ id: items[i].id, omscoren: true });
    }
    if (variabelen.length >= 2) u.schaalscores.push({ label: `${woord} ${j + 1}`, variabelen });
  }
  // "Wat betekent dit?" en de APA-zin.
  const cum = (rot ? ssRotatie : ssExtractie).reduce((t, x) => t + x, 0);
  const pct = Math.round(pctVan(cum));
  u.duiding.significant = kb.p < 0.05;
  u.duiding.zinnen.push(UITLEG_FACTOR,
    `KMO is ${g(kb.kmo)}${kb.kmo >= 0.6 ? ': genoeg samenhang' : ': aan de lage kant'}. De toets van Bartlett is ${kb.p < 0.05 ? 'significant' : 'niet significant'}.`,
    `Er ${m === 1 ? `is 1 ${woord.toLowerCase()}` : `zijn ${m} ${pca ? 'componenten' : 'factoren'}`}; samen ${m === 1 ? 'verklaart die' : 'verklaren ze'} ${pct}% van de verschillen in de antwoorden.`);
  for (let j = 0; j < m; j++) {
    const leden = volgorde.filter((i) => hoogste[i] === j && Math.abs(toon[i][j]) >= LADING_SCHAAL).map((i) => items[i].label);
    if (leden.length) u.duiding.zinnen.push(`${woord} ${j + 1}: vooral ${opsomming(leden.slice(0, 4))}${leden.length > 4 ? ` en nog ${leden.length - 4}` : ''}.`);
  }
  u.duiding.zinnen.push('Een factoranalyse laat zien welke vragen samenhangen, niet waarom. Geef elke factor zelf een naam die past bij de vragen, en controleer de schaal daarna met Betrouwbaarheid.');
  u.apa = apaZinnen((f) => `Een ${pca ? 'hoofdcomponentenanalyse' : 'principale-assenanalyse'}${rot ? ' met varimaxrotatie' : ''} op ${k} vragen (*n* = ${f.n(n)}) gaf ${m} ${m === 1 ? (pca ? 'component' : 'factor') : (pca ? 'componenten' : 'factoren')}${aantalKeuze === 'kaiser' ? ' met een eigenwaarde groter dan 1' : ''}, samen goed voor ${pct}% van de variantie; KMO = ${f.begrensd(kb.kmo)}; toets van Bartlett χ²(${f.df(kb.df)}) = ${f.g(kb.chi2)}; ${f.p(kb.p)}.`);
  return sluitAf(u);
}
