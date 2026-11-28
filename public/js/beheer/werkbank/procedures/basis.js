// Werkbank: gedeelde bouwstenen voor de procedures. Zuivere module, geen DOM.
// Elke procedure krijgt (ds, spec, ctx) met ctx = { d, selectie (of null), streng, nu, voortgang, pauze }:
// - ds: de dataset (dataset.js + transformaties.js);
// - selectie: { F, buren, tekst } van de gekozen selectie (regel D), of null voor iedereen;
// - streng: true bij het vastleggen in een rapport: dan worden ook bij meningsvragen zonder selectie de aantallen
//   1 tot 4 verborgen (B26 geldt alleen op het eigen scherm), zodat kleinste_n altijd minstens 5 is;
// - pauze(): geeft de browser even de tijd (en stopt bij "Stoppen"); voortgang(tekst) meldt hoe ver het is.

import { REDEN, isGetal, isAchtergrond, isIndeling, getalWeergave } from '../dataset.js';
import { PROCEDURES as SLOTS } from '../definities.js';
import { verdeelInGroepen, verbergReeks, onderdrukAlles, onderdrukKolom, DREMPEL } from '../../privacy.js';
import { selectieFout } from '../privacy-selectie.js';
import { controleerWortels, P_FILTER_REST, pFilterBuur } from '../transformaties.js';
import { maakUitvoer, geweigerd, melding } from '../uitvoer.js';
import { P_INDELING_ALS_GETAL, P_ORDINAAL, P_OPEN, P_LIJST_BUUR } from '../uitvoer-tekst.js';

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
