// Werkbank: logistische regressie (D2 §5.2, §6.3). Zuivere module, geen DOM.
// - logit(X, y): IRLS (Newton) met stapverkleining, de regel van R glm.fit voor convergentie, en herkenning van
//   (bijna) volledige scheiding; B, SE, Wald, p, odds ratio met 95%-BI, −2LL, Cox & Snell en Nagelkerke;
// - waldChi2: een voorspeller met groepen als geheel;
// - logistisch(ds, spec, ctx): de analyse. Privacy: beide groepen van de uitkomst minstens d, en bij elke indeling
//   (en elk getal met twee waarden) heeft elke groep minstens d mensen met en d mensen zonder de uitkomst
//   (P_LOGIT_CEL); de classificatietabel is gemaskeerd zoals een kruistabel. Geen kansen per persoon (regel G).

import { isIndeling } from '../dataset.js';
import { chi2Sf } from '../../statistiek.js';
import { kleinsteKwadraten, cholesky, choleskyOplossen, inverseSpd } from '../matrix.js';
import { normaalTweezijdig } from '../verdelingen.js';
import { maskeerKruistabel } from '../../privacy.js';
import { groepBuren, telTabel, buurTabellen } from '../privacy-selectie.js';
import { tabel, cel, tekstCel, verborgenCel, aantalCel, voeg, melding, sluitAf, methode } from '../uitvoer.js';
import { P_TE_WEINIG, P_LOGIT_CEL, P_SCHEIDING, P_WEINIG_PER_VOORSPELLER, LET_OP_VERBAND, uitlegLogistisch, g, apaZinnen, pWaarde } from '../uitvoer-tekst.js';
import { tel, groepVanRijen, begin, weiger, overlapFout, ordinaalMelding, variabelenUit } from './basis.js';
import { ontwerp, kolommenUit, groepenTabel, pasAanZonderAfhankelijke } from './regressie.js';
import { groepVanBronwaarde } from './groepen.js';

const ALFA = 0.05;
const MIN_N = 30;
const MAX_KOLOMMEN = 30;
const Z975 = 1.959963984540054;
const eindig = (x) => typeof x === 'number' && Number.isFinite(x);

/** ln p en ln(1 − p) bij p = 1/(1 + e^(−η)), zonder afronding naar 0 of 1. */
function lnKansen(eta) {
  const lnp = eta >= 0 ? -Math.log1p(Math.exp(-eta)) : eta - Math.log1p(Math.exp(eta));
  return [lnp, lnp - eta];
}

function afwijking(Xc, y, beta) {
  let D = 0;
  for (let i = 0; i < y.length; i++) {
    let eta = 0;
    for (let j = 0; j < beta.length; j++) eta += Xc[i][j] * beta[j];
    const [lnp, ln1p] = lnKansen(eta);
    D -= 2 * (y[i] ? lnp : ln1p);
  }
  return D;
}

/**
 * Logistische regressie met constante. X: n rijen met p voorspellers (zonder constante), y: 0/1.
 * @returns null | { afhankelijk: j } | { scheiding: true } |
 *   { n, k (aantal voorspellers), beta, se, wald, pWald, or, orLaag, orHoog, ll, ll0, chi2, df, pModel, coxSnell, nagelkerke, cov, kans, iteraties }
 */
export function logit(X, y) {
  if (!Array.isArray(X) || !(Array.isArray(y) || ArrayBuffer.isView(y))) return null;
  const n = y.length;
  if (!n || X.length !== n) return null;
  const k = X[0]?.length ?? 0;
  if (!X.every((r) => r && r.length === k && Array.from(r).every(eindig)) || !Array.from(y).every((w) => w === 0 || w === 1)) return null;
  if (n < k + 2) return null;
  const Xc = X.map((r) => [1, ...r]);
  // Afhankelijke kolommen eerst (zoals bij lineaire regressie), daarna het model.
  const qr = kleinsteKwadraten(Xc, Array.from(y));
  if (!qr) return null;
  if (qr.afhankelijk !== undefined) return qr.afhankelijk === 0 ? null : { afhankelijk: qr.afhankelijk - 1 };
  const p = k + 1;
  const ym = Array.from(y).reduce((t, w) => t + w, 0) / n;
  if (!(ym > 0 && ym < 1)) return null;
  const ll0 = n * (ym * Math.log(ym) + (1 - ym) * Math.log(1 - ym));
  let beta = new Float64Array(p);
  beta[0] = Math.log(ym / (1 - ym));
  let D = afwijking(Xc, y, beta);
  const stap = (b) => {
    // Eén Newton-stap: (XᵀWX) β = XᵀWz.
    const A = Array.from({ length: p }, () => new Float64Array(p));
    const rechts = new Float64Array(p);
    for (let i = 0; i < n; i++) {
      const x = Xc[i];
      let eta = 0;
      for (let j = 0; j < p; j++) eta += x[j] * b[j];
      const kans = 1 / (1 + Math.exp(-eta));
      const w = Math.max(kans * (1 - kans), 1e-10);
      const z = eta + (y[i] - kans) / w;
      for (let a = 0; a < p; a++) {
        const wa = w * x[a];
        rechts[a] += wa * z;
        for (let c = 0; c <= a; c++) A[a][c] += wa * x[c];
      }
    }
    for (let a = 0; a < p; a++) for (let c = 0; c < a; c++) A[c][a] = A[a][c];
    return { A, rechts };
  };
  let geconvergeerd = false;
  let iteraties = 0;
  let extra = false;
  for (let it = 0; it < 50; it++) {
    iteraties = it + 1;
    const { A, rechts } = stap(beta);
    const L = cholesky(A);
    if (!L) return { scheiding: true };
    let nieuw = choleskyOplossen(L, rechts);
    if (!nieuw) return { scheiding: true };
    let Dn = afwijking(Xc, y, nieuw);
    // Stapverkleining zolang de afwijking toeneemt.
    for (let h = 0; h < 10 && !(Dn <= D + 1e-12 * Math.abs(D)); h++) {
      nieuw = nieuw.map((x, j) => (x + beta[j]) / 2);
      Dn = afwijking(Xc, y, nieuw);
    }
    const klaar = Math.abs(Dn - D) < 1e-10 * (Math.abs(Dn) + 0.1);
    beta = nieuw;
    D = Dn;
    if (klaar) {
      if (extra) { geconvergeerd = true; break; }
      extra = true; // nog één stap: dan zijn ook de coëfficiënten tot op ongeveer 1e-10 gelijk
    }
  }
  if (!geconvergeerd || D < 1e-6) return { scheiding: true };
  // Covariantie bij de oplossing, en de kansen per rij (alleen voor de classificatietabel; niet per persoon getoond).
  const { A } = stap(beta);
  const cov = inverseSpd(A);
  if (!cov) return { scheiding: true };
  const kans = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let eta = 0;
    for (let j = 0; j < p; j++) eta += Xc[i][j] * beta[j];
    if (Math.abs(eta) > 30) return { scheiding: true };
    kans[i] = 1 / (1 + Math.exp(-eta));
  }
  const se = Array.from({ length: p }, (_, j) => Math.sqrt(Math.max(0, cov[j][j])));
  if (se.some((s) => !(s < 1e3))) return { scheiding: true };
  const ll = -D / 2;
  const chi2 = Math.max(0, 2 * (ll - ll0));
  const coxSnell = 1 - Math.exp((2 / n) * (ll0 - ll));
  const max = 1 - Math.exp((2 / n) * ll0);
  const b = Array.from(beta);
  return {
    n, k, beta: b, se,
    wald: b.map((x, j) => (x / se[j]) ** 2),
    pWald: b.map((x, j) => normaalTweezijdig(x / se[j])),
    or: b.map((x) => Math.exp(x)),
    orLaag: b.map((x, j) => Math.exp(x - Z975 * se[j])),
    orHoog: b.map((x, j) => Math.exp(x + Z975 * se[j])),
    ll, ll0, chi2, df: k, pModel: chi2Sf(chi2, k),
    coxSnell, nagelkerke: max > 0 ? coxSnell / max : null,
    cov: cov.map((r) => Array.from(r)), kans, iteraties,
  };
}

/** Wald-toets voor een groep kolommen (de dummy's van één voorspeller): W = βᵀ Cov⁻¹ β, df = aantal kolommen. */
export function waldChi2(fit, kolommen) {
  if (!fit?.cov || !kolommen.length) return null;
  const idx = kolommen.map((j) => j + 1);
  const b = idx.map((i) => fit.beta[i]);
  const inv = inverseSpd(idx.map((i) => idx.map((j) => fit.cov[i][j])));
  if (!inv) return null;
  let w = 0;
  for (let i = 0; i < b.length; i++) for (let j = 0; j < b.length; j++) w += b[i] * inv[i][j] * b[j];
  return eindig(w) ? { chi2: w, df: b.length, p: chi2Sf(w, b.length) } : null;
}

const biTekst = (a, b) => (eindig(a) && eindig(b) ? `${g(a)} tot ${g(b)}` : '–');

export async function logistisch(ds, spec, ctx) {
  const titel = 'Logistische regressie';
  const [{ v: w } = {}] = variabelenUit(ds, spec, 'uitkomst');
  const lijst = variabelenUit(ds, spec, 'voorspellers');
  if (!isIndeling(w)) return weiger(ds, spec, ctx, titel, 'fout', `“${w?.label || 'De uitkomst'}” is geen indeling met vaste groepen.`);
  const groepen = w.beschermd.groepen;
  if (groepen.length !== 2) {
    return weiger(ds, spec, ctx, titel, 'fout', `“${w.label}” heeft ${groepen.length} groepen. Een logistische regressie heeft een uitkomst met precies twee groepen nodig, zoals ja en nee. Deel hem eerst in twee groepen in (Indelen in groepen).`);
  }
  const keuze = spec.opties?.gebeurtenis;
  const gebeurtenis = keuze === undefined ? 0 : groepVanBronwaarde(w, keuze);
  if (gebeurtenis < 0) return weiger(ds, spec, ctx, titel, 'fout', 'Kies bij “Waar kijk je naar?” een van de twee groepen van de uitkomst.');
  const ander = 1 - gebeurtenis;
  const naamG = groepen[gebeurtenis].label;
  const naamA = groepen[ander].label;
  const u = begin(ds, spec, ctx, titel, `Uitkomst: ${w.label} (“${naamG}” tegenover “${naamA}”); voorspellers: ${lijst.map((x) => x.v?.label || x.id).join(', ')}`);
  const overlap = overlapFout(ds, ctx, [w]);
  if (overlap) return weiger(ds, spec, ctx, titel, 'privacy', overlap);
  const gw = groepVanRijen(ds, w);
  const uitkomstGeldig = Uint8Array.from(gw, (x) => (x >= 0 ? 1 : 0));
  const o = ontwerp(ds, ctx, { uitkomst: w, uitkomstGeldig, blokken: [lijst], referentie: spec.opties?.referentie || 'grootste' });
  if (o.fout) return weiger(ds, spec, ctx, titel, o.niveau, o.fout);
  await ctx.pauze();
  // De uitkomst: beide groepen minstens d, ook ten opzichte van de buren van de selectie (regel D).
  const nGroep = [0, 0];
  for (const r of o.rijen) nGroep[gw[r]]++;
  if (nGroep.some((x) => x < ctx.d)) return weiger(ds, spec, ctx, titel, 'privacy', `Beide groepen van “${w.label}” moeten minstens ${ctx.d} respondenten hebben.`);
  if (groepBuren(ctx.selectie, o.geldig, gw, 2, ctx.d).some(Boolean)) {
    return weiger(ds, spec, ctx, titel, 'privacy', `Een groep van “${w.label}” verschilt met en zonder de selectie maar een paar mensen (minder dan ${ctx.d}). Dan zijn hun antwoorden terug te rekenen. Kies een andere selectie.`);
  }
  if (o.n < MIN_N) return weiger(ds, spec, ctx, titel, 'fout', `${P_TE_WEINIG(MIN_N)} Alleen respondenten met een antwoord op alle gekozen variabelen tellen mee.`);
  // Elke groep van elke indeling (en elk getal met twee waarden) heeft minstens d mensen met en zonder de uitkomst.
  const uitkomstIndex = Int32Array.from(gw, (x) => (x === gebeurtenis ? 1 : x === ander ? 0 : -1));
  for (const x of o.voorspellers) {
    let groep = x.groep;
    let ng = x.groepen?.length;
    if (x.tweeWaarden) {
      groep = Int32Array.from(x.v.waarden, (wr, r) => (o.basis[r] ? x.tweeWaarden.indexOf(wr) : -1));
      ng = 2;
    }
    if (!groep) continue;
    const T = telTabel(o.basis, null, groep, uitkomstIndex, ng, 2);
    if (T.some((rij) => rij.some((c) => c < ctx.d))) return weiger(ds, spec, ctx, titel, 'privacy', P_LOGIT_CEL(x.v.label, naamG));
    const buren = buurTabellen(ctx.selectie, o.geldig, groep, uitkomstIndex, ng, 2, ctx.d);
    if (buren.vooraf?.some((rij) => rij.some(Boolean))) {
      return weiger(ds, spec, ctx, titel, 'privacy', `Bij “${x.v.label}” verschilt een combinatie met “${naamG}” met en zonder de selectie maar een paar mensen. Dan zou de uitkomst iets over een kleine groep verraden. Kies een ruimere selectie of laat deze voorspeller weg.`);
    }
  }
  voeg(u, o.meldingen);
  const p = o.kolommen.length;
  if (!p) return weiger(ds, spec, ctx, titel, 'privacy', o.meldingen.at(-1)?.tekst || 'Er blijft geen voorspeller over.');
  if (p > MAX_KOLOMMEN) return weiger(ds, spec, ctx, titel, 'fout', `Dit model heeft ${p} kolommen; het kan er hooguit ${MAX_KOLOMMEN}. Deel voorspellers met veel groepen eerst in minder groepen in.`);
  const ys = o.rijen.map((r) => uitkomstIndex[r]);
  const res = pasAanZonderAfhankelijke(o, o.kolommen.map((_, j) => j), (X) => logit(X, ys));
  voeg(u, res.meldingen);
  if (res.fit?.scheiding) return weiger(ds, spec, ctx, titel, 'fout', P_SCHEIDING);
  if (!res.fit) return weiger(ds, spec, ctx, titel, 'fout', 'Het model is niet te berekenen met deze voorspellers.');
  await ctx.pauze();
  const f = res.fit;
  const kol = res.kolommen;
  u.gegevens.n = o.n;
  const inBron = ctx.selectie ? tel(ctx.selectie.F) : ds.n;
  const nietMee = inBron - o.n;
  voeg(u,
    tabel('overzicht', 'Overzicht', ['', 'N'], [
      [tekstCel('Meegenomen in de analyse'), cel(o.n, 'aantal')],
      [tekstCel('Niet meegenomen (een of meer antwoorden ontbreken)'), aantalCel(nietMee, nietMee > 0 && nietMee < ctx.d)],
    ]),
    tabel('codering', 'Codering van de uitkomst', ['Groep', 'Code', 'N'], [
      [tekstCel(naamA), cel(0, 'df'), cel(nGroep[ander], 'aantal')],
      [tekstCel(naamG), cel(1, 'df'), cel(nGroep[gebeurtenis], 'aantal')],
    ], { voetnoten: [`De analyse voorspelt de kans op “${naamG}”.`] }),
    tabel('omnibus', 'Toets van het model (omnibus)', ['', 'χ²', 'df', 'p'], [[tekstCel('Model'), cel(f.chi2, 'stat'), cel(f.df, 'df'), cel(f.pModel, 'p')]]),
    tabel('model', 'Modeloverzicht', ['', '−2 log-likelihood', 'Cox & Snell R²', 'Nagelkerke R²'], [[tekstCel('Model'), cel(-2 * f.ll, 'stat'), cel(f.coxSnell, 'r'), cel(f.nagelkerke, 'r')]]));
  // Classificatietabel (afkappunt 0,5), gemaskeerd zoals een kruistabel.
  const T = [[0, 0], [0, 0]];
  ys.forEach((yy, i) => { T[yy][f.kans[i] >= 0.5 ? 1 : 0]++; });
  const weg = maskeerKruistabel(T, ctx.d);
  const juist = (i) => (weg[i].some(Boolean) ? verborgenCel('procent') : cel((T[i][i] / (T[i][0] + T[i][1])) * 100, 'procent'));
  const totaalJuist = ((T[0][0] + T[1][1]) / o.n) * 100;
  voeg(u, tabel('classificatie', 'Classificatietabel', ['Waargenomen', `Voorspeld: ${naamA}`, `Voorspeld: ${naamG}`, 'Percentage juist'], [
    [tekstCel(naamA), aantalCel(T[0][0], weg[0][0]), aantalCel(T[0][1], weg[0][1]), juist(0)],
    [tekstCel(naamG), aantalCel(T[1][0], weg[1][0]), aantalCel(T[1][1], weg[1][1]), juist(1)],
    [tekstCel('Totaal percentage juist', { nadruk: true }), tekstCel(''), tekstCel(''), cel(totaalJuist, 'procent')],
  ], { voetnoten: ['Afkappunt 0,5: wie een voorspelde kans van 0,5 of meer heeft, telt als voorspeld.'] }));
  // Variabelen in de vergelijking.
  const rijen = [];
  const coefRij = (label, j) => [tekstCel(label), cel(f.beta[j], 'coef'), cel(f.se[j], 'coef'), cel(f.wald[j], 'stat'), cel(1, 'df'), cel(f.pWald[j], 'p'), cel(f.or[j], 'or'), tekstCel(biTekst(f.orLaag[j], f.orHoog[j]))];
  const geheel = [];
  for (const x of o.voorspellers) {
    const welke = x.kolommen.map((k) => kol.indexOf(k)).filter((j) => j >= 0);
    if (!welke.length) continue;
    if (x.soort === 'groep' && welke.length >= 2) {
      const wt = waldChi2(f, welke);
      rijen.push([tekstCel(`“${x.v.label}” (als geheel)`), tekstCel(''), tekstCel(''), cel(wt?.chi2, 'stat'), cel(wt?.df, 'df'), cel(wt?.p, 'p'), tekstCel(''), tekstCel('')]);
      geheel.push(wt);
    }
    for (const j of welke) rijen.push(coefRij(o.kolommen[kol[j]].label, j + 1));
  }
  rijen.push(coefRij('(Constante)', 0));
  const metGroep = o.voorspellers.filter((x) => x.soort === 'groep' && x.kolommen.some((k) => kol.includes(k)));
  voeg(u, tabel('coef', 'Variabelen in de vergelijking', ['Voorspeller', 'B', 'SE', 'Wald', 'df', 'p', 'Exp(B)', '95%-BI van Exp(B)'], rijen, {
    voetnoten: ['Exp(B) is de odds ratio.', ...metGroep.map((x) => `Referentiegroep van “${x.v.label}”: “${x.groepen[x.referentie].label}”.`)],
  }));
  voeg(u, groepenTabel(o));
  methode(u, 'logistisch');
  u.toetsen = 1 + kol.length + geheel.length;
  const kleinste = Math.min(nGroep[0], nGroep[1]);
  if (kleinste / kol.length < 10) voeg(u, melding('waarschuwing', P_WEINIG_PER_VOORSPELLER));
  voeg(u, ordinaalMelding(o.voorspellers.filter((x) => x.soort === 'getal').map((x) => x.v)));

  // "Wat betekent dit?" en de APA-zin.
  const significant = eindig(f.pModel) && f.pModel < ALFA;
  u.duiding.significant = significant;
  u.duiding.zinnen.push(uitlegLogistisch(naamG),
    significant ? 'Het model als geheel is statistisch significant: de voorspellers samen zeggen iets over de kans op de uitkomst, meer dan je door toeval zou verwachten.'
      : 'Niet significant: wat de voorspellers samen zeggen over de uitkomst, kan goed door toeval komen.');
  const sterkste = kol.map((k, j) => ({ k, j: j + 1, z: Math.abs(f.beta[j + 1] / f.se[j + 1]) })).sort((a, b) => b.z - a.z)[0];
  const zinOver = (x, j, k, s = null) => {
    const or = f.or[j];
    const meer = or >= 1 ? 'groter' : 'kleiner';
    const kolom = o.kolommen[k];
    const getallen = s ? `, *OR* = ${s.g(or)}, 95%-BI [${s.g(f.orLaag[j])}; ${s.g(f.orHoog[j])}], ${s.p(f.pWald[j])}` : ` (odds ratio ${g(or)}; p = ${pWaarde(f.pWald[j])})`;
    if (x.soort === 'getal') return `Bij een hogere score op “${x.v.label}” was de kans op “${naamG}” ${meer}${getallen}.`;
    return `In de groep “${x.groepen[kolom.groep].label}” van “${x.v.label}” was de kans op “${naamG}” ${meer} dan in de referentiegroep “${x.groepen[x.referentie].label}”${getallen}.`;
  };
  if (sterkste) {
    const x = o.voorspellers[o.kolommen[sterkste.k].voorspeller];
    u.duiding.zinnen.push(`De duidelijkste voorspeller: ${zinOver(x, sterkste.j, sterkste.k)}${f.pWald[sterkste.j] < ALFA ? '' : ' Dit verband is niet significant.'}`);
  }
  u.duiding.zinnen.push(`Het model voorspelt ${g(totaalJuist, 0)}% van de respondenten juist.`, LET_OP_VERBAND);
  u.apa = apaZinnen((s) => {
    let zin = `Het model was ${significant ? '' : 'niet '}significant, χ²(${s.df(f.df)}) = ${s.g(f.chi2)}; ${s.p(f.pModel)}; Nagelkerke *R*² = ${s.begrensd(f.nagelkerke)}.`;
    if (sterkste) zin += ` ${zinOver(o.voorspellers[o.kolommen[sterkste.k].voorspeller], sterkste.j, sterkste.k, s)}`;
    return zin;
  });
  return sluitAf(u);
}
