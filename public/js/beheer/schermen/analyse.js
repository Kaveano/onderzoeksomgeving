// Scherm: Analyse – "SPSS in het klein".
// Toetst of verschillen en verbanden in de antwoorden meetbaar en echt zijn, met uitleg in gewone taal:
//   1. verschil tussen meetmomenten      4. betrouwbaarheid van de thema's (Cronbachs alfa)
//   2. verschil tussen groepen           5. verband tussen twee keuzevragen (chi-kwadraat)
//   3. samenhang tussen scores
//
// Alle berekeningen gebeuren in de browser, op de gegevens van GET .../export/data, met de
// rekenfuncties uit ../statistiek.js. De server hoeft er niets extra's voor te doen.
//
// Scores per respondent:
// - thema- of meetpuntscore: het gemiddelde van de geldige antwoorden (1 tot 5) op de schaalvragen van
//   dat thema of meetpunt in de vragenlijst, alleen als minstens de helft van die vragen is beantwoord;
// - vraagscore: het antwoord zelf (1 tot 5); bij een ja/nee-vraag telt ja als 1 en nee als 0.
// Dezelfde vraag op verschillende meetmomenten herkennen we aan de stamvraag (bron_vraag_id).
//
// Privacy: groepen en cellen met minder dan 5 respondenten krijgen nooit een getal. Waar nodig blijft
// ook de kleinste andere groep of cel weg, zodat een kleine groep niet uit het totaal is terug te
// rekenen (dezelfde regel als in de uitsplitsing op het dashboard).

import { api } from '../api.js';
import { h, vervang, leeg, laden, melding, getal, aantal } from '../ui.js';
import * as S from '../statistiek.js';
import { neemOpInStuk } from '../stukdialoog.js';

const ALFA = 0.05; // grens voor "statistisch significant"
const MIN_PAREN = 10; // samenhang, betrouwbaarheid en kruistabel: minstens zoveel respondenten
const MIN = '−';

// Wat er per onderzoek gekozen is, blijft staan als je even naar een ander tabblad gaat.
const keuzes = new Map();

// ---------- Opmaak van getallen ----------

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);

/** Getal met vaste decimalen en een echt minteken: −0,35 */
function g(x, dec = 2) {
  if (!eindig(x)) return '–';
  const nul = Math.abs(x) < 0.5 * 10 ** -dec;
  return `${x < 0 && !nul ? MIN : ''}${getal(Math.abs(x), dec)}`;
}

/** Getal met teken: +0,42 / −0,35 / 0,00 */
function metTeken(x, dec = 2) {
  if (!eindig(x)) return '–';
  const nul = Math.abs(x) < 0.5 * 10 ** -dec;
  return `${nul ? '' : x > 0 ? '+' : MIN}${getal(Math.abs(x), dec)}`;
}

/** "p = 0,032" of "p < 0,001" */
function pTekst(p) {
  if (!eindig(p)) return 'p onbekend';
  if (p < 0.001) return 'p < 0,001';
  // Vlak bij de grens een decimaal extra, zodat "p = 0,050" niet naast "significant" komt te staan.
  if (p >= 0.0495 && p < 0.0505) return `p = ${getal(p, 4)}`;
  return `p = ${getal(p, 3)}`;
}

/** Vrijheidsgraden: heel getal zonder decimalen, anders één decimaal. */
function dfTekst(df) {
  return Number.isInteger(df) ? String(df) : getal(df, 1);
}

const nTekst = (n) => `n = ${Number(n).toLocaleString('nl-NL')}`;
const bereik = (laag, hoog, dec = 2) => `${g(laag, dec)} tot ${g(hoog, dec)}`;
const hoofdletter = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function kort(tekst, max) {
  const t = String(tekst || '');
  return t.length > max ? `${t.slice(0, Math.max(1, max - 1))}…` : t;
}

/** Opsomming in een zin: “A”, “B” en “C” */
function opsomming(namen) {
  const q = namen.map((n) => `“${n}”`);
  if (q.length <= 1) return q.join('');
  return `${q.slice(0, -1).join(', ')} en ${q[q.length - 1]}`;
}

// ---------- Gegevens ----------

/** Zet de export om in een handzame opbouw: per vragenlijst de vragen en de antwoorden per respondent. */
function bouwModel(data) {
  const lijsten = new Map();
  for (const l of data.vragenlijsten || []) {
    lijsten.set(l.id, { id: l.id, titel: l.titel, meetmoment_id: l.meetmoment_id || null, vragen: [], inz: [] });
  }
  for (const q of data.vragen || []) {
    const l = lijsten.get(q.vragenlijst_id);
    if (!l) continue;
    let opties = [];
    if (q.type === 'meerkeuze') {
      try {
        opties = typeof q.opties === 'string' ? JSON.parse(q.opties || '[]') : q.opties || [];
      } catch {
        opties = [];
      }
      if (!Array.isArray(opties)) opties = [];
    }
    l.vragen.push({
      id: q.id,
      stam: q.bron_vraag_id || q.id,
      thema_id: q.thema_id,
      meetpunt_id: q.meetpunt_id || null,
      type: q.type,
      tekst: q.tekst,
      opties,
      meerdere: !!q.meerdere_antwoorden,
      uitsplitsen: !!q.uitsplitsen,
    });
  }
  for (const i of data.inzendingen || []) {
    const l = lijsten.get(i.vragenlijst_id);
    if (l && i.antwoorden && typeof i.antwoorden === 'object') l.inz.push(i.antwoorden);
  }
  return {
    themas: (data.themas || []).map((t) => ({ id: t.id, naam: t.naam })),
    // Meetpunten in de volgorde van de thema's (de export geeft ze op hun eigen volgorde).
    meetpunten: (data.themas || []).flatMap((t) => (data.meetpunten || [])
      .filter((m) => m.thema_id === t.id)
      .map((m) => ({ id: m.id, naam: m.naam, thema_id: m.thema_id }))),
    meetmomenten: (data.meetmomenten || []).map((m) => ({ id: m.id, naam: m.naam })),
    lijsten: [...lijsten.values()],
  };
}

function schaalWaarde(a) {
  return Number.isInteger(a) && a >= 1 && a <= 5 ? a : null;
}

/** Vraag met precies één antwoord uit een vaste lijst: ja/nee of meerkeuze met één antwoord. */
const isKeuzevraag = (q) => q.type === 'janee' || (q.type === 'meerkeuze' && !q.meerdere);

/**
 * De vragen achter een variabele in één vragenlijst.
 * sleutel: 't:<thema-id>', 'm:<meetpunt-id>' of 'v:<stamvraag-id>'.
 */
function vragenVan(lijst, sleutel) {
  const [soort, idTekst] = String(sleutel).split(':');
  const id = Number(idTekst);
  if (soort === 't') return lijst.vragen.filter((q) => q.type === 'schaal' && q.thema_id === id);
  if (soort === 'm') return lijst.vragen.filter((q) => q.type === 'schaal' && q.meetpunt_id === id);
  return lijst.vragen.filter((q) => q.stam === id && (q.type === 'schaal' || q.type === 'janee')).slice(0, 1);
}

/** Gemiddelde van de geldige schaalantwoorden, alleen als minstens de helft van de vragen is beantwoord. */
function schaalScore(vragen, antwoorden) {
  let som = 0;
  let n = 0;
  for (const q of vragen) {
    const x = schaalWaarde(antwoorden[q.id]);
    if (x !== null) {
      som += x;
      n++;
    }
  }
  return n > 0 && n * 2 >= vragen.length ? som / n : null;
}

/** Eén waarde per respondent van de vragenlijst (null = geen geldige score). null als de variabele hier niet bestaat. */
function waardenVan(lijst, sleutel) {
  const vragen = vragenVan(lijst, sleutel);
  if (!vragen.length) return null;
  if (vragen[0].type === 'janee') {
    const id = vragen[0].id;
    return lijst.inz.map((a) => (a[id] === 'ja' ? 1 : a[id] === 'nee' ? 0 : null));
  }
  return lijst.inz.map((a) => schaalScore(vragen, a));
}

/** Het gekozen antwoord op een keuzevraag (optie-id, 'ja' of 'nee'), of null. */
function categorie(vraag, antwoorden) {
  let w = antwoorden[vraag.id];
  if (Array.isArray(w)) w = w.length === 1 ? w[0] : null;
  if (vraag.type === 'janee') return w === 'ja' || w === 'nee' ? w : null;
  return typeof w === 'string' && vraag.opties.some((o) => o.id === w) ? w : null;
}

function optiesVan(vraag) {
  return vraag.type === 'janee'
    ? [{ id: 'ja', label: 'Ja' }, { id: 'nee', label: 'Nee' }]
    : vraag.opties.map((o) => ({ id: o.id, label: o.label }));
}

/** Keuzelijst met alle variabelen die in deze vragenlijsten voorkomen, gegroepeerd per soort. */
function variabeleOpties(model, lijsten, { metJaNee = false } = {}) {
  const themaIds = new Set();
  const meetpuntIds = new Set();
  const schaal = new Map(); // stam → tekst (de tekst uit de laatste vragenlijst wint)
  const janee = new Map();
  for (const l of lijsten) {
    for (const q of l.vragen) {
      if (q.type === 'schaal') {
        themaIds.add(q.thema_id);
        if (q.meetpunt_id) meetpuntIds.add(q.meetpunt_id);
        schaal.set(q.stam, q.tekst);
      } else if (q.type === 'janee') {
        janee.set(q.stam, q.tekst);
      }
    }
  }
  const groepen = [
    { groep: "Thema's", opties: model.themas.filter((t) => themaIds.has(t.id)).map((t) => ({ waarde: `t:${t.id}`, label: t.naam })) },
    { groep: 'Meetpunten', opties: model.meetpunten.filter((m) => meetpuntIds.has(m.id)).map((m) => ({ waarde: `m:${m.id}`, label: m.naam })) },
    { groep: 'Vragen (schaal 1 tot 5)', opties: [...schaal].map(([stam, tekst]) => ({ waarde: `v:${stam}`, label: kort(tekst, 90) })) },
  ];
  if (metJaNee) {
    groepen.push({ groep: 'Ja/nee-vragen', opties: [...janee].map(([stam, tekst]) => ({ waarde: `v:${stam}`, label: kort(tekst, 90) })) });
  }
  return groepen.filter((gr) => gr.opties.length);
}

const heeftOptie = (groepen, waarde) => groepen.some((gr) => gr.opties.some((o) => o.waarde === waarde));
const alleOpties = (groepen) => groepen.flatMap((gr) => gr.opties);

/** Naam van een variabele, voor koppen en zinnen. */
function omschrijf(model, lijsten, sleutel) {
  const [soort, idTekst] = String(sleutel).split(':');
  const id = Number(idTekst);
  if (soort === 't') {
    const t = model.themas.find((x) => x.id === id);
    return { soort: 'thema', lidwoord: 'het', naam: t ? t.naam : 'Onbekend thema', janee: false };
  }
  if (soort === 'm') {
    const m = model.meetpunten.find((x) => x.id === id);
    return { soort: 'meetpunt', lidwoord: 'het', naam: m ? m.naam : 'Onbekend meetpunt', janee: false };
  }
  let vraag = null;
  for (const l of lijsten) for (const q of l.vragen) if (q.stam === id) vraag = q;
  return { soort: 'vraag', lidwoord: 'de', naam: vraag ? vraag.tekst : 'Onbekende vraag', janee: !!vraag && vraag.type === 'janee' };
}

const voluit = (o) => `${o.lidwoord} ${o.soort} “${o.naam}”`; // het thema “Werkdruk en balans”
const alsTitel = (o) => `${hoofdletter(o.soort)} “${o.naam}”`; // Thema “Werkdruk en balans”

// ---------- Privacy ----------

/**
 * Verdeelt de scores over de groepen van een uitsplitsvraag.
 * - mee: groepen met minstens `drempel` geldige scores;
 * - klein: groepen met minder (ook 0) – daarvan komt nooit een getal in beeld;
 * - ookNiet: de kleinste groepen die verder wél groot genoeg zijn, maar ook wegblijven zolang alles
 *   wat verborgen is samen minder dan `drempel` scores telt (anders terug te rekenen uit het totaal).
 *   Respondenten die de uitsplitsvraag oversloegen tellen als verborgen mee.
 */
function verdeelGroepen(lijst, vraag, waarden, drempel) {
  const groepen = optiesVan(vraag).map((o) => ({ naam: o.label, id: o.id, waarden: [] }));
  const perId = new Map(groepen.map((gr) => [gr.id, gr]));
  let verborgen = 0;
  lijst.inz.forEach((a, i) => {
    const x = waarden[i];
    if (x === null) return;
    const gr = perId.get(categorie(vraag, a));
    if (gr) gr.waarden.push(x);
    else verborgen++;
  });
  const mee = groepen.filter((gr) => gr.waarden.length >= drempel);
  const klein = groepen.filter((gr) => gr.waarden.length < drempel);
  for (const gr of klein) verborgen += gr.waarden.length;
  const ookNiet = [];
  while (verborgen > 0 && verborgen < drempel && mee.length) {
    let k = 0;
    mee.forEach((gr, i) => {
      if (gr.waarden.length < mee[k].waarden.length) k = i;
    });
    const [gr] = mee.splice(k, 1);
    ookNiet.push(gr);
    verborgen += gr.waarden.length;
  }
  return { mee, klein, ookNiet };
}

/**
 * Bepaalt welke cellen van een kruistabel niet getoond worden (true = verborgen).
 * - Elke cel met minder dan `drempel` respondenten is verborgen, ook een lege cel.
 * - In elke rij en kolom met een verborgen cel moeten er minstens twee verborgen zijn, die samen
 *   minstens `drempel` tellen. Anders is een kleine cel terug te rekenen uit de rij- en kolomtotalen
 *   (die staan op het dashboard). Zo nodig verdwijnt daarom ook de kleinste cel die nog zichtbaar is.
 * Het scherm toont alle verborgen cellen op dezelfde manier: wie kan zien welke cellen klein zijn en
 * welke alleen ter bescherming zijn verborgen, kan soms alsnog terugrekenen.
 */
function maskeerKruistabel(tabel, drempel) {
  const verborgen = tabel.map((rij) => rij.map((c) => c < drempel));
  const lijnen = [];
  tabel.forEach((rij, i) => lijnen.push(rij.map((_, j) => [i, j])));
  tabel[0].forEach((_, j) => lijnen.push(tabel.map((__, i) => [i, j])));
  let veranderd = true;
  while (veranderd) {
    veranderd = false;
    for (const lijn of lijnen) {
      const weg = lijn.filter(([i, j]) => verborgen[i][j]);
      if (!weg.length) continue;
      const som = weg.reduce((t, [i, j]) => t + tabel[i][j], 0);
      if (weg.length >= 2 && som >= drempel) continue;
      const zichtbaar = lijn.filter(([i, j]) => !verborgen[i][j]).sort((p, q) => tabel[p[0]][p[1]] - tabel[q[0]][q[1]]);
      if (!zichtbaar.length) continue;
      verborgen[zichtbaar[0][0]][zichtbaar[0][1]] = true;
      veranderd = true;
    }
  }
  return verborgen;
}

// ---------- Uitleg in gewone taal ----------

const ZIN_SIG_VERSCHIL = 'Dit verschil is statistisch significant: het is onwaarschijnlijk dat het alleen door toeval komt.';
const ZIN_GEEN_SIG_VERSCHIL = 'Niet significant: het verschil kan goed door toeval komen.';
const ZIN_SIG_GROEPEN = 'De groepen verschillen statistisch significant van elkaar: het is onwaarschijnlijk dat de verschillen alleen door toeval komen.';
const ZIN_GEEN_SIG_GROEPEN = 'Niet significant: de verschillen tussen de groepen kunnen goed door toeval komen.';
const ZIN_SIG_VERBAND = 'Dit verband is statistisch significant: het is onwaarschijnlijk dat het alleen door toeval komt.';
const ZIN_GEEN_SIG_VERBAND = 'Niet significant: het verband kan goed door toeval komen.';
const LET_OP_VERSCHIL = 'Let op: significant betekent niet automatisch belangrijk. Kijk ook naar de grootte van het verschil en of het in de praktijk iets uitmaakt.';
const LET_OP_VERBAND = 'Let op: samenhang is geen oorzaak. Dat twee dingen samengaan, betekent niet dat het een het ander veroorzaakt. En significant betekent niet automatisch belangrijk.';

const effectWoord = (e) => (e === 'verwaarloosbaar' ? 'verwaarloosbaar klein' : e);

/** Uitleg bij twee groepen. zinRichting(verschil) geeft de zin over welke kant het verschil op gaat. */
function duidTweeGroepen(r, zinRichting) {
  const zinnen = [zinRichting(r.welch.verschil)];
  const significant = r.welch.p < ALFA;
  zinnen.push(significant ? ZIN_SIG_VERSCHIL : ZIN_GEEN_SIG_VERSCHIL);
  const effect = r.d ? S.effectGrootte(r.d.g, 'g') : null;
  if (effect) {
    zinnen.push(`Het verschil is ${effectWoord(effect)} (Hedges' g = ${g(r.d.g)}).`);
    if (!significant && (effect === 'middelgroot' || effect === 'groot')) {
      zinnen.push('Met meer respondenten is zo’n verschil mogelijk wel aan te tonen.');
    }
    if (significant && (effect === 'verwaarloosbaar' || effect === 'klein')) {
      zinnen.push('Bedenk wel of zo’n klein verschil in de praktijk iets uitmaakt.');
    }
  }
  if (r.mw && (r.mw.p < ALFA) !== significant) {
    zinnen.push(`De controle met rangnummers (Mann-Whitney, ${pTekst(r.mw.p)}) komt op een andere conclusie uit. Wees daarom extra voorzichtig.`);
  }
  return { zinnen, significant, effect };
}

/** Uitleg bij drie of meer groepen. groepen: [{ naam, b: beschrijf() }] */
function duidMeerGroepen(r, groepen) {
  const significant = r.anova.p < ALFA;
  const zinnen = [significant ? ZIN_SIG_GROEPEN : ZIN_GEEN_SIG_GROEPEN];
  const opVolgorde = groepen.slice().sort((p, q) => q.b.gemiddelde - p.b.gemiddelde);
  const hoogste = opVolgorde[0];
  const laagste = opVolgorde[opVolgorde.length - 1];
  zinnen.push(`Het hoogst scoort “${hoogste.naam}” (gemiddeld ${g(hoogste.b.gemiddelde)}), het laagst “${laagste.naam}” (gemiddeld ${g(laagste.b.gemiddelde)}).`);
  const effect = S.effectGrootte(r.anova.etaKwadraat, 'eta2');
  if (effect) {
    zinnen.push(`De verschillen tussen de groepen zijn ${effectWoord(effect)} (eta² = ${g(r.anova.etaKwadraat)}).`);
  }
  if (significant) zinnen.push('De toets zegt niet wélke groepen van elkaar verschillen; kijk daarvoor naar de gemiddelden.');
  if ([r.welch, r.kw].some((c) => c && (c.p < ALFA) !== significant)) {
    zinnen.push('Niet alle toetsen komen op dezelfde conclusie uit. Wees daarom extra voorzichtig.');
  }
  return { zinnen, significant, effect };
}

/** Uitleg bij een samenhang (correlatie). x en y zijn omschrijvingen van de variabelen. */
function duidSamenhang(pr, sp, x, y) {
  const effect = S.effectGrootte(pr.r, 'r');
  const zinnen = [];
  if (effect === 'verwaarloosbaar') {
    zinnen.push(`Er is nauwelijks samenhang tussen ${voluit(x)} en ${voluit(y)} (r = ${g(pr.r)}).`);
  } else {
    zinnen.push(`Hoe hoger de score op ${voluit(x)}, hoe ${pr.r > 0 ? 'hoger' : 'lager'} meestal de score op ${voluit(y)} (verband: ${effect}, r = ${g(pr.r)}).`);
  }
  const significant = pr.p < ALFA;
  zinnen.push(significant ? ZIN_SIG_VERBAND : ZIN_GEEN_SIG_VERBAND);
  if (sp && (sp.p < ALFA) !== significant) {
    zinnen.push(`De controle met rangnummers (Spearman, ${pTekst(sp.p)}) komt op een andere conclusie uit. Wees daarom extra voorzichtig.`);
  }
  return { zinnen, significant, effect };
}

function alfaOordeel(alpha) {
  if (alpha < 0.6) return 'onvoldoende';
  if (alpha < 0.7) return 'matig';
  if (alpha < 0.8) return 'voldoende';
  if (alpha < 0.9) return 'goed';
  return 'zeer goed';
}

const ALFA_KLASSE = { onvoldoende: 'label-gevaar', matig: 'label-waarschuwing', voldoende: 'label-succes', goed: 'label-succes', 'zeer goed': 'label-succes' };
const ALFA_UITLEG = [
  ['onvoldoende', 'lager dan 0,6', 'de vragen meten niet duidelijk hetzelfde. Kijk liever naar de losse vragen dan naar de themascore.'],
  ['matig', '0,6 tot 0,7', 'de themascore is bruikbaar als grove aanwijzing.'],
  ['voldoende', '0,7 tot 0,8', 'de vragen vormen samen een bruikbare score.'],
  ['goed', '0,8 tot 0,9', 'de vragen meten duidelijk hetzelfde onderwerp.'],
  ['zeer goed', '0,9 of hoger', 'de vragen hangen heel sterk samen. Mogelijk overlappen ze zo veel dat er een vraag weg kan.'],
];

/** Klasse voor de kleur van een cel in de samenhangtabel. */
function rKlasse(r) {
  const sterkte = Math.abs(r) >= 0.5 ? 3 : Math.abs(r) >= 0.3 ? 2 : Math.abs(r) >= 0.1 ? 1 : 0;
  return sterkte === 0 ? 'an-r-0' : `an-r-${r > 0 ? 'p' : 'n'}${sterkte}`;
}

// ---------- Het scherm ----------

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const basis = `#/onderzoek/${onderzoekId}`;
  const drempel = Number(ctx.instellingen && ctx.instellingen.drempel) || 5;
  const stuksoorten = (ctx.instellingen && ctx.instellingen.stuksoorten) || null;
  ctx.zetTitel(`Analyse – ${ctx.onderzoek.onderzoek.titel}`);

  vervang(container, h('div', { class: 'analyse' }, laden('De antwoorden worden geladen…')));
  const data = await api.get(`/onderzoeken/${onderzoekId}/export/data`);
  if (!container.isConnected) return;
  const model = bouwModel(data);

  if (!keuzes.has(onderzoekId)) keuzes.set(onderzoekId, {});
  const keuze = keuzes.get(onderzoekId);

  const lijstenMetData = model.lijsten.filter((l) => l.inz.length > 0);
  const mmNaam = new Map(model.meetmomenten.map((mm) => [mm.id, mm.naam]));
  const lijstNaam = (l) => (l.meetmoment_id && mmNaam.has(l.meetmoment_id) ? `${l.titel}, ${mmNaam.get(l.meetmoment_id)}` : l.titel);

  // ---------- Bouwstenen ----------

  const status = h('div', { class: 'sr-only', role: 'status' });
  function meldBijgewerkt() {
    status.textContent = '';
    setTimeout(() => {
      status.textContent = 'De uitkomst is bijgewerkt.';
    }, 60);
  }

  function scrollNaar(el) {
    const rustig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'start' });
    const kop = el.querySelector('h2');
    if (kop) kop.focus({ preventScroll: true });
  }

  /** Kaart met kop en uitleg; de inhoud wordt later gevuld (en opnieuw bij een andere keuze). */
  function maakKaart(id, nummer, titel, uitleg) {
    const inhoud = h('div', { class: 'an-kaart-inhoud' });
    const el = h('section', { class: 'kaart an-kaart', id, 'aria-labelledby': `${id}-kop` },
      h('h2', { id: `${id}-kop`, tabindex: '-1' }, `${nummer}. ${titel}`),
      h('p', { class: 'an-uitleg' }, uitleg),
      inhoud);
    return { el, inhoud, titel, nummer };
  }

  /** Keuzelijst met label. groepen: [{ groep, opties: [{ waarde, label }] }] of losse opties. */
  function kiesVeld(id, label, groepen, waarde, bijKeuze, hulp = null) {
    const optie = (o) => h('option', { value: o.waarde }, o.label);
    const select = h('select', {
      id,
      onchange: (e) => {
        bijKeuze(e.target.value);
        meldBijgewerkt();
      },
    }, groepen.map((gr) => (gr.groep ? h('optgroup', { label: gr.groep }, gr.opties.map(optie)) : optie(gr))));
    select.value = String(waarde);
    return h('div', { class: 'veld' },
      h('label', { for: id }, label),
      select,
      hulp ? h('div', { class: 'veld-hulp' }, hulp) : null);
  }

  function stukKnop(maakTekst, onderwerp) {
    return h('button', {
      type: 'button',
      class: 'knop knop-klein an-stukknop',
      'aria-haspopup': 'dialog',
      onclick: () => neemOpInStuk({ onderzoekId, tekst: maakTekst(), alleenLezen: ctx.alleenLezen, stuksoorten }),
    }, ctx.alleenLezen ? 'Tekst kopiëren' : 'Neem op in stuk', h('span', { class: 'sr-only' }, `: ${onderwerp}`));
  }

  /** Kop boven een uitkomst, met rechts de knop "Neem op in stuk". */
  function uitkomstKop(titel, knop = null) {
    return h('div', { class: 'an-uitkomst-kop' }, h('h3', {}, titel), knop);
  }

  /** Tabel met aantal, gemiddelde en spreiding per groep of meetmoment. rijen: [{ naam, b }] */
  function beschrijfTabel(kopNaam, rijen, bijschrift) {
    // Op een smal scherm staat de korte kop er (n, gem., sd); schermlezers krijgen altijd de lange.
    const kop = (lang, kortKop) => h('th', { scope: 'col', class: 'rechts' },
      h('span', { class: 'an-kop-lang' }, lang),
      h('span', { class: 'an-kop-kort', 'aria-hidden': 'true' }, kortKop));
    return h('div', { class: 'tabel-wrapper' },
      h('table', { class: 'tabel an-tabel' },
        h('caption', { class: 'sr-only' }, bijschrift),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, kopNaam),
          kop('Aantal (n)', 'n'),
          kop('Gemiddelde', 'gem.'),
          kop('Spreiding (sd)', 'sd'))),
        h('tbody', {}, rijen.map((r) => h('tr', {},
          h('th', { scope: 'row' }, r.naam),
          h('td', { class: 'rechts getal' }, Number(r.b.n).toLocaleString('nl-NL')),
          h('td', { class: 'rechts getal' }, g(r.b.gemiddelde)),
          h('td', { class: 'rechts getal' }, g(r.b.sd)))))));
  }

  /** Lijst met uitkomsten. rijen: [[naam, waarde, toelichting]] (lege rijen worden overgeslagen). */
  function uitkomsten(rijen) {
    return h('dl', { class: 'an-uitkomsten' }, rijen.filter(Boolean).map(([naam, waarde, toelichting]) =>
      h('div', { class: 'an-uitkomst' },
        h('dt', {}, naam),
        h('dd', {}, h('span', { class: 'an-waarde getal' }, waarde), toelichting ? h('span', { class: 'an-toelichting' }, toelichting) : null))));
  }

  /** Blok "Wat betekent dit?" met de conclusie in gewone taal. */
  function conclusie(duiding, letOp) {
    return h('div', { class: `an-conclusie${duiding.significant ? ' an-conclusie-sig' : ''}` },
      h('div', { class: 'an-conclusie-kop' },
        h('strong', {}, 'Wat betekent dit?'),
        h('span', { class: `label ${duiding.significant ? 'label-primair' : ''}` }, duiding.significant ? 'Significant' : 'Niet significant'),
        duiding.effect ? h('span', { class: 'label' }, `Effect: ${duiding.effect}`) : null),
      h('p', {}, duiding.zinnen.join(' ')),
      h('p', { class: 'an-letop' }, letOp));
  }

  /** Keuze van de vragenlijst voor onderdeel 2 t/m 5 (alleen als er meer dan één is met antwoorden). */
  function lijstVeld(naam) {
    if (lijstenMetData.length < 2) return null;
    const id = `an-lijst-${naam}`;
    return kiesVeld(id, 'Vragenlijst',
      lijstenMetData.map((l) => ({ waarde: String(l.id), label: `${lijstNaam(l)} – ${aantal(l.inz.length, 'antwoord', 'antwoorden')}` })),
      String(keuze.lijst),
      (w) => {
        keuze.lijst = Number(w);
        tekenLijstKaarten();
        const zelfde = document.getElementById(id);
        if (zelfde) zelfde.focus();
      },
      'Geldt ook voor de andere onderdelen op deze pagina.');
  }

  const gekozenLijst = () => lijstenMetData.find((l) => l.id === keuze.lijst) || lijstenMetData[lijstenMetData.length - 1];

  // ---------- Twee groepen: gedeeld door onderdeel 1 en 2 ----------

  function rekenTweeGroepen(a, b) {
    return { A: S.beschrijf(a), B: S.beschrijf(b), welch: S.welchT(a, b), mw: S.mannWhitney(a, b), d: S.cohensD(a, b) };
  }

  function uitkomstenTweeGroepen(r, naamVerschil) {
    return uitkomsten([
      ['Verschil', metTeken(r.welch.verschil), `${naamVerschil}. Het echte verschil ligt waarschijnlijk tussen ${g(r.welch.ciLaag)} en ${g(r.welch.ciHoog)} (95%-interval).`],
      ['Toets op het verschil (Welch t-toets)', `t(${dfTekst(r.welch.df)}) = ${g(r.welch.t)}; ${pTekst(r.welch.p)}`, null],
      r.mw ? ['Controle met rangnummers (Mann-Whitney)', `U = ${g(r.mw.u, Number.isInteger(r.mw.u) ? 0 : 1)}; z = ${g(r.mw.z)}; ${pTekst(r.mw.p)}`,
        'Deze toets past bij antwoorden op een schaal van 1 tot 5. Komt hij op hetzelfde uit, dan is de conclusie steviger.'] : null,
      r.d ? ['Effectgrootte (Hedges’ g)', `${g(r.d.g)} – ${S.effectGrootte(r.d.g, 'g')}`, `95%-interval ${bereik(r.d.ciLaag, r.d.ciHoog)}. Vuistregel: vanaf 0,2 klein, vanaf 0,5 middelgroot, vanaf 0,8 groot.`] : null,
    ]);
  }

  function regelsTweeGroepen(r, naamA, naamB) {
    return [
      `- ${naamA}: gemiddeld ${g(r.A.gemiddelde)} (sd ${g(r.A.sd)}; ${nTekst(r.A.n)})`,
      `- ${naamB}: gemiddeld ${g(r.B.gemiddelde)} (sd ${g(r.B.sd)}; ${nTekst(r.B.n)})`,
      `- Verschil: ${metTeken(r.welch.verschil)} (95%-betrouwbaarheidsinterval ${bereik(r.welch.ciLaag, r.welch.ciHoog)})`,
      `- Welch t-toets: t(${dfTekst(r.welch.df)}) = ${g(r.welch.t)}; ${pTekst(r.welch.p)}`,
      r.mw ? `- Mann-Whitney-toets: z = ${g(r.mw.z)}; ${pTekst(r.mw.p)}` : null,
      r.d ? `- Effectgrootte: Hedges' g = ${g(r.d.g)} (${S.effectGrootte(r.d.g, 'g')})` : null,
    ].filter(Boolean);
  }

  const GEEN_SPREIDING = 'Alle scores zijn precies gelijk. Zonder verschillen in de antwoorden valt er niets te toetsen.';

  // ---------- 1. Verschil tussen meetmomenten ----------

  const lijstenMetMoment = model.lijsten.filter((l) => l.meetmoment_id && mmNaam.has(l.meetmoment_id));
  const aantalOpMoment = (mmId) => lijstenMetMoment.filter((l) => l.meetmoment_id === mmId).reduce((t, l) => t + l.inz.length, 0);

  /** Alle geldige scores van een variabele op één meetmoment (alle vragenlijsten van dat meetmoment samen). */
  function scoresOpMoment(mmId, sleutel) {
    const uit = [];
    let gemeten = false;
    for (const l of lijstenMetMoment) {
      if (l.meetmoment_id !== mmId) continue;
      const w = waardenVan(l, sleutel);
      if (!w) continue;
      gemeten = true;
      for (const x of w) if (x !== null) uit.push(x);
    }
    return { waarden: uit, gemeten };
  }

  function vulMeetmomenten(kaart) {
    const metData = model.meetmomenten.filter((mm) => aantalOpMoment(mm.id) > 0);
    if (metData.length < 2) {
      vervang(kaart.inhoud, leeg(
        metData.length === 1
          ? `Hiervoor heb je twee meetmomenten met antwoorden nodig. Nu zijn er alleen antwoorden bij “${metData[0].naam}”. Voeg bij Opzet een meetmoment toe (bijvoorbeeld Vervolgmeting) en maak bij Vragenlijsten een kopie van de vragenlijst voor dat meetmoment.`
          : 'Hiervoor heb je twee meetmomenten met antwoorden nodig. Koppel je vragenlijsten aan een meetmoment en zet ze uit.',
        ctx.alleenLezen ? null : h('a', { class: 'knop', href: `${basis}/vragenlijsten` }, 'Naar Vragenlijsten')));
      return;
    }
    const opties = variabeleOpties(model, lijstenMetMoment);
    if (!opties.length) {
      vervang(kaart.inhoud, leeg('De vragenlijsten hebben geen schaalvragen (1 tot 5), dus er zijn geen scores om te vergelijken.'));
      return;
    }
    if (!metData.some((mm) => mm.id === keuze.mmA)) keuze.mmA = metData[0].id;
    if (!metData.some((mm) => mm.id === keuze.mmB)) keuze.mmB = metData[metData.length - 1].id;
    if (!heeftOptie(opties, keuze.wat1)) keuze.wat1 = alleOpties(opties)[0].waarde;

    const mmOpties = metData.map((mm) => ({ waarde: String(mm.id), label: `${mm.naam} – ${aantal(aantalOpMoment(mm.id), 'antwoord', 'antwoorden')}` }));
    const uitkomstEl = h('div', { class: 'an-resultaat' });
    const alleEl = h('div', { class: 'an-resultaat' });
    const teken = () => {
      vervang(uitkomstEl, uitkomstMeetmomenten());
      vervang(alleEl, alleThemas());
    };
    vervang(kaart.inhoud,
      h('div', { class: 'an-keuzes' },
        kiesVeld('an-wat1', 'Wat wil je vergelijken?', opties, keuze.wat1, (w) => { keuze.wat1 = w; teken(); }),
        kiesVeld('an-mm-a', 'Eerste meetmoment', mmOpties, keuze.mmA, (w) => { keuze.mmA = Number(w); teken(); }),
        kiesVeld('an-mm-b', 'Tweede meetmoment', mmOpties, keuze.mmB, (w) => { keuze.mmB = Number(w); teken(); })),
      uitkomstEl,
      alleEl,
      h('p', { class: 'an-noot' },
        h('strong', {}, 'Goed om te weten: '),
        'de vragenlijst is anoniem, dus de antwoorden van dezelfde persoon op twee meetmomenten zijn niet aan elkaar te koppelen. ',
        'Daarom vergelijken we de meetmomenten als twee losse groepen. Hebben er op de twee momenten heel andere mensen meegedaan, dan kan een verschil ook daardoor komen. ',
        'Horen er meer vragenlijsten bij een meetmoment, dan tellen ze samen. Vragenlijsten zonder meetmoment tellen hier niet mee.'));
    teken();
  }

  function uitkomstMeetmomenten() {
    const naamA = mmNaam.get(keuze.mmA);
    const naamB = mmNaam.get(keuze.mmB);
    const wat = omschrijf(model, lijstenMetMoment, keuze.wat1);
    if (keuze.mmA === keuze.mmB) return melding('Kies twee verschillende meetmomenten om te vergelijken.');
    const A = scoresOpMoment(keuze.mmA, keuze.wat1);
    const B = scoresOpMoment(keuze.mmB, keuze.wat1);
    const ontbreekt = [[A, naamA], [B, naamB]].filter(([s]) => !s.gemeten).map(([, naam]) => naam);
    if (ontbreekt.length) {
      return melding(`${alsTitel(wat)} is bij ${opsomming(ontbreekt)} niet gemeten met een schaalvraag. Kies iets wat op beide meetmomenten is gevraagd.`);
    }
    const teWeinig = [[A, naamA], [B, naamB]].filter(([s]) => s.waarden.length < drempel).map(([, naam]) => naam);
    if (teWeinig.length) {
      return melding(`Te weinig antwoorden om te vergelijken: bij ${opsomming(teWeinig)} hebben minder dan ${drempel} respondenten hierop een score. Vanaf ${drempel} respondenten per meetmoment kun je vergelijken.`);
    }
    const r = rekenTweeGroepen(A.waarden, B.waarden);
    const tabel = beschrijfTabel('Meetmoment', [{ naam: naamA, b: r.A }, { naam: naamB, b: r.B }], `Scores op ${voluit(wat)} per meetmoment`);
    const titel = `${alsTitel(wat)}: ${naamA} en ${naamB}`;
    if (!r.welch) return [uitkomstKop(titel), tabel, melding(GEEN_SPREIDING)];

    const duiding = duidTweeGroepen(r, (v) => (Math.abs(v) < 0.005
      ? 'De gemiddelde score is op beide meetmomenten gelijk.'
      : `Bij ${naamB} ligt de gemiddelde score ${g(Math.abs(v))} punt ${v > 0 ? 'hoger' : 'lager'} dan bij ${naamA}.`));
    const tekst = () => [
      `Verschil tussen meetmomenten – ${alsTitel(wat)}`,
      `${naamA} vergeleken met ${naamB}; schaal van 1 (laagst) tot 5 (hoogst)`,
      ...regelsTweeGroepen(r, naamA, naamB),
      `Conclusie: ${duiding.zinnen.join(' ')}`,
      'Kanttekening: de meetmomenten zijn vergeleken als twee losse groepen, omdat anonieme antwoorden niet per persoon te koppelen zijn. Significant betekent niet automatisch belangrijk.',
    ].join('\n');
    return [
      uitkomstKop(titel, stukKnop(tekst, `verschil tussen ${naamA} en ${naamB}`)),
      tabel,
      uitkomstenTweeGroepen(r, `${naamB} min ${naamA}`),
      conclusie(duiding, LET_OP_VERSCHIL),
    ];
  }

  function alleThemas() {
    if (keuze.mmA === keuze.mmB) return null;
    const naamA = mmNaam.get(keuze.mmA);
    const naamB = mmNaam.get(keuze.mmB);
    const rijen = [];
    for (const t of model.themas) {
      const sleutel = `t:${t.id}`;
      const A = scoresOpMoment(keuze.mmA, sleutel);
      const B = scoresOpMoment(keuze.mmB, sleutel);
      if (!A.gemeten || !B.gemeten) continue;
      const genoeg = A.waarden.length >= drempel && B.waarden.length >= drempel;
      const r = genoeg ? rekenTweeGroepen(A.waarden, B.waarden) : null;
      rijen.push({ naam: t.naam, r: r && r.welch ? r : null, reden: !genoeg ? `minder dan ${drempel} respondenten` : 'geen spreiding in de scores' });
    }
    if (rijen.length < 2) return null;
    const getoetst = rijen.filter((x) => x.r);
    const significant = getoetst.filter((x) => x.r.welch.p < ALFA);
    const kansToeval = getoetst.length > 1 ? Math.round((1 - (1 - ALFA) ** getoetst.length) * 100) : null;
    const effectTekst = (r) => (r.d ? `${g(r.d.g)} (${S.effectGrootte(r.d.g, 'g')})` : '–');
    const tekst = () => [
      `Verschil tussen meetmomenten per thema – ${naamA} vergeleken met ${naamB}`,
      'Gemiddelde score per thema (1 = laagst, 5 = hoogst); verschil getoetst met de Welch t-toets',
      ...rijen.map((x) => (x.r
        ? `- ${x.naam}: ${g(x.r.A.gemiddelde)} (${nTekst(x.r.A.n)}) → ${g(x.r.B.gemiddelde)} (${nTekst(x.r.B.n)}); verschil ${metTeken(x.r.welch.verschil)}; ${pTekst(x.r.welch.p)}${x.r.welch.p < ALFA ? ' (significant)' : ''}; Hedges' g = ${effectTekst(x.r)}`
        : `- ${x.naam}: niet te vergelijken (${x.reden})`)),
      getoetst.length
        ? `${significant.length} van de ${getoetst.length} verschillen ${significant.length === 1 ? 'is' : 'zijn'} statistisch significant (p < 0,05).`
        : null,
      kansToeval ? `Kanttekening: bij ${getoetst.length} toetsen tegelijk is de kans dat er minstens één door toeval significant uitvalt ongeveer ${kansToeval}%. De meetmomenten zijn vergeleken als twee losse groepen.` : null,
    ].filter(Boolean).join('\n');

    return [
      uitkomstKop("Alle thema's tegelijk", getoetst.length ? stukKnop(tekst, "verschil per thema tussen de meetmomenten") : null),
      h('div', { class: 'tabel-wrapper' },
        h('table', { class: 'tabel an-tabel an-themas' },
          h('caption', { class: 'sr-only' }, `Gemiddelde score per thema bij ${naamA} en ${naamB}, met verschil, p-waarde en effectgrootte`),
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, 'Thema'),
            h('th', { scope: 'col', class: 'rechts' }, naamA),
            h('th', { scope: 'col', class: 'rechts' }, naamB),
            h('th', { scope: 'col', class: 'rechts' }, 'Verschil'),
            h('th', { scope: 'col' }, 'p-waarde'),
            h('th', { scope: 'col' }, 'Effect (g)'))),
          h('tbody', {}, rijen.map((x) => (x.r
            ? h('tr', {},
              h('th', { scope: 'row' }, x.naam),
              // data-label: op een telefoon staan de cellen onder elkaar, elk met de naam van de kolom ervoor.
              h('td', { class: 'rechts getal', dataset: { label: naamA } }, g(x.r.A.gemiddelde), h('span', { class: 'an-n' }, nTekst(x.r.A.n))),
              h('td', { class: 'rechts getal', dataset: { label: naamB } }, g(x.r.B.gemiddelde), h('span', { class: 'an-n' }, nTekst(x.r.B.n))),
              h('td', { class: 'rechts getal', dataset: { label: 'Verschil' } }, metTeken(x.r.welch.verschil)),
              h('td', { class: 'getal', dataset: { label: 'p-waarde' } }, pTekst(x.r.welch.p), ' ',
                x.r.welch.p < ALFA ? h('span', { class: 'label label-primair' }, 'significant') : null),
              h('td', { class: 'getal', dataset: { label: 'Effect (g)' } }, effectTekst(x.r)))
            : h('tr', {},
              h('th', { scope: 'row' }, x.naam),
              h('td', { colspan: 5, class: 'zacht' }, `Niet te vergelijken: ${x.reden}.`))))))),
      kansToeval
        ? melding([
          h('strong', {}, 'Let op bij veel toetsen tegelijk. '),
          `Hoe meer toetsen je doet, hoe groter de kans dat er één door toeval “significant” uitvalt. Bij ${getoetst.length} toetsen is die kans ongeveer ${kansToeval}%. `,
          'Hecht dus vooral waarde aan verschillen met een heel kleine p-waarde of een duidelijk effect, en aan verschillen die je vooraf al verwachtte.',
        ], 'waarschuwing')
        : null,
    ];
  }

  // ---------- 2. Verschil tussen groepen ----------

  function vulGroepen(kaart) {
    const lijst = gekozenLijst();
    const uitsplitsvragen = lijst.vragen.filter((q) => q.uitsplitsen && isKeuzevraag(q));
    const opties = variabeleOpties(model, [lijst]);
    const keuzeLijst = lijstVeld('groepen');
    if (!uitsplitsvragen.length) {
      vervang(kaart.inhoud,
        keuzeLijst ? h('div', { class: 'an-keuzes' }, keuzeLijst) : null,
        leeg(
          'In deze vragenlijst is nog geen vraag gemarkeerd om op uit te splitsen. Zet bij een ja/nee-vraag of een meerkeuzevraag met één antwoord, zoals “Op welke afdeling werk je?”, de optie voor uitsplitsing aan.',
          ctx.alleenLezen ? null : h('a', { class: 'knop', href: `${basis}/vragenlijsten/${lijst.id}` }, 'Vragenlijst openen')));
      return;
    }
    if (!opties.length) {
      vervang(kaart.inhoud,
        keuzeLijst ? h('div', { class: 'an-keuzes' }, keuzeLijst) : null,
        leeg('Deze vragenlijst heeft geen schaalvragen (1 tot 5), dus er zijn geen scores om per groep te vergelijken.'));
      return;
    }
    if (!uitsplitsvragen.some((q) => q.stam === keuze.uitsplits)) keuze.uitsplits = uitsplitsvragen[0].stam;
    if (!heeftOptie(opties, keuze.wat2)) keuze.wat2 = alleOpties(opties)[0].waarde;

    const uitkomstEl = h('div', { class: 'an-resultaat' });
    const teken = () => vervang(uitkomstEl, uitkomstGroepen(lijst, uitsplitsvragen.find((q) => q.stam === keuze.uitsplits)));
    vervang(kaart.inhoud,
      h('div', { class: 'an-keuzes' },
        keuzeLijst,
        kiesVeld('an-uitsplits', 'Groepen volgens de vraag', uitsplitsvragen.map((q) => ({ waarde: String(q.stam), label: kort(q.tekst, 90) })),
          String(keuze.uitsplits), (w) => { keuze.uitsplits = Number(w); teken(); }),
        kiesVeld('an-wat2', 'Wat wil je vergelijken?', opties, keuze.wat2, (w) => { keuze.wat2 = w; teken(); })),
      uitkomstEl,
      h('p', { class: 'an-noot' },
        h('strong', {}, 'Anonimiteit: '),
        `groepen met minder dan ${drempel} respondenten doen niet mee en krijgen nooit een getal. `,
        'Zo nodig blijft ook de kleinste andere groep weg, omdat een kleine groep anders uit het totaal is terug te rekenen. ',
        'Leg uitkomsten van verschillende uitsplitsingen niet naast elkaar om kleinere groepen af te leiden.'));
    teken();
  }

  function uitkomstGroepen(lijst, vraag) {
    const wat = omschrijf(model, [lijst], keuze.wat2);
    const { mee, klein, ookNiet } = verdeelGroepen(lijst, vraag, waardenVan(lijst, keuze.wat2), drempel);
    const regelKlein = klein.length ? `Niet meegenomen (minder dan ${drempel} respondenten): ${klein.map((gr) => gr.naam).join(', ')}.` : null;
    const regelOokNiet = ookNiet.length
      ? `Ook niet meegenomen: ${ookNiet.map((gr) => gr.naam).join(', ')}. Anders zijn de scores van een kleine groep terug te rekenen uit het totaal.`
      : null;
    const weggelaten = klein.length || ookNiet.length
      ? h('div', { class: 'an-weggelaten' },
        regelKlein ? h('p', {}, regelKlein) : null,
        regelOokNiet ? h('p', {}, regelOokNiet) : null)
      : null;
    const titel = `${alsTitel(wat)} per groep`;
    const kopRegels = [
      `Verschil tussen groepen – ${alsTitel(wat)}`,
      `Groepen volgens de vraag “${vraag.tekst}” – ${lijstNaam(lijst)}; schaal van 1 (laagst) tot 5 (hoogst)`,
    ];
    const voetRegels = [regelKlein, regelOokNiet].filter(Boolean);

    if (mee.length < 2) {
      return [
        uitkomstKop(titel),
        melding(`Er zijn geen twee groepen met elk minstens ${drempel} respondenten die hierop een score hebben. Een vergelijking is daarom niet mogelijk.`),
        weggelaten,
      ];
    }
    const groepen = mee.map((gr) => ({ naam: gr.naam, waarden: gr.waarden, b: S.beschrijf(gr.waarden) }));
    const tabel = beschrijfTabel('Groep', groepen, `Scores op ${voluit(wat)} per groep`);

    if (groepen.length === 2) {
      const [A, B] = groepen;
      const r = rekenTweeGroepen(A.waarden, B.waarden);
      if (!r.welch) return [uitkomstKop(titel), tabel, weggelaten, melding(GEEN_SPREIDING)];
      const duiding = duidTweeGroepen(r, (v) => (Math.abs(v) < 0.005
        ? `De groepen “${A.naam}” en “${B.naam}” scoren gemiddeld gelijk.`
        : `De groep “${B.naam}” scoort gemiddeld ${g(Math.abs(v))} punt ${v > 0 ? 'hoger' : 'lager'} dan de groep “${A.naam}”.`));
      const tekst = () => [
        ...kopRegels,
        ...regelsTweeGroepen(r, A.naam, B.naam),
        ...voetRegels,
        `Conclusie: ${duiding.zinnen.join(' ')}`,
        'Kanttekening: significant betekent niet automatisch belangrijk.',
      ].join('\n');
      return [
        uitkomstKop(titel, stukKnop(tekst, `verschil tussen de groepen ${A.naam} en ${B.naam}`)),
        tabel,
        weggelaten,
        uitkomstenTweeGroepen(r, `“${B.naam}” min “${A.naam}”`),
        conclusie(duiding, LET_OP_VERSCHIL),
      ];
    }

    const lijsten = groepen.map((gr) => gr.waarden);
    const r = { anova: S.anova(lijsten), welch: S.welchAnova(lijsten), kw: S.kruskalWallis(lijsten) };
    if (!r.anova) return [uitkomstKop(titel), tabel, weggelaten, melding(GEEN_SPREIDING)];
    const duiding = duidMeerGroepen(r, groepen);
    const etaLabel = S.effectGrootte(r.anova.etaKwadraat, 'eta2');
    const anovaTekst = `F(${dfTekst(r.anova.df1)}; ${dfTekst(r.anova.df2)}) = ${g(r.anova.f)}; ${pTekst(r.anova.p)}`;
    const welchTekst = r.welch ? `F(${dfTekst(r.welch.df1)}; ${dfTekst(r.welch.df2)}) = ${g(r.welch.f)}; ${pTekst(r.welch.p)}` : null;
    const kwTekst = r.kw ? `H(${dfTekst(r.kw.df)}) = ${g(r.kw.h)}; ${pTekst(r.kw.p)}` : null;
    const tekst = () => [
      ...kopRegels,
      ...groepen.map((gr) => `- ${gr.naam}: gemiddeld ${g(gr.b.gemiddelde)} (sd ${g(gr.b.sd)}; ${nTekst(gr.b.n)})`),
      `- Variantieanalyse (ANOVA): ${anovaTekst}`,
      welchTekst ? `- Welch-ANOVA: ${welchTekst}` : null,
      kwTekst ? `- Kruskal-Wallis-toets: ${kwTekst}` : null,
      `- Effectgrootte: eta² = ${g(r.anova.etaKwadraat)} (${etaLabel})${r.kw ? `; epsilon² = ${g(r.kw.epsilonKwadraat)} (${S.effectGrootte(r.kw.epsilonKwadraat, 'epsilon2')})` : ''}`,
      ...voetRegels,
      `Conclusie: ${duiding.zinnen.join(' ')}`,
      'Kanttekening: significant betekent niet automatisch belangrijk.',
    ].filter(Boolean).join('\n');
    return [
      uitkomstKop(titel, stukKnop(tekst, 'verschil tussen de groepen')),
      tabel,
      weggelaten,
      uitkomsten([
        ['Toets op verschil (variantieanalyse, ANOVA)', anovaTekst, 'Toetst of de gemiddelden van de groepen meer van elkaar verschillen dan je door toeval verwacht.'],
        welchTekst ? ['Controle bij ongelijke groepen (Welch-ANOVA)', welchTekst, 'Houdt er rekening mee dat de groepen niet even groot zijn of niet dezelfde spreiding hebben.'] : null,
        kwTekst ? ['Controle met rangnummers (Kruskal-Wallis)', kwTekst, 'Deze toets past bij antwoorden op een schaal van 1 tot 5.'] : null,
        ['Effectgrootte (eta²)', `${g(r.anova.etaKwadraat)} – ${etaLabel}`,
          `De groepsindeling hangt samen met ongeveer ${getal(r.anova.etaKwadraat * 100, 0)}% van de verschillen in score. Vuistregel: vanaf 0,01 klein, vanaf 0,06 middelgroot, vanaf 0,14 groot.`],
        r.kw ? ['Effectgrootte bij rangnummers (epsilon²)', `${g(r.kw.epsilonKwadraat)} – ${S.effectGrootte(r.kw.epsilonKwadraat, 'epsilon2')}`, null] : null,
      ]),
      conclusie(duiding, LET_OP_VERSCHIL),
    ];
  }

  // ---------- 3. Samenhang ----------

  function vulSamenhang(kaart) {
    const lijst = gekozenLijst();
    const opties = variabeleOpties(model, [lijst], { metJaNee: true });
    const keuzeLijst = lijstVeld('samenhang');
    const los = alleOpties(opties);
    if (los.length < 2) {
      vervang(kaart.inhoud,
        keuzeLijst ? h('div', { class: 'an-keuzes' }, keuzeLijst) : null,
        leeg('Deze vragenlijst heeft te weinig schaalvragen (1 tot 5) of ja/nee-vragen om samenhang te berekenen. Er zijn er minstens twee nodig.'));
      return;
    }
    if (!heeftOptie(opties, keuze.x)) keuze.x = los[0].waarde;
    if (!heeftOptie(opties, keuze.y) || keuze.y === keuze.x) keuze.y = (los.find((o) => o.waarde[0] === keuze.x[0] && o.waarde !== keuze.x) || los.find((o) => o.waarde !== keuze.x)).waarde;

    const uitkomstEl = h('div', { class: 'an-resultaat' });
    const teken = () => vervang(uitkomstEl, uitkomstSamenhang(lijst));
    vervang(kaart.inhoud,
      h('div', { class: 'an-keuzes' },
        keuzeLijst,
        kiesVeld('an-x', 'Eerste score', opties, keuze.x, (w) => { keuze.x = w; teken(); }),
        kiesVeld('an-y', 'Tweede score', opties, keuze.y, (w) => { keuze.y = w; teken(); })),
      uitkomstEl,
      h('div', { class: 'an-resultaat' }, samenhangThemas(lijst)));
    teken();
  }

  function uitkomstSamenhang(lijst) {
    if (keuze.x === keuze.y) return melding('Kies twee verschillende scores.');
    const x = omschrijf(model, [lijst], keuze.x);
    const y = omschrijf(model, [lijst], keuze.y);
    const xs = waardenVan(lijst, keuze.x);
    const ys = waardenVan(lijst, keuze.y);
    const paren = xs.filter((w, i) => w !== null && ys[i] !== null).length;
    if (paren < MIN_PAREN) {
      return melding(`Te weinig antwoorden: minder dan ${MIN_PAREN} respondenten hebben op beide een score. Vanaf ${MIN_PAREN} kun je samenhang berekenen.`);
    }
    const titel = `Samenhang tussen ${voluit(x)} en ${voluit(y)}`;
    const pr = S.pearson(xs, ys);
    const sp = S.spearman(xs, ys);
    if (!pr) return [uitkomstKop(titel), melding('Bij minstens één van de twee scores gaf iedereen hetzelfde antwoord. Zonder verschillen in de antwoorden is er geen samenhang te berekenen.')];

    const duiding = duidSamenhang(pr, sp, x, y);
    const overlap = vragenVan(lijst, keuze.x).some((q) => vragenVan(lijst, keuze.y).includes(q));
    const janee = x.janee || y.janee;
    const ci = eindig(pr.ciLaag) ? `95%-interval ${bereik(pr.ciLaag, pr.ciHoog)}. ` : '';
    const tekst = () => [
      `Samenhang tussen ${voluit(x)} en ${voluit(y)}`,
      `${lijstNaam(lijst)}; ${nTekst(pr.n)} (respondenten met een score op beide)`,
      `- Correlatie (Pearson): r = ${g(pr.r)}${eindig(pr.ciLaag) ? ` (95%-betrouwbaarheidsinterval ${bereik(pr.ciLaag, pr.ciHoog)})` : ''}; ${pTekst(pr.p)}`,
      sp ? `- Rangcorrelatie (Spearman): rho = ${g(sp.rho)}; ${pTekst(sp.p)}` : null,
      `- Sterkte van het verband: ${duiding.effect}`,
      janee ? '- Bij een ja/nee-vraag telt ja als 1 en nee als 0.' : null,
      overlap ? '- De twee scores overlappen (de ene is onderdeel van de andere); een deel van de samenhang is daardoor vanzelfsprekend.' : null,
      `Conclusie: ${duiding.zinnen.join(' ')}`,
      'Kanttekening: samenhang is geen oorzaak, en significant betekent niet automatisch belangrijk.',
    ].filter(Boolean).join('\n');
    return [
      uitkomstKop(titel, stukKnop(tekst, 'samenhang tussen de twee scores')),
      uitkomsten([
        ['Aantal respondenten', nTekst(pr.n), 'Alleen respondenten met een score op beide tellen mee.'],
        ['Correlatie (Pearson r)', `r = ${g(pr.r)}; ${pTekst(pr.p)}`, `${ci}Een r van 0 betekent geen samenhang; 1 of ${MIN}1 een volmaakte samenhang.`],
        sp ? ['Controle met rangnummers (Spearman)', `rho = ${g(sp.rho)}; ${pTekst(sp.p)}`, 'Deze maat past bij antwoorden op een schaal van 1 tot 5.'] : null,
        ['Sterkte van het verband', duiding.effect, 'Vuistregel: vanaf 0,1 klein, vanaf 0,3 middelgroot, vanaf 0,5 groot.'],
      ]),
      janee ? h('p', { class: 'an-noot' }, 'Bij een ja/nee-vraag telt ja als 1 en nee als 0. Een “hogere score” betekent daar dus: vaker ja.') : null,
      overlap ? melding('Deze twee scores overlappen: de ene is onderdeel van de andere. Een deel van de samenhang is daardoor vanzelfsprekend.', 'waarschuwing') : null,
      conclusie(duiding, LET_OP_VERBAND),
    ];
  }

  function samenhangThemas(lijst) {
    const themas = model.themas
      .map((t) => ({ naam: t.naam, waarden: waardenVan(lijst, `t:${t.id}`) }))
      .filter((t) => t.waarden);
    if (themas.length < 2) return null;
    const cel = (a, b) => {
      const n = a.waarden.filter((w, i) => w !== null && b.waarden[i] !== null).length;
      return n >= MIN_PAREN ? S.pearson(a.waarden, b.waarden) : null;
    };
    const matrix = themas.map((a) => themas.map((b) => (a === b ? null : cel(a, b))));
    const paren = [];
    for (let i = 0; i < themas.length; i++) {
      for (let j = i + 1; j < themas.length; j++) {
        if (matrix[i][j]) paren.push({ a: themas[i].naam, b: themas[j].naam, pr: matrix[i][j] });
      }
    }
    if (!paren.length) {
      return [
        uitkomstKop("Samenhang tussen alle thema's"),
        melding(`Te weinig antwoorden: per tweetal thema's zijn minstens ${MIN_PAREN} respondenten nodig met een score op beide.`),
      ];
    }
    paren.sort((p, q) => Math.abs(q.pr.r) - Math.abs(p.pr.r));
    const tekst = () => [
      `Samenhang tussen de thema's – ${lijstNaam(lijst)}`,
      `Correlatie (Pearson r) tussen de themascores per respondent, van sterk naar zwak; minstens ${MIN_PAREN} respondenten per tweetal`,
      ...paren.map((p) => `- ${p.a} en ${p.b}: r = ${g(p.pr.r)} (${S.effectGrootte(p.pr.r, 'r')}; ${nTekst(p.pr.n)}; ${pTekst(p.pr.p)})`),
      `Kanttekening: samenhang is geen oorzaak. Bij ${paren.length} correlaties tegelijk valt er al snel één door toeval significant uit.`,
    ].join('\n');

    return [
      uitkomstKop("Samenhang tussen alle thema's", stukKnop(tekst, "samenhang tussen alle thema's")),
      h('p', { class: 'an-uitleg' },
        'Per tweetal thema’s de correlatie (r) tussen de themascores. Blauw betekent: de scores gaan samen omhoog. Oranje of rood: als de ene hoger is, is de andere meestal lager. Hoe donkerder, hoe sterker.'),
      h('div', { class: 'tabel-wrapper' },
        h('table', { class: 'tabel an-matrix' },
          h('caption', { class: 'sr-only' }, `Correlatie tussen de themascores, ${lijstNaam(lijst)}`),
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, 'Thema'),
            themas.map((t, j) => h('th', { scope: 'col', class: 'an-matrix-kop', title: t.naam },
              h('span', { 'aria-hidden': 'true' }, String(j + 1)),
              h('span', { class: 'sr-only' }, t.naam))))),
          h('tbody', {}, themas.map((a, i) => h('tr', {},
            h('th', { scope: 'row' }, h('span', { class: 'an-matrix-nr', 'aria-hidden': 'true' }, `${i + 1}.`), ' ', a.naam),
            themas.map((b, j) => {
              if (i === j) return h('td', { class: 'an-matrix-cel an-r-zelf' }, h('span', { 'aria-hidden': 'true' }, '–'), h('span', { class: 'sr-only' }, 'hetzelfde thema'));
              const pr = matrix[i][j];
              if (!pr) {
                return h('td', { class: 'an-matrix-cel an-r-leeg', title: `Minder dan ${MIN_PAREN} respondenten of geen spreiding` },
                  h('span', { 'aria-hidden': 'true' }, '·'), h('span', { class: 'sr-only' }, 'niet te berekenen'));
              }
              return h('td', {
                class: `an-matrix-cel getal ${rKlasse(pr.r)}`,
                title: `${a.naam} en ${b.naam}: r = ${g(pr.r)} (${S.effectGrootte(pr.r, 'r')}; ${nTekst(pr.n)}; ${pTekst(pr.p)})`,
              }, g(pr.r));
            })))))),
      h('ul', { class: 'an-legenda', 'aria-label': 'Legenda bij de kleuren' },
        [['an-r-n3', `${MIN}0,5 of lager`], ['an-r-n2', `vanaf ${MIN}0,3`], ['an-r-n1', `vanaf ${MIN}0,1`], ['an-r-0', 'rond 0'], ['an-r-p1', 'vanaf 0,1'], ['an-r-p2', 'vanaf 0,3'], ['an-r-p3', '0,5 of hoger']]
          .map(([klasse, label]) => h('li', {}, h('span', { class: `an-swatch ${klasse}`, 'aria-hidden': 'true' }), label))),
      h('p', { class: 'an-noot' },
        `Per tweetal tellen alleen respondenten mee met een score op beide thema's (minstens ${MIN_PAREN}). Een punt (·) betekent: niet te berekenen. `,
        'Bij zoveel correlaties tegelijk valt er al snel één door toeval significant uit; kijk vooral naar de sterke verbanden.'),
    ];
  }

  // ---------- 4. Betrouwbaarheid van de thema's ----------

  function vulBetrouwbaarheid(kaart) {
    const lijst = gekozenLijst();
    const keuzeLijst = lijstVeld('betrouwbaarheid');
    const rijen = [];
    for (const t of model.themas) {
      const vragen = vragenVan(lijst, `t:${t.id}`);
      if (!vragen.length) continue;
      if (vragen.length < 2) {
        rijen.push({ naam: t.naam, k: vragen.length, reden: 'Eén schaalvraag: niet te berekenen.' });
        continue;
      }
      const volledig = lijst.inz.map((a) => vragen.map((q) => schaalWaarde(a[q.id]))).filter((rij) => rij.every((x) => x !== null));
      if (volledig.length < MIN_PAREN) {
        rijen.push({ naam: t.naam, k: vragen.length, reden: `Minder dan ${MIN_PAREN} respondenten vulden alle vragen in.` });
        continue;
      }
      const uit = S.cronbachAlpha(volledig);
      if (!uit) rijen.push({ naam: t.naam, k: vragen.length, reden: 'Geen spreiding in de antwoorden: niet te berekenen.' });
      else rijen.push({ naam: t.naam, k: uit.k, n: uit.n, alpha: uit.alpha, oordeel: alfaOordeel(uit.alpha) });
    }
    if (!rijen.length) {
      vervang(kaart.inhoud,
        keuzeLijst ? h('div', { class: 'an-keuzes' }, keuzeLijst) : null,
        leeg('Deze vragenlijst heeft geen schaalvragen (1 tot 5), dus er valt geen betrouwbaarheid te berekenen.'));
      return;
    }
    const berekend = rijen.filter((r) => r.oordeel);
    const negatief = berekend.some((r) => r.alpha < 0);
    const tekst = () => [
      `Betrouwbaarheid van de thema's (Cronbachs alfa) – ${lijstNaam(lijst)}`,
      'Alfa laat zien of de schaalvragen van een thema samen één onderwerp meten; vanaf 0,7 is dat voldoende.',
      ...rijen.map((r) => (r.oordeel
        ? `- ${r.naam}: alfa = ${g(r.alpha)} (${r.oordeel}; ${aantal(r.k, 'vraag', 'vragen')}; ${nTekst(r.n)})`
        : `- ${r.naam}: ${r.reden.charAt(0).toLowerCase()}${r.reden.slice(1)}`)),
      'Alleen respondenten die alle vragen van het thema invulden, tellen mee.',
    ].join('\n');

    vervang(kaart.inhoud,
      keuzeLijst ? h('div', { class: 'an-keuzes' }, keuzeLijst) : null,
      h('div', { class: 'an-resultaat' },
        uitkomstKop(`Cronbachs alfa per thema`, berekend.length ? stukKnop(tekst, "betrouwbaarheid van de thema's") : null),
        h('div', { class: 'tabel-wrapper' },
          h('table', { class: 'tabel an-tabel' },
            h('caption', { class: 'sr-only' }, `Cronbachs alfa per thema, ${lijstNaam(lijst)}`),
            h('thead', {}, h('tr', {},
              h('th', { scope: 'col' }, 'Thema'),
              h('th', { scope: 'col', class: 'rechts' }, 'Alfa'),
              h('th', { scope: 'col' }, 'Oordeel'))),
            h('tbody', {}, rijen.map((r) => (r.oordeel
              ? h('tr', {},
                h('th', { scope: 'row' }, r.naam, h('span', { class: 'an-n' }, `${aantal(r.k, 'vraag', 'vragen')} · ${nTekst(r.n)}`)),
                h('td', { class: 'rechts getal' }, g(r.alpha)),
                h('td', {}, h('span', { class: `label ${ALFA_KLASSE[r.oordeel]}` }, r.oordeel)))
              : h('tr', {},
                h('th', { scope: 'row' }, r.naam, h('span', { class: 'an-n' }, aantal(r.k, 'vraag', 'vragen'))),
                h('td', { colspan: 2, class: 'zacht' }, r.reden))))))),
        negatief
          ? melding('Een negatieve alfa betekent dat vragen tegen elkaar in gaan. Staat er in dat thema een vraag die andersom is geformuleerd (hoog = ongunstig)?', 'waarschuwing')
          : null,
        h('div', { class: 'an-conclusie' },
          h('div', { class: 'an-conclusie-kop' }, h('strong', {}, 'Wat betekent dit?')),
          h('p', {}, 'Cronbachs alfa loopt meestal van 0 tot 1. Hoe hoger, hoe meer de vragen van een thema hetzelfde meten, en hoe beter je de themascore als één cijfer kunt gebruiken.'),
          h('ul', { class: 'an-alfa-uitleg' }, ALFA_UITLEG.map(([oordeel, grens, uitleg]) =>
            h('li', {}, h('span', { class: `label ${ALFA_KLASSE[oordeel]}` }, oordeel), ` ${grens}: ${uitleg}`))),
          h('p', { class: 'an-letop' }, 'Let op: alfa wordt vanzelf hoger bij meer vragen en lager bij maar twee of drie vragen. Een lage alfa bij een thema met weinig vragen is dus minder erg. Alleen respondenten die alle vragen van het thema invulden, tellen mee.'))));
  }

  // ---------- 5. Verband tussen twee keuzevragen ----------

  function vulKeuzevragen(kaart) {
    const lijst = gekozenLijst();
    const keuzeLijst = lijstVeld('keuzevragen');
    const vragen = lijst.vragen.filter(isKeuzevraag);
    if (vragen.length < 2) {
      vervang(kaart.inhoud,
        keuzeLijst ? h('div', { class: 'an-keuzes' }, keuzeLijst) : null,
        leeg('Hiervoor zijn twee keuzevragen nodig: ja/nee-vragen of meerkeuzevragen met één antwoord, zoals “Op welke afdeling werk je?”. Deze vragenlijst heeft er minder dan twee.'));
      return;
    }
    if (!vragen.some((q) => q.stam === keuze.k1)) keuze.k1 = vragen[0].stam;
    if (!vragen.some((q) => q.stam === keuze.k2) || keuze.k2 === keuze.k1) keuze.k2 = vragen.find((q) => q.stam !== keuze.k1).stam;
    const opties = vragen.map((q) => ({ waarde: String(q.stam), label: kort(q.tekst, 90) }));
    const uitkomstEl = h('div', { class: 'an-resultaat' });
    const teken = () => vervang(uitkomstEl, uitkomstKeuzevragen(lijst, vragen.find((q) => q.stam === keuze.k1), vragen.find((q) => q.stam === keuze.k2)));
    vervang(kaart.inhoud,
      h('div', { class: 'an-keuzes' },
        keuzeLijst,
        kiesVeld('an-k1', 'Eerste vraag (rijen)', opties, String(keuze.k1), (w) => { keuze.k1 = Number(w); teken(); }),
        kiesVeld('an-k2', 'Tweede vraag (kolommen)', opties, String(keuze.k2), (w) => { keuze.k2 = Number(w); teken(); })),
      uitkomstEl);
    teken();
  }

  function uitkomstKeuzevragen(lijst, v1, v2) {
    if (v1 === v2) return melding('Kies twee verschillende vragen.');
    const rijOpties = optiesVan(v1);
    const kolOpties = optiesVan(v2);
    const rijIndex = new Map(rijOpties.map((o, i) => [o.id, i]));
    const kolIndex = new Map(kolOpties.map((o, j) => [o.id, j]));
    const vol = rijOpties.map(() => kolOpties.map(() => 0));
    let n = 0;
    for (const a of lijst.inz) {
      const i = rijIndex.get(categorie(v1, a));
      const j = kolIndex.get(categorie(v2, a));
      if (i === undefined || j === undefined) continue;
      vol[i][j]++;
      n++;
    }
    if (n < MIN_PAREN) {
      return melding(`Te weinig antwoorden: minder dan ${MIN_PAREN} respondenten beantwoordden beide vragen. Vanaf ${MIN_PAREN} kun je een verband toetsen.`);
    }
    // Antwoorden die niemand koos, doen niet mee (ook niet in de toets).
    const rijen = rijOpties.map((o, i) => ({ label: o.label, i })).filter((r) => vol[r.i].some((c) => c > 0));
    const kolommen = kolOpties.map((o, j) => ({ label: o.label, j })).filter((k) => vol.some((rij) => rij[k.j] > 0));
    const titel = 'Verband tussen de twee vragen';
    if (rijen.length < 2 || kolommen.length < 2) {
      return [uitkomstKop(titel), melding('Op minstens één van de twee vragen gaf iedereen hetzelfde antwoord. Dan is er geen verband te toetsen.')];
    }
    const tabel = rijen.map((r) => kolommen.map((k) => vol[r.i][k.j]));
    const uit = S.chiKwadraat(tabel);
    if (!uit) return [uitkomstKop(titel), melding('Het verband is met deze antwoorden niet te berekenen.')];

    const rijTotaal = tabel.map((rij) => rij.reduce((t, c) => t + c, 0));
    const kolTotaal = kolommen.map((_, j) => tabel.reduce((t, rij) => t + rij[j], 0));
    let kleinVerwacht = 0;
    let ergKlein = false;
    for (const rt of rijTotaal) {
      for (const kt of kolTotaal) {
        const verwacht = (rt * kt) / n;
        if (verwacht < 5) kleinVerwacht++;
        if (verwacht < 1) ergKlein = true;
      }
    }
    const cellen = rijen.length * kolommen.length;
    const onbetrouwbaar = ergKlein || kleinVerwacht / cellen > 0.2;

    const significant = uit.p < ALFA;
    const effect = S.effectGrootte(uit.cramersV, 'v');
    const zinnen = [];
    if (significant) {
      zinnen.push('Er is een statistisch significant verband tussen de antwoorden op de twee vragen: het is onwaarschijnlijk dat het alleen door toeval komt.');
    } else {
      zinnen.push('Niet significant: de antwoorden op de ene vraag hangen niet aantoonbaar samen met die op de andere. Verschillen die je ziet, kunnen goed door toeval komen.');
    }
    zinnen.push(`Het verband is ${effectWoord(effect)} (Cramérs V = ${g(uit.cramersV)}).`);
    if (onbetrouwbaar) zinnen.push('Omdat de aantallen klein zijn, is deze uitkomst niet betrouwbaar; trek er geen stevige conclusies uit.');
    const duiding = { zinnen, significant, effect };

    const verborgen = maskeerKruistabel(tabel, drempel);
    const ietsZichtbaar = verborgen.some((rij) => rij.some((weg) => !weg));
    const ietsVerborgen = verborgen.some((rij) => rij.some((weg) => weg));
    const celTekst = (i, j) => (verborgen[i][j] ? '×' : Number(tabel[i][j]).toLocaleString('nl-NL'));
    const legenda = ietsVerborgen
      ? `× = niet getoond. Het gaat om minder dan ${drempel} respondenten, of het aantal is verborgen omdat zo’n klein aantal anders is terug te rekenen uit de totalen.`
      : null;
    const waarschuwing = kleinVerwacht
      ? `In ${kleinVerwacht} van de ${cellen} cellen is het aantal dat je zonder verband zou verwachten kleiner dan 5. ${onbetrouwbaar
        ? 'De toets is daardoor niet betrouwbaar. Wacht op meer respondenten of gebruik vragen met minder antwoordmogelijkheden.'
        : 'De uitkomst is daardoor iets minder betrouwbaar.'}`
      : null;
    const toetsTekst = `chi²(${dfTekst(uit.df)}) = ${g(uit.chi2)}; ${pTekst(uit.p)}`;

    const tekst = () => [
      `Verband tussen twee keuzevragen – ${lijstNaam(lijst)} (${nTekst(n)})`,
      `Rijen: “${v1.tekst}”`,
      `Kolommen: “${v2.tekst}”`,
      ...(ietsZichtbaar
        ? rijen.map((r, i) => `- ${r.label}: ${kolommen.map((k, j) => `${k.label} ${celTekst(i, j)}`).join('; ')}`)
        : ['De aantallen per combinatie zijn te klein om te tonen.']),
      ietsZichtbaar ? legenda : null,
      `- Chi-kwadraattoets: ${toetsTekst}`,
      `- Sterkte van het verband: Cramérs V = ${g(uit.cramersV)} (${effect})`,
      waarschuwing ? `Waarschuwing: ${waarschuwing}` : null,
      `Conclusie: ${zinnen.join(' ')}`,
      'Kanttekening: samenhang is geen oorzaak, en significant betekent niet automatisch belangrijk.',
    ].filter(Boolean).join('\n');

    return [
      uitkomstKop(titel, stukKnop(tekst, 'verband tussen twee keuzevragen')),
      h('p', { class: 'an-kruis-vragen' },
        h('span', {}, h('strong', {}, 'Rijen: '), v1.tekst), ' ',
        h('span', {}, h('strong', {}, 'Kolommen: '), v2.tekst)),
      ietsZichtbaar
        ? h('div', { class: 'tabel-wrapper' },
          h('table', { class: 'tabel an-tabel an-kruistabel' },
            h('caption', { class: 'sr-only' }, `Aantal respondenten per combinatie van antwoorden. Rijen: ${v1.tekst} Kolommen: ${v2.tekst}`),
            h('thead', {}, h('tr', {},
              h('td', {}),
              kolommen.map((k) => h('th', { scope: 'col', class: 'rechts' }, k.label)))),
            h('tbody', {}, rijen.map((r, i) => h('tr', {},
              h('th', { scope: 'row' }, r.label),
              kolommen.map((_, j) => {
                if (!verborgen[i][j]) return h('td', { class: 'rechts getal' }, celTekst(i, j));
                return h('td', { class: 'rechts getal an-cel-verborgen', title: 'Niet getoond' },
                  h('span', { 'aria-hidden': 'true' }, celTekst(i, j)),
                  h('span', { class: 'sr-only' }, 'niet getoond'));
              }))))))
        : melding(`De kruistabel wordt niet getoond: de aantallen per combinatie zijn te klein (minder dan ${drempel} respondenten) of zouden terug te rekenen zijn.`),
      ietsZichtbaar && legenda ? h('p', { class: 'an-noot' }, legenda) : null,
      uitkomsten([
        ['Aantal respondenten', nTekst(n), 'Alleen respondenten die beide vragen beantwoordden, tellen mee. Antwoorden die niemand koos, zijn weggelaten.'],
        ['Toets op verband (chi-kwadraat)', toetsTekst, 'Toetst of de verdeling van de antwoorden op de ene vraag verschilt per antwoord op de andere vraag.'],
        ['Sterkte van het verband (Cramérs V)', `${g(uit.cramersV)} – ${effect}`, 'Loopt van 0 (geen verband) tot 1 (volmaakt verband). Vuistregel: vanaf 0,1 klein, vanaf 0,3 middelgroot, vanaf 0,5 groot.'],
      ]),
      waarschuwing ? melding([h('strong', {}, onbetrouwbaar ? 'Toets niet betrouwbaar. ' : 'Kleine aantallen. '), waarschuwing], 'waarschuwing') : null,
      conclusie(duiding, LET_OP_VERBAND),
    ];
  }

  // ---------- Opbouw van de pagina ----------

  const kaarten = {
    meetmomenten: maakKaart('an-meetmomenten', 1, 'Verschil tussen meetmomenten',
      'Gebruik dit als je dezelfde vragen op twee momenten hebt gesteld, bijvoorbeeld bij de nulmeting en de vervolgmeting. Je ziet of de score is veranderd en of dat verschil meer is dan toeval.'),
    groepen: maakKaart('an-groepen', 2, 'Verschil tussen groepen',
      'Gebruik dit om te zien of groepen verschillend scoren, bijvoorbeeld afdelingen. De antwoorden op een uitsplitsvraag vormen de groepen.'),
    samenhang: maakKaart('an-samenhang', 3, 'Samenhang',
      `Gebruik dit om te zien of twee scores samengaan, bijvoorbeeld werkdruk en betrokkenheid. Er zijn minstens ${MIN_PAREN} respondenten nodig met een score op beide.`),
    betrouwbaarheid: maakKaart('an-betrouwbaarheid', 4, "Betrouwbaarheid van de thema's",
      `Gebruik dit om te controleren of de vragen van een thema samen één onderwerp meten. Dat kan bij thema's met minstens twee schaalvragen en ${MIN_PAREN} respondenten die ze allemaal invulden.`),
    keuzevragen: maakKaart('an-keuzevragen', 5, 'Verband tussen twee keuzevragen',
      'Gebruik dit voor vragen met vaste antwoorden, zoals ja/nee of afdeling. Je ziet of de antwoorden op de ene vraag samenhangen met die op de andere.'),
  };

  function tekenLijstKaarten() {
    vulGroepen(kaarten.groepen);
    vulSamenhang(kaarten.samenhang);
    vulBetrouwbaarheid(kaarten.betrouwbaarheid);
    vulKeuzevragen(kaarten.keuzevragen);
  }

  const VRAGEN = [
    [kaarten.meetmomenten, 'Is een score veranderd tussen twee meetmomenten?'],
    [kaarten.groepen, 'Scoren groepen, zoals afdelingen, verschillend?'],
    [kaarten.samenhang, 'Hangen twee scores met elkaar samen?'],
    [kaarten.betrouwbaarheid, "Meten de vragen van een thema hetzelfde?"],
    [kaarten.keuzevragen, 'Hangen de antwoorden op twee keuzevragen met elkaar samen?'],
  ];

  const intro = h('section', { class: 'kaart an-intro', 'aria-labelledby': 'an-intro-kop' },
    h('h2', { id: 'an-intro-kop' }, 'Wat kun je hier?'),
    h('p', { class: 'an-uitleg' },
      'Op het dashboard zie je wát de uitkomsten zijn. Hier toets je of een verschil of verband ook echt is, of dat het net zo goed toeval kan zijn. Bij elke uitkomst staat in gewone taal wat hij betekent.'),
    h('ol', { class: 'an-vragen' }, VRAGEN.map(([kaart, vraag]) => h('li', {},
      lijstenMetData.length
        ? h('button', { type: 'button', class: 'an-vraag-knop', onclick: () => scrollNaar(kaart.el) }, vraag)
        : vraag))),
    h('details', { class: 'an-uitklap' },
      h('summary', {}, 'Zo lees je de uitkomsten'),
      h('dl', { class: 'an-begrippen' },
        h('dt', {}, 'Score'),
        h('dd', {}, 'Een antwoord op een schaalvraag telt als 1 (laagst) tot 5 (hoogst). Een thema- of meetpuntscore is per respondent het gemiddelde van de schaalvragen die erbij horen, als minstens de helft daarvan is beantwoord. Daardoor kan een gemiddelde hier iets afwijken van het dashboard.'),
        h('dt', {}, 'Aantal (n) en spreiding (sd)'),
        h('dd', {}, 'n is het aantal respondenten met een geldige score. De standaarddeviatie (sd) laat zien hoe ver de scores uit elkaar liggen: hoe groter, hoe meer de respondenten van elkaar verschillen.'),
        h('dt', {}, 'p-waarde en significant'),
        h('dd', {}, 'De p-waarde is de kans op een verschil of verband dat minstens zo groot is als gevonden, terwijl er in werkelijkheid niets aan de hand is. Is p kleiner dan 0,05, dan noemen we de uitkomst statistisch significant: toeval is dan een onwaarschijnlijke verklaring.'),
        h('dt', {}, '95%-interval'),
        h('dd', {}, 'Het gebied waarin de werkelijke waarde waarschijnlijk ligt. Hoe meer respondenten, hoe smaller het interval en hoe preciezer de uitkomst.'),
        h('dt', {}, 'Effectgrootte'),
        h('dd', {}, 'Hoe groot een verschil of verband is, los van het aantal respondenten: verwaarloosbaar, klein, middelgroot of groot. Bij veel respondenten kan ook een heel klein verschil significant zijn; de effectgrootte laat zien of het ertoe doet.'),
        h('dt', {}, 'Anonimiteit'),
        h('dd', {}, `Groepen met minder dan ${drempel} respondenten krijgen nooit een getal. Samenhang en betrouwbaarheid berekenen we pas vanaf ${MIN_PAREN} respondenten.`))));

  if (!lijstenMetData.length) {
    vervang(container, h('div', { class: 'analyse' },
      intro,
      leeg(
        model.lijsten.length
          ? `Er zijn nog geen antwoorden om te analyseren. Zodra een vragenlijst is ingevuld, kun je hier aan de slag: vanaf ${drempel} respondenten per groep of meetmoment kun je verschillen toetsen, vanaf ${MIN_PAREN} respondenten ook samenhang en betrouwbaarheid.`
          : 'Dit onderzoek heeft nog geen vragenlijst. Maak eerst een vragenlijst en zet hem uit; daarna kun je hier de antwoorden analyseren.',
        ctx.alleenLezen ? null : h('a', { class: 'knop knop-primair', href: `${basis}/vragenlijsten` }, 'Naar Vragenlijsten'))));
    return;
  }

  if (!lijstenMetData.some((l) => l.id === keuze.lijst)) keuze.lijst = lijstenMetData[lijstenMetData.length - 1].id;
  vulMeetmomenten(kaarten.meetmomenten);
  tekenLijstKaarten();
  vervang(container, h('div', { class: 'analyse' }, intro, Object.values(kaarten).map((k) => k.el), status));
}
