// Controle van HR-analytics op de server (BOUWPLAN §3.4 en §3.5, D1 §6.3, PR-16).
// - controleerHrInstellingen: de instellingen van een onderzoek (uitkomst, signalen, aantallen medewerkers,
//   personeelsbestand, benchmarks). Geeft een schoon object terug; alles wat er niet in hoort, geeft een 400.
// - controleerPersoneelsaggregaat: de groepscijfers van een personeelsbestand. Alleen een vaste vorm mag (geen
//   onbekende velden, dus ook geen rijen, namen of datums per medewerker), met de vaste verbanden tussen de aantallen
//   (PR-16): verzuim alleen bij minstens 10 medewerkers, van een groep onder de 5 alleen de aantallen, elke indeling
//   telt samen op tot de hele organisatie. Wordt opnieuw opgebouwd uit wat is toegestaan.
// Rekentijd: alles is O(grootte van het verzoek) en zonder database.

import { Fout } from './http.js';
import { DREMPEL } from '../../public/js/beheer/privacy.js';
import {
  ROLLEN, DIMENSIES, KLASSEN, KENGETALLEN, REDEN_SLEUTELS, MIN_VERZUIM, MAX_MAANDEN, MAX_GROEPEN, ONBEKEND, ZWANGERSCHAPSVERLOF, maandNr, peildatumVan, periodeDagen,
} from '../../public/js/beheer/personeel-regels.js';

export const MAX_INSTELLINGEN = 100_000; // tekens (JSON)
export const MAX_AGGREGAAT = 200_000;
export const MAX_SIGNALEN = 30;
export const MAX_BENCHMARKS = 30;
export const MAX_POPULATIE_VRAGEN = 20;
export const MAX_POPULATIE_OPTIES = 31;
export const BENCHMARK_SLEUTEL = /^(verzuim_pct|verloop_pct|respons_pct|enps|t:\d{1,15}|v:\d{1,15})$/;
const SLEUTEL = /^[tv]:\d{1,15}$/;
const OPTIE = /^[A-Za-z0-9_-]{1,40}$/;
const CITEERSLEUTEL = /^[a-z][a-z0-9]{1,39}$/;
const MAAND = /^\d{4}-\d{2}$/;

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const fout = (melding) => new Fout(400, melding);
const alleen = (obj, toegestaan, wat) => {
  for (const k of Object.keys(obj)) if (!toegestaan.includes(k)) throw fout(`${wat} bevat een onbekend veld: "${String(k).slice(0, 40)}".`);
};
const schoon = (t) => String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

// ---------- HR-instellingen ----------

/** Controleert HrInstellingen v1 en geeft een schoon object terug (alleen de velden die er mogen zijn). */
export function controleerHrInstellingen(inhoud) {
  if (!isObject(inhoud)) throw fout('De HR-instellingen zijn ongeldig.');
  alleen(inhoud, ['versie', 'uitkomst', 'signalen', 'populatie', 'personeel', 'benchmarks'], 'De HR-instellingen');
  if (inhoud.versie !== undefined && inhoud.versie !== 1) throw fout('Onbekende versie van de HR-instellingen.');
  const uit = { versie: 1 };

  if (inhoud.uitkomst !== undefined && inhoud.uitkomst !== null) {
    if (!isObject(inhoud.uitkomst)) throw fout('Kies een geldige uitkomst.');
    alleen(inhoud.uitkomst, ['sleutel'], 'De uitkomst');
    if (typeof inhoud.uitkomst.sleutel !== 'string' || !SLEUTEL.test(inhoud.uitkomst.sleutel)) throw fout('Kies een geldige uitkomst.');
    uit.uitkomst = { sleutel: inhoud.uitkomst.sleutel };
  }

  if (inhoud.signalen !== undefined) {
    if (!Array.isArray(inhoud.signalen)) throw fout('De signalen moeten een lijst zijn.');
    if (inhoud.signalen.length > MAX_SIGNALEN) throw fout(`Er kunnen hooguit ${MAX_SIGNALEN} signalen zijn.`);
    uit.signalen = inhoud.signalen.map((s, i) => {
      const nr = i + 1;
      if (!isObject(s)) throw fout(`Signaal ${nr} is ongeldig.`);
      alleen(s, ['sleutel', 'ongunstig', 'grens'], `Signaal ${nr}`);
      if (typeof s.sleutel !== 'string' || !SLEUTEL.test(s.sleutel)) throw fout(`Signaal ${nr}: kies een geldige vraag of een geldig thema.`);
      if (!Array.isArray(s.ongunstig) || !s.ongunstig.length || s.ongunstig.length > MAX_POPULATIE_OPTIES) throw fout(`Signaal ${nr}: kies welke antwoorden ongunstig zijn.`);
      const ongunstig = s.ongunstig.map((o) => {
        if (Number.isInteger(o) && o >= 0 && o <= 10) return o;
        if (typeof o === 'string' && (o === 'ja' || o === 'nee' || OPTIE.test(o))) return o;
        throw fout(`Signaal ${nr}: een ongunstig antwoord is ongeldig.`);
      });
      if (new Set(ongunstig.map(String)).size !== ongunstig.length) throw fout(`Signaal ${nr}: een ongunstig antwoord staat er dubbel in.`);
      if (!Number.isInteger(s.grens) || s.grens < 1 || s.grens > 100) throw fout(`Signaal ${nr}: de grens moet een heel getal van 1 tot en met 100 zijn.`);
      return { sleutel: s.sleutel, ongunstig, grens: s.grens };
    });
  }

  if (inhoud.populatie !== undefined) {
    if (!isObject(inhoud.populatie)) throw fout('De aantallen medewerkers zijn ongeldig.');
    const vragen = Object.entries(inhoud.populatie);
    if (vragen.length > MAX_POPULATIE_VRAGEN) throw fout(`Aantallen medewerkers kunnen bij hooguit ${MAX_POPULATIE_VRAGEN} vragen.`);
    uit.populatie = {};
    for (const [vraagId, opties] of vragen) {
      if (!/^\d{1,15}$/.test(vraagId) || !isObject(opties)) throw fout('De aantallen medewerkers zijn ongeldig.');
      const lijst = Object.entries(opties);
      if (lijst.length > MAX_POPULATIE_OPTIES) throw fout('Te veel antwoordmogelijkheden bij de aantallen medewerkers.');
      const schoonOpties = {};
      for (const [optie, n] of lijst) {
        if (!OPTIE.test(optie)) throw fout('De aantallen medewerkers zijn ongeldig.');
        if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw fout('Een aantal medewerkers moet een heel getal van 0 tot 1.000.000 zijn.');
        schoonOpties[optie] = n;
      }
      uit.populatie[vraagId] = schoonOpties;
    }
  }

  if (inhoud.personeel !== undefined && inhoud.personeel !== null) {
    if (!isObject(inhoud.personeel)) throw fout('Kies een geldig personeelsbestand.');
    alleen(inhoud.personeel, ['id'], 'Het personeelsbestand');
    if (!Number.isInteger(inhoud.personeel.id) || inhoud.personeel.id <= 0) throw fout('Kies een geldig personeelsbestand.');
    uit.personeel = { id: inhoud.personeel.id };
  }

  if (inhoud.benchmarks !== undefined) {
    if (!Array.isArray(inhoud.benchmarks)) throw fout('De vergelijkingscijfers moeten een lijst zijn.');
    if (inhoud.benchmarks.length > MAX_BENCHMARKS) throw fout(`Er kunnen hooguit ${MAX_BENCHMARKS} vergelijkingscijfers zijn.`);
    uit.benchmarks = inhoud.benchmarks.map((b, i) => {
      const nr = i + 1;
      if (!isObject(b)) throw fout(`Vergelijkingscijfer ${nr} is ongeldig.`);
      alleen(b, ['sleutel', 'waarde', 'omschrijving', 'citeersleutel'], `Vergelijkingscijfer ${nr}`);
      if (typeof b.sleutel !== 'string' || !BENCHMARK_SLEUTEL.test(b.sleutel)) throw fout(`Vergelijkingscijfer ${nr}: kies waarmee je vergelijkt.`);
      if (typeof b.waarde !== 'number' || !Number.isFinite(b.waarde) || Math.abs(b.waarde) > 1_000_000) throw fout(`Vergelijkingscijfer ${nr}: vul een getal in.`);
      const omschrijving = b.omschrijving === undefined || b.omschrijving === null ? '' : b.omschrijving;
      if (typeof omschrijving !== 'string' || schoon(omschrijving).length > 120) throw fout(`Vergelijkingscijfer ${nr}: de omschrijving is hooguit 120 tekens.`);
      const citeersleutel = b.citeersleutel === undefined || b.citeersleutel === null ? '' : b.citeersleutel;
      if (typeof citeersleutel !== 'string' || (citeersleutel !== '' && !CITEERSLEUTEL.test(citeersleutel))) throw fout(`Vergelijkingscijfer ${nr}: de bron is ongeldig.`);
      return { sleutel: b.sleutel, waarde: b.waarde, omschrijving: schoon(omschrijving), citeersleutel };
    });
  }

  if (JSON.stringify(uit).length > MAX_INSTELLINGEN) throw fout('De HR-instellingen zijn te groot (hooguit 100 KB).');
  return uit;
}

// ---------- Personeelsaggregaat ----------

const TELLERS = ['medewerkers', 'in_periode', 'begin', 'instroom', 'uitstroom', 'leeftijd_som', 'leeftijd_n', 'n_55plus', 'n_60plus',
  'diensttijd_maanden_som', 'diensttijd_n', 'n_deeltijd', 'deeltijd_n', 'n_leidinggevend', 'leidinggevend_n'];
const GROEP_VELDEN = [...TELLERS, 'fte', 'geslacht', 'verzuim'];
const TOTAAL_VELDEN = [...GROEP_VELDEN, 'uitstroom_reden', 'uitstroom_eerste_jaar'];
const VERZUIM_VELDEN = ['toonbaar', 'dagen_fte', 'beschikbaar_fte', 'beschikbaar', 'meldingen', 'dagen', 'n_hele_periode', 'n_nulverzuim'];
const VERZUIM_REDENEN = ['klein', 'dominant', 'complementair'];
const MAG_ROL = Object.keys(ROLLEN).filter((r) => r !== 'geboortedatum' && r !== 'geboortejaar');
const BIJNA = 1e-6; // afronding van sommen met fte

function geheel(w, wat) {
  if (!Number.isInteger(w) || w < 0 || w > 10_000_000) throw fout(`Personeelscijfers: ${wat} moet een heel getal van 0 of meer zijn.`);
  return w;
}
function getalOfNull(w, wat) {
  if (w === null) return null;
  if (typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 1e9) throw fout(`Personeelscijfers: ${wat} is ongeldig.`);
  return w;
}
const regel = (ok, melding) => { if (!ok) throw fout(`Personeelscijfers: ${melding}`); };

/** Eén groep (of de hele organisatie). totaal: met vertrekredenen; metVerzuim: of er verzuimgegevens zijn. */
function controleerGroep(g, { totaal, wat, metVerzuim, dagenPeriode }) {
  if (!isObject(g)) throw fout(`Personeelscijfers: ${wat} is ongeldig.`);
  if (g.klein === true) {
    // Een groep onder de 5: alleen de aantallen.
    alleen(g, totaal ? ['medewerkers', 'in_periode', 'klein', 'verzuim'] : ['label', 'medewerkers', 'in_periode', 'klein', 'verzuim'], `Personeelscijfers (${wat})`);
    const uit = { medewerkers: geheel(g.medewerkers, 'medewerkers'), in_periode: geheel(g.in_periode, 'in de periode') };
    regel(uit.medewerkers < DREMPEL, `van ${wat} met ${uit.medewerkers} medewerkers horen alle cijfers erbij.`);
    regel(uit.medewerkers <= uit.in_periode, `${wat} heeft meer medewerkers op de peildatum dan in de periode.`);
    uit.klein = true;
    if (metVerzuim) {
      regel(isObject(g.verzuim) && g.verzuim.toonbaar === false && g.verzuim.reden === 'klein', `${wat} is te klein voor verzuimcijfers.`);
      uit.verzuim = { toonbaar: false, reden: 'klein' };
    } else {
      regel(g.verzuim === null || g.verzuim === undefined, `${wat} heeft verzuimcijfers zonder verzuimkolom.`);
      uit.verzuim = null;
    }
    return uit;
  }
  alleen(g, totaal ? TOTAAL_VELDEN : ['label', ...GROEP_VELDEN], `Personeelscijfers (${wat})`);
  const uit = {};
  for (const t of TELLERS) uit[t] = geheel(g[t], t);
  uit.fte = getalOfNull(g.fte ?? null, 'fte');
  if (!isObject(g.geslacht)) throw fout(`Personeelscijfers: ${wat} mist het geslacht.`);
  alleen(g.geslacht, ['Man', 'Vrouw', 'Anders'], `Personeelscijfers (geslacht van ${wat})`);
  uit.geslacht = { Man: geheel(g.geslacht.Man, 'man'), Vrouw: geheel(g.geslacht.Vrouw, 'vrouw'), Anders: geheel(g.geslacht.Anders, 'anders') };
  const n = uit.medewerkers;
  regel(n >= DREMPEL, `van ${wat} (minder dan ${DREMPEL} medewerkers) mogen alleen de aantallen mee.`);
  regel(n <= uit.in_periode && uit.begin <= uit.in_periode && uit.instroom <= uit.in_periode && uit.uitstroom <= uit.in_periode, `de aantallen van ${wat} kloppen niet met elkaar.`);
  regel(uit.leeftijd_n <= n && uit.n_55plus <= uit.leeftijd_n && uit.n_60plus <= uit.n_55plus, `de leeftijden van ${wat} kloppen niet.`);
  regel(uit.leeftijd_som >= 14 * uit.leeftijd_n && uit.leeftijd_som <= 100 * uit.leeftijd_n, `de leeftijden van ${wat} kloppen niet.`);
  regel(uit.diensttijd_n <= n && uit.diensttijd_maanden_som <= 1200 * uit.diensttijd_n, `de diensttijd van ${wat} klopt niet.`);
  regel(uit.n_deeltijd <= uit.deeltijd_n && uit.deeltijd_n <= n, `de deeltijd van ${wat} klopt niet.`);
  regel(uit.n_leidinggevend <= uit.leidinggevend_n && uit.leidinggevend_n <= n, `het aantal leidinggevenden van ${wat} klopt niet.`);
  regel(uit.geslacht.Man + uit.geslacht.Vrouw + uit.geslacht.Anders <= n, `het geslacht van ${wat} klopt niet.`);
  regel(uit.fte === null || uit.fte <= 1.5 * n + BIJNA, `de fte van ${wat} klopt niet.`);
  if (totaal) {
    if (!isObject(g.uitstroom_reden)) throw fout('Personeelscijfers: de redenen van vertrek ontbreken.');
    alleen(g.uitstroom_reden, REDEN_SLEUTELS, 'Personeelscijfers (redenen van vertrek)');
    uit.uitstroom_reden = Object.fromEntries(REDEN_SLEUTELS.map((r) => [r, geheel(g.uitstroom_reden[r], `vertrek (${r})`)]));
    regel(REDEN_SLEUTELS.reduce((s, r) => s + uit.uitstroom_reden[r], 0) === uit.uitstroom, 'de redenen van vertrek tellen niet op tot het aantal vertrekkers.');
    uit.uitstroom_eerste_jaar = geheel(g.uitstroom_eerste_jaar, 'vertrek in het eerste jaar');
    regel(uit.uitstroom_eerste_jaar <= uit.uitstroom, 'het vertrek in het eerste jaar klopt niet.');
  }
  if (!metVerzuim) {
    regel(g.verzuim === null || g.verzuim === undefined, `${wat} heeft verzuimcijfers zonder verzuimkolom.`);
    uit.verzuim = null;
    return uit;
  }
  const v = g.verzuim;
  if (!isObject(v)) throw fout(`Personeelscijfers: het verzuim van ${wat} ontbreekt.`);
  if (v.toonbaar === false) {
    alleen(v, ['toonbaar', 'reden'], `Personeelscijfers (verzuim van ${wat})`);
    regel(VERZUIM_REDENEN.includes(v.reden), `het verzuim van ${wat} is ongeldig.`);
    uit.verzuim = { toonbaar: false, reden: v.reden };
    return uit;
  }
  regel(v.toonbaar === true, `het verzuim van ${wat} is ongeldig.`);
  alleen(v, VERZUIM_VELDEN, `Personeelscijfers (verzuim van ${wat})`);
  // PR-16: verzuim alleen van een groep met minstens 10 medewerkers.
  regel(n >= MIN_VERZUIM, `verzuim van ${wat} met minder dan ${MIN_VERZUIM} medewerkers mag niet worden bewaard.`);
  const s = {
    toonbaar: true,
    dagen_fte: getalOfNull(v.dagen_fte ?? null, 'verzuimdagen'),
    beschikbaar_fte: getalOfNull(v.beschikbaar_fte, 'beschikbare dagen'),
    beschikbaar: geheel(v.beschikbaar, 'beschikbare dagen'),
    meldingen: v.meldingen === null ? null : geheel(v.meldingen, 'meldingen'),
    dagen: getalOfNull(v.dagen ?? null, 'verzuimdagen'),
    n_hele_periode: geheel(v.n_hele_periode, 'hele periode in dienst'),
    n_nulverzuim: geheel(v.n_nulverzuim, 'nulverzuim'),
  };
  regel(s.beschikbaar_fte !== null && s.beschikbaar <= uit.in_periode * dagenPeriode, `de beschikbare dagen van ${wat} kloppen niet.`);
  regel(s.dagen === null || s.dagen <= s.beschikbaar + BIJNA, `${wat} heeft meer verzuimdagen dan beschikbare dagen.`);
  regel(s.dagen_fte === null || s.dagen_fte <= s.beschikbaar_fte + BIJNA, `${wat} heeft meer verzuimdagen dan beschikbare dagen.`);
  regel(s.n_nulverzuim <= s.n_hele_periode && s.n_hele_periode <= uit.in_periode, `het nulverzuim van ${wat} klopt niet.`);
  regel(s.meldingen === null || s.meldingen <= 50 * uit.in_periode, `het aantal meldingen van ${wat} klopt niet.`);
  uit.verzuim = s;
  return uit;
}

/**
 * Controleert een Personeelsaggregaat v1 (BOUWPLAN §3.5) en bouwt het opnieuw op uit de toegestane velden.
 * Gooit een Fout(400) met een Nederlandse melding bij elk onbekend veld of elk verband dat niet klopt.
 */
export function controleerPersoneelsaggregaat(a) {
  if (!isObject(a)) throw fout('De personeelscijfers zijn ongeldig.');
  alleen(a, ['versie', 'naam', 'periode', 'peildatum', 'uren_per_fte', 'rollen', 'ontbreekt', 'totaal', 'dimensies', 'zwangerschapsverlof'], 'De personeelscijfers');
  regel(a.versie === 1, 'onbekende versie.');
  regel(typeof a.naam === 'string' && schoon(a.naam).length >= 1 && schoon(a.naam).length <= 100, 'geef het bestand een naam (hooguit 100 tekens).');
  if (!isObject(a.periode)) throw fout('Personeelscijfers: de periode ontbreekt.');
  alleen(a.periode, ['van', 'tot'], 'De periode');
  const vM = MAAND.test(a.periode.van ?? '') ? maandNr(a.periode.van) : null;
  const tM = MAAND.test(a.periode.tot ?? '') ? maandNr(a.periode.tot) : null;
  regel(vM !== null && tM !== null && vM <= tM, 'de periode is ongeldig (JJJJ-MM, de eerste maand niet na de laatste).');
  regel(tM - vM + 1 <= MAX_MAANDEN, `een periode is hooguit ${MAX_MAANDEN} maanden.`);
  regel(a.peildatum === peildatumVan(a.periode.tot), 'de peildatum moet de laatste dag van de periode zijn.');
  regel(typeof a.uren_per_fte === 'number' && a.uren_per_fte >= 1 && a.uren_per_fte <= 60, 'uren per fte moet tussen 1 en 60 liggen.');
  regel(Array.isArray(a.rollen) && a.rollen.length <= MAG_ROL.length && a.rollen.every((r) => MAG_ROL.includes(r)) && new Set(a.rollen).size === a.rollen.length, 'onbekende kolommen.');
  regel(Array.isArray(a.ontbreekt) && a.ontbreekt.every((k) => Object.hasOwn(KENGETALLEN, k)) && new Set(a.ontbreekt).size === a.ontbreekt.length, 'onbekende kengetallen.');
  const rollen = new Set(a.rollen);
  const metVerzuim = rollen.has('verzuimdagen') || rollen.has('verzuimpercentage') || rollen.has('verzuimmeldingen');
  const dagenPeriode = periodeDagen(a.periode);
  const totaal = controleerGroep(a.totaal, { totaal: true, wat: 'de organisatie', metVerzuim, dagenPeriode });

  if (!isObject(a.dimensies)) throw fout('Personeelscijfers: de indelingen ontbreken.');
  const dimensies = {};
  for (const [dim, dd] of Object.entries(a.dimensies)) {
    regel(Object.hasOwn(DIMENSIES, dim), `onbekende indeling "${String(dim).slice(0, 40)}".`);
    if (!isObject(dd)) throw fout(`Personeelscijfers: de indeling ${DIMENSIES[dim]} is ongeldig.`);
    const klassen = KLASSEN[dim];
    alleen(dd, klassen ? ['eenheid', 'klassen', 'groepen'] : ['groepen'], `De indeling ${DIMENSIES[dim]}`);
    const uitDim = {};
    let labels = null;
    if (klassen) {
      regel(dd.eenheid === klassen.eenheid, `de eenheid van ${DIMENSIES[dim]} is ongeldig.`);
      regel(Array.isArray(dd.klassen) && dd.klassen.length >= 1 && dd.klassen.length <= 30, `de klassen van ${DIMENSIES[dim]} zijn ongeldig.`);
      uitDim.eenheid = klassen.eenheid;
      uitDim.klassen = dd.klassen.map((k) => {
        if (!isObject(k)) throw fout(`Personeelscijfers: een klasse van ${DIMENSIES[dim]} is ongeldig.`);
        alleen(k, ['label', 'van', 'tot'], `Een klasse van ${DIMENSIES[dim]}`);
        const grens = (x) => x === null || (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 2000);
        regel(typeof k.label === 'string' && k.label.length >= 1 && k.label.length <= 100 && grens(k.van) && grens(k.tot) && (k.van === null || k.tot === null || k.van < k.tot), `een klasse van ${DIMENSIES[dim]} is ongeldig.`);
        return { label: schoon(k.label), van: k.van, tot: k.tot };
      });
      labels = new Set([...uitDim.klassen.map((k) => k.label), ONBEKEND]);
    }
    regel(Array.isArray(dd.groepen) && dd.groepen.length <= MAX_GROEPEN + 1, `${DIMENSIES[dim]} heeft te veel groepen.`);
    const gezien = new Set();
    uitDim.groepen = dd.groepen.map((g) => {
      const label = isObject(g) && typeof g.label === 'string' ? schoon(g.label) : '';
      regel(label.length >= 1 && label.length <= 100, `een groep van ${DIMENSIES[dim]} heeft geen geldige naam.`);
      regel(!gezien.has(label), `de groep "${label.slice(0, 40)}" staat dubbel bij ${DIMENSIES[dim]}.`);
      regel(!labels || labels.has(label), `de groep "${label.slice(0, 40)}" past niet bij de klassen van ${DIMENSIES[dim]}.`);
      gezien.add(label);
      return { label, ...controleerGroep(g, { totaal: false, wat: `de groep "${label.slice(0, 40)}"`, metVerzuim, dagenPeriode }) };
    });
    // Elke indeling verdeelt dezelfde mensen (met "Onbekend" voor wie geen waarde heeft).
    const som = (veld) => uitDim.groepen.reduce((s, g) => s + g[veld], 0);
    regel(som('in_periode') === totaal.in_periode && som('medewerkers') === totaal.medewerkers, `de groepen van ${DIMENSIES[dim]} tellen niet op tot de hele organisatie.`);
    // Verzuim aanvullend verborgen: zijn er groepen zonder en groepen met verzuim, dan tellen die zonder samen minstens 10.
    if (metVerzuim) {
      const zonder = uitDim.groepen.filter((g) => !g.verzuim?.toonbaar);
      const met = uitDim.groepen.filter((g) => g.verzuim?.toonbaar);
      regel(!zonder.length || !met.length || zonder.reduce((s, g) => s + g.medewerkers, 0) >= MIN_VERZUIM, `het verzuim van ${DIMENSIES[dim]} is niet aanvullend afgeschermd.`);
    }
    dimensies[dim] = uitDim;
  }
  const uit = {
    versie: 1, naam: schoon(a.naam), periode: { van: a.periode.van, tot: a.periode.tot }, peildatum: a.peildatum, uren_per_fte: a.uren_per_fte,
    rollen: [...a.rollen], ontbreekt: [...a.ontbreekt], totaal, dimensies,
  };
  // Optioneel, alleen bij verzuimgegevens: telden zwangerschaps- en bevallingsverlof mee (een vaste keuze, geen vrije tekst).
  if (a.zwangerschapsverlof !== undefined && a.zwangerschapsverlof !== null) {
    regel(typeof a.zwangerschapsverlof === 'string' && Object.hasOwn(ZWANGERSCHAPSVERLOF, a.zwangerschapsverlof), 'ongeldig antwoord bij zwangerschaps- en bevallingsverlof.');
    regel(rollen.has('verzuimdagen') || rollen.has('verzuimpercentage'), 'zwangerschaps- en bevallingsverlof zonder verzuimkolom.');
    uit.zwangerschapsverlof = a.zwangerschapsverlof;
  }
  if (JSON.stringify(uit).length > MAX_AGGREGAAT) throw new Fout(413, 'De personeelscijfers zijn te groot.');
  return uit;
}
