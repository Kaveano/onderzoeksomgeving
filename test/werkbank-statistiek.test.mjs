// Rekentests van de werkbank tegen SciPy 1.18.1 en statsmodels 0.15.0 (BOUWPLAN P4 criterium 1, D2 §13.1–§13.2).
// De referentiewaarden staan in test/fixtures/werkbank-referentie.json (gemaakt met
// python3 -I test/referentie/werkbank_referentie.py, zaad 20261127; versies in de kop).
// Plus identiteiten, randgevallen (D2 §6.4) en een controle dat er nooit NaN of Infinity uitkomt.
// Uitvoeren: node --test test/werkbank-statistiek.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Phi, ptukey, ptukeyBoven, qtukey, fisherExact2x2, holm, bonferroni, normaalTweezijdig } from '../public/js/beheer/werkbank/verdelingen.js';
import { cholesky, inverseSpd, logDeterminant, jacobiEigen, kleinsteKwadraten, correlatieMatrix } from '../public/js/beheer/werkbank/matrix.js';
import { beschrijving, vorm } from '../public/js/beheer/werkbank/procedures/beschrijven.js';
import { levene, studentT, gamesHowellPaar, tukeyPaar, dunn, anovaTabel } from '../public/js/beheer/werkbank/procedures/groepen.js';
import { kruistabelToetsen } from '../public/js/beheer/werkbank/procedures/kruistabel.js';
import { betrouwbaarheidVan, alfaOordeel } from '../public/js/beheer/werkbank/procedures/schalen.js';
import { welchT, cohensD, mannWhitney, welchAnova, kruskalWallis, pearson, spearman, aanpassingsToets, tCdf } from '../public/js/beheer/statistiek.js';
import { lcg } from './werkbank-fixture.mjs';

const REF = JSON.parse(readFileSync(new URL('./fixtures/werkbank-referentie.json', import.meta.url), 'utf8'));

/** |a − b| ≤ max(abs, rel·|b|) */
function dicht(a, b, { rel = 1e-9, abs = 1e-12 } = {}, wat = '') {
  assert.ok(typeof a === 'number' && Number.isFinite(a), `${wat}: geen getal (${a})`);
  const marge = Math.max(abs, rel * Math.abs(b));
  assert.ok(Math.abs(a - b) <= marge, `${wat}: ${a} ≠ ${b} (verschil ${Math.abs(a - b)}, marge ${marge})`);
}

test('de referentie is gemaakt met SciPy 1.18.1 en statsmodels 0.15.0 (zaad 20261127)', () => {
  assert.equal(REF.kop.scipy, '1.18.1');
  assert.equal(REF.kop.statsmodels, '0.15.0');
  assert.equal(REF.kop.zaad, 20261127);
});

test('Φ (Cody) gelijk aan scipy.special.ndtr', () => {
  REF.phi.x.forEach((x, i) => dicht(Phi(x), REF.phi.cdf[i], { rel: 1e-13, abs: 1e-300 }, `Φ(${x})`));
  dicht(normaalTweezijdig(1.959963984540054), 0.05, { rel: 1e-12 }, 'tweezijdig 1,96');
});

test('beschrijvende statistiek: gemiddelde, sd, se, 95%-BI, scheefheid en kurtosis met SE (SPSS)', () => {
  for (const r of REF.beschrijvend) {
    const b = beschrijving(r.x);
    const f = vorm(r.x);
    dicht(b.gemiddelde, r.gemiddelde, {}, 'gemiddelde');
    dicht(b.sd, r.sd, {}, 'sd');
    dicht(b.se, r.se, {}, 'se');
    dicht(b.ciLaag, r.ci[0], { rel: 1e-9 }, 'ci laag');
    dicht(b.ciHoog, r.ci[1], { rel: 1e-9 }, 'ci hoog');
    dicht(f.scheef, r.scheef, { rel: 1e-9 }, 'scheefheid');
    dicht(f.seScheef, r.se_scheef, {}, 'se scheefheid');
    dicht(f.kurtosis, r.kurtosis, { rel: 1e-9 }, 'kurtosis');
    dicht(f.seKurtosis, r.se_kurtosis, {}, 'se kurtosis');
  }
});

test('twee groepen: Levene (gemiddelde en mediaan), Student, Welch, Mann-Whitney, d en g', () => {
  for (const r of REF.tweegroepen) {
    const lev = levene([r.a, r.b], 'gemiddelde');
    dicht(lev.f, r.levene_gemiddelde.f, { rel: 1e-9 }, 'Levene F');
    dicht(lev.p, r.levene_gemiddelde.p, { rel: 1e-8, abs: 1e-10 }, 'Levene p');
    const lm = levene([r.a, r.b], 'mediaan');
    dicht(lm.f, r.levene_mediaan.f, { rel: 1e-9 }, 'Brown-Forsythe F');
    dicht(lm.p, r.levene_mediaan.p, { rel: 1e-8, abs: 1e-10 }, 'Brown-Forsythe p');
    const st = studentT(r.a, r.b);
    dicht(st.t, r.student.t, {}, 'Student t');
    dicht(st.df, r.student.df, {}, 'Student df');
    dicht(st.p, r.student.p, { abs: 1e-10, rel: 1e-8 }, 'Student p');
    dicht(st.ciLaag, r.student.ci[0], { rel: 1e-9 }, 'Student ci');
    dicht(st.ciHoog, r.student.ci[1], { rel: 1e-9 }, 'Student ci');
    const we = welchT(r.a, r.b);
    dicht(we.t, r.welch.t, {}, 'Welch t');
    dicht(we.df, r.welch.df, { rel: 1e-9 }, 'Welch df');
    dicht(we.p, r.welch.p, { abs: 1e-10, rel: 1e-8 }, 'Welch p');
    dicht(we.ciLaag, r.welch.ci[0], { rel: 1e-8 }, 'Welch ci');
    const mw = mannWhitney(r.a, r.b);
    dicht(mw.u, r.mannwhitney.u, {}, 'U');
    dicht(mw.p, r.mannwhitney.p, { abs: 1e-10, rel: 1e-8 }, 'MW p');
    const d = cohensD(r.a, r.b);
    dicht(d.d, r.cohen_d, {}, 'd');
    dicht(d.g, r.hedges_g, {}, 'g');
  }
});

test('meer groepen: ANOVA, η², ω², Welch, Levene, Kruskal-Wallis, Tukey, Games-Howell en Dunn', () => {
  for (const r of REF.meergroepen) {
    const k = r.groepen.length;
    const at = anovaTabel(r.groepen);
    dicht(at.f, r.anova.f, {}, 'F');
    dicht(at.p, r.anova.p, { abs: 1e-10, rel: 1e-8 }, 'p');
    dicht(at.ssb, r.anova.ssb, {}, 'SSB');
    dicht(at.ssw, r.anova.ssw, {}, 'SSW');
    dicht(at.eta2, r.anova.eta2, {}, 'η²');
    dicht(at.omega2, r.anova.omega2, { abs: 1e-12 }, 'ω²');
    const wa = welchAnova(r.groepen);
    dicht(wa.f, r.welch.f, { rel: 1e-9 }, 'Welch F');
    dicht(wa.df2, r.welch.df2, { rel: 1e-9 }, 'Welch df2');
    dicht(wa.p, r.welch.p, { abs: 1e-10, rel: 1e-8 }, 'Welch p');
    const lev = levene(r.groepen);
    dicht(lev.f, r.levene.f, { rel: 1e-9 }, 'Levene F');
    const kw = kruskalWallis(r.groepen);
    dicht(kw.h, r.kruskal.h, { rel: 1e-9 }, 'H');
    dicht(kw.p, r.kruskal.p, { abs: 1e-10, rel: 1e-8 }, 'KW p');
    const N = r.groepen.reduce((t, g) => t + g.length, 0);
    const msw = r.anova.ssw / (N - k);
    for (const t of r.tukey) {
      const x = tukeyPaar(r.groepen[t.i], r.groepen[t.j], k, msw, N - k);
      dicht(x.verschil, t.verschil, {}, 'Tukey verschil');
      dicht(x.p, t.p, { abs: 1e-7, rel: t.p > 1e-4 ? 1e-4 : 1 }, `Tukey p ${t.i}-${t.j}`);
      dicht(x.ciLaag, t.ci[0], { rel: 1e-6, abs: 1e-8 }, 'Tukey ci laag');
      dicht(x.ciHoog, t.ci[1], { rel: 1e-6, abs: 1e-8 }, 'Tukey ci hoog');
    }
    for (const t of r.gameshowell) {
      const x = gamesHowellPaar(r.groepen[t.i], r.groepen[t.j], k);
      dicht(x.se, t.se, {}, 'GH se');
      dicht(x.df, t.df, { rel: 1e-9 }, 'GH df');
      dicht(x.p, t.p, { abs: 1e-7, rel: t.p > 1e-4 ? 1e-4 : 1 }, `GH p ${t.i}-${t.j}`);
      dicht(x.ciLaag, t.ci[0], { rel: 1e-6, abs: 1e-8 }, 'GH ci');
      dicht(x.ciHoog, t.ci[1], { rel: 1e-6, abs: 1e-8 }, 'GH ci');
    }
    const du = dunn(r.groepen);
    r.dunn.forEach((t, i) => {
      dicht(du[i].z, t.z, { rel: 1e-9 }, 'Dunn z');
      dicht(du[i].p, t.p, { abs: 1e-10, rel: 1e-8 }, 'Dunn p');
      dicht(du[i].pBonferroni, t.p_bonferroni, { abs: 1e-10, rel: 1e-8 }, 'Dunn Bonferroni');
    });
  }
});

test('gestudentiseerd bereik: ptukey en qtukey op het raster k × ν × q (SciPy studentized_range)', () => {
  const { q, raster } = REF.ptukey;
  let max = 0;
  for (const r of raster) {
    q.forEach((qq, i) => {
      const p = ptukey(qq, r.k, r.nu);
      const sf = ptukeyBoven(qq, r.k, r.nu);
      const fout = Math.abs(p - r.cdf[i]);
      max = Math.max(max, fout);
      assert.ok(fout <= 1e-7, `ptukey(${qq}, ${r.k}, ${r.nu}) = ${p}, SciPy ${r.cdf[i]}`);
      if (r.sf[i] > 1e-4) assert.ok(Math.abs(sf - r.sf[i]) <= 1e-4 * r.sf[i], `ptukeyBoven(${qq}, ${r.k}, ${r.nu})`);
    });
    dicht(qtukey(0.95, r.k, r.nu), r.q95, { rel: 1e-6 }, `qtukey(0,95; ${r.k}; ${r.nu})`);
  }
  assert.ok(max < 1e-7);
});

test('Fisher, Yates, G², aangepaste residuen, Cramérs V en de aanpassingstoets', () => {
  for (const r of REF.fisher) dicht(fisherExact2x2(r.tabel).p, r.p, { abs: 1e-10, rel: 1e-9 }, `Fisher ${JSON.stringify(r.tabel)}`);
  for (const r of REF.kruistabel) {
    const t = kruistabelToetsen(r.tabel);
    dicht(t.chi2, r.chi2, {}, 'χ²');
    assert.equal(t.df, r.df);
    dicht(t.p, r.p, { abs: 1e-10, rel: 1e-8 }, 'p');
    dicht(t.g2, r.g2, {}, 'G²');
    dicht(t.pG2, r.p_g2, { abs: 1e-10, rel: 1e-8 }, 'p G²');
    t.verwacht.flat().forEach((e, i) => dicht(e, r.verwacht[i], {}, 'verwacht'));
    t.residuen.flat().forEach((e, i) => dicht(e, r.residuen[i], { rel: 1e-9 }, 'residu'));
    dicht(t.cramersV, r.cramers_v, {}, 'V');
    if (r.yates !== undefined) {
      dicht(t.yates, r.yates, {}, 'Yates');
      dicht(t.pYates, r.p_yates, { abs: 1e-10, rel: 1e-8 }, 'p Yates');
    }
  }
  for (const r of REF.aanpassing) {
    const t = aanpassingsToets(r.waargenomen, r.populatie);
    dicht(t.chi2, r.chi2, {}, 'GoF χ²');
    assert.equal(t.df, r.df);
    dicht(t.p, r.p, { abs: 1e-10, rel: 1e-8 }, 'GoF p');
  }
});

test('correlaties per paar (Pearson, Spearman) en de correctie van Holm', () => {
  const { kolommen, paren } = REF.correlatie;
  const nul = (x) => (x === null ? NaN : x);
  const p = [];
  for (const r of paren) {
    const a = kolommen[r.i].map(nul);
    const b = kolommen[r.j].map(nul);
    const pr = pearson(a, b);
    const sp = spearman(a, b);
    assert.equal(pr.n, r.n);
    dicht(pr.r, r.r, {}, 'r');
    dicht(pr.p, r.p, { abs: 1e-10, rel: 1e-8 }, 'p r');
    dicht(sp.rho, r.rho, {}, 'rho');
    dicht(sp.p, r.p_rho, { abs: 1e-10, rel: 1e-8 }, 'p rho');
    p.push(pr.p);
  }
  holm(p).forEach((x, i) => dicht(x, paren[i].p_holm, { abs: 1e-10, rel: 1e-8 }, 'Holm'));
  assert.deepEqual(bonferroni([0.01, 0.2, null], 3), [0.03, 0.6000000000000001, null]);
});

test('betrouwbaarheid: α, gestandaardiseerde α, item-totaal, α zonder vraag en SMC', () => {
  for (const r of REF.betrouwbaarheid) {
    const b = betrouwbaarheidVan(r.rijen);
    dicht(b.alpha, r.alpha, {}, 'α');
    dicht(b.gestandaardiseerd, r.gestandaardiseerd, {}, 'gestandaardiseerd');
    r.items.forEach((it, j) => {
      dicht(b.items[j].gemiddelde, it.gemiddelde, {}, 'gem');
      dicht(b.items[j].sd, it.sd, {}, 'sd');
      dicht(b.items[j].schaalGemZonder, it.schaal_gem_zonder, {}, 'schaalgem');
      dicht(b.items[j].schaalVarZonder, it.schaal_var_zonder, {}, 'schaalvar');
      dicht(b.items[j].itemTotaal, it.item_totaal, {}, 'item-totaal');
      dicht(b.items[j].smc, it.smc, { rel: 1e-8 }, 'SMC');
      dicht(b.items[j].alfaZonder, it.alfa_zonder, {}, 'α zonder');
    });
    dicht(b.inter.gemiddelde, r.inter[0], {}, 'inter gem');
    dicht(b.inter.laagste, r.inter[1], {}, 'inter laag');
    dicht(b.inter.hoogste, r.inter[2], {}, 'inter hoog');
  }
  assert.ok(REF.betrouwbaarheid[1].items[2].item_totaal < 0, 'de niet omgescoorde vraag gaat tegen de rest in');
  assert.equal(alfaOordeel(0.695), 'voldoende');
  assert.equal(alfaOordeel(0.59), 'onvoldoende');
});

test('matrices: inverse, log-determinant, eigenwaarden (Jacobi) en kleinste kwadraten (QR)', () => {
  const { S, inverse, logdet, eigenwaarden } = REF.matrix;
  const inv = inverseSpd(S);
  inv.forEach((rij, i) => rij.forEach((x, j) => dicht(x, inverse[i][j], { rel: 1e-10, abs: 1e-13 }, 'inverse')));
  dicht(logDeterminant(cholesky(S)), logdet, { rel: 1e-12 }, 'logdet');
  const e = jacobiEigen(S);
  e.waarden.forEach((x, i) => dicht(x, eigenwaarden[i], { rel: 1e-10 }, 'eigenwaarde'));
  // A·v = λ·v en het grootste element positief.
  e.vectoren.forEach((v, k) => {
    const Av = S.map((rij) => rij.reduce((t, x, j) => t + x * v[j], 0));
    Av.forEach((x, i) => dicht(x, e.waarden[k] * v[i], { abs: 1e-9 }, 'eigenvector'));
    const groot = v.reduce((b, x, i) => (Math.abs(x) > Math.abs(v[b]) ? i : b), 0);
    assert.ok(v[groot] > 0);
  });
  const ols = REF.kleinste_kwadraten;
  const f = kleinsteKwadraten(ols.X, ols.y);
  f.beta.forEach((b, i) => dicht(b, ols.beta[i], { rel: 1e-10 }, 'β'));
  dicht(f.rss, ols.rss, { rel: 1e-10 }, 'RSS');
  const s2 = f.rss / (ols.y.length - ols.X[0].length);
  f.inverseXtX.forEach((rij, i) => dicht(Math.sqrt(s2 * rij[i]), ols.bse[i], { rel: 1e-9 }, 'SE'));
  // Een afhankelijke kolom wordt herkend.
  const X2 = ols.X.map((r) => [...r, r[1] * 2 - r[2]]);
  assert.deepEqual(kleinsteKwadraten(X2, ols.y), { afhankelijk: 4 });
  // Niet positief definiet.
  assert.equal(cholesky([[1, 2], [2, 1]]), null);
  assert.equal(inverseSpd([[1, 1], [1, 1]]), null);
  const R = correlatieMatrix([[1, 2], [2, 4], [3, 7]]);
  assert.equal(R[0][0], 1);
});

test('identiteiten: k = 2 is de t-verdeling; Welch-ANOVA met 2 groepen is Welch t²; Games-Howell met 2 groepen is Welch', () => {
  for (const nu of [2, 5, 17.3, 60]) {
    for (const q of [0.5, 1.4, 2.8, 4.1, 7]) {
      dicht(ptukey(q, 2, nu), 1 - 2 * tCdf(-q / Math.SQRT2, nu), { abs: 1e-9 }, `k=2, ν=${nu}, q=${q}`);
    }
  }
  const [{ a, b }] = REF.tweegroepen;
  const we = welchT(a, b);
  const wa = welchAnova([a, b]);
  dicht(wa.f, we.t * we.t, { rel: 1e-10 }, 'F = t²');
  dicht(wa.df2, we.df, { rel: 1e-10 }, 'df');
  const gh = gamesHowellPaar(a, b, 2);
  dicht(gh.p, we.p, { abs: 1e-8 }, 'GH p = Welch p');
  dicht(gh.ciLaag, -we.ciHoog, { rel: 1e-6 }, 'GH ci = Welch ci');
});

test('randgevallen: q ≤ 0, grote q, ν = ∞, qtukey heen en terug, Fisher met nullen, constante groepen', () => {
  assert.equal(ptukey(0, 3, 10), 0);
  assert.equal(ptukey(-1, 3, 10), 0);
  dicht(ptukey(60, 5, 10), 1, { abs: 1e-9 }, 'grote q');
  dicht(ptukey(3, 4, Infinity), ptukey(3, 4, 1e6), { abs: 1e-6 }, 'ν = ∞');
  for (const [p, k, nu] of [[0.95, 3, 12], [0.99, 6, 40], [0.5, 2, 5], [0.9, 12, 3]]) {
    dicht(ptukey(qtukey(p, k, nu), k, nu), p, { abs: 1e-9 }, `heen en terug ${p}, ${k}, ${nu}`);
  }
  assert.equal(ptukey(2, 1, 10), null);
  assert.equal(qtukey(1, 3, 10), null);
  assert.equal(fisherExact2x2([[0, 0], [0, 0]]), null);
  dicht(fisherExact2x2([[0, 5], [5, 0]]).p, 0.007936507936507936, { rel: 1e-9 }, 'Fisher met nullen');
  assert.equal(studentT([3, 3, 3], [3, 3, 3]), null);
  assert.equal(levene([[1, 1, 1], [2, 2, 2]]), null);
  assert.equal(gamesHowellPaar([2, 2, 2], [2, 2, 2], 3), null);
  assert.equal(anovaTabel([[1, 2, 3]]), null);
  assert.equal(betrouwbaarheidVan([[1, 1], [1, 1], [1, 1]]), null);
  assert.equal(beschrijving([]), null);
  assert.deepEqual(holm([]), []);
});

test('nooit NaN of Infinity: willekeurige invoer (leeg, constant, NaN, tekst) voor elke nieuwe functie', () => {
  const r = lcg(31);
  const rommel = () => {
    const soort = r.geheel(5);
    const n = r.geheel(12);
    return Array.from({ length: n }, () => {
      if (soort === 0) return 3;
      if (soort === 1) return r.getal() < 0.3 ? NaN : r.getal() * 10;
      if (soort === 2) return r.getal() < 0.2 ? 'weet_niet' : Math.round(r.getal() * 5);
      if (soort === 3) return r.getal() < 0.1 ? Infinity : r.getal() - 0.5;
      return r.geheel(1);
    });
  };
  const zuiver = (x, wat) => {
    if (x === null || x === undefined) return;
    if (typeof x === 'number') assert.ok(Number.isFinite(x), `${wat}: ${x}`);
    else if (Array.isArray(x) || ArrayBuffer.isView(x)) for (const y of x) zuiver(y, wat);
    else if (typeof x === 'object') for (const y of Object.values(x)) zuiver(y, wat);
  };
  for (let i = 0; i < 150; i++) {
    const a = rommel();
    const b = rommel();
    const c = rommel();
    zuiver(Phi(a[0]), 'Phi');
    zuiver(ptukey(a[0], 2 + r.geheel(5), b[0]), 'ptukey');
    zuiver(qtukey(r.getal(), 2 + r.geheel(5), 1 + r.geheel(30)), 'qtukey');
    zuiver(fisherExact2x2([[a[0], a[1]], [b[0], b[1]]]), 'fisher');
    zuiver(holm(a), 'holm');
    zuiver(bonferroni(a), 'bonferroni');
    zuiver(beschrijving(a), 'beschrijving');
    zuiver(vorm(a), 'vorm');
    zuiver(levene([a, b, c]), 'levene');
    zuiver(studentT(a, b), 'studentT');
    zuiver(gamesHowellPaar(a, b, 3), 'gamesHowell');
    zuiver(tukeyPaar(a, b, 3, r.getal(), 5), 'tukey');
    zuiver(dunn([a, b, c]), 'dunn');
    zuiver(anovaTabel([a, b, c]), 'anovaTabel');
    zuiver(betrouwbaarheidVan(a.map((x, k) => [x, b[k] ?? 1, c[k] ?? 2])), 'betrouwbaarheid');
    if (a.length > 1) {
      zuiver(inverseSpd([[a[0], a[1]], [a[1], a[0]]]), 'inverse');
      zuiver(jacobiEigen([[a[0], a[1]], [a[1], a[0]]]), 'jacobi');
      zuiver(kleinsteKwadraten(a.map((x) => [1, x]), b.slice(0, a.length)), 'ols');
    }
    const t = [[r.geheel(9), r.geheel(9)], [r.geheel(9), r.geheel(9)]];
    zuiver(kruistabelToetsen(t), 'kruistabel');
  }
});

test('tekst: schrijfwijze Rapport (p = 0,036) en APA (p = ,036), opmaak van cellen en × voor verborgen', async () => {
  const { schrijfwijze, opmaakCel, excelWaarde, pWaarde, apaZinnen } = await import('../public/js/beheer/werkbank/uitvoer-tekst.js');
  const r = schrijfwijze('rapport');
  const a = schrijfwijze('apa');
  assert.equal(r.p(0.036), '*p* = 0,036');
  assert.equal(a.p(0.036), '*p* = ,036');
  assert.equal(r.p(0.0004), '*p* < 0,001');
  assert.equal(a.p(0.0004), '*p* < ,001');
  assert.equal(a.begrensd(-0.31), '−,31');
  assert.equal(r.begrensd(0.34), '0,34');
  assert.equal(r.df(54.27), '54,3');
  assert.equal(r.df(118), '118');
  assert.equal(pWaarde(0.04996), '0,04996');
  assert.equal(opmaakCel({ w: 1234, soort: 'aantal' }), '1.234');
  assert.equal(opmaakCel({ w: 42.25, soort: 'procent' }), '42,3%');
  assert.equal(opmaakCel({ w: 0.3412, soort: 'r', ster: '**' }), '0,34**');
  assert.equal(opmaakCel({ w: 0.3412, soort: 'r' }, { doel: 'excel' }), '0,341');
  assert.equal(opmaakCel({ w: null, soort: 'aantal', verborgen: true }), '×');
  assert.equal(opmaakCel({ w: null, soort: 'gem' }), '–');
  assert.equal(excelWaarde({ w: 0.00002, soort: 'p' }), '< 0,001');
  assert.equal(excelWaarde({ w: 3.14159, soort: 'gem' }), 3.14);
  assert.equal(excelWaarde({ w: null, soort: 'aantal', verborgen: true }), '×');
  assert.deepEqual(apaZinnen((f) => `*r*(118) = ${f.begrensd(0.34)}; ${f.p(0.0001)}.`), { rapport: '*r*(118) = 0,34; *p* < 0,001.', apa: '*r*(118) = ,34; *p* < ,001.' });
});
