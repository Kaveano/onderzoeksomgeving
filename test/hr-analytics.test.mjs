// Tests voor HR-analytics: public/js/beheer/hr-analytics.js (verzamelKerncijfers en de losse maten) en
// public/js/beheer/hr-rapport.js (meelezer, controle, blokken, figuren, Excel, tekst). BOUWPLAN P3 criteria 1, 5–8,
// 10 en 12; D1 §11.2. Referentiewaarden berekend met SciPy 1.18.1 (zie BOUWPLAN V16). Geen server nodig.
// Uitvoeren: node --test test/hr-analytics.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../public/js/beheer/hr-analytics.js';
import * as R from '../public/js/beheer/hr-rapport.js';
import * as S from '../public/js/beheer/statistiek.js';
import { DREMPEL, VERBORGEN, VERBORGEN_UITLEG, verdeelInGroepen } from '../public/js/beheer/privacy.js';
import { dashboardUitRijen, rijenUitExport } from '../public/js/beheer/dashboard-rekenen.js';
import { bouwModel } from '../public/js/beheer/analyse-model.js';
import { verzamelFeiten } from '../public/js/beheer/rapport-feiten.js';
import { isRechteLijn, RECHTE_LIJN_MIN } from '../public/js/beheer/werkbank/dataset.js';
import { figuurPlan } from '../public/js/beheer/figuren.js';
import { maakXlsx, leesXlsx } from '../public/js/beheer/bestanden.js';
import { verwerkPersoneel } from '../public/js/beheer/personeel-regels.js';
import { lcg, maakExport, vraag, THEMAS, standaardExport, kenmerkExport } from './hr-fixture.mjs';

const PEIL = '2026-11-27';
const dicht = (a, b, tol, wat = '') => assert.ok(Math.abs(a - b) <= tol, `${wat} ${a} ≠ ${b}`);
const kern = (data, opties = {}, personeel = null) => H.verzamelKerncijfers(data, personeel, data.hr_instellingen, { peildatum: PEIL, ...opties });

// ---------- Criterium 1: referentiewaarden D1 §11.2 ----------

test('eNPS: n 20, promotors 9, passief 6, criticasters 5, score 20, interval [−15,6045; 55,6045]', () => {
  const e = H.enps([10, 9, 9, 10, 8, 7, 7, 8, 6, 5, 9, 10, 3, 8, 9, 6, 7, 10, 9, 4]);
  assert.equal(e.n, 20);
  assert.equal(e.promotors, 9);
  assert.equal(e.passief, 6);
  assert.equal(e.criticasters, 5);
  dicht(e.score, 20, 1e-9, 'score');
  dicht(e.ci_laag, -15.6045, 1e-4, 'ci laag');
  dicht(e.ci_hoog, 55.6045, 1e-4, 'ci hoog');
  assert.equal(H.enps([]), null);
  assert.equal(H.enps(['weet_niet', null]), null);
  assert.equal(R.enpsZin({ ...e, verborgen: false }), 'De eNPS is +20 (9 promotors, 6 passieven en 5 criticasters van 20 respondenten). Het 95%-interval loopt van −16 tot +56.');
});

test('rapportcijfer: gemiddelde 7,0, sd 1,28338, interval [6,36179; 7,63821] (t met df 17), 11,111% onvoldoende', () => {
  const c = H.cijferStatistiek([7, 8, 6, 7, 9, 5, 8, 7, 7, 6, 8, 4, 7, 8, 9, 6, 7, 7], 'rapport');
  assert.equal(c.n, 18);
  dicht(c.gemiddelde, 7.0, 1e-12, 'gemiddelde');
  dicht(c.sd, 1.28338, 1e-5, 'sd');
  dicht(c.ci_laag, 6.36179, 1e-5, 'ci laag');
  dicht(c.ci_hoog, 7.63821, 1e-5, 'ci hoog');
  dicht(c.pct_onvoldoende, 11.111, 1e-3, 'onvoldoende');
  assert.equal(H.cijferStatistiek([8], 'nps').ci_laag, null);
  assert.equal('pct_onvoldoende' in H.cijferStatistiek([8, 9], 'nps'), false);
});

test('representativiteit: [18, 9, 6, 7] tegen [60, 20, 25, 15] → χ² 2,47, df 3, p 0,480737 en de zin van K S13', () => {
  const t = S.aanpassingsToets([18, 9, 6, 7], [60, 20, 25, 15]);
  dicht(t.chi2, 2.47, 1e-9, 'chi2');
  assert.equal(t.df, 3);
  dicht(t.p, 0.480737, 1e-6, 'p');
  const k = kern(kenmerkExport([18, 9, 6, 7], { populatie: [60, 20, 25, 15] }));
  const r = k.kenmerken[0].representativiteit;
  assert.equal(r.oordeel, 'geen_aanwijzing');
  dicht(r.p, 0.480737, 1e-6, 'p');
  assert.deepEqual(r.afwijkend, []);
  // De verschillen in procentpunten staan er altijd bij (K S13).
  assert.deepEqual(r.verschillen.map((v) => Math.round(v.verschil_pp)), [-5, 6, -6, 5]);
  assert.equal(R.representativiteitZinnen(k.kenmerken[0])[0],
    'Er is geen duidelijke aanwijzing dat de respondenten naar afdeling afwijken van de organisatie (chi-kwadraattoets, p = 0,481). Bij weinig respondenten zegt dat weinig.');
});

test('representativiteit gemaskeerd: [18, 9, 3, 1, 9] → categorieën [18, 9, samen 13] tegen [60, 20, 40] → χ² 1,025, p 0,598996', () => {
  // De kleinste getoonde groep (bij gelijke aantallen de eerste: de 9 met 25 medewerkers) gaat bij de kleine groepen.
  const k = kern(kenmerkExport([18, 9, 3, 1, 9], { populatie: [60, 25, 10, 5, 20] }));
  const km = k.kenmerken[0];
  assert.deepEqual(km.groepen.map((g) => [g.label, g.n, g.populatie]), [['Groep A', 18, 60], ['Groep E', 9, 20], ['Overige groepen samen', 13, 40]]);
  assert.deepEqual(km.groepen[2].labels_samengevoegd, ['Groep B', 'Groep C', 'Groep D']);
  const r = km.representativiteit;
  assert.equal(r.oordeel, 'geen_aanwijzing');
  dicht(r.chi2, 1.025, 1e-9, 'chi2');
  assert.equal(r.df, 2);
  dicht(r.p, 0.598996, 1e-6, 'p');
});

test('representativiteit: een duidelijke afwijking geeft de zin "wijkt af" en per groep onder- of oververtegenwoordigd', () => {
  // Review P3: met 30 respondenten tegen 25 medewerkers bij Zorg kloppen de aantallen niet en wordt er niet getoetst;
  // daarom 40 medewerkers per groep (dezelfde verhoudingen, 25% per groep).
  const k = kern(kenmerkExport([30, 5, 5, 6], { populatie: [40, 40, 40, 40], labels: ['Zorg', 'Staf', 'Facilitair', 'ICT'] }));
  const km = k.kenmerken[0];
  assert.equal(km.representativiteit.oordeel, 'wijkt_af');
  const zinnen = R.representativiteitZinnen(km);
  assert.match(zinnen[0], /^Naar afdeling wijkt de groep respondenten af van de organisatie \(chi-kwadraattoets, p < 0,001\)\.$/);
  assert.ok(zinnen.includes('Zorg is oververtegenwoordigd: 65% van de respondenten tegen 25% van de medewerkers.'));
  assert.ok(zinnen.includes('Staf is ondervertegenwoordigd: 11% van de respondenten tegen 25% van de medewerkers.'));
  // Te kleine verwachte aantallen: niet te toetsen.
  const klein = kern(kenmerkExport([6, 5], { populatie: [100, 5] }));
  assert.equal(klein.kenmerken[0].representativiteit.oordeel, 'niet_te_toetsen');
  assert.match(R.representativiteitZinnen(klein.kenmerken[0])[0], /te klein/);
});

// ---------- Criterium 6: de eigenschap van D1 §11.1 ----------

function aantal(r) {
  const k = r.getal();
  if (k < 0.45) return r.geheel(4);
  if (k < 0.8) return 5 + r.geheel(6);
  return 11 + r.geheel(25);
}

test('invariantie: aantallen herverdelen binnen de verborgen groepen verandert niets aan samenstelling en toets (300 tabellen)', () => {
  const r = lcg(2027);
  let vergeleken = 0;
  let getoetst = 0;
  const patroon = (aantallen, ni) => {
    const invoer = aantallen.map((n, i) => ({ sleutel: `o${i + 1}`, label: `G${i}`, n }));
    if (ni > 0) invoer.push({ sleutel: null, label: 'Niet ingevuld', n: ni });
    const v = verdeelInGroepen(invoer);
    const zonderLeeg = (x) => (x ? x.sleutels.filter((s) => s !== null) : null);
    return JSON.stringify({ z: v.zichtbaar.map((g) => g.sleutel), s: zonderLeeg(v.samengevoegd), v: zonderLeeg(v.verborgen), sn: v.samengevoegd?.n ?? null });
  };
  for (let t = 0; t < 300; t++) {
    const k = 2 + r.geheel(5);
    const aantallen = Array.from({ length: k }, () => aantal(r));
    const ni = r.getal() < 0.4 ? r.geheel(4) : 0;
    const populatie = aantallen.map(() => 5 + r.geheel(60));
    const basisPatroon = patroon(aantallen, ni);
    const invoer = aantallen.map((n, i) => ({ sleutel: `o${i + 1}`, label: `G${i}`, n }));
    if (ni > 0) invoer.push({ sleutel: null, label: 'Niet ingevuld', n: ni });
    const v = verdeelInGroepen(invoer);
    const zichtbaar = new Set(v.zichtbaar.map((g) => g.sleutel));
    const pos = aantallen.map((_, i) => i).filter((i) => !zichtbaar.has(`o${i + 1}`));
    if (pos.length < 2 || (!v.samengevoegd && !v.verborgen)) continue;
    const uit = (a, n) => JSON.stringify(kern(kenmerkExport(a, { nietIngevuld: n, populatie })).kenmerken);
    const basis = uit(aantallen, ni);
    const r0 = JSON.parse(basis)[0]?.representativiteit;
    if (r0 && r0.oordeel !== 'niet_te_toetsen') getoetst++;
    const totaal = pos.reduce((s, i) => s + aantallen[i], 0) + ni;
    for (let poging = 0; poging < 3; poging++) {
      const nieuw = [...aantallen];
      let rest = totaal;
      const cellen = [...pos, 'ni'];
      let nieuwNi = 0;
      cellen.forEach((p, i) => {
        const deel = i === cellen.length - 1 ? rest : r.geheel(rest);
        if (p === 'ni') nieuwNi = deel;
        else nieuw[p] = deel;
        rest -= deel;
      });
      // "Niet ingevuld" apart (5 of meer) is een ander patroon; dan niet vergelijken.
      if (patroon(nieuw, nieuwNi) !== basisPatroon || (nieuwNi >= DREMPEL) !== (ni >= DREMPEL)) continue;
      vergeleken++;
      assert.equal(uit(nieuw, nieuwNi), basis, `lek bij ${JSON.stringify([aantallen, ni])} → ${JSON.stringify([nieuw, nieuwNi])}`);
    }
  }
  assert.ok(vergeleken > 150, `te weinig vergelijkingen: ${vergeleken}`);
  assert.ok(getoetst > 20, `te weinig toetsen: ${getoetst}`);
});

test('populatie: een groep van 1 medewerker (bijv. "Anders") wordt niet getoond, met aanvullend verbergen', () => {
  const k = kern(kenmerkExport([20, 25, 0], { populatie: [40, 45, 1], labels: ['Man', 'Vrouw', 'Anders'], kenmerk: 'geslacht' }));
  const g = k.kenmerken[0].groepen;
  assert.deepEqual(g.map((x) => [x.label, x.n, x.populatie]), [['Man', 20, null], ['Vrouw', 25, 45], ['Anders', 0, null]]);
  assert.ok(g[0].populatie_verborgen && g[2].populatie_verborgen);
  assert.equal(k.kenmerken[0].representativiteit.oordeel, 'niet_te_toetsen', 'alleen één groep met een getoonde populatie');
  R.controleerKerncijfers(k);
});

// ---------- Kernscores ----------

test('een cijfervraag telt nooit mee in een thema: schaal 4 en cijfer 10 in hetzelfde thema → themagemiddelde 4', () => {
  const vragen = [vraag({ id: 1, thema_id: 1, tekst: 'Stelling' }), vraag({ id: 2, thema_id: 1, type: 'cijfer', schaal_soort: 'rapport', tekst: 'Cijfer' })];
  const inz = Array.from({ length: 8 }, () => ({ vragenlijst_id: 1, datum: '2026-10-01', antwoorden: { 1: 4, 2: 10 } }));
  const data = maakExport({ themas: THEMAS, vragenlijsten: [{ id: 1, titel: 'L', status: 'gesloten', code: 'c', meetmoment_id: null, aantal_uitgenodigd: null }], vragen, inzendingen: inz });
  const k = kern(data);
  assert.equal(k.scores.themas.length, 1);
  assert.equal(k.scores.themas[0].gemiddelde, 4);
  assert.equal(k.scores.themas[0].aantal_vragen, 1);
  assert.equal(k.scores.cijfers[0].gemiddelde, 10);
});

test('kernscores: % gunstig per thema naar antwoorden gewogen; sterkste en zwakste punten zonder overlap; een kleine vraag verbergt zijn thema', () => {
  const data = standaardExport({ n: 80 });
  const k = kern(data);
  const dash = dashboardUitRijen(rijenUitExport(data), { vragenlijst: 1 });
  for (const t of k.scores.themas) {
    const d = dash.selectie.themas.find((x) => x.thema_id === t.thema_id);
    assert.equal(t.gemiddelde, d.gemiddelde, 'zelfde themagemiddelde als het dashboard');
    assert.ok(Math.abs(t.pct_gunstig + t.pct_neutraal + t.pct_ongunstig - 100) < 1e-9);
  }
  const ids = new Set(k.scores.sterkst.map((x) => x.vraag_id));
  assert.ok(k.scores.zwakst.every((x) => !ids.has(x.vraag_id)));
  assert.equal(k.scores.sterkst.length, 3, '10 schaalvragen → 3 en 3');
  assert.ok(k.scores.sterkst[0].gemiddelde >= k.scores.zwakst[0].gemiddelde);
  // Een vraag die door 3 mensen is gescoord: thema verborgen, vraag niet bij sterkst/zwakst.
  const klein = standaardExport({ n: 80, extraVragen: [vraag({ id: 40, thema_id: 2, tekst: 'Zelden beantwoord' })] });
  for (const i of klein.inzendingen.slice(0, 3)) i.antwoorden[40] = 5;
  const kk = kern(klein);
  const sam = kk.scores.themas.find((t) => t.naam === 'Samenwerking');
  assert.equal(sam.verborgen, true);
  assert.equal(sam.gemiddelde, null);
  assert.ok(![...kk.scores.sterkst, ...kk.scores.zwakst].some((x) => x.vraag_id === 40));
  R.controleerKerncijfers(kk);
});

// ---------- Criterium 5: de heatmap is het dashboard ----------

test('thema\'s per groep: de cellen zijn gelijk aan de uitsplitsing van dashboardUitRijen, ook de cijfercellen', () => {
  for (const [afdelingen, leeg] of [[[40, 30, 3, 2], 0], [[30, 4, 6, 25], 2], [[12, 11, 2, 2], 6], [[3, 2, 1, 1], 0]]) {
    const data = standaardExport({ n: afdelingen.reduce((a, b) => a + b, 0) + leeg, afdelingen, zaad: 5 + leeg });
    const k = kern(data);
    assert.equal(k.groepen.length, 3, 'afdeling, leeftijd en leidinggevend');
    assert.deepEqual(k.groepen.map((g) => g.vraag_id), [1, 2, 3]);
    for (const g of k.groepen) {
      const u = dashboardUitRijen(rijenUitExport(data), { vragenlijst: 1, uitsplitsen: g.vraag_id }).selectie.uitsplitsing;
      assert.deepEqual(g.kolommen.map((c) => [c.label, c.n, c.verborgen]), u.groepen.map((x) => [x.label, x.verborgen ? null : x.n, !!x.verborgen]));
      const themas = g.rijen.filter((r) => r.soort === 'thema');
      assert.deepEqual(themas.map((r) => r.cellen), themas.map((_, t) => u.groepen.map((x) => (x.verborgen ? null : x.themas[t].gemiddelde))));
      const cijfers = g.rijen.filter((r) => r.soort !== 'thema');
      assert.deepEqual(cijfers.map((r) => r.id), u.cijfervragen.map((c) => c.vraag_id));
      assert.deepEqual(cijfers.map((r) => r.cellen), u.cijfervragen.map((c, i) => u.groepen.map((x) => (x.verborgen ? null : c.schaal_soort === 'nps' ? x.cijfers[i].enps : x.cijfers[i].gemiddelde))));
    }
    R.controleerKerncijfers(k);
  }
});

// ---------- Drijvers ----------

test('drijvers: r, interval en p zoals pearson; zonder de uitkomstvraag in het thema (overlap); minstens 10 paren', () => {
  const data = standaardExport({ n: 90, zaad: 3 });
  const model = bouwModel(data);
  const lijst = model.lijsten[0];
  // Uitkomst: de eerste vraag van Werkdruk (een schaalvraag), dus Werkdruk zonder die vraag.
  const dr = H.drijvers(lijst, 'v:10', model, DREMPEL);
  const werk = dr.rijen.find((x) => x.naam === 'Werkdruk');
  assert.equal(werk.overlap, true);
  const xs = [];
  const ys = [];
  for (const a of lijst.inz) {
    const vals = [11, 12].map((q) => a[q]).filter((v) => Number.isInteger(v));
    const x = vals.length * 2 >= 2 && vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    if (x !== null && Number.isInteger(a[10])) {
      xs.push(x);
      ys.push(a[10]);
    }
  }
  const p = S.pearson(xs, ys);
  dicht(werk.r, p.r, 1e-12, 'r');
  dicht(werk.ci_laag, p.ciLaag, 1e-12, 'ci');
  dicht(werk.p, p.p, 1e-12, 'p');
  assert.equal(werk.n, p.n);
  assert.equal(dr.rijen.find((x) => x.naam === 'Samenwerking').overlap, false);
  // Standaard: eerst de eNPS.
  const k = kern(data);
  assert.equal(k.drijvers.uitkomst.sleutel, 'v:30');
  assert.equal(k.drijvers.uitkomst.soort, 'cijfer_nps');
  assert.ok(k.drijvers.rijen.every((x, i, a) => i === 0 || (a[i - 1].r ?? -2) >= (x.r ?? -2)), 'gesorteerd op r');
  for (const x of k.drijvers.rijen) assert.equal(x.gemiddelde, k.scores.themas.find((t) => t.thema_id === x.thema_id).gemiddelde, 'x = het gemiddelde van het dashboard');
  // Kwadrant alleen bij p < 0,05; het kruis op de gemiddelden.
  for (const x of k.drijvers.rijen) if (!(x.p < 0.05)) assert.equal(x.kwadrant, null);
  const getoond = k.drijvers.rijen.filter((x) => x.r !== null);
  dicht(k.drijvers.kruis.y, getoond.reduce((s, x) => s + x.r, 0) / getoond.length, 1e-12, 'kruis');
  // Minder dan 10 paren: geen r.
  const weinig = standaardExport({ n: 9, volledig: true });
  const kw = kern(weinig);
  assert.ok(kw.drijvers.rijen.every((x) => x.r === null && x.reden === 'te_weinig'));
});

test('drijvers (B7): vallen er 1 tot 4 gedeeltelijk ingevulde respondenten weg, dan geen samenhang voor dat thema', () => {
  const data = standaardExport({ n: 60, leeg: 3, volledig: true });
  const k = kern(data);
  const rij = k.drijvers.rijen.find((x) => x.naam === 'Werkdruk');
  // De eerste drie respondenten beantwoordden alleen vraag 1 en 2 van de tien: bij Werkdruk 2 van de 3 (geen wegval),
  // bij Samenwerking en Leiderschap niets of minder dan de helft.
  const leider = k.drijvers.rijen.find((x) => x.naam === 'Leiderschap');
  assert.equal(rij.weggevallen_veilig, true);
  assert.equal(leider.weggevallen_veilig, true, 'wie niets beantwoordde, valt niet weg');
  const data2 = standaardExport({ n: 60, volledig: true });
  for (const i of data2.inzendingen.slice(0, 2)) {
    delete i.antwoorden[17];
    delete i.antwoorden[18];
  }
  const k2 = kern(data2);
  const l2 = k2.drijvers.rijen.find((x) => x.naam === 'Leiderschap');
  assert.equal(l2.weggevallen_veilig, false);
  assert.equal(l2.r, null);
  assert.equal(l2.reden, 'weggevallen');
  R.controleerKerncijfers(k2);
  const blokken = R.kerncijferBlokken(k2, 'kerncijfers');
  assert.ok(JSON.stringify(blokken).includes('niet getoond: te weinig volledig ingevulde antwoorden om dit veilig naast het dashboard te tonen'));
});

// ---------- Signalen, deelname, ontwikkeling, kwaliteit ----------

test('signalen: een ingestelde grens, de negatieve eNPS en een onvoldoende rapportcijfer; nooit op een achtergrondvraag', () => {
  const data = standaardExport({ n: 70, hr: { versie: 1, signalen: [{ sleutel: 'v:10', ongunstig: [1, 2], grens: 1 }, { sleutel: 'v:1', ongunstig: ['o1'], grens: 1 }, { sleutel: 't:1', ongunstig: [1], grens: 99 }, { sleutel: 'v:32', ongunstig: ['ja'], grens: 10 }] } });
  for (const i of data.inzendingen) {
    i.antwoorden[30] = 3;
    i.antwoorden[31] = 4;
  }
  const k = kern(data);
  const regels = k.signalen.map((s) => `${s.regel}:${s.sleutel}`);
  assert.ok(regels.includes('ongunstig:v:10'));
  assert.ok(regels.includes('ongunstig:v:32'));
  assert.ok(!regels.includes('ongunstig:v:1'), 'afdeling is een achtergrondvraag');
  assert.ok(!regels.includes('ongunstig:t:1'), 'onder de grens');
  assert.ok(regels.includes('enps_negatief:v:30'));
  assert.ok(regels.includes('cijfer_onvoldoende:v:31'));
  const tekst = R.kerncijferTekst(k);
  assert.ok(tekst.includes('De eNPS is negatief (−100): er zijn meer criticasters dan promotors.'));
  assert.ok(tekst.includes('Het gemiddelde rapportcijfer is een onvoldoende (4,0).'));
  assert.match(tekst, /scoort ongunstig \(1 of 2\) op "De hoeveelheid werk is goed te doen binnen mijn werktijd"\. Dat is boven de signaalgrens van 1% die voor dit onderzoek is ingesteld\./);
});

test('deelname: foutmarge bij 62 van de 130 is ±9 procentpunt; een kleine vragenlijst geeft geen uitkomsten (R1)', () => {
  dicht(S.foutmarge(62, 130), 9.0361, 1e-3);
  assert.equal(R.foutmargeZin(62, 130, S.foutmarge(62, 130)), 'Bij 62 van de 130 medewerkers is de foutmarge ongeveer ±9 procentpunt (95%).');
  const data = standaardExport({ n: 62, uitgenodigd: 130 });
  const k = kern(data);
  assert.equal(k.deelname.lijsten[0].populatie_bron, 'uitgenodigd');
  dicht(k.deelname.lijsten[0].foutmarge_pp, 9.0361, 1e-3);
  dicht(k.lijst.respons_pct, (62 / 130) * 100, 1e-9);
  // Reactiecurve: elk punt minstens 5 (dagen met minder worden samengenomen).
  assert.ok(k.deelname.per_dag.every((p) => p.aantal >= DREMPEL));
  assert.equal(k.deelname.per_dag[k.deelname.per_dag.length - 1].cumulatief, 62);
  // Personeelsbestand als populatie als er niemand is uitgenodigd.
  const metPers = standaardExport({ n: 62 });
  const kp = H.verzamelKerncijfers(metPers, { totaal: { medewerkers: 130 }, dimensies: {} }, {}, { peildatum: PEIL, metPersoneel: false });
  assert.equal(kp.deelname.lijsten[0].populatie_bron, 'personeel');
  assert.equal(kp.personeel, null);
  // Vier respondenten: niets.
  const vier = kern(standaardExport({ n: 4, afdelingen: [2, 1, 1, 0] }));
  assert.equal(vier.lijst.verborgen, true);
  assert.equal(vier.lijst.n, null);
  assert.equal(vier.deelname.lijsten[0].n, null);
  assert.deepEqual([vier.kenmerken, vier.scores.themas, vier.groepen, vier.signalen], [[], [], [], []]);
  assert.equal(vier.drijvers, null);
  R.controleerKerncijfers(vier);
  assert.match(R.kerncijferBlokken(vier, 'kerncijfers')[0].tekst, /minder dan 5/);
});

test('ontwikkeling: alleen bij twee of meer meetmomenten; toetsen gelijk aan die van het rapport', () => {
  assert.equal(kern(standaardExport({ n: 50 })).verloop, null);
  const data = standaardExport({ n: 60, metas: 3 });
  const k = kern(data);
  assert.equal(k.verloop.meetmomenten.length, 3);
  assert.equal(k.verloop.themas.length, 4);
  assert.ok(k.verloop.themas.every((t) => t.punten.length === 3 && t.punten.every((p) => p.gemiddelde !== null)));
  assert.equal(k.verloop.enps.length, 3);
  const rijen = rijenUitExport(data);
  const dashboards = data.vragenlijsten.map((l) => dashboardUitRijen(rijen, { vragenlijst: l.id }));
  const feiten = verzamelFeiten({ data, dashboards, peildatum: PEIL });
  const zonderOpen = (t) => { const { open, ...rest } = t; const strip = (x) => { const { meetmoment_id, ...y } = x; return y; }; return { ...rest, van: strip(rest.van), naar: strip(rest.naar) }; };
  assert.deepEqual(k.verloop.toetsen.map(zonderOpen), feiten.toetsen);
  assert.ok(k.verloop.toetsen.length >= 3);
  R.controleerKerncijfers(k);
});

test('kwaliteit: lege antwoorden per vraag, weet niet, rechte lijnen (zelfde regel als de werkbank) en verborgen kleine aantallen', () => {
  const data = standaardExport({ n: 50 });
  // Zes respondenten vullen alle tien schaalvragen met een 4 in: rechte lijnen.
  for (const i of data.inzendingen.slice(0, 6)) for (let q = 10; q < 20; q++) i.antwoorden[q] = 4;
  const k = kern(data);
  const model = bouwModel(data);
  const schaal = model.lijsten[0].vragen.filter((q) => q.type === 'schaal');
  const verwacht = model.lijsten[0].inz.filter((a) => isRechteLijn(schaal, a)).length;
  assert.equal(k.kwaliteit.rechte_lijn, verwacht);
  assert.ok(verwacht >= 6);
  assert.equal(k.kwaliteit.rechte_lijn_min, RECHTE_LIJN_MIN);
  assert.equal(k.kwaliteit.aantal_schaalvragen, 10);
  const wn = k.kwaliteit.per_vraag.find((q) => q.vraag_id === 15);
  assert.ok(wn.pct_weet_niet > 0);
  assert.ok(k.kwaliteit.gem_pct_beantwoord > 80 && k.kwaliteit.gem_pct_beantwoord <= 100);
  // Twee rechte lijnen: niet te tonen; een vraag met 3 antwoorden: verborgen.
  const twee = standaardExport({ n: 50, zaad: 99, extraVragen: [vraag({ id: 41, thema_id: 1, type: 'janee', tekst: 'Zelden' })] });
  for (const i of twee.inzendingen) for (let q = 10; q < 20; q++) i.antwoorden[q] = 1 + (q % 3);
  for (const i of twee.inzendingen.slice(0, 2)) for (let q = 10; q < 20; q++) i.antwoorden[q] = 5;
  for (const i of twee.inzendingen.slice(0, 3)) i.antwoorden[41] = 'ja';
  const k2 = kern(twee);
  assert.equal(k2.kwaliteit.rechte_lijn, null);
  const zelden = k2.kwaliteit.per_vraag.find((q) => q.vraag_id === 41);
  assert.deepEqual([zelden.n_beantwoord, zelden.pct_leeg, zelden.verborgen], [null, null, true]);
  R.controleerKerncijfers(k2);
});

test('benchmarks: de eigen waarde ernaast, nooit zelf ingevuld; de zin "Ter vergelijking: 5,0% (CBS, 2025)"', () => {
  const data = standaardExport({ n: 60, uitgenodigd: 100, hr: { versie: 1, benchmarks: [
    { sleutel: 'respons_pct', waarde: 55, omschrijving: 'Gangbare respons', citeersleutel: '' },
    { sleutel: 't:1', waarde: 3.6, omschrijving: '', citeersleutel: '' },
    { sleutel: 'verzuim_pct', waarde: 5.0, omschrijving: 'Landelijk verzuim 2025', citeersleutel: 'cbs2025' },
  ] } });
  const k = kern(data);
  assert.equal(k.benchmarks[0].eigen_waarde, 60);
  assert.equal(k.benchmarks[1].eigen_waarde, k.scores.themas[0].gemiddelde);
  assert.equal(k.benchmarks[2].eigen_waarde, null, 'geen personeelsbestand');
  assert.equal(R.benchmarkZin({ sleutel: 'verzuim_pct', waarde: 5 }, '(CBS, 2025)'), 'Ter vergelijking: 5,0% (CBS, 2025)');
  assert.equal(R.benchmarkZin(k.benchmarks[2], '(CBS, 2025)'), 'Ter vergelijking: 5,0% (CBS, 2025) – Landelijk verzuim 2025');
  // Vergelijkingscijfers van de vragenlijst staan bij de kerncijfers; die van het personeelsbestand bij HR-kengetallen.
  const blokken = R.kerncijferBlokken(k, 'kerncijfers', { bronnen: { cbs2025: '(CBS, 2025)' } });
  const lijst = blokken.find((b) => b.soort === 'lijst' && b.items.some((i) => i.includes('Ter vergelijking')));
  assert.deepEqual(lijst.items, ['Respons (hier 60%): Ter vergelijking: 55,0% – Gangbare respons', `Werkdruk (hier ${k.scores.themas[0].gemiddelde.toFixed(1).replace('.', ',')}): Ter vergelijking: 3,6`]);
  assert.ok(!JSON.stringify(blokken).includes('Landelijk verzuim'));
  // Excel: een onbekende respons is leeg, geen × (× betekent: verborgen).
  const zonderUitnodiging = R.kerncijferBladen(kern(standaardExport({ n: 30 }))).find((b) => b.naam === 'Deelname').rijen[1];
  assert.equal(zonderUitnodiging[5], '');
});

test('kenmerksuggesties en standaardsignalen voor de instellingen', () => {
  const data = standaardExport({ n: 30, extraVragen: [
    vraag({ id: 50, thema_id: 9, type: 'meerkeuze', tekst: 'In welk team werk je?', opties: ['Noord', 'Zuid'] }),
    vraag({ id: 51, thema_id: 9, type: 'meerkeuze', tekst: 'Op welke locatie werk je meestal?', opties: ['A', 'B'] }),
  ] });
  const s = H.kenmerkSuggesties(data, 1);
  assert.deepEqual(s.map((x) => [x.vraag_id, x.kenmerk]), [[51, 'locatie']], 'afdeling is al bezet; locatie wordt herkend');
  const sig = H.standaardSignalen(data, 1);
  assert.deepEqual(sig.map((x) => [x.sleutel, x.grens]), [['v:10', 30], ['v:32', 30]]);
  assert.deepEqual(sig[1].ongunstig, ['ja']);
});

// ---------- Criterium 7: controle op de server ----------

test('controleerKerncijfers accepteert de uitkomst en weigert een ingevoegd zichtbaar aantal van 3', () => {
  const data = standaardExport({ n: 90, afdelingen: [40, 30, 3, 2], metas: 2, uitgenodigd: 120 });
  const { aggregaat } = verwerkPersoneel(['Afdeling', 'Verzuimdagen'], Array.from({ length: 60 }, (_, i) => [i % 3 ? 'Zorg' : 'Staf', i % 7]), { rollen: { 0: 'afdeling', 1: 'verzuimdagen' }, periode: { van: '2025-11', tot: '2026-10' } });
  const k = H.verzamelKerncijfers(data, aggregaat, {}, { peildatum: PEIL });
  assert.ok(k.personeel && k.personeel.totaal.verzuim_pct > 0);
  assert.equal(R.controleerKerncijfers(k), true);
  const fout = (wijzig, patroon) => {
    const kopie = structuredClone(k);
    wijzig(kopie);
    assert.throws(() => R.controleerKerncijfers(kopie), patroon);
  };
  fout((x) => { x.kenmerken[0].groepen[0].n = 3; }, /aantal onder de 5 is zichtbaar/);
  fout((x) => { x.groepen[0].kolommen[0].n = 3; }, /aantal onder de 5/);
  fout((x) => { x.deelname.per_dag[0].aantal = 2; }, /aantal onder de 5/);
  fout((x) => { x.scores.themas[0].verborgen = true; }, /verborgen onderdeel bevat een getal/);
  fout((x) => { x.personeel.per_groep[0].rijen[0] = { label: 'Klein', medewerkers: 9, verzuim_pct: 4, verborgen: false }; }, /verzuim van de groep "Klein" met minder dan 10/);
  fout((x) => { x.personeel.totaal.medewerkers = 8; }, /verzuim van de organisatie/);
  fout((x) => { x.personen = [{ naam: 'Jan' }]; }, /onbekend onderdeel "personen"/);
  fout((x) => { x.drempel = 3; }, /drempel is te laag/);
  // De verdeling van een rapportcijfer is een mening: aantallen van 1 tot 4 mogen (zoals op het dashboard).
  const mening = structuredClone(k);
  mening.scores.cijfers.find((x) => x.schaal_soort === 'rapport').verdeling[0].aantal = 2;
  assert.equal(R.controleerKerncijfers(mening), true);
});

// ---------- Criterium 8: meelezer ----------

test('kerncijfersVoorKijker: van een open vragenlijst blijft alleen het aantal ingevulde vragenlijsten over', () => {
  const data = standaardExport({ n: 70, metas: 2, status: 'open', uitgenodigd: 100 });
  const k = kern(data);
  assert.equal(k.lijst.status, 'open');
  const v = R.kerncijfersVoorKijker(k, { tussenstand: false });
  assert.ok(k.lijst.n >= 70);
  assert.equal(v.lijst.n, k.lijst.n);
  assert.equal(v.lijst.respons_pct, null);
  assert.deepEqual([v.kenmerken, v.groepen, v.signalen, v.deelname.per_dag], [[], [], [], []]);
  assert.deepEqual(v.scores, { themas: [], enps: null, cijfers: [], sterkst: [], zwakst: [] });
  assert.equal(v.drijvers, null);
  assert.equal(v.kwaliteit, null);
  const open = v.deelname.lijsten.find((l) => l.status === 'open');
  assert.equal(open.n, k.lijst.n);
  assert.equal(open.respons_pct, null);
  assert.equal(v.deelname.lijsten.find((l) => l.status === 'gesloten').respons_pct, k.deelname.lijsten[0].respons_pct, 'een gesloten vragenlijst blijft');
  assert.ok(k.deelname.lijsten[0].respons_pct > 0);
  // Ontwikkeling: de punten van het open meetmoment weg, de toetsen ernaar ook.
  for (const t of v.verloop.themas) {
    assert.equal(t.punten[1].gemiddelde, null);
    assert.notEqual(t.punten[0].gemiddelde, null);
  }
  assert.deepEqual(v.verloop.toetsen, []);
  // Niets van de open vragenlijst in de tekst: geen gemiddelde van een thema.
  const themaGem = k.scores.themas.map((t) => String(t.gemiddelde));
  const json = JSON.stringify(v);
  assert.ok(themaGem.every((g) => !json.includes(g)));
  R.controleerKerncijfers(v);
  // Met tussenstand: alles.
  const met = R.kerncijfersVoorKijker(k, { tussenstand: true, metPersoneel: true });
  assert.deepEqual(met, k);
  // Zonder het hoofdstuk HR-kengetallen: geen personeelscijfers.
  const metPers = { ...k, personeel: { totaal: { verzuim_pct: 4 } }, benchmarks: [{ sleutel: 'verzuim_pct', waarde: 5, omschrijving: '', citeersleutel: '', eigen_waarde: 4 }] };
  const zonder = R.kerncijfersVoorKijker(metPers, { tussenstand: true, metPersoneel: false });
  assert.equal(zonder.personeel, null);
  assert.equal(zonder.benchmarks[0].eigen_waarde, null);
  assert.equal(k.lijst.status, 'open', 'het origineel blijft ongewijzigd');
});

// ---------- Criterium 10: Excel met × ----------

test('Excel: verborgen waarden zijn ×, met de uitleg; het bestand leest weer in', async () => {
  // Staf: 3 medewerkers ingevuld; die 3 en de kleinste andere populatie zijn ×. Ook geen "controleer de aantallen":
  // dat zou verraden dat het verborgen aantal kleiner is dan het aantal respondenten.
  const data = standaardExport({ n: 80, afdelingen: [40, 30, 3, 2], hr: { versie: 1, populatie: { 1: { o1: 60, o2: 3, o3: 4, o4: 3 } } } });
  const k = kern(data);
  const staf = k.kenmerken[0].groepen[1];
  assert.deepEqual([staf.label, staf.populatie, staf.populatie_verborgen, staf.controleer_aantallen, staf.respons_pct], ['Staf', null, true, false, null]);
  assert.equal(k.kenmerken[0].groepen.find((g) => g.samengevoegd).populatie_verborgen, true);
  const bladen = R.kerncijferBladen(k);
  assert.deepEqual(bladen.map((b) => b.naam).slice(0, 4), ['Deelname', 'Samenstelling', 'Scores', 'Per groep']);
  const alle = bladen.flatMap((b) => b.rijen.flat());
  assert.ok(alle.includes(VERBORGEN));
  assert.ok(alle.includes(VERBORGEN_UITLEG));
  // Elke verborgen cel van de heatmap is × in het blad.
  const groep = bladen.find((b) => b.naam === 'Per groep').rijen;
  const kopRij = groep[0];
  assert.deepEqual(kopRij, ['Indeling', 'Rij', 'Groep', 'Waarde', 'Respondenten in de groep']);
  const verborgenCellen = k.groepen.flatMap((g) => g.rijen.flatMap((r) => r.cellen.filter((c) => c === null))).length;
  assert.ok(verborgenCellen > 0);
  assert.equal(groep.filter((r) => r[3] === VERBORGEN).length, verborgenCellen);
  // Nergens een "<5" of een lege plek voor een verborgen getal (PR-22).
  assert.ok(!alle.some((c) => typeof c === 'string' && c.includes('<5')));
  const xlsx = maakXlsx(bladen);
  const terug = await leesXlsx(xlsx);
  const samen = terug.bladen.find((b) => b.naam === 'Samenstelling');
  assert.ok(samen.rijen.some((r) => r.includes(VERBORGEN)));
});

// ---------- Blokken, figuren en tekst ----------

test('rapportblokken en figuren: alleen bekende soorten, figuren tekenbaar, een verborgen waarde wordt een ×-vakje', () => {
  const data = standaardExport({ n: 90, afdelingen: [40, 30, 12, 8], metas: 2, uitgenodigd: 150, hr: { versie: 1, populatie: { 1: { o1: 60, o2: 50, o3: 25, o4: 15 } } } });
  const k = kern(data);
  for (const deel of ['deelname', 'kerncijfers', 'groepen', 'personeel', 'alles']) {
    for (const b of R.kerncijferBlokken(k, deel)) assert.ok(['kop', 'alinea', 'lijst', 'tabel', 'figuur'].includes(b.soort), `${deel}: ${b.soort}`);
  }
  const figuren = R.kerncijferFiguren(k);
  assert.deepEqual(figuren.map((f) => f.id.replace(/-\d+$/, '')), ['respons', 'themas', 'enps', 'verloop', 'samenstelling', 'prioriteiten']);
  for (const f of figuren) {
    assert.ok(f.alt.length > 20 && f.alt.endsWith('.'), f.id);
    const p = figuurPlan(f, { breedte: 343 });
    assert.ok(p.hoogte > 0);
  }
  // Een verborgen thema in de figuur: ×-vakje.
  const kopie = structuredClone(k);
  Object.assign(kopie.scores.themas[0], { verborgen: true, gemiddelde: null, pct_gunstig: null, pct_neutraal: null, pct_ongunstig: null, n: null, antwoorden: null });
  const themaFig = R.kerncijferFiguren(kopie).find((f) => f.id === 'themas');
  assert.deepEqual(figuurPlan(themaFig).verborgen.map((x) => x.categorie), [kopie.scores.themas[0].naam]);
  assert.match(themaFig.alt, /Werkdruk niet getoond/);
  const alles = R.kerncijferBlokken(k, 'alles');
  assert.ok(alles.filter((b) => b.soort === 'kop' && b.niveau === 2).map((b) => b.tekst).includes('Kernscores'));
});

test('platte tekst voor "Neem op in stuk"', () => {
  const k = kern(standaardExport({ n: 62, uitgenodigd: 130 }));
  const t = R.kerncijferTekst(k);
  assert.ok(t.startsWith('HR-analytics – Medewerkersonderzoek'));
  assert.ok(t.includes('Bij 62 van de 130 medewerkers is de foutmarge ongeveer ±9 procentpunt (95%).'));
  assert.ok(t.includes('De eNPS is'));
});

// ---------- Criterium 12: rekentijd ----------

test('rekentijd: verzamelKerncijfers op 3.000 respondenten × 100 vragen in minder dan 1,5 seconde', () => {
  const r = lcg(31);
  const vragen = [
    vraag({ id: 1, thema_id: 9, type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: ['A', 'B', 'C', 'D', 'E', 'F'], uitsplitsen: 1, kenmerk: 'afdeling' }),
    vraag({ id: 2, thema_id: 9, type: 'meerkeuze', tekst: 'Wat is je leeftijd?', opties: ['Jonger dan 35 jaar', '35 tot 55 jaar', '55 jaar of ouder', 'Dat zeg ik liever niet'], uitsplitsen: 1, kenmerk: 'leeftijd' }),
    vraag({ id: 3, thema_id: 9, type: 'meerkeuze', tekst: 'Wat voor dienstverband heb je?', opties: ['Vast', 'Tijdelijk', 'Uitzend'], uitsplitsen: 1, kenmerk: 'contract' }),
    vraag({ id: 4, thema_id: 9, type: 'janee', tekst: 'Geef je zelf leiding aan een of meer medewerkers?', uitsplitsen: 1, kenmerk: 'leidinggevend' }),
    ...Array.from({ length: 90 }, (_, i) => vraag({ id: 100 + i, thema_id: 1 + (i % 4), tekst: `Stelling ${i}` })),
    vraag({ id: 200, thema_id: 4, type: 'cijfer', schaal_soort: 'nps', tekst: 'Aanbevelen' }),
    vraag({ id: 201, thema_id: 4, type: 'cijfer', schaal_soort: 'rapport', tekst: 'Rapportcijfer' }),
    ...Array.from({ length: 3 }, (_, i) => vraag({ id: 300 + i, thema_id: 1, type: 'janee', tekst: `Ja of nee ${i}` })),
    vraag({ id: 400, thema_id: 2, type: 'open', tekst: 'Toelichting' }),
  ];
  assert.equal(vragen.length, 100);
  const inzendingen = [];
  for (let i = 0; i < 3000; i++) {
    const a = { 1: `o${1 + r.geheel(5)}`, 2: `o${1 + r.geheel(3)}`, 3: `o${1 + r.geheel(2)}`, 4: r.getal() < 0.2 ? 'ja' : 'nee' };
    const stem = r.getal() * 2 - 1;
    for (let q = 0; q < 90; q++) if (r.getal() < 0.95) a[100 + q] = Math.min(5, Math.max(1, Math.round(3 + stem + (r.getal() - 0.5) * 2)));
    a[200] = r.geheel(10);
    a[201] = 1 + r.geheel(9);
    for (let q = 0; q < 3; q++) a[300 + q] = r.getal() < 0.5 ? 'ja' : 'nee';
    if (r.getal() < 0.2) a[400] = 'Tekst';
    inzendingen.push({ vragenlijst_id: 1, datum: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`, antwoorden: a });
  }
  inzendingen.sort((x, y) => x.datum.localeCompare(y.datum));
  const data = maakExport({ themas: THEMAS, vragenlijsten: [{ id: 1, titel: 'Groot', status: 'gesloten', code: 'c', meetmoment_id: null, aantal_uitgenodigd: 4000 }], vragen, inzendingen,
    hr_instellingen: { versie: 1, signalen: [{ sleutel: 'v:100', ongunstig: [1, 2], grens: 10 }] } });
  const t0 = performance.now();
  const k = kern(data);
  const ms = performance.now() - t0;
  assert.equal(k.lijst.n, 3000);
  assert.equal(k.groepen.length, 4);
  assert.ok(ms < 1500, `${Math.round(ms)} ms`);
  R.controleerKerncijfers(k);
});

// ---------- Fase B: de tabel "Wie deden mee" (scherm, Word en Excel) en de validatie van het aggregaat ----------

test('samenstellingTabel: zonder organisatie Groep/Respondenten/%; met organisatie het verschil van de afgeronde percentages', async () => {
  const zonder = R.samenstellingTabel(kern(kenmerkExport([18, 9, 6, 7])).kenmerken[0]);
  assert.equal(zonder.metOrganisatie, false);
  assert.deepEqual(zonder.kop, ['Groep', 'Respondenten', '%']);
  assert.deepEqual(zonder.rijen.map((r) => r.cellen), [['Groep A', '18', '45%'], ['Groep B', '9', '23%'], ['Groep C', '6', '15%'], ['Groep D', '7', '18%']]);
  const km = kern(kenmerkExport([18, 9, 6, 7], { populatie: [60, 20, 25, 15] })).kenmerken[0];
  const t = R.samenstellingTabel(km);
  assert.equal(t.metOrganisatie, true);
  assert.equal(t.kop.length, 7, 'met de foutmarge per groep (review P3)');
  for (const r of t.rijen) {
    const [, , pR, , pM, verschil] = r.getallen;
    assert.equal(verschil, pR - pM, 'het verschil klopt met de getoonde percentages');
  }
  assert.deepEqual(t.rijen.map((r) => r.getallen.slice(2, 6)), [[45, 60, 50, -5], [23, 20, 17, 6], [15, 25, 21, -6], [18, 15, 13, 5]]);
  assert.ok(t.noten.includes(R.VERGELIJK_UITLEG));
  // Gemaskeerd: de kleine groepen samen, een verborgen populatie is ×, "Niet ingevuld" wordt niet vergeleken.
  const m = R.samenstellingTabel(kern(kenmerkExport([18, 9, 3, 1, 9], { populatie: [60, 25, 3, 5, 20], nietIngevuld: 12 })).kenmerken[0]);
  const tekst = JSON.stringify(m.rijen.map((r) => r.cellen));
  assert.ok(!/"[1-4]"/.test(tekst), 'geen zichtbaar aantal van 1 tot 4');
  const ni = m.rijen.find((r) => r.cellen[0] === 'Niet ingevuld');
  assert.ok(ni && ni.cellen[3] === '–' && ni.vergeleken === false);
  // Excel gebruikt dezelfde getallen.
  const blad = R.kerncijferBladen({ ...kern(kenmerkExport([18, 9, 6, 7], { populatie: [60, 20, 25, 15] })) }).find((b) => b.naam === 'Samenstelling');
  assert.deepEqual(blad.rijen[1].slice(1, 7), ['Groep A', 18, 45, 60, 50, -5]);
});

test('controleerPersoneelsaggregaat: zwangerschapsverlof alleen als vaste keuze en met een verzuimkolom', async () => {
  const { controleerPersoneelsaggregaat } = await import('../src/lib/hr-validatie.js');
  const kop = ['Afdeling', 'Verzuimdagen', 'Ziekmeldingen'];
  const rijen = Array.from({ length: 12 }, (_, i) => ['Zorg', i % 3, i % 2]);
  const periode = { van: '2025-11', tot: '2026-10' };
  const met = verwerkPersoneel(kop, rijen, { rollen: { 0: 'afdeling', 1: 'verzuimdagen', 2: 'verzuimmeldingen' }, periode, zwangerschapsverlof: 'telt_mee' }).aggregaat;
  assert.equal(controleerPersoneelsaggregaat(structuredClone(met)).zwangerschapsverlof, 'telt_mee');
  assert.throws(() => controleerPersoneelsaggregaat({ ...structuredClone(met), zwangerschapsverlof: 'ja hoor' }), /zwangerschaps/);
  const zonder = verwerkPersoneel(['Afdeling'], rijen.map((r) => [r[0]]), { rollen: { 0: 'afdeling' }, periode }).aggregaat;
  assert.equal(controleerPersoneelsaggregaat(structuredClone(zonder)).zwangerschapsverlof, undefined);
  assert.throws(() => controleerPersoneelsaggregaat({ ...structuredClone(zonder), zwangerschapsverlof: 'telt_niet' }), /verzuimkolom/);
});

// ---------- Review P3 (fase C): aantallen die niet kloppen, randen van intervallen, teksten en exports ----------

test('een groep met respondenten maar 0 medewerkers: "controleer de aantallen", geen ×, geen toets', () => {
  const k = kern(kenmerkExport([20, 15, 10], { populatie: [30, 20, 0] }));
  const km = k.kenmerken[0];
  const c = km.groepen.find((g) => g.label === 'Groep C');
  assert.deepEqual([c.n, c.populatie, c.respons_pct, c.controleer_aantallen, c.foutmarge_pp], [10, 0, null, true, null]);
  assert.equal(km.representativiteit.oordeel, 'niet_te_toetsen');
  assert.equal(km.representativiteit.reden, 'controleer_aantallen');
  const zinnen = R.representativiteitZinnen(km);
  assert.match(zinnen[0], /^Naar afdeling is niet getoetst .*bij Groep C zijn er meer respondenten dan medewerkers\. Controleer de aantallen medewerkers/);
  assert.ok(!zinnen.some((z) => /te klein/.test(z)));
  // De figuur "Respons per groep": Groep C niet als ×-vakje (× is voor verborgen cijfers), wel in de noot.
  const f = R.kerncijferFiguren(k).find((x) => x.id.startsWith('respons-'));
  assert.deepEqual(f.categorieen, ['Groep A', 'Groep B']);
  assert.match(f.noot, /Groep C: meer respondenten dan medewerkers; controleer de aantallen/);
  assert.equal(figuurPlan(f).verborgen.length, 0);
  assert.ok(!/Groep C niet getoond/.test(f.alt));
  // Meer respondenten dan medewerkers (30 tegen 25): ook geen toets.
  const meer = kern(kenmerkExport([30, 5, 5, 6], { populatie: [25, 25, 25, 25] })).kenmerken[0];
  assert.equal(meer.representativiteit.reden, 'controleer_aantallen');
});

test('een groep met aantallen die niet kloppen telt niet mee in de percentages, het verschil en de figuur (scherm, Word, Excel)', () => {
  for (const [pop, C] of [[[30, 20, 0], 0], [[30, 20, 8], 8]]) {
    const k = kern(kenmerkExport([20, 15, 10], { populatie: pop }));
    const km = k.kenmerken[0];
    const c = km.groepen.find((g) => g.label === 'Groep C');
    assert.deepEqual([c.controleer_aantallen, c.pct_vergelijk, c.populatie_pct_vergelijk, c.verschil_pp], [true, null, null, null]);
    // A en B: 20 en 15 van 35 respondenten tegen 30 en 20 van 50 medewerkers.
    assert.deepEqual(km.representativiteit.verschillen.map((v) => v.label), ['Groep A', 'Groep B']);
    dicht(km.representativiteit.verschillen[0].pct_respondenten, 2000 / 35, 1e-9);
    dicht(km.representativiteit.verschillen[0].pct_medewerkers, 60, 1e-9);
    assert.equal(km.representativiteit.reden, 'controleer_aantallen');
    const t = R.samenstellingTabel(km);
    assert.deepEqual(t.rijen[0].cellen.slice(0, 6), ['Groep A', '20', '57%', '30', '60%', '−3']);
    assert.deepEqual(t.rijen[2].cellen, ['Groep C', '10', '–', String(C), 'controleer de aantallen', 'controleer de aantallen', '–']);
    assert.equal(t.rijen[2].vergeleken, false);
    // Word (korte koppen) en Excel (Samenstelling): dezelfde cellen.
    assert.deepEqual(t.word.rijen[2].slice(3, 6), [String(C), 'controleer de aantallen', 'controleer de aantallen']);
    const blad = R.kerncijferBladen(k).find((b) => b.naam === 'Samenstelling');
    assert.deepEqual(blad.rijen.find((r) => r[1] === 'Groep C').slice(1, 8), ['Groep C', 10, '', C, 'controleer de aantallen', 'controleer de aantallen', 'controleer de aantallen']);
    assert.ok(!blad.rijen.some((r) => r[1] === 'Groep C' && r.includes(22)));
    // De figuur "Respondenten en organisatie": zonder Groep C, met een noot.
    const f = R.kerncijferFiguren(k).find((x) => x.id.startsWith('samenstelling-'));
    assert.deepEqual(f.categorieen, ['Groep A', 'Groep B']);
    assert.match(f.noot, /^Groep C: niet in de figuur, want er zijn meer respondenten dan medewerkers; controleer de aantallen\.$/);
    assert.ok(!/Groep C/.test(f.alt));
  }
});

test('niet-gekoppelde groepen in het personeelsbestand: een eigen reden en een zin op het scherm, in Word en in Excel', () => {
  const periode = { van: '2025-11', tot: '2026-10' };
  const bestand = (groepen) => verwerkPersoneel(['Afdeling', 'In dienst'], groepen.flatMap(([label, n]) => Array.from({ length: n }, () => [label, '2020-01'])),
    { rollen: { 0: 'afdeling', 1: 'datum_in' }, periode }).aggregaat;
  const aggregaat = bestand([['Groep A', 30], ['Groep B', 20], ['Keukenteam', 38]]);
  const k = kern(kenmerkExport([20, 15, 10]), {}, aggregaat);
  const km = k.kenmerken[0];
  assert.deepEqual(km.ongekoppeld, ['Keukenteam']);
  assert.deepEqual(km.representativiteit.niet_gekoppeld, ['Groep C']);
  assert.deepEqual(km.representativiteit.niet_vergeleken, []);
  const zinnen = R.representativiteitZinnen(km);
  const eigen = 'Groep C: niet vergeleken (in het personeelsbestand staat geen groep met deze naam).';
  const los = 'In het personeelsbestand staat een groep die bij geen antwoord van deze vraag hoort (Keukenteam). Lees het personeelsbestand opnieuw in en koppel hem aan een antwoord, of vul de aantallen zelf in bij Instellingen.';
  assert.ok(zinnen.includes(eigen), zinnen.join(' | '));
  assert.ok(zinnen.includes(los), zinnen.join(' | '));
  assert.ok(!zinnen.some((z) => /onbekend of te klein/.test(z)));
  // Word (rapportblokken), Excel (Samenstelling) en "Neem op in stuk" hebben dezelfde zinnen.
  const word = R.kerncijferBlokken(k, 'alles').filter((b) => b.soort === 'alinea').map((b) => b.tekst);
  assert.ok(word.includes(eigen) && word.includes(los));
  const blad = R.kerncijferBladen(k).find((b) => b.naam === 'Samenstelling');
  assert.ok(blad.rijen.some((r) => r[1] === eigen) && blad.rijen.some((r) => r[1] === los));
  assert.ok(R.kerncijferTekst(k).includes(los));
  // Zonder personeelscijfers (meelezer, of de vraag bij Excel/Word niet aangevinkt): geen groepsnamen uit het bestand.
  const zonder = R.kerncijfersVoorKijker(k, { tussenstand: true, metPersoneel: false });
  assert.ok(!JSON.stringify(zonder).includes('Keukenteam'));
  assert.deepEqual(zonder.kenmerken[0].representativiteit.niet_vergeleken, ['Groep C']);
  assert.ok(R.representativiteitZinnen(zonder.kenmerken[0]).includes('Groep C: niet vergeleken (aantal medewerkers onbekend of te klein om te tonen).'));
  assert.ok(R.kerncijfersVoorKijker(k, { tussenstand: true, metPersoneel: true }).kenmerken[0].ongekoppeld.includes('Keukenteam'));
  // Meer groepen: "staan groepen die … horen", en een mogelijkheid die wel een groep heeft, houdt haar aantal.
  const twee = kern(kenmerkExport([20, 15, 10]), {}, bestand([['Groep A', 30], ['Keukenteam', 38], ['Stagiairs', 6]])).kenmerken[0];
  assert.deepEqual(twee.ongekoppeld, ['Keukenteam', 'Stagiairs']);
  assert.equal(twee.groepen.find((g) => g.label === 'Groep A').populatie, 30);
  // Alleen Groep A is vergeleken: geen 100% tegen 100%, geen verschil en geen figuur.
  assert.deepEqual([twee.groepen[0].pct_vergelijk, twee.groepen[0].verschil_pp, twee.representativiteit.verschillen], [null, null, []]);
  assert.deepEqual(R.samenstellingTabel(twee).rijen[0].cellen.slice(0, 6), ['Groep A', '20', '–', '30', '–', '–']);
  assert.equal(R.kerncijferFiguren(kern(kenmerkExport([20, 15, 10]), {}, bestand([['Groep A', 30], ['Keukenteam', 38], ['Stagiairs', 6]]))).find((f) => f.id.startsWith('samenstelling-')), undefined);
  assert.match(R.ongekoppeldZin(twee), /^In het personeelsbestand staan groepen die bij geen antwoord van deze vraag horen \(Keukenteam, Stagiairs\)\. .*koppel ze aan een antwoord/);
  // Geen enkele mogelijkheid gekoppeld: geen vergelijking, wel de zin.
  const niets = kern(kenmerkExport([20, 15, 10]), {}, bestand([['Keukenteam', 38], ['Staf', 40]])).kenmerken[0];
  assert.equal(niets.representativiteit, null);
  assert.deepEqual(R.representativiteitZinnen(niets), [R.ongekoppeldZin(niets)]);
  // Alle aantallen met de hand ingevuld: het bestand doet niet mee, dus geen zin.
  const hand = kenmerkExport([20, 15, 10], { populatie: [30, 20, 12] });
  const kh = kern(hand, {}, aggregaat).kenmerken[0];
  assert.deepEqual([kh.ongekoppeld, kh.representativiteit.niet_gekoppeld, kh.representativiteit.populatie_bron], [[], [], 'handmatig']);
  // Een bestand waarin alles gekoppeld is: niets extra.
  const goed = kern(kenmerkExport([20, 15, 10]), {}, bestand([['Groep A', 30], ['Groep B', 20], ['Groep C', 38]])).kenmerken[0];
  assert.deepEqual([goed.ongekoppeld, goed.representativiteit.niet_gekoppeld], [[], []]);
  assert.equal(R.ongekoppeldZin(goed), null);
});

test('aantal medewerkers met de hand: alleen als bij elke groep een aantal staat (anders geen respons of foutmarge)', () => {
  const deels = kenmerkExport([30, 25, 20, 15]);
  deels.hr_instellingen = { versie: 1, populatie: { 1: { o1: 60, o2: 50, o3: 40 } } };
  const l = kern(deels).deelname.lijsten[0];
  assert.deepEqual([l.populatie, l.respons_pct, l.foutmarge_pp], [null, null, null]);
  const heel = kenmerkExport([30, 25, 20, 15], { populatie: [60, 50, 40, 30] });
  const h = kern(heel).deelname.lijsten[0];
  assert.deepEqual([h.populatie, h.populatie_bron, h.respons_pct], [180, 'handmatig', 50]);
  // "Dat zeg ik liever niet" heeft geen aantal nodig.
  const ln = kenmerkExport([30, 25, 5], { labels: ['Zorg', 'Staf', 'Dat zeg ik liever niet'] });
  ln.hr_instellingen = { versie: 1, populatie: { 1: { o1: 60, o2: 50 } } };
  assert.equal(kern(ln).deelname.lijsten[0].populatie, 110);
});

test('intervallen blijven binnen de schaal: eNPS −100 tot +100, rapportcijfer 1 tot 10', () => {
  const e = H.enps([9, 9, 9, 9, 7, 10, 9, 10]);
  dicht(e.score, 87.5, 1e-9);
  dicht(e.ci_laag, 64.58, 0.01);
  assert.equal(e.ci_hoog, 100);
  assert.equal(R.enpsZin({ ...e, verborgen: false }).endsWith('Het 95%-interval loopt van +65 tot +100.'), true);
  const c = H.cijferStatistiek([10, 10, 10, 9, 10, 10], 'rapport');
  dicht(c.ci_laag, 9.40, 0.01);
  assert.equal(c.ci_hoog, 10);
  assert.equal(H.cijferStatistiek([1, 1, 1, 2, 1, 1], 'rapport').ci_laag, 1);
  assert.equal(H.cijferStatistiek([0, 0, 0, 1, 0, 0], 'nps').ci_laag, 0);
  assert.equal(H.cijferStatistiek([0, 0, 0, 1, 0, 0], 'rapport', { bereik: { min: 0, max: 10 } }).ci_laag, 0);
});

test('foutmarge per groep in de tabel "Wie deden mee" (scherm, Word en Excel), alleen bij een bekend aantal medewerkers', () => {
  const k = kern(kenmerkExport([18, 9, 6, 7], { populatie: [60, 20, 25, 15] }));
  const km = k.kenmerken[0];
  const t = R.samenstellingTabel(km);
  assert.equal(t.kop[6], 'Foutmarge');
  const a = km.groepen.find((g) => g.label === 'Groep A');
  assert.equal(t.rijen[0].cellen[6], `±${Math.round(a.foutmarge_pp)} procentpunt`);
  dicht(a.foutmarge_pp, S.foutmarge(18, 60), 1e-12);
  assert.ok(t.noten.includes(R.FOUTMARGE_GROEP_UITLEG));
  const blad = R.kerncijferBladen(k).find((b) => b.naam === 'Samenstelling');
  assert.equal(blad.rijen[0][8], 'Foutmarge (procentpunt)');
  assert.equal(blad.rijen[1][8], Math.round(a.foutmarge_pp * 10) / 10);
  // Verborgen of samengevoegd: geen foutmarge.
  const m = kern(kenmerkExport([18, 9, 3, 1, 9], { populatie: [60, 25, 3, 5, 20], nietIngevuld: 12 })).kenmerken[0];
  for (const g of m.groepen) if (g.populatie === null || g.samengevoegd) assert.equal(g.foutmarge_pp, null, g.label);
  // Woord: "procentpunt", niet "pp".
  const deelname = R.kerncijferBlokken(kern(standaardExport({ n: 62, uitgenodigd: 130 })), 'deelname');
  const tekst = JSON.stringify(deelname);
  assert.ok(tekst.includes('±9 procentpunt') && !/\d pp/.test(tekst));
});

test('"Dat zeg ik liever niet" samen met "Niet ingevuld" is geen groep van de organisatie en wordt niet "niet vergeleken"', () => {
  const k = kern(kenmerkExport([30, 20, 3], { labels: ['Zorg', 'Staf', 'Dat zeg ik liever niet'], nietIngevuld: 2, populatie: [40, 30, 0] }));
  const km = k.kenmerken[0];
  const samen = km.groepen.find((g) => g.samengevoegd);
  assert.ok(samen, 'liever niet en niet ingevuld staan samen');
  assert.equal(samen.liever_niet, true);
  assert.deepEqual(km.representativiteit.niet_vergeleken, []);
  assert.ok(!R.representativiteitZinnen(km).some((z) => z.includes('niet vergeleken')));
  const rij = R.samenstellingTabel(km).rijen.find((r) => r.cellen[0].startsWith('Overige groepen samen'));
  assert.equal(rij.cellen[3], '–');
});

test('prioriteitenmatrix: een thema vlak bij een lijn krijgt "(dicht bij het midden)" en de uitleg staat erbij', () => {
  const k = kern(standaardExport({ n: 160, volledig: true }));
  const dr = k.drijvers;
  assert.ok(dr && dr.kruis);
  for (const r of dr.rijen) {
    if (!r.kwadrant) {
      assert.equal(r.dicht_bij_kruis, false);
      continue;
    }
    const verwacht = Math.abs(r.gemiddelde - dr.kruis.x) < H.DICHT_BIJ_X || (r.ci_laag <= dr.kruis.y && dr.kruis.y <= r.ci_hoog);
    assert.equal(r.dicht_bij_kruis, verwacht, r.naam);
    assert.equal(R.kwadrantTekst(r), `${R.KWADRANT[r.kwadrant]}${verwacht ? ' (dicht bij het midden)' : ''}`);
  }
  assert.equal(R.kwadrantTekst({ kwadrant: 'later', dicht_bij_kruis: true }), 'Minder belangrijk – later (dicht bij het midden)');
  if (dr.rijen.some((r) => r.kwadrant)) {
    assert.ok(R.kerncijferBlokken(k, 'kerncijfers').some((b) => b.soort === 'alinea' && b.tekst.includes(R.MATRIX_UITLEG)));
  }
});

test('teksten: 1 promotor en 1 criticaster, "gelijk aan" de signaalgrens, één paar haakjes bij een significant verschil', () => {
  const e = { verborgen: false, score: -50, n: 6, promotors: 1, passief: 1, criticasters: 4, ci_laag: -90, ci_hoog: -10 };
  assert.ok(R.enpsZin(e).includes('(1 promotor, 1 passieve en 4 criticasters van 6 respondenten)'));
  assert.ok(R.enpsZin({ ...e, promotors: 4, criticasters: 1, score: 50 }).includes('(4 promotors, 1 passieve en 1 criticaster van 6 respondenten)'));
  assert.match(R.signaalZin({ regel: 'ongunstig', waarde: 30, grens: 30, tekst: 'Werkdruk.', ongunstig: ['1', '2'] }), /Dat is gelijk aan de signaalgrens van 30%/);
  assert.match(R.signaalZin({ regel: 'ongunstig', waarde: 31, grens: 30, tekst: 'Werkdruk.', ongunstig: ['1', '2'] }), /Dat is boven de signaalgrens van 30%/);
  const [z] = R.verloopZinnen({ toetsen: [{ thema_naam: 'Werkdruk', van: { naam: 'Nulmeting', gemiddelde: 3.5 }, naar: { naam: 'Eindmeting', gemiddelde: 3.7 }, verschil: 0.2, p: 0.008 }] });
  assert.equal(z, 'Werkdruk: het verschil tussen Nulmeting en Eindmeting is statistisch significant: van 3,5 naar 3,7 (p = 0,008).');
});

test('open vragenlijst: Excel en "Neem op in stuk" zeggen dat de lijst nog openstaat; personeel alleen als dat gekozen is', () => {
  const open = kern(standaardExport({ n: 40, status: 'open' }));
  const oz = R.openZin(open);
  assert.match(oz, /^De vragenlijst "Medewerkersonderzoek" staat nog open \(peildatum .*\): de uitkomsten kunnen nog veranderen\. Deel geen twee versies/);
  for (const b of R.kerncijferBladen(open)) if (b.naam !== 'Benchmarks') assert.ok(b.rijen.some((r) => r[0] === oz), b.naam);
  assert.ok(R.kerncijferTekst(open).split('\n')[1] === oz);
  const dicht_ = kern(standaardExport({ n: 40 }));
  assert.equal(R.openZin(dicht_), null);
  assert.ok(!R.kerncijferTekst(dicht_).includes('staat nog open'));
  // Personeelscijfers in de platte tekst alleen met metPersoneel (zoals Excel en Word na de vraag).
  const { aggregaat } = verwerkPersoneel(['Afdeling', 'Verzuimdagen', 'Uit dienst'], Array.from({ length: 60 }, (_, i) => [i % 3 ? 'Zorg' : 'Staf', i % 7, i % 9 === 0 ? '2026-05' : '']), { rollen: { 0: 'afdeling', 1: 'verzuimdagen', 2: 'datum_uit' }, periode: { van: '2025-11', tot: '2026-10' } });
  const metP = kern(standaardExport({ n: 40 }), {}, aggregaat);
  assert.ok(Number.isFinite(metP.personeel.totaal.verzuim_pct));
  assert.ok(!R.kerncijferTekst(metP).includes('Personeel:'));
  assert.match(R.kerncijferTekst(metP, { metPersoneel: true }), /Personeel: \d+ medewerkers, verzuim [\d,]+%/);
});

test('label "staat nog open": ook als een gesloten lijst gekozen is en een andere lijst in de Ontwikkeling openstaat', () => {
  const data = standaardExport({ n: 40, metas: 2, status: 'open' });
  // De laatste lijst (Tussenmeting) staat open; gekozen is de eerste (Nulmeting, gesloten).
  const gesloten = kern(data, { vragenlijstId: 1 });
  assert.equal(gesloten.lijst.status, 'gesloten');
  const oz = R.openZin(gesloten);
  assert.match(oz, /^De vragenlijst "Medewerkersonderzoek Tussenmeting" staat nog open/);
  assert.deepEqual(R.openLabel(gesloten), { tekst: 'een andere vragenlijst staat nog open', uitleg: oz });
  // Excel zegt hetzelfde (de zin bovenaan elk blad).
  assert.ok(R.kerncijferBladen(gesloten).find((b) => b.naam === 'Deelname').rijen.some((r) => r[0] === oz));
  const open = kern(data, { vragenlijstId: 2 });
  assert.deepEqual(R.openLabel(open), { tekst: 'vragenlijst staat nog open', uitleg: R.openZin(open) });
  assert.equal(R.openLabel(kern(standaardExport({ n: 40, metas: 2 }), { vragenlijstId: 1 })), null);
});

test('personeelscijfers in Word en Excel: geen × voor een kolom die het bestand niet had, verzuimnoot alleen met verzuim', () => {
  const kop = ['Afdeling', 'Uren per week'];
  const rijen = [...Array.from({ length: 50 }, () => ['Productie', '36']), ...Array.from({ length: 3 }, () => ['Kantoor', '20']), ...Array.from({ length: 20 }, () => ['Magazijn', '30'])];
  const { aggregaat } = verwerkPersoneel(kop, rijen, { rollen: { 0: 'afdeling', 1: 'uren' }, periode: { van: '2025-11', tot: '2026-10' }, uren_per_fte: 36 });
  const k = kern(standaardExport({ n: 40 }), {}, aggregaat);
  const g = k.personeel.per_groep.find((x) => x.dimensie === 'afdeling');
  const pt = R.personeelGroepTabel(k.personeel, g);
  assert.deepEqual(pt.kop, ['Afdeling', 'Medewerkers', 'Fte']);
  assert.deepEqual(pt.rijen.find((r) => r[0] === 'Productie'), ['Productie', '50', '50,0']);
  assert.ok(pt.noten.includes(R.PERSONEEL_VERBORGEN), 'Kantoor (3) en Magazijn zijn verborgen');
  assert.ok(!pt.noten.includes(R.VERZUIM_VERBORGEN));
  const blad = R.kerncijferBladen(k).find((b) => b.naam === 'Personeel').rijen;
  assert.ok(!blad.some((r) => r[0] === R.VERZUIM_VERBORGEN || r[0] === R.VERZUIM_VERBORGEN_ORGANISATIE));
  assert.ok(blad.some((r) => r.join('|') === 'Afdeling|Medewerkers|Fte'));
  assert.ok(!blad.some((r) => r[0] === 'Productie' && r.length > 3));
  const blokken = JSON.stringify(R.kerncijferBlokken(k, 'personeel'));
  assert.ok(!blokken.includes('Verzuim van deze groep niet getoond'));
  // Met een verzuimkolom en een groep van 9: de noot staat er wel.
  const metV = verwerkPersoneel(['Afdeling', 'Verzuimdagen'], [...Array.from({ length: 9 }, (_, i) => ['Klein', i]), ...Array.from({ length: 30 }, (_, i) => ['Groot', i % 5]), ...Array.from({ length: 12 }, (_, i) => ['Midden', i % 3])], { rollen: { 0: 'afdeling', 1: 'verzuimdagen' }, periode: { van: '2025-11', tot: '2026-10' } }).aggregaat;
  const kv = kern(standaardExport({ n: 40 }), {}, metV);
  const ptv = R.personeelGroepTabel(kv.personeel, kv.personeel.per_groep[0]);
  assert.ok(ptv.kop.includes('Verzuim'));
  assert.ok(ptv.noten.includes(R.VERZUIM_VERBORGEN));
});

test('Word: "Thema\'s per groep" met korte rijnamen (eNPS, Rapportcijfer), de vraag in een noot, kolommen breed genoeg', () => {
  const k = kern(standaardExport({ n: 200, afdelingen: [60, 50, 40, 50] }));
  const blokken = R.kerncijferBlokken(k, 'groepen');
  const tabellen = blokken.filter((b) => b.soort === 'tabel');
  assert.ok(tabellen.length >= 1);
  const namen = tabellen[0].rijen.map((r) => r[0]);
  assert.ok(namen.includes('eNPS') && namen.includes('Rapportcijfer'), namen.join(' | '));
  assert.ok(!namen.some((n) => n.includes('Welk rapportcijfer')));
  const noten = blokken.filter((b) => b.soort === 'alinea').map((b) => b.tekst).join(' ');
  assert.ok(noten.includes('Rapportcijfer: "Welk rapportcijfer geef je Voorbeeld BV als werkgever?"'));
  for (const t of tabellen) {
    assert.equal(t.breedtes.length, t.kop.length);
    assert.ok(t.breedtes.reduce((a, b) => a + b, 0) <= 9070 + 1e-9);
  }
  // Veel groepen: verdeeld over meer tabellen die elk op de pagina passen.
  const veel = structuredClone(k.groepen[0]);
  veel.kolommen = Array.from({ length: 12 }, (_, i) => ({ ...veel.kolommen[0], label: `Verpleegafdeling${i}` }));
  veel.rijen = veel.rijen.map((r) => ({ ...r, cellen: Array.from({ length: 12 }, () => r.cellen[0]) }));
  const breed = R.kerncijferBlokken({ ...k, groepen: [veel] }, 'groepen').filter((b) => b.soort === 'tabel');
  assert.ok(breed.length >= 2);
  assert.equal(breed.reduce((t, b) => t + b.kop.length - 2, 0), 12);
  for (const t of breed) assert.ok(t.breedtes.reduce((a, b) => a + b, 0) <= 9070 + 1e-9);
});
