// Werkbank, tabblad Variabelen: de variabelenlijst (met meetniveau), eigen variabelen en selecties maken
// (D2 §4 en §11.3). Elk venster toont direct een voorbeeld (al beschermd) en de controle op terugrekenen.

import { h, vervang, maakDialoog, uniekeId, melding, meld, meldFout, vertraag, datum } from '../ui.js';
import { GROEPEN, isGetal, isIndeling } from '../werkbank/dataset.js';
import { naamFout, BEREKEN_FUNCTIES, zelfdeScore } from '../werkbank/definities.js';
import { spssNaam } from '../bestanden.js';
import { P_GEEN_DATA } from '../werkbank/uitvoer-tekst.js';
import { VERBORGEN, VERBORGEN_UITLEG } from '../privacy.js';
import { nlGetal } from '../opmaak.js';

const SOORT = { getal: 'Getal', categorie: 'Groepen', set: 'Meerdere antwoorden', tekst: 'Tekst', onbekend: 'Onbekend' };
const NIVEAUS = [['nominaal', 'Nominaal (groepen zonder volgorde)'], ['ordinaal', 'Ordinaal (groepen met volgorde)'], ['interval', 'Interval (getal)']];
const FUNCTIES = { gemiddelde: 'Gemiddelde van de vragen', som: 'Som van de vragen', aantal_geldig: 'Aantal beantwoorde vragen', zscore: 'z-score (afwijking van het gemiddelde in SD)', verschil: 'Verschil tussen twee variabelen (A − B)' };
const ONTBREKEND = ['', 'leeg', 'weet niet', 'niet gevraagd', 'eigen code', 'te weinig vragen', 'liever niet'];
/** G4: korte aanduiding bij een score die om B7 niet te gebruiken is (in keuzelijsten). */
export const B7_KORT = '(niet te gebruiken: 1 tot 4 weggevallen)';
const B7_UITLEG_THEMA = 'Niet te gebruiken: 1 tot 4 respondenten beantwoordden te weinig vragen van deze score en vallen weg. Maak met “Schaalscore maken” een score van dezelfde vragen met minimaal 1 beantwoorde vraag; dan valt niemand weg.';
/** R11: de schaalscore van "Schaalscore maken" bestaat al; verwijs daarnaar in plaats van een tweede te maken. */
export const AL_SCHAALSCORE = (naam) => `Er is al een schaalscore van deze vragen: ${naam}. Gebruik die; daarin valt niemand weg.`;
const B7_UITLEG_EIGEN = 'Niet te gebruiken: 1 tot 4 respondenten beantwoordden te weinig vragen van deze score en vallen weg. Kies “Aanpassen” en zet het minimum aantal beantwoorde vragen op 1; dan valt niemand weg.';

/** De uitleg bij een score die om B7 niet te gebruiken is; noemt de schaalscore als die er al is (R11). */
function b7Uitleg(wb, v) {
  if (v.bron !== 'thema' && v.bron !== 'meetpunt') return B7_UITLEG_EIGEN;
  const al = alGemaakt(wb, vragenVanScore(wb, v));
  return al ? `Niet te gebruiken: 1 tot 4 respondenten beantwoordden te weinig vragen van deze score en vallen weg. ${AL_SCHAALSCORE(al.naam)}` : B7_UITLEG_THEMA;
}

/** De eigen score die "Schaalscore maken" van deze vragen zou maken, als die er al is. */
function alGemaakt(wb, items) {
  return items.length ? zelfdeScore(wb.definities, { functie: 'gemiddelde', variabelen: items, min_geldig: 1 }, { datasetId: wb.datasetId() }) : null;
}

/** De schaalvragen van een thema- of meetpuntscore (dezelfde vragen als de score; G4). */
function vragenVanScore(wb, v) {
  const sleutel = v.bron === 'meetpunt' ? 'meetpunt_id' : 'thema_id';
  return wb.overzicht.variabelen.filter((x) => !x.verwijderd && x.groep === 'vraag' && x.type === 'schaal' && !x.lid_van && x[sleutel] === v[sleutel]).map((x) => x.id);
}
const kort = (x) => nlGetal(x, 2).replace(/(,\d*?)0+$/, '$1').replace(/,$/, '');

// Filterkeuze per onderzoek (blijft staan als je even een ander tabblad kiest).
const lijstKeuze = new Map();

/** Een korte naam (zoals in SPSS) uit een omschrijving, die nog niet gebruikt is. */
function voorstelNaam(wb, label, voorvoegsel = '') {
  const bezet = new Set([
    ...wb.overzicht.variabelen.map((v) => v.naam),
    ...wb.definities.filter((d) => !d.verwijderd && (d.dataset_id ?? null) === wb.datasetId()).map((d) => d.naam),
  ]);
  let basis = spssNaam(`${voorvoegsel}${label || 'eigen'}`, new Set()).toLowerCase().slice(0, 24);
  if (!/^[a-z]/.test(basis)) basis = `e_${basis}`;
  let naam = basis;
  for (let i = 2; bezet.has(naam) || naamFout(naam, { gereserveerd: new Set([...bezet].map((x) => x.toLowerCase())) }); i++) naam = `${basis}_${i}`;
  return naam;
}

const groepNaam = (v) => GROEPEN[v.groep] || v.groep;

/** Keuzelijst met optgroups per soort variabele. filter(v) bepaalt welke erin staan. */
export function variabeleSelect(wb, { id, waarde = '', filter = () => true, leeg = 'Kies een variabele', onchange = null } = {}) {
  const lijst = wb.overzicht.variabelen.filter((v) => !v.verwijderd && filter(v));
  const groepen = new Map();
  for (const v of lijst) {
    if (!groepen.has(v.groep)) groepen.set(v.groep, []);
    groepen.get(v.groep).push(v);
  }
  const volgorde = Object.keys(GROEPEN).filter((g) => groepen.has(g));
  return h('select', { id, onchange },
    h('option', { value: '' }, leeg),
    volgorde.map((g) => h('optgroup', { label: GROEPEN[g] }, groepen.get(g).map((v) => h('option', { value: v.id, selected: v.id === waarde }, `${v.naam} – ${v.label}${v.b7 ? ` ${B7_KORT}` : ''}`)))));
}

/**
 * Basis van een venster voor een definitie: velden, een voorbeeld dat meegroeit en Opslaan.
 * lees() → { soort, naam, label, definitie } of { fout }. Opslaan kan alleen als de controle in orde is.
 */
function definitieVenster(wb, { titel, intro, velden, lees, bestaand = null, knop = 'Opslaan' }) {
  return new Promise((klaar) => {
    const voorbeeld = h('div', { class: 'wb-voorbeeld', role: 'status', 'aria-live': 'polite' });
    const fout = h('div', { class: 'veld-fout', role: 'alert' });
    const ok = h('button', { type: 'submit', class: 'knop knop-primair' }, knop);
    const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
    const d = maakDialoog(titel, [intro ? h('p', { class: 'zacht' }, intro) : null, velden, h('h3', { class: 'wb-voorbeeld-kop' }, 'Voorbeeld'), voorbeeld, fout], [annuleer, ok]);
    d.classList.add('wb-dialoog');
    let laatste = { ok: false, meldingen: [] };
    const controleer = () => {
      const def = lees();
      fout.textContent = '';
      if (def.fout) {
        vervang(voorbeeld, h('p', { class: 'zacht' }, def.fout));
        laatste = { ok: false, meldingen: [def.fout] };
        return null;
      }
      const c = wb.kern.controleerIndeling({ ...def, id: bestaand?.id }, wb.bron());
      laatste = c;
      vervang(voorbeeld,
        c.voorbeeld.length ? h('ul', { class: 'wb-voorbeeld-lijst' }, c.voorbeeld.map((t) => h('li', {}, t))) : null,
        c.meldingen.map((m) => melding(m, 'waarschuwing')));
      return def;
    };
    const later = vertraag(controleer, 250);
    d.addEventListener('input', later);
    d.addEventListener('change', later);
    let resultaat = null;
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      later.annuleer();
      const def = controleer();
      if (!def) { fout.textContent = laatste.meldingen[0] || 'Vul alle velden in.'; return; }
      if (!laatste.ok) { fout.textContent = laatste.meldingen[0] || 'Dit kan zo niet.'; return; }
      ok.disabled = true;
      try {
        resultaat = await wb.bewaarDefinitie({ id: bestaand?.id || null, ...def });
        d.close();
      } catch (err) {
        fout.textContent = err.message || 'Opslaan is mislukt.';
        ok.disabled = false;
      }
    });
    annuleer.addEventListener('click', () => d.close());
    d.addEventListener('close', () => klaar(resultaat));
    d.showModal();
    controleer();
    d.querySelector('input, select, textarea')?.focus();
  });
}

/** Naam- en omschrijvingsvelden (de korte naam volgt de omschrijving tot je hem zelf aanpast). */
function naamVelden(wb, { naam = '', label = '', voorvoegsel = '' } = {}) {
  const idL = uniekeId('wb-label');
  const idN = uniekeId('wb-naam');
  const labelIn = h('input', { id: idL, type: 'text', value: label, maxlength: 200, autocomplete: 'off' });
  const naamIn = h('input', { id: idN, type: 'text', value: naam, maxlength: 32, autocomplete: 'off', spellcheck: 'false', class: 'mono' });
  let eigen = !!naam;
  naamIn.addEventListener('input', () => { eigen = true; });
  labelIn.addEventListener('input', () => { if (!eigen) naamIn.value = voorstelNaam(wb, labelIn.value, voorvoegsel); });
  if (!naam) naamIn.value = voorstelNaam(wb, label, voorvoegsel);
  return {
    el: h('div', { class: 'formulier-rij' },
      h('div', { class: 'veld' }, h('label', { for: idL }, 'Omschrijving'), labelIn),
      h('div', { class: 'veld' }, h('label', { for: idN }, 'Korte naam (zoals in SPSS)'), naamIn, h('div', { class: 'veld-hulp' }, 'Letters, cijfers en _; begint met een letter.'))),
    lees: () => ({ naam: naamIn.value.trim(), label: labelIn.value.trim() }),
  };
}

// ---------- Schaalscore berekenen ----------

export function berekenDialoog(wb, start = {}, bestaand = null) {
  const dd = bestaand?.definitie || start;
  const gekozen = new Map((dd.variabelen || []).map((x) => (typeof x === 'string' ? [x, false] : [x.id, !!x.omscoren])));
  const kandidaten = wb.overzicht.variabelen.filter((v) => !v.verwijderd && isGetal(v) && v.id !== `w:${bestaand?.id}`);
  const fId = uniekeId('wb-functie');
  const functie = h('select', { id: fId }, BEREKEN_FUNCTIES.map((f) => h('option', { value: f, selected: f === (dd.functie || 'gemiddelde') }, FUNCTIES[f])));
  const minId = uniekeId('wb-min');
  const min = h('input', { id: minId, type: 'number', min: 1, step: 1, inputmode: 'numeric', value: dd.min_geldig ?? '' });
  const zoekId = uniekeId('wb-zoek');
  const zoek = h('input', { id: zoekId, type: 'search', placeholder: 'Zoek een vraag', autocomplete: 'off' });
  // Snel kiezen: de schaalvragen van een thema (zoals de themascore; geen cijfervragen, J3).
  const themaVraag = (v, t) => v.thema_id === t && v.groep === 'vraag' && v.type === 'schaal';
  const themas = [...new Map(kandidaten.filter((v) => themaVraag(v, v.thema_id)).map((v) => [v.thema_id, wb.overzicht.variabelen.find((t) => t.id === `t:${v.thema_id}`)?.label || `Thema ${v.thema_id}`])).entries()];
  const lijst = h('div', { class: 'wb-kieslijst' });
  const tekenLijst = () => {
    const q = zoek.value.trim().toLowerCase();
    vervang(lijst, kandidaten.filter((v) => !q || `${v.naam} ${v.label}`.toLowerCase().includes(q) || gekozen.has(v.id)).map((v) => {
      const id = uniekeId('wb-item');
      const om = uniekeId('wb-om');
      const vak = h('input', { id, type: 'checkbox', checked: gekozen.has(v.id), onchange: (e) => { if (e.target.checked) gekozen.set(v.id, false); else gekozen.delete(v.id); tekenLijst(); } });
      const omVak = v.bereik ? h('input', { id: om, type: 'checkbox', checked: gekozen.get(v.id) === true, disabled: !gekozen.has(v.id), onchange: (e) => gekozen.set(v.id, e.target.checked) }) : null;
      return h('div', { class: 'wb-kies-item' },
        h('label', { class: 'keuze', for: id }, vak, h('span', {}, h('span', { class: 'mono' }, v.naam), ` ${v.label}`)),
        omVak ? h('label', { class: 'keuze wb-om', for: om }, omVak, h('span', {}, 'omscoren')) : null);
    }));
  };
  zoek.addEventListener('input', tekenLijst);
  tekenLijst();
  const themaKnop = themas.length ? h('div', { class: 'veld' },
    h('label', { for: `${zoekId}-t` }, 'Snel kiezen'),
    h('select', {
      id: `${zoekId}-t`,
      onchange: (e) => {
        const t = Number(e.target.value);
        if (!t) return;
        for (const v of kandidaten) if (themaVraag(v, t)) gekozen.set(v.id, gekozen.get(v.id) || false);
        e.target.value = '';
        tekenLijst();
        lijst.dispatchEvent(new Event('change', { bubbles: true }));
      },
    }, h('option', { value: '' }, 'Alle vragen van een thema…'), themas.map(([id, naam]) => h('option', { value: String(id) }, naam)))) : null;
  const namen = naamVelden(wb, { naam: bestaand?.naam || '', label: bestaand?.label || start.label || '' });
  return definitieVenster(wb, {
    titel: bestaand ? 'Schaalscore aanpassen' : 'Schaalscore berekenen',
    intro: 'Maak een score uit een aantal vragen, bijvoorbeeld het gemiddelde. Vink "omscoren" aan bij een vraag die andersom gesteld is.',
    bestaand,
    velden: [
      h('div', { class: 'formulier-rij' },
        h('div', { class: 'veld' }, h('label', { for: fId }, 'Hoe bereken je de score?'), functie),
        h('div', { class: 'veld' }, h('label', { for: minId }, 'Minimum aantal beantwoorde vragen'), min, h('div', { class: 'veld-hulp' }, 'Leeg: de helft (bij een gemiddelde) of alle vragen (bij een som).'))),
      themaKnop,
      h('div', { class: 'veld' }, h('label', { for: zoekId }, 'Vragen of variabelen'), zoek),
      lijst,
      namen.el,
    ],
    lees: () => {
      const vars = [...gekozen.entries()].map(([id, o]) => (o ? { id, omscoren: true } : id));
      if (!vars.length) return { fout: 'Kies de vragen of variabelen voor de score.' };
      const def = { functie: functie.value, variabelen: vars };
      if (min.value && ['gemiddelde', 'som'].includes(functie.value)) def.min_geldig = Number(min.value);
      // R11: geen tweede score met precies dezelfde berekening (bijvoorbeeld twee keer "Schaalscore maken").
      const dubbel = zelfdeScore(wb.definities, def, { datasetId: wb.datasetId(), zonderId: bestaand?.id ?? null });
      if (dubbel) return { fout: `Er is al een schaalscore van deze vragen: ${dubbel.naam}. Gebruik die, of kies andere vragen of een ander minimum.` };
      return { soort: 'bereken', ...namen.lees(), definitie: def };
    },
  });
}

// ---------- Omscoren ----------

export function omscorenDialoog(wb, varId = '', bestaand = null) {
  const sId = uniekeId('wb-var');
  const keuze = variabeleSelect(wb, { id: sId, waarde: bestaand?.definitie.variabele || varId, filter: (v) => !!v.bereik && isGetal(v) });
  const v0 = wb.variabele(keuze.value);
  const namen = naamVelden(wb, { naam: bestaand?.naam || '', label: bestaand?.label || (v0 ? `${v0.label} (omgescoord)` : ''), voorvoegsel: 'om_' });
  return definitieVenster(wb, {
    titel: 'Vraag omscoren',
    intro: 'Bij een vraag die andersom gesteld is, wordt een hoge score laag: 1 wordt 5, 2 wordt 4 enzovoort (bij een cijfer van 1 tot 10: 1 wordt 10).',
    bestaand,
    velden: [h('div', { class: 'veld' }, h('label', { for: sId }, 'Welke vraag?'), keuze), namen.el],
    lees: () => {
      const v = wb.variabele(keuze.value);
      if (!v) return { fout: 'Kies een vraag met een vaste schaal.' };
      return { soort: 'omscoren', ...namen.lees(), definitie: { variabele: v.id } };
    },
  });
}

// ---------- Indelen in groepen ----------

export function indelenDialoog(wb, varId = '', bestaand = null) {
  const dd = bestaand?.definitie || {};
  const sId = uniekeId('wb-var');
  const keuze = variabeleSelect(wb, { id: sId, waarde: dd.variabele || varId, filter: (v) => v.analyseerbaar && v.soort !== 'set' && v.soort !== 'tekst' && (v.labels.length > 0 || isGetal(v)) });
  const deel = h('div', { class: 'wb-indeling' });
  const restId = uniekeId('wb-rest');
  const rest = h('input', { id: restId, type: 'checkbox', checked: dd.rest === 'overig' });
  let uitleg = dd.uitleg || '';
  let groepInvoer = [];
  let grenzenIn = null;
  let labelsIn = [];
  const namen = naamVelden(wb, { naam: bestaand?.naam || '', label: bestaand?.label || '', voorvoegsel: 'groep_' });

  const tekenDeel = () => {
    const v = wb.variabele(keuze.value);
    if (!v) { vervang(deel); return; }
    if (v.labels.length && v.meetniveau !== 'interval') {
      // Op antwoorden: geef elk antwoord de naam van zijn groep; gelijke namen vormen één groep.
      const bestaandeGroep = new Map();
      for (const g of dd.groepen || []) for (const w of g.waarden) bestaandeGroep.set(String(w), g.label);
      groepInvoer = v.labels.map((l) => {
        const id = uniekeId('wb-groep');
        const start = bestaandeGroep.get(String(l.bronwaarde)) ?? l.bronwaarden.map((w) => bestaandeGroep.get(String(w))).find(Boolean) ?? '';
        return { l, el: h('input', { id, type: 'text', value: start, maxlength: 100, autocomplete: 'off', placeholder: 'naam van de groep' }), id };
      });
      vervang(deel,
        h('p', { class: 'zacht' }, 'Geef elk antwoord de naam van de groep waar het bij hoort. Antwoorden met dezelfde naam komen samen in één groep. Laat leeg wat niet meedoet.'),
        h('div', { class: 'wb-groepen-invoer' }, groepInvoer.map((x) => h('div', { class: 'veld wb-groep-rij' }, h('label', { for: x.id }, x.l.label), x.el))),
        h('label', { class: 'keuze', for: restId }, rest, h('span', {}, 'Wat leeg blijft, wordt de groep "Overig"')));
      grenzenIn = null;
      return;
    }
    // Met grenzen: [a, b) per groep.
    const gId = uniekeId('wb-grenzen');
    grenzenIn = h('input', { id: gId, type: 'text', value: (dd.grenzen || []).map(kort).join('; '), autocomplete: 'off', placeholder: 'bijvoorbeeld 30; 40; 50', inputmode: 'decimal' });
    const labelsDiv = h('div', { class: 'wb-groepen-invoer' });
    const tekenLabels = () => {
      const g = leesGrenzen();
      const oud = labelsIn.map((x) => x.value);
      labelsIn = Array.from({ length: g.length + 1 }, (_, i) => {
        const standaard = i === 0 ? `lager dan ${kort(g[0] ?? 0)}` : i === g.length ? `${kort(g[i - 1])} of hoger` : `${kort(g[i - 1])} tot ${kort(g[i])}`;
        return h('input', { type: 'text', value: dd.labels?.[i] && !oud.length ? dd.labels[i] : oud[i] && oud.length === g.length + 1 ? oud[i] : standaard, maxlength: 100, 'aria-label': `Naam van groep ${i + 1}` });
      });
      vervang(labelsDiv, g.length ? labelsIn.map((el, i) => h('div', { class: 'veld wb-groep-rij' }, h('span', { class: 'wb-groep-nr' }, `Groep ${i + 1}`), el)) : null);
    };
    grenzenIn.addEventListener('change', () => { uitleg = ''; tekenLabels(); });
    const gelijk = (aantalGroepen, woord) => h('button', {
      type: 'button',
      class: 'knop knop-klein',
      onclick: () => {
        const g = wb.kern.gelijkeGroepen(v.id, aantalGroepen, wb.bron());
        if (!g || !g.length) { meld('Daarvoor zijn er te weinig respondenten met een geldige waarde.', 'waarschuwing'); return; }
        grenzenIn.value = g.map(kort).join('; ');
        uitleg = `${g.length === 1 ? 'grens' : 'grenzen'} ${g.map(kort).join('; ')} (${woord} op ${datum(new Date().toISOString().slice(0, 10))})`;
        labelsIn = [];
        tekenLabels();
        deel.dispatchEvent(new Event('change', { bubbles: true }));
      },
    }, woord.charAt(0).toUpperCase() + woord.slice(1));
    const enps = v.schaal_soort === 'nps' ? h('button', {
      type: 'button',
      class: 'knop knop-klein',
      onclick: () => {
        grenzenIn.value = '7; 9';
        labelsIn = [];
        tekenLabels();
        ['Criticasters (0–6)', 'Passief (7–8)', 'Promotors (9–10)'].forEach((t, i) => { labelsIn[i].value = t; });
        deel.dispatchEvent(new Event('change', { bubbles: true }));
      },
    }, 'eNPS-indeling (0–6 / 7–8 / 9–10)') : null;
    vervang(deel,
      h('div', { class: 'veld' }, h('label', { for: gId }, 'Grenzen (gescheiden door een puntkomma)'), grenzenIn,
        h('div', { class: 'veld-hulp' }, 'Een grens hoort bij de groep erboven: met grens 40 valt 40 in de groep "40 of hoger".')),
      h('div', { class: 'knoppen' }, enps, gelijk(2, 'de mediaan'), gelijk(3, 'tertielen'), gelijk(4, 'kwartielen')),
      labelsDiv);
    tekenLabels();
  };
  const leesGrenzen = () => (grenzenIn ? grenzenIn.value.split(/[;\s]+/).map((x) => x.trim().replace(',', '.')).filter(Boolean).map(Number) : []);
  keuze.addEventListener('change', () => {
    const v = wb.variabele(keuze.value);
    if (v && !bestaand) {
      const lab = namen.el.querySelector('input');
      if (lab && !lab.value) { lab.value = `${v.label} in groepen`; lab.dispatchEvent(new Event('input')); }
    }
    tekenDeel();
  });
  tekenDeel();
  return definitieVenster(wb, {
    titel: bestaand ? 'Indeling aanpassen' : 'Indelen in groepen',
    intro: 'Maak van een vraag of score een paar groepen, bijvoorbeeld leeftijd in drie groepen. Groepen met minder dan 5 mensen worden bij analyses vanzelf samengevoegd.',
    bestaand,
    velden: [h('div', { class: 'veld' }, h('label', { for: sId }, 'Wat wil je indelen?'), keuze), deel, namen.el],
    lees: () => {
      const v = wb.variabele(keuze.value);
      if (!v) return { fout: 'Kies wat je wilt indelen.' };
      if (grenzenIn) {
        const g = leesGrenzen();
        if (!g.length || g.some((x) => !Number.isFinite(x))) return { fout: 'Vul minstens één grens in (een getal).' };
        const labels = labelsIn.map((x) => x.value.trim());
        if (labels.some((x) => !x)) return { fout: 'Geef elke groep een naam.' };
        return { soort: 'hercoderen', ...namen.lees(), definitie: { variabele: v.id, manier: 'grenzen', grenzen: g, labels, ...(uitleg ? { uitleg } : {}) } };
      }
      const perNaam = new Map();
      for (const x of groepInvoer) {
        const n = x.el.value.trim();
        if (!n) continue;
        if (!perNaam.has(n)) perNaam.set(n, []);
        perNaam.get(n).push(...x.l.bronwaarden);
      }
      if (!perNaam.size) return { fout: 'Geef minstens één antwoord de naam van een groep.' };
      const groepen = [...perNaam.entries()].map(([label, waarden], i) => ({ code: i + 1, label, waarden }));
      return { soort: 'hercoderen', ...namen.lees(), definitie: { variabele: v.id, manier: 'categorieen', groepen, rest: rest.checked ? 'overig' : 'leeg' } };
    },
  });
}

// ---------- Selectie maken ----------

export function selectieDialoog(wb, bestaand = null) {
  const voorwaarden = (bestaand?.definitie.voorwaarden || []).filter((v) => v.variabele);
  const rechteLijn = (bestaand?.definitie.voorwaarden || []).some((v) => v.regel === 'rechte_lijn');
  const minB = (bestaand?.definitie.voorwaarden || []).find((v) => v.regel === 'min_beantwoord');
  const rijen = h('div', { class: 'wb-voorwaarden' });
  const items = [];
  const nieuweRij = (vw = {}) => {
    const id = uniekeId('wb-vw');
    const keuze = variabeleSelect(wb, { id, waarde: vw.variabele || '', filter: (v) => isIndeling(v) || isGetal(v) });
    const deel = h('div', { class: 'wb-voorwaarde-deel' });
    const item = { keuze, deel, lees: () => null };
    const teken = () => {
      const v = wb.variabele(keuze.value);
      if (!v) { vervang(deel); item.lees = () => null; return; }
      if (isIndeling(v) && v.beschermd) {
        // Kiezen kan alleen per beschermde groep: een kleine categorie selecteer je nooit los.
        const soortId = uniekeId('wb-is');
        const soort = h('select', { id: soortId }, h('option', { value: 'is', selected: !vw.niet }, 'is'), h('option', { value: 'niet', selected: !!vw.niet }, 'is niet'));
        const bron = new Set((vw.is || vw.niet || []).map(String));
        const vakken = v.beschermd.groepen.map((g) => {
          const waarden = v.labels.filter((l) => g.labels.includes(l.label)).flatMap((l) => l.bronwaarden);
          const vid = uniekeId('wb-g');
          const vak = h('input', { id: vid, type: 'checkbox', checked: waarden.some((w) => bron.has(String(w))) });
          return { vak, waarden, el: h('label', { class: 'keuze', for: vid }, vak, h('span', {}, g.samengevoegd ? `${g.label} (${g.labels.join(', ')}${g.metLeeg ? '; ook wie de vraag niet invulde' : ''})` : g.label)) };
        });
        vervang(deel, h('div', { class: 'veld' }, h('label', { for: soortId }, 'Voorwaarde'), soort), h('div', { class: 'wb-vinkjes' }, vakken.map((x) => x.el)));
        item.lees = () => {
          const w = vakken.filter((x) => x.vak.checked).flatMap((x) => x.waarden);
          return w.length ? { variabele: v.id, [soort.value]: w } : null;
        };
      } else {
        const vanId = uniekeId('wb-van');
        const totId = uniekeId('wb-tot');
        const van = h('input', { id: vanId, type: 'text', inputmode: 'decimal', value: vw.van ?? '', autocomplete: 'off' });
        const tot = h('input', { id: totId, type: 'text', inputmode: 'decimal', value: vw.tot ?? '', autocomplete: 'off' });
        vervang(deel, h('div', { class: 'formulier-rij' },
          h('div', { class: 'veld' }, h('label', { for: vanId }, 'Van (leeg = geen ondergrens)'), van),
          h('div', { class: 'veld' }, h('label', { for: totId }, 'Tot en met (leeg = geen bovengrens)'), tot)));
        const getal = (x) => (x.value.trim() === '' ? undefined : Number(x.value.trim().replace(',', '.')));
        item.lees = () => {
          const a = getal(van);
          const b = getal(tot);
          if (a === undefined && b === undefined) return null;
          return { variabele: v.id, ...(a !== undefined ? { van: a } : {}), ...(b !== undefined ? { tot: b } : {}) };
        };
      }
    };
    keuze.addEventListener('change', () => { vw = {}; teken(); });
    teken();
    const weg = h('button', { type: 'button', class: 'knop knop-klein knop-licht', onclick: () => { items.splice(items.indexOf(item), 1); el.remove(); rijen.dispatchEvent(new Event('change', { bubbles: true })); } }, 'Weghalen');
    const el = h('fieldset', { class: 'wb-voorwaarde' }, h('legend', {}, 'Voorwaarde'), h('div', { class: 'veld' }, h('label', { for: id }, 'Variabele'), keuze), deel, weg);
    items.push(item);
    rijen.append(el);
  };
  for (const vw of voorwaarden) nieuweRij(vw);
  if (!voorwaarden.length && !rechteLijn && !minB) nieuweRij();
  const rlId = uniekeId('wb-rl');
  const mbId = uniekeId('wb-mb');
  const pctId = uniekeId('wb-pct');
  const rl = h('input', { id: rlId, type: 'checkbox', checked: rechteLijn });
  const mb = h('input', { id: mbId, type: 'checkbox', checked: !!minB });
  const pct = h('input', { id: pctId, type: 'number', min: 1, max: 100, step: 1, value: minB?.min_pct ?? 50, inputmode: 'numeric', class: 'wb-pct', 'aria-label': 'Percentage' });
  const kwaliteit = wb.bron().soort === 'dataset' ? null : h('fieldset', { class: 'wb-voorwaarde' }, h('legend', {}, 'Kwaliteit van de antwoorden'),
    h('label', { class: 'keuze', for: rlId }, rl, h('span', {}, 'Laat respondenten weg die alle schaalvragen hetzelfde beantwoordden')),
    h('div', { class: 'wb-minb' }, mb, h('label', { for: mbId }, 'Laat respondenten weg die minder dan'), pct, h('label', { for: pctId }, '% van de vragen beantwoordden')));
  const namen = naamVelden(wb, { naam: bestaand?.naam || '', label: bestaand?.label || '', voorvoegsel: 'sel_' });
  return definitieVenster(wb, {
    titel: bestaand ? 'Selectie aanpassen' : 'Selectie maken',
    intro: 'Een selectie gebruikt alleen een deel van de respondenten, bijvoorbeeld één afdeling. Alle voorwaarden moeten tegelijk gelden. Een selectie die maar een paar mensen verschilt van iedereen of van een vergelijkbare selectie, kan niet: dan zouden hun antwoorden terug te rekenen zijn.',
    bestaand,
    velden: [rijen, h('div', { class: 'knoppen' }, h('button', { type: 'button', class: 'knop knop-klein', onclick: () => nieuweRij() }, 'Voorwaarde toevoegen')), kwaliteit, namen.el],
    lees: () => {
      const vw = items.map((x) => x.lees()).filter(Boolean);
      if (rl.checked) vw.push({ soort: 'kwaliteit', regel: 'rechte_lijn' });
      if (mb.checked) vw.push({ soort: 'kwaliteit', regel: 'min_beantwoord', min_pct: Math.max(1, Math.min(100, Math.round(Number(pct.value) || 50))) });
      if (!vw.length) return { fout: 'Kies minstens één voorwaarde.' };
      if (vw.some((x) => (x.van !== undefined && !Number.isFinite(x.van)) || (x.tot !== undefined && !Number.isFinite(x.tot)))) return { fout: 'Vul bij van en tot een getal in.' };
      const l = namen.lees();
      if (!l.label) return { fout: 'Geef de selectie een omschrijving.' };
      return { soort: 'filter', ...l, definitie: { voorwaarden: vw } };
    },
  }).then(async (id) => {
    if (id && !bestaand) {
      wb.st.filter = id;
      wb.teken();
      meld('De selectie is bewaard en gekozen.', 'succes');
    }
    return id;
  });
}

// ---------- Het tabblad ----------

function aanpassen(wb, v) {
  const def = wb.definities.find((d) => d.id === v.definitie_id);
  if (!def) return;
  if (def.soort === 'bereken') berekenDialoog(wb, {}, def);
  else if (def.soort === 'omscoren') omscorenDialoog(wb, '', def);
  else if (def.soort === 'hercoderen') indelenDialoog(wb, '', def);
}

export function toonVariabelen(paneel, wb) {
  const ro = wb.ctx.alleenLezen;
  if (!lijstKeuze.has(wb.onderzoekId)) lijstKeuze.set(wb.onderzoekId, { zoek: '', groep: '' });
  const keuze = lijstKeuze.get(wb.onderzoekId);
  const zoekId = uniekeId('wb-zoek');
  const zoek = h('input', { id: zoekId, type: 'search', value: keuze.zoek, placeholder: 'Zoek een variabele', autocomplete: 'off' });
  const lijstEl = h('div', {});
  const aanwezig = new Set(wb.overzicht.variabelen.filter((v) => !v.verwijderd).map((v) => v.groep));
  const chips = h('div', { class: 'wb-chips', role: 'group', 'aria-label': 'Soort variabele' },
    [['', 'Alles'], ...Object.entries(GROEPEN).filter(([g]) => aanwezig.has(g))].map(([g, naam]) => h('button', {
      type: 'button',
      class: 'wb-chip',
      'aria-pressed': keuze.groep === g ? 'true' : 'false',
      onclick: () => { keuze.groep = g; toonVariabelen(paneel, wb); },
    }, naam)));

  const tekenLijst = () => {
    const q = keuze.zoek.trim().toLowerCase();
    const lijst = wb.overzicht.variabelen.filter((v) => !v.verwijderd && (!keuze.groep || v.groep === keuze.groep) && (!q || `${v.naam} ${v.label}`.toLowerCase().includes(q)));
    if (!lijst.length) {
      vervang(lijstEl, h('p', { class: 'zacht' }, 'Geen variabelen gevonden.'));
      return;
    }
    const kop = ['Naam', 'Omschrijving', 'Soort', 'Meetniveau', 'Waarden', 'Ontbrekend', 'Geldig (n)', ''];
    vervang(lijstEl, h('div', { class: 'tabel-wrapper wb-tabel-wrapper' }, h('table', { class: 'tabel wb-tabel wb-variabelen' },
      h('caption', { class: 'sr-only' }, 'Variabelen van de gekozen gegevens'),
      h('thead', {}, h('tr', {}, kop.map((k, i) => h('th', { scope: 'col', class: i === 6 ? 'rechts' : null }, k || h('span', { class: 'sr-only' }, 'Acties'))))),
      h('tbody', {}, lijst.map((v) => {
        const niveauId = uniekeId('wb-niveau');
        const kanNiveau = v.analyseerbaar && v.soort !== 'set' && v.soort !== 'tekst' && v.soort !== 'onbekend' && !ro;
        const niveau = kanNiveau
          ? h('select', {
            id: niveauId,
            'aria-label': `Meetniveau van ${v.naam}`,
            onchange: async (e) => {
              try {
                await wb.bewaarEigenschap(v.id, { meetniveau: e.target.value });
                meld(`Het meetniveau van ${v.naam} is aangepast.`, 'succes');
              } catch (err) {
                meldFout(err);
              }
            },
          }, NIVEAUS.map(([w, t]) => h('option', { value: w, selected: w === v.meetniveau }, t)))
          : (NIVEAUS.find(([w]) => w === v.meetniveau)?.[1] || '–');
        // "Dat zeg ik liever niet" is een groep, maar als getal ontbrekend (J2).
        const ontbreekt = [...v.telling.perReden.map((n, i) => (i > 0 && n > 0 ? ONTBREKEND[i] : null)),
          v.geenGetal?.length && v.soort !== 'set' ? '“liever niet” (als getal)' : null].filter(Boolean).join(', ') || '–';
        const acties = [];
        if (!ro && v.analyseerbaar) {
          if (v.definitie_id) {
            acties.push(h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: () => aanpassen(wb, v) }, 'Aanpassen', h('span', { class: 'sr-only' }, `: ${v.naam}`)));
            acties.push(h('button', { type: 'button', class: 'knop knop-klein knop-licht', onclick: () => wb.verwijderDefinitie(wb.definities.find((d) => d.id === v.definitie_id)) }, 'Verwijderen', h('span', { class: 'sr-only' }, `: ${v.naam}`)));
          } else {
            const items = v.b7 && (v.bron === 'thema' || v.bron === 'meetpunt') ? vragenVanScore(wb, v) : [];
            const al = items.length ? alGemaakt(wb, items) : null;
            if (al) {
              // R11: die score is er al; laat hem zien in plaats van een tweede te maken.
              acties.push(h('button', {
                type: 'button', class: 'knop knop-klein knop-licht',
                onclick: () => {
                  keuze.zoek = al.naam;
                  keuze.groep = '';
                  toonVariabelen(paneel, wb);
                  paneel.querySelector('input[type="search"]')?.focus();
                },
              }, `Toon ${al.naam}`));
            } else if (items.length) {
              acties.push(h('button', {
                type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog',
                onclick: () => berekenDialoog(wb, { functie: 'gemiddelde', variabelen: items, min_geldig: 1, label: `${v.label} (minimaal 1 vraag)` }),
              }, 'Schaalscore maken', h('span', { class: 'sr-only' }, `: ${v.naam}`)));
            }
            if (v.bereik && isGetal(v)) acties.push(h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: () => omscorenDialoog(wb, v.id) }, 'Omscoren', h('span', { class: 'sr-only' }, `: ${v.naam}`)));
            if (v.soort !== 'set' && (v.labels.length || isGetal(v))) acties.push(h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: () => indelenDialoog(wb, v.id) }, 'Indelen in groepen', h('span', { class: 'sr-only' }, `: ${v.naam}`)));
          }
        }
        return h('tr', { class: v.analyseerbaar ? null : 'wb-zacht' },
          h('th', { scope: 'row', class: 'mono', 'data-label': 'Naam' }, v.naam),
          h('td', { 'data-label': 'Omschrijving' }, v.label,
            v.kenmerk ? h('span', { class: 'label wb-kenmerk-label' }, v.kenmerk.naam) : null,
            v.reden_niet ? h('span', { class: 'wb-klein zacht' }, v.reden_niet) : null,
            v.b7 ? h('span', { class: 'wb-klein wb-waarschuwing' }, b7Uitleg(wb, v)) : null,
            v.uitleg ? h('span', { class: 'wb-klein zacht' }, v.uitleg) : null,
            (v.waarschuwingen || []).map((w) => h('span', { class: 'wb-klein wb-waarschuwing' }, w))),
          h('td', { 'data-label': 'Soort' }, SOORT[v.soort] || v.soort),
          h('td', { 'data-label': 'Meetniveau' }, niveau),
          h('td', { 'data-label': 'Waarden', class: 'wb-waarden' }, v.verdeling || '–'),
          h('td', { 'data-label': 'Ontbrekend' }, ontbreekt),
          h('td', { 'data-label': 'Geldig (n)', class: v.geldig === null ? 'rechts getal wb-verborgen' : 'rechts getal', title: v.geldig === null ? VERBORGEN_UITLEG : null }, v.geldig === null ? VERBORGEN : v.geldig.toLocaleString('nl-NL')),
          h('td', { 'data-label': '', class: 'wb-rij-acties' }, acties));
      })))));
  };
  zoek.addEventListener('input', vertraag(() => { keuze.zoek = zoek.value; tekenLijst(); }, 150));

  const nieuw = ro ? null : h('div', { class: 'knoppen wb-nieuw' },
    h('span', { class: 'wb-nieuw-kop' }, 'Nieuwe variabele:'),
    h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: () => berekenDialoog(wb) }, 'Schaalscore berekenen'),
    h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: () => omscorenDialoog(wb) }, 'Vraag omscoren'),
    h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: () => indelenDialoog(wb) }, 'Indelen in groepen'),
    h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: () => selectieDialoog(wb) }, 'Selectie maken'));

  const filters = wb.overzicht.filters;
  const actief = filters.filter((f) => !f.verwijderd);
  const weg = filters.filter((f) => f.verwijderd);
  const wegVars = wb.overzicht.variabelen.filter((v) => v.verwijderd);
  const selecties = h('section', { class: 'wb-selecties', 'aria-labelledby': 'wb-sel-kop' },
    h('h3', { id: 'wb-sel-kop' }, 'Selecties'),
    actief.length ? h('ul', { class: 'lijst' }, actief.map((f) => h('li', { class: 'lijst-item' },
      h('div', { class: 'lijst-item-hoofd' },
        h('div', { class: 'lijst-item-titel' }, f.label),
        h('div', { class: 'lijst-item-meta' }, f.fout || f.tekst, f.ok && f.n !== null ? ` · ${f.n.toLocaleString('nl-NL')} respondenten` : f.fout ? '' : ' · nu niet te gebruiken')),
      ro ? null : h('div', { class: 'lijst-item-acties' },
        h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: () => selectieDialoog(wb, wb.definities.find((d) => d.id === f.id)) }, 'Aanpassen', h('span', { class: 'sr-only' }, `: ${f.label}`)),
        h('button', { type: 'button', class: 'knop knop-klein knop-licht', onclick: () => wb.verwijderDefinitie(wb.definities.find((d) => d.id === f.id)) }, 'Verwijderen', h('span', { class: 'sr-only' }, `: ${f.label}`))))))
      : h('p', { class: 'zacht' }, 'Je hebt nog geen selectie gemaakt.'),
    weg.length || wegVars.length ? h('details', { class: 'wb-weg' },
      h('summary', {}, `Verwijderde indelingen en selecties (${weg.length + wegVars.length})`),
      h('p', { class: 'zacht' }, 'Deze tellen nog mee bij de controle op terugrekenen, omdat uitkomsten ervan al in je stukken kunnen staan.'),
      h('ul', { class: 'lijst' }, [...wegVars.map((v) => ({ id: v.definitie_id, label: v.label })), ...weg.map((f) => ({ id: f.id, label: f.label }))].map((x) => h('li', { class: 'lijst-item' },
        h('div', { class: 'lijst-item-hoofd' }, x.label),
        ro ? null : h('button', { type: 'button', class: 'knop knop-klein knop-gevaar', onclick: () => wb.helemaalVerwijderen(wb.definities.find((d) => d.id === x.id)) }, 'Helemaal verwijderen', h('span', { class: 'sr-only' }, `: ${x.label}`)))))) : null);

  const fouten = (wb.overzicht.fouten || []).filter((f) => !f.verwijderd);
  vervang(paneel,
    h('section', { class: 'kaart wb-kaart', 'aria-labelledby': 'wb-var-kop' },
      h('h2', { id: 'wb-var-kop' }, 'Variabelen'),
      h('p', { class: 'zacht' }, 'Dit zijn alle vragen, thema’s en eigen variabelen van de gekozen gegevens, met dezelfde korte namen als in het SPSS-pakket. Pas het meetniveau aan als een variabele anders gebruikt moet worden.'), h('p', { class: 'zacht wb-klein' }, VERBORGEN_UITLEG),
      fouten.length ? melding(h('ul', { class: 'wb-fouten' }, fouten.map((f) => h('li', {}, h('strong', {}, `${f.naam}: `), f.tekst))), 'waarschuwing') : null,
      nieuw,
      h('div', { class: 'wb-zoekbalk' }, h('div', { class: 'veld' }, h('label', { for: zoekId }, 'Zoek een variabele'), zoek), chips),
      lijstEl,
      h('p', { class: 'wb-noot zacht' }, P_GEEN_DATA)),
    h('section', { class: 'kaart wb-kaart' }, selecties));
  tekenLijst();
}
