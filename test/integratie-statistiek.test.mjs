// Integratiebevindingen over statistiek en juistheid (J2 = G1, J3, J8, G2, G4, J6): de werkbank, het SPSS-pakket en de
// volledige kopie rekenen en schrijven zoals een onderzoeker verwacht. De getallen komen uit SciPy:
// test/referentie/integratie_statistiek.py → test/fixtures/integratie-statistiek.json (zaad 20261128).
// Zuiver: geen server nodig. Uitvoeren: node --test test/integratie-statistiek.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { maakRekenkern } from '../public/js/beheer/werkbank/rekenkern.js';
import { bouwDataset, getalWeergave, REDEN } from '../public/js/beheer/werkbank/dataset.js';
import { past, isThemaVraag } from '../public/js/beheer/schermen/werkbank-formulieren.js';
import {
  P_LIEVER_NIET, P_CIJFER_ITEM, P_BEREIK_VERSCHILT, P_INDELING_ALS_GETAL, P_WEGGEVALLEN, P_WEGGEVALLEN_UITWEG, P_WEGGEVALLEN_UITWEG_EIGEN, pWeggevallen,
} from '../public/js/beheer/werkbank/uitvoer-tekst.js';
import { spssGegevens } from '../public/js/beheer/export-bestanden.js';
import { maakSpssSyntax } from '../public/js/beheer/bestanden.js';
import { volledigeJson } from '../public/js/beheer/export.js';
import { dashboardUitRijen, rijenUitExport } from '../public/js/beheer/dashboard-rekenen.js';
import { CIJFERSCHALEN, SCHALEN } from '../src/lib/schalen.js';
import { KENMERKEN, LIEVER_NIET } from '../public/js/beheer/kenmerken.js';

const REF = JSON.parse(readFileSync(new URL('./fixtures/integratie-statistiek.json', import.meta.url), 'utf8'));

// ---------- De export uit de referentiegegevens ----------

const LEEFTIJD = [['o1', 'Jonger dan 35 jaar'], ['o2', '35 tot 55 jaar'], ['o3', '55 jaar of ouder'], ['o4', LIEVER_NIET]];
const GESLACHT = [['g1', 'Man'], ['g2', 'Vrouw'], ['g4', LIEVER_NIET]];
const opties = (lijst) => JSON.stringify(lijst.map(([id, label]) => ({ id, label })));

function maakExport(rijen = REF.rijen) {
  const q = (v) => ({
    vragenlijst_id: 1, thema_id: 10, meetpunt_id: null, type: 'schaal', tekst: `Vraag ${v.id}`, toelichting: '', opties: '[]', schaal_soort: 'eens',
    meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: null, volgorde: v.id, kenmerk: '', ...v,
  });
  return {
    export: { versie: 1, datum: '2026-11-28' },
    lijsten: { schalen: SCHALEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN, vraagtypen: {} },
    onderzoek: { id: 1, titel: 'T', bedrijfsnaam: 'X', status: 'actief' },
    themas: [{ id: 10, naam: 'Werkdruk', volgorde: 1 }, { id: 11, naam: 'Samenwerking', volgorde: 2 }, { id: 12, naam: 'Achtergrond', volgorde: 3 }],
    meetpunten: [], meetmomenten: [{ id: 30, naam: 'Nulmeting', volgorde: 1 }],
    vragenlijsten: [{ id: 1, titel: 'Lijst', meetmoment_id: 30, status: 'gesloten' }],
    vragen: [
      q({ id: 1, type: 'meerkeuze', thema_id: 12, tekst: 'Wat is je leeftijd?', kenmerk: 'leeftijd', uitsplitsen: 1, opties: opties(LEEFTIJD) }),
      q({ id: 2 }), q({ id: 3 }), q({ id: 4 }),
      q({ id: 5, type: 'cijfer', schaal_soort: 'rapport', tekst: 'Welk rapportcijfer geef je?' }),
      q({ id: 6, thema_id: 11 }), q({ id: 7, thema_id: 11 }), q({ id: 8, thema_id: 11 }),
      q({ id: 9, type: 'janee', thema_id: 12, tekst: 'Geef je leiding?', kenmerk: 'leidinggevend', uitsplitsen: 1 }),
      q({ id: 10, type: 'meerkeuze', thema_id: 12, tekst: 'Wat is je geslacht?', kenmerk: 'geslacht', opties: opties(GESLACHT) }),
    ],
    inzendingen: rijen.map((r, i) => {
      const a = { 1: r.leeftijd, 2: r.q2, 3: r.q3, 4: r.q4, 5: r.q5, 6: r.q6, 9: r.leiding, 10: i % 5 === 0 ? 'g4' : i % 2 ? 'g1' : 'g2' };
      if (r.q7 !== undefined) a[7] = r.q7;
      if (r.q8 !== undefined) a[8] = r.q8;
      return { id: (i + 1) * 37, vragenlijst_id: 1, datum: '2026-10-01', antwoorden: a };
    }),
    eigen_invoer: [], stukken: [], acties: [], rapporten: [], werkbank_definities: [], werkbank_analyses: [],
    codes: [], coderingen: [], citaten: [], bronnen_gekoppeld: [], hr_instellingen: {}, personeelscijfers: [],
  };
}

const BRON = { soort: 'lijst', id: 1 };
function werkbank(data = maakExport(), definities = []) {
  const kern = maakRekenkern();
  const defs = definities.map((d) => ({ dataset_id: null, label: d.naam, verwijderd_op: null, ...d, definitie: JSON.stringify(d.definitie) }));
  const overzicht = kern.laad({ data, datasets: [], definities: defs, bron: BRON });
  const run = (procedure, variabelen, { filter = null, opties = {} } = {}) => kern.voerUit({ versie: 1, bron: BRON, filter, procedure, variabelen, opties }, { nu: '2026-11-28' });
  return { kern, overzicht, run };
}
const tabelVan = (u, id) => u.onderdelen.find((o) => o.soort === 'tabel' && o.id.startsWith(id));
const meldingen = (u) => u.onderdelen.filter((o) => o.soort === 'melding').map((o) => o.tekst);
const rij = (t, label, kolom = 0) => t.rijen.find((r) => r[kolom]?.t === label);
/** "−0,20 tot 0,18" → [-0.2, 0.18] */
const interval = (tekst) => tekst.split(' tot ').map((x) => Number(x.replace('−', '-').replace(',', '.')));
const dicht = (a, b, tol = 1e-9, wat = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${wat}: ${a} ≠ ${b}`);
const tel = (rijen, f) => rijen.filter(f).length;

// ---------- J2 = G1: "Dat zeg ik liever niet" is geen hoogste leeftijdsklasse ----------

test('J2: beschrijvend en correlatie van leeftijd zonder "Dat zeg ik liever niet" (SciPy)', async () => {
  const { run, overzicht } = werkbank();
  const v = overzicht.variabelen.find((x) => x.id === 'v:1');
  assert.equal(v.meetniveau, 'ordinaal', 'leeftijd is een geordend kenmerk');
  assert.deepEqual(v.geenGetal, [4], '"Dat zeg ik liever niet" is code 4');
  const b = await run('beschrijvend', { variabelen: ['v:1'] });
  const r = rij(tabelVan(b, 'beschrijvend'), 'Wat is je leeftijd?');
  assert.equal(r[1].w, REF.leeftijd.n, 'n zonder liever niet (50, niet 60)');
  dicht(r[2].w, REF.leeftijd.gemiddelde, 1e-12, 'gemiddelde');
  dicht(r[3].w, REF.leeftijd.sd, 1e-12, 'sd');
  assert.notEqual(r[1].w, REF.leeftijd.n_met_liever_niet);
  assert.ok(Math.abs(r[2].w - REF.leeftijd.gemiddelde_met_liever_niet) > 0.3, 'vroeger telde liever niet als 4 mee');
  assert.ok(r[8].w <= 3, 'het (5e) hoogste getal is hooguit 3, nooit de code van liever niet');
  assert.ok(meldingen(b).includes(P_LIEVER_NIET('Wat is je leeftijd?')), 'de uitvoer zegt dat liever niet als getal niet meetelt');
  // Scheefheid en kurtosis zoals SPSS (scipy bias=False).
  const [scheef] = r[9].t.split(' ');
  dicht(Number(scheef.replace('−', '-').replace(',', '.')), Math.round(REF.leeftijd.scheef * 100) / 100, 1e-9, 'scheefheid');
  for (const methode of ['pearson', 'spearman']) {
    const c = await run('correlatie', { variabelen: ['v:1', 't:10'] }, { opties: { methode } });
    const naam = methode === 'pearson' ? 'Pearson' : 'Spearman';
    const rr = tabelVan(c, `r-${methode}`) || c.onderdelen.find((o) => o.soort === 'tabel' && o.titel === `Correlaties (${naam})`);
    const p = c.onderdelen.find((o) => o.soort === 'tabel' && o.titel === `p-waarden (${naam})`);
    const n = c.onderdelen.find((o) => o.soort === 'tabel' && o.titel === `Aantal respondenten per paar (${naam})`);
    dicht(rr.rijen[0][2].w, methode === 'pearson' ? REF.correlatie.r : REF.correlatie.rho, 1e-10, `${naam} r`);
    dicht(p.rijen[0][2].w, methode === 'pearson' ? REF.correlatie.p : REF.correlatie.p_rho, 1e-8, `${naam} p`);
    assert.equal(n.rijen[0][2].w, REF.correlatie.n);
  }
});

test('J2: als groep blijft "Dat zeg ik liever niet" meedoen (frequenties, kruistabel, groepen), maar niet in de zin over hoogst en laagst', async () => {
  const { run } = werkbank();
  const f = await run('frequenties', { variabelen: ['v:1'] });
  const t = tabelVan(f, 'freq-v:1');
  assert.equal(rij(t, LIEVER_NIET)[1].w, 10, 'zichtbare categorie in de frequentietabel');
  const k = await run('kruistabel', { rij: 'v:1', kolom: 'v:9' });
  assert.ok(tabelVan(k, 'kruistabel').rijen.some((x) => x[0].t === LIEVER_NIET), 'een rij in de kruistabel');
  const pg = await run('pergroep', { afhankelijk: ['t:10'], groep: 'v:1' });
  assert.ok(rij(tabelVan(pg, 'pergroep'), LIEVER_NIET), 'een groep bij Gemiddelden per groep');
  const zin = pg.duiding.zinnen.find((z) => z.includes('het hoogst'));
  assert.ok(zin && !zin.includes(LIEVER_NIET), zin);
  // Ook als "liever niet" het hoogst scoort (vroeger: "“Dat zeg ik liever niet” scoort het hoogst").
  const hoog = REF.rijen.map((r) => (r.leeftijd === 'o4' ? { ...r, q2: 5, q3: 5, q4: 5 } : r));
  const pg2 = await werkbank(maakExport(hoog)).run('pergroep', { afhankelijk: ['t:10'], groep: 'v:1' });
  assert.equal(rij(tabelVan(pg2, 'pergroep'), LIEVER_NIET)[2].w, 5, 'in de tabel staat de groep met gemiddeld 5');
  const zin2 = pg2.duiding.zinnen.find((z) => z.includes('het hoogst'));
  assert.ok(zin2 && !zin2.includes(LIEVER_NIET), zin2);
  // Regressie: leeftijd als voorspeller met groepen; liever niet is een eigen groep (dummy).
  const rg = await run('regressie', { afhankelijk: 't:10', voorspellers: ['v:1'] });
  assert.ok(JSON.stringify(tabelVan(rg, 'groepen')).includes(LIEVER_NIET));
});

test('J2: grenzen, een selectie van … tot … en een score rekenen zonder "liever niet"', () => {
  const data = maakExport();
  const { kern } = werkbank(data, [
    { id: 1, soort: 'hercoderen', naam: 'lft2', definitie: { variabele: 'v:1', manier: 'grenzen', grenzen: [2], labels: ['Jong', 'Ouder'] } },
    { id: 2, soort: 'filter', naam: 'oud', definitie: { voorwaarden: [{ variabele: 'v:1', van: 3 }] } },
    { id: 3, soort: 'bereken', naam: 'mix', definitie: { functie: 'gemiddelde', variabelen: ['v:1', 'v:2'], min_geldig: 2 } },
  ]);
  const ds = kern.dataset(BRON);
  const lft = ds.perId.get('v:1');
  const w1 = ds.perId.get('w:1');
  const n = (code) => tel(REF.rijen, (r) => r.leeftijd === code);
  let ouder = 0;
  let lieverNiet = 0;
  for (let r = 0; r < ds.n; r++) {
    if (w1.reden[r] === REDEN.GELDIG && w1.waarden[r] === 2) ouder++;
    if (w1.reden[r] === REDEN.LIEVER_NIET) lieverNiet++;
  }
  assert.equal(ouder, n('o2') + n('o3'), '"Ouder" zonder liever niet');
  assert.equal(lieverNiet, n('o4'), 'liever niet is daar ontbrekend');
  const sel = kern.controleerIndeling({ soort: 'filter', naam: 'oud2', definitie: { voorwaarden: [{ variabele: 'v:1', van: 3 }] } }, BRON);
  assert.ok(sel.voorbeeld[0].startsWith(`Selectie: ${n('o3')} van 60`), sel.voorbeeld[0]);
  const w3 = ds.perId.get('w:3');
  for (let r = 0; r < ds.n; r++) {
    if (lft.waarden[r] === 4) assert.notEqual(w3.reden[r], REDEN.GELDIG, 'geen score met liever niet als 4');
    else assert.equal(w3.waarden[r], (lft.waarden[r] + ds.perId.get('v:2').waarden[r]) / 2);
  }
  // De variabele zelf houdt liever niet als geldige groep; alleen de getalweergave niet.
  assert.equal(tel([...lft.reden].map((x, r) => [x, lft.waarden[r]]), ([x, w]) => x === REDEN.GELDIG && w === 4), n('o4'));
  assert.equal(tel([...getalWeergave(lft).reden], (x) => x === REDEN.LIEVER_NIET), n('o4'));
});

test('J2: "liever niet" blijft als groep beschermd als leeftijd als getal meedoet', async () => {
  // Leeftijd × leidinggevend heeft een cel van 4 (liever niet bij Ja). Als getal per groep zou die volgen uit
  // de groepsgrootte min n; dus doet Ja niet mee (en Nee ook niet, anders volgt Ja uit het totaal).
  const { run } = werkbank();
  const cel = tel(REF.rijen, (r) => r.leeftijd === 'o4' && r.leiding === 'ja');
  assert.equal(cel, 4);
  const pg = await run('pergroep', { afhankelijk: ['v:1'], groep: 'v:9' });
  const t = tabelVan(pg, 'pergroep');
  assert.ok(!t || !rij(t, 'Ja'), 'geen gemiddelde leeftijd bij Ja');
  // Met maar 3 keer liever niet in de hele lijst: leeftijd als getal geweigerd (dat aantal volgt anders uit n).
  let k = 0;
  const weinig = REF.rijen.map((r) => (r.leeftijd === 'o4' && k++ >= 3 ? { ...r, leeftijd: 'o2' } : r));
  const b = await werkbank(maakExport(weinig)).run('beschrijvend', { variabelen: ['v:1'] });
  assert.equal(b.geweigerd, true);
  assert.ok(meldingen(b).includes(P_INDELING_ALS_GETAL('Wat is je leeftijd?')), meldingen(b).join(' | '));
});

// ---------- J8: SPSS ----------

test('J8: in SPSS is een geordend kenmerk ORDINAL met "liever niet" als MISSING VALUE; een ongeordend blijft NOMINAL', () => {
  const data = maakExport();
  const { variabelen, rijen } = spssGegevens(data);
  const v = (naam) => variabelen.find((x) => x.naam === naam);
  assert.equal(v('leeftijd').meetniveau, 'ORDINAL');
  assert.deepEqual(v('leeftijd').ontbrekend, [4]);
  assert.equal(v('leeftijd').waardelabels[4], LIEVER_NIET, 'de code blijft gelijk aan de werkbank');
  assert.equal(v('geslacht').meetniveau, 'NOMINAL');
  assert.equal(v('geslacht').ontbrekend, undefined, 'bij een ongeordend kenmerk blijft liever niet een categorie');
  assert.equal(v('leidinggevend').meetniveau, 'NOMINAL');
  const k = variabelen.indexOf(v('leeftijd'));
  assert.equal(rijen.filter((r) => r[k] === 4).length, 10);
  const syntax = maakSpssSyntax({ databestand: 'x.csv', variabelen, titel: 'T' });
  assert.match(syntax, /MISSING VALUES[\s\S]*leeftijd[^\n]*\(4\)/);
  assert.match(syntax, /VARIABLE LEVEL[\s\S]*leeftijd[\s\S]*?\(ORDINAL\)/);
  // De werkbank: hetzelfde meetniveau en dezelfde codes.
  const ds = bouwDataset({ data, bron: BRON });
  assert.equal(ds.perId.get('v:1').meetniveau, 'ordinaal');
  assert.equal(ds.perId.get('v:10').meetniveau, 'nominaal');
});

// ---------- G2: t-toets zoals SPSS (groep 1 min groep 2) ----------

async function ttoets(groepen) {
  const { run } = werkbank();
  return run('ttoets', { afhankelijk: ['t:10'], groep: 'v:9' }, { opties: { groepen } });
}

for (const [groepen, ref, a, b] of [[['ja', 'nee'], REF.ttoets_ja_nee, 'Ja', 'Nee'], [['nee', 'ja'], REF.ttoets_nee_ja, 'Nee', 'Ja']]) {
  test(`G2: t-toets met groep 1 = ${a}: teken van tabel, tekst en APA-zin gelijk aan scipy.ttest_ind(${a.toLowerCase()}, ${b.toLowerCase()})`, async () => {
    const u = await ttoets(groepen);
    assert.ok(!u.geweigerd, meldingen(u).join(' | '));
    const t = tabelVan(u, 'ttoets');
    const [student, welch] = t.rijen;
    for (const [r, x, wat] of [[student, ref.student, 'Student'], [welch, ref.welch, 'Welch']]) {
      dicht(r[2].w, x.t, 1e-10, `${wat} t`);
      dicht(r[3].w, x.df, 1e-9, `${wat} df`);
      dicht(r[4].w, x.p, 1e-8, `${wat} p`);
      dicht(r[5].w, x.verschil, 1e-12, `${wat} verschil`);
      const [laag, hoog] = interval(r[7].t);
      dicht(laag, Math.round(x.ci[0] * 100) / 100, 1e-9, `${wat} BI laag`);
      dicht(hoog, Math.round(x.ci[1] * 100) / 100, 1e-9, `${wat} BI hoog`);
    }
    assert.ok(t.voetnoten[0].startsWith(`Verschil = “${a}” min “${b}”`), t.voetnoten[0]);
    const e = tabelVan(u, 'effect').rijen[0];
    dicht(e[1].w, ref.d, 1e-10, 'Cohens d');
    dicht(e[2].w, ref.g, 1e-10, 'Hedges g');
    const [gl, gh] = interval(e[3].t);
    dicht(gl, Math.round(ref.g_ci[0] * 100) / 100, 1e-9, 'BI g laag');
    dicht(gh, Math.round(ref.g_ci[1] * 100) / 100, 1e-9, 'BI g hoog');
    const mw = tabelVan(u, 'mannwhitney').rijen[0];
    dicht(mw[1].w, ref.mw.rang_a, 1e-12, 'rang groep 1');
    dicht(mw[2].w, ref.mw.rang_b, 1e-12, 'rang groep 2');
    dicht(mw[3].w, ref.mw.u, 1e-12, 'U van groep 1 (scipy.mannwhitneyu(a, b))');
    dicht(mw[4].w, ref.mw.z, 1e-10, 'z');
    dicht(mw[5].w, ref.mw.p, 1e-8, 'p Mann-Whitney');
    // Eén teken in de hele uitvoer: tabel, Wat betekent dit? en de APA-zin.
    const hoger = ref.welch.verschil > 0;
    assert.ok(u.duiding.zinnen.includes(`“${a}” scoort gemiddeld 0,37 punt ${hoger ? 'hoger' : 'lager'} op “Werkdruk” dan “${b}”.`), u.duiding.zinnen.join(' | '));
    const gTekst = (x) => (Math.round(x * 100) / 100).toFixed(2).replace('-', '−').replace('.', ',');
    assert.ok(u.duiding.zinnen.some((z) => z.includes(`(Hedges' g = ${gTekst(ref.g)})`)), 'g met hetzelfde teken als de tabel');
    const zin = u.apa.rapport;
    assert.ok(zin.startsWith(`De groep “${a}” (*M* = `), zin);
    assert.ok(zin.includes(`scoorde ${hoger ? 'hoger' : 'lager'} op “Werkdruk” dan de groep “${b}”`), zin);
    assert.ok(zin.includes(`*t*(${(Math.round(ref.welch.df * 10) / 10).toFixed(1).replace('.', ',')}) = ${gTekst(ref.welch.t)}`), zin);
    assert.ok(zin.includes(`*g* = ${gTekst(ref.g)}, 95%-BI [${gTekst(ref.g_ci[0])}; ${gTekst(ref.g_ci[1])}]`), zin);
  });
}

// ---------- J3: een cijfervraag hoort nooit bij de vragen van een thema ----------

test('J3: snelkeuze, Cronbachs alfa en factoranalyse nemen geen cijfervraag als item', async () => {
  const { run, overzicht } = werkbank();
  const cijfer = overzicht.variabelen.find((v) => v.id === 'v:5');
  assert.equal(cijfer.thema_id, 10, 'de cijfervraag staat in thema Werkdruk (zoals in het sjabloon)');
  assert.equal(past({ soort: 'item' }, cijfer), false, 'niet te kiezen bij Betrouwbaarheid en Factoranalyse');
  assert.equal(past({ soort: 'getal' }, cijfer), true, 'wel als getal (correlatie, beschrijvend)');
  const snel = overzicht.variabelen.filter((v) => isThemaVraag(v, 10)).map((v) => v.id);
  assert.deepEqual(snel, ['v:2', 'v:3', 'v:4'], 'Alle vragen van een thema: dezelfde vragen als de themascore');
  const met = await run('betrouwbaarheid', { items: ['v:2', 'v:3', 'v:4', 'v:5'] });
  assert.equal(met.geweigerd, true);
  assert.deepEqual(meldingen(met), [P_CIJFER_ITEM('Welk rapportcijfer geef je?')]);
  const fa = await run('factoranalyse', { items: ['v:2', 'v:3', 'v:4', 'v:5'] });
  assert.equal(fa.geweigerd, true);
  assert.deepEqual(meldingen(fa), [P_CIJFER_ITEM('Welk rapportcijfer geef je?')]);
  const zonder = await run('betrouwbaarheid', { items: snel });
  dicht(tabelVan(zonder, 'alfa').rijen[0][1].w, REF.alfa_thema10, 1e-12, 'Cronbachs alfa');
  assert.ok(!meldingen(zonder).includes(P_BEREIK_VERSCHILT));
  // Verschillend bereik: een waarschuwing.
  const { run: run2 } = werkbank(maakExport(), [{ id: 1, soort: 'bereken', naam: 'som', definitie: { functie: 'som', variabelen: ['v:2', 'v:3'] } }]);
  const mix = await run2('betrouwbaarheid', { items: ['v:2', 'v:3', 'w:1'] });
  assert.ok(meldingen(mix).includes(P_BEREIK_VERSCHILT), meldingen(mix).join(' | '));
  // Het venster Schaalscore berekenen gebruikt dezelfde snelkeuze (alleen schaalvragen).
  const bron = readFileSync(new URL('../public/js/beheer/schermen/werkbank-variabelen.js', import.meta.url), 'utf8');
  assert.ok(bron.includes("const themaVraag = (v, t) => v.thema_id === t && v.groep === 'vraag' && v.type === 'schaal';"));
});

// ---------- G4: een themascore die het dashboard toont, met een uitweg in de werkbank ----------

test('G4: een geblokkeerde themascore staat vooraf gemarkeerd, de melding geeft de uitweg, en die uitweg werkt', async () => {
  const data = maakExport();
  const dash = dashboardUitRijen(rijenUitExport(data), { vragenlijst: 1, uitsplitsen: null });
  const thema = dash.selectie.themas.find((t) => t.thema_id === 11);
  assert.equal(thema.n, 60, 'het dashboard toont Samenwerking met n = 60');
  const { overzicht, run } = werkbank(data, [
    { id: 1, soort: 'bereken', naam: 'samen1', definitie: { functie: 'gemiddelde', variabelen: ['v:6', 'v:7', 'v:8'], min_geldig: 1 } },
    { id: 2, soort: 'bereken', naam: 'samen_half', definitie: { functie: 'gemiddelde', variabelen: ['v:6', 'v:7', 'v:8'] } },
  ]);
  const t11 = overzicht.variabelen.find((v) => v.id === 't:11');
  assert.equal(t11.b7, true, 'gemarkeerd in de variabelenlijst');
  assert.equal(overzicht.variabelen.find((v) => v.id === 't:10').b7, false);
  const b = await run('beschrijvend', { variabelen: ['t:11'] });
  assert.equal(b.geweigerd, true);
  assert.deepEqual(meldingen(b), [pWeggevallen({ label: 'Samenwerking', bron: 'thema' })]);
  assert.ok(meldingen(b)[0].startsWith(`“Samenwerking”: ${P_WEGGEVALLEN}.`), 'de vaste B7-zin blijft voorop');
  assert.ok(meldingen(b)[0].endsWith(P_WEGGEVALLEN_UITWEG));
  // De uitweg: dezelfde vragen met minimaal 1 beantwoorde vraag. Niemand valt weg; het getal klopt met SciPy.
  assert.equal(overzicht.variabelen.find((v) => v.id === 'w:1').b7, false);
  const w = await run('beschrijvend', { variabelen: ['w:1'] });
  assert.ok(!w.geweigerd, meldingen(w).join(' | '));
  const r = tabelVan(w, 'beschrijvend').rijen[0];
  assert.equal(r[1].w, REF.thema11_min1.n);
  dicht(r[2].w, REF.thema11_min1.gemiddelde, 1e-12, 'gemiddelde');
  dicht(r[3].w, REF.thema11_min1.sd, 1e-12, 'sd');
  // Een eigen score met het standaardminimum: de uitweg is daar "Aanpassen".
  assert.equal(overzicht.variabelen.find((v) => v.id === 'w:2').b7, true);
  const h = await run('beschrijvend', { variabelen: ['w:2'] });
  assert.equal(h.geweigerd, true);
  assert.deepEqual(meldingen(h), [pWeggevallen({ label: 'samen_half', bron: 'berekend' })]);
  assert.ok(meldingen(h)[0].endsWith(P_WEGGEVALLEN_UITWEG_EIGEN));
});

// ---------- J6: de volledige kopie ----------

test('J6: de volledige kopie (JSON) heeft cijferschalen, kenmerken, de APA-velden van gekoppelde bronnen en een volledige toelichting', () => {
  const data = maakExport();
  data.bronnen_gekoppeld = [{ bron_id: 7, notitie: 'Voor het kader' }];
  const bron = {
    id: 7, collectie: 'eigen', citeersleutel: 'bakker2017', soort: 'artikel', titel: 'Job demands-resources theory: Taking stock and looking forward',
    auteurs: [{ achternaam: 'Bakker', tussenvoegsel: '', voorletters: 'A. B.' }, { achternaam: 'Demerouti', tussenvoegsel: '', voorletters: 'E.' }],
    organisatie: '', afkorting: '', jaar: 2017, taal: 'en', url: '', doi: '10.1037/ocp0000056',
    details: { tijdschrift: 'Journal of Occupational Health Psychology', jaargang: '22', nummer: '3', paginas: '273–285' },
    notities: 'GEHEIME NOTITIE', samenvatting: 'Samenvatting', onderwerpen: [], trefwoorden: [], kernpunten: [],
  };
  const json = JSON.parse(volledigeJson(data, { bronnen: [bron] }));
  assert.deepEqual(json.cijferschalen, CIJFERSCHALEN);
  assert.deepEqual(json.kenmerken, KENMERKEN);
  assert.match(json.export.toelichting, /cijfervraag/);
  assert.match(json.export.toelichting, /0 t\/m 10/);
  assert.match(json.export.toelichting, /1 t\/m 10/);
  assert.match(json.export.toelichting, /kenmerk/);
  const k = json.bronnen_gekoppeld[0];
  assert.equal(k.notitie, 'Voor het kader');
  assert.equal(k.bron.citeersleutel, 'bakker2017');
  assert.equal(k.bron.doi, '10.1037/ocp0000056');
  assert.ok(k.bron.verwijzing.startsWith('Bakker, A. B., & Demerouti, E. (2017).'), k.bron.verwijzing);
  assert.ok(!JSON.stringify(json).includes('GEHEIME NOTITIE'), 'de notities van de bibliotheek gaan niet mee');
  // Zonder bronnen: zoals vroeger (bron_id en notitie).
  assert.deepEqual(JSON.parse(volledigeJson(data)).bronnen_gekoppeld, [{ bron_id: 7, notitie: 'Voor het kader' }]);
  // Afronden noemt de nieuwe onderdelen bij de kopie en bij het verwijderen.
  const afronden = readFileSync(new URL('../public/js/beheer/schermen/afronden.js', import.meta.url), 'utf8');
  const kopie = afronden.split('\n').find((r) => r.includes('Volledige kopie van dit onderzoek'));
  const weg = afronden.split('\n').find((r) => r.includes('wordt definitief verwijderd:'));
  for (const woord of ['werkbank', 'codes en citaten', 'HR-instellingen', 'personeelscijfers']) {
    assert.ok(kopie.includes(woord), `kopie: ${woord}`);
    assert.ok(weg.includes(woord), `verwijderen: ${woord}`);
  }
  assert.ok(kopie.includes('gekoppelde bronnen'));
  assert.ok(weg.includes('De bronnen in de bibliotheek blijven staan'));
});
