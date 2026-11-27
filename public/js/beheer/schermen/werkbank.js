// Scherm: Analyse · Werkbank – zelf analyses kiezen en uitvoeren, zoals in SPSS (BOUWPLAN P4, D2 §11).
//
// Opbouw: werkbalk (Gegevens, Selectie, aantal, Gegevens vernieuwen, Schrijfwijze), tabbladen Variabelen ·
// Analyseren · Uitvoer · Mijn analyses. Alle berekeningen gebeuren in de browser, op de hoofdthread met pauzes
// (werkbank/rekenkern.js); "Stoppen" breekt een lopende berekening af. De server bewaart alleen definities en
// bewaarde analyses (src/routes/werkbank.js). Alles wat in beeld komt, is al beschermd (privacyregels).

import { api } from '../api.js';
import { h, vervang, laden, melding, meld, meldFout, bevestig, tabSubnav, formulierDialoog, aantal, vandaag, uniekeId } from '../ui.js';
import { haalGegevens, voortgangTekst } from '../gegevens.js';
import { drempelVan } from '../privacy.js';
import { bewaarBestand } from '../bestanden.js';
import { neemOpInStuk } from '../stukdialoog.js';
import { maakRekenkern } from '../werkbank/rekenkern.js';
import { leesDefinities, leesAnalyses, EIGENSCHAPPEN_NAAM } from '../werkbank/definities.js';
import { toonUitvoer } from '../werkbank/uitvoer-weergave.js';
import { uitvoerNaarTekst } from '../werkbank/uitvoer-tekst.js';
import { uitvoerNaarXlsx, uitvoerNaarDocx, bestandsnaam } from '../werkbank/uitvoer-export.js';
import { toonVariabelen, berekenDialoog, selectieDialoog } from './werkbank-variabelen.js';
import { toonAnalyseren } from './werkbank-formulieren.js';
import { toonMijnAnalyses } from './werkbank-analyses.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Per onderzoek: gekozen gegevens, selectie, schrijfwijze, tabblad en de uitvoer (blijft staan tot je ververst).
const staten = new Map();
const datasetGeheugen = new Map(); // dataset-id → { id, naam, kolommen, rijen }
let introGezien = false;

export const INTRO = 'In de werkbank kies je zelf welke analyse je doet, net als in SPSS. Je kunt nieuwe variabelen maken, zoals een schaalscore, een selectie maken en uitkomsten bewaren voor je rapport. De anonimiteit blijft beschermd: niets wat op minder dan 5 mensen berust, komt in beeld.';

const TABS = [['variabelen', 'Variabelen'], ['analyseren', 'Analyseren'], ['uitvoer', 'Uitvoer'], ['analyses', 'Mijn analyses']];

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const onderzoek = ctx.onderzoek.onderzoek;
  ctx.zetTitel(`Werkbank – ${onderzoek.titel}`);
  if (!staten.has(onderzoekId)) staten.set(onderzoekId, { bron: null, filter: null, notatie: 'rapport', tab: 'analyseren', uitvoeren: [] });
  const st = staten.get(onderzoekId);

  const subnav = tabSubnav('analyse', onderzoekId, 'werkbank');
  const ladenEl = laden('De antwoorden worden geladen…');
  const hoofd = h('div', { class: 'werkbank' }, ladenEl);
  vervang(container, subnav, hoofd);

  const kern = maakRekenkern();
  const wb = {
    ctx, onderzoekId, kern, st,
    d: drempelVan(ctx.instellingen),
    data: null, datasets: [], definities: [], analyses: [], overzicht: null,
    bezig: null, // AbortController van de lopende berekening
  };

  async function haalAlles({ vers = false } = {}) {
    const [data, sets, werk] = await Promise.all([
      haalGegevens(onderzoekId, { vers, voortgang: (g, t) => { ladenEl.textContent = voortgangTekst(g, t); } }),
      api.get(`/onderzoeken/${onderzoekId}/datasets`).then((r) => r.datasets).catch(() => []),
      api.get(`/onderzoeken/${onderzoekId}/werkbank`),
    ]);
    wb.data = data;
    wb.datasets = sets;
    wb.definities = leesDefinities(werk.definities);
    wb.analyses = leesAnalyses(werk.analyses);
  }

  try {
    await haalAlles();
  } catch (e) {
    vervang(hoofd, melding([h('strong', {}, 'De gegevens konden niet worden geladen. '), e.message || ''], 'gevaar'));
    return;
  }
  if (!container.isConnected) return;

  // ---------- Gegevensbronnen ----------

  const mmNaam = new Map((wb.data.meetmomenten || []).map((m) => [m.id, m.naam]));
  function bronnen() {
    const perLijst = new Map();
    for (const i of wb.data.inzendingen) perLijst.set(i.vragenlijst_id, (perLijst.get(i.vragenlijst_id) || 0) + 1);
    const lijsten = wb.data.vragenlijsten.filter((l) => perLijst.get(l.id) > 0);
    const uit = lijsten.map((l) => ({
      bron: { soort: 'lijst', id: l.id },
      tekst: `Vragenlijst: ${l.titel}${l.meetmoment_id && mmNaam.has(l.meetmoment_id) ? ` (${mmNaam.get(l.meetmoment_id)})` : ''} – ${aantal(perLijst.get(l.id), 'respondent', 'respondenten')}`,
    }));
    if (lijsten.length >= 2) uit.push({ bron: { soort: 'gestapeld', lijsten: 'alle' }, tekst: 'Alle vragenlijsten samen (meetmoment als variabele)' });
    for (const d of wb.datasets) uit.push({ bron: { soort: 'dataset', id: d.id }, tekst: `Dataset: ${d.naam} – ${aantal(d.aantal_rijen, 'rij', 'rijen')}` });
    return uit;
  }
  const sleutel = (b) => JSON.stringify(b);

  async function laadBron() {
    const keuzes = bronnen();
    if (!keuzes.length) return false;
    if (!st.bron || !keuzes.some((k) => sleutel(k.bron) === sleutel(st.bron))) {
      st.bron = (keuzes.filter((k) => k.bron.soort === 'lijst').pop() || keuzes[0]).bron;
      st.filter = null;
    }
    const sets = [];
    if (st.bron.soort === 'dataset') {
      if (!datasetGeheugen.has(st.bron.id)) {
        const r = await api.get(`/datasets/${st.bron.id}`);
        datasetGeheugen.set(st.bron.id, r.dataset);
      }
      sets.push(datasetGeheugen.get(st.bron.id));
    }
    wb.overzicht = kern.laad({ data: wb.data, datasets: sets, definities: wb.definities, bron: st.bron, drempel: wb.d });
    if (st.filter !== null && !wb.overzicht.filters.some((f) => f.id === st.filter && !f.verwijderd)) st.filter = null;
    return true;
  }

  wb.bron = () => st.bron;
  /** Kiest andere gegevens (en selectie), bijvoorbeeld om een bewaarde analyse aan te passen. */
  wb.wisselBron = async (bron, filter = null) => {
    if (JSON.stringify(bron) !== JSON.stringify(st.bron)) {
      st.bron = bron;
      st.filter = filter;
      await laadBron();
    } else {
      st.filter = filter;
    }
  };
  wb.datasetId = () => (st.bron?.soort === 'dataset' ? st.bron.id : null);
  wb.variabele = (id) => wb.overzicht?.variabelen.find((v) => v.id === id) || null;

  // ---------- Opslaan van definities en analyses ----------

  async function herlaadWerkbank() {
    const werk = await api.get(`/onderzoeken/${onderzoekId}/werkbank`);
    wb.definities = leesDefinities(werk.definities);
    wb.analyses = leesAnalyses(werk.analyses);
    wb.overzicht = kern.werkDefinitiesBij(wb.definities);
    if (st.filter !== null && !wb.overzicht.filters.some((f) => f.id === st.filter && !f.verwijderd)) st.filter = null;
    teken();
  }
  wb.herlaadWerkbank = herlaadWerkbank;

  /** Bewaart een definitie (nieuw of gewijzigd); geeft het id. */
  wb.bewaarDefinitie = async ({ id = null, soort, naam, label = '', definitie }) => {
    if (id) {
      const oud = wb.definities.find((d) => d.id === id);
      await api.put(`/werkbank/definities/${id}`, { naam, label, definitie, bijgewerkt_op: oud?.bijgewerkt_op });
    } else {
      const r = await api.post(`/onderzoeken/${onderzoekId}/werkbank/definities`, { soort, naam, label, definitie, dataset_id: wb.datasetId() });
      id = r.id;
    }
    await herlaadWerkbank();
    return id;
  };

  /** Meetniveau of omschrijving van een variabele (de definitie '~eigenschappen' van deze gegevensbron). */
  wb.bewaarEigenschap = async (varId, velden) => {
    const bestaand = wb.definities.find((d) => d.soort === 'eigenschappen' && !d.verwijderd && (d.dataset_id ?? null) === wb.datasetId());
    const variabelen = { ...(bestaand?.definitie.variabelen || {}) };
    variabelen[varId] = { ...(variabelen[varId] || {}), ...velden };
    await wb.bewaarDefinitie({ id: bestaand?.id || null, soort: 'eigenschappen', naam: EIGENSCHAPPEN_NAAM, definitie: { variabelen } });
  };

  wb.verwijderDefinitie = async (def) => {
    const indeling = def.soort === 'hercoderen' || def.soort === 'filter';
    const zeker = await bevestig({
      titel: `“${def.label || def.naam}” verwijderen?`,
      tekst: indeling
        ? 'Deze indeling verdwijnt uit je lijst. Hij blijft wel meetellen bij de controle op terugrekenen, omdat uitkomsten ervan al in je stukken kunnen staan.'
        : 'Deze variabele verdwijnt uit de werkbank. Analyses die hem gebruiken, werken dan niet meer.',
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!zeker) return;
    try {
      await api.del(`/werkbank/definities/${def.id}`);
      meld('Verwijderd.', 'succes');
      await herlaadWerkbank();
    } catch (e) {
      meldFout(e);
    }
  };

  wb.helemaalVerwijderen = async (def) => {
    const zeker = await bevestig({
      titel: `“${def.label || def.naam}” helemaal verwijderen?`,
      tekst: 'Dan telt deze indeling ook niet meer mee bij de controle op terugrekenen. Doe dit alleen als er geen uitkomsten van in je stukken of rapporten staan.',
      knop: 'Helemaal verwijderen',
      gevaar: true,
    });
    if (!zeker) return;
    try {
      await api.del(`/werkbank/definities/${def.id}?definitief=1`);
      await herlaadWerkbank();
    } catch (e) {
      meldFout(e);
    }
  };

  wb.bewaarAnalyse = async (u) => {
    const waarden = await formulierDialoog({
      titel: 'Bewaren als analyse',
      knop: 'Bewaren',
      intro: 'Een bewaarde analyse kun je later opnieuw uitvoeren met de nieuwste gegevens en opnemen in een rapport.',
      velden: [
        { naam: 'titel', label: 'Titel', waarde: u.titel, verplicht: true, max: 200 },
        { naam: 'notitie', label: 'Notitie (alleen voor jezelf; komt niet in het rapport)', type: 'textarea', max: 2000 },
      ],
      opslaan: async (w) => {
        await api.post(`/onderzoeken/${onderzoekId}/werkbank/analyses`, { titel: w.titel, procedure: u.spec.procedure, spec: u.spec, notitie: w.notitie });
      },
    });
    if (!waarden) return;
    meld('De analyse is bewaard bij Mijn analyses.', 'succes');
    await herlaadWerkbank();
  };

  // ---------- Uitvoeren ----------

  const status = h('div', { class: 'sr-only', role: 'status' });
  const bezigEl = h('div', { class: 'wb-bezig', hidden: true });

  /** Voert een spec uit en zet de uitkomst bovenaan de uitvoer. Geeft de uitvoer (of null bij Stoppen). */
  wb.voerUit = async (spec, { stil = false } = {}) => {
    if (wb.bezig) return null;
    const stop = new AbortController();
    wb.bezig = stop;
    const tekst = h('span', {}, 'Bezig met rekenen…');
    vervang(bezigEl, laden(''), tekst, h('button', { type: 'button', class: 'knop knop-klein', onclick: () => stop.abort() }, 'Stoppen'));
    bezigEl.hidden = false;
    teken({ alleenKnoppen: true });
    let u = null;
    try {
      // Een dataset die nog niet geladen is (bijv. vanuit Mijn analyses).
      if (spec.bron.soort === 'dataset' && !datasetGeheugen.has(spec.bron.id)) {
        const r = await api.get(`/datasets/${spec.bron.id}`);
        datasetGeheugen.set(spec.bron.id, r.dataset);
      }
      kern.stel({ data: wb.data, datasets: [...datasetGeheugen.values()], definities: wb.definities, drempel: wb.d });
      u = await kern.voerUit(spec, { signaal: stop.signal, voortgang: (t) => { tekst.textContent = t; } });
    } catch (e) {
      if (e?.name === 'AbortError') meld('De berekening is gestopt.', 'waarschuwing');
      else meldFout(e);
      u = null;
    } finally {
      wb.bezig = null;
      bezigEl.hidden = true;
      // De rekenkern weer op de gekozen bron zetten (stel() heeft het geheugen leeggemaakt).
      await laadBron().catch(() => {});
    }
    if (!u) {
      teken();
      return null;
    }
    st.uitvoeren.unshift(u);
    if (!stil) {
      const breed = window.matchMedia && window.matchMedia('(min-width: 1200px)').matches;
      if (!(breed && st.tab === 'analyseren')) st.tab = 'uitvoer';
    }
    teken();
    if (!stil) {
      const kop = hoofd.querySelector(`[data-uitvoer="${u.id}"] h3`);
      if (kop) {
        kop.focus({ preventScroll: true });
        kop.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
      status.textContent = '';
      setTimeout(() => { status.textContent = 'De uitkomst staat in de uitvoer.'; }, 60);
    }
    return u;
  };
  ctx.bijVertrek(() => wb.bezig?.abort());

  wb.toonTab = (naam) => {
    st.tab = naam;
    teken();
    const tab = hoofd.querySelector(`[role="tab"][data-tab="${naam}"]`);
    if (tab) tab.focus();
  };

  // ---------- Werkbalk, tabbladen en panelen ----------

  const panelen = {
    variabelen: h('div', { class: 'wb-paneel wb-paneel-variabelen' }),
    analyseren: h('div', { class: 'wb-paneel wb-paneel-analyseren' }),
    uitvoer: h('div', { class: 'wb-paneel wb-paneel-uitvoer' }),
    analyses: h('div', { class: 'wb-paneel wb-paneel-analyses' }),
  };

  function werkbalk() {
    const keuzes = bronnen();
    const bronId = uniekeId('wb-bron');
    const selId = uniekeId('wb-selectie');
    const notId = uniekeId('wb-notatie');
    const filters = wb.overzicht.filters.filter((f) => !f.verwijderd);
    const gekozen = filters.find((f) => f.id === st.filter);
    const n = wb.overzicht.n;
    const telling = gekozen && gekozen.n !== null
      ? `Selectie: ${gekozen.n.toLocaleString('nl-NL')} van ${aantal(n, 'respondent', 'respondenten')} · ${aantal(wb.overzicht.variabelen.length, 'variabele', 'variabelen')}`
      : `${aantal(n, st.bron.soort === 'dataset' ? 'rij' : 'respondent', st.bron.soort === 'dataset' ? 'rijen' : 'respondenten')} · ${aantal(wb.overzicht.variabelen.length, 'variabele', 'variabelen')}`;
    const bronSelect = h('select', {
      id: bronId,
      onchange: async (e) => {
        st.bron = JSON.parse(e.target.value);
        st.filter = null;
        vervang(panelen[st.tab], laden('De gegevens worden klaargezet…'));
        try {
          await laadBron();
        } catch (fout) {
          meldFout(fout);
        }
        teken();
        document.getElementById(bronId)?.focus();
      },
    }, keuzes.map((k) => h('option', { value: sleutel(k.bron), selected: sleutel(k.bron) === sleutel(st.bron) }, k.tekst)));
    const selSelect = h('select', {
      id: selId,
      onchange: async (e) => {
        if (e.target.value === 'nieuw') {
          e.target.value = st.filter === null ? '' : String(st.filter);
          await selectieDialoog(wb);
          return;
        }
        st.filter = e.target.value ? Number(e.target.value) : null;
        teken();
        document.getElementById(selId)?.focus();
      },
    },
    h('option', { value: '' }, 'Iedereen'),
    filters.map((f) => h('option', { value: String(f.id), selected: f.id === st.filter, disabled: !f.ok }, `${f.label}${f.ok ? '' : ' (niet te gebruiken)'}`)),
    ctx.alleenLezen ? null : h('option', { value: 'nieuw' }, 'Nieuwe selectie…'));
    const notSelect = h('select', { id: notId, onchange: (e) => { st.notatie = e.target.value; teken(); document.getElementById(notId)?.focus(); } },
      h('option', { value: 'rapport', selected: st.notatie === 'rapport' }, 'Rapport (p = 0,036)'),
      h('option', { value: 'apa', selected: st.notatie === 'apa' }, 'APA (p = ,036)'));
    return h('div', { class: 'kaart wb-werkbalk' },
      h('div', { class: 'wb-werkbalk-velden' },
        h('div', { class: 'veld' }, h('label', { for: bronId }, 'Gegevens'), bronSelect),
        h('div', { class: 'veld' }, h('label', { for: selId }, 'Selectie'), selSelect),
        h('div', { class: 'veld' }, h('label', { for: notId }, 'Schrijfwijze'), notSelect)),
      h('div', { class: 'wb-werkbalk-rij' },
        h('p', { class: 'wb-telling' }, telling),
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          title: 'Haal de nieuwste antwoorden op',
          onclick: async () => {
            vervang(panelen[st.tab], laden('De nieuwste gegevens worden opgehaald…'));
            try {
              datasetGeheugen.clear();
              await haalAlles();
              await laadBron();
              meld('De gegevens zijn bijgewerkt.', 'succes');
            } catch (e) {
              meldFout(e);
            }
            teken();
          },
        }, 'Gegevens vernieuwen')),
      gekozen ? h('p', { class: 'wb-selectie-tekst zacht' }, gekozen.tekst || '') : null,
      gekozen && !gekozen.ok ? melding(gekozen.fout || gekozen.meldingen[0]?.tekst || 'Deze selectie is nu niet te gebruiken.', 'waarschuwing') : null);
  }

  function tabbladen() {
    const knoppen = TABS.map(([naam, label]) => {
      const n = naam === 'uitvoer' ? st.uitvoeren.length : naam === 'analyses' ? wb.analyses.length : null;
      return h('button', {
        type: 'button',
        role: 'tab',
        id: `wb-tab-${naam}`,
        class: 'wb-tab',
        'data-tab': naam,
        'aria-selected': st.tab === naam ? 'true' : 'false',
        'aria-controls': `wb-paneel-${naam}`,
        tabindex: st.tab === naam ? '0' : '-1',
        onclick: () => wb.toonTab(naam),
        onkeydown: (e) => {
          const i = TABS.findIndex(([t]) => t === naam);
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            wb.toonTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0]);
          }
        },
      }, label, n ? h('span', { class: 'wb-tab-aantal' }, ` (${n})`) : null);
    });
    return h('div', { class: 'wb-tabs', role: 'tablist', 'aria-label': 'Onderdelen van de werkbank' }, knoppen);
  }

  function tekenUitvoer() {
    const p = panelen.uitvoer;
    if (!st.uitvoeren.length) {
      vervang(p, h('div', { class: 'leeg' }, h('p', {}, 'Hier verschijnen de uitkomsten van je analyses. Kies bij Analyseren wat je wilt weten.')));
      return;
    }
    const datum = vandaag();
    const voet = `${onderzoek.titel} – ${onderzoek.bedrijfsnaam}`;
    const acties = (u) => ({
      bewaar: ctx.alleenLezen ? null : () => wb.bewaarAnalyse(u),
      stuk: () => neemOpInStuk({ onderzoekId, tekst: uitvoerNaarTekst(u, { notatie: st.notatie }), alleenLezen: ctx.alleenLezen, stuksoorten: ctx.instellingen?.stuksoorten || null }),
      excel: () => bewaarBestand(uitvoerNaarXlsx([u], { notatie: st.notatie }), bestandsnaam(onderzoek, datum, 'xlsx'), XLSX),
      word: () => bewaarBestand(uitvoerNaarDocx([u], { titel: u.titel, voettekst: voet, notatie: st.notatie }), bestandsnaam(onderzoek, datum, 'docx'), DOCX),
      weghalen: () => {
        st.uitvoeren = st.uitvoeren.filter((x) => x !== u);
        teken();
      },
      schaalscore: ctx.alleenLezen || !u.schaalscore ? null : () => berekenDialoog(wb, { variabelen: u.schaalscore.variabelen }),
    });
    vervang(p,
      h('div', { class: 'wb-uitvoer-balk' },
        h('div', { class: 'knoppen' },
          h('button', { type: 'button', class: 'knop knop-klein', onclick: () => bewaarBestand(uitvoerNaarXlsx(st.uitvoeren, { notatie: st.notatie }), bestandsnaam(onderzoek, datum, 'xlsx'), XLSX) }, 'Hele uitvoer naar Excel'),
          h('button', { type: 'button', class: 'knop knop-klein', onclick: () => bewaarBestand(uitvoerNaarDocx(st.uitvoeren, { titel: `Werkbank – ${onderzoek.titel}`, voettekst: voet, notatie: st.notatie }), bestandsnaam(onderzoek, datum, 'docx'), DOCX) }, 'Hele uitvoer naar Word'),
          h('span', { class: 'label label-succes', title: 'Uitkomsten van minder dan 5 respondenten staan er niet in.' }, 'geschikt om te delen'),
          h('button', {
            type: 'button',
            class: 'knop knop-klein knop-licht',
            onclick: async () => {
              if (await bevestig({ titel: 'Uitvoer leegmaken?', tekst: 'Alle uitkomsten hieronder verdwijnen. Bewaarde analyses blijven bewaard.', knop: 'Leegmaken', gevaar: true })) {
                st.uitvoeren = [];
                teken();
              }
            },
          }, 'Uitvoer leegmaken')),
        h('p', { class: 'zacht wb-noot' }, 'De uitvoer blijft staan zolang je de pagina niet ververst. Bewaar wat je wilt houden als analyse.')),
      st.uitvoeren.map((u, i) => toonUitvoer(u, { notatie: st.notatie, acties: acties(u), nieuwste: i === 0 })));
  }

  function teken({ alleenKnoppen = false } = {}) {
    if (alleenKnoppen) {
      for (const k of hoofd.querySelectorAll('.wb-uitvoeren')) k.disabled = true;
      return;
    }
    if (!wb.overzicht) return;
    hoofd.dataset.tab = st.tab;
    for (const [naam, p] of Object.entries(panelen)) {
      p.id = `wb-paneel-${naam}`;
      p.setAttribute('role', 'tabpanel');
      p.setAttribute('aria-labelledby', `wb-tab-${naam}`);
      p.hidden = !(naam === st.tab || (naam === 'uitvoer' && st.tab === 'analyseren'));
      p.classList.toggle('wb-paneel-naast', naam === 'uitvoer' && st.tab === 'analyseren');
    }
    if (st.tab === 'variabelen') toonVariabelen(panelen.variabelen, wb);
    if (st.tab === 'analyseren') toonAnalyseren(panelen.analyseren, wb);
    if (st.tab === 'analyseren' || st.tab === 'uitvoer') tekenUitvoer();
    if (st.tab === 'analyses') toonMijnAnalyses(panelen.analyses, wb);
    const intro = h('details', { class: 'kaart wb-intro', open: !introGezien, ontoggle: (e) => { if (!e.target.open) introGezien = true; } },
      h('summary', {}, 'Wat is de werkbank?'),
      h('p', {}, INTRO));
    introGezien = true;
    vervang(hoofd,
      intro,
      werkbalk(),
      wb.overzicht.meldingen.length ? melding(wb.overzicht.meldingen.join(' '), 'waarschuwing') : null,
      tabbladen(),
      bezigEl,
      h('div', { class: 'wb-panelen' }, Object.values(panelen)),
      status);
  }
  wb.teken = teken;

  let heeftBron = false;
  try {
    heeftBron = await laadBron();
  } catch (e) {
    vervang(hoofd, melding([h('strong', {}, 'De gegevens konden niet worden klaargezet. '), e.message || ''], 'gevaar'));
    return;
  }
  if (!container.isConnected) return;
  if (!heeftBron) {
    vervang(hoofd,
      h('section', { class: 'kaart wb-intro' }, h('h2', {}, 'Werkbank'), h('p', {}, INTRO)),
      h('div', { class: 'leeg' },
        h('p', {}, wb.data.vragenlijsten.length
          ? 'Er zijn nog geen antwoorden om te analyseren. Zodra een vragenlijst is ingevuld, of als je een eigen dataset toevoegt (bij Analyse, stap voor stap, onderdeel 6), kun je hier aan de slag.'
          : 'Dit onderzoek heeft nog geen vragenlijst en geen eigen dataset. Maak eerst een vragenlijst en zet hem uit.'),
        ctx.alleenLezen ? null : h('a', { class: 'knop knop-primair', href: `#/onderzoek/${onderzoekId}/vragenlijsten` }, 'Naar Vragenlijsten')));
    return;
  }
  teken();
}
