// Werkbank: gedeelde bouwstenen voor de procedures. Zuivere module, geen DOM.
// Elke procedure krijgt (ds, spec, ctx) met ctx = { d, selectie (of null), streng, nu, voortgang, pauze }:
// - ds: de dataset (dataset.js + transformaties.js);
// - selectie: { F, buren, tekst } van de gekozen selectie (regel D), of null voor iedereen;
// - streng: true bij het vastleggen in een rapport: dan worden ook bij meningsvragen zonder selectie de aantallen
//   1 tot 4 verborgen (B26 geldt alleen op het eigen scherm), zodat kleinste_n altijd minstens 5 is;
// - pauze(): geeft de browser even de tijd (en stopt bij "Stoppen"); voortgang(tekst) meldt hoe ver het is.

import { REDEN, isGetal, isAchtergrond, isIndeling, getalWeergave } from '../dataset.js';
import { PROCEDURES as SLOTS } from '../definities.js';
import { verdeelInGroepen, verbergReeks, onderdrukAlles, onderdrukKolom, maskeer, DREMPEL } from '../../privacy.js';
import { selectieFout, telTabel, buurTabellen } from '../privacy-selectie.js';
import { controleerWortels, P_FILTER_REST, pFilterBuur, wortelVan } from '../transformaties.js';
import { maakUitvoer, geweigerd, melding } from '../uitvoer.js';
import { P_INDELING_ALS_GETAL, P_ORDINAAL, P_OPEN, P_LIJST_BUUR, P_LIEVER_NIET_SELECTIE, P_SPREIDING_ANALYSE_SELECTIE } from '../uitvoer-tekst.js';

/** 1 = rij heeft op alle variabelen een geldige waarde. */
export function geldigMasker(ds, variabelen) {
  const m = new Uint8Array(ds.n).fill(1);
  for (const v of variabelen) for (let r = 0; r < ds.n; r++) if (v.reden[r] !== REDEN.GELDIG) m[r] = 0;
  return m;
}

/** Rijen die in de basis en in de selectie zitten. */
export function inSelectie(basis, selectie) {
  if (!selectie) return basis;
  const m = new Uint8Array(basis.length);
  for (let r = 0; r < basis.length; r++) m[r] = basis[r] && selectie.F[r] ? 1 : 0;
  return m;
}

export const iedereen = (ds) => new Uint8Array(ds.n).fill(1);
export const tel = (m) => { let n = 0; for (let r = 0; r < m.length; r++) if (m[r]) n++; return n; };

/**
 * Per rij het nummer van de beschermde groep van indeling v (−1 = geen geldige waarde of geen groep).
 * Wie een achtergrondvraag oversloeg, hoort bij de groep waarin "Niet ingevuld" is samengevoegd (zoals op het
 * dashboard); zo zijn de groepen van de werkbank precies die van het dashboard (PR-05).
 */
export function groepVanRijen(ds, v) {
  const index = new Map(v.labels.map((l, i) => [l.code, i]));
  const groep = new Int32Array(ds.n).fill(-1);
  const leeg = v.beschermd?.leegGroep ?? -1;
  for (let r = 0; r < ds.n; r++) {
    if (v.reden[r] !== REDEN.GELDIG) {
      if (leeg >= 0 && v.reden[r] === REDEN.GEEN) groep[r] = leeg;
      continue;
    }
    const i = index.get(v.waarden[r]);
    if (i !== undefined) groep[r] = v.beschermd.groepVan[i];
  }
  return groep;
}

/**
 * Welke groepen meedoen (strategie 'weglaten' van privacy.js): groepen onder d doen niet mee, en ook groepen die
 * door een andere regel (D, B6, B7, het dashboard) niet getoond mogen worden; telt wat verborgen blijft samen 1 tot
 * d − 1, dan gaat ook de kleinste meedoende groep eruit.
 * Is er maar één verborgen deel, en is dat een groep die om een andere regel niet getoond wordt (dus zelf minstens d
 * groot), dan volgt die groep uit het totaal min de getoonde groepen. Dan gaat ook de kleinste meedoende groep eruit:
 * verborgen groepen zijn samen altijd minstens d en nooit los te zien (P1, P2).
 * @returns {{ mee: number[], klein: number[], ookNiet: number[], uitgesloten: number[] }}
 */
export function kiesGroepen(aantallen, { extraVerborgen = 0, uitgesloten = [], d = DREMPEL } = {}) {
  const extra = extraVerborgen + aantallen.reduce((t, n, i) => t + (uitgesloten[i] ? n : 0), 0);
  const kandidaten = aantallen.map((n, i) => ({ sleutel: i, label: String(i), n })).filter((g) => !uitgesloten[g.sleutel]);
  const r = verdeelInGroepen(kandidaten, { d, strategie: 'weglaten', extraVerborgen: extra });
  const mee = r.zichtbaar.map((z) => z.sleutel);
  const klein = r.weggelaten.filter((w) => w.reden === 'klein').map((w) => w.sleutel);
  const ookNiet = r.weggelaten.filter((w) => w.reden === 'terugrekenen').map((w) => w.sleutel);
  const weg = aantallen.map((n, i) => i).filter((i) => aantallen[i] > 0 && !mee.includes(i));
  const delen = weg.length + (extraVerborgen > 0 ? 1 : 0);
  if (delen === 1 && uitgesloten[weg[0]] && mee.length) {
    let k = 0;
    mee.forEach((g, i) => { if (aantallen[g] < aantallen[mee[k]]) k = i; });
    ookNiet.push(...mee.splice(k, 1));
  }
  return { mee, klein, ookNiet, uitgesloten: aantallen.map((_, i) => i).filter((i) => uitgesloten[i]) };
}

// ---------- Het verbergpatroon van het dashboard (P2) ----------

/** De kolommen van de uitsplitsing op het dashboard: schaalvragen en thema's (samen onderdrukt) en cijfervragen (elk apart). */
function dashboardKolommen(ds) {
  if (!ds.dashboardKolommen) {
    const vraag = (v, type) => v.bron === 'vraag' && v.type === type && !v.lid_van && v.analyseerbaar && String(v.id).startsWith('v:');
    const schaal = ds.variabelen.filter((v) => vraag(v, 'schaal'));
    const cijfer = ds.variabelen.filter((v) => vraag(v, 'cijfer'));
    ds.dashboardKolommen = { schaal, cijfer, themaIds: [...new Set(schaal.map((v) => v.thema_id))] };
  }
  return ds.dashboardKolommen;
}

/**
 * Het verbergpatroon van het dashboard bij indeling w, binnen de rijen van masker (null = alle rijen): per schaalvraag,
 * thema en cijfervraag welke groepen van w het dashboard in de uitsplitsing verbergt. Dezelfde regels als het dashboard
 * (privacy.js): onderdrukAlles over alle schaalvragen en thema's samen (is in een groep een vraag verborgen, dan ook het
 * thema en de andere vragen van dat thema), onderdrukKolom per cijfervraag. De cellen tellen zoals op het dashboard:
 * een vraag telt wie hem met 1 tot 5 beantwoordde, een thema wie minstens één vraag ervan beantwoordde.
 * "Niet ingevuld" doet als eigen groep mee als die op het dashboard apart staat.
 * @returns {Map<string, boolean[]>} per variabele-id (v:…, t:…) per beschermde groep van w: verborgen of niet
 */
export function dashboardPatroon(ds, w, masker = null, d = DREMPEL) {
  const uit = new Map();
  const { schaal, cijfer, themaIds } = dashboardKolommen(ds);
  if (!w?.beschermd || (!schaal.length && !cijfer.length)) return uit;
  const groep = groepVanRijen(ds, w);
  const ng = w.beschermd.groepen.length;
  const metLeeg = isAchtergrond(w) && w.beschermd.leegApart;
  const totaal = ng + (metLeeg ? 1 : 0);
  const themaVan = schaal.map((v) => themaIds.indexOf(v.thema_id));
  const qn = schaal.map(() => new Array(totaal).fill(0));
  const tn = themaIds.map(() => new Array(totaal).fill(0));
  const cn = cijfer.map(() => new Array(totaal).fill(0));
  const laatst = new Int32Array(themaIds.length).fill(-1);
  for (let r = 0; r < ds.n; r++) {
    if (masker && !masker[r]) continue;
    const g = groep[r] >= 0 ? groep[r] : metLeeg && w.reden[r] === REDEN.GEEN ? ng : -1;
    if (g < 0) continue;
    for (let i = 0; i < schaal.length; i++) {
      if (schaal[i].reden[r] !== REDEN.GELDIG) continue;
      qn[i][g]++;
      const t = themaVan[i];
      if (laatst[t] !== r) {
        laatst[t] = r;
        tn[t][g]++;
      }
    }
    for (let i = 0; i < cijfer.length; i++) if (cijfer[i].reden[r] === REDEN.GELDIG) cn[i][g]++;
  }
  if (schaal.length) {
    const groepen = Array.from({ length: totaal }, (_, g) => ({ vragen: qn.map((c) => ({ n: c[g] })), themas: tn.map((c) => ({ n: c[g] })) }));
    onderdrukAlles(groepen, themaIds, schaal.map((v) => ({ thema_id: v.thema_id })), d);
    schaal.forEach((v, i) => uit.set(v.id, groepen.slice(0, ng).map((gr) => !!gr.vragen[i].verborgen)));
    themaIds.forEach((t, j) => uit.set(`t:${t}`, groepen.slice(0, ng).map((gr) => !!gr.themas[j].verborgen)));
  }
  cijfer.forEach((v, i) => {
    const cellen = cn[i].map((n) => ({ n }));
    onderdrukKolom(cellen, d);
    uit.set(v.id, cellen.slice(0, ng).map((c) => !!c.verborgen));
  });
  return uit;
}

/**
 * Het patroon voor deze analyse: dat van de hele bron (het dashboard), bij meer vragenlijsten ook dat van elke
 * vragenlijst apart (elk heeft een eigen dashboard), en met een selectie ook dat binnen de selectie. Een groep is
 * verborgen als hij in één daarvan verborgen is. Bewaard per indeling en selectie.
 */
export function patroonVoor(ds, ctx, w) {
  if (!ds.patronen) ds.patronen = new Map();
  if (!ds.patronen.has(w.id)) ds.patronen.set(w.id, { alle: null, perSelectie: new WeakMap() });
  const plek = ds.patronen.get(w.id);
  const F = ctx.selectie && !ctx.selectie.impliciet ? ctx.selectie.F : null;
  const bewaard = F ? plek.perSelectie.get(F) : plek.alle;
  if (bewaard) return bewaard;
  const scopes = [null];
  if (ds.lijsten?.length >= 2) ds.lijsten.forEach((_, k) => scopes.push(Uint8Array.from(ds.rijLijst, (x) => (x === k ? 1 : 0))));
  if (F) scopes.push(F);
  const samen = new Map();
  for (const m of scopes) {
    for (const [id, weg] of dashboardPatroon(ds, w, m, ctx.d)) {
      const oud = samen.get(id);
      samen.set(id, oud ? oud.map((x, i) => x || weg[i]) : weg);
    }
  }
  if (F) plek.perSelectie.set(F, samen);
  else plek.alle = samen;
  return samen;
}

/**
 * Welke groepen van w het dashboard bij v verbergt (P2), of null als v geen kolom op het dashboard heeft en ook niet
 * uit zulke kolommen is berekend. Een meetpuntscore of eigen score (berekenen, omscoren, indelen) is verborgen in een
 * groep als een van de vragen of variabelen waaruit hij bestaat daar verborgen is.
 */
export function verborgenDoorDashboard(ds, ctx, v, w) {
  if (!v || !w?.beschermd || v.id === w.id) return null;
  const patroon = patroonVoor(ds, ctx, w);
  if (!patroon.size) return null;
  const zoek = (x, diepte) => {
    if (!x || diepte > 20) return null;
    if (patroon.has(x.id)) return patroon.get(x.id);
    let delen = [];
    if (x.bron === 'meetpunt') delen = dashboardKolommen(ds).schaal.filter((q) => q.meetpunt_id === x.meetpunt_id);
    else if (Array.isArray(x.bronnen)) delen = x.bronnen.map((id) => ds.perId.get(id)).filter(Boolean);
    let uit = null;
    for (const deel of delen) {
      const p = zoek(deel, diepte + 1);
      if (p) uit = uit ? uit.map((a, i) => a || p[i]) : p.slice();
    }
    return uit;
  };
  return zoek(v, 0);
}

/** De melding bij een selectie die regel D niet doorstaat (ook de buren "alleen/zonder vragenlijst" van een gestapelde bron). */
export function selectieMelding(fout) {
  if (fout.soort === 'lijst') return P_LIJST_BUUR;
  return fout.soort === 'rest' ? P_FILTER_REST : pFilterBuur(fout.tekst);
}

/** Waarom een groep niet meedoet als hij 1 tot 4 mensen verschilt van een buur (regel D). */
export function buurReden(ctx) {
  return ctx.selectie?.impliciet ? 'bij één vragenlijst' : 'met en zonder de selectie';
}

/** Regel D voor het geheel; null of de tekst. */
export function selectieControle(ctx, basis) {
  const f = selectieFout(ctx.selectie, basis, ctx.d);
  return f ? selectieMelding(f) : null;
}

/**
 * B26: een indeling (kenmerk, eigen indeling, vragenlijst, code …) als getal gebruiken mag alleen als haar
 * verdeling in de basis geen kleine groep heeft; anders volgen de aantallen uit gemiddelde, spreiding en vorm.
 * Bij een achtergrondvraag telt "Niet ingevuld" (binnen de selectie F) als groep, zoals op het dashboard: anders
 * volgt het verborgen aantal uit n.
 */
export function indelingAlsGetalFout(v, basis, d = DREMPEL, F = null) {
  // Een gewone vraag met "Dat zeg ik liever niet" (Ja / Nee / Zeg ik liever niet) als getal: zonder selectie staat
  // de hele verdeling op het dashboard; binnen een selectie volgt het aantal "liever niet" uit de grootte van de
  // selectie min N. Dat aantal moet dan 0 of minstens d zijn (J2).
  if (!v.groepering && v.origineel && F && F.some((x) => !x)) {
    let liever = 0;
    let n = 0;
    for (let r = 0; r < v.reden.length; r++) {
      if (!F[r]) continue;
      if (v.reden[r] === REDEN.LIEVER_NIET) liever++;
      else if (basis[r]) n++;
    }
    return verbergReeks([n, liever], d).some(Boolean) ? P_LIEVER_NIET_SELECTIE(v.label) : null;
  }
  if (!v.groepering) return null;
  const tellingen = new Map();
  for (let r = 0; r < basis.length; r++) if (basis[r]) tellingen.set(v.waarden[r], (tellingen.get(v.waarden[r]) || 0) + 1);
  const reeks = [...tellingen.values()];
  if (isAchtergrond(v)) {
    let leeg = 0;
    for (let r = 0; r < v.reden.length; r++) if (v.reden[r] === REDEN.GEEN && (!F || F[r])) leeg++;
    reeks.push(leeg);
  }
  // "Dat zeg ik liever niet" doet als getal niet mee, maar blijft een groep: anders volgt dat aantal uit n (J2).
  if (v.origineel) {
    let liever = 0;
    for (let r = 0; r < v.reden.length; r++) if (v.reden[r] === REDEN.LIEVER_NIET && (!F || F[r])) liever++;
    reeks.push(liever);
  }
  return verbergReeks(reeks, d).some(Boolean) ? P_INDELING_ALS_GETAL(v.label) : null;
}

/** Gebruikt de analyse deze voorspeller als indeling (dummy's) of als getal? (regressie en logistische regressie) */
export function soortVoorspeller(v) {
  if (isIndeling(v) && (v.meetniveau === 'nominaal' || v.groepering)) return 'groep';
  if (isGetal(v)) return 'getal';
  return null;
}

/** Vakjes waarin een variabele als getal meedoet (definities.js: soort 'getal' of 'item'). */
const isGetalVak = (vak) => vak?.soort === 'getal' || vak?.soort === 'item';

/**
 * Alle variabelen van een analyse zoals de analyse ze gebruikt: als getal (getalWeergave: "Dat zeg ik liever niet"
 * ontbreekt) in een vakje voor getallen en bij een voorspeller die als getal meedoet, anders de variabele zelf.
 * Voor de controle van een selectie (selectieGroepenFout) en de melding over "liever niet" (J2).
 * @returns {{ id, v, alsGetal: boolean }[]}
 */
export function analyseVariabelen(ds, spec) {
  const uit = [];
  for (const vak of SLOTS[spec.procedure]?.slots || []) {
    for (const { id, v } of variabelenUit(ds, spec, vak.sleutel)) {
      if (!v) continue;
      const alsGetal = isGetalVak(vak) || (vak.soort === 'voorspeller' && soortVoorspeller(v) === 'getal');
      uit.push({ id, v: alsGetal ? getalWeergave(v) : v, alsGetal });
    }
  }
  return uit;
}

/**
 * P3: een getal met vaste waarden (een schaalvraag, cijfervraag of andere vraag met minstens drie antwoorden) dat geen
 * indeling is. Gemiddelde en spreiding per groep of selectie mogen daarvan getoond worden (zoals op het dashboard).
 * Een verdeling per groep of selectie met verborgen of samengevoegde cellen dan niet: die cellen zijn uit gemiddelde,
 * spreiding, scheefheid en kurtosis terug te rekenen. (Van een indeling als getal is het andersom: zie groepKeuze.)
 */
export const isVastGetal = (v) => !!v && isGetal(v) && !v.groepering && v.labels.length >= 3;

/**
 * P3 ook voor een indeling van zo'n vraag ("Indelen in groepen" van een schaalvraag, ook met één waarde per groep):
 * het gemiddelde per groep of selectie van de vraag zelf staat op het dashboard en in de werkbank, dus verborgen
 * cellen van de indeling zijn daaruit net zo goed terug te rekenen.
 */
export const isVastGetalOfIndeling = (ds, v) => isVastGetal(v) || (!!v?.groepering && isVastGetal(wortelVan(ds, v)));

/**
 * P3 (optie 1): van een vraag met vaste waarden tonen we per groep of binnen een selectie meer dan N en gemiddelde
 * (SD, SE, interval, mediaan, percentielen, minimum, maximum, scheefheid, kurtosis) alleen als de verdeling daar geen
 * verborgen cel heeft: de rij van de kruistabel waarde × groep (met de buren van de selectie, regel D). Anders zijn de
 * verborgen aantallen uit die getallen samen met het gemiddelde terug te rekenen. Het dashboard toont per groep ook
 * alleen N en gemiddelde.
 * rijen: per rij het groepnummer 0..aantal−1 (of −1: telt mee als één "rest"-rij, want ook die verdeling volgt uit
 * het totaal), of null zonder groepen. U: de rijen met een geldige waarde, los van de selectie (de tabel telt
 * U ∩ selectie; de buren van de selectie tellen in U). Geeft per groep true = vrij (alles mag).
 */
export function spreidingVrij(v, U, rijen, aantal, ctx) {
  const uit = new Array(Math.max(1, aantal)).fill(true);
  if (!isVastGetal(v)) return uit;
  const sel = ctx.selectie && !ctx.selectie.impliciet ? ctx.selectie : null;
  if (!rijen && !sel) return uit;
  const waarden = [];
  const gezien = new Set();
  for (let r = 0; r < U.length; r++) if (U[r] && !gezien.has(v.waarden[r])) { gezien.add(v.waarden[r]); waarden.push(v.waarden[r]); }
  waarden.sort((p, q) => p - q);
  const kolomNr = new Map(waarden.map((x, i) => [x, i]));
  const nr = rijen ? aantal + 1 : 1;
  const nk = Math.max(1, waarden.length);
  const rij = new Int32Array(U.length).fill(-1);
  const kol = new Int32Array(U.length).fill(-1);
  for (let r = 0; r < U.length; r++) {
    if (!U[r]) continue;
    rij[r] = rijen ? (rijen[r] >= 0 ? rijen[r] : aantal) : 0;
    kol[r] = kolomNr.get(v.waarden[r]);
  }
  const T = telTabel(inSelectie(U, sel), null, rij, kol, nr, nk);
  const { verschillen, vooraf } = buurTabellen(sel, U, rij, kol, nr, nk, ctx.d);
  const mee = T.map((x) => x.some((c) => c > 0));
  if (!mee.some(Boolean)) return uit;
  const kies = (t) => t.filter((_, i) => mee[i]);
  const weg = maskeer([kies(T), ...verschillen.map(kies)], ctx.d, vooraf ? kies(vooraf) : null);
  let k = 0;
  for (let i = 0; i < nr; i++) {
    if (!mee[i]) continue;
    if (i < uit.length) uit[i] = !weg[k].some(Boolean);
    k++;
  }
  return uit;
}

/**
 * J2: "Dat zeg ik liever niet" telt als getal niet mee. Per groep volgt het aantal "liever niet" dan uit de grootte van
 * de groep min N. Dat aantal moet per groep 0 of minstens d zijn, en ook het verschil met elke buur van de selectie
 * (regel D). Een 0 is hier geen probleem: dan heeft niemand in die groep dat gezegd, en dat verraadt geen antwoord.
 * reden: per rij de reden (REDEN); basis: de rijen met een geldige waarde of "liever niet" (los van de selectie);
 * groep: per rij het groepsnummer (−1 = geen). Geeft per groep true = niet tonen, of null als niemand het zei.
 */
export function lieverNietPerGroep(reden, basis, groep, ng, d = DREMPEL, selectie = null) {
  const rij = groep;
  const kolom = Int32Array.from(reden, (x, r) => (basis[r] && x === REDEN.LIEVER_NIET ? 0 : -1));
  const T = telTabel(basis, selectie?.F || null, rij, kolom, ng, 1);
  const { verschillen } = buurTabellen(selectie, basis, rij, kolom, ng, 1, d);
  if (!T.some((x) => x[0] > 0) && !verschillen.some((t) => t.some((x) => x[0] > 0))) return null;
  const klein = (c) => c > 0 && c < d;
  return T.map((x, i) => klein(x[0]) || verschillen.some((t) => klein(t[i][0])));
}

/**
 * P3 (optie 1) binnen een selectie, voor analyses die de spreiding gebruiken (regressie, logistische regressie,
 * gepaarde t-toets, correlatie, betrouwbaarheid, factoranalyse): heeft vraag v met vaste waarden in de selectie een
 * verborgen cel (spreidingVrij), dan doet v niet mee. Uit B en β, de kwadratensom, r of α volgt anders de SD van v in
 * de selectie, net als bij Beschrijvende statistiek. U: de rijen die meedoen, los van de selectie.
 * Geeft null (in orde) of de melding.
 */
export function spreidingSelectieFout(v, U, ctx) {
  if (!ctx.selectie || ctx.selectie.impliciet || !isVastGetal(v)) return null;
  return spreidingVrij(v, U, null, 1, ctx)[0] ? null : P_SPREIDING_ANALYSE_SELECTIE(v.label);
}

/**
 * Een eigen indeling w van een beschermde indeling W (zijn wortel), zoals "Productie of rest" van "Op welke afdeling
 * werk je?": geeft W, of null. (P1, P2: groepen die bij W niet apart te zien zijn, blijven via w ook verborgen.)
 */
export function beschermdeWortel(ds, w) {
  if (!w) return null;
  const W = wortelVan(ds, w);
  return W && W.id !== w.id && W.beschermd && W.labels?.length >= 2 && W.soort !== 'set' ? W : null;
}

/**
 * Welke groepen van indeling w een deel van de verborgen groepen H van de wortel bevatten, maar niet alles daarvan
 * (in de rijen van masker). Zo'n groep min de getoonde groepen van de wortel geeft een verborgen groep terug.
 * Een groep zonder rijen uit H, of met heel H, mag blijven (heel H volgt ook uit het totaal).
 * groepW / groepw: per rij de groep van de wortel en van w (−1 = geen). Geeft per groep van w true = verbergen.
 */
export function splitstVerborgen(groepW, H, groepw, aantal, masker) {
  let totaal = 0;
  const per = new Array(aantal).fill(0);
  for (let r = 0; r < groepW.length; r++) {
    if (!masker[r] || groepW[r] < 0 || !H[groepW[r]]) continue;
    totaal++;
    if (groepw[r] >= 0) per[groepw[r]]++;
  }
  return per.map((x) => x > 0 && x < totaal);
}

/** Kan v als getal? Anders de melding. */
export function getalFout(v) {
  if (!v) return 'Deze variabele bestaat niet (meer).';
  if (!isGetal(v)) return `“${v.label}” is geen getal. Kies een variabele met het meetniveau ordinaal of interval, of pas het meetniveau aan bij Variabelen.`;
  return null;
}

/** Omschrijving van de gegevensbron. */
export function bronTekst(ds) {
  if (ds.bron.soort === 'dataset') return `Dataset: ${ds.dataset?.naam || ''}`;
  if (ds.bron.soort === 'gestapeld') return 'Alle vragenlijsten samen';
  return ds.lijsten[0] ? `Vragenlijst: ${ds.lijsten[0].naam}` : 'Vragenlijst';
}

/** De basis van een Uitvoer (gegevens, titel, spec), met meldingen over open vragenlijsten. */
export function begin(ds, spec, ctx, titel, instellingen) {
  const u = maakUitvoer({
    procedure: spec.procedure,
    titel,
    gegevens: {
      bron: bronTekst(ds),
      selectie: ctx.selectie ? ctx.selectie.tekst : null,
      n: null,
      datum: ctx.nu,
      open: ds.lijsten.some((l) => l.open),
      instellingen,
    },
    spec,
  });
  for (const l of ds.lijsten) if (l.open) u.onderdelen.push(melding('info', P_OPEN(l.titel)));
  return u;
}

/** Een geweigerde uitvoer met dezelfde gegevens. */
export function weiger(ds, spec, ctx, titel, niveau, tekst) {
  const u = geweigerd({ procedure: spec.procedure, titel, gegevens: { bron: bronTekst(ds), selectie: ctx.selectie ? ctx.selectie.tekst : null, datum: ctx.nu, open: ds.lijsten.some((l) => l.open) }, spec }, niveau, tekst);
  return u;
}

/** Regel E voor de indelingen die deze analyse gebruikt (groepsvariabelen en selectievoorwaarden). */
export function overlapFout(ds, ctx, indelingen) {
  const vars = [...indelingen];
  if (ctx.selectie?.voorwaarden) for (const vw of ctx.selectie.voorwaarden) if (vw.variabele) vars.push(ds.perId.get(vw.variabele));
  return controleerWortels(ds, vars.filter(Boolean), ctx.d);
}

/** Melding als ordinale variabelen als getal worden gebruikt. */
export function ordinaalMelding(variabelen) {
  return variabelen.some((v) => v.meetniveau === 'ordinaal') ? melding('info', P_ORDINAAL) : null;
}

/** Waarden van rijen in een masker. */
export function waardenIn(v, masker) {
  const uit = [];
  for (let r = 0; r < masker.length; r++) if (masker[r]) uit.push(v.waarden[r]);
  return uit;
}

/** Waarden per groep (rijen in masker met groep ≥ 0). */
export function waardenPerGroep(v, masker, groep, aantal) {
  const uit = Array.from({ length: aantal }, () => []);
  for (let r = 0; r < masker.length; r++) if (masker[r] && groep[r] >= 0) uit[groep[r]].push(v.waarden[r]);
  return uit;
}

/**
 * Variabelen uit een slot van de spec (één of meer ids). In een vakje voor getallen (soort 'getal' of 'item' in
 * definities.js) komt de getalweergave: daar is "Dat zeg ik liever niet" ontbrekend (J2). Een voorspeller kan getal
 * of indeling zijn; dat beslist ontwerp() in regressie.js.
 */
export function variabelenUit(ds, spec, slot) {
  const w = spec.variabelen?.[slot];
  const ids = w === undefined ? [] : Array.isArray(w) ? w : [w];
  const getal = isGetalVak(SLOTS[spec.procedure]?.slots?.find((x) => x.sleutel === slot));
  return ids.map((id) => {
    const v = ds.perId.get(id) || null;
    return { id, v: getal ? getalWeergave(v) : v };
  });
}

/** Melding bij een variabele die niet meer bestaat; naam is de omschrijving (of null als die onbekend is). */
export const ontbreektTekst = (naam) => (naam
  ? `Deze analyse gebruikt een variabele die niet meer bestaat: “${naam}”. Pas de analyse aan of verwijder hem.`
  : 'Deze analyse gebruikt een variabele die niet meer bestaat (een vraag of eigen variabele die is verwijderd). Pas de analyse aan of verwijder hem.');
