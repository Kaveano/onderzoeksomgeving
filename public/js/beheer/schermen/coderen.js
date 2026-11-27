// Scherm: Analyse · Open antwoorden – open antwoorden en interviews coderen, citaten kiezen (BOUWPLAN B24, P5).
//
// - Tab Vragenlijsten: kies een vragenlijst en een open vraag; de antwoorden staan als kaarten in een vaste,
//   willekeurige volgorde (per sessie; zoals op het dashboard, zodat de volgorde niets over personen zegt).
//   Sneltoetsen: 1–9 zet de eerste negen codes aan of uit bij het gekozen antwoord, J en K gaan naar het volgende en
//   vorige antwoord, N maakt een nieuwe code.
// - Tab Interviews: interviews en observaties uit Eigen invoer; codes gelden voor het hele stuk. Voor een citaat
//   selecteer je tekst in het (alleen-lezen) tekstvak.
// - Codeboek (zijkant): codes toevoegen, wijzigen, samenvoegen en verwijderen, met aantallen die net zo zijn
//   afgeschermd als in het rapport (× bij 1 tot 4, met aanvullend verbergen; codering-regels.js).
// - Citaten: een aanpasbare kopie. "In rapport" kan pas als "Gecontroleerd" is aangevinkt.
// De antwoorden komen uit gegevens.js (haalGegevens); na elke wijziging vergeten we de bewaarde gegevens
// (vergeetGegevens), zodat andere schermen de nieuwe codes ophalen.

import { api } from '../api.js';
import { h, vervang, laden, leeg, melding, meld, meldFout, bevestig, formulierDialoog, maakDialoog, uniekeId, aantal, datum, tabSubnav } from '../ui.js';
import { haalGegevens, vergeetGegevens, voortgangTekst } from '../gegevens.js';
import { VERBORGEN, VERBORGEN_UITLEG } from '../privacy.js';
import {
  codeboek, codesPerItem, telling, openVragen, interviews, itemSleutel, MAX_CITAAT, MAX_CODENAAM, MAX_OMSCHRIJVING,
  HULP_CODE, CITAAT_CONTROLE, GECONTROLEERD_LABEL,
} from '../codering-regels.js';

const PER_KEER = 50;
const keuzes = new Map(); // per onderzoek: { tab, lijst, vraag, invoer, zonderCode } (alleen in dit tabblad)

/** Vast zaad per sessie voor de volgorde van de antwoorden. */
function zaad() {
  let z = null;
  try {
    z = sessionStorage.getItem('coderen-volgorde');
    if (!z) {
      z = String(Math.floor(Math.random() * 2 ** 31));
      sessionStorage.setItem('coderen-volgorde', z);
    }
  } catch {
    z = z || String(Math.floor(Math.random() * 2 ** 31));
  }
  return z;
}
let sessieZaad = null;
/** FNV-1a: een vaste "willekeurige" plaats per antwoord. */
function hash(t) {
  let x = 2166136261;
  for (let i = 0; i < t.length; i++) {
    x ^= t.charCodeAt(i);
    x = Math.imul(x, 16777619) >>> 0;
  }
  return x;
}

/** invoer=<id> uit het adres (#/onderzoek/3/analyse/coderen/?invoer=7). */
function invoerUitAdres() {
  const m = /[?&]invoer=(\d+)/.exec(location.hash);
  return m ? Number(m[1]) : null;
}

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const ro = ctx.alleenLezen;
  ctx.zetTitel(`Open antwoorden – ${ctx.onderzoek.onderzoek.titel}`);
  sessieZaad = sessieZaad || zaad();
  const laadEl = laden('De antwoorden worden geladen…');
  vervang(container, tabSubnav('analyse', onderzoekId, 'coderen'), laadEl);

  let data;
  try {
    data = await haalGegevens(onderzoekId, { voortgang: (g, t) => { laadEl.textContent = voortgangTekst(g, t); } });
  } catch (e) {
    vervang(container, tabSubnav('analyse', onderzoekId, 'coderen'), melding(e.message, 'gevaar'));
    return;
  }

  // ---------- Toestand ----------
  let codes = codeboek(data.codes);
  const perItem = codesPerItem(data.coderingen);
  let citaten = [...(data.citaten || [])];
  const vragen = openVragen(data).filter((v) => v.items.length > 0);
  const ivs = interviews(data).sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : b.id - a.id));
  const keuze = keuzes.get(onderzoekId) || { tab: 'vragenlijsten', lijst: null, vraag: null, invoer: null, zonderCode: false };
  keuzes.set(onderzoekId, keuze);
  const uitAdres = invoerUitAdres();
  if (uitAdres && ivs.some((e) => e.id === uitAdres)) {
    keuze.tab = 'interviews';
    keuze.invoer = uitAdres;
  }
  if (!vragen.some((v) => v.vraag.id === keuze.vraag)) {
    keuze.vraag = vragen[0]?.vraag.id ?? null;
    keuze.lijst = vragen[0]?.lijst.id ?? null;
  }
  if (!ivs.some((e) => e.id === keuze.invoer)) keuze.invoer = ivs[0]?.id ?? null;
  if (!vragen.length && ivs.length && !uitAdres) keuze.tab = 'interviews';

  let actief = 0; // index van het gekozen antwoord in de stroom
  let getoond = PER_KEER;
  let stroomItems = []; // [{ sleutel, inzending_id, vraag_id, tekst }]

  const gewijzigd = () => vergeetGegevens(onderzoekId);
  const huidigeVraag = () => vragen.find((v) => v.vraag.id === keuze.vraag) || null;
  const huidigInterview = () => ivs.find((e) => e.id === keuze.invoer) || null;

  // ---------- Vaste onderdelen ----------
  const tabKnoppen = {};
  const tabRij = h('div', { class: 'cd-tabs', role: 'tablist', 'aria-label': 'Wat codeer je?' });
  for (const [sleutel, label] of [['vragenlijsten', 'Vragenlijsten'], ['interviews', `Interviews (${ivs.length})`]]) {
    const k = h('button', { type: 'button', role: 'tab', id: `cd-tab-${sleutel}`, class: 'cd-tab', onclick: () => kiesTab(sleutel) }, label);
    tabKnoppen[sleutel] = k;
    tabRij.append(k);
  }
  const werkvlak = h('div', { class: 'cd-werkvlak', role: 'tabpanel' });
  const codeboekEl = h('details', { class: 'kaart cd-codeboek', open: window.matchMedia('(min-width: 900px)').matches || null });
  const citatenEl = h('section', { class: 'kaart cd-citaten', 'aria-labelledby': 'cd-cit-kop' });
  const sneltoetsen = ro ? null : h('p', { class: 'klein zacht cd-sneltoetsen' }, 'Sneltoetsen bij een gekozen antwoord: 1 tot 9 zet een code aan of uit, J volgende, K vorige, N nieuwe code.');

  vervang(container,
    tabSubnav('analyse', onderzoekId, 'coderen'),
    h('section', { class: 'kaart', 'aria-labelledby': 'cd-kop' },
      h('h2', { id: 'cd-kop' }, 'Open antwoorden coderen'),
      h('p', { class: 'cd-hulp' }, HULP_CODE),
      h('p', { class: 'klein zacht' }, 'De aantallen per code zie je in het codeboek. Net als in het rapport worden aantallen van 1 tot 4 niet getoond (×). Codes kun je in de Werkbank ook per groep bekijken, en in het rapport komen alleen citaten die je hebt gecontroleerd.'),
      ro ? melding('Dit onderzoek is gearchiveerd. Je kunt de codes en citaten bekijken, maar niet meer wijzigen.', 'waarschuwing') : null,
      tabRij, sneltoetsen),
    h('div', { class: 'cd-indeling' }, werkvlak, codeboekEl),
    citatenEl);

  function kiesTab(sleutel) {
    keuze.tab = sleutel;
    for (const [k, el] of Object.entries(tabKnoppen)) el.setAttribute('aria-selected', String(k === sleutel));
    werkvlak.setAttribute('aria-labelledby', `cd-tab-${sleutel}`);
    actief = 0;
    getoond = PER_KEER;
    tekenWerkvlak();
    tekenCodeboek();
  }

  // ---------- Codes zetten ----------

  async function zetCodes(stuk, nieuweSet) {
    const k = itemSleutel(stuk);
    const oud = new Set(perItem.get(k) || []);
    perItem.set(k, new Set(nieuweSet));
    werkBijNaCodes();
    try {
      await api.put(`/onderzoeken/${onderzoekId}/coderingen`, { ...stukBody(stuk), code_ids: [...nieuweSet] });
      gewijzigd();
    } catch (e) {
      perItem.set(k, oud);
      werkBijNaCodes();
      meldFout(e);
    }
  }
  const stukBody = (stuk) => (stuk.invoer_id ? { invoer_id: stuk.invoer_id } : { inzending_id: stuk.inzending_id, vraag_id: stuk.vraag_id });

  function wissel(stuk, codeId) {
    if (ro) return;
    const set = new Set(perItem.get(itemSleutel(stuk)) || []);
    if (set.has(codeId)) set.delete(codeId);
    else set.add(codeId);
    zetCodes(stuk, set);
  }

  /** De knoppen om codes aan of uit te zetten bij één stuk (met nummer 1–9 voor de sneltoetsen). */
  function codeKnoppen(stuk) {
    const set = perItem.get(itemSleutel(stuk)) || new Set();
    const nieuwKnop = ro ? null : h('button', { type: 'button', class: 'cd-codeknop cd-nieuw', onclick: () => nieuweCode() }, '+ Nieuwe code');
    if (!codes.length) {
      return h('div', { class: 'cd-codeknoppen' }, h('p', { class: 'klein zacht' }, ro ? 'Er zijn geen codes.' : 'Maak eerst een code.'), nieuwKnop);
    }
    return h('div', { class: 'cd-codeknoppen', role: 'group', 'aria-label': 'Codes' },
      codes.map((c, i) => h('button', {
        type: 'button',
        class: 'cd-codeknop',
        'aria-pressed': String(set.has(c.id)),
        disabled: ro,
        title: c.omschrijving || null,
        onclick: () => wissel(stuk, c.id),
      }, i < 9 ? h('span', { class: 'cd-nummer', 'aria-hidden': 'true' }, String(i + 1)) : null, c.naam)),
      nieuwKnop);
  }

  function chips(stuk) {
    const set = perItem.get(itemSleutel(stuk)) || new Set();
    const lijst = codes.filter((c) => set.has(c.id));
    return h('p', { class: 'cd-chips' }, lijst.length ? lijst.map((c) => h('span', { class: 'cd-chip' }, c.naam)) : h('span', { class: 'zacht klein' }, 'Nog geen code'));
  }

  // ---------- Tab Vragenlijsten ----------

  function stroom() {
    const v = huidigeVraag();
    if (!v) return [];
    const items = [...v.teksten.entries()].map(([inzId, tekst]) => ({ sleutel: `i:${inzId}:${v.vraag.id}`, inzending_id: inzId, vraag_id: v.vraag.id, tekst }));
    items.sort((a, b) => hash(`${sessieZaad}:${a.inzending_id}`) - hash(`${sessieZaad}:${b.inzending_id}`) || a.inzending_id - b.inzending_id);
    return keuze.zonderCode ? items.filter((i) => !(perItem.get(i.sleutel)?.size)) : items;
  }

  function antwoordKaart(item, i) {
    const isActief = i === actief;
    const kaart = h('li', {
      class: `cd-antwoord${isActief ? ' cd-actief' : ''}`,
      tabindex: '0',
      'aria-label': `Antwoord ${i + 1} van ${stroomItems.length}${isActief ? ', gekozen' : ''}`,
      'aria-current': isActief ? 'true' : null,
      onclick: (e) => {
        if (actief !== i && !e.target.closest('button')) kiesActief(i);
      },
      onkeydown: (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && actief !== i) {
          e.preventDefault();
          kiesActief(i);
        }
      },
    },
    h('p', { class: 'cd-tekst' }, item.tekst),
    isActief ? codeKnoppen(item) : chips(item),
    isActief && !ro ? h('div', { class: 'knoppen' }, h('button', { type: 'button', class: 'knop knop-klein', onclick: () => citaatMaken(item, item.tekst) }, 'Citaat maken')) : null);
    return kaart;
  }

  let stroomEl = null;
  let meerEl = null;
  function tekenStroom() {
    const hadFocus = stroomEl.contains(document.activeElement);
    stroomItems = stroom();
    if (actief >= stroomItems.length) actief = Math.max(0, stroomItems.length - 1);
    if (actief >= getoond) getoond = actief + 1;
    vervang(stroomEl, stroomItems.slice(0, getoond).map(antwoordKaart));
    if (hadFocus) stroomEl.children[actief]?.focus({ preventScroll: true });
    vervang(meerEl, stroomItems.length > getoond
      ? h('button', { type: 'button', class: 'knop', onclick: () => { getoond += PER_KEER; tekenStroom(); } }, `Meer tonen (${stroomItems.length - getoond})`)
      : null);
  }

  function kiesActief(i, { focus = true } = {}) {
    if (!stroomItems.length) return;
    actief = Math.max(0, Math.min(stroomItems.length - 1, i));
    tekenStroom();
    const el = stroomEl.children[actief];
    if (el && focus) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  function tekenVragenlijsten() {
    if (!vragen.length) {
      vervang(werkvlak, leeg('Er zijn nog geen ingevulde open vragen. Open antwoorden verschijnen hier zodra respondenten ze hebben ingevuld.'));
      return;
    }
    const lijsten = [...new Map(vragen.map((v) => [v.lijst.id, v.lijst])).values()];
    const lijstId = uniekeId('cd-lijst');
    const vraagId = uniekeId('cd-vraag');
    const lijstSel = h('select', { id: lijstId }, lijsten.map((l) => h('option', { value: l.id, selected: l.id === keuze.lijst }, l.titel)));
    const vraagSel = h('select', { id: vraagId });
    const vulVragen = () => {
      const opties = vragen.filter((v) => v.lijst.id === keuze.lijst);
      if (!opties.some((v) => v.vraag.id === keuze.vraag)) keuze.vraag = opties[0]?.vraag.id ?? null;
      vervang(vraagSel, opties.map((v) => h('option', { value: v.vraag.id, selected: v.vraag.id === keuze.vraag }, `${v.vraag.tekst} (${aantal(v.items.length, 'antwoord', 'antwoorden')})`)));
    };
    vulVragen();
    lijstSel.addEventListener('change', () => {
      keuze.lijst = Number(lijstSel.value);
      vulVragen();
      actief = 0;
      getoond = PER_KEER;
      tekenStroom();
      tekenCodeboek();
    });
    vraagSel.addEventListener('change', () => {
      keuze.vraag = Number(vraagSel.value);
      actief = 0;
      getoond = PER_KEER;
      tekenStroom();
      tekenCodeboek();
    });
    const zonder = h('input', { type: 'checkbox', checked: keuze.zonderCode });
    zonder.addEventListener('change', () => {
      keuze.zonderCode = zonder.checked;
      actief = 0;
      getoond = PER_KEER;
      tekenStroom();
    });
    stroomEl = h('ol', { class: 'cd-stroom', 'aria-label': 'Antwoorden' });
    meerEl = h('div', { class: 'knoppen cd-meer' });
    vervang(werkvlak,
      h('div', { class: 'cd-keuzes' },
        h('div', { class: 'veld' }, h('label', { for: lijstId }, 'Vragenlijst'), lijstSel),
        h('div', { class: 'veld' }, h('label', { for: vraagId }, 'Vraag'), vraagSel)),
      h('label', { class: 'keuze cd-zonder' }, zonder, h('span', {}, 'Alleen antwoorden zonder code')),
      h('p', { class: 'klein zacht' }, 'De antwoorden staan in willekeurige volgorde, zodat ze niet aan een persoon te koppelen zijn.'),
      stroomEl, meerEl);
    tekenStroom();
  }

  // ---------- Tab Interviews ----------

  function tekenInterviews() {
    stroomEl = null;
    if (!ivs.length) {
      vervang(werkvlak, leeg('Er zijn nog geen interviews of observaties. Voeg ze toe bij Eigen invoer; daarna kun je ze hier coderen.',
        h('a', { class: 'knop', href: `#/onderzoek/${onderzoekId}/invoer` }, 'Naar Eigen invoer')));
      return;
    }
    const e = huidigInterview();
    const selId = uniekeId('cd-iv');
    const sel = h('select', { id: selId }, ivs.map((x) => h('option', { value: x.id, selected: x.id === keuze.invoer }, `${x.titel} (${datum(x.datum)})`)));
    sel.addEventListener('change', () => {
      keuze.invoer = Number(sel.value);
      tekenInterviews();
    });
    const tekstId = uniekeId('cd-ivtekst');
    const vak = h('textarea', { id: tekstId, class: 'cd-ivtekst', rows: 12, readonly: true }, e.tekst || '');
    const stuk = { invoer_id: e.id };
    const knoppenEl = h('div', {});
    const teken = () => vervang(knoppenEl, codeKnoppen(stuk));
    teken();
    werkBijIv = teken;
    vervang(werkvlak,
      h('div', { class: 'veld' }, h('label', { for: selId }, 'Interview of observatie'), sel),
      h('div', { class: 'veld' }, h('label', { for: tekstId }, 'Tekst'), vak,
        h('div', { class: 'veld-hulp' }, 'Codes gelden voor het hele interview. Wil je een citaat? Selecteer een stuk tekst en klik op Citaat maken.')),
      knoppenEl,
      ro ? null : h('div', { class: 'knoppen' }, h('button', {
        type: 'button',
        class: 'knop knop-klein',
        onclick: () => {
          const gekozen = vak.value.slice(vak.selectionStart, vak.selectionEnd).trim();
          citaatMaken(stuk, gekozen || vak.value);
        },
      }, 'Citaat maken')));
  }
  let werkBijIv = () => {};

  function tekenWerkvlak() {
    if (keuze.tab === 'interviews') tekenInterviews();
    else tekenVragenlijsten();
  }

  function werkBijNaCodes() {
    if (keuze.tab === 'interviews') werkBijIv();
    else if (stroomEl) tekenStroom();
    tekenCodeboek();
  }

  // ---------- Codeboek ----------

  function tellingNu() {
    if (keuze.tab === 'interviews') return { t: telling(ivs.map((e) => `v:${e.id}`), perItem, codes, { metNul: true }), wat: aantal(ivs.length, 'interview of observatie', 'interviews en observaties') };
    const v = huidigeVraag();
    return v ? { t: telling(v.items, perItem, codes, { metNul: true }), wat: aantal(v.items.length, 'antwoord', 'antwoorden') } : null;
  }

  function tekenCodeboek() {
    const nu = tellingNu();
    const tel = new Map((nu?.t.codes || []).map((c) => [c.code_id, c]));
    const waarde = (c) => (!c ? '' : c.verborgen ? VERBORGEN : String(c.aantal));
    const lijst = codes.map((c, i) => h('li', { class: 'cd-code' },
      h('div', { class: 'cd-code-kop' },
        i < 9 ? h('span', { class: 'cd-nummer', title: `Sneltoets ${i + 1}` }, String(i + 1)) : h('span', { class: 'cd-nummer cd-nummer-leeg', 'aria-hidden': 'true' }),
        h('span', { class: 'cd-code-naam' }, c.naam, c.groep ? h('span', { class: 'zacht klein' }, ` (${c.groep})`) : null),
        h('span', { class: 'cd-telling', title: tel.get(c.id)?.verborgen ? VERBORGEN_UITLEG : null }, waarde(tel.get(c.id)))),
      c.omschrijving ? h('p', { class: 'klein zacht cd-code-oms' }, c.omschrijving) : null,
      ro ? null : h('div', { class: 'cd-code-acties' },
        h('button', { type: 'button', class: 'knop knop-licht knop-klein', onclick: () => wijzigCode(c) }, 'Wijzigen'),
        codes.length > 1 ? h('button', { type: 'button', class: 'knop knop-licht knop-klein', onclick: () => voegSamen(c) }, 'Samenvoegen') : null,
        h('button', { type: 'button', class: 'knop knop-licht knop-klein', onclick: () => verwijderCode(c) }, 'Verwijderen'))));
    const t = nu?.t;
    vervang(codeboekEl,
      h('summary', {}, `Codeboek (${aantal(codes.length, 'code', 'codes')})`),
      ro ? null : h('div', { class: 'knoppen' }, h('button', { type: 'button', class: 'knop knop-primair knop-klein', onclick: () => nieuweCode() }, 'Nieuwe code')),
      nu ? h('p', { class: 'klein zacht' }, `Aantallen bij ${keuze.tab === 'interviews' ? 'alle' : 'deze vraag:'} ${nu.wat}.`) : null,
      t && t.n > 0 && t.n < 5 ? melding('Hier zijn minder dan 5 antwoorden. De aantallen worden daarom niet getoond.', 'waarschuwing') : null,
      codes.length ? h('ol', { class: 'cd-codes' }, lijst) : h('p', { class: 'zacht' }, 'Nog geen codes. Begin met een paar codes en voeg er onderweg meer toe.'),
      t ? h('p', { class: 'cd-zonder-code' }, h('span', {}, 'Antwoorden zonder code'), h('span', { class: 'cd-telling', title: t.geen_code_verborgen ? VERBORGEN_UITLEG : null }, t.geen_code_verborgen ? VERBORGEN : String(t.geen_code))) : null,
      t?.iets_verborgen ? h('p', { class: 'klein zacht' }, VERBORGEN_UITLEG) : null);
  }

  async function nieuweCode() {
    const stuk = keuze.tab === 'interviews' ? (huidigInterview() ? { invoer_id: keuze.invoer } : null) : stroomItems[actief] || null;
    const velden = [
      { naam: 'naam', label: 'Naam van de code', verplicht: true, max: MAX_CODENAAM, placeholder: 'Bijvoorbeeld: werkdruk' },
      { naam: 'omschrijving', label: 'Omschrijving (optioneel)', type: 'textarea', rijen: 2, max: MAX_OMSCHRIJVING, hulp: 'Wanneer geef je deze code? Handig als je later twijfelt.' },
      { naam: 'groep', label: 'Hoofdcode (optioneel)', max: MAX_CODENAAM, hulp: 'Om codes te groeperen, bijvoorbeeld "Organisatie".' },
    ];
    if (stuk) velden.push({ naam: 'geven', label: keuze.tab === 'interviews' ? 'Geef deze code ook aan dit interview' : 'Geef deze code ook aan het gekozen antwoord', type: 'checkbox', waarde: true });
    let nieuw = null;
    const w = await formulierDialoog({
      titel: 'Nieuwe code',
      intro: HULP_CODE,
      knop: 'Toevoegen',
      velden,
      opslaan: async (x) => {
        nieuw = await api.post(`/onderzoeken/${onderzoekId}/codes`, { naam: x.naam, omschrijving: x.omschrijving, groep: x.groep });
      },
    });
    if (!w || !nieuw) return;
    codes = codeboek([...codes, { id: nieuw.id, naam: w.naam, omschrijving: w.omschrijving, groep: w.groep, volgorde: Math.max(0, ...codes.map((c) => c.volgorde || 0)) + 1 }]);
    gewijzigd();
    meld(`Code "${w.naam}" toegevoegd.`, 'succes');
    if (stuk && w.geven) {
      const set = new Set(perItem.get(itemSleutel(stuk)) || []);
      set.add(nieuw.id);
      await zetCodes(stuk, set);
    } else werkBijNaCodes();
  }

  async function wijzigCode(c) {
    const w = await formulierDialoog({
      titel: 'Code wijzigen',
      knop: 'Opslaan',
      velden: [
        { naam: 'naam', label: 'Naam van de code', verplicht: true, max: MAX_CODENAAM, waarde: c.naam },
        { naam: 'omschrijving', label: 'Omschrijving (optioneel)', type: 'textarea', rijen: 2, max: MAX_OMSCHRIJVING, waarde: c.omschrijving || '' },
        { naam: 'groep', label: 'Hoofdcode (optioneel)', max: MAX_CODENAAM, waarde: c.groep || '' },
      ],
      opslaan: (x) => api.put(`/codes/${c.id}`, x),
    });
    if (!w) return;
    Object.assign(c, w);
    gewijzigd();
    werkBijNaCodes();
    tekenCitaten();
  }

  async function voegSamen(c) {
    const anderen = codes.filter((x) => x.id !== c.id);
    const w = await formulierDialoog({
      titel: `"${c.naam}" samenvoegen`,
      intro: `Alle antwoorden en citaten met "${c.naam}" krijgen de code die je hieronder kiest. Daarna verdwijnt "${c.naam}".`,
      knop: 'Samenvoegen',
      velden: [{ naam: 'doel', label: 'Samenvoegen met', type: 'select', waarde: anderen[0].id, opties: anderen.map((x) => ({ waarde: x.id, label: x.naam })) }],
      opslaan: (x) => api.put(`/codes/${c.id}`, { samenvoegen_in: Number(x.doel) }),
    });
    if (!w) return;
    const doel = Number(w.doel);
    for (const set of perItem.values()) {
      if (set.delete(c.id)) set.add(doel);
    }
    for (const q of citaten) if (q.code_id === c.id) q.code_id = doel;
    codes = codes.filter((x) => x.id !== c.id);
    gewijzigd();
    meld('Codes samengevoegd.', 'succes');
    werkBijNaCodes();
    tekenCitaten();
  }

  async function verwijderCode(c) {
    if (!(await bevestig({
      titel: `Code "${c.naam}" verwijderen?`,
      tekst: 'De code verdwijnt van alle antwoorden en interviews. Citaten met deze code blijven bestaan, zonder code.',
      knop: 'Verwijderen',
      gevaar: true,
    }))) return;
    try {
      await api.del(`/codes/${c.id}`);
    } catch (e) {
      meldFout(e);
      return;
    }
    for (const set of perItem.values()) set.delete(c.id);
    for (const q of citaten) if (q.code_id === c.id) q.code_id = null;
    codes = codes.filter((x) => x.id !== c.id);
    gewijzigd();
    werkBijNaCodes();
    tekenCitaten();
  }

  // ---------- Citaten ----------

  /** Bron van een citaat in woorden: "Bij: Wat kan beter? (Nulmeting)" of "Bij: Interview teamleider". */
  function bronTekst(q) {
    if (q.invoer_id) return `Bij: ${ivs.find((e) => e.id === q.invoer_id)?.titel || 'eigen invoer'}`;
    const v = vragen.find((x) => x.vraag.id === q.vraag_id);
    return v ? `Bij: ${v.vraag.tekst} (${v.lijst.titel})` : 'Bij een antwoord op een vragenlijst';
  }

  /** Twee vinkjes: Gecontroleerd en In rapport (In rapport pas als Gecontroleerd aan staat). */
  function vinkjes({ gecontroleerd, inRapport, uit }) {
    const ctrl = h('input', { type: 'checkbox', checked: !!gecontroleerd, disabled: uit });
    const rap = h('input', { type: 'checkbox', checked: !!inRapport, disabled: uit || !gecontroleerd });
    ctrl.addEventListener('change', () => {
      rap.disabled = uit || !ctrl.checked;
      if (!ctrl.checked) rap.checked = false;
    });
    return {
      ctrl, rap,
      el: h('div', { class: 'cd-vinkjes' },
        h('label', { class: 'keuze' }, ctrl, h('span', {}, GECONTROLEERD_LABEL)),
        h('label', { class: 'keuze' }, rap, h('span', {}, 'In rapport'))),
    };
  }

  function citaatMaken(stuk, tekst) {
    const vakId = uniekeId('cd-citaat');
    const codeId = uniekeId('cd-citcode');
    const begin = String(tekst || '').trim();
    const vak = h('textarea', { id: vakId, rows: 6, maxlength: MAX_CITAAT }, begin.slice(0, MAX_CITAAT));
    const set = perItem.get(itemSleutel(stuk)) || new Set();
    const eerste = codes.find((c) => set.has(c.id));
    const codeSel = h('select', { id: codeId }, h('option', { value: '' }, 'Geen code'), codes.map((c) => h('option', { value: c.id, selected: eerste?.id === c.id }, c.naam)));
    const v = vinkjes({ gecontroleerd: false, inRapport: false, uit: false });
    const fout = h('div', { class: 'veld-fout', role: 'alert' });
    const ok = h('button', { type: 'button', class: 'knop knop-primair' }, 'Opslaan');
    const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
    vak.addEventListener('input', () => {
      // Een aangepaste tekst moet je (opnieuw) controleren.
      if (v.ctrl.checked) {
        v.ctrl.checked = false;
        v.ctrl.dispatchEvent(new Event('change'));
      }
    });
    const d = maakDialoog('Citaat maken', [
      melding(CITAAT_CONTROLE, 'waarschuwing'),
      h('div', { class: 'veld' }, h('label', { for: vakId }, 'Citaat'), vak,
        h('div', { class: 'veld-hulp' }, `Een kopie van het antwoord; pas hem gerust aan of kort hem in (hooguit ${MAX_CITAAT.toLocaleString('nl-NL')} tekens).${begin.length > MAX_CITAAT ? ' Het antwoord was langer en is ingekort.' : ''}`)),
      h('div', { class: 'veld' }, h('label', { for: codeId }, 'Code (optioneel)'), codeSel),
      v.el,
      fout,
    ], [annuleer, ok]);
    annuleer.addEventListener('click', () => d.close());
    ok.addEventListener('click', async () => {
      fout.textContent = '';
      if (!vak.value.trim()) {
        fout.textContent = 'Het citaat is leeg.';
        return;
      }
      ok.disabled = true;
      try {
        const body = { ...stukBody(stuk), tekst: vak.value, code_id: codeSel.value ? Number(codeSel.value) : null, gecontroleerd: v.ctrl.checked, in_rapport: v.rap.checked };
        const r = await api.post(`/onderzoeken/${onderzoekId}/citaten`, body);
        citaten.push({ id: r.id, ...body, tekst: vak.value.trim(), gecontroleerd: body.gecontroleerd ? 1 : 0, in_rapport: body.in_rapport ? 1 : 0, volgorde: citaten.length + 1 });
        gewijzigd();
        d.close();
        meld('Citaat opgeslagen.', 'succes');
        tekenCitaten();
      } catch (e) {
        fout.textContent = e.message;
        ok.disabled = false;
      }
    });
    d.classList.add('cd-dialoog');
    d.showModal();
    vak.focus();
  }

  function tekenCitaten() {
    const items = citaten.map((q) => {
      const vakId = uniekeId('cd-cittekst');
      const vak = h('textarea', { id: vakId, rows: 3, maxlength: MAX_CITAAT, disabled: ro }, q.tekst);
      const v = vinkjes({ gecontroleerd: Number(q.gecontroleerd) === 1, inRapport: Number(q.in_rapport) === 1, uit: ro });
      const codeSel = h('select', { disabled: ro, 'aria-label': 'Code van dit citaat' }, h('option', { value: '' }, 'Geen code'),
        codes.map((c) => h('option', { value: c.id, selected: q.code_id === c.id }, c.naam)));
      const status = h('span', { class: 'klein zacht', role: 'status' });
      const bewaar = async (body) => {
        try {
          const r = await api.put(`/citaten/${q.id}`, body);
          Object.assign(q, body, { gecontroleerd: r.gecontroleerd, in_rapport: r.in_rapport });
          if (body.tekst !== undefined) q.tekst = body.tekst.trim();
          gewijzigd();
          v.ctrl.checked = r.gecontroleerd === 1;
          v.rap.checked = r.in_rapport === 1;
          v.rap.disabled = ro || !v.ctrl.checked;
          status.textContent = body.tekst !== undefined && r.gecontroleerd === 0 ? 'Opgeslagen. Controleer het aangepaste citaat opnieuw.' : 'Opgeslagen.';
          vervang(teller, tellerTekst());
        } catch (e) {
          meldFout(e);
        }
      };
      vak.addEventListener('blur', () => {
        if (vak.value.trim() && vak.value.trim() !== q.tekst) bewaar({ tekst: vak.value });
      });
      v.ctrl.addEventListener('change', () => bewaar({ gecontroleerd: v.ctrl.checked, ...(v.ctrl.checked ? {} : { in_rapport: false }) }));
      v.rap.addEventListener('change', () => bewaar({ in_rapport: v.rap.checked }));
      codeSel.addEventListener('change', () => bewaar({ code_id: codeSel.value ? Number(codeSel.value) : null }));
      return h('li', { class: 'cd-citaat' },
        h('p', { class: 'klein zacht' }, bronTekst(q)),
        h('div', { class: 'veld' }, h('label', { for: vakId, class: 'sr-only' }, 'Citaat'), vak),
        h('div', { class: 'cd-citaat-voet' },
          codeSel,
          v.el,
          ro ? null : h('button', {
            type: 'button',
            class: 'knop knop-licht knop-klein',
            onclick: async () => {
              if (!(await bevestig({ titel: 'Citaat verwijderen?', tekst: 'Het citaat verdwijnt; het antwoord zelf blijft staan.', knop: 'Verwijderen', gevaar: true }))) return;
              try {
                await api.del(`/citaten/${q.id}`);
                citaten = citaten.filter((x) => x.id !== q.id);
                gewijzigd();
                tekenCitaten();
              } catch (e) {
                meldFout(e);
              }
            },
          }, 'Verwijderen'),
          status));
    });
    function tellerTekst() {
      const n = citaten.filter((q) => Number(q.in_rapport) === 1).length;
      return `${aantal(citaten.length, 'citaat', 'citaten')}, waarvan ${n} in het rapport.`;
    }
    const teller = h('p', { class: 'klein zacht', role: 'status' }, tellerTekst());
    vervang(citatenEl,
      h('h2', { id: 'cd-cit-kop' }, 'Citaten'),
      h('p', {}, CITAAT_CONTROLE),
      h('p', { class: 'klein zacht' }, 'In het rapport komen alleen citaten die gecontroleerd zijn en waarbij "In rapport" aan staat, en alleen bij vragen met minstens 5 antwoorden.'),
      teller,
      citaten.length ? h('ol', { class: 'cd-citatenlijst' }, items) : h('p', { class: 'zacht' }, 'Nog geen citaten. Klik bij een antwoord op Citaat maken.'));
  }

  // ---------- Sneltoetsen ----------

  const toets = (e) => {
    if (ro || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    const doel = e.target;
    if (doel instanceof HTMLElement && (doel.closest('input, textarea, select, [contenteditable="true"]'))) return;
    if (!container.isConnected) return;
    const k = e.key.toLowerCase();
    if (k === 'n') {
      e.preventDefault();
      nieuweCode();
      return;
    }
    if (keuze.tab !== 'vragenlijsten' || !stroomItems.length) {
      if (keuze.tab === 'interviews' && /^[1-9]$/.test(k) && huidigInterview() && codes[Number(k) - 1]) {
        e.preventDefault();
        wissel({ invoer_id: keuze.invoer }, codes[Number(k) - 1].id);
      }
      return;
    }
    if (k === 'j') {
      e.preventDefault();
      kiesActief(actief + 1);
    } else if (k === 'k') {
      e.preventDefault();
      kiesActief(actief - 1);
    } else if (/^[1-9]$/.test(k) && codes[Number(k) - 1]) {
      e.preventDefault();
      wissel(stroomItems[actief], codes[Number(k) - 1].id);
    }
  };
  document.addEventListener('keydown', toets);
  ctx.bijVertrek(() => document.removeEventListener('keydown', toets));

  kiesTab(keuze.tab);
  tekenCitaten();
}
