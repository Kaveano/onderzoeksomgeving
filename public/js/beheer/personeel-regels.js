// Personeelsbestand voor HR-analytics: van een bestand met één rij per medewerker naar groepscijfers
// (BOUWPLAN B4, §3.5 "Personeelsaggregaat v1"; D1 §5).
// Zuivere module (geen DOM, geen fetch): de browser, de Worker (controle van de vorm in src/lib/hr-validatie.js)
// en de tests gebruiken dezelfde lijsten.
//
// Wat hier gebeurt:
// - verwerkPersoneel leest in de BROWSER de rijen van het bestand en telt per groep (afdeling, leeftijdsklasse, …)
//   alleen aantallen en totalen. De rijen, namen, personeelsnummers en geboortedatums verlaten deze functie nooit;
//   alleen het "aggregaat" gaat naar de server.
// - Verzuim is een gegeven over de gezondheid. Daarom wordt al hier, terwijl de rijen er nog zijn, per groep
//   bepaald of verzuimcijfers getoond mogen worden (minstens 10 medewerkers en niemand met meer dan de helft van de
//   verzuimdagen, met aanvullend verbergen; privacy.js verzuimToonbaar). Van een groep waarvoor dat niet mag, gaan
//   geen verzuimgetallen mee.
// - Van een groep met minder dan 5 medewerkers gaan alleen de aantallen mee (geen leeftijden, fte of verloop).
// - personeelKpis maakt van het aggregaat de kengetallen voor het scherm en het rapport, met de privacyregels voor
//   het tonen (PR-16): aantallen onder de 5 verborgen, aandelen alleen als beide delen minstens 5 zijn, vertrek-
//   redenen en verloop in het eerste jaar alleen voor de hele organisatie.
// - populatieVoorVraag geeft per antwoordmogelijkheid van een achtergrondvraag het aantal medewerkers (voor de
//   respons per groep en de vergelijking met de organisatie).
//
// Maanden zijn 'JJJJ-MM'. De periode loopt van de eerste dag van 'van' tot de laatste dag van 'tot'; die laatste
// dag is ook de peildatum voor het aantal medewerkers.

import { DREMPEL, verbergReeks, onderdrukKolom, maskeer, veiligAandeel, verzuimToonbaar } from './privacy.js';
import { normaal, alsGetal, alsDatum, getalNotatie, verdachteKolommen } from './inlees-regels.js';
import { KENMERKEN, klasseVan, isLieverNiet } from './kenmerken.js';

export const VERSIE = 1;
/** Zoveel medewerkers moet een groep minstens hebben voor verzuimcijfers (instelbaar, nooit minder dan DREMPEL). */
export const MIN_VERZUIM = 10;
/** Een periode is hooguit zo lang (maanden). */
export const MAX_MAANDEN = 36;
/** Zoveel groepen mag één indeling hooguit hebben (meer wijst op een kolom met namen of nummers). */
export const MAX_GROEPEN = 100;
/** Naam van de groep medewerkers zonder waarde voor een indeling. */
export const ONBEKEND = 'Onbekend';

/** Redenen van uit dienst gaan (K S4). 'onbekend' telt mee als er geen (herkende) reden is. */
export const REDENEN = {
  eigen_verzoek: 'Eigen verzoek',
  werkgever: 'Initiatief werkgever',
  tijdelijk: 'Einde tijdelijk contract',
  pensioen: 'Pensioen',
  overig: 'Overig',
};
export const REDEN_SLEUTELS = [...Object.keys(REDENEN), 'onbekend'];
const REDEN_LABELS = { ...REDENEN, onbekend: 'Onbekend' };

/**
 * Rollen van de kolommen in een personeelsbestand (D1 §5.2, plus reden_uit). Een kolom zonder rol wordt niet gebruikt.
 * soort: wat er in de cel staat. herken: kolomnamen (na normaal()) die de rol vooraf krijgen.
 * Geboortedatum en geboortejaar worden in de browser omgezet naar een leeftijd; die datum zelf gaat nooit mee.
 */
export const ROLLEN = {
  afdeling: { label: 'Afdeling', soort: 'categorie', herken: /^(afdeling|afdelingsnaam|team|teamnaam|kostenplaats|organisatie ?eenheid|organisatieonderdeel|unit|cluster|business unit)$/ },
  locatie: { label: 'Locatie', soort: 'categorie', herken: /^(locatie|werklocatie|vestiging|vestigingsplaats|standplaats)$/ },
  functieniveau: { label: 'Functie of functieschaal', soort: 'categorie', herken: /^(functie|functienaam|functieschaal|functiegroep|salarisschaal|loonschaal|schaal|functieniveau)$/ },
  contract: { label: 'Soort dienstverband', soort: 'categorie', herken: /^(contract|contractsoort|soort contract|type contract|contracttype|dienstverband|soort dienstverband|arbeidsovereenkomst)$/ },
  opleiding: { label: 'Opleidingsniveau', soort: 'categorie', herken: /^(opleiding|opleidingsniveau|hoogste opleiding)$/ },
  geslacht: { label: 'Geslacht', soort: 'geslacht', herken: /^(geslacht|gender|sekse|m v|man vrouw)$/ },
  leidinggevend: { label: 'Geeft leiding (ja/nee)', soort: 'janee', herken: /^(leidinggevend|leidinggevende|geeft leiding|is leidinggevende)$/ },
  leeftijd: { label: 'Leeftijd', soort: 'leeftijd', herken: /^leeftijd( in jaren)?$/ },
  geboortedatum: { label: 'Geboortedatum (wordt leeftijd)', soort: 'geboortedatum', herken: /^(geboortedatum|geb datum|gebdatum|geboren|geboren op)$/ },
  geboortejaar: { label: 'Geboortejaar (wordt leeftijd)', soort: 'geboortejaar', herken: /^geboortejaar$/ },
  datum_in: { label: 'In dienst sinds', soort: 'maand', herken: /^(datum in dienst|in dienst|in dienst sinds|in dienst per|startdatum|begindatum|indiensttreding|datum indiensttreding)$/ },
  datum_uit: { label: 'Uit dienst per', soort: 'maand', herken: /^(datum uit dienst|uit dienst|uit dienst per|einddatum|uitdiensttreding|datum uitdiensttreding|einde dienstverband)$/ },
  fte: { label: 'Fte (deeltijdfactor)', soort: 'fte', herken: /^(fte|deeltijdfactor|dtf|parttimefactor|parttime factor)$/ },
  uren: { label: 'Uren per week', soort: 'uren', herken: /^(uren|contracturen|contract uren|uren per week|arbeidsduur|aantal uren)$/ },
  verzuimdagen: { label: 'Verzuimdagen in de periode', soort: 'dagen', herken: /^(verzuimdagen|verzuim dagen|ziektedagen|dagen ziek|aantal verzuimdagen|kalenderdagen verzuim)$/ },
  verzuimpercentage: { label: 'Verzuimpercentage per medewerker', soort: 'procent', herken: /^(verzuimpercentage|verzuim percentage|persoonlijk verzuimpercentage)$/ },
  verzuimmeldingen: { label: 'Ziekmeldingen in de periode', soort: 'meldingen', herken: /^(ziekmeldingen|verzuimmeldingen|aantal meldingen|aantal ziekmeldingen)$/ },
  reden_uit: { label: 'Reden uit dienst', soort: 'reden', herken: /^(reden uit dienst|reden vertrek|vertrekreden|reden einde dienstverband|uitdienstreden|reden ontslag)$/ },
};

/** De indelingen waarvoor groepscijfers worden gemaakt, met hun naam. */
export const DIMENSIES = {
  afdeling: 'Afdeling',
  locatie: 'Locatie',
  contract: 'Soort dienstverband',
  functieniveau: 'Functieniveau',
  geslacht: 'Geslacht',
  leidinggevend: 'Geeft leiding',
  leeftijd: 'Leeftijd',
  diensttijd: 'Diensttijd',
  uren: 'Arbeidsuren',
  opleiding: 'Opleidingsniveau',
};
/** Indelingen in klassen: eenheid en standaardgrenzen (§3.5: leeftijd <25 … 60+, diensttijd <1 … 10+ jaar, uren <20 … 35+). */
export const KLASSEN = {
  leeftijd: { eenheid: 'jaar', grenzen: [25, 35, 45, 55, 60] },
  diensttijd: { eenheid: 'maand', grenzen: [12, 60, 120] },
  uren: { eenheid: 'uur', grenzen: [20, 35] },
};
/** Welke indeling hoort bij een achtergrondkenmerk van een vraag (kenmerken.js). */
export const DIMENSIE_VAN_KENMERK = {
  afdeling: 'afdeling', leeftijd: 'leeftijd', geslacht: 'geslacht', diensttijd: 'diensttijd', contract: 'contract',
  uren: 'uren', functieniveau: 'functieniveau', leidinggevend: 'leidinggevend', locatie: 'locatie', opleiding: 'opleiding',
};
// Elk kenmerk (behalve 'overig') heeft een indeling (KENMERKEN[k].rol is de bijbehorende kolom).
for (const k of Object.keys(KENMERKEN)) if (k !== 'overig' && !DIMENSIE_VAN_KENMERK[k]) throw new Error(`Geen indeling voor kenmerk ${k}`);

/** Kengetallen die er kunnen zijn; een kengetal waarvan een kolom ontbreekt, staat in ontbreekt. */
export const KENGETALLEN = {
  fte: 'Fte', gem_leeftijd: 'Gemiddelde leeftijd', pct_55plus: '55 jaar of ouder', pct_60plus: '60 jaar of ouder',
  pct_vrouw: 'Vrouw', gem_diensttijd_jaar: 'Gemiddelde diensttijd', pct_deeltijd: 'Deeltijd', pct_leidinggevend: 'Leidinggevend',
  verzuim_pct: 'Verzuimpercentage', meldingsfrequentie: 'Meldingsfrequentie', gem_duur_per_melding: 'Gemiddelde duur per melding',
  nulverzuim_pct: 'Nulverzuim', verloop_pct: 'Verloop', verloop_vrijwillig_pct: 'Vrijwillig verloop', instroom_pct: 'Instroom',
  pct_eerste_jaar: 'Vertrek in het eerste jaar',
};

// ---------- Tijd ----------

const DAG = 86_400_000;
/** 'JJJJ-MM' → maandnummer (jaar · 12 + maand − 1), of null. */
export function maandNr(m) {
  const t = /^(\d{4})-(\d{2})$/.exec(String(m ?? ''));
  if (!t) return null;
  const mnd = Number(t[2]);
  return mnd >= 1 && mnd <= 12 ? Number(t[1]) * 12 + mnd - 1 : null;
}
const maandTekst = (nr) => `${Math.floor(nr / 12)}-${String((nr % 12) + 1).padStart(2, '0')}`;
const eersteDag = (nr) => Date.UTC(Math.floor(nr / 12), nr % 12, 1) / DAG;
const laatsteDag = (nr) => Date.UTC(Math.floor(nr / 12), (nr % 12) + 1, 0) / DAG;

/** De peildatum (laatste dag van de maand tot), als 'JJJJ-MM-DD'. */
export function peildatumVan(tot) {
  const nr = maandNr(tot);
  return nr === null ? null : new Date(laatsteDag(nr) * DAG).toISOString().slice(0, 10);
}
/** Aantal dagen van de periode (eerste dag van van tot en met de laatste dag van tot). */
export function periodeDagen(periode) {
  const v = maandNr(periode?.van);
  const t = maandNr(periode?.tot);
  return v === null || t === null || v > t ? null : laatsteDag(t) - eersteDag(v) + 1;
}

/** Een maand uit een cel: 2015-03, 2015-03-15, 15-03-2015, 03-2015, 15 maart 2015, een Excel-datum als tekst. */
export function leesMaand(w) {
  if (w === null || w === undefined || w === '') return null;
  const t = String(w).trim();
  let m = /^(\d{4})[-/.](\d{1,2})$/.exec(t);
  if (m) return maandNr(`${m[1]}-${m[2].padStart(2, '0')}`) === null ? null : `${m[1]}-${m[2].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(t);
  if (m) return maandNr(`${m[2]}-${m[1].padStart(2, '0')}`) === null ? null : `${m[2]}-${m[1].padStart(2, '0')}`;
  const d = alsDatum(t);
  return d ? d.slice(0, 7) : null;
}

// ---------- Kolommen herkennen ----------

const JA = new Set(['ja', 'j', 'yes', 'y', 'waar', 'true', '1', 'x']);
const NEE = new Set(['nee', 'n', 'no', 'onwaar', 'false', '0']);
const jaNee = (w) => {
  const t = normaal(w);
  return JA.has(t) ? 'ja' : NEE.has(t) ? 'nee' : null;
};
const MAN = new Set(['m', 'man', 'male', 'mannelijk', 'heer', 'dhr']);
const VROUW = new Set(['v', 'vrouw', 'f', 'female', 'vrouwelijk', 'mevrouw', 'mevr']);
const ANDERS = new Set(['x', 'anders', 'overig', 'non binair', 'nonbinair', 'divers', 'o']);
function leesGeslacht(w) {
  const t = normaal(w);
  return MAN.has(t) ? 'Man' : VROUW.has(t) ? 'Vrouw' : ANDERS.has(t) ? 'Anders' : null;
}

/**
 * De rol die een kolom vooraf krijgt, of null. Met waarden (een deel van de kolom) wordt "Leidinggevende" alleen
 * herkend als er vooral ja/nee in staat: vaak staat in zo'n kolom de naam van de leidinggevende.
 */
export function herkenRol(kolomnaam, waarden = []) {
  const n = normaal(kolomnaam);
  for (const [rol, def] of Object.entries(ROLLEN)) {
    if (!def.herken.test(n)) continue;
    if (rol === 'leidinggevend') {
      const gevuld = (waarden || []).filter((w) => w !== null && w !== undefined && String(w).trim() !== '');
      if (!gevuld.length || gevuld.filter((w) => jaNee(w) !== null).length / gevuld.length < 0.8) return null;
    }
    return rol;
  }
  return null;
}

/** De rollen die het bestand vooraf krijgt: { kolomIndex: rol }. Kolommen met namen of nummers krijgen er nooit een. */
export function herkenRollen(kop, rijen = []) {
  const persoon = new Set(verdachteKolommen(kop, rijen.slice(0, 200), { metReden: true }).filter((x) => x.reden === 'persoon').map((x) => x.kolom));
  const uit = {};
  const bezet = new Set();
  kop.forEach((k, i) => {
    const rol = herkenRol(k, rijen.slice(0, 200).map((r) => r[i]));
    if (!rol || bezet.has(rol)) return;
    if (persoon.has(k) && !MAG_PERSOONSKOLOM.has(rol)) return;
    uit[i] = rol;
    bezet.add(rol);
  });
  return uit;
}
// Een geboortedatum of -jaar mag wel: die wordt in de browser een leeftijd en gaat zelf nooit mee.
const MAG_PERSOONSKOLOM = new Set(['geboortedatum', 'geboortejaar']);

/** Herkent de reden van uit dienst gaan aan de tekst; null als die niet te herkennen is. */
export function herkenReden(w) {
  const t = normaal(w);
  if (!t) return null;
  for (const [sleutel, label] of Object.entries(REDENEN)) if (t === normaal(label)) return sleutel;
  if (/(eigen verzoek|op verzoek van (de )?(werknemer|medewerker)|vrijwillig|opzegging (door )?(werknemer|medewerker)|ontslag ?name)/.test(t)) return 'eigen_verzoek';
  if (/(pensioen|aow|vut)/.test(t)) return 'pensioen';
  if (/(tijdelijk|einde contract|contract (afgelopen|niet verlengd|beeindigd)|niet verlengd|van rechtswege)/.test(t)) return 'tijdelijk';
  if (/(werkgever|reorganisatie|boventallig|bedrijfseconomisch|ontslag|vaststellingsovereenkomst|disfunctioneren)/.test(t)) return 'werkgever';
  return null;
}

// ---------- Klassen ----------

const getal = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10).replace('.', ','));
function duurTekst(maanden) {
  if (maanden % 12 === 0) return `${getal(maanden / 12)} jaar`;
  return `${getal(maanden)} ${maanden === 1 ? 'maand' : 'maanden'}`;
}
/** Naam van een klasse: "Jonger dan 25 jaar", "25 tot 35 jaar", "60 jaar of ouder", "Korter dan 1 jaar", … */
export function klasseLabel(dimensie, van, tot) {
  if (dimensie === 'leeftijd') {
    if (van === null) return `Jonger dan ${getal(tot)} jaar`;
    if (tot === null) return `${getal(van)} jaar of ouder`;
    return `${getal(van)} tot ${getal(tot)} jaar`;
  }
  if (dimensie === 'diensttijd') {
    if (van === null) return `Korter dan ${duurTekst(tot)}`;
    if (tot === null) return `${duurTekst(van)} of langer`;
    return `${duurTekst(van)} tot ${duurTekst(tot)}`;
  }
  if (van === null) return `Minder dan ${getal(tot)} uur`;
  if (tot === null) return `${getal(van)} uur of meer`;
  return `${getal(van)} tot ${getal(tot)} uur`;
}

/** Klassen van een indeling uit de standaardgrenzen plus extra grenzen (van inbegrepen, tot niet). */
export function klassenVan(dimensie, extra = []) {
  const def = KLASSEN[dimensie];
  const grenzen = [...new Set([...def.grenzen, ...(extra || []).filter((g) => Number.isFinite(g) && g > 0)])].sort((a, b) => a - b);
  const uit = [];
  let vorige = null;
  for (const g of [...grenzen, null]) {
    uit.push({ label: klasseLabel(dimensie, vorige, g), van: vorige, tot: g });
    vorige = g;
  }
  return uit;
}

const EENHEID_FACTOR = { leeftijd: { jaar: 1 }, diensttijd: { jaar: 12, maand: 1 }, uren: { uur: 1 } };

/** De grenzen van een antwoordmogelijkheid in de eenheid van de indeling, of null. */
function optieKlasse(dimensie, optie) {
  // Een mogelijkheid uit KENMERKVRAGEN heeft zelf grenzen ({ label, van, tot, eenheid }); anders uit het label.
  const eigen = optie && optie.eenheid && (Number.isFinite(optie.van) || Number.isFinite(optie.tot));
  const k = eigen ? { van: optie.van ?? null, tot: optie.tot ?? null, eenheid: optie.eenheid } : klasseVan(optie?.label);
  if (!k) return null;
  const factor = EENHEID_FACTOR[dimensie]?.[k.eenheid];
  if (!factor) return null;
  return { van: k.van === null ? null : k.van * factor, tot: k.tot === null ? null : k.tot * factor };
}

const optiesVan = (vraag) => {
  if (vraag?.type === 'janee') return [{ id: 'ja', label: 'Ja' }, { id: 'nee', label: 'Nee' }];
  let o = vraag?.opties;
  if (typeof o === 'string') {
    try { o = JSON.parse(o); } catch { o = []; }
  }
  return Array.isArray(o) ? o : [];
};

/**
 * Extra klassegrenzen uit de achtergrondvragen van de vragenlijsten (bijv. "Korter dan 3 maanden" bij onboarding),
 * zodat de populatie per antwoordmogelijkheid precies uit de klassen volgt. Geef het resultaat mee aan
 * verwerkPersoneel (extraGrenzen). vragen: rijen uit de export of uit bouwModel.
 */
export function grenzenVoorVragen(vragen) {
  const uit = { leeftijd: new Set(), diensttijd: new Set(), uren: new Set() };
  for (const q of vragen || []) {
    const dim = DIMENSIE_VAN_KENMERK[q.kenmerk];
    if (!KLASSEN[dim]) continue;
    for (const o of optiesVan(q)) {
      const k = optieKlasse(dim, o);
      if (!k) continue;
      if (k.van !== null) uit[dim].add(k.van);
      if (k.tot !== null) uit[dim].add(k.tot);
    }
  }
  return Object.fromEntries(Object.entries(uit).map(([d, s]) => [d, [...s].sort((a, b) => a - b)]));
}

// ---------- Rijen lezen (alleen in deze module) ----------

const leegCel = (w) => w === null || w === undefined || (typeof w === 'string' && w.trim() === '');
const tekst = (w) => String(w ?? '').trim().replace(/\s+/g, ' ');

function opzoeken(kaart, waarde) {
  if (!kaart) return undefined;
  if (Object.prototype.hasOwnProperty.call(kaart, waarde)) return kaart[waarde];
  const n = normaal(waarde);
  for (const [k, v] of Object.entries(kaart)) if (normaal(k) === n) return v;
  return undefined;
}

/**
 * Leest de rijen in tot "personen" (alleen binnen deze module en de tests; dit gaat NOOIT naar de server).
 * @returns {{ personen, meldingen: string[], rollen: Set<string> }}
 */
export function leesPersonen(kop, rijen, { rollen = {}, koppeling = {}, redenen = {}, periode, uren_per_fte = 36 } = {}) {
  const meldingen = [];
  const vM = maandNr(periode?.van);
  const tM = maandNr(periode?.tot);
  if (vM === null || tM === null || vM > tM) throw new Error('Kies een geldige periode: de eerste maand ligt niet na de laatste.');
  const persoon = new Set(verdachteKolommen(kop, rijen.slice(0, 200), { metReden: true }).filter((x) => x.reden === 'persoon').map((x) => x.kolom));
  // Kolom per rol (de eerste kolom met die rol telt).
  const kolom = {};
  for (const [index, rol] of Object.entries(rollen || {})) {
    const i = Number(index);
    if (!ROLLEN[rol] || !Number.isInteger(i) || i < 0 || i >= kop.length) continue;
    if (persoon.has(kop[i]) && !MAG_PERSOONSKOLOM.has(rol)) {
      meldingen.push(`Kolom "${kop[i]}" lijkt namen, nummers of contactgegevens te bevatten en wordt niet gebruikt.`);
      continue;
    }
    if (kolom[rol] !== undefined) {
      meldingen.push(`Kolom "${kop[i]}" heeft dezelfde rol als "${kop[kolom[rol]]}" en wordt niet gebruikt.`);
      continue;
    }
    kolom[rol] = i;
  }
  const heeft = (rol) => kolom[rol] !== undefined;
  const peiljaar = Math.floor(tM / 12);
  const peildag = laatsteDag(tM);
  const fteNotatie = heeft('fte') ? getalNotatie(rijen.map((r) => r[kolom.fte])) : 'nl';
  const tel = { ongeldigeMaand: new Map(), ongeldig: new Map(), procentFte: 0, verzuimTeHoog: 0, zonderFte: 0, zonderIn: 0, onbekendeReden: new Map(), omgekeerd: 0 };
  const telOngeldig = (rol) => tel.ongeldig.set(rol, (tel.ongeldig.get(rol) || 0) + 1);
  const cel = (rij, rol) => (heeft(rol) ? rij[kolom[rol]] : null);
  const personen = [];
  for (const rij of rijen) {
    if (!Array.isArray(rij) || rij.every(leegCel)) continue;
    // In en uit dienst
    let inM = null;
    if (heeft('datum_in') && !leegCel(cel(rij, 'datum_in'))) {
      const m = leesMaand(cel(rij, 'datum_in'));
      if (m) inM = maandNr(m);
      else telOngeldig('datum_in');
    }
    let uitM = null;
    if (heeft('datum_uit') && !leegCel(cel(rij, 'datum_uit'))) {
      const m = leesMaand(cel(rij, 'datum_uit'));
      if (m) uitM = maandNr(m);
      else telOngeldig('datum_uit');
    }
    if (inM !== null && uitM !== null && uitM < inM) {
      tel.omgekeerd++;
      continue;
    }
    // Alleen wie in de periode in dienst was, telt mee.
    const inStart = inM === null ? -Infinity : eersteDag(inM);
    const uitEind = uitM === null ? Infinity : laatsteDag(uitM);
    const pStart = eersteDag(vM);
    const pEind = laatsteDag(tM);
    if (inStart > pEind || uitEind < pStart) continue;
    if (heeft('datum_in') && inM === null) tel.zonderIn++;
    const beschikbaar = Math.min(uitEind, pEind) - Math.max(inStart, pStart) + 1;

    // Leeftijd op de peildatum
    let leeftijd = null;
    if (heeft('leeftijd') && !leegCel(cel(rij, 'leeftijd'))) {
      const x = alsGetal(cel(rij, 'leeftijd'));
      if (x !== null && x >= 14 && x <= 100) leeftijd = Math.floor(x);
      else telOngeldig('leeftijd');
    } else if (heeft('geboortedatum') && !leegCel(cel(rij, 'geboortedatum'))) {
      const d = alsDatum(cel(rij, 'geboortedatum'));
      if (d) {
        const [j, mm, dd] = d.split('-').map(Number);
        const peil = new Date(peildag * DAG);
        let l = peil.getUTCFullYear() - j;
        if (peil.getUTCMonth() + 1 < mm || (peil.getUTCMonth() + 1 === mm && peil.getUTCDate() < dd)) l--;
        if (l >= 14 && l <= 100) leeftijd = l;
        else telOngeldig('geboortedatum');
      } else telOngeldig('geboortedatum');
    } else if (heeft('geboortejaar') && !leegCel(cel(rij, 'geboortejaar'))) {
      const j = alsGetal(cel(rij, 'geboortejaar'));
      const l = Number.isInteger(j) ? peiljaar - j : NaN;
      if (l >= 14 && l <= 100) leeftijd = l;
      else telOngeldig('geboortejaar');
    }

    // Fte en uren
    let fte = null;
    if (heeft('fte') && !leegCel(cel(rij, 'fte'))) {
      let x = alsGetal(cel(rij, 'fte'), fteNotatie);
      if (x !== null && x > 1.5 && x <= 150) {
        x /= 100;
        tel.procentFte++;
      }
      if (x !== null && x > 0 && x <= 1.5) fte = x;
      else telOngeldig('fte');
    }
    let uren = null;
    if (heeft('uren') && !leegCel(cel(rij, 'uren'))) {
      const x = alsGetal(cel(rij, 'uren'));
      if (x !== null && x > 0 && x <= 80) uren = x;
      else telOngeldig('uren');
    }
    if (fte === null && uren !== null) fte = uren / uren_per_fte;
    if (uren === null && fte !== null && heeft('fte')) uren = fte * uren_per_fte;
    if ((heeft('fte') || heeft('uren')) && fte === null) tel.zonderFte++;

    // Verzuim (een lege cel telt als 0)
    let dagen = null;
    if (heeft('verzuimdagen')) {
      const w = cel(rij, 'verzuimdagen');
      const x = leegCel(w) ? 0 : alsGetal(w);
      if (x !== null && x >= 0 && x <= 366) dagen = x;
      else {
        telOngeldig('verzuimdagen');
        dagen = 0;
      }
    } else if (heeft('verzuimpercentage')) {
      const w = cel(rij, 'verzuimpercentage');
      const x = leegCel(w) ? 0 : alsGetal(w);
      if (x !== null && x >= 0 && x <= 100) dagen = (x / 100) * beschikbaar;
      else {
        telOngeldig('verzuimpercentage');
        dagen = 0;
      }
    }
    if (dagen !== null && dagen > beschikbaar) {
      dagen = beschikbaar;
      tel.verzuimTeHoog++;
    }
    let meldingenP = null;
    if (heeft('verzuimmeldingen')) {
      const w = cel(rij, 'verzuimmeldingen');
      const x = leegCel(w) ? 0 : alsGetal(w);
      if (x !== null && Number.isInteger(x) && x >= 0 && x <= 50) meldingenP = x;
      else {
        telOngeldig('verzuimmeldingen');
        meldingenP = 0;
      }
    }

    // Reden van vertrek (alleen bij wie in de periode uit dienst ging)
    const uitstroom = uitM !== null && uitM >= vM && uitM <= tM;
    let reden = null;
    if (uitstroom) {
      reden = 'onbekend';
      if (heeft('reden_uit') && !leegCel(cel(rij, 'reden_uit'))) {
        const ruw = tekst(cel(rij, 'reden_uit'));
        const eigen = opzoeken(redenen, ruw);
        const sleutel = REDENEN[eigen] ? eigen : herkenReden(ruw);
        if (sleutel) reden = sleutel;
        else {
          reden = 'overig';
          tel.onbekendeReden.set(ruw, (tel.onbekendeReden.get(ruw) || 0) + 1);
        }
      }
    }

    // Indelingen (categorieën: met de koppeling naar de antwoordmogelijkheden van de vragenlijst)
    const dim = {};
    for (const d of ['afdeling', 'locatie', 'functieniveau', 'contract', 'opleiding']) {
      if (!heeft(d)) continue;
      const w = cel(rij, d);
      if (leegCel(w)) {
        dim[d] = null;
        continue;
      }
      const ruw = tekst(w).slice(0, 100);
      const gekoppeld = opzoeken(koppeling?.[d], ruw);
      dim[d] = typeof gekoppeld === 'string' && gekoppeld.trim() ? gekoppeld.trim().slice(0, 100) : ruw;
    }
    if (heeft('geslacht')) dim.geslacht = leegCel(cel(rij, 'geslacht')) ? null : leesGeslacht(cel(rij, 'geslacht'));
    if (heeft('geslacht') && !leegCel(cel(rij, 'geslacht')) && dim.geslacht === null) telOngeldig('geslacht');
    if (heeft('leidinggevend')) {
      const j = leegCel(cel(rij, 'leidinggevend')) ? null : jaNee(cel(rij, 'leidinggevend'));
      if (!leegCel(cel(rij, 'leidinggevend')) && j === null) telOngeldig('leidinggevend');
      dim.leidinggevend = j === 'ja' ? 'Ja' : j === 'nee' ? 'Nee' : null;
    }

    const eindM = uitM !== null && uitM < tM ? uitM : tM;
    personen.push({
      inM, uitM, beschikbaar, leeftijd, fte, uren, dagen, meldingen: meldingenP, reden,
      diensttijd: inM === null ? null : Math.max(0, eindM - inM),
      dim,
    });
  }

  // Meldingen voor de onderzoeker (blijven in de browser).
  const naam = (rol) => ROLLEN[rol].label;
  for (const [rol, n] of tel.ongeldig) meldingen.push(`${n === 1 ? 'Eén waarde' : `${n} waarden`} in de kolom "${naam(rol)}" ${n === 1 ? 'is' : 'zijn'} niet te lezen en ${n === 1 ? 'telt' : 'tellen'} niet mee.`);
  if (tel.omgekeerd) meldingen.push(`${tel.omgekeerd === 1 ? 'Eén rij heeft' : `${tel.omgekeerd} rijen hebben`} een datum uit dienst vóór de datum in dienst en ${tel.omgekeerd === 1 ? 'telt' : 'tellen'} niet mee.`);
  if (tel.procentFte) meldingen.push(`Fte boven 1,5 is gelezen als percentage (80 = 0,8 fte) bij ${tel.procentFte === 1 ? 'één medewerker' : `${tel.procentFte} medewerkers`}.`);
  if (tel.verzuimTeHoog) meldingen.push(`Bij ${tel.verzuimTeHoog === 1 ? 'één medewerker' : `${tel.verzuimTeHoog} medewerkers`} waren er meer verzuimdagen dan dagen in dienst in de periode; dat is teruggezet naar het aantal dagen in dienst.`);
  if (tel.zonderFte) meldingen.push(`${tel.zonderFte === 1 ? 'Eén medewerker heeft' : `${tel.zonderFte} medewerkers hebben`} geen fte of uren; bij het verzuim ${tel.zonderFte === 1 ? 'telt die' : 'tellen zij'} als 1 fte.`);
  if (tel.zonderIn) meldingen.push(`${tel.zonderIn === 1 ? 'Eén medewerker heeft' : `${tel.zonderIn} medewerkers hebben`} geen datum in dienst en ${tel.zonderIn === 1 ? 'telt' : 'tellen'} als al in dienst vóór de periode.`);
  for (const [w, n] of tel.onbekendeReden) meldingen.push(`De reden "${w}" (${n}×) is niet herkend en telt als "Overig". Koppel hem zelf als dat niet klopt.`);
  return { personen, meldingen, rollen: new Set(Object.keys(kolom)) };
}

// ---------- Tellen ----------

const rond = (x, n = 4) => (x === null ? null : Math.round(x * 10 ** n) / 10 ** n);

/**
 * Telt de groepscijfers van een groep personen (Groepscijfers v1, nog zonder afscherming van het verzuim).
 * ctx: { vM, tM, rollen: Set, uren_per_fte, totaal: true voor de hele organisatie }.
 * Alleen voor de hele organisatie komen de vertrekredenen en het vertrek in het eerste jaar mee (PR-16).
 */
export function telGroep(personen, { vM, tM, rollen, uren_per_fte = 36, totaal = false }) {
  const heeft = (r) => rollen.has(r);
  const g = {
    medewerkers: 0, in_periode: 0, begin: 0, fte: heeft('fte') || heeft('uren') ? 0 : null, instroom: 0, uitstroom: 0,
    leeftijd_som: 0, leeftijd_n: 0, n_55plus: 0, n_60plus: 0, diensttijd_maanden_som: 0, diensttijd_n: 0,
    n_deeltijd: 0, deeltijd_n: 0, n_leidinggevend: 0, leidinggevend_n: 0, geslacht: { Man: 0, Vrouw: 0, Anders: 0 },
  };
  if (totaal) {
    g.uitstroom_reden = Object.fromEntries(REDEN_SLEUTELS.map((k) => [k, 0]));
    g.uitstroom_eerste_jaar = 0;
  }
  const metVerzuim = heeft('verzuimdagen') || heeft('verzuimpercentage') || heeft('verzuimmeldingen');
  const metDagen = heeft('verzuimdagen') || heeft('verzuimpercentage');
  const v = { dagen_fte: 0, beschikbaar_fte: 0, beschikbaar: 0, meldingen: heeft('verzuimmeldingen') ? 0 : null, dagen: 0, n_hele_periode: 0, n_nulverzuim: 0 };
  for (const p of personen) {
    g.in_periode++;
    const opPeildatum = (p.inM === null || p.inM <= tM) && (p.uitM === null || p.uitM > tM);
    if ((p.inM === null || p.inM < vM) && (p.uitM === null || p.uitM >= vM)) g.begin++;
    if (p.inM !== null && p.inM >= vM && p.inM <= tM) g.instroom++;
    const uit = p.uitM !== null && p.uitM >= vM && p.uitM <= tM;
    if (uit) {
      g.uitstroom++;
      if (totaal) {
        g.uitstroom_reden[p.reden || 'onbekend']++;
        if (p.inM !== null && p.uitM - p.inM + 1 < 12) g.uitstroom_eerste_jaar++;
      }
    }
    if (opPeildatum) {
      g.medewerkers++;
      if (g.fte !== null && p.fte !== null) g.fte += p.fte;
      if (p.leeftijd !== null) {
        g.leeftijd_som += p.leeftijd;
        g.leeftijd_n++;
        if (p.leeftijd >= 55) g.n_55plus++;
        if (p.leeftijd >= 60) g.n_60plus++;
      }
      if (p.diensttijd !== null) {
        g.diensttijd_maanden_som += p.diensttijd;
        g.diensttijd_n++;
      }
      if (p.fte !== null) {
        g.deeltijd_n++;
        if (p.fte < 1 - 1e-9) g.n_deeltijd++;
      }
      if (p.dim.leidinggevend) {
        g.leidinggevend_n++;
        if (p.dim.leidinggevend === 'Ja') g.n_leidinggevend++;
      }
      if (p.dim.geslacht) g.geslacht[p.dim.geslacht]++;
    }
    if (metVerzuim) {
      const w = p.fte ?? 1;
      v.beschikbaar += p.beschikbaar;
      v.beschikbaar_fte += p.beschikbaar * w;
      if (metDagen) {
        v.dagen += p.dagen ?? 0;
        v.dagen_fte += (p.dagen ?? 0) * w;
      }
      if (v.meldingen !== null) v.meldingen += p.meldingen ?? 0;
      const heel = (p.inM === null || p.inM <= vM) && (p.uitM === null || p.uitM >= tM);
      if (heel) {
        v.n_hele_periode++;
        const nul = v.meldingen !== null ? (p.meldingen ?? 0) === 0 : (p.dagen ?? 0) === 0;
        if (nul) v.n_nulverzuim++;
      }
    }
  }
  if (g.fte !== null) g.fte = rond(g.fte, 3);
  if (metVerzuim) {
    g.verzuim = {
      toonbaar: true,
      dagen_fte: metDagen ? rond(v.dagen_fte) : null,
      beschikbaar_fte: rond(v.beschikbaar_fte),
      beschikbaar: v.beschikbaar,
      meldingen: v.meldingen,
      dagen: metDagen ? rond(v.dagen) : null,
      n_hele_periode: v.n_hele_periode,
      n_nulverzuim: v.n_nulverzuim,
    };
  } else g.verzuim = null;
  return g;
}

/**
 * Kengetallen van één groep uit de groepscijfers (D1 §5.4 en §3.5), zonder afscherming: voor het rekenwerk en de
 * tests. Wat niet te berekenen is (kolom ontbreekt, geen verzuimcijfers) is null.
 */
export function kengetallen(g, { periode }) {
  const deel = (a, b) => (b > 0 && Number.isFinite(a) ? a / b : null);
  const pct = (a, b) => (b > 0 && Number.isFinite(a) ? (a / b) * 100 : null);
  const gemAantal = (g.begin + g.medewerkers) / 2;
  const v = g.verzuim && g.verzuim.toonbaar ? g.verzuim : null;
  const dagenPeriode = periodeDagen(periode);
  return {
    medewerkers: g.medewerkers,
    fte: g.fte,
    gem_leeftijd: deel(g.leeftijd_som, g.leeftijd_n),
    pct_55plus: pct(g.n_55plus, g.leeftijd_n),
    pct_60plus: pct(g.n_60plus, g.leeftijd_n),
    pct_vrouw: pct(g.geslacht?.Vrouw, (g.geslacht?.Man || 0) + (g.geslacht?.Vrouw || 0) + (g.geslacht?.Anders || 0)),
    gem_diensttijd_jaar: g.diensttijd_n > 0 ? g.diensttijd_maanden_som / g.diensttijd_n / 12 : null,
    pct_deeltijd: pct(g.n_deeltijd, g.deeltijd_n),
    pct_leidinggevend: pct(g.n_leidinggevend, g.leidinggevend_n),
    verzuim_pct: v && v.dagen_fte !== null ? pct(v.dagen_fte, v.beschikbaar_fte) : null,
    meldingsfrequentie: v && v.meldingen !== null && dagenPeriode && v.beschikbaar > 0
      ? (v.meldingen / (v.beschikbaar / dagenPeriode)) * (365 / dagenPeriode) : null,
    gem_duur_per_melding: v && v.dagen !== null && v.meldingen > 0 ? v.dagen / v.meldingen : null,
    nulverzuim_pct: v ? pct(v.n_nulverzuim, v.n_hele_periode) : null,
    gem_aantal: gemAantal,
    verloop_pct: pct(g.uitstroom, gemAantal),
    verloop_vrijwillig_pct: g.uitstroom_reden ? pct(g.uitstroom_reden.eigen_verzoek, gemAantal) : null,
    instroom_pct: pct(g.instroom, gemAantal),
    pct_eerste_jaar: g.uitstroom_reden ? pct(g.uitstroom_eerste_jaar, g.uitstroom) : null,
  };
}

/** Van een kleine groep gaan alleen de aantallen mee (dataminimalisatie). */
function alleenAantallen(g) {
  return { medewerkers: g.medewerkers, in_periode: g.in_periode, klein: true, verzuim: g.verzuim ? { toonbaar: false, reden: 'klein' } : null };
}

/** Is het verzuim van een groep personen toonbaar? Ook naar fte gewogen dagen mogen niet van één persoon zijn. */
function verzuimOk(personen, n, minN, d) {
  const ruw = verzuimToonbaar({ n, dagenPerPersoon: personen.map((p) => p.dagen ?? 0) }, { minN, d });
  if (!ruw.toonbaar) return ruw;
  return verzuimToonbaar({ n, dagenPerPersoon: personen.map((p) => (p.dagen ?? 0) * (p.fte ?? 1)) }, { minN, d });
}

/**
 * Verwerkt het personeelsbestand in de browser tot een Personeelsaggregaat v1 (BOUWPLAN §3.5).
 * kop, rijen: het bestand (rijen met cellen). rollen: { kolomIndex: rol }; koppeling: { indeling: { waarde in het
 * bestand: groepsnaam } } (zo komen de groepen overeen met de antwoordmogelijkheden van de vragenlijst); redenen:
 * { waarde in het bestand: sleutel uit REDENEN }; periode: { van: 'JJJJ-MM', tot: 'JJJJ-MM' }; extraGrenzen:
 * { leeftijd: [jaren], diensttijd: [maanden], uren: [uren] } (zie grenzenVoorVragen).
 * @returns {{ aggregaat, meldingen: string[], ontbreekt: string[] }}
 */
export function verwerkPersoneel(kop, rijen, {
  rollen = {}, koppeling = {}, redenen = {}, periode, uren_per_fte = 36, minN = MIN_VERZUIM, naam = 'Personeelsbestand',
  extraGrenzen = {}, d = DREMPEL,
} = {}) {
  const urenPerFte = Number(uren_per_fte);
  if (!(urenPerFte >= 1 && urenPerFte <= 60)) throw new Error('Uren per fte moet tussen 1 en 60 liggen.');
  const vM = maandNr(periode?.van);
  const tM = maandNr(periode?.tot);
  if (vM === null || tM === null || vM > tM) throw new Error('Kies een geldige periode: de eerste maand ligt niet na de laatste.');
  if (tM - vM + 1 > MAX_MAANDEN) throw new Error(`Een periode is hooguit ${MAX_MAANDEN} maanden.`);
  const gelezen = leesPersonen(kop, rijen, { rollen, koppeling, redenen, periode, uren_per_fte: urenPerFte });
  const { personen, rollen: gebruikt } = gelezen;
  const meldingen = [...gelezen.meldingen];
  const ctx = { vM, tM, rollen: gebruikt, uren_per_fte: urenPerFte };
  const grens = Math.max(Number(minN) || 0, d);

  // De indelingen: per indeling een groepslabel per persoon (null = Onbekend).
  const indelingen = {};
  const urenBekend = gebruikt.has('uren') || gebruikt.has('fte');
  const isKlasse = { leeftijd: gebruikt.has('leeftijd') || gebruikt.has('geboortedatum') || gebruikt.has('geboortejaar'), diensttijd: gebruikt.has('datum_in'), uren: urenBekend };
  for (const dim of Object.keys(DIMENSIES)) {
    if (KLASSEN[dim]) {
      if (!isKlasse[dim]) continue;
      const klassen = klassenVan(dim, extraGrenzen?.[dim]);
      const waarde = (p) => (dim === 'leeftijd' ? p.leeftijd : dim === 'diensttijd' ? p.diensttijd : p.uren ?? (p.fte !== null ? p.fte * urenPerFte : null));
      const labelVan = (p) => {
        const x = waarde(p);
        if (x === null || x === undefined) return null;
        const k = klassen.find((c) => (c.van === null || x >= c.van) && (c.tot === null || x < c.tot));
        return k ? k.label : null;
      };
      indelingen[dim] = { eenheid: KLASSEN[dim].eenheid, klassen, labelVan, volgorde: klassen.map((k) => k.label) };
    } else {
      const rol = dim;
      if (!gebruikt.has(rol)) continue;
      const labels = new Set(personen.map((p) => p.dim[dim]).filter(Boolean));
      if (labels.size > MAX_GROEPEN || (personen.length >= 20 && labels.size > personen.length / 2)) {
        meldingen.push(`De kolom "${ROLLEN[rol].label}" heeft zoveel verschillende waarden dat het geen indeling in groepen lijkt; die wordt niet gebruikt.`);
        continue;
      }
      const vast = dim === 'geslacht' ? ['Man', 'Vrouw', 'Anders'] : dim === 'leidinggevend' ? ['Ja', 'Nee'] : null;
      const volgorde = vast || [...labels].sort((a, b) => a.localeCompare(b, 'nl'));
      indelingen[dim] = { labelVan: (p) => p.dim[dim] || null, volgorde };
    }
  }

  // Totaal en groepen tellen; verzuim per groep alleen bij minstens minN medewerkers en zonder één persoon die
  // meer dan de helft van de dagen heeft.
  const totaalRuw = telGroep(personen, { ...ctx, totaal: true });
  let totaal = totaalRuw;
  if (totaalRuw.verzuim) {
    const ok = verzuimOk(personen, totaalRuw.medewerkers, grens, d);
    if (!ok.toonbaar) totaal = { ...totaalRuw, verzuim: { toonbaar: false, reden: ok.reden } };
  }
  if (totaal.medewerkers < d) totaal = { ...alleenAantallen(totaal) };

  const dimensies = {};
  for (const [dim, ind] of Object.entries(indelingen)) {
    const perLabel = new Map(ind.volgorde.map((l) => [l, []]));
    const onbekend = [];
    for (const p of personen) {
      const l = ind.labelVan(p);
      if (l === null) onbekend.push(p);
      else {
        if (!perLabel.has(l)) perLabel.set(l, []);
        perLabel.get(l).push(p);
      }
    }
    const lijst = [...perLabel.entries()].filter(([, ps]) => ps.length).map(([label, ps]) => ({ label, ps }));
    if (onbekend.length) lijst.push({ label: ONBEKEND, ps: onbekend });
    const groepen = lijst.map(({ label, ps }) => ({ label, ps, g: telGroep(ps, ctx) }));
    // Verzuim: eerst per groep, dan aanvullend verbergen (de verborgen groepen samen moeten zelf toonbaar zijn).
    if (totaalRuw.verzuim) {
      for (const x of groepen) {
        const ok = verzuimOk(x.ps, x.g.medewerkers, grens, d);
        x.verzuimVerborgen = ok.toonbaar ? null : ok.reden;
      }
      let verborgen = groepen.filter((x) => x.verzuimVerborgen);
      while (verborgen.length) {
        const samen = verborgen.flatMap((x) => x.ps);
        const ok = verzuimOk(samen, verborgen.reduce((t, x) => t + x.g.medewerkers, 0), grens, d);
        if (ok.toonbaar) break;
        const zichtbaar = groepen.filter((x) => !x.verzuimVerborgen);
        if (!zichtbaar.length) break;
        const kleinste = zichtbaar.reduce((a, b) => (b.g.medewerkers < a.g.medewerkers ? b : a));
        kleinste.verzuimVerborgen = 'complementair';
        verborgen = groepen.filter((x) => x.verzuimVerborgen);
      }
    }
    dimensies[dim] = {
      ...(ind.klassen ? { eenheid: ind.eenheid, klassen: ind.klassen.map((k) => ({ label: k.label, van: k.van, tot: k.tot })) } : {}),
      groepen: groepen.map((x) => {
        let g = x.g;
        if (g.verzuim && x.verzuimVerborgen) g = { ...g, verzuim: { toonbaar: false, reden: x.verzuimVerborgen } };
        if (g.medewerkers < d) g = alleenAantallen(g);
        return { label: x.label, ...g };
      }),
    };
  }

  // Wat niet te berekenen is.
  const ontbreekt = [];
  const mist = (sleutel, ...nodig) => { if (!nodig.some((r) => gebruikt.has(r))) ontbreekt.push(sleutel); };
  mist('fte', 'fte', 'uren');
  for (const k of ['gem_leeftijd', 'pct_55plus', 'pct_60plus']) mist(k, 'leeftijd', 'geboortedatum', 'geboortejaar');
  mist('pct_vrouw', 'geslacht');
  mist('gem_diensttijd_jaar', 'datum_in');
  mist('pct_deeltijd', 'fte', 'uren');
  mist('pct_leidinggevend', 'leidinggevend');
  mist('verzuim_pct', 'verzuimdagen', 'verzuimpercentage');
  mist('meldingsfrequentie', 'verzuimmeldingen');
  if (!gebruikt.has('verzuimmeldingen') || !(gebruikt.has('verzuimdagen') || gebruikt.has('verzuimpercentage'))) ontbreekt.push('gem_duur_per_melding');
  mist('nulverzuim_pct', 'verzuimmeldingen', 'verzuimdagen', 'verzuimpercentage');
  mist('verloop_pct', 'datum_uit');
  if (!gebruikt.has('datum_uit') || !gebruikt.has('reden_uit')) ontbreekt.push('verloop_vrijwillig_pct');
  mist('instroom_pct', 'datum_in');
  if (!gebruikt.has('datum_uit') || !gebruikt.has('datum_in')) ontbreekt.push('pct_eerste_jaar');

  const rollenUit = [...gebruikt].map((r) => (r === 'geboortedatum' || r === 'geboortejaar' ? 'leeftijd' : r));
  const aggregaat = {
    versie: VERSIE,
    naam: String(naam || 'Personeelsbestand').trim().slice(0, 100) || 'Personeelsbestand',
    periode: { van: maandTekst(vM), tot: maandTekst(tM) },
    peildatum: peildatumVan(maandTekst(tM)),
    uren_per_fte: urenPerFte,
    rollen: [...new Set(rollenUit)],
    ontbreekt,
    totaal,
    dimensies,
  };
  if (!personen.length) meldingen.push('Er is niemand gevonden die in de gekozen periode in dienst was.');
  return { aggregaat, meldingen, ontbreekt };
}

// ---------- Tonen: kengetallen met de privacyregels (PR-16) ----------

/** Verbergt in een kolom (aantallen per groep) de kleine aantallen, met aanvullend verbergen; vooraf = al verborgen. */
function kolomVerborgen(aantallen, vooraf, d) {
  const cellen = aantallen.map((n, i) => ({ n: Number.isFinite(n) ? n : 0, verborgen: !!vooraf[i] }));
  onderdrukKolom(cellen, d);
  return cellen.map((c) => c.verborgen);
}

/** Een verdeling [{ label, n, pct }] met verbergReeks (kleine aantallen weg, nullen erbij als er iets weg is). */
function verdeling(labels, aantallen, totaal, d) {
  const weg = verbergReeks(aantallen, d);
  return labels.map((label, i) => ({
    label,
    n: weg[i] ? null : aantallen[i],
    pct: weg[i] || !(totaal > 0) ? null : (aantallen[i] / totaal) * 100,
    verborgen: weg[i],
  }));
}

/**
 * De kengetallen van het personeelsbestand voor het scherm en het rapport, met de privacyregels (PR-16):
 * - organisatie: alleen bij minstens d medewerkers; aandelen (vrouw, deeltijd, 55+, verloop …) alleen als beide delen
 *   minstens d zijn (veiligAandeel); verdelingen met verbergReeks; verzuim zoals bij het inlezen bepaald;
 * - per groep: een groep met minder dan d medewerkers (en zo nodig de kleinste andere) wordt niet getoond; aandelen
 *   per groep volgen de regel voor kruistabellen; verzuim per groep zoals bij het inlezen bepaald, en niet als het aantal
 *   medewerkers van de groep verborgen is;
 * - vertrekredenen alleen voor de hele organisatie.
 * Verborgen getallen zijn null (verborgen: true); getallen zijn niet afgerond.
 */
export function personeelKpis(aggregaat, { d = DREMPEL } = {}) {
  if (!aggregaat || typeof aggregaat !== 'object') return null;
  const periode = aggregaat.periode;
  const t = aggregaat.totaal || {};
  const ontbreekt = aggregaat.ontbreekt || [];
  const kan = (k) => !ontbreekt.includes(k);
  const basis = {
    naam: aggregaat.naam, periode: { van: periode?.van, tot: periode?.tot }, peildatum: aggregaat.peildatum,
    uren_per_fte: aggregaat.uren_per_fte, ontbreekt: [...ontbreekt],
  };
  const LEEG_TOTAAL = {
    medewerkers: null, fte: null, gem_leeftijd: null, pct_55plus: null, pct_60plus: null, pct_vrouw: null, gem_diensttijd_jaar: null,
    pct_deeltijd: null, pct_leidinggevend: null, verzuim_pct: null, meldingsfrequentie: null, gem_duur_per_melding: null, nulverzuim_pct: null,
    verloop_pct: null, verloop_vrijwillig_pct: null, instroom_pct: null, pct_eerste_jaar: null, gem_aantal: null,
    geslacht: [], leeftijd: [], contract: [], verborgen: true, reden: 'klein', verzuim_reden: null,
  };
  if (!(t.medewerkers >= d) || t.klein) return { ...basis, totaal: LEEG_TOTAAL, per_groep: [], uitstroom_redenen: [] };

  const k = kengetallen(t, { periode });
  const zeker = (waarde, ok) => (ok && waarde !== null && Number.isFinite(waarde) ? waarde : null);
  const geslachtN = (t.geslacht?.Man || 0) + (t.geslacht?.Vrouw || 0) + (t.geslacht?.Anders || 0);
  const geslacht = kan('pct_vrouw')
    ? verdeling(['Man', 'Vrouw', 'Anders', ONBEKEND], [t.geslacht.Man, t.geslacht.Vrouw, t.geslacht.Anders, t.medewerkers - geslachtN], t.medewerkers, d)
    : [];
  const dimVerdeling = (dim) => {
    const dd = aggregaat.dimensies?.[dim];
    if (!dd) return [];
    return verdeling(dd.groepen.map((g) => g.label), dd.groepen.map((g) => g.medewerkers), t.medewerkers, d);
  };
  const v = t.verzuim && t.verzuim.toonbaar ? t.verzuim : null;
  const redenen = t.uitstroom_reden && kan('verloop_vrijwillig_pct')
    ? verdeling(REDEN_SLEUTELS.map((s) => REDEN_LABELS[s]), REDEN_SLEUTELS.map((s) => t.uitstroom_reden[s] || 0), t.uitstroom, d)
    : [];
  const eigenVerzoekZichtbaar = redenen.length > 0 && !redenen[0].verborgen;
  const totaal = {
    medewerkers: t.medewerkers,
    fte: zeker(t.fte, kan('fte')),
    gem_leeftijd: zeker(k.gem_leeftijd, t.leeftijd_n >= d),
    pct_55plus: zeker(k.pct_55plus, veiligAandeel(t.n_55plus, t.leeftijd_n, d)),
    pct_60plus: zeker(k.pct_60plus, veiligAandeel(t.n_60plus, t.leeftijd_n, d)),
    pct_vrouw: zeker(k.pct_vrouw, kan('pct_vrouw') && veiligAandeel(t.geslacht.Vrouw, geslachtN, d) && !geslacht[1]?.verborgen),
    gem_diensttijd_jaar: zeker(k.gem_diensttijd_jaar, t.diensttijd_n >= d),
    pct_deeltijd: zeker(k.pct_deeltijd, veiligAandeel(t.n_deeltijd, t.deeltijd_n, d)),
    pct_leidinggevend: zeker(k.pct_leidinggevend, veiligAandeel(t.n_leidinggevend, t.leidinggevend_n, d)),
    verzuim_pct: zeker(k.verzuim_pct, !!v),
    meldingsfrequentie: zeker(k.meldingsfrequentie, !!v),
    gem_duur_per_melding: zeker(k.gem_duur_per_melding, !!v),
    nulverzuim_pct: zeker(k.nulverzuim_pct, !!v && veiligAandeel(v.n_nulverzuim, v.n_hele_periode, d)),
    verloop_pct: zeker(k.verloop_pct, kan('verloop_pct') && veiligAandeel(t.uitstroom, t.in_periode, d)),
    verloop_vrijwillig_pct: zeker(k.verloop_vrijwillig_pct, eigenVerzoekZichtbaar && veiligAandeel(t.uitstroom_reden.eigen_verzoek, t.in_periode, d)),
    instroom_pct: zeker(k.instroom_pct, kan('instroom_pct') && veiligAandeel(t.instroom, t.in_periode, d)),
    pct_eerste_jaar: zeker(k.pct_eerste_jaar, kan('pct_eerste_jaar') && veiligAandeel(t.uitstroom_eerste_jaar, t.uitstroom, d)),
    gem_aantal: zeker(k.gem_aantal, t.begin >= d),
    geslacht,
    leeftijd: dimVerdeling('leeftijd'),
    contract: dimVerdeling('contract'),
    verborgen: false,
    reden: null,
    verzuim_reden: t.verzuim && !t.verzuim.toonbaar ? t.verzuim.reden : null,
  };

  // Per groep van elke indeling.
  const per_groep = [];
  for (const [dim, dd] of Object.entries(aggregaat.dimensies || {})) {
    const gs = dd.groepen || [];
    if (!gs.length) continue;
    const groepWeg = kolomVerborgen(gs.map((g) => g.medewerkers), gs.map(() => false), d).map((w, i) => w || !!gs[i].klein);
    const leeftijdWeg = kolomVerborgen(gs.map((g) => g.leeftijd_n ?? 0), groepWeg, d);
    // Aandelen per groep: kruistabelregel (nullen tellen als klein), met de verborgen groepen vooraf verborgen.
    // Van een kleine groep zijn alleen de aantallen bewaard: die cellen tellen als 0 en zijn vooraf verborgen (dat is
    // voorzichtig: er wordt dan eerder te veel dan te weinig verborgen).
    const kruis = (a, b) => {
      const tabel = gs.map((g) => [Math.max(0, a(g) || 0), Math.max(0, b(g) || 0)]);
      const weg = maskeer([tabel], d, gs.map((_, i) => [groepWeg[i], groepWeg[i]]));
      return weg.map((rij) => rij[0] || rij[1]);
    };
    const vrouwWeg = kan('pct_vrouw')
      ? kruis((g) => g.geslacht?.Vrouw ?? 0, (g) => (g.geslacht ? g.geslacht.Man + g.geslacht.Anders : 0))
      : gs.map(() => true);
    const verloopWeg = kan('verloop_pct') ? kruis((g) => g.uitstroom ?? 0, (g) => (g.in_periode ?? 0) - (g.uitstroom ?? 0)) : gs.map(() => true);
    per_groep.push({
      dimensie: dim,
      dimensie_naam: DIMENSIES[dim] || dim,
      rijen: gs.map((g, i) => {
        if (groepWeg[i] || g.klein) {
          return { label: g.label, medewerkers: null, fte: null, gem_leeftijd: null, pct_vrouw: null, verzuim_pct: null, meldingsfrequentie: null, verloop_pct: null, verborgen: true, reden: 'klein' };
        }
        const kg = kengetallen(g, { periode });
        const gv = g.verzuim && g.verzuim.toonbaar ? g.verzuim : null;
        const vrouwN = g.geslacht ? g.geslacht.Man + g.geslacht.Vrouw + g.geslacht.Anders : 0;
        return {
          label: g.label,
          medewerkers: g.medewerkers,
          fte: zeker(g.fte, kan('fte')),
          gem_leeftijd: zeker(kg.gem_leeftijd, !leeftijdWeg[i] && g.leeftijd_n >= d),
          pct_vrouw: zeker(kg.pct_vrouw, !vrouwWeg[i] && vrouwN > 0),
          verzuim_pct: zeker(kg.verzuim_pct, !!gv),
          meldingsfrequentie: zeker(kg.meldingsfrequentie, !!gv),
          verloop_pct: zeker(kg.verloop_pct, !verloopWeg[i]),
          verborgen: false,
          reden: g.verzuim && !g.verzuim.toonbaar ? g.verzuim.reden : null,
        };
      }),
    });
  }
  return { ...basis, totaal, per_groep, uitstroom_redenen: redenen.map((r) => ({ label: r.label, aantal: r.n, verborgen: r.verborgen })) };
}

// ---------- Populatie per antwoordmogelijkheid ----------

/**
 * Het aantal medewerkers (op de peildatum) per antwoordmogelijkheid van een achtergrondvraag, uit het aggregaat:
 * { [optie-id | 'ja' | 'nee']: aantal }, of null als dat niet zeker uit het bestand volgt.
 * - Indelingen in klassen (leeftijd, diensttijd, uren): elke mogelijkheid (behalve "Dat zeg ik liever niet") moet
 *   precies uit hele klassen bestaan (klasseVan); anders null (dan vul je de aantallen zelf in).
 * - Andere indelingen: de groep met dezelfde naam (na normaal()); een mogelijkheid zonder groep heeft 0
 *   medewerkers. Komt geen enkele mogelijkheid overeen, dan null.
 * "Dat zeg ik liever niet" en "Onbekend" krijgen geen aantal.
 */
export function populatieVoorVraag(aggregaat, vraag) {
  const dim = DIMENSIE_VAN_KENMERK[vraag?.kenmerk];
  const dd = aggregaat?.dimensies?.[dim];
  if (!dd || !Array.isArray(dd.groepen)) return null;
  const opties = optiesVan(vraag).filter((o) => o && !isLieverNiet(o.label));
  if (!opties.length) return null;
  const groepen = dd.groepen.filter((g) => g.label !== ONBEKEND);
  const uit = {};
  if (KLASSEN[dim]) {
    const klassen = new Map((dd.klassen || []).map((k) => [k.label, k]));
    const metGrens = groepen.map((g) => ({ g, k: klassen.get(g.label) })).filter((x) => x.k);
    for (const o of opties) {
      const k = optieKlasse(dim, o);
      if (!k) return null;
      // Past elke klasse helemaal binnen of helemaal buiten de mogelijkheid?
      let som = 0;
      for (const c of dd.klassen || []) {
        const binnen = (k.van === null || (c.van !== null && c.van >= k.van)) && (k.tot === null || (c.tot !== null && c.tot <= k.tot));
        const buiten = (k.tot !== null && c.van !== null && c.van >= k.tot) || (k.van !== null && c.tot !== null && c.tot <= k.van);
        if (!binnen && !buiten) return null;
        if (binnen) som += metGrens.find((x) => x.k.label === c.label)?.g.medewerkers || 0;
      }
      uit[o.id] = som;
    }
    return uit;
  }
  let gevonden = 0;
  for (const o of opties) {
    const g = groepen.find((x) => normaal(x.label) === normaal(o.label));
    if (g) gevonden++;
    uit[o.id] = g ? g.medewerkers : 0;
  }
  return gevonden ? uit : null;
}

/** Groepen uit het bestand die bij geen antwoordmogelijkheid horen: [{ label, medewerkers }] (voor een melding). */
export function ongekoppeldeGroepen(aggregaat, vraag) {
  const dim = DIMENSIE_VAN_KENMERK[vraag?.kenmerk];
  const dd = aggregaat?.dimensies?.[dim];
  if (!dd || KLASSEN[dim]) return [];
  const labels = new Set(optiesVan(vraag).map((o) => normaal(o.label)));
  return dd.groepen.filter((g) => g.label !== ONBEKEND && !labels.has(normaal(g.label))).map((g) => ({ label: g.label, medewerkers: g.medewerkers }));
}
