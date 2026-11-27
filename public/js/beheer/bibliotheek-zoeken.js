// Zoeken in de bibliotheek (D3 §2.7, zonder index: BOUWPLAN B22). Zuivere module (geen DOM).
//
// Elke zoekvraag loopt alle bronnen één keer langs (hooguit 1.000). Per bron staan de genormaliseerde velden
// klaar (één keer per geladen bron uitgerekend, in een WeakMap). Er is geen omgekeerde index.
//
// - normaliseren: kleine letters, zonder accenten (zie bibliotheek-regels.js normaliseer);
// - een lichte Nederlandse stemmer (stam): medewerkers → medewerker, processen → proces;
// - samengestelde woorden: "verzuim" vindt "ziekteverzuim";
// - vaste synoniemen voor HR-onderwerpen (verloop ~ turnover);
// - "…" zoekt een woordgroep;
// - eerst bronnen met alle woorden; zijn die er niet, dan bronnen met een deel van de woorden;
// - filters en facetten (per facet de aantallen met alle andere filters aan);
// - markeringen: waar de treffers in de oorspronkelijke tekst staan.

import { normaliseer, normaliseerMetKaart, ONDERWERPEN, BETROUWBAARHEID_RANG, vergelijkBronnen, auteursRegel } from './bibliotheek-regels.js';

export { normaliseer, normaliseerMetKaart };

const STOPWOORDEN = new Set(['de', 'het', 'een', 'en', 'of', 'van', 'in', 'op', 'voor', 'met', 'aan', 'bij', 'tot', 'over', 'naar',
  'door', 'the', 'a', 'an', 'and', 'on', 'for', 'to', 'with']);

const KLINKERS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const isMedeklinker = (c) => /[a-z]/.test(c) && !KLINKERS.has(c);

/**
 * Lichte Nederlandse stemmer (alleen woorden van 4 of meer letters; de stam is minstens 3 letters).
 * De eerste regel die past, geldt:
 * 1. heden → heid (mogelijkheden); 2. ingen → ing (ontwikkelingen); 3. ties → tie, ies → ie (organisaties, studies);
 * 4. en na een medeklinker weg, dan een dubbele medeklinker aan het eind enkel (processen → proces, vrouwen → vrouw);
 * 5. s aan het eind weg, behalve na s, e, i of u (medewerkers → medewerker; proces, status, stress blijven);
 * 6. e na een medeklinker weg bij 5 of meer letters (leidinggevende → leidinggevend).
 */
export function stam(woord) {
  const w = String(woord ?? '');
  if (w.length < 4) return w;
  const ok = (s) => (s.length >= 3 ? s : null);
  let s;
  if (w.endsWith('heden') && (s = ok(`${w.slice(0, -5)}heid`))) return s;
  if (w.endsWith('ingen') && (s = ok(w.slice(0, -2)))) return s;
  if (w.endsWith('ties') && (s = ok(w.slice(0, -1)))) return s;
  if (w.endsWith('ies') && (s = ok(w.slice(0, -1)))) return s;
  if (w.endsWith('en') && isMedeklinker(w[w.length - 3] || '')) {
    let r = w.slice(0, -2);
    if (r.length >= 2 && r[r.length - 1] === r[r.length - 2] && isMedeklinker(r[r.length - 1])) r = r.slice(0, -1);
    if ((s = ok(r))) return s;
  }
  if (w.endsWith('s') && !'seiu'.includes(w[w.length - 2]) && (s = ok(w.slice(0, -1)))) return s;
  if (w.length >= 5 && w.endsWith('e') && isMedeklinker(w[w.length - 2]) && (s = ok(w.slice(0, -1)))) return s;
  return w;
}

// Vaste groepen woorden die bij het zoeken als hetzelfde tellen (genormaliseerd; met een spatie = woordgroep).
const SYNONIEM_GROEPEN = [
  ['verzuim', 'ziekteverzuim', 'absenteisme', 'absenteeism', 'absence', 'sickness', 'ziekmelding'],
  ['verloop', 'uitstroom', 'turnover', 'retentie', 'behoud', 'retention', 'vertrek', 'exit'],
  ['betrokkenheid', 'bevlogenheid', 'engagement', 'bevlogen', 'commitment'],
  ['werkdruk', 'werkstress', 'stress', 'burnout', 'burn-out', 'werkbelasting', 'psa', 'workload'],
  ['leiderschap', 'leidinggevende', 'leidinggeven', 'manager', 'leadership', 'supervisor'],
  ['onboarding', 'inwerken', 'inwerkperiode', 'introductie', 'socialisatie'],
  ['hybride', 'thuiswerken', 'telewerken', 'plaatsonafhankelijk', 'remote'],
  ['inclusie', 'diversiteit', 'inclusion', 'diversity'],
  ['ongewenst', 'pesten', 'intimidatie', 'discriminatie', 'harassment', 'bullying', 'grensoverschrijdend'],
  ['tevredenheid', 'satisfaction', 'medewerkerstevredenheid', 'mto', 'medewerkersonderzoek'],
  ['arbeidsvoorwaarden', 'beloning', 'salaris', 'compensation', 'benefits', 'cao'],
  ['ontwikkeling', 'loopbaan', 'opleiding', 'scholing', 'career', 'training', 'leren'],
  ['vitaliteit', 'gezondheid', 'welzijn', 'wellbeing', 'health', 'duurzame inzetbaarheid'],
  ['cultuur', 'organisatiecultuur', 'verandering', 'change', 'culture'],
  ['vragenlijst', 'enquete', 'survey', 'questionnaire'],
  ['privacy', 'avg', 'gdpr', 'gegevensbescherming'],
  ['analytics', 'kengetallen', 'kpi', 'people analytics', 'dashboard'],
];
export const SYNONIEMEN = SYNONIEM_GROEPEN.map((g) => [...new Set(g.map(normaliseer))]);

/** Andere woorden uit dezelfde synoniemgroep(en) als t of zijn stam: [{ w, s: stam(w), groep: woordgroep? }]. */
function synoniemenVan(t, s) {
  const uit = new Set();
  for (const groep of SYNONIEMEN) {
    if (groep.includes(t) || groep.includes(s) || groep.some((w) => !w.includes(' ') && stam(w) === s)) {
      for (const w of groep) if (w !== t && w !== s) uit.add(w);
    }
  }
  return [...uit].map((w) => ({ w, s: stam(w), groep: w.includes(' ') }));
}

// Velden en hun gewicht.
const VELDEN = [
  ['titel', 6], ['trefwoorden', 4], ['onderwerpen', 4], ['auteurs', 3], ['kernpunten', 2], ['samenvatting', 1.5], ['details', 1], ['notities', 1],
];

function veldTekst(bron, veld) {
  const d = bron.details || {};
  switch (veld) {
    case 'titel': return bron.titel || '';
    case 'trefwoorden': return (bron.trefwoorden || []).join(' · ');
    case 'onderwerpen': return (bron.onderwerpen || []).map((k) => ONDERWERPEN[k]?.naam || k).join(' · ');
    case 'auteurs': return [auteursRegel(bron), bron.organisatie, bron.afkorting].filter(Boolean).join(' · ');
    case 'kernpunten': return (bron.kernpunten || []).join(' · ');
    case 'samenvatting': return bron.samenvatting || '';
    case 'details': return [d.tijdschrift, d.boektitel, d.sitenaam].filter(Boolean).join(' · ');
    case 'notities': return bron.notities || '';
    default: return '';
  }
}

// Per bron: { velden: [{ gewicht, tekst: ' norm ', vormen: Set, vormTekst: ' w1 w2 … ' }], alles: alle vormen samen }.
const voorbereid = new WeakMap();

function bereidVoor(bron) {
  let v = voorbereid.get(bron);
  if (v) return v;
  const velden = VELDEN.map(([veld, gewicht]) => {
    const norm = normaliseer(veldTekst(bron, veld));
    const vormen = new Set();
    for (const w of norm.split(' ')) {
      if (!w) continue;
      vormen.add(w);
      vormen.add(stam(w));
    }
    return { veld, gewicht, tekst: ` ${norm} `, vormen, vormTekst: ` ${[...vormen].join(' ')} ` };
  });
  v = { velden, alles: velden.map((x) => x.vormTekst).join('') };
  voorbereid.set(bron, v);
  return v;
}

/** Snelle voorcontrole: kan de term ergens in de bron passen? (Zo niet, dan hoeven we de velden niet langs.) */
function kanPassen(alles, term) {
  if (alles.includes(term.s) || alles.includes(term.t)) return true;
  return term.syn.some((x) => x.groep || alles.includes(x.s) || alles.includes(x.w));
}

/** Leest de zoekvraag: losse woorden (zonder stopwoorden) en woordgroepen tussen aanhalingstekens. */
export function leesZoekvraag(tekst) {
  const ruw = String(tekst ?? '');
  const termen = [];
  const groepen = [];
  const zonderGroepen = ruw.replace(/["“”„]([^"“”„]+)["“”„]?/g, (_, g) => {
    const n = normaliseer(g);
    if (n) groepen.push(n);
    return ' ';
  });
  for (const w of normaliseer(zonderGroepen).split(' ')) {
    if (w && !STOPWOORDEN.has(w) && !termen.some((t) => t.t === w)) termen.push({ t: w, s: stam(w), syn: synoniemenVan(w, stam(w)) });
  }
  return { termen, groepen };
}

/** Hoe goed een term in een veld past: 1 (precies), 0,8 (begin van een woord), 0,6 (synoniem), 0,5 (in een samenstelling), 0. */
function factor(veld, term) {
  const { t, s, syn } = term;
  if (veld.vormen.has(t) || veld.vormen.has(s)) return 1;
  if (s.length >= 2 && veld.vormTekst.includes(` ${s}`)) return 0.8;
  for (const x of syn) {
    if (x.groep ? veld.tekst.includes(` ${x.w} `) : (veld.vormen.has(x.w) || veld.vormen.has(x.s) || veld.vormTekst.includes(` ${x.s}`))) return 0.6;
  }
  if (s.length >= 4 && veld.vormTekst.includes(s)) return 0.5;
  return 0;
}

/** Score van één bron voor de zoekvraag: { score, alle: alle termen gevonden, deel: aantal gevonden termen }. */
function scoreVan(bron, vraag) {
  const { velden, alles } = bereidVoor(bron);
  let score = 0;
  let gevonden = 0;
  for (const term of vraag.termen) {
    let beste = 0;
    if (!kanPassen(alles, term)) continue;
    for (const v of velden) {
      const f = factor(v, term);
      if (f) beste = Math.max(beste, v.gewicht * f);
    }
    if (beste) gevonden++;
    score += beste;
  }
  for (const g of vraag.groepen) {
    let beste = 0;
    for (const v of velden) if (v.tekst.includes(` ${g} `)) beste = Math.max(beste, v.gewicht);
    if (beste) gevonden++;
    score += beste;
  }
  const aantal = vraag.termen.length + vraag.groepen.length;
  return { score, alle: gevonden === aantal, gevonden };
}

const FILTERS = ['onderwerpen', 'soort', 'taal', 'collectie', 'betrouwbaarheid', 'jaar', 'gekoppeld', 'notities', 'verborgen'];

/** Welke filters een bron doorlaat: { naam: true/false }. */
function filterUitslag(bron, f) {
  const jaarFilter = Number.isInteger(f.jaarVan) || Number.isInteger(f.jaarTot);
  return {
    onderwerpen: !f.onderwerpen?.length || (bron.onderwerpen || []).some((o) => f.onderwerpen.includes(o)),
    soort: !f.soort || bron.soort === f.soort,
    taal: !f.taal || bron.taal === f.taal,
    collectie: !f.collectie || f.collectie === 'alle' || bron.collectie === f.collectie,
    betrouwbaarheid: !f.betrouwbaarheid || (BETROUWBAARHEID_RANG[bron.betrouwbaarheid] ?? 0) >= (BETROUWBAARHEID_RANG[f.betrouwbaarheid] ?? 0),
    jaar: !jaarFilter || (Number.isInteger(bron.jaar)
      && (!Number.isInteger(f.jaarVan) || bron.jaar >= f.jaarVan) && (!Number.isInteger(f.jaarTot) || bron.jaar <= f.jaarTot)),
    gekoppeld: !f.alleenGekoppeldAan || (bron.onderzoeken || []).map(Number).includes(Number(f.alleenGekoppeldAan)),
    notities: !f.metNotities || !!String(bron.notities || '').trim(),
    verborgen: !!f.metVerborgen || !bron.verborgen,
  };
}

const SORTEERDER = new Intl.Collator('nl', { sensitivity: 'base' });
const vergelijkTekst = (a, b) => SORTEERDER.compare(String(a ?? ''), String(b ?? ''));
const jaarAf = (a, b) => (Number.isInteger(b.jaar) ? b.jaar : -Infinity) - (Number.isInteger(a.jaar) ? a.jaar : -Infinity);

const SORTERINGEN = {
  relevantie: (a, b) => b.score - a.score || jaarAf(a.bron, b.bron) || vergelijkTekst(a.bron.titel, b.bron.titel),
  nieuw: (a, b) => jaarAf(a.bron, b.bron) || vergelijkTekst(a.bron.titel, b.bron.titel),
  oud: (a, b) => (Number.isInteger(a.bron.jaar) ? a.bron.jaar : Infinity) - (Number.isInteger(b.bron.jaar) ? b.bron.jaar : Infinity)
    || vergelijkTekst(a.bron.titel, b.bron.titel),
  titel: (a, b) => vergelijkTekst(a.bron.titel, b.bron.titel),
  auteur: (a, b) => vergelijkBronnen(a.bron, b.bron),
  toegevoegd: (a, b) => vergelijkTekst(b.bron.aangemaakt_op, a.bron.aangemaakt_op) || b.bron.id - a.bron.id,
};

/** Teksten van de sorteringen (D3 §2.7). */
export const SORTERING_LABELS = {
  relevantie: 'Best passend', nieuw: 'Nieuwste eerst', oud: 'Oudste eerst', titel: 'Titel (A–Z)', auteur: 'Auteur (A–Z)', toegevoegd: 'Laatst toegevoegd',
};

/**
 * Zoekt in de bronnen. filters: { onderwerpen: [sleutel], soort, taal, collectie: 'alle'|'start'|'eigen',
 * betrouwbaarheid (minstens), jaarVan, jaarTot (bronnen zonder jaar alleen zonder jaarfilter),
 * alleenGekoppeldAan (onderzoek-id), metNotities, metVerborgen }.
 * → { treffers: [{ id, score, bron }], totaal, facetten: { onderwerp, soort, taal, collectie, betrouwbaarheid,
 *     jaren: { min, max }, verborgen }, modus: 'alle' | 'deel' }
 */
export function zoek(bronnen, { tekst = '', filters = {}, sortering = 'relevantie' } = {}) {
  const lijst = Array.isArray(bronnen) ? bronnen : [];
  const vraag = leesZoekvraag(tekst);
  const metTekst = vraag.termen.length + vraag.groepen.length > 0;
  const rijen = lijst.map((bron) => ({ bron, ...(metTekst ? scoreVan(bron, vraag) : { score: 0, alle: true, gevonden: 0 }), door: filterUitslag(bron, filters) }));
  let modus = 'alle';
  let past = (r) => r.alle;
  const doorAlles = (r, behalve = null) => FILTERS.every((f) => f === behalve || r.door[f]);
  if (metTekst && vraag.termen.length + vraag.groepen.length >= 2 && !rijen.some((r) => r.alle && doorAlles(r))) {
    modus = 'deel';
    past = (r) => r.gevonden > 0;
  }
  const treffers = rijen.filter((r) => past(r) && doorAlles(r));
  const sorteer = SORTERINGEN[!metTekst && sortering === 'relevantie' ? 'nieuw' : sortering] || SORTERINGEN.relevantie;
  treffers.sort(sorteer);

  // Facetten: per facet tellen we met alle andere filters aan, zodat een gekozen waarde zijn buren niet verbergt.
  const telVoor = (filter, sleutelVan) => {
    const uit = {};
    for (const r of rijen) {
      if (!past(r) || !doorAlles(r, filter)) continue;
      for (const k of [].concat(sleutelVan(r.bron))) if (k !== undefined && k !== null && k !== '') uit[k] = (uit[k] || 0) + 1;
    }
    return uit;
  };
  const jaren = rijen.filter((r) => past(r) && doorAlles(r, 'jaar') && Number.isInteger(r.bron.jaar)).map((r) => r.bron.jaar);
  const facetten = {
    onderwerp: telVoor('onderwerpen', (b) => b.onderwerpen || []),
    soort: telVoor('soort', (b) => b.soort),
    taal: telVoor('taal', (b) => b.taal),
    collectie: telVoor('collectie', (b) => b.collectie),
    betrouwbaarheid: telVoor('betrouwbaarheid', (b) => b.betrouwbaarheid),
    jaren: { min: jaren.length ? Math.min(...jaren) : null, max: jaren.length ? Math.max(...jaren) : null },
    verborgen: rijen.filter((r) => past(r) && doorAlles(r, 'verborgen') && r.bron.verborgen).length,
  };
  return { treffers: treffers.map((r) => ({ id: r.bron.id, score: r.score, bron: r.bron })), totaal: treffers.length, facetten, modus };
}

/** Voegt overlappende of aansluitende stukken [van, tot] samen. */
function samenvoegen(stukken) {
  const s = [...stukken].sort((a, b) => a[0] - b[0]);
  const uit = [];
  for (const [van, tot] of s) {
    const vorige = uit[uit.length - 1];
    if (vorige && van <= vorige[1]) vorige[1] = Math.max(vorige[1], tot);
    else uit.push([van, tot]);
  }
  return uit;
}

/** De stukken van een tekst die bij de zoekvraag horen, in plaatsen van de oorspronkelijke tekst. */
function treffersIn(tekst, vraag) {
  const { norm, kaart, lengte } = normaliseerMetKaart(tekst);
  if (!norm) return [];
  const stukken = [];
  const terug = (van, tot) => [kaart[van], kaart[tot - 1] + lengte[tot - 1]];
  // Woorden langslopen
  let begin = 0;
  for (const woord of norm.split(' ')) {
    const eind = begin + woord.length;
    if (woord) {
      const veld = { vormen: new Set([woord, stam(woord)]), vormTekst: ` ${woord} ${stam(woord)} `, tekst: ` ${woord} ` };
      if (vraag.termen.some((t) => factor(veld, t) > 0)) stukken.push(terug(begin, eind));
    }
    begin = eind + 1;
  }
  // Woordgroepen (ook synoniemen met een spatie, zoals "duurzame inzetbaarheid")
  const groepen = [...vraag.groepen, ...vraag.termen.flatMap((t) => t.syn.filter((x) => x.groep).map((x) => x.w))];
  for (const g of groepen) {
    let i = norm.indexOf(g);
    while (i !== -1) {
      const voor = i === 0 || norm[i - 1] === ' ';
      const na = i + g.length === norm.length || norm[i + g.length] === ' ';
      if (voor && na) stukken.push(terug(i, i + g.length));
      i = norm.indexOf(g, i + 1);
    }
  }
  return samenvoegen(stukken);
}

/**
 * Waar de zoekwoorden in de getoonde velden staan: { titel, samenvatting, auteurs, notities: [[van, tot]],
 * kernpunten: [[[van, tot]] per kernpunt] }, in plaatsen van de oorspronkelijke tekst. auteurs gaat over
 * auteursRegel(bron) (of de organisatie als er geen personen zijn).
 */
export function markeringen(bron, zoekvraag) {
  const vraag = leesZoekvraag(zoekvraag);
  if (!vraag.termen.length && !vraag.groepen.length) return { titel: [], samenvatting: [], kernpunten: (bron.kernpunten || []).map(() => []), auteurs: [], notities: [] };
  return {
    titel: treffersIn(bron.titel || '', vraag),
    samenvatting: treffersIn(bron.samenvatting || '', vraag),
    kernpunten: (bron.kernpunten || []).map((k) => treffersIn(k, vraag)),
    auteurs: treffersIn(auteursRegel(bron) || bron.organisatie || '', vraag),
    notities: treffersIn(bron.notities || '', vraag),
  };
}

/** De zoekvraag bij een onderzoek: de namen van de thema's en de onderzoeksvraag (zonder dubbele woorden). */
export function zoekvraagBijOnderzoek({ themas = [], onderzoeksvraag = '' } = {}) {
  const woorden = [];
  for (const t of [...themas.map((x) => (typeof x === 'string' ? x : x?.naam)), onderzoeksvraag]) {
    for (const w of String(t ?? '').split(/[\s,.;:!?()/]+/)) {
      const n = normaliseer(w);
      if (n.length >= 3 && !STOPWOORDEN.has(n) && !woorden.some((x) => normaliseer(x) === n)) woorden.push(w.toLowerCase());
    }
  }
  return woorden.slice(0, 12).join(' ');
}

/**
 * Passende bronnen bij een onderzoek: de thema's en de onderzoeksvraag als zoekvraag waarin elk woord mag
 * passen (een deel is genoeg). → { tekst, treffers: hooguit 10 }.
 */
export function zoekBijOnderzoek(bronnen, { themas = [], onderzoeksvraag = '', filters = {} } = {}) {
  const tekst = zoekvraagBijOnderzoek({ themas, onderzoeksvraag });
  if (!tekst) return { tekst: '', treffers: [] };
  const vraag = leesZoekvraag(tekst);
  const treffers = (Array.isArray(bronnen) ? bronnen : [])
    .filter((b) => FILTERS.every((f) => filterUitslag(b, filters)[f]))
    .map((bron) => ({ id: bron.id, bron, ...scoreVan(bron, vraag) }))
    .filter((r) => r.gevonden > 0)
    .sort(SORTERINGEN.relevantie)
    .slice(0, 10)
    .map((r) => ({ id: r.id, score: r.score, bron: r.bron }));
  return { tekst, treffers };
}
