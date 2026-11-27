// Werkbank: de vorm van definities (eigen variabelen, selecties) en van bewaarde analyses (spec).
// Zuivere module (geen DOM, geen fetch): de Worker (src/routes/werkbank.js) en de browser controleren met
// precies dezelfde regels (BOUWPLAN §3.7, D2 §4, §5.3 en §10.2).
//
// Een definitie beschrijft hoe een variabele wordt berekend; de waarden per respondent worden nooit bewaard.
// Verwijzingen naar variabelen zijn ids zoals 'v:12' (vraag), 't:3' (thema), 'm:4' (meetpunt), 'd:2' (kolom
// van een dataset), 'w:15' (eigen variabele), 'c:7@12' (code bij een open vraag) en 'sys:vragenlijst' /
// 'sys:meetmoment'. Er bestaat nooit een variabele voor de datum van invullen (BOUWPLAN B25, PR-12).

export const MAX_DEFINITIES = 300;
export const MAX_ANALYSES = 200;
export const MAX_JSON = 20_000; // tekens van definitie, spec en notitie
export const MAX_TITEL = 200;
export const MAX_REFS = 200;
export const MAX_VOORWAARDEN = 10;
export const MAX_GRENZEN = 50;
export const MAX_GROEPEN = 50;
export const MAX_WAARDEN = 200;

export const SOORTEN = ['bereken', 'omscoren', 'hercoderen', 'filter', 'eigenschappen'];
/** Vaste naam van de definitie met eigenschappen (meetniveau, label …); één per gegevensbron. */
export const EIGENSCHAPPEN_NAAM = '~eigenschappen';
export const MEETNIVEAUS = ['nominaal', 'ordinaal', 'interval'];
export const BEREKEN_FUNCTIES = ['gemiddelde', 'som', 'aantal_geldig', 'zscore', 'verschil'];

/** Verwijzing naar een variabele. */
export const REF = /^(?:(?:v|t|m|d|w):[A-Za-z0-9_:-]{1,60}|c:\d{1,15}@\d{1,15}|sys:(?:vragenlijst|meetmoment))$/;
const NAAM = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const SPSS_GERESERVEERD = new Set(['ALL', 'AND', 'BY', 'EQ', 'GE', 'GT', 'LE', 'LT', 'NE', 'NOT', 'OR', 'TO', 'WITH']);
// Extra vangnet naast de namen die de export werkelijk uitdeelt (spssVariabeleNamen): ook namen die later kunnen
// ontstaan (een nieuwe vraag, een kenmerk) mogen niet botsen. De KENMERKEN-sleutels komen er in de browser en
// op de server bij (zie gereserveerdeNamen).
const VASTE_NAMEN = /^(?:respondent|vragenlijst|meetmoment|datum|v\d+(?:_\d+)?(?:_enps)?|thema\d+(?:_\d+)?|meetpunt\d+(?:_\d+)?)$/i;

/** Fout in een definitie of spec; de tekst is voor de gebruiker (de server maakt er een 400 van). */
export class DefinitieFout extends Error {}

const fout = (tekst) => { throw new DefinitieFout(tekst); };
const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
const geheel = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;

function tekstVeld(w, veld, { max = 200, verplicht = false } = {}) {
  if (w === undefined || w === null || w === '') {
    if (verplicht) fout(`${veld} is verplicht.`);
    return '';
  }
  if (typeof w !== 'string') fout(`${veld} heeft een ongeldige waarde.`);
  // eslint-disable-next-line no-control-regex
  const t = w.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (verplicht && !t) fout(`${veld} is verplicht.`);
  if (t.length > max) fout(`${veld} is te lang (maximaal ${max} tekens).`);
  return t;
}

function ref(w, veld = 'Variabele') {
  if (typeof w !== 'string' || !REF.test(w)) fout(`${veld} verwijst niet naar een geldige variabele.`);
  return w;
}

/** Een ruwe waarde (optie-id, 'ja', een getal, een tekst uit een dataset). */
function bronwaarde(w) {
  if (eindig(w)) return w;
  if (typeof w === 'string' && w.length >= 1 && w.length <= 100) return w;
  return fout('Een gekozen waarde is ongeldig.');
}

function waardenLijst(w, veld) {
  if (!Array.isArray(w) || !w.length) fout(`Kies minstens één waarde bij ${veld}.`);
  if (w.length > MAX_WAARDEN) fout(`Te veel waarden bij ${veld} (maximaal ${MAX_WAARDEN}).`);
  return w.map(bronwaarde);
}

const getal = (w, veld) => (eindig(w) && Math.abs(w) < 1e12 ? w : fout(`${veld} moet een getal zijn.`));

// ---------- Namen ----------

/**
 * De namen die een eigen variabele niet mag krijgen: wat de export werkelijk uitdeelt (gebruikt uit
 * spssVariabeleNamen) plus de sleutels van de achtergrondkenmerken (die kunnen later als naam verschijnen).
 */
export function gereserveerdeNamen(gebruikt = [], kenmerkSleutels = []) {
  const uit = new Set();
  for (const n of gebruikt) uit.add(String(n).toLowerCase());
  for (const k of kenmerkSleutels) uit.add(String(k).toLowerCase());
  return uit;
}

/**
 * Controleert de korte naam van een eigen variabele. Geeft een foutmelding (tekst) of null.
 * bestaande: namen van de andere (niet verwijderde) definities van dezelfde gegevensbron.
 */
export function naamFout(naam, { gereserveerd = new Set(), bestaande = [] } = {}) {
  if (typeof naam !== 'string' || !NAAM.test(naam)) {
    return 'Een naam begint met een letter en bevat alleen letters, cijfers en _ (hooguit 32 tekens, geen spaties).';
  }
  const klein = naam.toLowerCase();
  if (SPSS_GERESERVEERD.has(naam.toUpperCase()) || VASTE_NAMEN.test(naam) || gereserveerd.has(klein)) {
    return `De naam “${naam}” is gereserveerd voor een vaste variabele. Kies een andere naam.`;
  }
  if (bestaande.some((b) => String(b).toLowerCase() === klein)) return `De naam “${naam}” is al in gebruik. Kies een andere naam.`;
  return null;
}

// ---------- Definities ----------

function controleerBereken(d) {
  const functie = BEREKEN_FUNCTIES.includes(d.functie) ? d.functie : fout('Kies hoe de score berekend wordt.');
  if (!Array.isArray(d.variabelen) || !d.variabelen.length) fout('Kies de vragen of variabelen voor de score.');
  if (d.variabelen.length > MAX_REFS) fout(`Kies hooguit ${MAX_REFS} variabelen.`);
  const variabelen = d.variabelen.map((v) => {
    if (typeof v === 'string') return ref(v);
    if (isObject(v)) return v.omscoren === true ? { id: ref(v.id), omscoren: true } : ref(v.id);
    return fout('Een gekozen variabele is ongeldig.');
  });
  const ids = variabelen.map((v) => (typeof v === 'string' ? v : v.id));
  if (new Set(ids).size !== ids.length) fout('Elke variabele mag maar één keer meetellen.');
  if (functie === 'verschil' && ids.length !== 2) fout('Voor een verschil kies je precies twee variabelen.');
  if (functie === 'zscore' && ids.length !== 1) fout('Voor een z-score kies je precies één variabele.');
  const uit = { functie, variabelen };
  if (d.min_geldig !== undefined && d.min_geldig !== null) {
    if (!geheel(d.min_geldig, 1, ids.length)) fout(`Het minimum aantal beantwoorde vragen ligt tussen 1 en ${ids.length}.`);
    if (functie === 'gemiddelde' || functie === 'som') uit.min_geldig = d.min_geldig;
  }
  return uit;
}

function controleerOmscoren(d) {
  const uit = { variabele: ref(d.variabele) };
  if (d.laag !== undefined || d.hoog !== undefined) {
    uit.laag = getal(d.laag, 'De laagste waarde');
    uit.hoog = getal(d.hoog, 'De hoogste waarde');
    if (!(uit.laag < uit.hoog)) fout('De laagste waarde moet kleiner zijn dan de hoogste.');
  }
  return uit;
}

function controleerHercoderen(d) {
  const variabele = ref(d.variabele);
  const uitleg = tekstVeld(d.uitleg, 'De uitleg', { max: 300 });
  if (d.manier === 'grenzen') {
    if (!Array.isArray(d.grenzen) || !d.grenzen.length) fout('Geef minstens één grens.');
    if (d.grenzen.length > MAX_GRENZEN) fout(`Geef hooguit ${MAX_GRENZEN} grenzen.`);
    const grenzen = d.grenzen.map((g) => getal(g, 'Een grens'));
    for (let i = 1; i < grenzen.length; i++) if (!(grenzen[i] > grenzen[i - 1])) fout('De grenzen moeten van laag naar hoog oplopen.');
    if (!Array.isArray(d.labels) || d.labels.length !== grenzen.length + 1) fout('Elke groep heeft een naam nodig.');
    const labels = d.labels.map((l, i) => tekstVeld(l, `De naam van groep ${i + 1}`, { max: 100, verplicht: true }));
    return { variabele, manier: 'grenzen', grenzen, labels, ...(uitleg ? { uitleg } : {}) };
  }
  if (d.manier !== 'categorieen') fout('Kies hoe je wilt indelen.');
  if (!Array.isArray(d.groepen) || !d.groepen.length) fout('Maak minstens één groep.');
  if (d.groepen.length > MAX_GROEPEN) fout(`Maak hooguit ${MAX_GROEPEN} groepen.`);
  const codes = new Set();
  const gezien = new Set();
  const groepen = d.groepen.map((g, i) => {
    if (!isObject(g)) fout(`Groep ${i + 1} is ongeldig.`);
    const code = geheel(g.code, 1, 999) ? g.code : fout(`Groep ${i + 1} heeft geen geldig nummer.`);
    if (codes.has(code)) fout('Twee groepen hebben hetzelfde nummer.');
    codes.add(code);
    const waarden = waardenLijst(g.waarden, `groep ${i + 1}`);
    for (const w of waarden) {
      const k = `${typeof w}:${w}`;
      if (gezien.has(k)) fout('Een antwoord kan maar in één groep zitten.');
      gezien.add(k);
    }
    return { code, label: tekstVeld(g.label, `De naam van groep ${i + 1}`, { max: 100, verplicht: true }), waarden };
  });
  const rest = d.rest === 'overig' ? 'overig' : 'leeg';
  return { variabele, manier: 'categorieen', groepen, rest, ...(uitleg ? { uitleg } : {}) };
}

function controleerVoorwaarde(v, i) {
  if (!isObject(v)) fout(`Voorwaarde ${i + 1} is ongeldig.`);
  if (v.soort === 'kwaliteit') {
    if (v.regel === 'rechte_lijn') return { soort: 'kwaliteit', regel: 'rechte_lijn' };
    if (v.regel === 'min_beantwoord') {
      if (!geheel(v.min_pct, 1, 100)) fout('Geef een percentage tussen 1 en 100.');
      return { soort: 'kwaliteit', regel: 'min_beantwoord', min_pct: v.min_pct };
    }
    return fout(`Voorwaarde ${i + 1} is ongeldig.`);
  }
  const variabele = ref(v.variabele);
  if (v.is !== undefined) return { variabele, is: waardenLijst(v.is, `voorwaarde ${i + 1}`) };
  if (v.niet !== undefined) return { variabele, niet: waardenLijst(v.niet, `voorwaarde ${i + 1}`) };
  const uit = { variabele };
  if (v.van !== undefined && v.van !== null) uit.van = getal(v.van, 'Van');
  if (v.tot !== undefined && v.tot !== null) uit.tot = getal(v.tot, 'Tot en met');
  if (uit.van === undefined && uit.tot === undefined) fout(`Vul bij voorwaarde ${i + 1} een ondergrens of bovengrens in.`);
  if (uit.van !== undefined && uit.tot !== undefined && uit.van > uit.tot) fout('De ondergrens is groter dan de bovengrens.');
  return uit;
}

function controleerFilter(d) {
  if (!Array.isArray(d.voorwaarden) || !d.voorwaarden.length) fout('Een selectie heeft minstens één voorwaarde.');
  if (d.voorwaarden.length > MAX_VOORWAARDEN) fout(`Een selectie heeft hooguit ${MAX_VOORWAARDEN} voorwaarden.`);
  return { voorwaarden: d.voorwaarden.map(controleerVoorwaarde) };
}

function controleerEigenschappen(d) {
  if (!isObject(d.variabelen)) fout('De eigenschappen zijn ongeldig.');
  const sleutels = Object.keys(d.variabelen);
  if (sleutels.length > MAX_DEFINITIES) fout('Te veel variabelen met eigen eigenschappen.');
  const variabelen = {};
  for (const s of sleutels) {
    ref(s);
    const e = d.variabelen[s];
    if (!isObject(e)) fout('De eigenschappen zijn ongeldig.');
    const uit = {};
    if (e.meetniveau !== undefined) uit.meetniveau = MEETNIVEAUS.includes(e.meetniveau) ? e.meetniveau : fout('Kies een geldig meetniveau.');
    if (e.label !== undefined) {
      const label = tekstVeld(e.label, 'De omschrijving', { max: 200 });
      if (label) uit.label = label;
    }
    if (e.ontbrekend !== undefined) {
      if (!Array.isArray(e.ontbrekend) || e.ontbrekend.length > 20) fout('Geef hooguit 20 codes voor ontbrekende waarden.');
      uit.ontbrekend = e.ontbrekend.map((x) => getal(x, 'Een code voor een ontbrekende waarde'));
    }
    if (e.volgorde !== undefined) {
      if (!Array.isArray(e.volgorde) || e.volgorde.length > MAX_WAARDEN) fout('De volgorde is ongeldig.');
      uit.volgorde = e.volgorde.map(bronwaarde);
    }
    if (Object.keys(uit).length) variabelen[s] = uit;
  }
  return { variabelen };
}

const CONTROLE = {
  bereken: controleerBereken,
  omscoren: controleerOmscoren,
  hercoderen: controleerHercoderen,
  filter: controleerFilter,
  eigenschappen: controleerEigenschappen,
};

/** Controleert een definitie (object, al uit JSON gelezen) en geeft een schone kopie; gooit DefinitieFout. */
export function controleerDefinitie(soort, ruw) {
  if (!SOORTEN.includes(soort)) fout('Onbekende soort definitie.');
  if (!isObject(ruw)) fout('De definitie is ongeldig.');
  const schoon = CONTROLE[soort](ruw);
  if (JSON.stringify(schoon).length > MAX_JSON) fout(`De definitie is te groot (maximaal ${MAX_JSON.toLocaleString('nl-NL')} tekens).`);
  return schoon;
}

/** Alle variabelen waarnaar een (schone) definitie verwijst. */
export function refsVan(soort, d) {
  if (!d || typeof d !== 'object') return [];
  if (soort === 'bereken') return (d.variabelen || []).map((v) => (typeof v === 'string' ? v : v.id));
  if (soort === 'omscoren' || soort === 'hercoderen') return d.variabele ? [d.variabele] : [];
  if (soort === 'filter') return (d.voorwaarden || []).filter((v) => v.variabele).map((v) => v.variabele);
  if (soort === 'eigenschappen') return Object.keys(d.variabelen || {});
  return [];
}

/** Ids van eigen variabelen (w:<id>) waarnaar een definitie verwijst (zonder eigenschappen: die volgen alleen). */
export function eigenRefs(soort, d) {
  if (soort === 'eigenschappen') return [];
  return refsVan(soort, d).filter((r) => r.startsWith('w:')).map((r) => Number(r.slice(2))).filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Zoekt een kringverwijzing. definities: [{ id, soort, definitie }] (allemaal, met de nieuwe of gewijzigde erbij).
 * Geeft de ids op de kring, of null.
 */
export function zoekKring(definities) {
  const naar = new Map(definities.map((d) => [d.id, eigenRefs(d.soort, d.definitie)]));
  const kleur = new Map(); // 1 = bezig, 2 = klaar
  const pad = [];
  const bezoek = (id) => {
    if (kleur.get(id) === 2) return null;
    if (kleur.get(id) === 1) return pad.slice(pad.indexOf(id));
    kleur.set(id, 1);
    pad.push(id);
    for (const n of naar.get(id) || []) {
      if (!naar.has(n)) continue;
      const k = bezoek(n);
      if (k) return k;
    }
    pad.pop();
    kleur.set(id, 2);
    return null;
  };
  for (const id of naar.keys()) {
    const k = bezoek(id);
    if (k) return k;
  }
  return null;
}

// ---------- Procedures (welke analyses er zijn, met hun vakjes en opties) ----------

/**
 * Per procedure: de vraag (zoals in het menu), de technische naam, waarvoor je hem gebruikt, de vakjes voor
 * variabelen en de toegestane opties. De rekenregels zelf staan in procedures/*.js; welke procedures al te
 * gebruiken zijn, staat in procedures/index.js.
 * Vakje: { sleutel, label, meerdere, min, max, soort } met soort:
 *   'verdeling' (categorie, meerdere antwoorden of getal met weinig waarden), 'getal' (ordinaal of interval, of
 *   ja/nee als 0/1), 'groep' (indeling met beschermde groepen), 'item' (getal voor een schaal), 'voorspeller'
 *   (een getal, of een indeling die als groepen meedoet).
 * Optie: { soort: 'keuze', waarden, standaard } | { soort: 'vlag', standaard } | { soort: 'waarden', min, max }
 *        | { soort: 'aantallen' } | { soort: 'refs', van } | { soort: 'waarde' }.
 */
export const PROCEDURES = {
  frequenties: {
    vraag: 'Hoe zijn de antwoorden verdeeld?', naam: 'Frequenties', groep: 'Beschrijven',
    gebruik: 'Gebruik dit als je wilt zien hoe vaak elk antwoord is gegeven.',
    slots: [{ sleutel: 'variabelen', label: 'Variabelen', meerdere: true, min: 1, max: 20, soort: 'verdeling' }],
    opties: {},
  },
  beschrijvend: {
    vraag: 'Gemiddelde, spreiding en vorm', naam: 'Beschrijvende statistiek', groep: 'Beschrijven',
    gebruik: 'Gebruik dit als je van scores het gemiddelde, de spreiding en de vorm van de verdeling wilt weten.',
    slots: [{ sleutel: 'variabelen', label: 'Variabelen', meerdere: true, min: 1, max: 50, soort: 'getal' }],
    opties: {},
  },
  pergroep: {
    vraag: 'Gemiddelden per groep', naam: 'Gemiddelden vergelijken', groep: 'Beschrijven',
    gebruik: 'Gebruik dit als je de gemiddelden van groepen naast elkaar wilt zien, zonder toets.',
    slots: [
      { sleutel: 'afhankelijk', label: 'Scores', meerdere: true, min: 1, max: 10, soort: 'getal' },
      { sleutel: 'groep', label: 'Groepen', meerdere: false, min: 1, max: 1, soort: 'groep' },
    ],
    opties: { percentielen: { soort: 'vlag', standaard: false, label: 'Ook kwartielen tonen' } },
  },
  kruistabel: {
    vraag: 'Hangen twee indelingen samen?', naam: 'Kruistabel en chi-kwadraat', groep: 'Samenhang',
    gebruik: 'Gebruik dit voor twee vragen met vaste antwoorden, zoals afdeling en een ja/nee-vraag.',
    slots: [
      { sleutel: 'rij', label: 'Rijen', meerdere: false, min: 1, max: 1, soort: 'groep' },
      { sleutel: 'kolom', label: 'Kolommen', meerdere: false, min: 1, max: 1, soort: 'groep' },
    ],
    opties: {
      procenten: { soort: 'keuze', waarden: ['geen', 'rij', 'kolom', 'totaal'], standaard: 'rij', label: 'Percentages' },
      verwacht: { soort: 'vlag', standaard: false, label: 'Verwachte aantallen tonen' },
      residuen: { soort: 'vlag', standaard: false, label: 'Aangepaste residuen tonen' },
    },
  },
  aanpassing: {
    vraag: 'Wijkt de verdeling af van wat je verwacht? (bijv. respons per afdeling)', naam: 'Chi-kwadraat aanpassingstoets', groep: 'Samenhang',
    gebruik: 'Gebruik dit om te controleren of de respons lijkt op de organisatie: vul per groep het aantal medewerkers in.',
    slots: [{ sleutel: 'variabele', label: 'Indeling', meerdere: false, min: 1, max: 1, soort: 'groep' }],
    opties: {
      verwacht: { soort: 'keuze', waarden: ['gelijk', 'aantallen'], standaard: 'aantallen', label: 'Wat verwacht je?' },
      aantallen: { soort: 'aantallen', van: 'variabele', label: 'Aantal per groep (bijvoorbeeld medewerkers)' },
    },
  },
  ttoets: {
    vraag: 'Verschillen twee groepen?', naam: 't-toets voor onafhankelijke groepen', groep: 'Groepen vergelijken',
    gebruik: 'Gebruik dit als je wilt weten of twee groepen, zoals twee afdelingen, verschillend scoren.',
    slots: [
      { sleutel: 'afhankelijk', label: 'Scores', meerdere: true, min: 1, max: 10, soort: 'getal' },
      { sleutel: 'groep', label: 'Groepen', meerdere: false, min: 1, max: 1, soort: 'groep' },
    ],
    opties: {
      groepen: { soort: 'waarden', min: 2, max: 2, van: 'groep', label: 'Welke twee groepen?' },
      levene: { soort: 'keuze', waarden: ['gemiddelde', 'mediaan'], standaard: 'gemiddelde', label: 'Toets van Levene op basis van' },
      nonparametrisch: { soort: 'vlag', standaard: true, label: 'Ook de toets met rangnummers (Mann-Whitney)' },
    },
  },
  anova: {
    vraag: 'Verschillen drie of meer groepen?', naam: 'Variantieanalyse (ANOVA)', groep: 'Groepen vergelijken',
    gebruik: 'Gebruik dit als je wilt weten of drie of meer groepen, zoals afdelingen, verschillend scoren.',
    slots: [
      { sleutel: 'afhankelijk', label: 'Scores', meerdere: true, min: 1, max: 10, soort: 'getal' },
      { sleutel: 'factor', label: 'Groepen', meerdere: false, min: 1, max: 1, soort: 'groep' },
    ],
    opties: {
      posthoc: { soort: 'keuze', waarden: ['games-howell', 'tukey', 'beide', 'geen'], standaard: 'games-howell', label: 'Welke groepen verschillen? (post-hoc)' },
      levene: { soort: 'keuze', waarden: ['gemiddelde', 'mediaan'], standaard: 'gemiddelde', label: 'Toets van Levene op basis van' },
      nonparametrisch: { soort: 'vlag', standaard: true, label: 'Ook de toets met rangnummers (Kruskal-Wallis)' },
    },
  },
  correlatie: {
    vraag: 'Welke scores hangen samen?', naam: 'Correlatiematrix', groep: 'Samenhang',
    gebruik: 'Gebruik dit als je wilt zien welke scores samen hoger of lager zijn.',
    slots: [{ sleutel: 'variabelen', label: 'Variabelen', meerdere: true, min: 2, max: 40, soort: 'getal' }],
    opties: {
      methode: { soort: 'keuze', waarden: ['pearson', 'spearman', 'beide'], standaard: 'pearson', label: 'Soort correlatie' },
      ontbrekend: { soort: 'keuze', waarden: ['paarsgewijs', 'lijstgewijs'], standaard: 'paarsgewijs', label: 'Ontbrekende antwoorden' },
      holm: { soort: 'vlag', standaard: false, label: 'p-waarden corrigeren voor het aantal paren (Holm)' },
    },
  },
  betrouwbaarheid: {
    vraag: 'Meten deze vragen samen één ding?', naam: 'Betrouwbaarheid (Cronbachs alfa)', groep: 'Schalen',
    gebruik: 'Gebruik dit voordat je van een aantal vragen één schaalscore maakt.',
    slots: [{ sleutel: 'items', label: 'Vragen', meerdere: true, min: 2, max: 60, soort: 'item' }],
    opties: { omscoren: { soort: 'refs', van: 'items', label: 'Omscoren' } },
  },
  regressie: {
    vraag: 'Wat voorspelt een score?', naam: 'Lineaire regressie', groep: 'Voorspellen',
    gebruik: 'Gebruik dit als je wilt weten welke dingen samen een score voorspellen.',
    slots: [
      { sleutel: 'afhankelijk', label: 'Score', meerdere: false, min: 1, max: 1, soort: 'getal' },
      { sleutel: 'voorspellers', label: 'Voorspellers', meerdere: true, min: 1, max: 30, soort: 'voorspeller' },
      { sleutel: 'blok2', label: 'Tweede blok voorspellers', meerdere: true, min: 0, max: 30, soort: 'voorspeller' },
    ],
    opties: { referentie: { soort: 'keuze', waarden: ['grootste', 'eerste', 'laatste'], standaard: 'grootste', label: 'Referentiegroep bij voorspellers met groepen' } },
  },
  logistisch: {
    vraag: 'Wat voorspelt een ja/nee-uitkomst, zoals vertrekwens?', naam: 'Logistische regressie', groep: 'Voorspellen',
    gebruik: 'Gebruik dit als de uitkomst twee groepen heeft, zoals wel of niet willen vertrekken.',
    slots: [
      { sleutel: 'uitkomst', label: 'Uitkomst', meerdere: false, min: 1, max: 1, soort: 'groep' },
      { sleutel: 'voorspellers', label: 'Voorspellers', meerdere: true, min: 1, max: 20, soort: 'voorspeller' },
    ],
    opties: {
      gebeurtenis: { soort: 'waarde', van: 'uitkomst', label: 'Waar kijk je naar?' },
      referentie: { soort: 'keuze', waarden: ['grootste', 'eerste', 'laatste'], standaard: 'grootste', label: 'Referentiegroep bij voorspellers met groepen' },
    },
  },
  gepaard: {
    vraag: 'Verschillen twee vragen bij dezelfde mensen?', naam: 'Gepaarde t-toets en Wilcoxon', groep: 'Groepen vergelijken',
    gebruik: 'Gebruik dit als dezelfde mensen twee vragen beantwoordden en je die wilt vergelijken. Kies de eerste en de tweede vragen in dezelfde volgorde: de eerste vraag die je aanvinkt, hoort bij de eerste tweede vraag.',
    slots: [
      { sleutel: 'x', label: 'Eerste vraag van elk paar', meerdere: true, min: 1, max: 10, soort: 'getal' },
      { sleutel: 'y', label: 'Tweede vraag van elk paar', meerdere: true, min: 1, max: 10, soort: 'getal' },
    ],
    opties: {},
  },
  factoranalyse: {
    vraag: 'Welke vragen horen bij elkaar?', naam: 'Factoranalyse', groep: 'Schalen',
    gebruik: 'Gebruik dit als je wilt ontdekken welke vragen samen één onderwerp meten.',
    slots: [{ sleutel: 'items', label: 'Vragen', meerdere: true, min: 3, max: 60, soort: 'item' }],
    opties: {
      methode: { soort: 'keuze', waarden: ['pca', 'paf'], standaard: 'paf', label: 'Methode' },
      aantal: { soort: 'keuze', waarden: ['kaiser', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], standaard: 'kaiser', label: 'Aantal factoren' },
      rotatie: { soort: 'keuze', waarden: ['varimax', 'geen'], standaard: 'varimax', label: 'Rotatie' },
      sorteren: { soort: 'vlag', standaard: true, label: 'Vragen sorteren op de factor waar ze het sterkst bij horen' },
      klein: { soort: 'vlag', standaard: true, label: 'Ladingen kleiner dan 0,30 niet tonen' },
    },
  },
};

export const PROCEDURE_SLEUTELS = Object.keys(PROCEDURES);

/** De standaardopties van een procedure (voor een nieuw formulier). */
export function standaardOpties(procedure) {
  const uit = {};
  for (const [k, o] of Object.entries(PROCEDURES[procedure]?.opties || {})) if ('standaard' in o) uit[k] = o.standaard;
  return uit;
}

function controleerBron(b) {
  if (!isObject(b)) fout('Kies de gegevens voor de analyse.');
  if (b.soort === 'lijst') return { soort: 'lijst', id: geheel(b.id, 1, Number.MAX_SAFE_INTEGER) ? b.id : fout('Kies een vragenlijst.') };
  if (b.soort === 'dataset') return { soort: 'dataset', id: geheel(b.id, 1, Number.MAX_SAFE_INTEGER) ? b.id : fout('Kies een dataset.') };
  if (b.soort === 'gestapeld') {
    if (b.lijsten === 'alle') return { soort: 'gestapeld', lijsten: 'alle' };
    if (!Array.isArray(b.lijsten) || b.lijsten.length < 2 || b.lijsten.length > 50) fout('Kies minstens twee vragenlijsten.');
    const lijsten = b.lijsten.map((x) => (geheel(x, 1, Number.MAX_SAFE_INTEGER) ? x : fout('Kies geldige vragenlijsten.')));
    if (new Set(lijsten).size !== lijsten.length) fout('Een vragenlijst staat er twee keer in.');
    return { soort: 'gestapeld', lijsten };
  }
  return fout('Kies de gegevens voor de analyse.');
}

function controleerOptie(o, w, naam) {
  if (o.soort === 'keuze') return o.waarden.includes(w) ? w : fout(`De keuze bij “${o.label || naam}” is ongeldig.`);
  if (o.soort === 'vlag') return w === true;
  if (o.soort === 'waarden') {
    if (!Array.isArray(w) || w.length < o.min || w.length > o.max) fout(`Kies ${o.min === o.max ? o.min : `${o.min} tot ${o.max}`} groepen.`);
    return w.map(bronwaarde);
  }
  if (o.soort === 'waarde') return bronwaarde(w);
  if (o.soort === 'aantallen') {
    if (!isObject(w) || Object.keys(w).length > MAX_WAARDEN) fout('De aantallen zijn ongeldig.');
    const uit = {};
    for (const [k, x] of Object.entries(w)) {
      if (k.length > 100) fout('De aantallen zijn ongeldig.');
      if (!(eindig(x) && x >= 0 && x < 1e9)) fout('Vul bij de aantallen alleen getallen van 0 of meer in.');
      uit[k] = x;
    }
    return uit;
  }
  if (o.soort === 'refs') {
    if (!Array.isArray(w) || w.length > MAX_REFS) fout('Een keuze bij de opties is ongeldig.');
    return w.map((r) => ref(r));
  }
  return fout('Onbekende optie.');
}

/** Controleert de spec van een bewaarde analyse en geeft een schone kopie; gooit DefinitieFout. */
export function controleerSpec(ruw) {
  if (!isObject(ruw)) fout('De analyse is ongeldig.');
  if (ruw.versie !== 1) fout('Deze analyse heeft een onbekende versie.');
  const procedure = Object.hasOwn(PROCEDURES, ruw.procedure) ? ruw.procedure : fout('Onbekende soort analyse.');
  const meta = PROCEDURES[procedure];
  const bron = controleerBron(ruw.bron);
  let filter = null;
  if (ruw.filter !== undefined && ruw.filter !== null) filter = geheel(ruw.filter, 1, Number.MAX_SAFE_INTEGER) ? ruw.filter : fout('De selectie is ongeldig.');
  if (!isObject(ruw.variabelen)) fout('Kies de variabelen voor de analyse.');
  const variabelen = {};
  for (const slot of meta.slots) {
    const w = ruw.variabelen[slot.sleutel];
    if (slot.meerdere) {
      const lijst = w === undefined || w === null ? [] : Array.isArray(w) ? w : fout(`${slot.label}: kies een lijst met variabelen.`);
      if (lijst.length < slot.min) fout(`${slot.label}: kies minstens ${slot.min} ${slot.min === 1 ? 'variabele' : 'variabelen'}.`);
      if (lijst.length > slot.max) fout(`${slot.label}: kies hooguit ${slot.max} variabelen.`);
      const refs = lijst.map((r) => ref(r, slot.label));
      if (new Set(refs).size !== refs.length) fout(`${slot.label}: een variabele staat er twee keer in.`);
      if (refs.length) variabelen[slot.sleutel] = refs;
    } else if (w === undefined || w === null || w === '') {
      if (slot.min > 0) fout(`${slot.label}: kies een variabele.`);
    } else {
      variabelen[slot.sleutel] = ref(w, slot.label);
    }
  }
  for (const k of Object.keys(ruw.variabelen)) if (!meta.slots.some((s) => s.sleutel === k)) fout('De analyse bevat een onbekend vakje.');
  if (procedure === 'gepaard' && (variabelen.x || []).length !== (variabelen.y || []).length) fout('Kies evenveel eerste als tweede vragen.');
  const opties = {};
  const ruweOpties = ruw.opties === undefined ? {} : isObject(ruw.opties) ? ruw.opties : fout('De opties zijn ongeldig.');
  for (const [k, w] of Object.entries(ruweOpties)) {
    if (!Object.hasOwn(meta.opties, k)) fout('De analyse bevat een onbekende optie.');
    if (w === undefined || w === null) continue;
    opties[k] = controleerOptie(meta.opties[k], w, k);
  }
  const uit = { versie: 1, bron, filter, procedure, variabelen, opties };
  if (JSON.stringify(uit).length > MAX_JSON) fout(`De analyse is te groot (maximaal ${MAX_JSON.toLocaleString('nl-NL')} tekens).`);
  return uit;
}

/** Alle variabelen waarnaar een (schone) spec verwijst, ook in de opties. */
export function specRefs(spec) {
  const uit = [];
  for (const w of Object.values(spec?.variabelen || {})) uit.push(...(Array.isArray(w) ? w : [w]));
  for (const [k, w] of Object.entries(spec?.opties || {})) {
    if (PROCEDURES[spec.procedure]?.opties?.[k]?.soort === 'refs' && Array.isArray(w)) uit.push(...w);
  }
  return uit;
}

/** Leest een JSON-kolom van de werkbank (in de export staat hij als tekst); null als hij onleesbaar is. */
export function leesJsonKolom(w) {
  if (w && typeof w === 'object') return w;
  try {
    const x = JSON.parse(w);
    return x && typeof x === 'object' ? x : null;
  } catch {
    return null;
  }
}

/**
 * De definities uit de export of de GET-route als bruikbare objecten:
 * [{ id, dataset_id, soort, naam, label, definitie, volgorde, verwijderd }]. Onleesbare definities vallen weg.
 */
export function leesDefinities(rijen) {
  const uit = [];
  for (const r of rijen || []) {
    const definitie = leesJsonKolom(r.definitie);
    if (!definitie) continue;
    uit.push({
      id: r.id,
      dataset_id: r.dataset_id ?? null,
      soort: r.soort,
      naam: r.naam,
      label: r.label || '',
      definitie,
      volgorde: r.volgorde || 0,
      verwijderd: r.verwijderd === true || (r.verwijderd_op !== undefined && r.verwijderd_op !== null),
      bijgewerkt_op: r.bijgewerkt_op,
    });
  }
  return uit;
}

/** De bewaarde analyses als objecten: [{ id, dataset_id, titel, procedure, spec, notitie, volgorde, bijgewerkt_op }]. */
export function leesAnalyses(rijen) {
  const uit = [];
  for (const r of rijen || []) {
    const spec = leesJsonKolom(r.spec);
    if (!spec) continue;
    uit.push({ id: r.id, dataset_id: r.dataset_id ?? null, titel: r.titel, procedure: r.procedure, spec, notitie: r.notitie || '', volgorde: r.volgorde || 0, aangemaakt_op: r.aangemaakt_op, bijgewerkt_op: r.bijgewerkt_op });
  }
  return uit;
}
