// HR-analytics (Dashboard · Overzicht): alle kerncijfers van een onderzoek in één afgeschermd object (BOUWPLAN §3.6,
// "Kerncijfers v1"; D1 §4 en §7). Zuivere module (geen DOM, geen fetch); draait in de browser en in de tests.
//
// verzamelKerncijfers rekent uit de export (gegevens.js) en het personeelsaggregaat:
// - deelname (respons, foutmarge), wie deden mee (samenstelling tegenover de organisatie, representativiteit),
//   kernscores (thema's, eNPS, rapportcijfers, sterkste en zwakste punten), thema's per groep (heatmap), wat samenhangt
//   met een uitkomst (drijvers), signalen, ontwikkeling, kwaliteit van de gegevens, benchmarks, eigen cijfers en de
//   kengetallen van het personeelsbestand;
// - alles is al afgeschermd (privacy.js): elk verborgen getal is null met verborgen: true. Getallen zijn niet afgerond;
//   wie toont, rondt af (gemiddelden 1 decimaal, percentages hele getallen, eNPS heel, r 2 decimalen).
//
// Afspraken die het dashboard ook heeft (zodat Overzicht, werkbank en "Alle resultaten" dezelfde getallen tonen):
// - thema- en vraaggemiddelden komen uit dashboardUitRijen (alle geldige antwoorden 1–5; een cijfervraag telt nooit mee);
// - de groepen van een achtergrondvraag volgen verdeelInGroepen ('samenvoegen'), met "Niet ingevuld" als groep;
// - de cellen van "Thema's per groep" zijn letterlijk de cellen van de uitsplitsing van het dashboard;
// - een getal op basis van scores per respondent (drijvers, toetsen) alleen als er 0 of minstens 5 gedeeltelijk
//   ingevulde respondenten wegvallen (B7).

import { DREMPEL, LABEL_OVERIG, verdeelInGroepen, onderdrukKolom, weggevallenVeilig } from './privacy.js';
import * as S from './statistiek.js';
import { dashboardUitRijen, rijenUitExport, isBeschermd } from './dashboard-rekenen.js';
import { bouwModel, vragenVan, schaalScoreTelling, waardenVan, groepeerVragen, cijferWaarde, schaalWaarde } from './analyse-model.js';
import { isRechteLijn, RECHTE_LIJN_MIN } from './werkbank/dataset.js';
import { KENMERKEN, kenmerkVoorTekst, isLieverNiet, magKenmerk } from './kenmerken.js';
import { personeelKpis, populatieVoorVraag, ongekoppeldeGroepen, optiesZonderGroep } from './personeel-regels.js';

export const VERSIE = 1;
/** Zoveel indelingen komen hooguit in "Thema's per groep". */
export const MAX_GROEPERINGEN = 6;
/** Minimaal aantal paren voor een samenhang (zoals onderdeel 6 van de Analyse; privacy.test.mjs bewaakt die waarde). */
export const MIN_PAREN = 10;
/** Grens voor "significant". */
const ALFA = 0.05;
const Z975 = 1.959963984540054;
/** Een thema ligt "dicht bij het midden" van de prioriteitenmatrix bij minder dan zoveel verschil met het gemiddelde. */
export const DICHT_BIJ_X = 0.1;

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
const pct = (a, b) => (b > 0 && eindig(a) ? (a / b) * 100 : null);
const gemiddelde = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);
const een = (x) => (eindig(x) ? Math.round(x * 10) / 10 : null);
const normaal = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- Losse maten ----------

/**
 * eNPS van een reeks cijfers 0–10: % promotors (9–10) min % criticasters (0–6), met een 95%-interval
 * (variantie van een verschil van twee aandelen uit één multinomiale verdeling, D1 §2.3). null zonder cijfers.
 */
export function enps(waarden) {
  const v = (waarden || []).filter((x) => Number.isInteger(x) && x >= 0 && x <= 10);
  const n = v.length;
  if (!n) return null;
  const promotors = v.filter((x) => x >= 9).length;
  const criticasters = v.filter((x) => x <= 6).length;
  const passief = n - promotors - criticasters;
  const pP = promotors / n;
  const pD = criticasters / n;
  const se = Math.sqrt(Math.max(0, pP + pD - (pP - pD) ** 2) / n) * 100;
  const score = (pP - pD) * 100;
  return {
    n, promotors, passief, criticasters,
    pct_promotors: pP * 100, pct_passief: (passief / n) * 100, pct_criticasters: pD * 100,
    // Het interval loopt nooit buiten de schaal van −100 tot +100.
    score, ci_laag: Math.max(-100, score - Z975 * se), ci_hoog: Math.min(100, score + Z975 * se),
  };
}

/**
 * Gemiddelde, standaarddeviatie en 95%-interval (t) van cijfers; bij een rapportcijfer ook het deel onvoldoendes (≤ 5).
 * Het interval loopt nooit buiten de schaal (bereik: { min, max }; standaard 1–10, bij soort 'nps' 0–10).
 */
export function cijferStatistiek(waarden, soort = 'rapport', { bereik = null } = {}) {
  const v = (waarden || []).filter(eindig);
  const b = S.beschrijf(v);
  if (!b) return null;
  const t = b.n > 1 ? S.tKwantiel(0.975, b.n - 1) : null;
  const marge = t !== null && b.sd !== null ? (t * b.sd) / Math.sqrt(b.n) : null;
  const lo = eindig(bereik?.min) ? bereik.min : soort === 'nps' ? 0 : 1;
  const hi = eindig(bereik?.max) ? bereik.max : 10;
  const uit = { n: b.n, gemiddelde: b.gemiddelde, sd: b.sd, ci_laag: marge === null ? null : Math.max(lo, b.gemiddelde - marge), ci_hoog: marge === null ? null : Math.min(hi, b.gemiddelde + marge) };
  if (soort === 'rapport') uit.pct_onvoldoende = (v.filter((x) => x <= 5).length / b.n) * 100;
  return uit;
}

// ---------- Hulpjes ----------

const STANDAARD_UITKOMST = /^hoe tevreden ben je alles bij elkaar genomen/;

/** De uitkomst voor "Wat hangt samen met …?": de instelling, anders eNPS → rapportcijfer → algemene tevredenheid. */
export function standaardUitkomst(lijst, instellingen = {}) {
  const gekozen = instellingen?.uitkomst?.sleutel;
  if (typeof gekozen === 'string' && uitkomstBestaat(lijst, gekozen)) return gekozen;
  const cijfer = (soort) => lijst.vragen.find((q) => q.type === 'cijfer' && q.schaal_soort === soort);
  const q = cijfer('nps') || cijfer('rapport') || lijst.vragen.find((x) => x.type === 'schaal' && STANDAARD_UITKOMST.test(normaal(x.tekst)));
  return q ? `v:${q.stam}` : null;
}
function uitkomstBestaat(lijst, sleutel) {
  const vr = vragenVan(lijst, sleutel);
  return vr.length > 0 && !vr.some((q) => isBeschermd({ ...q, meerdere_antwoorden: q.meerdere }));
}
const uitkomstNaam = (lijst, model, sleutel) => {
  const [soort, id] = sleutel.split(':');
  if (soort === 't') return model.themas.find((t) => t.id === Number(id))?.naam || 'thema';
  return vragenVan(lijst, sleutel)[0]?.tekst || 'de uitkomst';
};

/**
 * Wat hangt samen met de uitkomst (D1 §4.3)? Per thema van de vragenlijst de correlatie van Pearson tussen de
 * themascore (zonder de uitkomstvraag zelf) en de uitkomst, met een 95%-interval, alleen bij minstens MIN_PAREN paren.
 * B7: valt in een thema (of in de uitkomst, als dat een thema is) 1 tot 4 gedeeltelijk ingevulde respondenten weg, dan
 * geen getal voor dat thema. Het kruis van de prioriteitenmatrix ligt op het gemiddelde van de getoonde themagemiddelden
 * (x) en van de getoonde r (y); een kwadrant alleen bij p < 0,05.
 * gemiddelden: Map thema-id → het themagemiddelde van het dashboard (x in de matrix).
 */
export function drijvers(lijst, uitkomstSleutel, model, d = DREMPEL, { gemiddelden = new Map() } = {}) {
  if (!lijst || !uitkomstSleutel) return null;
  const [soort, idTekst] = String(uitkomstSleutel).split(':');
  const uitkomstId = Number(idTekst);
  const uitVragen = vragenVan(lijst, uitkomstSleutel);
  if (!uitVragen.length) return null;
  let y;
  let uitkomstVeilig = true;
  let uitSoort = soort === 't' ? 'thema' : uitVragen[0].type;
  if (soort === 't') {
    const t = schaalScoreTelling(uitVragen, lijst.inz);
    y = t.scores;
    uitkomstVeilig = weggevallenVeilig(t.weggevallen, d);
  } else y = waardenVan(lijst, uitkomstSleutel);
  if (uitSoort === 'cijfer') uitSoort = `cijfer_${uitVragen[0].schaal_soort}`;
  const uitVraagIds = new Set(soort === 'v' ? uitVragen.map((q) => q.id) : []);
  const rijen = [];
  for (const t of model.themas) {
    if (soort === 't' && t.id === uitkomstId) continue;
    const alle = vragenVan(lijst, `t:${t.id}`);
    const vragenT = alle.filter((q) => !uitVraagIds.has(q.id));
    if (!vragenT.length) continue;
    const overlap = vragenT.length < alle.length;
    const telling = schaalScoreTelling(vragenT, lijst.inz);
    const basis = { thema_id: t.id, naam: t.naam, r: null, ci_laag: null, ci_hoog: null, p: null, n: null, gemiddelde: eindig(gemiddelden.get(t.id)) ? gemiddelden.get(t.id) : null, kwadrant: null, overlap };
    if (!uitkomstVeilig || !weggevallenVeilig(telling.weggevallen, d)) {
      rijen.push({ ...basis, weggevallen_veilig: false, reden: 'weggevallen' });
      continue;
    }
    const xs = [];
    const ys = [];
    telling.scores.forEach((x, i) => {
      if (x !== null && eindig(y[i])) {
        xs.push(x);
        ys.push(y[i]);
      }
    });
    if (xs.length < Math.max(MIN_PAREN, d)) {
      rijen.push({ ...basis, weggevallen_veilig: true, reden: 'te_weinig' });
      continue;
    }
    const p = S.pearson(xs, ys);
    if (!p) {
      rijen.push({ ...basis, weggevallen_veilig: true, reden: 'geen_spreiding' });
      continue;
    }
    rijen.push({ ...basis, r: p.r, ci_laag: p.ciLaag, ci_hoog: p.ciHoog, p: p.p, n: p.n, weggevallen_veilig: true, reden: null });
  }
  const getoond = rijen.filter((r) => r.r !== null && r.gemiddelde !== null);
  const kruis = getoond.length ? { x: gemiddelde(getoond.map((r) => r.gemiddelde)), y: gemiddelde(getoond.map((r) => r.r)) } : null;
  for (const r of rijen) {
    r.dicht_bij_kruis = false;
    if (!kruis || r.r === null || r.gemiddelde === null || !(r.p < ALFA)) continue;
    const hoog = r.r >= kruis.y;
    const goed = r.gemiddelde >= kruis.x;
    r.kwadrant = hoog ? (goed ? 'vasthouden' : 'verbeteren') : goed ? 'goed_genoeg' : 'later';
    // De lijnen zijn gemiddelden: een thema vlak bij een lijn (minder dan 0,1 van het gemiddelde, of een interval van r
    // dat over de lijn heen loopt) verschilt daar niet echt van. Het kwadrant blijft, met die kanttekening.
    r.dicht_bij_kruis = Math.abs(r.gemiddelde - kruis.x) < DICHT_BIJ_X || (eindig(r.ci_laag) && eindig(r.ci_hoog) && r.ci_laag <= kruis.y && kruis.y <= r.ci_hoog);
  }
  rijen.sort((a, b) => (b.r ?? -Infinity) - (a.r ?? -Infinity) || a.naam.localeCompare(b.naam, 'nl'));
  return {
    uitkomst: { sleutel: uitkomstSleutel, naam: uitkomstNaam(lijst, model, uitkomstSleutel), soort: uitSoort, weggevallen_veilig: uitkomstVeilig },
    rijen,
    kruis,
  };
}

const isBeantwoord = (a) => !(a === undefined || a === null || a === '' || (Array.isArray(a) && !a.length));

/**
 * Kwaliteit van de gegevens van één vragenlijst (K S9): lege antwoorden en "weet niet" per vraag, het aantal
 * "rechte lijnen" (alle schaalvragen hetzelfde, zelfde regel als de werkbank: isRechteLijn) en het gemiddelde deel
 * beantwoorde vragen. Verborgen: een vraag die 1 tot 4 keer beantwoord is, een achtergrondvraag waarvan het dashboard
 * het aantal niet toont, en een aantal rechte lijnen van 1 tot 4.
 * dashVragen: de vragen uit dashboardUitRijen (selectie.vragen), voor het afgeschermde aantal van achtergrondvragen.
 */
export function kwaliteit(lijst, model, d = DREMPEL, { dashVragen = [] } = {}) {
  if (!lijst) return null;
  const n = lijst.inz.length;
  const perDash = new Map(dashVragen.map((q) => [q.id, q]));
  const gesloten = lijst.vragen.filter((q) => q.type !== 'open');
  const schaal = lijst.vragen.filter((q) => q.type === 'schaal');
  const per_vraag = gesloten.map((q) => {
    let beantwoord = 0;
    let weetNiet = 0;
    for (const a of lijst.inz) {
      if (isBeantwoord(a[q.id])) beantwoord++;
      if (a[q.id] === 'weet_niet') weetNiet++;
    }
    const dq = perDash.get(q.id);
    const verborgen = (beantwoord > 0 && beantwoord < d) || (dq?.beschermd && dq.n === null);
    if (verborgen) return { vraag_id: q.id, tekst: q.tekst, n_lijst: n, n_beantwoord: null, pct_leeg: null, pct_weet_niet: null, verborgen: true };
    return {
      vraag_id: q.id, tekst: q.tekst, n_lijst: n, n_beantwoord: beantwoord, pct_leeg: pct(n - beantwoord, n),
      pct_weet_niet: (q.type === 'schaal' || q.type === 'cijfer') && q.weet_niet ? pct(weetNiet, n) : null, verborgen: false,
    };
  });
  let rechte = 0;
  let somPct = 0;
  for (const a of lijst.inz) {
    if (isRechteLijn(schaal, a)) rechte++;
    let b = 0;
    for (const q of gesloten) if (isBeantwoord(a[q.id])) b++;
    somPct += gesloten.length ? (b / gesloten.length) * 100 : 100;
  }
  return {
    per_vraag,
    rechte_lijn: rechte > 0 && rechte < d ? null : rechte,
    rechte_lijn_min: RECHTE_LIJN_MIN,
    gem_pct_beantwoord: n ? somPct / n : null,
    aantal_schaalvragen: schaal.length,
  };
}

/**
 * Punten van de reactiecurve: per dag het aantal en het totaal tot dan toe. Een punt met 1 tot d − 1 inzendingen
 * wordt samengenomen met de volgende dagen, tot het minstens d is (K P10); een rest aan het eind gaat bij het laatste punt.
 */
function reactieCurve(perDag, d) {
  const uit = [];
  let blok = 0;
  let cumulatief = 0;
  let samengevoegd = false;
  for (const p of perDag) {
    blok += p.aantal;
    cumulatief += p.aantal;
    if (blok >= d) {
      if (blok !== p.aantal) samengevoegd = true;
      uit.push({ datum: p.datum, aantal: blok, cumulatief });
      blok = 0;
    } else samengevoegd = true;
  }
  if (blok > 0 && uit.length) {
    const laatste = uit[uit.length - 1];
    laatste.aantal += blok;
    laatste.cumulatief = cumulatief;
    laatste.datum = perDag[perDag.length - 1].datum;
  }
  return { punten: uit, samengevoegd };
}

const optiesVan = (q) => (q.type === 'janee' ? [{ id: 'ja', label: 'Ja' }, { id: 'nee', label: 'Nee' }] : q.opties || []);
const isVraagKenmerk = (q) => !!q.kenmerk && q.uitsplitsen && magKenmerk({ type: q.type, meerdere_antwoorden: q.meerdere });

/**
 * De populatie per antwoordmogelijkheid van een achtergrondvraag: met de hand ingevuld (hr_instellingen.populatie,
 * per vraag-id of stam) gaat voor; anders uit het personeelsbestand. { waarden: {optie: n}, bron } of null.
 */
const handPopulatie = (q, instellingen) => instellingen?.populatie?.[q.id] || instellingen?.populatie?.[q.stam] || null;
function populatieVan(q, instellingen, personeel) {
  const hand = handPopulatie(q, instellingen);
  const uitBestand = personeel ? populatieVoorVraag(personeel, { type: q.type, kenmerk: q.kenmerk, opties: q.opties }) : null;
  if (!hand && !uitBestand) return null;
  const waarden = {};
  let handGebruikt = false;
  let bestandGebruikt = false;
  for (const o of optiesVan(q)) {
    if (isLieverNiet(o.label)) continue;
    if (hand && Number.isInteger(hand[o.id]) && hand[o.id] >= 0) {
      waarden[o.id] = hand[o.id];
      handGebruikt = true;
    } else if (uitBestand && Number.isInteger(uitBestand[o.id])) {
      waarden[o.id] = uitBestand[o.id];
      bestandGebruikt = true;
    }
  }
  if (!handGebruikt && !bestandGebruikt) return null;
  return { waarden, bron: handGebruikt && bestandGebruikt ? 'gemengd' : handGebruikt ? 'handmatig' : 'personeel' };
}

/**
 * Wie deden mee: de samenstelling van één achtergrondvraag (R3/R5) tegenover de organisatie (R6), met de toets op
 * representativiteit (K S13) op de gemaskeerde groepen (R7, PR-08).
 */
function samenstelling(q, lijst, instellingen, personeel, d) {
  const n = lijst.inz.length;
  const opties = optiesVan(q);
  const tel = new Map(opties.map((o) => [o.id, 0]));
  let leeg = 0;
  for (const a of lijst.inz) {
    const w = a[q.id];
    if (tel.has(w)) tel.set(w, tel.get(w) + 1);
    else leeg++;
  }
  const invoer = opties.map((o) => ({ sleutel: o.id, label: o.label, n: tel.get(o.id) }));
  if (leeg > 0) invoer.push({ sleutel: null, label: 'Niet ingevuld', n: leeg });
  const indeling = verdeelInGroepen(invoer, { d, strategie: 'samenvoegen' });
  const pop = populatieVan(q, instellingen, personeel);
  const P = (id) => (pop && Number.isInteger(pop.waarden[id]) ? pop.waarden[id] : null);
  const lieverNiet = new Set(opties.filter((o) => isLieverNiet(o.label)).map((o) => o.id));
  const nietIngevuldApart = indeling.zichtbaar.some((z) => z.sleutel === null);
  const ietsVerborgen = !!(indeling.samengevoegd || indeling.verborgen);
  const zichtbaar = new Set(indeling.zichtbaar.map((z) => z.sleutel));

  const groepen = [];
  const basis = (velden) => ({
    label: '', optie_ids: [], niet_ingevuld: false, n: 0, pct: null, populatie: null, populatie_pct: null, respons_pct: null,
    controleer_aantallen: false, pct_vergelijk: null, populatie_pct_vergelijk: null, verschil_pp: null, foutmarge_pp: null,
    populatie_verborgen: false, verborgen: false, liever_niet: false,
    samengevoegd: false, labels_samengevoegd: [], ook_niet_ingevuld: false, ...velden,
  });
  for (const o of opties) {
    const ln = lieverNiet.has(o.id);
    if (zichtbaar.has(o.id)) groepen.push(basis({ label: o.label, optie_ids: [o.id], n: tel.get(o.id), populatie: ln ? null : P(o.id), liever_niet: ln }));
    else if (!ietsVerborgen && tel.get(o.id) === 0) {
      // Niets verborgen: een mogelijkheid zonder respondenten mag als 0 in beeld (zoals de verdeling op het dashboard).
      groepen.push(basis({ label: o.label, optie_ids: [o.id], n: 0, populatie: ln ? null : P(o.id), liever_niet: ln }));
    }
  }
  if (nietIngevuldApart) groepen.push(basis({ label: 'Niet ingevuld', niet_ingevuld: true, n: leeg }));
  let samen = null;
  if (indeling.samengevoegd) {
    const ids = indeling.samengevoegd.sleutels.filter((s) => s !== null);
    const pops = ids.filter((id) => !lieverNiet.has(id)).map(P);
    samen = basis({
      label: LABEL_OVERIG, optie_ids: ids, n: indeling.samengevoegd.n, samengevoegd: true,
      // Alleen "Dat zeg ik liever niet" (en eventueel "Niet ingevuld"): geen groep in de organisatie, dus nooit vergeleken.
      liever_niet: ids.every((id) => lieverNiet.has(id)),
      labels_samengevoegd: indeling.samengevoegd.labels.filter((_, i) => indeling.samengevoegd.sleutels[i] !== null),
      ook_niet_ingevuld: !nietIngevuldApart,
      // Een samengevoegde groep is één categorie: de populatie is de som (alleen als die van alle mogelijkheden bekend is).
      populatie: pops.length && pops.every((x) => x !== null) && !ids.some((id) => lieverNiet.has(id)) ? pops.reduce((t, x) => t + x, 0) : null,
    });
    groepen.push(samen);
  }
  let verborgen_rest = null;
  let restPop = 0;
  if (indeling.verborgen) {
    const ids = indeling.verborgen.sleutels.filter((s) => s !== null);
    verborgen_rest = { labels: indeling.verborgen.labels.filter((_, i) => indeling.verborgen.sleutels[i] !== null), verborgen: true, ook_niet_ingevuld: !nietIngevuldApart };
    restPop = ids.reduce((t, id) => t + (P(id) ?? 0), 0);
  }
  for (const g of groepen) g.pct = pct(g.n, n);

  // Populatie per groep: aantallen onder de d niet tonen, met aanvullend verbergen (ook de verborgen rest telt mee).
  const metPop = groepen.filter((g) => g.populatie !== null);
  if (metPop.length) {
    const cellen = [...metPop.map((g) => ({ n: g.populatie })), ...(verborgen_rest && restPop > 0 ? [{ n: restPop, verborgen: true }] : [])];
    onderdrukKolom(cellen, d);
    const totaalPop = metPop.reduce((t, g) => t + g.populatie, 0) + restPop;
    metPop.forEach((g, i) => {
      if (cellen[i].verborgen) {
        g.populatie = null;
        g.populatie_verborgen = true;
      } else g.populatie_pct = pct(g.populatie, totaalPop);
    });
  }
  for (const g of groepen) {
    if (g.populatie === null || g.niet_ingevuld) continue;
    const r = pct(g.n, g.populatie);
    // Meer respondenten dan medewerkers (ook: respondenten in een groep met 0 medewerkers) is geen privacykwestie maar
    // een fout in de aantallen, bijvoorbeeld een waarde in het personeelsbestand die niet aan de vragenlijst gekoppeld is.
    if ((r !== null && r > 100) || (g.populatie === 0 && g.n > 0)) {
      g.controleer_aantallen = true;
      continue;
    }
    g.respons_pct = r;
    if (!g.samengevoegd && g.n > 0) g.foutmarge_pp = S.foutmarge(g.n, g.populatie);
  }

  // Groepen in het personeelsbestand die bij geen antwoord horen (bijv. "Keukenteam" niet gekoppeld aan "Keuken"):
  // alleen als het bestand voor deze vraag gebruikt wordt (niet alle aantallen met de hand ingevuld). De namen staan
  // ook in de tabel van de personeelscijfers. Een mogelijkheid zonder groep met die naam (en zonder aantal met de hand)
  // krijgt een eigen reden: "niet gekoppeld" volgt uit de namen, niet uit een te klein aantal.
  const hand = handPopulatie(q, instellingen);
  const metHand = (id) => !!hand && Number.isInteger(hand[id]) && hand[id] >= 0;
  const vq = { type: q.type, kenmerk: q.kenmerk, opties: q.opties };
  const bestandNodig = !!personeel && opties.some((o) => !lieverNiet.has(o.id) && !metHand(o.id));
  const ongekoppeld = bestandNodig ? ongekoppeldeGroepen(personeel, vq).map((g) => g.label) : [];
  const zonderGroep = new Set(ongekoppeld.length ? optiesZonderGroep(personeel, vq).filter((id) => !metHand(id)) : []);
  const isNietGekoppeld = (g) => g.populatie === null && !g.populatie_verborgen && g.optie_ids.some((id) => zonderGroep.has(id));

  // Representativiteit: alleen getoonde categorieën met een getoonde populatie (nooit verborgen cellen). Een groep met
  // aantallen die niet kloppen (controleer_aantallen) doet niet mee: niet in de percentages, het verschil of de figuur.
  const vergelijk = groepen.filter((g) => g.populatie !== null && !g.niet_ingevuld && !g.controleer_aantallen);
  // "Niet ingevuld" en "Dat zeg ik liever niet" doen nooit mee (geen groep in de organisatie); die staan hier niet bij.
  const zonderAantal = groepen.filter((g) => !g.niet_ingevuld && !g.liever_niet && g.populatie === null);
  const nietGekoppeld = zonderAantal.filter(isNietGekoppeld).map((g) => g.label);
  const nietVergeleken = zonderAantal.filter((g) => !isNietGekoppeld(g)).map((g) => g.label);
  let representativiteit = null;
  if (pop) {
    const nV = vergelijk.reduce((t, g) => t + g.n, 0);
    const pV = vergelijk.reduce((t, g) => t + g.populatie, 0);
    // Eén vergeleken groep is altijd 100% tegen 100%: dan geen percentages, verschil of figuur.
    for (const g of vergelijk.length >= 2 ? vergelijk : []) {
      g.pct_vergelijk = pct(g.n, nV);
      const pp = pct(g.populatie, pV);
      g.verschil_pp = g.pct_vergelijk !== null && pp !== null ? g.pct_vergelijk - pp : null;
      g.populatie_pct_vergelijk = pp;
    }
    // Klopt een aantal medewerkers niet (meer respondenten dan medewerkers), dan zegt een toets niets over de respondenten.
    const toets = groepen.some((g) => g.controleer_aantallen) ? { reden: 'controleer_aantallen' }
      : vergelijk.length >= 2 ? S.aanpassingsToets(vergelijk.map((g) => g.n), vergelijk.map((g) => g.populatie)) : { reden: 'te_weinig_groepen' };
    const basisR = {
      chi2: null, df: null, p: null, n: nV, kleinste_verwacht: null, populatie_bron: pop.bron, niet_vergeleken: nietVergeleken, niet_gekoppeld: nietGekoppeld,
    };
    const verschillen = vergelijk.filter((g) => g.verschil_pp !== null).map((g) => ({ label: g.label, pct_respondenten: g.pct_vergelijk, pct_medewerkers: g.populatie_pct_vergelijk, verschil_pp: g.verschil_pp }));
    if (!toets || toets.reden) {
      representativiteit = { oordeel: 'niet_te_toetsen', reden: toets?.reden || 'klein', ...basisR, verschillen, afwijkend: [] };
    } else {
      const wijkt = toets.p < ALFA;
      representativiteit = {
        oordeel: wijkt ? 'wijkt_af' : 'geen_aanwijzing', reden: null, ...basisR,
        chi2: toets.chi2, df: toets.df, p: toets.p, n: toets.n, kleinste_verwacht: toets.kleinste_verwacht,
        verschillen,
        afwijkend: wijkt ? verschillen.filter((v) => Math.abs(v.verschil_pp) >= 5).map((v) => ({ label: v.label, verschil_pp: v.verschil_pp })) : [],
      };
    }
  }
  return {
    vraag_id: q.id, stam: q.stam, kenmerk: q.kenmerk, kenmerk_naam: KENMERKEN[q.kenmerk]?.naam || '', tekst: q.tekst,
    groepen, verborgen_rest, representativiteit, populatie_bron: pop ? pop.bron : null, ongekoppeld,
  };
}

/** Thema's per groep: de cellen van de uitsplitsing van het dashboard (letterlijk), als rijen en kolommen. */
function heatmap(uitsplitsing, q, themas, cijferVragen) {
  const kolommen = uitsplitsing.groepen.map((g) => ({
    label: g.label, n: g.verborgen ? null : g.n, verborgen: !!g.verborgen, samengevoegd: Array.isArray(g.samengevoegd),
    labels_samengevoegd: Array.isArray(g.samengevoegd) ? g.samengevoegd : [], toelichting: g.toelichting || g.reden || '',
  }));
  const rijen = [];
  themas.forEach((t, i) => {
    rijen.push({
      soort: 'thema', id: t.thema_id, naam: t.naam, totaal: t.verborgen ? null : een(t.gemiddelde),
      cellen: uitsplitsing.groepen.map((g) => (g.verborgen ? null : g.themas[i]?.gemiddelde ?? null)),
    });
  });
  uitsplitsing.cijfervragen.forEach((c, i) => {
    const cq = cijferVragen.get(c.vraag_id);
    const nps = c.schaal_soort === 'nps';
    rijen.push({
      soort: nps ? 'enps' : 'cijfer', id: c.vraag_id, naam: c.tekst,
      totaal: cq && !cq.verborgen ? (nps ? (eindig(cq.score) ? Math.round(cq.score) : null) : een(cq.gemiddelde)) : null,
      cellen: uitsplitsing.groepen.map((g) => {
        if (g.verborgen) return null;
        const cel = g.cijfers[i];
        return nps ? cel?.enps ?? null : cel?.gemiddelde ?? null;
      }),
    });
  });
  return { vraag_id: q.id, tekst: q.tekst, kenmerk: q.kenmerk || '', kenmerk_naam: KENMERKEN[q.kenmerk]?.naam || '', kolommen, rijen };
}

/** Toetsen per thema tussen het eerste en het laatste meetmoment (dezelfde regels als verzamelFeiten in rapport-feiten.js). */
function verlooptoetsen(model, d) {
  const toetsen = [];
  for (const t of model.themas) {
    const perMoment = [];
    for (const mm of model.meetmomenten) {
      const scores = [];
      let kleineLijst = false;
      let weggevallenOnveilig = false;
      let open = false;
      for (const l of model.lijsten) {
        if (l.meetmoment_id !== mm.id) continue;
        const vragenT = vragenVan(l, `t:${t.id}`);
        if (!vragenT.length) continue;
        const telling = schaalScoreTelling(vragenT, l.inz);
        if (!weggevallenVeilig(telling.weggevallen, d)) weggevallenOnveilig = true;
        const geldig = telling.scores.filter((x) => x !== null);
        if (geldig.length > 0 && geldig.length < d) kleineLijst = true;
        for (const q of vragenT) {
          const c = l.inz.filter((a) => schaalWaarde(a[q.id]) !== null).length;
          if (c > 0 && c < d) kleineLijst = true;
        }
        if (geldig.length && l.status === 'open') open = true;
        scores.push(...geldig);
      }
      if (scores.length >= d && !kleineLijst) perMoment.push({ id: mm.id, naam: mm.naam, scores, weggevallenOnveilig, open });
    }
    if (perMoment.length < 2) continue;
    const a = perMoment[0];
    const b = perMoment[perMoment.length - 1];
    const open = a.open || b.open;
    if (a.weggevallenOnveilig || b.weggevallenOnveilig) {
      toetsen.push({ thema_naam: t.naam, van: { naam: a.naam, meetmoment_id: a.id }, naar: { naam: b.naam, meetmoment_id: b.id }, verborgen: true, reden: 'weggevallen', open });
      continue;
    }
    const welch = S.welchT(a.scores, b.scores);
    const g = S.cohensD(a.scores, b.scores);
    const A = S.beschrijf(a.scores);
    const B = S.beschrijf(b.scores);
    toetsen.push({
      thema_naam: t.naam,
      van: { naam: a.naam, meetmoment_id: a.id, n: A.n, gemiddelde: A.gemiddelde, sd: A.sd },
      naar: { naam: b.naam, meetmoment_id: b.id, n: B.n, gemiddelde: B.gemiddelde, sd: B.sd },
      verschil: B.gemiddelde - A.gemiddelde, p: welch ? welch.p : null, t: welch ? welch.t : null, df: welch ? welch.df : null,
      g: g ? g.g : null, effect: g ? S.effectGrootte(g.g, 'g') : null, open,
    });
  }
  return toetsen;
}

// ---------- Het geheel ----------

/** Een lege Kerncijfers (bijvoorbeeld zonder vragenlijsten). */
function leeg(data, peildatum, d) {
  return {
    versie: VERSIE, peildatum, drempel: d,
    onderzoek: { titel: data?.onderzoek?.titel || '', bedrijfsnaam: data?.onderzoek?.bedrijfsnaam || '' },
    lijst: null, deelname: { lijsten: [], per_dag: [], per_dag_samengevoegd: false }, kenmerken: [],
    scores: { themas: [], enps: null, cijfers: [], sterkst: [], zwakst: [] },
    groepen: [], drijvers: null, signalen: [], verloop: null, kwaliteit: null, benchmarks: [], eigen_cijfers: [], personeel: null,
  };
}

/** Het personeelsaggregaat dat bij de instellingen hoort (hr_instellingen.personeel.id), of null. */
export function gekozenPersoneel(data, instellingen) {
  const id = Number(instellingen?.personeel?.id);
  const rij = (data?.personeelscijfers || []).find((p) => p.id === id);
  return rij?.inhoud && typeof rij.inhoud === 'object' ? rij.inhoud : null;
}

/**
 * Alle kerncijfers van een onderzoek, al afgeschermd (Kerncijfers v1, BOUWPLAN §3.6).
 * @param data         de export (gegevens.js haalGegevens); wordt niet veranderd
 * @param personeel    een Personeelsaggregaat (personeel-regels.js) of null
 * @param instellingen HrInstellingen ({} als er niets is ingesteld)
 * @param opties       { vragenlijstId?, groeperingen?: vraag-id's (standaard: achtergrondvragen met uitsplitsen, kenmerk
 *                     eerst, hooguit 6), peildatum: 'JJJJ-MM-DD', metPersoneel = true, d = DREMPEL }
 */
export function verzamelKerncijfers(data, personeel, instellingen = {}, opties = {}) {
  const d = Math.max(DREMPEL, Number(opties.d) || DREMPEL);
  const peildatum = opties.peildatum || null;
  const metPersoneel = opties.metPersoneel !== false;
  const inst = instellingen && typeof instellingen === 'object' ? instellingen : {};
  const k = leeg(data, peildatum, d);
  if (!(data?.vragenlijsten || []).length) {
    if (metPersoneel && personeel) k.personeel = personeelKpis(personeel, { d });
    return k;
  }

  const rijen = rijenUitExport(data);
  const dash = dashboardUitRijen(rijen, { vragenlijst: opties.vragenlijstId ?? null, uitsplitsen: null });
  const model = bouwModel(data);
  const sel = dash.selectie;
  const lijstId = sel?.vragenlijst_id ?? null;
  const lijst = model.lijsten.find((l) => l.id === lijstId) || null;
  const status = new Map((data.vragenlijsten || []).map((l) => [l.id, l.status]));
  if (lijst) lijst.status = status.get(lijst.id);
  for (const l of model.lijsten) l.status = status.get(l.id);
  const personeelN = personeel && Number.isInteger(personeel.totaal?.medewerkers) && personeel.totaal.medewerkers >= d ? personeel.totaal.medewerkers : null;

  // Deelname per vragenlijst.
  // Met de hand ingevulde aantallen zijn alleen het aantal medewerkers van de organisatie als bij elke mogelijkheid
  // (behalve "Dat zeg ik liever niet") een aantal staat; anders is de som te laag (en de respons en foutmarge te hoog).
  const handN = (l) => {
    const lm = model.lijsten.find((x) => x.id === l.vragenlijst_id);
    for (const q of lm?.vragen || []) {
      const hand = inst.populatie?.[q.id] || inst.populatie?.[q.stam];
      if (!q.kenmerk || !hand) continue;
      const opties = optiesVan(q).filter((o) => !isLieverNiet(o.label));
      if (!opties.length || !opties.every((o) => Number.isInteger(hand[o.id]) && hand[o.id] >= 0)) continue;
      const som = opties.reduce((t, o) => t + hand[o.id], 0);
      if (som > 0) return som;
    }
    return null;
  };
  k.deelname.lijsten = dash.respons.map((r) => {
    const n = r.aantal;
    const klein = n > 0 && n < d;
    let N = null;
    let bron = null;
    if (Number.isInteger(r.aantal_uitgenodigd) && r.aantal_uitgenodigd > 0) [N, bron] = [r.aantal_uitgenodigd, 'uitgenodigd'];
    else if (personeelN) [N, bron] = [personeelN, 'personeel'];
    else {
      const h = handN(r);
      if (h) [N, bron] = [h, 'handmatig'];
    }
    const rp = !klein && N ? pct(n, N) : null;
    return {
      id: r.vragenlijst_id, titel: r.titel, meetmoment_id: r.meetmoment_id ?? null, meetmoment_naam: r.meetmoment_naam, status: r.status,
      n: klein ? null : n, klein, uitgenodigd: Number.isInteger(r.aantal_uitgenodigd) ? r.aantal_uitgenodigd : null,
      respons_pct: rp !== null && rp <= 100 ? rp : null, controleer_aantallen: rp !== null && rp > 100,
      populatie: N !== null && N >= d ? N : null, populatie_bron: N !== null && N >= d ? bron : null,
      foutmarge_pp: !klein && N !== null && N >= d ? S.foutmarge(n, N) : null,
    };
  });

  if (!sel || !lijst) return k;
  const lijstN = sel.n;
  const klein = lijstN > 0 && lijstN < d;
  const respons = dash.respons.find((r) => r.vragenlijst_id === lijstId);
  const dl = k.deelname.lijsten.find((l) => l.id === lijstId);
  k.lijst = {
    id: lijstId, titel: sel.titel, meetmoment_naam: sel.meetmoment_naam, status: status.get(lijstId), n: klein ? null : lijstN,
    uitgenodigd: dl.uitgenodigd, respons_pct: dl.respons_pct, foutmarge_pp: dl.foutmarge_pp,
    van: klein || !respons.per_dag.length ? null : respons.per_dag[0].datum,
    tot: klein || !respons.per_dag.length ? null : respons.per_dag[respons.per_dag.length - 1].datum,
    verborgen: klein,
  };
  // R1: een vragenlijst met 1 tot 4 respondenten geeft geen uitkomsten.
  if (klein || lijstN === 0) {
    if (metPersoneel && personeel) k.personeel = personeelKpis(personeel, { d });
    return k;
  }
  const curve = reactieCurve(respons.per_dag, d);
  k.deelname.per_dag = curve.punten;
  k.deelname.per_dag_samengevoegd = curve.samengevoegd;

  // Wie deden mee.
  k.kenmerken = lijst.vragen.filter(isVraagKenmerk).map((q) => samenstelling(q, lijst, inst, personeel, d));

  // Kernscores.
  const dashVragen = sel.vragen;
  const perVraag = new Map(dashVragen.map((q) => [q.id, q]));
  const kleinVraag = (q) => (q.n > 0 && q.n < d) || ((q.type === 'schaal' || q.type === 'cijfer') && q.n_score > 0 && q.n_score < d);
  const verborgenThemas = new Set(dashVragen.filter((q) => q.type === 'schaal' && kleinVraag(q)).map((q) => q.thema_id));
  k.scores.themas = sel.themas.map((t) => {
    const vragenT = dashVragen.filter((q) => q.type === 'schaal' && q.thema_id === t.thema_id);
    const telling = [0, 0, 0, 0, 0];
    for (const q of vragenT) q.verdeling.forEach((v) => { if (Number.isInteger(v.waarde)) telling[v.waarde - 1] += v.aantal; });
    const som = telling.reduce((s, x) => s + x, 0);
    const verborgen = verborgenThemas.has(t.thema_id) || (t.n > 0 && t.n < d);
    return {
      thema_id: t.thema_id, naam: t.naam, aantal_vragen: t.aantal_vragen,
      n: verborgen ? null : t.n, antwoorden: verborgen ? null : t.antwoorden, gemiddelde: verborgen ? null : t.gemiddelde,
      pct_gunstig: verborgen ? null : pct(telling[3] + telling[4], som),
      pct_neutraal: verborgen ? null : pct(telling[2], som),
      pct_ongunstig: verborgen ? null : pct(telling[0] + telling[1], som),
      verborgen,
    };
  });
  const cijferVragen = new Map();
  for (const q of lijst.vragen.filter((x) => x.type === 'cijfer')) {
    const dq = perVraag.get(q.id);
    const waarden = lijst.inz.map((a) => cijferWaarde(q, a[q.id])).filter((x) => x !== null);
    const verborgen = !dq || kleinVraag(dq) || !waarden.length;
    const basis = { vraag_id: q.id, stam: q.stam, tekst: q.tekst, schaal_soort: q.schaal_soort, verborgen };
    if (q.schaal_soort === 'nps') {
      const e = verborgen ? null : enps(waarden);
      cijferVragen.set(q.id, {
        ...basis, n: e ? e.n : null, promotors: e?.promotors ?? null, passief: e?.passief ?? null, criticasters: e?.criticasters ?? null,
        pct_promotors: e?.pct_promotors ?? null, pct_passief: e?.pct_passief ?? null, pct_criticasters: e?.pct_criticasters ?? null,
        score: e?.score ?? null, ci_laag: e?.ci_laag ?? null, ci_hoog: e?.ci_hoog ?? null, gemiddelde: verborgen ? null : dq.gemiddelde,
      });
    } else {
      const c = verborgen ? null : cijferStatistiek(waarden, 'rapport', { bereik: q.bereik });
      cijferVragen.set(q.id, {
        ...basis, n: c ? c.n : null, gemiddelde: c ? dq.gemiddelde : null, sd: c?.sd ?? null, ci_laag: c?.ci_laag ?? null, ci_hoog: c?.ci_hoog ?? null,
        pct_onvoldoende: c?.pct_onvoldoende ?? null,
        verdeling: verborgen ? [] : dq.verdeling.filter((v) => Number.isInteger(v.waarde)).map((v) => ({ waarde: v.waarde, aantal: v.aantal })),
      });
    }
  }
  const npsVragen = [...cijferVragen.values()].filter((c) => c.schaal_soort === 'nps');
  k.scores.enps = npsVragen[0] || null;
  k.scores.cijfers = [...cijferVragen.values()].filter((c) => c !== k.scores.enps);

  // Sterkste en zwakste punten (R8: alleen vragen die zelf getoond worden).
  const items = dashVragen.filter((q) => q.type === 'schaal' && !kleinVraag(q) && q.n_score > 0).map((q) => {
    const v = q.verdeling.filter((x) => Number.isInteger(x.waarde));
    const scores = v.reduce((t, x) => t + x.aantal, 0);
    return {
      vraag_id: q.id, tekst: q.tekst, thema_naam: q.thema_naam || '', gemiddelde: q.gemiddelde,
      pct_gunstig: pct(v[3].aantal + v[4].aantal, scores), n: q.n_score, _rond: een(q.gemiddelde),
    };
  });
  const aantal = items.length <= 10 ? 3 : 5;
  const opTekst = (a, b) => a.tekst.localeCompare(b.tekst, 'nl');
  const sterkst = [...items].sort((a, b) => b._rond - a._rond || (b.pct_gunstig ?? 0) - (a.pct_gunstig ?? 0) || opTekst(a, b)).slice(0, Math.min(aantal, Math.ceil(items.length / 2)));
  const inSterkst = new Set(sterkst.map((x) => x.vraag_id));
  const zwakst = items.filter((x) => !inSterkst.has(x.vraag_id)).sort((a, b) => a._rond - b._rond || (a.pct_gunstig ?? 0) - (b.pct_gunstig ?? 0) || opTekst(a, b)).slice(0, aantal);
  const zonder = ({ _rond, ...x }) => x;
  k.scores.sterkst = sterkst.map(zonder);
  k.scores.zwakst = zwakst.map(zonder);

  // Thema's per groep: de cellen van de uitsplitsing van het dashboard, met alleen deze vragenlijst (sneller, zelfde cellen).
  const rijenLijst = {
    ...rijen,
    vragenlijsten: rijen.vragenlijsten.filter((l) => l.id === lijstId),
    vragen: rijen.vragen.filter((q) => q.vragenlijst_id === lijstId),
    inzendingen: rijen.inzendingen.filter((i) => i.vragenlijst_id === lijstId),
    eigen_invoer: [],
  };
  const kandidaten = groepeerVragen(lijst);
  const gekozen = Array.isArray(opties.groeperingen)
    ? opties.groeperingen.map(Number).filter((id) => kandidaten.some((q) => q.id === id))
    : kandidaten.map((q) => q.id);
  for (const gid of gekozen.slice(0, MAX_GROEPERINGEN)) {
    const u = dashboardUitRijen(rijenLijst, { vragenlijst: lijstId, uitsplitsen: gid }).selectie.uitsplitsing;
    if (u) k.groepen.push(heatmap(u, lijst.vragen.find((q) => q.id === gid), k.scores.themas, cijferVragen));
  }

  // Wat hangt samen met de uitkomst?
  const uitkomst = standaardUitkomst(lijst, inst);
  if (uitkomst) {
    k.drijvers = drijvers(lijst, uitkomst, model, d, { gemiddelden: new Map(k.scores.themas.map((t) => [t.thema_id, t.gemiddelde])) });
  }

  // Signalen (alleen voor de hele groep).
  k.signalen = signalen(lijst, inst, perVraag, k.scores, model, d);

  // Ontwikkeling (minstens twee meetmomenten met antwoorden).
  k.verloop = ontwikkeling(dash, model, sel, npsVragen[0], d);

  // Kwaliteit van de gegevens.
  k.kwaliteit = kwaliteit(lijst, model, d, { dashVragen });

  // Personeel en benchmarks.
  if (metPersoneel && personeel) k.personeel = personeelKpis(personeel, { d });
  k.benchmarks = (Array.isArray(inst.benchmarks) ? inst.benchmarks : []).map((b) => ({
    sleutel: b.sleutel, waarde: b.waarde, omschrijving: b.omschrijving || '', citeersleutel: b.citeersleutel || '',
    eigen_waarde: eigenWaarde(b.sleutel, k, lijst, perVraag),
  }));

  // Eigen cijfers: per reeks de laatste en de vorige waarde.
  k.eigen_cijfers = (dash.eigen_cijfers || []).map((r) => {
    const punten = [...r.punten].sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
    const p = (x) => (x ? { datum: x.datum, waarde: x.waarde } : null);
    return { naam: r.naam, eenheid: r.eenheid || '', thema_naam: r.thema_naam || '', laatste: p(punten[punten.length - 1]), vorige: p(punten[punten.length - 2]) };
  });
  return k;
}

/** Signalen volgens vaste regels (D1 §4.6), alleen voor de hele groep; achtergrondvragen nooit. */
function signalen(lijst, inst, perVraag, scores, model, d) {
  const uit = [];
  for (const regel of Array.isArray(inst.signalen) ? inst.signalen : []) {
    const [soort, idTekst] = String(regel.sleutel || '').split(':');
    const ongunstig = new Set((regel.ongunstig || []).map(String));
    const grens = Number(regel.grens);
    if (!ongunstig.size || !(grens >= 1 && grens <= 100)) continue;
    let n = 0;
    let telt = 0;
    let tekst = '';
    let labels = [];
    if (soort === 't') {
      const vragenT = vragenVan(lijst, regel.sleutel);
      if (!vragenT.length || vragenT.some((q) => { const dq = perVraag.get(q.id); return dq && dq.n_score > 0 && dq.n_score < d; })) continue;
      tekst = model.themas.find((t) => t.id === Number(idTekst))?.naam || '';
      for (const a of lijst.inz) for (const q of vragenT) {
        const x = schaalWaarde(a[q.id]);
        if (x === null) continue;
        n++;
        if (ongunstig.has(String(x))) telt++;
      }
      labels = [...ongunstig].sort();
    } else if (soort === 'v') {
      const q = lijst.vragen.find((x) => x.stam === Number(idTekst) && x.type !== 'open');
      if (!q || isBeschermd({ ...q, meerdere_antwoorden: q.meerdere })) continue;
      const dq = perVraag.get(q.id);
      if (!dq || (dq.n > 0 && dq.n < d) || (dq.n_score > 0 && dq.n_score < d)) continue;
      tekst = q.tekst;
      for (const a of lijst.inz) {
        const w = a[q.id];
        let geldig = false;
        let raak = false;
        if (q.type === 'schaal') {
          const x = schaalWaarde(w);
          geldig = x !== null;
          raak = geldig && ongunstig.has(String(x));
        } else if (q.type === 'cijfer') {
          const x = cijferWaarde(q, w);
          geldig = x !== null;
          raak = geldig && ongunstig.has(String(x));
        } else if (q.type === 'janee') {
          geldig = w === 'ja' || w === 'nee';
          raak = geldig && ongunstig.has(w);
        } else if (q.type === 'meerkeuze') {
          const keuzes = (Array.isArray(w) ? w : [w]).filter((x) => q.opties.some((o) => o.id === x));
          geldig = keuzes.length > 0;
          raak = keuzes.some((x) => ongunstig.has(x));
        }
        if (geldig) n++;
        if (raak) telt++;
      }
      labels = q.type === 'meerkeuze' ? q.opties.filter((o) => ongunstig.has(o.id)).map((o) => o.label) : [...ongunstig];
    } else continue;
    if (n < d) continue;
    const waarde = (telt / n) * 100;
    if (waarde >= grens) uit.push({ regel: 'ongunstig', sleutel: regel.sleutel, tekst, waarde, grens, n, ongunstig: labels });
  }
  const e = scores.enps;
  if (e && !e.verborgen && eindig(e.score) && e.score < 0) uit.push({ regel: 'enps_negatief', sleutel: `v:${e.stam}`, tekst: e.tekst, waarde: e.score, grens: 0, n: e.n, ongunstig: [] });
  for (const c of scores.cijfers) {
    if (c.schaal_soort === 'rapport' && !c.verborgen && eindig(c.gemiddelde) && c.gemiddelde < 5.5) {
      uit.push({ regel: 'cijfer_onvoldoende', sleutel: `v:${c.stam}`, tekst: c.tekst, waarde: c.gemiddelde, grens: 5.5, n: c.n, ongunstig: [] });
    }
  }
  return uit;
}

/** Ontwikkeling over de meetmomenten: punten zoals het dashboard ze heeft, met kleine punten verborgen (R9). */
function ontwikkeling(dash, model, sel, npsVraag, d) {
  const metAntwoorden = new Set(dash.respons.filter((r) => r.aantal > 0 && r.meetmoment_id).map((r) => r.meetmoment_id));
  if (metAntwoorden.size < 2) return null;
  const veilig = (p) => p.n !== null && p.n >= d && !p.klein && eindig(p.gemiddelde);
  const meetmomenten = dash.verloop.meetmomenten;
  const respons = meetmomenten.map((mm) => {
    const lijsten = dash.respons.filter((r) => r.meetmoment_id === mm.id);
    const n = lijsten.reduce((t, r) => t + r.aantal, 0);
    const klein = lijsten.some((r) => r.aantal > 0 && r.aantal < d);
    const uitgenodigd = lijsten.every((r) => Number.isInteger(r.aantal_uitgenodigd) && r.aantal_uitgenodigd > 0) ? lijsten.reduce((t, r) => t + r.aantal_uitgenodigd, 0) : null;
    const rp = !klein && uitgenodigd ? pct(n, uitgenodigd) : null;
    return { meetmoment_id: mm.id, n: klein ? null : n, respons_pct: rp !== null && rp <= 100 ? rp : null, open: lijsten.some((r) => r.status === 'open' && r.aantal > 0) };
  });
  const themas = dash.verloop.themas.map((t) => ({
    thema_id: t.thema_id, naam: t.naam,
    punten: t.punten.map((p) => (veilig(p) ? { meetmoment_id: p.meetmoment_id, gemiddelde: p.gemiddelde, n: p.n, open: !!p.open } : { meetmoment_id: p.meetmoment_id, gemiddelde: null, n: null, open: !!p.open })),
  }));
  let enpsPunten = [];
  const dq = npsVraag ? sel.vragen.find((q) => q.id === npsVraag.vraag_id) : null;
  if (dq?.verloop) {
    enpsPunten = dq.verloop.map((p) => (p.n !== null && p.n >= d && !p.klein && eindig(p.enps_score)
      ? { meetmoment_id: p.meetmoment_id, score: p.enps_score, n: p.n, open: !!p.open }
      : { meetmoment_id: p.meetmoment_id, score: null, n: null, open: !!p.open }));
  }
  return {
    meetmomenten: meetmomenten.map((m) => ({ id: m.id, naam: m.naam, datum: m.datum || null })),
    themas, enps: enpsPunten, respons, toetsen: verlooptoetsen(model, d),
  };
}

/** De eigen waarde naast een benchmark (null als die verborgen of onbekend is). */
function eigenWaarde(sleutel, k, lijst, perVraag) {
  const s = String(sleutel || '');
  if (s === 'verzuim_pct') return k.personeel?.totaal?.verzuim_pct ?? null;
  if (s === 'verloop_pct') return k.personeel?.totaal?.verloop_pct ?? null;
  if (s === 'respons_pct') return k.lijst?.respons_pct ?? null;
  if (s === 'enps') return k.scores.enps && !k.scores.enps.verborgen ? k.scores.enps.score : null;
  const [soort, id] = s.split(':');
  if (soort === 't') return k.scores.themas.find((t) => t.thema_id === Number(id))?.gemiddelde ?? null;
  if (soort === 'v') {
    const q = lijst.vragen.find((x) => x.stam === Number(id));
    const dq = q && perVraag.get(q.id);
    if (!dq || dq.beschermd || !(dq.type === 'schaal' || dq.type === 'cijfer') || !(dq.n_score >= k.drempel)) return null;
    return eindig(dq.gemiddelde) ? dq.gemiddelde : null;
  }
  return null;
}

// ---------- Hulp voor de instellingen en het scherm ----------

const P_SUGGESTIE = /afdeling|team|locatie|vestiging|leeftijd|geslacht|dienstverband|contract|uren per week|functie/;
const RAAD_KENMERK = [
  [/afdeling|team/, 'afdeling'], [/locatie|vestiging/, 'locatie'], [/leeftijd/, 'leeftijd'], [/geslacht/, 'geslacht'],
  [/dienstverband|contract/, 'contract'], [/uren per week/, 'uren'], [/functie/, 'functieniveau'],
];

/**
 * Vragen die een achtergrondkenmerk lijken maar er (nog) geen hebben (D1 §4.2, "Markeren als kenmerk …"):
 * [{ vraag_id, tekst, kenmerk, kenmerk_naam }]. Alleen ja/nee en meerkeuze met één antwoord, en alleen een kenmerk
 * dat de vragenlijst nog niet heeft (behalve 'overig').
 */
export function kenmerkSuggesties(data, vragenlijstId) {
  const vragen = (data?.vragen || []).filter((q) => q.vragenlijst_id === Number(vragenlijstId));
  const bezet = new Set(vragen.map((q) => q.kenmerk).filter(Boolean));
  const uit = [];
  for (const q of vragen) {
    if (q.kenmerk || !magKenmerk(q)) continue;
    let opties = q.opties;
    if (typeof opties === 'string') {
      try { opties = JSON.parse(opties); } catch { opties = []; }
    }
    const t = normaal(q.tekst);
    let kenmerk = kenmerkVoorTekst(q.tekst, Array.isArray(opties) ? opties : null);
    if (!kenmerk && P_SUGGESTIE.test(t)) kenmerk = RAAD_KENMERK.find(([p]) => p.test(t))?.[1] || '';
    if (!kenmerk || (bezet.has(kenmerk) && !KENMERKEN[kenmerk]?.meerdere)) continue;
    bezet.add(kenmerk);
    uit.push({ vraag_id: q.id, tekst: q.tekst, kenmerk, kenmerk_naam: KENMERKEN[kenmerk].naam });
  }
  return uit;
}

/** Standaardsignalen (D1 §4.6) op exacte sjabloonteksten; {bedrijf} mag elke naam zijn. */
export const STANDAARD_SIGNALEN = [
  { tekst: 'De hoeveelheid werk is goed te doen binnen mijn werktijd.', ongunstig: [1, 2], grens: 30 },
  { tekst: 'De hoeveelheid werk past bij de tijd die ik ervoor heb.', ongunstig: [1, 2], grens: 30 },
  { tekst: 'Alles bij elkaar is mijn werkdruk goed vol te houden.', ongunstig: [1, 2], grens: 30 },
  { tekst: 'Ik heb na het werk nog voldoende energie over.', ongunstig: [1, 2], grens: 30 },
  { tekst: 'Ik verwacht over een jaar nog bij {bedrijf} te werken.', ongunstig: [1, 2], grens: 20, begin: true },
  { tekst: 'Ik verwacht dat ik mijn huidige werk de komende twee jaar gezond kan blijven doen.', ongunstig: [1, 2], grens: 20 },
  { tekst: 'Heb je het afgelopen jaar weleens doorgewerkt terwijl je je eigenlijk te ziek voelde om te werken?', ongunstig: ['ja'], grens: 30 },
  { tekst: 'Heb je in de afgelopen 12 maanden zelf ongewenst gedrag meegemaakt op of rond je werk?', ongunstig: ['Ja'], grens: 10, optie: true },
];

/**
 * Voorstellen voor signaalregels bij de vragen van een vragenlijst (de onderzoeker bevestigt ze bij Instellingen):
 * [{ sleutel: 'v:<stam>', ongunstig, grens, tekst }].
 */
export function standaardSignalen(data, vragenlijstId) {
  const model = bouwModel(data);
  const lijst = model.lijsten.find((l) => l.id === Number(vragenlijstId));
  if (!lijst) return [];
  const uit = [];
  for (const s of STANDAARD_SIGNALEN) {
    const doel = normaal(s.tekst.replace('{bedrijf}', ''));
    const q = lijst.vragen.find((x) => {
      const t = normaal(x.tekst);
      if (s.begin) {
        const [voor, na] = s.tekst.split('{bedrijf}').map(normaal);
        return t.startsWith(voor) && t.endsWith(na);
      }
      return t === doel;
    });
    if (!q) continue;
    let ongunstig = s.ongunstig;
    if (s.optie) {
      const o = (q.opties || []).find((x) => normaal(x.label) === normaal(s.ongunstig[0]));
      if (!o) continue;
      ongunstig = [o.id];
    }
    uit.push({ sleutel: `v:${q.stam}`, ongunstig, grens: s.grens, tekst: q.tekst });
  }
  return uit;
}
