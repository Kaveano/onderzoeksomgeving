// Werkbank: kruistabel met chi-kwadraat en de aanpassingstoets (D2 §5.2). Zuivere module, geen DOM.

import { isIndeling, isGetal, getalWeergave } from '../dataset.js';
import { beschermIndeling, telTabel, buurTabellen, maskeerMetBuren, verschilVeilig } from '../privacy-selectie.js';
import { pTekst } from '../../opmaak.js';
import { LABEL_OVERIG } from '../../privacy.js';
import { chiKwadraat, chi2Sf, aanpassingsToets, effectGrootte } from '../../statistiek.js';
import { fisherExact2x2 } from '../verdelingen.js';
import { tabel, cel, tekstCel, verborgenCel, aantalCel, voeg, melding, sluitAf, methode } from '../uitvoer.js';
import {
  P_GEEN_TOETS, P_TE_WEINIG, P_SAMENGEVOEGD, P_VERDELING_PER_GROEP, P_WORTEL_KRUIS, UITLEG_RESIDUEN, ZIN_SIG_VERBAND, ZIN_GEEN_SIG_VERBAND, LET_OP_VERBAND, g, apaZinnen, effectWoord,
} from '../uitvoer-tekst.js';
import { inSelectie, groepVanRijen, selectieControle, begin, weiger, overlapFout, variabelenUit, tel, isVastGetalOfIndeling, beschermdeWortel, splitstVerborgen } from './basis.js';
import { groepKeuze } from './beschrijven.js';
import { wortelVan } from '../transformaties.js';

const ALFA = 0.05;
const som = (a) => a.reduce((t, x) => t + x, 0);

/**
 * Regel A op de steekproef: (beschermde) groepen met een totaal onder d gaan samen met andere.
 * groepen: de beschermde groepen [{ label, labels, samengevoegd }]. Geeft per oude groep de nieuwe groep (−1 = valt
 * weg) en de nieuwe groepen; een groep die uit meer dan één beschermde groep bestaat heet "Overige groepen samen".
 */
export function voegKleineSamen(aantallen, groepen, d) {
  const b = beschermIndeling(aantallen, groepen.map((x) => x.label), d);
  return {
    naar: Array.from(b.groepVan),
    groepen: b.groepen.map((gr) => (gr.categorieen.length === 1
      ? { ...groepen[gr.categorieen[0]] }
      : { label: LABEL_OVERIG, labels: gr.categorieen.flatMap((i) => groepen[i].labels), samengevoegd: true, metLeeg: gr.categorieen.some((i) => groepen[i].metLeeg) })),
    bruikbaar: b.bruikbaar,
  };
}

/** Rijen naar nieuwe groepnummers. */
export function herindeel(groep, naar) {
  const uit = new Int32Array(groep.length).fill(-1);
  for (let r = 0; r < groep.length; r++) if (groep[r] >= 0) uit[r] = naar[groep[r]];
  return uit;
}

/**
 * Regel D voor randtotalen: een rij of kolom waarvan het totaal met een buur 1 tot 4 verschilt, gaat samen met de
 * kleinste andere (herhalen). Geeft de nieuwe indeling, of null als er minder dan 2 overblijven.
 */
export function randenMetBuren(ctx, basisAlles, groep, groepen) {
  if (!ctx.selectie) return { groep, groepen };
  let g2 = groep;
  let gr = groepen;
  for (let ronde = 0; ronde < 50; ronde++) {
    const n = gr.length;
    const telIn2 = (masker) => {
      const t = new Array(n).fill(0);
      for (let r = 0; r < basisAlles.length; r++) if (basisAlles[r] && g2[r] >= 0 && (!masker || masker[r])) t[g2[r]]++;
      return t;
    };
    const tF = telIn2(ctx.selectie.F);
    let fout = -1;
    for (const b of ctx.selectie.buren) {
      const tN = telIn2(b.masker);
      fout = tN.findIndex((x, i) => !verschilVeilig(x, tF[i], ctx.d));
      if (fout >= 0) break;
    }
    if (fout < 0) return { groep: g2, groepen: gr };
    if (n <= 2) return null;
    // Samen met de kleinste andere groep.
    let ander = -1;
    for (let i = 0; i < n; i++) if (i !== fout && (ander < 0 || tF[i] < tF[ander])) ander = i;
    const naar = gr.map((_, i) => (i === ander ? fout : i));
    const nieuwNr = [];
    naar.forEach((x) => { if (!nieuwNr.includes(x)) nieuwNr.push(x); });
    const map = naar.map((x) => nieuwNr.indexOf(x));
    const samen = nieuwNr.map((oud) => ({ label: '', labels: gr.flatMap((x, i) => (naar[i] === oud ? x.labels : [])), samengevoegd: true, metLeeg: gr.some((x, i) => naar[i] === oud && x.metLeeg) }));
    for (const x of samen) {
      const enkel = gr.filter((y, i) => naar[i] === nieuwNr[samen.indexOf(x)]);
      if (enkel.length === 1) Object.assign(x, enkel[0]);
      else { x.samengevoegd = true; x.label = LABEL_OVERIG; }
    }
    g2 = herindeel(g2, map);
    gr = samen;
  }
  return null;
}

/**
 * P1, P2 in een kruistabel: de groepen van wortel W die in de kruistabel W × y niet los te zien zijn (samengevoegd,
 * een rij met een verborgen cel, of bij een getal door Gemiddelden per groep en het dashboard verborgen).
 * Geeft per groep van W true = verborgen.
 */
function verborgenBijWortel(ds, ctx, W, y) {
  const gW = groepVanRijen(ds, W);
  const gy = groepVanRijen(ds, y);
  const ngW = W.beschermd.groepen.length;
  const ngy = y.beschermd.groepen.length;
  const basisAlles = new Uint8Array(ds.n);
  for (let r = 0; r < ds.n; r++) basisAlles[r] = gW[r] >= 0 && gy[r] >= 0 ? 1 : 0;
  const basis = inSelectie(basisAlles, ctx.selectie);
  const H = new Array(ngW).fill(false);
  const tW = new Array(ngW).fill(0);
  const ty = new Array(ngy).fill(0);
  for (let r = 0; r < ds.n; r++) if (basis[r]) { tW[gW[r]]++; ty[gy[r]]++; }
  const sW = voegKleineSamen(tW, W.beschermd.groepen, ctx.d);
  const sy = voegKleineSamen(ty, y.beschermd.groepen, ctx.d);
  sW.naar.forEach((nieuw, i) => { if (tW[i] > 0 && (nieuw < 0 || sW.groepen[nieuw]?.samengevoegd)) H[i] = true; });
  if (sW.bruikbaar && sy.bruikbaar) {
    const rij = herindeel(gW, sW.naar);
    const kol = herindeel(gy, sy.naar);
    const T = telTabel(basis, null, rij, kol, sW.groepen.length, sy.groepen.length);
    const weg = maskeerMetBuren(T, ctx.d, buurTabellen(ctx.selectie, basisAlles, rij, kol, sW.groepen.length, sy.groepen.length, ctx.d));
    sW.naar.forEach((nieuw, i) => { if (tW[i] > 0 && nieuw >= 0 && weg[nieuw].some(Boolean)) H[i] = true; });
  } else {
    tW.forEach((n, i) => { if (n > 0) H[i] = true; });
  }
  if (isGetal(y)) {
    const k = groepKeuze(ds, ctx, getalWeergave(y), W);
    if (!k.fout) {
      const mee = new Set(k.keuze.mee);
      k.aantallen.forEach((n, i) => { if (n > 0 && !mee.has(i)) H[i] = true; });
    }
  }
  return H;
}

/**
 * Splitst indeling x (met de groepen na samenvoegen) de verborgen groepen van zijn beschermde wortel bij y? Dan volgt
 * een verborgen groep uit deze kruistabel en die van de wortel. Geeft null of de melding. Ook voor de logistische
 * regressie (wat: 'deze analyse'), die met één voorspeller met groepen dezelfde kruistabel is.
 */
export function wortelFout(ds, ctx, x, groepx, nx, y, basis, wat = 'deze kruistabel') {
  const W = beschermdeWortel(ds, x);
  if (!W || W.id === y.id || wortelVan(ds, y).id === W.id) return null;
  const H = verborgenBijWortel(ds, ctx, W, y);
  if (!H.some(Boolean)) return null;
  const weg = splitstVerborgen(groepVanRijen(ds, W), H, groepx, nx, basis);
  return weg.some(Boolean) ? P_WORTEL_KRUIS(x.label, W.label, W.beschermd.groepen.filter((_, i) => H[i]).map((gr) => gr.label), wat) : null;
}

/**
 * Toetsen bij een kruistabel zonder verborgen cellen: Pearson χ², G², bij 2 × 2 ook Yates, Fisher en phi;
 * Cramérs V, verwachte aantallen en aangepaste residuen. Rijen en kolommen moeten een totaal > 0 hebben.
 */
export function kruistabelToetsen(T) {
  const chi = chiKwadraat(T);
  if (!chi) return null;
  const rijTot = T.map(som);
  const kolTot = T[0].map((_, j) => som(T.map((r) => r[j])));
  const N = som(rijTot);
  const verwacht = T.map((r, i) => r.map((_, j) => (rijTot[i] * kolTot[j]) / N));
  let g2 = 0;
  T.forEach((r, i) => r.forEach((o, j) => { if (o > 0) g2 += 2 * o * Math.log(o / verwacht[i][j]); }));
  const tweeBijTwee = T.length === 2 && T[0].length === 2;
  let yates = null;
  if (tweeBijTwee) {
    yates = 0;
    T.forEach((r, i) => r.forEach((o, j) => { yates += Math.max(0, Math.abs(o - verwacht[i][j]) - 0.5) ** 2 / verwacht[i][j]; }));
  }
  const residuen = T.map((r, i) => r.map((o, j) => (o - verwacht[i][j]) / Math.sqrt(verwacht[i][j] * (1 - rijTot[i] / N) * (1 - kolTot[j] / N))));
  return {
    chi2: chi.chi2, df: chi.df, p: chi.p, cramersV: chi.cramersV,
    g2, pG2: chi2Sf(g2, chi.df),
    yates, pYates: yates === null ? null : chi2Sf(yates, 1),
    fisher: tweeBijTwee ? fisherExact2x2(T)?.p ?? null : null,
    phi: tweeBijTwee ? (T[0][0] * T[1][1] - T[0][1] * T[1][0]) / Math.sqrt(rijTot[0] * rijTot[1] * kolTot[0] * kolTot[1]) : null,
    verwacht,
    residuen,
  };
}

export function kruistabel(ds, spec, ctx) {
  const titel = 'Kruistabel en chi-kwadraat';
  const [{ v: a } = {}] = variabelenUit(ds, spec, 'rij');
  const [{ v: b } = {}] = variabelenUit(ds, spec, 'kolom');
  const u = begin(ds, spec, ctx, titel, `Rijen: ${a?.label || ''}; kolommen: ${b?.label || ''}`);
  for (const v of [a, b]) {
    if (!isIndeling(v)) return weiger(ds, spec, ctx, titel, 'fout', `“${v?.label || 'Deze variabele'}” is geen indeling met vaste groepen.`);
    if (v.beschermd.groepen.length > 20) return weiger(ds, spec, ctx, titel, 'fout', `“${v.label}” heeft meer dan 20 groepen. Deel hem eerst in minder groepen in.`);
  }
  if (a.id === b.id) return weiger(ds, spec, ctx, titel, 'fout', 'Kies voor de rijen en de kolommen twee verschillende variabelen.');
  const overlap = overlapFout(ds, ctx, [a, b]);
  if (overlap) return weiger(ds, spec, ctx, titel, 'privacy', overlap);
  // Wie in een groep zit (ook wie een achtergrondvraag oversloeg en bij "Overige groepen samen" hoort).
  let rij = groepVanRijen(ds, a);
  let kol = groepVanRijen(ds, b);
  const basisAlles = new Uint8Array(ds.n);
  for (let r = 0; r < ds.n; r++) basisAlles[r] = rij[r] >= 0 && kol[r] >= 0 ? 1 : 0;
  const sel = selectieControle(ctx, basisAlles);
  if (sel) return weiger(ds, spec, ctx, titel, 'privacy', sel);
  const basis = inSelectie(basisAlles, ctx.selectie);
  const N = tel(basis);
  if (N < 10) return weiger(ds, spec, ctx, titel, 'fout', P_TE_WEINIG(10));

  // Regel A op de randtotalen van de steekproef, daarna regel D op de randtotalen.
  const indeel = (v, groep) => {
    const groepen = v.beschermd.groepen;
    const t = new Array(groepen.length).fill(0);
    for (let r = 0; r < ds.n; r++) if (basis[r]) t[groep[r]]++;
    const s = voegKleineSamen(t, groepen, ctx.d);
    if (!s.bruikbaar) return null;
    let nieuw = herindeel(groep, s.naar);
    let gr = s.groepen;
    const d = randenMetBuren(ctx, basisAlles, nieuw, gr);
    if (!d) return null;
    nieuw = d.groep;
    gr = d.groepen;
    return { groep: nieuw, groepen: gr };
  };
  const ri = indeel(a, rij);
  const ki = indeel(b, kol);
  if (!ri || !ki) return weiger(ds, spec, ctx, titel, 'privacy', `Er blijven geen twee groepen van minstens ${ctx.d} respondenten over in de ${!ri ? 'rijen' : 'kolommen'}. Kies een andere selectie of andere variabelen.`);
  rij = ri.groep;
  kol = ki.groep;
  const nr = ri.groepen.length;
  const nk = ki.groepen.length;
  const T = telTabel(basis, null, rij, kol, nr, nk);
  const buren = buurTabellen(ctx.selectie, basisAlles, rij, kol, nr, nk, ctx.d);
  const verborgen = maskeerMetBuren(T, ctx.d, buren);
  const ietsWeg = verborgen.some((r) => r.some(Boolean));
  // P3: een schaal- of cijfervraag per groep met verborgen of samengevoegde cellen is uit het gemiddelde en de spreiding
  // per groep terug te rekenen (die staan op het dashboard en bij Gemiddelden per groep). Dan geen kruistabel.
  // Ook voor een indeling van zo'n vraag ("Indelen in groepen", ook met één waarde per groep): het gemiddelde per groep
  // van de vraag zelf staat op het dashboard.
  for (const [v, ind] of [[a, ri], [b, ki]]) {
    if (isVastGetalOfIndeling(ds, v) && (ietsWeg || ind.groepen.some((x) => x.samengevoegd))) return weiger(ds, spec, ctx, titel, 'privacy', P_VERDELING_PER_GROEP(v.label));
  }
  // P1, P2: een eigen indeling van een beschermde indeling (zoals "Productie of rest" van afdeling) mag de groepen die
  // daar verborgen blijven niet uit elkaar halen.
  for (const [x, groepx, nx, y] of [[a, rij, nr, b], [b, kol, nk, a]]) {
    const fout = wortelFout(ds, ctx, x, groepx, nx, y, basis);
    if (fout) return weiger(ds, spec, ctx, titel, 'privacy', fout);
  }
  const rijTot = T.map(som);
  const kolTot = T[0].map((_, j) => som(T.map((r) => r[j])));
  u.gegevens.n = N;

  const procenten = spec.opties?.procenten || 'rij';
  const procent = (i, j) => (procenten === 'rij' ? (T[i][j] / rijTot[i]) * 100 : procenten === 'kolom' ? (T[i][j] / kolTot[j]) * 100 : (T[i][j] / N) * 100);
  const rijen = [];
  T.forEach((r, i) => {
    rijen.push([tekstCel(ri.groepen[i].label), ...r.map((c, j) => aantalCel(c, verborgen[i][j])), cel(rijTot[i], 'aantal')]);
    if (procenten !== 'geen') {
      rijen.push([tekstCel(`% ${procenten === 'rij' ? 'binnen de rij' : procenten === 'kolom' ? 'binnen de kolom' : 'van het totaal'}`, { zacht: true }),
        ...r.map((c, j) => (verborgen[i][j] ? verborgenCel('procent') : cel(procent(i, j), 'procent'))),
        cel(procenten === 'rij' ? 100 : procenten === 'kolom' ? (rijTot[i] / N) * 100 : (rijTot[i] / N) * 100, 'procent')]);
    }
  });
  rijen.push([tekstCel('Totaal', { nadruk: true }), ...kolTot.map((c) => cel(c, 'aantal')), cel(N, 'aantal')]);
  voeg(u, tabel('kruistabel', `Kruistabel “${a.label}” × “${b.label}”`, ['', ...ki.groepen.map((x) => x.label), 'Totaal'], rijen,
    { samenstelling: { rijen: ri.groepen.map((x) => x.labels), kolommen: ki.groepen.map((x) => x.labels), procentrijen: procenten !== 'geen' } }));
  for (const x of [...ri.groepen, ...ki.groepen].filter((y) => y.samengevoegd)) voeg(u, melding('privacy', P_SAMENGEVOEGD(x.labels, x.metLeeg)));

  if (ietsWeg) {
    voeg(u, melding('privacy', P_GEEN_TOETS));
    u.duiding.zinnen.push('Omdat niet elke combinatie minstens 5 respondenten heeft, is er geen toets op samenhang berekend.');
    return sluitAf(u);
  }
  // Toetsen (alleen zonder verborgen cellen: regel C).
  const t = kruistabelToetsen(T);
  const chi = t ? { chi2: t.chi2, df: t.df, p: t.p, cramersV: t.cramersV } : null;
  const E = t?.verwacht;
  const toetsRijen = [];
  if (chi) {
    const vlak = E.flat();
    const klein = vlak.filter((e) => e < 5).length;
    const kleinste = Math.min(...vlak);
    toetsRijen.push([tekstCel('Chi-kwadraat van Pearson'), cel(chi.chi2, 'stat'), cel(chi.df, 'df'), cel(chi.p, 'p')]);
    if (t.yates !== null) toetsRijen.push([tekstCel('Continuïteitscorrectie (Yates)'), cel(t.yates, 'stat'), cel(1, 'df'), cel(t.pYates, 'p')]);
    toetsRijen.push([tekstCel('Aannemelijkheidsquotiënt (G²)'), cel(t.g2, 'stat'), cel(chi.df, 'df'), cel(t.pG2, 'p')]);
    if (t.fisher !== null) {
      toetsRijen.push([tekstCel('Exacte toets van Fisher (tweezijdig)'), tekstCel(''), tekstCel(''), cel(t.fisher, 'p')]);
      methode(u, 'fisher');
    }
    toetsRijen.push([tekstCel('N geldig'), cel(N, 'aantal'), tekstCel(''), tekstCel('')]);
    methode(u, 'chi2');
    u.toetsen += 1;
    const voetnoot = `${klein} ${klein === 1 ? 'cel' : 'cellen'} (${g((klein / vlak.length) * 100, 0)}%) ${klein === 1 ? 'heeft' : 'hebben'} een verwacht aantal kleiner dan 5. Het kleinste verwachte aantal is ${g(kleinste, 2)}.`;
    const onbetrouwbaar = klein / vlak.length > 0.2 || kleinste < 1;
    voeg(u, tabel('chi2', 'Chi-kwadraattoetsen', ['Toets', 'Waarde', 'df', 'p'], toetsRijen,
      { voetnoten: [voetnoot, onbetrouwbaar ? 'Let op: de chi-kwadraattoets is hier niet betrouwbaar, omdat te veel verwachte aantallen klein zijn.' : null] }));
    const sterkte = [[tekstCel('Cramérs V'), cel(chi.cramersV, 'r'), cel(chi.p, 'p')]];
    if (t.phi !== null) sterkte.unshift([tekstCel('Phi'), cel(t.phi, 'r'), cel(chi.p, 'p')]);
    voeg(u, tabel('sterkte', 'Sterkte van het verband', ['Maat', 'Waarde', 'p'], sterkte));
    if (spec.opties?.verwacht) {
      voeg(u, tabel('verwacht', 'Verwachte aantallen', ['', ...ki.groepen.map((x) => x.label)], E.map((r, i) => [tekstCel(ri.groepen[i].label), ...r.map((e) => cel(e, 'verwacht'))])));
    }
    if (spec.opties?.residuen) {
      const res = t.residuen;
      voeg(u, tabel('residuen', 'Aangepaste residuen', ['', ...ki.groepen.map((x) => x.label)], res.map((r, i) => [tekstCel(ri.groepen[i].label), ...r.map((x) => cel(x, 'stat', Math.abs(x) > 2 ? { nadruk: true } : {}))]), { uitleg: UITLEG_RESIDUEN }));
      u.duiding.zinnen.push(UITLEG_RESIDUEN);
    }
    const significant = chi.p < ALFA;
    const effect = effectGrootte(chi.cramersV, 'v');
    u.duiding.significant = significant;
    u.duiding.effect = effect;
    u.duiding.zinnen.unshift(significant ? ZIN_SIG_VERBAND : ZIN_GEEN_SIG_VERBAND,
      `Het verband tussen “${a.label}” en “${b.label}” is ${effectWoord(effect)} (Cramérs V = ${g(chi.cramersV)}).`);
    if (onbetrouwbaar) u.duiding.zinnen.push('Omdat veel verwachte aantallen klein zijn, is de toets hier niet betrouwbaar. Voeg zo mogelijk groepen samen.');
    u.duiding.zinnen.push(LET_OP_VERBAND);
    u.apa = apaZinnen((f) => `χ²(${f.df(chi.df)}; *N* = ${f.n(N)}) = ${f.g(chi.chi2)}; ${f.p(chi.p)}; Cramérs *V* = ${f.begrensd(chi.cramersV)}.`);
  }
  return sluitAf(u);
}

// ---------- Aanpassingstoets ----------

export function aanpassing(ds, spec, ctx) {
  const titel = 'Chi-kwadraat aanpassingstoets';
  const [{ v } = {}] = variabelenUit(ds, spec, 'variabele');
  const u = begin(ds, spec, ctx, titel, `Indeling: ${v?.label || ''}`);
  if (!isIndeling(v)) return weiger(ds, spec, ctx, titel, 'fout', `“${v?.label || 'Deze variabele'}” is geen indeling met vaste groepen.`);
  const overlap = overlapFout(ds, ctx, [v]);
  if (overlap) return weiger(ds, spec, ctx, titel, 'privacy', overlap);
  const groep = groepVanRijen(ds, v);
  const basisAlles = new Uint8Array(ds.n);
  for (let r = 0; r < ds.n; r++) basisAlles[r] = groep[r] >= 0 ? 1 : 0;
  const sel = selectieControle(ctx, basisAlles);
  if (sel) return weiger(ds, spec, ctx, titel, 'privacy', sel);
  const basis = inSelectie(basisAlles, ctx.selectie);
  const N = tel(basis);
  if (N < 10) return weiger(ds, spec, ctx, titel, 'fout', P_TE_WEINIG(10));
  const groepen = v.beschermd.groepen;
  const t = new Array(groepen.length).fill(0);
  for (let r = 0; r < ds.n; r++) if (basis[r]) t[groep[r]]++;
  // Regel A op de steekproef; de verwachte aantallen van samengevoegde groepen tellen op.
  const s = voegKleineSamen(t, groepen, ctx.d);
  if (!s.bruikbaar) return weiger(ds, spec, ctx, titel, 'privacy', `Er blijven geen twee groepen van minstens ${ctx.d} respondenten over.`);
  let nieuw = herindeel(groep, s.naar);
  let gr = s.groepen;
  const rd = randenMetBuren(ctx, basisAlles, nieuw, gr);
  if (!rd) return weiger(ds, spec, ctx, titel, 'privacy', `Er blijven geen twee groepen van minstens ${ctx.d} respondenten over.`);
  nieuw = rd.groep;
  gr = rd.groepen;
  // P3: met een selectie is dit de verdeling binnen die selectie; samengevoegde waarden van een schaal- of cijfervraag
  // zijn dan uit het gemiddelde en de spreiding van de selectie terug te rekenen.
  if (ctx.selectie && !ctx.selectie.impliciet && isVastGetalOfIndeling(ds, v) && gr.some((x) => x.samengevoegd)) return weiger(ds, spec, ctx, titel, 'privacy', P_VERDELING_PER_GROEP(v.label));
  const waargenomen = new Array(gr.length).fill(0);
  for (let r = 0; r < ds.n; r++) if (basis[r] && nieuw[r] >= 0) waargenomen[nieuw[r]]++;
  // Verwacht: gelijk, of per categorie een aantal (bijvoorbeeld medewerkers); per groep opgeteld.
  const aantallen = spec.opties?.aantallen || {};
  const gelijk = (spec.opties?.verwacht || (Object.keys(aantallen).length ? 'aantallen' : 'gelijk')) === 'gelijk';
  const categorieAantal = (label) => {
    const l = v.labels.find((x) => x.label === label);
    if (!l) return 0;
    for (const bw of [l.bronwaarde, ...(l.bronwaarden || [])]) if (Object.hasOwn(aantallen, String(bw))) return Number(aantallen[String(bw)]) || 0;
    return 0;
  };
  const populatie = gelijk ? gr.map(() => 1) : gr.map((x) => som(x.labels.map(categorieAantal)));
  if (!gelijk && !(som(populatie) > 0)) return weiger(ds, spec, ctx, titel, 'fout', 'Vul bij de opties per groep het verwachte aantal in (bijvoorbeeld het aantal medewerkers).');
  u.gegevens.n = N;
  const toets = aanpassingsToets(waargenomen, populatie);
  const totPop = som(populatie);
  const rijen = gr.map((x, i) => {
    const verwacht = (N * populatie[i]) / totPop;
    const pW = (waargenomen[i] / N) * 100;
    const pV = (populatie[i] / totPop) * 100;
    return [tekstCel(x.label), cel(waargenomen[i], 'aantal'), cel(verwacht, 'verwacht'), cel(waargenomen[i] - verwacht, 'verwacht'), cel(pW, 'procent'), cel(pV, 'procent'), cel(pW - pV, 'stat')];
  });
  rijen.push([tekstCel('Totaal', { nadruk: true }), cel(N, 'aantal'), cel(N, 'verwacht'), tekstCel(''), cel(100, 'procent'), cel(100, 'procent'), tekstCel('')]);
  voeg(u, tabel('aanpassing', 'Waargenomen en verwacht', ['Groep', 'Waargenomen', 'Verwacht', 'Verschil', '% waargenomen', '% verwacht', 'Verschil (procentpunt)'], rijen));
  for (const x of gr.filter((y) => y.samengevoegd)) voeg(u, melding('privacy', `${P_SAMENGEVOEGD(x.labels, x.metLeeg)} Hun verwachte aantallen zijn opgeteld.`));
  if (!gelijk && gr.some((y) => y.metLeeg)) voeg(u, melding('waarschuwing', `In “${LABEL_OVERIG}” kunnen ook mensen meetellen die de vraag niet invulden. Die groep kan daardoor wat groter lijken dan verwacht.`));
  if (!toets || toets.reden) {
    voeg(u, melding('waarschuwing', toets?.reden === 'klein' ? 'De toets is niet berekend, omdat een verwacht aantal kleiner is dan 5. Voeg groepen samen.' : 'De toets is niet te berekenen.'));
    return sluitAf(u);
  }
  voeg(u, tabel('toets', 'Toets', ['Toets', 'Chi-kwadraat', 'df', 'p'], [[tekstCel('Chi-kwadraat aanpassingstoets'), cel(toets.chi2, 'stat'), cel(toets.df, 'df'), cel(toets.p, 'p')]]));
  methode(u, 'chi2-aanpassing');
  u.toetsen += 1;
  const significant = toets.p < ALFA;
  u.duiding.significant = significant;
  // Woorden zoals K S13: "geen aanwijzing" is niet hetzelfde als "gelijk".
  u.duiding.zinnen.push(significant
    ? `Naar “${v.label}” wijkt de groep respondenten af van de verwachte verdeling (chi-kwadraattoets, ${pTekst(toets.p)}).`
    : `Er is geen duidelijke aanwijzing dat de respondenten naar “${v.label}” afwijken van de verwachte verdeling (chi-kwadraattoets, ${pTekst(toets.p)}). Bij weinig respondenten zegt dat weinig.`,
  'Kijk ook naar de verschillen in procentpunten: die laten zien welke groepen meer of minder meededen dan je zou verwachten.');
  if (!gelijk) u.duiding.zinnen.push('Hiermee controleer je of de respons lijkt op de organisatie.');
  u.apa = apaZinnen((f) => `χ²(${f.df(toets.df)}; *N* = ${f.n(N)}) = ${f.g(toets.chi2)}; ${f.p(toets.p)}.`);
  return sluitAf(u);
}
