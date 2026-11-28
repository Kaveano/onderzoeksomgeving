// Analyse, onderdeel 6: een eigen dataset onderzoeken (een ingelezen Excel- of CSV-bestand).
// Vier vragen: één kolom beschrijven, groepen vergelijken, samenhang tussen twee getallen en het verband
// tussen twee indelingen. De berekeningen komen uit ../statistiek.js, net als bij de andere onderdelen.
// De bouwstenen (kaart, keuzelijst, uitkomstenlijst, conclusieblok) krijgt deze module van analyse.js.

import { api } from '../api.js';
import { h, vervang, laden, melding, meld, meldFout, bevestig, aantal, getal } from '../ui.js';
import * as S from '../statistiek.js';
import { kolomSoort, isCodekolom } from '../inlees-regels.js';
import { verbergReeks, verdeelInGroepen } from '../privacy.js';
import { ordeStatistieken } from '../werkbank/privacy-selectie.js';

const ALFA = 0.05;
export const MIN_GROEP = 5; // kleinere groepen doen niet mee aan een vergelijking (de drempel van 5, zoals overal; BOUWPLAN B5)
const MAX_GROEPEN = 12;
export const MIN_PAREN = 10; // samenhang: minstens zoveel rijen met een waarde in beide kolommen (zoals bij de vragenlijsten)

const isLeeg = (w) => w === null || w === undefined || w === '';
const sleutel = (w) => String(w).trim().toLowerCase();

/** Verdeelt de rijen in groepen op de waarde van een kolom: [{ naam, rijen }], grootste eerst. */
function groepeer(rijen, kolom) {
  const groepen = new Map();
  for (const r of rijen) {
    if (isLeeg(r[kolom])) continue;
    const k = sleutel(r[kolom]);
    if (!groepen.has(k)) groepen.set(k, { naam: String(r[kolom]).trim(), rijen: [] });
    groepen.get(k).rijen.push(r);
  }
  return [...groepen.values()].sort((a, b) => b.rijen.length - a.rijen.length || a.naam.localeCompare(b.naam, 'nl'));
}

const getallen = (rijen, kolom) => rijen.map((r) => r[kolom]).filter((w) => typeof w === 'number' && Number.isFinite(w));

// ---------- Privacy (P5): dezelfde regels als de werkbank op dezelfde dataset (privacy.js) ----------

/**
 * De verdeling van een indelingskolom, beschermd zoals in de werkbank: aantallen per groep gaan door verbergReeks
 * (1 tot 4, en ter aanvulling de kleinste andere, zodat niets uit het totaal terug te rekenen is); lege cellen zijn een
 * eigen reeks (1 tot 4 verborgen). Is er iets verborgen, dan staan de groepen op naam (de volgorde op grootte zou
 * verraden hoe groot een verborgen groep is), en zijn de percentages van alle rijen als het aantal lege cellen
 * verborgen is (anders volgt het uit het totaal).
 * @returns {{ groepen: { naam, aantal: number|null, pct: number|null }[], leeg: number|null, totaal: number|null, basis: number, ietsVerborgen: boolean }}
 */
export function kolomVerdeling(rijen, kolom, d = MIN_GROEP) {
  const gr = groepeer(rijen, kolom);
  const aantallen = gr.map((x) => x.rijen.length);
  const weg = verbergReeks(aantallen, d);
  const leeg = rijen.length - aantallen.reduce((a, b) => a + b, 0);
  const leegWeg = leeg > 0 && leeg < d;
  const ietsVerborgen = leegWeg || weg.some(Boolean);
  const totaal = aantallen.reduce((a, b) => a + b, 0);
  const basis = leegWeg ? rijen.length : totaal;
  let groepen = gr.map((x, i) => ({ naam: x.naam, aantal: weg[i] ? null : x.rijen.length, pct: weg[i] || !basis ? null : (x.rijen.length / basis) * 100 }));
  if (ietsVerborgen) groepen = groepen.slice().sort((a, b) => a.naam.localeCompare(b.naam, 'nl', { numeric: true }));
  return { groepen, leeg: leegWeg ? null : leeg, totaal: leegWeg ? null : totaal, basis, ietsVerborgen };
}

/**
 * Beschrijving van een getallenkolom zonder getallen die bij één persoon horen (PR-10, zoals de werkbank): minder dan
 * 5 waarden → null; minimum en maximum zijn de 5e laagste en hoogste waarde en de mediaan staat er pas vanaf 9 waarden.
 */
export function getalBeschrijving(waarden, d = MIN_GROEP) {
  const b = S.beschrijf(waarden);
  if (!b || b.n < d) return null;
  const o = ordeStatistieken(waarden.slice().sort((x, y) => x - y), d);
  return { ...b, mediaan: o.mediaan, min: o.minimum, max: o.maximum };
}

/**
 * Groepen om te vergelijken (strategie 'weglaten' van privacy.js, zoals Verschil tussen groepen): groepen met minder
 * dan 5 waarden doen niet mee, en is wat verborgen blijft samen 1 tot 4, dan ook de kleinste andere groep niet. Wie wel
 * een waarde heeft maar geen groep (lege cel in de indeling), telt als verborgen mee: de beschrijving van de kolom
 * toont het totaal. Daarna hooguit maxGroepen (de grootste).
 * @returns {{ mee: { naam, waarden }[], klein: string[], ookNiet: string[], teVeel: boolean }}
 */
export function datasetGroepen(rijen, wat, groep, { d = MIN_GROEP, maxGroepen = MAX_GROEPEN } = {}) {
  const alles = groepeer(rijen, groep).map((x) => ({ naam: x.naam, waarden: getallen(x.rijen, wat) }));
  const zonderGroep = rijen.filter((r) => isLeeg(r[groep]) && typeof r[wat] === 'number' && Number.isFinite(r[wat])).length;
  const r = verdeelInGroepen(alles.map((x, i) => ({ sleutel: i, label: x.naam, n: x.waarden.length })), { d, strategie: 'weglaten', extraVerborgen: zonderGroep });
  let mee = r.zichtbaar.map((z) => alles[z.sleutel]).sort((a, b) => b.waarden.length - a.waarden.length || a.naam.localeCompare(b.naam, 'nl'));
  const teVeel = mee.length > maxGroepen;
  if (teVeel) mee = mee.slice(0, maxGroepen);
  return {
    mee,
    klein: r.weggelaten.filter((w) => w.reden === 'klein').map((w) => w.label).sort((a, b) => a.localeCompare(b, 'nl', { numeric: true })),
    ookNiet: r.weggelaten.filter((w) => w.reden === 'terugrekenen').map((w) => w.label),
    teVeel,
  };
}

/**
 * Maakt de kaart. bouw: { nummer, maakKaart, kiesVeld, uitkomstKop, beschrijfTabel, uitkomsten, conclusie, stukKnop,
 *                         duidTweeGroepen, duidMeerGroepen, taal: { g, metTeken, pTekst, dfTekst, nTekst, bereik, LET_OP_VERSCHIL, LET_OP_VERBAND } }
 * keuze: object waarin de gemaakte keuzes bewaard blijven.
 */
export function maakDatasetKaart(ctx, bouw, keuze) {
  const onderzoekId = ctx.params.id;
  const { g, ge, metTeken, pTekst, dfTekst, nTekst, bereik, LET_OP_VERSCHIL, LET_OP_VERBAND } = bouw.taal;
  const kaart = bouw.maakKaart('an-dataset', bouw.nummer, 'Eigen dataset onderzoeken',
    'Gebruik dit voor gegevens uit een eigen Excel- of CSV-bestand, bijvoorbeeld verzuim per afdeling. Je kunt kolommen beschrijven, groepen vergelijken en verbanden toetsen.');
  let datasets = [];
  let dataset = null; // { naam, kolommen, rijen, soorten }

  async function voegToe() {
    try {
      const m = await import('./inlezen-kaart.js');
      const id = await m.datasetToevoegen(ctx);
      if (id) {
        keuze.dataset = id;
        meld('De dataset is opgeslagen.', 'succes');
        await laadLijst();
      }
    } catch (e) {
      meldFout(e);
    }
  }

  async function laadLijst() {
    vervang(kaart.inhoud, laden('De datasets worden geladen…'));
    try {
      ({ datasets } = await api.get(`/onderzoeken/${onderzoekId}/datasets`));
    } catch (e) {
      vervang(kaart.inhoud, melding([h('strong', {}, 'De datasets konden niet worden geladen. '), e.message || ''], 'gevaar'));
      return;
    }
    if (!datasets.length) {
      dataset = null;
      vervang(kaart.inhoud,
        h('div', { class: 'an-zacht-blok' },
          h('p', {}, 'Je hebt nog geen eigen dataset toegevoegd.'),
          ctx.alleenLezen ? null : h('div', { class: 'knoppen' }, h('button', { type: 'button', class: 'knop knop-primair', 'aria-haspopup': 'dialog', onclick: voegToe }, 'Dataset toevoegen (Excel of CSV)'))));
      return;
    }
    if (!datasets.some((d) => d.id === keuze.dataset)) keuze.dataset = datasets[datasets.length - 1].id;
    await laadDataset();
  }

  async function laadDataset() {
    vervang(kaart.inhoud, laden('De dataset wordt geladen…'));
    try {
      const { dataset: d } = await api.get(`/datasets/${keuze.dataset}`);
      dataset = {
        ...d,
        soorten: d.kolommen.map((_, i) => kolomSoort(d.rijen.map((r) => r[i]))),
        // Getallen die codes zijn (jaar, teamnummer) kunnen ook als indeling in groepen dienen.
        codes: d.kolommen.map((_, i) => isCodekolom(d.rijen.map((r) => r[i]))),
      };
    } catch (e) {
      vervang(kaart.inhoud, melding([h('strong', {}, 'De dataset kon niet worden geladen. '), e.message || ''], 'gevaar'));
      return;
    }
    teken();
  }

  const kolommenVan = (soort) => dataset.kolommen.map((naam, i) => ({ naam, i })).filter((k) => dataset.soorten[k.i] === soort);
  // Indelingen: kolommen met groepen, plus getallenkolommen die codes zijn.
  const indelingen = () => dataset.kolommen.map((naam, i) => ({ naam: dataset.soorten[i] === 'getal' ? `${naam} (als groepen)` : naam, i }))
    .filter((k) => dataset.soorten[k.i] === 'categorie' || (dataset.soorten[k.i] === 'getal' && dataset.codes[k.i]));

  function kolomOverzicht() {
    return h('details', { class: 'an-uitklap' },
      h('summary', {}, `De kolommen van deze dataset (${dataset.kolommen.length})`),
      h('div', { class: 'tabel-wrapper' },
        h('table', { class: 'tabel an-tabel' },
          h('caption', { class: 'sr-only' }, 'Kolommen van de dataset met hun soort en inhoud'),
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Kolom'), h('th', { scope: 'col' }, 'Soort'), h('th', { scope: 'col', class: 'rechts' }, 'Gevuld'), h('th', { scope: 'col' }, 'Inhoud'))),
          h('tbody', {}, dataset.kolommen.map((naam, i) => {
            const soort = dataset.soorten[i];
            const gevuld = dataset.rijen.filter((r) => !isLeeg(r[i])).length;
            // Gevuld: 1 tot 4 (of 1 tot 4 lege cellen bij een indeling) wordt ×, zoals Geldig (n) in de werkbank.
            const leeg = dataset.rijen.length - gevuld;
            const gevuldWeg = (gevuld > 0 && gevuld < MIN_GROEP) || (soort === 'categorie' && leeg > 0 && leeg < MIN_GROEP);
            let inhoud = '';
            if (soort === 'getal') {
              const b = getalBeschrijving(getallen(dataset.rijen, i));
              inhoud = !b ? `minder dan ${MIN_GROEP} waarden` : b.min === null ? `gemiddeld ${g(b.gemiddelde)}` : `gemiddeld ${g(b.gemiddelde)}; van ${g(b.min)} tot ${g(b.max)}*`;
            } else if (soort === 'categorie') {
              const v = kolomVerdeling(dataset.rijen, i);
              inhoud = `${aantal(v.groepen.length, 'groep', 'groepen')}: ${v.groepen.slice(0, 4).map((x) => `${x.naam} (${x.aantal === null ? '×' : x.aantal})`).join(', ')}${v.groepen.length > 4 ? ', …' : ''}`;
            } else if (soort === 'tekst') {
              inhoud = 'vrije tekst (niet te analyseren)';
            }
            return h('tr', {},
              h('th', { scope: 'row' }, naam),
              h('td', {}, { getal: 'Getal', categorie: 'Indeling', tekst: 'Tekst', leeg: 'Leeg' }[soort]),
              h('td', { class: 'rechts getal' }, gevuldWeg ? '×' : gevuld.toLocaleString('nl-NL')),
              h('td', {}, inhoud));
          })))),
      h('p', { class: 'an-noot' }, `× = niet getoond: minder dan ${MIN_GROEP} rijen, of verborgen zodat een klein aantal niet terug te rekenen is. * Van en tot: de ${MIN_GROEP}e laagste en de ${MIN_GROEP}e hoogste waarde, zodat geen getal bij één persoon hoort.`));
  }

  // ----- De vier vragen -----

  function beschrijf() {
    const alle = dataset.kolommen.map((naam, i) => ({ naam, i })).filter((k) => ['getal', 'categorie'].includes(dataset.soorten[k.i]));
    if (!alle.length) return [melding('Deze dataset heeft geen kolommen met getallen of een indeling in groepen.')];
    if (!alle.some((k) => k.i === keuze.dsKolom)) keuze.dsKolom = alle[0].i;
    const veld = bouw.kiesVeld('an-ds-kolom', 'Kolom', alle.map((k) => ({ waarde: String(k.i), label: k.naam })), String(keuze.dsKolom), (w) => { keuze.dsKolom = Number(w); teken(); });
    const k = keuze.dsKolom;
    const naam = dataset.kolommen[k];
    if (dataset.soorten[k] === 'getal') {
      const b = getalBeschrijving(getallen(dataset.rijen, k));
      if (!b) return [veld, bouw.uitkomstKop(naam), melding(`Deze kolom heeft minder dan ${MIN_GROEP} waarden. Om de anonimiteit te beschermen, tonen we er niets van.`)];
      const metOrde = b.min !== null;
      const tekst = () => [`${naam} – ${dataset.naam} (${nTekst(b.n)})`, `- Gemiddelde: ${g(b.gemiddelde)}`,
        metOrde ? `- Middelste waarde (mediaan): ${g(b.mediaan)}` : null, `- Spreiding (sd): ${g(b.sd)}`,
        metOrde ? `- Laagste en hoogste (de ${MIN_GROEP}e laagste en de ${MIN_GROEP}e hoogste waarde): ${g(b.min)} en ${g(b.max)}` : null].filter(Boolean).join('\n');
      return [veld, bouw.uitkomstKop(naam, bouw.stukKnop(tekst, `beschrijving van ${naam}`)), bouw.uitkomsten([
        ['Aantal waarden', nTekst(b.n), dataset.rijen.length > b.n ? `${aantal(dataset.rijen.length - b.n, 'rij is', 'rijen zijn')} leeg in deze kolom.` : null],
        ['Gemiddelde', g(b.gemiddelde), null],
        metOrde ? ['Middelste waarde (mediaan)', g(b.mediaan), 'De helft van de waarden ligt eronder, de helft erboven. Wijkt de mediaan sterk af van het gemiddelde, dan zijn er uitschieters.'] : null,
        ['Spreiding (sd)', g(b.sd), 'Hoe groter, hoe verder de waarden uit elkaar liggen.'],
        metOrde
          ? ['Laagste en hoogste waarde', bereik(b.min, b.max), `De ${MIN_GROEP}e laagste en de ${MIN_GROEP}e hoogste waarde, zodat geen getal bij één persoon hoort.`]
          : ['Laagste en hoogste waarde', 'niet getoond', `Die staan er pas bij vanaf ${2 * MIN_GROEP - 1} waarden, zodat geen getal bij één persoon hoort.`],
      ])];
    }
    const v = kolomVerdeling(dataset.rijen, k);
    const cel = (x) => (x === null ? '×' : x.toLocaleString('nl-NL'));
    const pct = (x) => (x === null ? '×' : `${getal(x, 0)}%`);
    const tekst = () => [`${naam} – ${dataset.naam} (${nTekst(v.basis)})`, ...v.groepen.map((x) => `- ${x.naam}: ${cel(x.aantal)} (${pct(x.pct)})`),
      v.ietsVerborgen ? `× = niet getoond: minder dan ${MIN_GROEP}, of verborgen zodat een klein aantal niet terug te rekenen is.` : null].filter(Boolean).join('\n');
    return [veld, bouw.uitkomstKop(naam, bouw.stukKnop(tekst, `verdeling van ${naam}`)),
      h('div', { class: 'tabel-wrapper' },
        h('table', { class: 'tabel an-tabel' },
          h('caption', { class: 'sr-only' }, `Verdeling van ${naam}`),
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, naam), h('th', { scope: 'col', class: 'rechts' }, 'Aantal'), h('th', { scope: 'col', class: 'rechts' }, 'Percentage'))),
          h('tbody', {}, v.groepen.map((x) => h('tr', {}, h('th', { scope: 'row' }, x.naam), h('td', { class: 'rechts getal' }, cel(x.aantal)), h('td', { class: 'rechts getal' }, pct(x.pct))))))),
      v.ietsVerborgen ? h('p', { class: 'an-noot' }, `× = niet getoond: minder dan ${MIN_GROEP} rijen, of verborgen zodat een klein aantal niet terug te rekenen is.${v.leeg === null ? ' Ook het aantal lege cellen is verborgen; de percentages zijn daarom van alle rijen.' : ''}`) : null];
  }

  function groepen() {
    const getal_ = kolommenVan('getal');
    const cat = indelingen();
    if (!getal_.length || !cat.length) return [melding('Hiervoor is een kolom met getallen nodig (wat je vergelijkt) en een kolom met een indeling in groepen (bijvoorbeeld afdeling).')];
    if (!getal_.some((k) => k.i === keuze.dsWat)) keuze.dsWat = getal_[0].i;
    if (!cat.some((k) => k.i === keuze.dsGroep)) keuze.dsGroep = cat[0].i;
    // Een kolom niet met zichzelf vergelijken (een codekolom staat in beide lijsten).
    if (keuze.dsWat === keuze.dsGroep) {
      const ander = getal_.find((k) => k.i !== keuze.dsGroep) || null;
      if (!ander) return [melding('Hiervoor is naast de indeling nog een kolom met getallen nodig.')];
      keuze.dsWat = ander.i;
    }
    const velden = h('div', { class: 'an-keuzes' },
      bouw.kiesVeld('an-ds-wat', 'Wat wil je vergelijken?', getal_.map((k) => ({ waarde: String(k.i), label: k.naam })), String(keuze.dsWat), (w) => { keuze.dsWat = Number(w); teken(); }),
      bouw.kiesVeld('an-ds-groep', 'Tussen welke groepen?', cat.map((k) => ({ waarde: String(k.i), label: k.naam })), String(keuze.dsGroep), (w) => { keuze.dsGroep = Number(w); teken(); }));
    const wat = dataset.kolommen[keuze.dsWat];
    const indeling = dataset.kolommen[keuze.dsGroep];
    const titel = `${wat} per ${indeling}`;
    // Kleine groepen doen niet mee, en zo nodig ook de kleinste andere groep (privacy.js, 'weglaten'): anders is een
    // kleine groep terug te rekenen uit het gemiddelde van de hele kolom (bij "Hoe ziet één kolom eruit?").
    const { mee, klein, ookNiet, teVeel } = datasetGroepen(dataset.rijen, keuze.dsWat, keuze.dsGroep);
    const noot = [
      klein.length ? `Niet meegenomen omdat er minder dan ${MIN_GROEP} waarden zijn: ${klein.slice(0, 8).join(', ')}${klein.length > 8 ? ', …' : ''}.` : null,
      ookNiet.length ? `Ook niet meegenomen: ${ookNiet.join(', ')}. Anders zijn de waarden van een kleine groep terug te rekenen uit het totaal.` : null,
      teVeel ? `Alleen de ${MAX_GROEPEN} grootste groepen zijn meegenomen.` : null,
    ].filter(Boolean).join(' ');
    const nootEl = noot ? h('p', { class: 'an-noot' }, noot) : null;
    if (mee.length < 2) return [velden, bouw.uitkomstKop(titel), melding(`Er zijn geen twee groepen met elk minstens ${MIN_GROEP} waarden. Een vergelijking is daarom niet mogelijk.`), nootEl];
    const gr = mee.map((x) => ({ ...x, b: S.beschrijf(x.waarden) }));
    const tabel = bouw.beschrijfTabel(indeling, gr, `${wat} per groep`);
    const kop = [`Verschil tussen groepen – ${titel}`, `Dataset: ${dataset.naam}`];

    if (gr.length === 2) {
      const [A, B] = gr;
      const r = { A: A.b, B: B.b, welch: S.welchT(A.waarden, B.waarden), mw: S.mannWhitney(A.waarden, B.waarden), d: S.cohensD(A.waarden, B.waarden) };
      if (!r.welch) return [velden, bouw.uitkomstKop(titel), tabel, nootEl, melding('Alle waarden zijn precies gelijk. Zonder verschillen valt er niets te toetsen.')];
      const duiding = bouw.duidTweeGroepen(r, (v) => (Math.abs(v) < 0.005
        ? `De groepen “${A.naam}” en “${B.naam}” liggen gemiddeld gelijk.`
        : `De groep “${B.naam}” ligt gemiddeld ${g(Math.abs(v))} ${v > 0 ? 'hoger' : 'lager'} dan de groep “${A.naam}”.`));
      const toets = `t(${dfTekst(r.welch.df)}) = ${g(r.welch.t)}; ${pTekst(r.welch.p)}`;
      const tekst = () => [...kop,
        ...gr.map((x) => `- ${x.naam}: gemiddeld ${g(x.b.gemiddelde)} (sd ${g(x.b.sd)}; ${nTekst(x.b.n)})`),
        `- Verschil: ${metTeken(r.welch.verschil)} (95%-interval ${bereik(r.welch.ciLaag, r.welch.ciHoog)})`,
        `- Welch t-toets: ${toets}`,
        r.d ? `- Effectgrootte: Hedges' g = ${ge(r.d.g, 'g')} (${S.effectGrootte(r.d.g, 'g')})` : null,
        noot || null,
        `Conclusie: ${duiding.zinnen.join(' ')}`,
        'Kanttekening: significant betekent niet automatisch belangrijk.'].filter(Boolean).join('\n');
      return [velden, bouw.uitkomstKop(titel, bouw.stukKnop(tekst, `verschil tussen ${A.naam} en ${B.naam}`)), tabel, nootEl,
        bouw.uitkomsten([
          ['Verschil', metTeken(r.welch.verschil), `“${B.naam}” min “${A.naam}”. Het echte verschil ligt waarschijnlijk tussen ${g(r.welch.ciLaag)} en ${g(r.welch.ciHoog)} (95%-interval).`],
          ['Toets op het verschil (Welch t-toets)', toets, null],
          r.mw ? ['Controle met rangnummers (Mann-Whitney)', `U = ${g(r.mw.u, Number.isInteger(r.mw.u) ? 0 : 1)}; z = ${g(r.mw.z)}; ${pTekst(r.mw.p)}`, 'Deze toets kijkt naar de volgorde van de waarden en is minder gevoelig voor uitschieters. Komt hij op hetzelfde uit, dan is de conclusie steviger.'] : null,
          r.d ? ['Effectgrootte (Hedges’ g)', `${ge(r.d.g, 'g')} – ${S.effectGrootte(r.d.g, 'g')}`, 'Vuistregel: vanaf 0,2 klein, vanaf 0,5 middelgroot, vanaf 0,8 groot.'] : null,
        ]),
        bouw.conclusie(duiding, LET_OP_VERSCHIL)];
    }

    const lijsten = gr.map((x) => x.waarden);
    const r = { anova: S.anova(lijsten), welch: S.welchAnova(lijsten), kw: S.kruskalWallis(lijsten) };
    if (!r.anova) return [velden, bouw.uitkomstKop(titel), tabel, nootEl, melding('Alle waarden zijn precies gelijk. Zonder verschillen valt er niets te toetsen.')];
    const duiding = bouw.duidMeerGroepen(r, gr);
    const eta = S.effectGrootte(r.anova.etaKwadraat, 'eta2');
    const anovaTekst = `F(${dfTekst(r.anova.df1)}; ${dfTekst(r.anova.df2)}) = ${g(r.anova.f)}; ${pTekst(r.anova.p)}`;
    const welchTekst = r.welch ? `F(${dfTekst(r.welch.df1)}; ${dfTekst(r.welch.df2)}) = ${g(r.welch.f)}; ${pTekst(r.welch.p)}` : null;
    const kwTekst = r.kw ? `H(${dfTekst(r.kw.df)}) = ${g(r.kw.h)}; ${pTekst(r.kw.p)}` : null;
    const tekst = () => [...kop,
      ...gr.map((x) => `- ${x.naam}: gemiddeld ${g(x.b.gemiddelde)} (sd ${g(x.b.sd)}; ${nTekst(x.b.n)})`),
      `- Variantieanalyse (ANOVA): ${anovaTekst}`,
      welchTekst ? `- Welch-ANOVA: ${welchTekst}` : null,
      kwTekst ? `- Kruskal-Wallis-toets: ${kwTekst}` : null,
      `- Effectgrootte: eta² = ${ge(r.anova.etaKwadraat, 'eta2')} (${eta})`,
      noot || null,
      `Conclusie: ${duiding.zinnen.join(' ')}`,
      'Kanttekening: significant betekent niet automatisch belangrijk.'].filter(Boolean).join('\n');
    return [velden, bouw.uitkomstKop(titel, bouw.stukKnop(tekst, 'verschil tussen de groepen')), tabel, nootEl,
      bouw.uitkomsten([
        ['Toets op verschil (variantieanalyse, ANOVA)', anovaTekst, 'Toetst of de gemiddelden van de groepen meer van elkaar verschillen dan je door toeval verwacht.'],
        welchTekst ? ['Controle bij ongelijke groepen (Welch-ANOVA)', welchTekst, 'Houdt er rekening mee dat de groepen niet even groot zijn of niet dezelfde spreiding hebben.'] : null,
        kwTekst ? ['Controle met rangnummers (Kruskal-Wallis)', kwTekst, 'Kijkt naar de volgorde van de waarden en is minder gevoelig voor uitschieters.'] : null,
        ['Effectgrootte (eta²)', `${ge(r.anova.etaKwadraat, 'eta2')} – ${eta}`, `De groepsindeling hangt samen met ongeveer ${getal(r.anova.etaKwadraat * 100, 0)}% van de verschillen. Vuistregel: vanaf 0,01 klein, vanaf 0,06 middelgroot, vanaf 0,14 groot.`],
      ]),
      bouw.conclusie(duiding, LET_OP_VERSCHIL)];
  }

  function samenhang() {
    const kol = kolommenVan('getal');
    if (kol.length < 2) return [melding('Hiervoor zijn twee kolommen met getallen nodig.')];
    if (!kol.some((k) => k.i === keuze.dsX)) keuze.dsX = kol[0].i;
    if (!kol.some((k) => k.i === keuze.dsY) || keuze.dsY === keuze.dsX) keuze.dsY = kol.find((k) => k.i !== keuze.dsX).i;
    const opties = kol.map((k) => ({ waarde: String(k.i), label: k.naam }));
    const velden = h('div', { class: 'an-keuzes' },
      bouw.kiesVeld('an-ds-x', 'Eerste kolom', opties, String(keuze.dsX), (w) => { keuze.dsX = Number(w); teken(); }),
      bouw.kiesVeld('an-ds-y', 'Tweede kolom', opties, String(keuze.dsY), (w) => { keuze.dsY = Number(w); teken(); }));
    const x = dataset.kolommen[keuze.dsX];
    const y = dataset.kolommen[keuze.dsY];
    const titel = `Samenhang tussen ${x} en ${y}`;
    if (keuze.dsX === keuze.dsY) return [velden, bouw.uitkomstKop(titel), melding('Kies twee verschillende kolommen.')];
    const paren = dataset.rijen.filter((r) => typeof r[keuze.dsX] === 'number' && typeof r[keuze.dsY] === 'number');
    if (paren.length < MIN_PAREN) return [velden, bouw.uitkomstKop(titel), melding(`Er zijn ${paren.length} rijen met een waarde in beide kolommen; er zijn er minstens ${MIN_PAREN} nodig.`)];
    const xs = paren.map((r) => r[keuze.dsX]);
    const ys = paren.map((r) => r[keuze.dsY]);
    const pr = S.pearson(xs, ys);
    const sp = S.spearman(xs, ys);
    if (!pr) return [velden, bouw.uitkomstKop(titel), melding('In minstens één van de kolommen zijn alle waarden gelijk. Dan valt er geen samenhang te berekenen.')];
    const effect = S.effectGrootte(pr.r, 'r');
    const significant = pr.p < ALFA;
    const zinnen = [effect === 'verwaarloosbaar'
      ? `Er is nauwelijks samenhang tussen ${x} en ${y} (r = ${ge(pr.r, 'r')}).`
      : `Hoe hoger ${x}, hoe ${pr.r > 0 ? 'hoger' : 'lager'} meestal ${y} (verband: ${effect}, r = ${ge(pr.r, 'r')}).`,
    significant ? 'Dit verband is statistisch significant: het is onwaarschijnlijk dat het alleen door toeval komt.' : 'Niet significant: het verband kan goed door toeval komen.'];
    if (sp && (sp.p < ALFA) !== significant) zinnen.push(`De controle met rangnummers (Spearman, ${pTekst(sp.p)}) komt op een andere conclusie uit. Wees daarom extra voorzichtig.`);
    const tekst = () => [`${titel} – ${dataset.naam} (${nTekst(paren.length)})`,
      `- Pearson-correlatie: r = ${ge(pr.r, 'r')}; ${pTekst(pr.p)}`,
      sp ? `- Spearman-rangcorrelatie: rho = ${ge(sp.rho, 'rho')}; ${pTekst(sp.p)}` : null,
      `Conclusie: ${zinnen.join(' ')}`,
      'Kanttekening: samenhang is geen oorzaak, en significant betekent niet automatisch belangrijk.'].filter(Boolean).join('\n');
    return [velden, bouw.uitkomstKop(titel, bouw.stukKnop(tekst, `samenhang tussen ${x} en ${y}`)),
      bouw.uitkomsten([
        ['Aantal rijen', nTekst(paren.length), 'Alleen rijen met een waarde in beide kolommen tellen mee.'],
        ['Samenhang (Pearson r)', `${ge(pr.r, 'r')}; ${pTekst(pr.p)}`, `Loopt van −1 (tegengesteld) via 0 (geen verband) tot +1 (gaat precies samen).${pr.ciLaag !== undefined && pr.ciLaag !== null ? ` 95%-interval ${bereik(pr.ciLaag, pr.ciHoog)}.` : ''} Vuistregel: vanaf 0,1 klein, vanaf 0,3 middelgroot, vanaf 0,5 groot.`],
        sp ? ['Controle met rangnummers (Spearman)', `${ge(sp.rho, 'rho')}; ${pTekst(sp.p)}`, 'Kijkt naar de volgorde van de waarden en is minder gevoelig voor uitschieters.'] : null,
      ]),
      bouw.conclusie({ zinnen, significant, effect }, LET_OP_VERBAND)];
  }

  function kruistabel() {
    const kol = indelingen();
    if (kol.length < 2) return [melding('Hiervoor zijn twee kolommen met een indeling in groepen nodig (bijvoorbeeld afdeling en contractsoort).')];
    if (!kol.some((k) => k.i === keuze.dsRij)) keuze.dsRij = kol[0].i;
    if (!kol.some((k) => k.i === keuze.dsKol) || keuze.dsKol === keuze.dsRij) keuze.dsKol = kol.find((k) => k.i !== keuze.dsRij).i;
    const opties = kol.map((k) => ({ waarde: String(k.i), label: k.naam }));
    const velden = h('div', { class: 'an-keuzes' },
      bouw.kiesVeld('an-ds-rij', 'Rijen', opties, String(keuze.dsRij), (w) => { keuze.dsRij = Number(w); teken(); }),
      bouw.kiesVeld('an-ds-kol', 'Kolommen', opties, String(keuze.dsKol), (w) => { keuze.dsKol = Number(w); teken(); }));
    const naamR = dataset.kolommen[keuze.dsRij];
    const naamK = dataset.kolommen[keuze.dsKol];
    const titel = `${naamR} en ${naamK}`;
    if (keuze.dsRij === keuze.dsKol) return [velden, bouw.uitkomstKop(titel), melding('Kies twee verschillende kolommen.')];
    const beide = dataset.rijen.filter((r) => !isLeeg(r[keuze.dsRij]) && !isLeeg(r[keuze.dsKol]));
    const alleRijen = groepeer(beide, keuze.dsRij);
    const alleKolommen = groepeer(beide, keuze.dsKol);
    const rijen = alleRijen.slice(0, MAX_GROEPEN);
    const kolommen = alleKolommen.slice(0, MAX_GROEPEN);
    const afgekapt = alleRijen.length > MAX_GROEPEN || alleKolommen.length > MAX_GROEPEN
      ? h('p', { class: 'an-noot' }, `Alleen de ${MAX_GROEPEN} grootste groepen per kolom zijn meegenomen; de rest telt niet mee in de tabel en de toets.`)
      : null;
    if (rijen.length < 2 || kolommen.length < 2) return [velden, bouw.uitkomstKop(titel), melding('In minstens één van de kolommen komt maar één groep voor. Dan valt er geen verband te toetsen.')];
    const tabel = rijen.map((r) => kolommen.map((k) => r.rijen.filter((x) => sleutel(x[keuze.dsKol]) === sleutel(k.naam)).length));
    // Net als bij onderdeel 5 en in de werkbank: een combinatie met minder dan 5 rijen (ook 0) komt niet in beeld, en
    // dan ook de toets niet (uit de toets en de totalen zou zo'n kleine cel terug te rekenen zijn).
    if (tabel.some((rij) => rij.some((c) => c < MIN_GROEP))) {
      return [velden, bouw.uitkomstKop(titel), afgekapt, melding([
        h('p', {}, `Niet elke combinatie heeft minstens ${MIN_GROEP} rijen. Om te voorkomen dat iets over zo'n kleine groep is af te leiden, worden de kruistabel en de toets niet getoond.`),
        h('p', { class: 'klein' }, 'Dit kan wel met minder groepen: deel de kolommen eerst in grotere groepen in (bijvoorbeeld in de werkbank, Indelen in groepen).'),
      ])];
    }
    const uit = S.chiKwadraat(tabel);
    const n = tabel.flat().reduce((a, b) => a + b, 0);
    const telTabel = h('div', { class: 'tabel-wrapper' },
      h('table', { class: 'tabel an-tabel an-kruistabel' },
        h('caption', { class: 'sr-only' }, `Aantal rijen per combinatie. Rijen: ${naamR}. Kolommen: ${naamK}.`),
        h('thead', {}, h('tr', {}, h('td', {}), kolommen.map((k) => h('th', { scope: 'col', class: 'rechts' }, k.naam)))),
        h('tbody', {}, rijen.map((r, i) => h('tr', {}, h('th', { scope: 'row' }, r.naam), kolommen.map((_, j) => h('td', { class: 'rechts getal' }, tabel[i][j].toLocaleString('nl-NL'))))))));
    if (!uit) return [velden, bouw.uitkomstKop(titel), telTabel, melding('Met deze aantallen valt er geen verband te toetsen.')];
    const rijTotaal = tabel.map((r) => r.reduce((a, b) => a + b, 0));
    const kolTotaal = kolommen.map((_, j) => tabel.reduce((a, r) => a + r[j], 0));
    let kleinVerwacht = 0;
    let ergKlein = false;
    for (const rt of rijTotaal) for (const kt of kolTotaal) {
      const verwacht = (rt * kt) / n;
      if (verwacht < 5) kleinVerwacht++;
      if (verwacht < 1) ergKlein = true;
    }
    const cellen = rijen.length * kolommen.length;
    const onbetrouwbaar = ergKlein || kleinVerwacht / cellen > 0.2;
    const significant = uit.p < ALFA;
    const effect = S.effectGrootte(uit.cramersV, 'v');
    const zinnen = [significant
      ? `Er is een statistisch significant verband tussen ${naamR} en ${naamK}: het is onwaarschijnlijk dat het alleen door toeval komt.`
      : `Niet significant: ${naamR} en ${naamK} hangen niet aantoonbaar samen. Verschillen die je ziet, kunnen goed door toeval komen.`,
    `Het verband is ${effect === 'verwaarloosbaar' ? 'verwaarloosbaar klein' : effect} (Cramérs V = ${ge(uit.cramersV, 'v')}).`];
    if (onbetrouwbaar) zinnen.push('Omdat de aantallen klein zijn, is deze uitkomst niet betrouwbaar; trek er geen stevige conclusies uit.');
    const toets = `chi²(${dfTekst(uit.df)}) = ${g(uit.chi2)}; ${pTekst(uit.p)}`;
    const tekst = () => [`Verband tussen ${naamR} en ${naamK} – ${dataset.naam} (${nTekst(n)})`,
      ...rijen.map((r, i) => `- ${r.naam}: ${kolommen.map((k, j) => `${k.naam} ${tabel[i][j]}`).join('; ')}`),
      `- Chi-kwadraattoets: ${toets}`,
      `- Sterkte van het verband: Cramérs V = ${ge(uit.cramersV, 'v')} (${effect})`,
      onbetrouwbaar ? 'Waarschuwing: door kleine aantallen is de toets niet betrouwbaar.' : null,
      `Conclusie: ${zinnen.join(' ')}`,
      'Kanttekening: samenhang is geen oorzaak, en significant betekent niet automatisch belangrijk.'].filter(Boolean).join('\n');
    return [velden, bouw.uitkomstKop(titel, bouw.stukKnop(tekst, `verband tussen ${naamR} en ${naamK}`)), telTabel, afgekapt,
      bouw.uitkomsten([
        ['Aantal rijen', nTekst(n), 'Alleen rijen met een waarde in beide kolommen tellen mee.'],
        ['Toets op verband (chi-kwadraat)', toets, 'Toetst of de verdeling over de kolommen verschilt per rij.'],
        ['Sterkte van het verband (Cramérs V)', `${ge(uit.cramersV, 'v')} – ${effect}`, 'Loopt van 0 (geen verband) tot 1 (volmaakt verband). Vuistregel: vanaf 0,1 klein, vanaf 0,3 middelgroot, vanaf 0,5 groot.'],
      ]),
      kleinVerwacht ? melding([h('strong', {}, onbetrouwbaar ? 'Toets niet betrouwbaar. ' : 'Kleine aantallen. '), `In ${kleinVerwacht} van de ${cellen} cellen is het aantal dat je zonder verband zou verwachten kleiner dan 5.`], 'waarschuwing') : null,
      bouw.conclusie({ zinnen, significant, effect }, LET_OP_VERBAND)];
  }

  const VRAGEN = [
    ['beschrijf', 'Hoe ziet één kolom eruit? (gemiddelde, spreiding of verdeling)', beschrijf],
    ['groepen', 'Verschillen groepen van elkaar? (een getal per groep vergelijken)', groepen],
    ['samenhang', 'Hangen twee getallen met elkaar samen?', samenhang],
    ['kruistabel', 'Hangen twee indelingen met elkaar samen? (kruistabel)', kruistabel],
  ];

  function teken() {
    if (!VRAGEN.some(([k]) => k === keuze.dsVraag)) keuze.dsVraag = 'beschrijf';
    const [, , maak] = VRAGEN.find(([k]) => k === keuze.dsVraag);
    const huidige = datasets.find((d) => d.id === keuze.dataset);
    vervang(kaart.inhoud,
      h('div', { class: 'an-keuzes' },
        bouw.kiesVeld('an-ds-dataset', 'Dataset', datasets.map((d) => ({ waarde: String(d.id), label: `${d.naam} – ${aantal(d.aantal_rijen, 'rij', 'rijen')}` })), String(keuze.dataset), (w) => { keuze.dataset = Number(w); laadDataset(); }),
        ctx.alleenLezen ? null : h('div', { class: 'knoppen an-ds-knoppen' },
          h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: voegToe }, 'Dataset toevoegen'),
          h('button', {
            type: 'button',
            class: 'knop knop-klein knop-licht',
            onclick: async () => {
              if (!(await bevestig({ titel: 'Dataset verwijderen?', tekst: `"${huidige ? huidige.naam : 'Deze dataset'}" wordt verwijderd uit dit onderzoek. Je eigen bestand op je computer blijft bestaan.`, knop: 'Verwijderen', gevaar: true }))) return;
              try {
                await api.del(`/datasets/${keuze.dataset}`);
                keuze.dataset = null;
                meld('De dataset is verwijderd.');
                laadLijst();
              } catch (e) {
                meldFout(e);
              }
            },
          }, 'Verwijderen'))),
      kolomOverzicht(),
      bouw.kiesVeld('an-ds-vraag', 'Wat wil je weten?', VRAGEN.map(([k, label]) => ({ waarde: k, label })), keuze.dsVraag, (w) => { keuze.dsVraag = w; teken(); }),
      h('div', { class: 'an-ds-uitkomst' }, maak()));
  }

  laadLijst();
  return kaart;
}
