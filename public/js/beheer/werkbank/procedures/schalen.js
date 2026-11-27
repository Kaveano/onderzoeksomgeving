// Werkbank: betrouwbaarheid van een schaal (Cronbachs alfa met item-totaalstatistieken) (D2 §5.2, §6.3).
// Zuivere module, geen DOM. Fase 6 voegt hier de factoranalyse (factoranalyse) aan toe.

import { REDEN } from '../dataset.js';
import { cronbachAlpha, momenten, pearson } from '../../statistiek.js';
import { tweeWaardenRegel, weggevallenRegel } from '../privacy-selectie.js';
import { correlatieMatrix, inverseSpd } from '../matrix.js';
import { tabel, cel, tekstCel, voeg, melding, sluitAf, methode } from '../uitvoer.js';
import { ALFA_UITLEG, P_TE_WEINIG, P_WEGGEVALLEN, apaZinnen, g } from '../uitvoer-tekst.js';
import { getalFout, begin, weiger, variabelenUit, indelingAlsGetalFout, inSelectie, iedereen, selectieControle } from './basis.js';

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

export function betrouwbaarheid(ds, spec, ctx) {
  const titel = 'Betrouwbaarheid (Cronbachs alfa)';
  const lijst = variabelenUit(ds, spec, 'items');
  const omscoren = new Set(spec.opties?.omscoren || []);
  const u = begin(ds, spec, ctx, titel, `Vragen: ${lijst.map((x) => `${x.v?.label || x.id}${omscoren.has(x.id) ? ' (omgescoord)' : ''}`).join(', ')}`);
  const items = [];
  for (const { id, v } of lijst) {
    const fout = getalFout(v);
    if (fout) return weiger(ds, spec, ctx, titel, 'fout', fout);
    if (omscoren.has(id) && !v.bereik) return weiger(ds, spec, ctx, titel, 'fout', `“${v.label}” heeft geen vaste schaal; omscoren kan dan niet.`);
    items.push({ id, v, om: omscoren.has(id) });
  }
  if (items.length < 2) return weiger(ds, spec, ctx, titel, 'fout', 'Kies minstens twee vragen.');
  const geldig = new Uint8Array(ds.n).fill(1);
  for (const { v } of items) for (let r = 0; r < ds.n; r++) if (v.reden[r] !== REDEN.GELDIG) geldig[r] = 0;
  const sel = selectieControle(ctx, geldig);
  if (sel) return weiger(ds, spec, ctx, titel, 'privacy', sel);
  const basis = inSelectie(geldig, ctx.selectie);
  for (const { v } of items) {
    const t = indelingAlsGetalFout(v, basis, ctx.d);
    if (t) return weiger(ds, spec, ctx, titel, 'privacy', t);
    if (tweeWaardenRegel(v.waarden, basis, null, 1, ctx.d)?.[0]) return weiger(ds, spec, ctx, titel, 'privacy', `“${v.label}” heeft maar twee waarden en een daarvan komt bij minder dan ${ctx.d} mensen voor.`);
    if (v.score && weggevallenRegel(v.reden, ctx.selectie ? ctx.selectie.F : iedereen(ds), null, 1, ctx.d)[0]) return weiger(ds, spec, ctx, titel, 'privacy', `“${v.label}”: ${P_WEGGEVALLEN}.`);
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
  const label = items.length <= 3 ? items.map((x) => `“${x.v.label}”`).join(', ') : `${items.length} vragen`;
  u.apa = apaZinnen((f) => `Cronbachs α voor ${label} (${b.k} vragen, *n* = ${f.n(b.n)}) was ${f.begrensd(b.alpha)}.`);
  return sluitAf(u);
}
