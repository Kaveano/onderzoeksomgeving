// Scherm: Dashboard · Overzicht (HR-analytics) – #/onderzoek/:id/dashboard (BOUWPLAN §4 P3, D1 §4.2).
// Alle kerncijfers van één vragenlijst op één pagina, in een vaste volgorde:
//   1 In één oogopslag · 2 Deelname · 3 Wie deden mee? · 4 Kernscores · 5 Sterkste en zwakste punten ·
//   6 Thema's per groep · 7 Wat hangt samen met …? · 8 Signalen · 9 Ontwikkeling · 10 Kwaliteit van de gegevens ·
//   11 Personeelscijfers · 12 Eigen cijfers.
//
// Werking:
// - de gegevens komen uit gegevens.js (één download per onderzoek per sessie); de browser rekent alles uit met
//   verzamelKerncijfers (hr-analytics.js). Daar is alles al afgeschermd: een verborgen getal is null en staat hier als ×;
// - de cellen van "Thema's per groep" zijn letterlijk die van de uitsplitsing bij "Alle resultaten";
// - figuren komen uit figuren.js (SVG, kleuren via klassen) en worden op de breedte van hun vak getekend; bij een
//   andere breedte (telefoon draaien, venster smaller) opnieuw;
// - Excel en Word bevatten dezelfde afgeschermde cijfers (hr-rapport.js) en zijn dus "geschikt om te delen".
// Alleen voor de beheerder: een meelezer krijgt dit scherm niet (die ziet HR-analytics via een gedeeld rapport).

import { api } from '../api.js';
import { h, vervang, laden, leeg, melding, meld, meldFout, aantal, vandaag, tabSubnav, bevestig, formulierDialoog, uniekeId } from '../ui.js';
import { VERBORGEN, VERBORGEN_UITLEG } from '../privacy.js';
import { haalGegevens, voortgangTekst, vergeetGegevens } from '../gegevens.js';
import { verzamelKerncijfers, gekozenPersoneel, kenmerkSuggesties, standaardUitkomst, standaardSignalen, MAX_GROEPERINGEN } from '../hr-analytics.js';
import * as R from '../hr-rapport.js';
import { figuurNaarSvg } from '../figuren.js';
import { bouwModel, groepeerVragen } from '../analyse-model.js';
import { nlGetal, nlProcent, metTeken, nlDatum } from '../opmaak.js';
import { KENMERKEN } from '../kenmerken.js';
import { neemOpInStuk } from '../stukdialoog.js';
import { openHrInstellingen, bewaarHrInstellingen, uitkomstOpties } from './hr-instellingen.js';

const OPSLAG = 'overzicht-keuzes';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Een cel van "Thema's per groep" krijgt een kleur bij minstens zoveel verschil met iedereen samen. */
const HM_GRENS = { thema: 0.3, cijfer: 0.5, enps: 10 };
const HM_LEGENDA = 'Groen: minstens 0,3 hoger dan iedereen samen. Rood: minstens 0,3 lager. Bij de eNPS: minstens 10 punten; bij een rapportcijfer: minstens 0,5.';

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
const g1 = (x) => (eindig(x) ? nlGetal(x, 1) : VERBORGEN);
const pc = (x) => (eindig(x) ? nlProcent(x) : VERBORGEN);
const n0 = (x) => (eindig(x) ? nlGetal(x, 0) : VERBORGEN);
const sc = (x) => (eindig(x) ? metTeken(Math.round(x), 0) : VERBORGEN);
const nlKort = (iso) => {
  const t = nlDatum(iso);
  return t ? t.replace(/ \d{4}$/, '').replace(/(\w{3})\w*$/, '$1') : '';
};

// ---------- Keuzes (blijven bewaard bij wisselen van tabblad) ----------

const keuzes = new Map();
function leesKeuze(id) {
  if (keuzes.has(id)) return keuzes.get(id);
  const k = { vragenlijst: null, groepering: null, dimensie: null, uitkomst: null };
  try {
    const alles = JSON.parse(sessionStorage.getItem(OPSLAG) || '{}');
    const o = alles && typeof alles === 'object' ? alles[id] : null;
    if (o && typeof o === 'object') {
      k.vragenlijst = Number(o.vragenlijst) || null;
      k.groepering = Number(o.groepering) || null;
      k.dimensie = typeof o.dimensie === 'string' ? o.dimensie : null;
    }
  } catch {
    /* geen opslag: dan alleen voor dit bezoek */
  }
  keuzes.set(id, k);
  return k;
}
function bewaarKeuze(id, k) {
  keuzes.set(id, k);
  try {
    const alles = JSON.parse(sessionStorage.getItem(OPSLAG) || '{}') || {};
    alles[id] = { vragenlijst: k.vragenlijst, groepering: k.groepering, dimensie: k.dimensie };
    sessionStorage.setItem(OPSLAG, JSON.stringify(alles));
  } catch {
    /* niet erg */
  }
}

// ---------- Kleine bouwstenen ----------

/** Een verborgen getal: × met uitleg (ook voor schermlezers). */
function kruisje() {
  return [h('span', { 'aria-hidden': 'true', title: VERBORGEN_UITLEG }, VERBORGEN), h('span', { class: 'sr-only' }, 'niet getoond')];
}
const inhoudVan = (t) => (t === VERBORGEN ? kruisje() : t);

/** Tabel met een kop; kolommen in rechts krijgen getallen rechts. rijKop: de eerste kolom is een rijkop. */
function tabel(kop, rijen, { bijschrift = '', rechts = null, klasse = '' } = {}) {
  const r = rechts || new Set(kop.map((_, i) => i).filter((i) => i > 0));
  return h('div', { class: 'tabel-wrapper' },
    h('table', { class: `tabel hr-tabel ${klasse}` },
      bijschrift ? h('caption', { class: 'sr-only' }, bijschrift) : null,
      h('thead', {}, h('tr', {}, kop.map((k, i) => h('th', { scope: 'col', class: r.has(i) ? 'rechts' : null }, k)))),
      h('tbody', {}, rijen.map((rij) => h('tr', {}, rij.map((c, i) => (i === 0
        ? h('th', { scope: 'row' }, inhoudVan(c))
        : h('td', { class: r.has(i) ? 'rechts getal' : null }, inhoudVan(c)))))))));
}

function noot(tekst) {
  return tekst ? h('p', { class: 'hr-noot' }, tekst) : null;
}

/** Een tegel: groot getal, wat het is, en eventueel een regel eronder (bijv. "Ter vergelijking: …"). */
function tegel(label, waarde, ...onder) {
  return h('div', { class: 'kengetal hr-tegel' },
    h('div', { class: 'kengetal-waarde hr-tegel-waarde' }, inhoudVan(waarde)),
    h('div', { class: 'kengetal-label hr-tegel-label' }, label),
    onder.filter(Boolean).map((t) => h('div', { class: 'hr-tegel-onder' }, t)));
}

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const titel = ctx.onderzoek.onderzoek.titel;
  ctx.zetTitel(`HR-analytics – ${titel}`);
  const keuze = leesKeuze(onderzoekId);

  let data = null;
  let model = null;
  let k = null; // de kerncijfers van de gekozen vragenlijst
  let lijst = null; // de gekozen vragenlijst in het model
  let kandidaten = []; // vragen om groepen op te vergelijken
  let bronnen = {}; // citeersleutel → '(CBS, 2025)'
  let teller = 0;

  // Figuren tekenen zichzelf op de breedte van hun vak.
  const tekenaars = new Map();
  const waarnemer = typeof ResizeObserver === 'function'
    ? new ResizeObserver((items) => {
      for (const it of items) {
        const f = tekenaars.get(it.target);
        if (f) f(it.contentRect.width);
      }
    })
    : null;
  ctx.bijVertrek(() => {
    if (waarnemer) waarnemer.disconnect();
    tekenaars.clear();
  });

  const filterEl = h('div', { class: 'hr-filter' });
  const knoppenEl = h('div', { class: 'hr-acties' });
  const ladenEl = laden('De kerncijfers worden berekend…');
  const inhoud = h('div', { class: 'hr-inhoud' }, ladenEl);
  vervang(container,
    tabSubnav('dashboard', onderzoekId, ''),
    h('div', { class: 'hr' },
      h('div', { class: 'hr-kop' },
        h('h2', { id: 'hr-kop' }, 'HR-analytics'),
        h('p', { class: 'zacht hr-intro' }, 'De belangrijkste cijfers van een vragenlijst op één pagina: wie meededen, de scores, de verschillen tussen groepen en, met een personeelsbestand, verzuim en verloop. Groepen van minder dan 5 personen worden nooit getoond.')),
      h('div', { class: 'hr-balk' }, filterEl, knoppenEl),
      inhoud));

  // ---------- Gegevens en rekenen ----------

  async function laad({ vers = false } = {}) {
    const mijnBeurt = ++teller;
    if (!data) vervang(inhoud, ladenEl);
    inhoud.classList.add('hr-bezig');
    inhoud.setAttribute('aria-busy', 'true');
    try {
      const nieuw = await haalGegevens(onderzoekId, {
        vers,
        voortgang: (geladen, totaal) => { ladenEl.textContent = voortgangTekst(geladen, totaal); },
      });
      if (mijnBeurt !== teller || !container.isConnected) return;
      data = nieuw;
      model = bouwModel(data);
      ladenEl.textContent = 'De kerncijfers worden berekend…';
      await bereken(mijnBeurt);
    } catch (e) {
      if (mijnBeurt !== teller || e.status === 401) return;
      if (data) meldFout(e);
      else {
        vervang(inhoud, melding([
          h('p', {}, h('strong', {}, 'De kerncijfers konden niet worden geladen. '), e.message || ''),
          h('button', { type: 'button', class: 'knop knop-klein', onclick: () => laad() }, 'Opnieuw proberen'),
        ], 'gevaar'));
      }
    } finally {
      if (mijnBeurt === teller) {
        inhoud.classList.remove('hr-bezig');
        inhoud.removeAttribute('aria-busy');
      }
    }
  }

  const inst = () => (data?.hr_instellingen && typeof data.hr_instellingen === 'object' ? data.hr_instellingen : {});

  /** De gekozen vragenlijst: de bewaarde keuze, anders de laatste met antwoorden (zoals Alle resultaten). */
  function kiesLijst() {
    const lijsten = data.vragenlijsten || [];
    if (lijsten.some((l) => l.id === keuze.vragenlijst)) return keuze.vragenlijst;
    const met = new Set(data.inzendingen.map((i) => i.vragenlijst_id));
    const metAntwoorden = lijsten.filter((l) => met.has(l.id));
    return (metAntwoorden[metAntwoorden.length - 1] || lijsten[0])?.id ?? null;
  }

  async function bereken(beurt = teller) {
    const lijstId = kiesLijst();
    lijst = model.lijsten.find((l) => l.id === lijstId) || null;
    kandidaten = lijst ? groepeerVragen(lijst) : [];
    if (!kandidaten.some((q) => q.id === keuze.groepering)) {
      keuze.groepering = (kandidaten.find((q) => q.kenmerk === 'afdeling') || kandidaten[0])?.id ?? null;
    }
    // Alle indelingen (hooguit 6, achtergrondkenmerken eerst); de gekozen indeling zit er altijd bij.
    let groeperingen = kandidaten.map((q) => q.id).slice(0, MAX_GROEPERINGEN);
    if (keuze.groepering && !groeperingen.includes(keuze.groepering)) groeperingen = [...groeperingen.slice(0, MAX_GROEPERINGEN - 1), keuze.groepering];
    const instellingen = keuze.uitkomst ? { ...inst(), uitkomst: { sleutel: keuze.uitkomst } } : inst();
    k = verzamelKerncijfers(data, gekozenPersoneel(data, inst()), instellingen, { vragenlijstId: lijstId, groeperingen, peildatum: vandaag() });
    bronnen = await bronnenVoor(k.benchmarks);
    if (beurt !== teller || !container.isConnected) return;
    teken();
  }

  /** Korte bronvermelding per citeersleutel van de vergelijkingscijfers: "(CBS, 2025)". */
  async function bronnenVoor(benchmarks) {
    const sleutels = [...new Set((benchmarks || []).map((b) => b.citeersleutel).filter(Boolean))];
    if (!sleutels.length) return {};
    try {
      const [{ bronBijCiteersleutel }, { apaKort }] = await Promise.all([import('../bibliotheek-data.js'), import('../bibliotheek-regels.js')]);
      const uit = {};
      for (const s of sleutels) {
        const bron = await bronBijCiteersleutel(s);
        uit[s] = bron ? apaKort(bron) : '(bron niet gevonden in de bibliotheek)';
      }
      return uit;
    } catch {
      return Object.fromEntries(sleutels.map((s) => [s, `[@${s}]`]));
    }
  }

  // ---------- Opbouw ----------

  function teken() {
    if (waarnemer) waarnemer.disconnect();
    tekenaars.clear();
    tekenFilter();
    tekenKnoppen();
    if (!(data.vragenlijsten || []).length) {
      vervang(inhoud,
        leeg('Er is nog geen vragenlijst. Maak er een bij Vragenlijsten; zodra er antwoorden zijn, zie je hier de kerncijfers.',
          h('a', { class: 'knop knop-primair', href: `#/onderzoek/${onderzoekId}/vragenlijsten` }, 'Naar Vragenlijsten')),
        personeelKaart(), eigenCijfersKaart());
      return;
    }
    const kaarten = [];
    const zonderUitkomsten = !k.lijst || k.lijst.verborgen || !k.lijst.n;
    kaarten.push(oogopslagKaart(), deelnameKaart());
    // Eerst 1 tot 4 antwoorden (dan is n verborgen, dus null), daarna nog geen antwoorden.
    if (k.lijst?.verborgen) {
      kaarten.push(melding([h('strong', {}, `Nog minder dan ${k.drempel} ingevulde vragenlijsten. `), 'Om de anonimiteit te beschermen staan hier pas uitkomsten vanaf 5 respondenten.'], 'waarschuwing'));
    } else if (!k.lijst || !k.lijst.n) {
      kaarten.push(melding(['Er zijn nog geen antwoorden op deze vragenlijst. ', 'Zodra er minstens 5 vragenlijsten zijn ingevuld, zie je hier de scores, de groepen en de samenhang.']));
    }
    if (!zonderUitkomsten) {
      kaarten.push(samenstellingKaart(), kernscoresKaart(), sterkZwakKaart(), groepenKaart(), drijversKaart(), signalenKaart(), ontwikkelingKaart(), kwaliteitKaart());
    }
    kaarten.push(personeelKaart(), eigenCijfersKaart());
    vervang(inhoud, snelNaar(kaarten), kaarten);
  }

  function snelNaar(kaarten) {
    const doelen = kaarten.filter((x) => x && x.id && x.id !== 'hr-oogopslag');
    if (doelen.length < 3) return null;
    return h('nav', { class: 'hr-snelnaar', 'aria-label': 'Onderdelen van het overzicht' },
      h('span', { class: 'hr-snelnaar-label' }, 'Ga naar:'),
      doelen.map((x) => h('button', {
        type: 'button',
        class: 'knop knop-klein knop-licht',
        onclick: () => {
          const rustig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          x.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'start' });
          x.querySelector('h2')?.focus({ preventScroll: true });
        },
      }, x.dataset.kort)));
  }

  function kaart(id, kop, kort, { knop = null, uitleg = null } = {}, ...kinderen) {
    return h('section', { class: 'kaart hr-kaart', id, 'aria-labelledby': `${id}-kop`, dataset: { kort } },
      h('div', { class: 'kaart-kop' }, h('h2', { id: `${id}-kop`, tabindex: '-1' }, kop), knop),
      uitleg ? h('p', { class: 'hr-uitleg' }, uitleg) : null,
      kinderen);
  }

  /** Een figuur in een vak dat zich aanpast aan de breedte. */
  function figuurVak(fig) {
    if (!fig) return null;
    const vak = h('div', { class: 'hr-figuur-vak' });
    let vorige = 0;
    const tekenOp = (breedte) => {
      const b = Math.floor(breedte);
      if (!(b > 0) || Math.abs(b - vorige) < 2) return;
      vorige = b;
      try {
        vervang(vak, figuurNaarSvg(fig, { breedte: b }));
      } catch (e) {
        vervang(vak, h('p', { class: 'zacht' }, `De figuur kon niet worden getekend: ${e.message}`));
      }
    };
    if (waarnemer) {
      tekenaars.set(vak, tekenOp);
      waarnemer.observe(vak);
    } else requestAnimationFrame(() => tekenOp(vak.clientWidth || 600));
    return h('figure', { class: 'hr-figuur' },
      h('figcaption', { class: 'hr-figuur-titel' }, fig.titel),
      vak,
      fig.noot ? h('p', { class: 'hr-noot' }, fig.noot) : null);
  }

  /** Figuren voor één achtergrondvraag (respons per groep en samenstelling tegenover de organisatie). */
  function figurenVan(km) {
    if (!km) return [];
    return R.kerncijferFiguren({ kenmerken: [km], scores: {}, verloop: null, drijvers: null, personeel: null });
  }

  const benchmark = (sleutel) => (k.benchmarks || []).filter((b) => b.sleutel === sleutel);
  const benchmarkZin = (b) => R.benchmarkZin(b, bronnen[b.citeersleutel] || '');

  // ---------- Filterbalk en knoppen ----------

  function tekenFilter() {
    const lijsten = data.vragenlijsten || [];
    if (!lijsten.length) {
      vervang(filterEl);
      return;
    }
    const tel = new Map();
    for (const i of data.inzendingen) tel.set(i.vragenlijst_id, (tel.get(i.vragenlijst_id) || 0) + 1);
    const mm = new Map((data.meetmomenten || []).map((m) => [m.id, m.naam]));
    const lijstId = uniekeId('hr-lijst');
    const groepId = uniekeId('hr-groep');
    const velden = [h('div', { class: 'hr-veld' },
      h('label', { for: lijstId }, 'Vragenlijst'),
      h('select', {
        id: lijstId,
        onchange: (e) => {
          keuze.vragenlijst = Number(e.target.value);
          keuze.uitkomst = null;
          bewaarKeuze(onderzoekId, keuze);
          bereken();
        },
      }, lijsten.map((l) => h('option', { value: l.id, selected: l.id === lijst?.id },
        `${l.titel}${mm.get(l.meetmoment_id) ? ` (${mm.get(l.meetmoment_id)})` : ''} – ${aantal(tel.get(l.id) || 0, 'antwoord', 'antwoorden')}`))))];
    if (kandidaten.length) {
      velden.push(h('div', { class: 'hr-veld' },
        h('label', { for: groepId }, 'Vergelijk groepen op'),
        h('select', {
          id: groepId,
          onchange: (e) => {
            keuze.groepering = Number(e.target.value);
            bewaarKeuze(onderzoekId, keuze);
            bereken();
          },
        }, kandidaten.map((q) => h('option', { value: q.id, selected: q.id === keuze.groepering }, KENMERKEN[q.kenmerk]?.naam && q.kenmerk !== 'overig' ? KENMERKEN[q.kenmerk].naam : q.tekst)))));
    }
    const actief = document.activeElement?.id;
    vervang(filterEl, velden);
    if (actief === lijstId || actief === groepId) document.getElementById(actief)?.focus();
  }

  function tekenKnoppen() {
    const metCijfers = !!k?.lijst && !k.lijst.verborgen && k.lijst.n > 0;
    // Ook als alleen een andere vragenlijst (in de Ontwikkeling) openstaat: dan staat de zin ook in de bestanden.
    const open = k ? R.openLabel(k) : null;
    const knop = (tekst, fn, uit = false) => {
      const b = h('button', { type: 'button', class: 'knop knop-klein', disabled: uit }, tekst);
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await fn();
        } catch (e) {
          meldFout(e);
        } finally {
          b.disabled = uit;
        }
      });
      return b;
    };
    vervang(knoppenEl,
      h('div', { class: 'knoppen' },
        knop('Excel', naarExcel, !metCijfers && !k?.personeel),
        knop('Word', naarWord, !metCijfers && !k?.personeel),
        h('span', { class: 'label label-succes', title: 'Uitkomsten van minder dan 5 respondenten staan er niet in.' }, 'geschikt om te delen'),
        open ? h('span', { class: 'label label-waarschuwing', title: open.uitleg, 'aria-label': `${open.tekst}. ${open.uitleg}` }, open.tekst) : null,
        knop('Neem op in stuk', naarStuk, !k?.lijst),
        knop('Instellingen', () => instellingen())));
  }

  // ---------- Acties ----------

  async function instellingen(tab = null) {
    const opgeslagen = await openHrInstellingen({ ctx, data, lijstId: lijst?.id ?? null, tab });
    if (opgeslagen) {
      keuze.uitkomst = null;
      await laad();
    }
  }

  async function personeelToevoegen() {
    const m = await import('./personeel-kaart.js');
    const id = await m.personeelToevoegen(ctx, { data });
    if (id) {
      meld('Het personeelsbestand is verwerkt. Alleen de groepscijfers zijn bewaard.', 'succes');
      await laad();
    }
    return id;
  }

  /**
   * Met een personeelsbestand: vragen of de personeelscijfers mee moeten (gezondheidsgegevens, PR-16). Voor Excel,
   * Word en "Neem op in stuk" (een stuk kan ook gedeeld worden).
   */
  async function exportCijfers({ waar = 'In het bestand', knopTekst = 'Downloaden' } = {}) {
    if (!k.personeel) return k;
    const keuzeDlg = await formulierDialoog({
      titel: 'Personeelscijfers meenemen?',
      intro: `${waar} staan de afgeschermde kerncijfers. Kies of de cijfers uit het personeelsbestand er ook in komen.`,
      velden: [{ naam: 'mee', type: 'checkbox', label: 'Ook de personeelscijfers meenemen (zoals verzuim)', hulp: 'Dit zijn gegevens over de gezondheid van medewerkers. Deel ze alleen als dat met de opdrachtgever is afgesproken.' }],
      knop: knopTekst,
    });
    if (!keuzeDlg) return null;
    const uit = R.kerncijfersVoorKijker(k, { tussenstand: true, metPersoneel: keuzeDlg.mee });
    if (!keuzeDlg.mee) uit.benchmarks = uit.benchmarks.filter((b) => !R.isPersoneelBenchmark(b));
    return uit;
  }

  const naamBestand = (ext) => {
    const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'onderzoek';
    return `${slug(ctx.onderzoek.onderzoek.bedrijfsnaam || titel)}-hr-analytics-${vandaag()}.${ext}`;
  };

  async function naarStuk() {
    const kx = await exportCijfers({ waar: 'In het stuk', knopTekst: 'Verder' });
    if (!kx) return;
    await neemOpInStuk({ onderzoekId, tekst: R.kerncijferTekst(kx, { metPersoneel: !!kx.personeel }), alleenLezen: ctx.alleenLezen, stuksoorten: ctx.instellingen?.stuksoorten || null });
  }

  async function naarExcel() {
    const kx = await exportCijfers();
    if (!kx) return;
    const b = await import('../bestanden.js');
    b.bewaarBestand(b.maakXlsx(R.kerncijferBladen(kx)), naamBestand('xlsx'), XLSX);
    meld('Het Excel-bestand is gedownload.', 'succes');
  }

  async function naarWord() {
    const kx = await exportCijfers();
    if (!kx) return;
    const [b, f] = await Promise.all([import('../bestanden.js'), import('../figuren.js')]);
    const blokken = await wordBlokken(R.kerncijferBlokken(kx, 'alles', { bronnen }), f.figuurVoorWord);
    const o = ctx.onderzoek.onderzoek;
    const kopTekst = [
      { soort: 'alinea', tekst: `${o.bedrijfsnaam ? `${o.bedrijfsnaam} – ` : ''}${kx.lijst ? `vragenlijst "${kx.lijst.titel}"${kx.lijst.meetmoment_naam ? ` (${kx.lijst.meetmoment_naam})` : ''}` : 'personeelscijfers'}. Peildatum ${nlDatum(kx.peildatum)}.` },
      { soort: 'alinea', tekst: `*Alleen afgeschermde cijfers: groepen van minder dan ${kx.drempel} respondenten staan er niet in. ${VERBORGEN_UITLEG}*` },
    ];
    const oz = R.openZin(kx);
    if (oz) kopTekst.push({ soort: 'alinea', tekst: `**${oz}**` });
    const bytes = b.maakDocx({ titel: `HR-analytics – ${o.titel}`, blokken: [...kopTekst, ...blokken], voettekst: `${o.titel}${o.bedrijfsnaam ? ` – ${o.bedrijfsnaam}` : ''}` });
    b.bewaarBestand(bytes, naamBestand('docx'), DOCX);
    meld('Het Word-bestand is gedownload.', 'succes');
  }

  async function markeerKenmerk(s, knop) {
    knop.disabled = true;
    try {
      const q = data.vragen.find((x) => x.id === s.vraag_id);
      if (q && !q.uitsplitsen) {
        // Ook "uitsplitsen" aan: alleen dan vergelijkt het Overzicht de groepen (B11).
        let opties = q.opties;
        if (typeof opties === 'string') opties = JSON.parse(opties || '[]');
        await api.put(`/vragen/${q.id}`, {
          thema_id: q.thema_id, meetpunt_id: q.meetpunt_id, type: q.type, tekst: q.tekst, toelichting: q.toelichting, opties,
          schaal_soort: q.schaal_soort, meerdere_antwoorden: !!q.meerdere_antwoorden, verplicht: !!q.verplicht, weet_niet: !!q.weet_niet,
          uitsplitsen: true, kenmerk: s.kenmerk,
        });
      } else {
        await api.put(`/vragen/${s.vraag_id}/kenmerk`, { kenmerk: s.kenmerk });
      }
      vergeetGegevens(onderzoekId);
      meld(`De vraag is gemarkeerd als kenmerk ${s.kenmerk_naam}.`, 'succes');
      await laad();
    } catch (e) {
      meldFout(e);
      knop.disabled = false;
    }
  }

  // ---------- 1. In één oogopslag ----------

  function oogopslagKaart() {
    const l = k.lijst;
    const tegels = [];
    const verg = (sleutel) => benchmark(sleutel).map(benchmarkZin);
    if (l) {
      if (l.verborgen) tegels.push(tegel('Ingevuld', `minder dan ${k.drempel}`));
      else if (eindig(l.respons_pct)) tegels.push(tegel('Respons', nlProcent(l.respons_pct), `${n0(l.n)} ingevuld`, ...verg('respons_pct')));
      else tegels.push(tegel('Ingevuld', n0(l.n), ...verg('respons_pct')));
    }
    const s = k.scores;
    const e = s.enps;
    if (e) tegels.push(tegel('eNPS', e.verborgen ? VERBORGEN : sc(e.score), e.verborgen ? null : `${R.promotorsTekst(e.promotors)} · ${R.criticastersTekst(e.criticasters)}`, ...verg('enps')));
    const rapport = s.cijfers.find((c) => c.schaal_soort === 'rapport');
    if (rapport) tegels.push(tegel('Rapportcijfer', rapport.verborgen ? VERBORGEN : g1(rapport.gemiddelde), rapport.verborgen ? null : `${nlProcent(rapport.pct_onvoldoende)} onvoldoende`));
    const themas = s.themas.filter((t) => !t.verborgen && eindig(t.gemiddelde));
    if (themas.length >= 2) {
      const r = (t) => Math.round(t.gemiddelde * 10);
      const hoog = [...themas].sort((a, b) => r(b) - r(a) || a.naam.localeCompare(b.naam, 'nl'))[0];
      const laag = [...themas].sort((a, b) => r(a) - r(b) || a.naam.localeCompare(b.naam, 'nl'))[0];
      tegels.push(tegel('Hoogste thema', g1(hoog.gemiddelde), hoog.naam), tegel('Laagste thema', g1(laag.gemiddelde), laag.naam));
    }
    if (l && !l.verborgen && l.n) tegels.push(tegel(k.signalen.length === 1 ? 'Signaal' : 'Signalen', String(k.signalen.length), k.signalen.length ? 'Zie Signalen hieronder.' : 'Geen volgens de ingestelde grenzen.'));
    const p = k.personeel?.totaal;
    if (p && !p.verborgen) {
      tegels.push(tegel('Medewerkers', n0(p.medewerkers), `peildatum ${nlDatum(k.personeel.peildatum)}`));
      if (!k.personeel.ontbreekt.includes('verzuim_pct')) tegels.push(tegel('Verzuim', eindig(p.verzuim_pct) ? `${nlGetal(p.verzuim_pct, 1)}%` : VERBORGEN, ...verg('verzuim_pct')));
      if (!k.personeel.ontbreekt.includes('verloop_pct')) tegels.push(tegel('Verloop', pc(p.verloop_pct), eindig(p.uitstroom) ? R.aantalTekst(p.uitstroom, 'vertrekker', 'vertrekkers') : null, ...verg('verloop_pct')));
    }
    const verborgen = tegels.some((t) => t.textContent.includes(VERBORGEN));
    return h('section', { class: 'kaart hr-kaart', id: 'hr-oogopslag', 'aria-labelledby': 'hr-oogopslag-kop', dataset: { kort: 'In één oogopslag' } },
      h('div', { class: 'kaart-kop' },
        h('h2', { id: 'hr-oogopslag-kop', tabindex: '-1' }, 'In één oogopslag'),
        l ? h('span', { class: 'zacht klein' }, `${l.titel}${l.meetmoment_naam ? ` · ${l.meetmoment_naam}` : ''}${l.status === 'open' ? ' · staat nog open' : ''}`) : null),
      tegels.length ? h('div', { class: 'hr-tegels' }, tegels) : h('p', { class: 'zacht' }, 'Nog geen cijfers.'),
      verborgen ? noot(VERBORGEN_UITLEG) : null);
  }

  // ---------- 2. Deelname ----------

  function deelnameKaart() {
    const ls = k.deelname.lijsten;
    const rijen = ls.map((l) => [
      l.titel, l.meetmoment_naam || '–', eindig(l.uitgenodigd) ? n0(l.uitgenodigd) : '–', l.klein ? VERBORGEN : n0(l.n),
      l.controleer_aantallen ? 'controleer de aantallen' : eindig(l.respons_pct) ? nlProcent(l.respons_pct) : l.klein ? VERBORGEN : '–',
      eindig(l.foutmarge_pp) ? `±${Math.round(l.foutmarge_pp)} procentpunt` : '–',
    ]);
    const dl = ls.find((l) => l.id === k.lijst?.id);
    const zin = dl ? R.foutmargeZin(dl.n, dl.populatie, dl.foutmarge_pp) : null;
    const bronN = { uitgenodigd: 'het aantal uitgenodigden bij de vragenlijst', personeel: 'het aantal medewerkers in het personeelsbestand', handmatig: 'de aantallen medewerkers bij Instellingen' };
    const curve = curveFiguur();
    const km = k.kenmerken.find((x) => x.vraag_id === keuze.groepering) || null;
    const responsFig = figurenVan(km).find((f) => f.id.startsWith('respons-'));
    const kandidaat = kandidaten.find((q) => q.id === keuze.groepering);
    let perGroep;
    if (!k.lijst || k.lijst.verborgen || !k.lijst.n) perGroep = null;
    else if (!kandidaat) perGroep = h('p', { class: 'zacht' }, 'Met een achtergrondvraag (bijvoorbeeld de afdeling) zie je hier ook de respons per groep.');
    else if (!km) perGroep = h('p', { class: 'zacht' }, `De respons per groep is er alleen voor achtergrondvragen (zoals afdeling of leeftijd). "${kandidaat.tekst}" is een gewone vraag om op uit te splitsen.`);
    else if (!responsFig) {
      perGroep = h('div', { class: 'hr-leeg-blok' },
        h('p', {}, 'Vul bij Instellingen in hoeveel medewerkers er in elke groep werken, of voeg een personeelsbestand toe. Dan zie je hier de respons per groep.'),
        ctx.alleenLezen ? null : h('div', { class: 'knoppen' },
          h('button', { type: 'button', class: 'knop knop-klein', onclick: () => instellingen('populatie') }, 'Aantallen invullen'),
          h('button', { type: 'button', class: 'knop knop-klein knop-licht', onclick: () => personeelToevoegen().catch(meldFout) }, 'Personeelsbestand toevoegen')));
    } else {
      perGroep = [figuurVak(responsFig),
        km.groepen.some((g) => g.populatie_verborgen) ? noot(VERBORGEN_UITLEG) : null];
    }
    return kaart('hr-deelname', 'Deelname', 'Deelname', {},
      tabel(['Vragenlijst', 'Meetmoment', 'Uitgenodigd', 'Ingevuld', 'Respons', 'Foutmarge'], rijen, { bijschrift: 'Respons per vragenlijst', rechts: new Set([2, 3, 4, 5]) }),
      ls.some((l) => l.klein) ? noot(VERBORGEN_UITLEG) : null,
      zin ? h('div', { class: 'hr-zinnen' },
        h('p', {}, zin, dl.populatie_bron && dl.populatie_bron !== 'uitgenodigd' ? ` (Uitgegaan van ${bronN[dl.populatie_bron]}.)` : ''),
        h('p', { class: 'hr-noot' }, R.FOUTMARGE_UITLEG))
        : (k.lijst && !k.lijst.verborgen && k.lijst.n ? noot('De foutmarge staat er zodra bekend is hoeveel mensen de vragenlijst kregen: vul het aantal uitgenodigden in bij de vragenlijst, voeg een personeelsbestand toe, of vul bij Instellingen bij elke groep van een achtergrondvraag het aantal medewerkers in.') : null),
      curve ? [h('h3', { class: 'hr-subkop' }, 'Wanneer werd er ingevuld?'), figuurVak(curve),
        k.deelname.per_dag_samengevoegd ? noot('Dagen met minder dan 5 ingevulde vragenlijsten zijn samengenomen met de dagen erna.') : null] : null,
      perGroep ? [responsFig ? null : h('h3', { class: 'hr-subkop' }, `Respons per ${(km?.kenmerk_naam || 'groep').toLowerCase()}`), perGroep] : null);
  }

  function curveFiguur() {
    const p = k.deelname.per_dag || [];
    if (p.length < 2) return null;
    const max = Math.max(k.lijst?.uitgenodigd || 0, p[p.length - 1].cumulatief);
    return {
      soort: 'figuur', id: 'reactiecurve', vorm: 'lijn', titel: 'Ingevulde vragenlijsten, opgeteld', bijschrift: 'Ingevulde vragenlijsten, opgeteld',
      alt: `Ingevulde vragenlijsten van ${nlDatum(p[0].datum)} tot ${nlDatum(p[p.length - 1].datum)}: ${p.map((x) => `${nlKort(x.datum)} ${nlGetal(x.cumulatief, 0)}`).join(', ')}.`,
      eenheid: 'aantal', schaal: { min: 0, max: Math.max(5, max) }, categorieen: p.map((x) => nlKort(x.datum)),
      reeksen: [{ label: 'Ingevuld (opgeteld)', waarden: p.map((x) => x.cumulatief) }],
    };
  }

  // ---------- 3. Wie deden mee? ----------

  function samenstellingKaart() {
    const suggesties = ctx.alleenLezen || !lijst ? [] : kenmerkSuggesties(data, lijst.id);
    const suggestieEl = suggesties.length
      ? h('div', { class: 'hr-suggesties' },
        h('h3', { class: 'hr-subkop' }, 'Lijkt dit een achtergrondvraag?'),
        h('p', { class: 'zacht' }, 'Markeer de vraag als kenmerk; dan zie je hier ook wie meededen in die groepen en hoe dat zich verhoudt tot de organisatie.'),
        h('ul', { class: 'lijst' }, suggesties.map((s) => {
          const knop = h('button', { type: 'button', class: 'knop knop-klein' }, `Markeren als kenmerk ${s.kenmerk_naam}`);
          knop.addEventListener('click', () => markeerKenmerk(s, knop));
          return h('li', { class: 'lijst-item' }, h('div', { class: 'lijst-item-hoofd' }, h('div', { class: 'lijst-item-titel' }, s.tekst)), h('div', { class: 'lijst-item-acties' }, knop));
        })))
      : null;
    if (!k.kenmerken.length) {
      return kaart('hr-samenstelling', 'Wie deden mee?', 'Wie deden mee?', {},
        h('p', {}, "Deze vragenlijst heeft nog geen achtergrondvragen. Voeg ze toe bij Vragenlijsten met de knop 'Achtergrondvragen toevoegen'."),
        ctx.alleenLezen || !lijst ? null : h('p', {}, h('a', { href: `#/onderzoek/${onderzoekId}/vragenlijsten/${lijst.id}` }, 'Vragenlijst openen')),
        suggestieEl);
    }
    const blokken = k.kenmerken.map((km) => {
      const t = R.samenstellingTabel(km);
      const fig = figurenVan(km).find((f) => f.id.startsWith('samenstelling-'));
      return h('div', { class: 'hr-kenmerk' },
        h('h3', { class: 'hr-subkop' }, km.kenmerk_naam && km.kenmerk !== 'overig' ? km.kenmerk_naam : km.tekst),
        km.kenmerk_naam && km.kenmerk !== 'overig' ? h('p', { class: 'zacht klein' }, km.tekst) : null,
        fig ? figuurVak(fig) : null,
        tabel(t.kop, t.rijen.map((r) => r.cellen), { bijschrift: km.tekst }),
        R.representativiteitZinnen(km).map((z) => h('p', { class: 'hr-oordeel' }, z)),
        t.noten.map((n) => noot(n)));
    });
    const zonderOrganisatie = k.kenmerken.filter((km) => !km.representativiteit).map((km) => (km.kenmerk_naam && km.kenmerk !== 'overig' ? km.kenmerk_naam : km.tekst).toLowerCase());
    return kaart('hr-samenstelling', 'Wie deden mee?', 'Wie deden mee?',
      { uitleg: '"Geen duidelijke aanwijzing" betekent niet dat de groepen gelijk zijn: bij weinig respondenten vind je een verschil minder snel.' },
      blokken,
      zonderOrganisatie.length ? h('div', { class: 'hr-leeg-blok' },
        h('p', {}, `Voor ${zonderOrganisatie.join(', ')} is nog niet bekend hoeveel medewerkers er in elke groep werken. Vul de aantallen in bij Instellingen, of voeg een personeelsbestand toe; dan zie je ook of de respondenten op de organisatie lijken.`),
        ctx.alleenLezen ? null : h('div', { class: 'knoppen' },
          h('button', { type: 'button', class: 'knop knop-klein', onclick: () => instellingen('populatie') }, 'Aantallen invullen'))) : null,
      suggestieEl);
  }

  // ---------- 4. Kernscores ----------

  function kernscoresKaart() {
    const s = k.scores;
    const figs = R.kerncijferFiguren({ ...k, kenmerken: [], verloop: null, drijvers: null, personeel: null });
    const deel = [];
    if (s.themas.length) {
      deel.push(h('h3', { class: 'hr-subkop' }, "Thema's"),
        figuurVak(figs.find((f) => f.id === 'themas')),
        tabel(['Thema', 'Gemiddelde (1–5)', '% gunstig (4–5)', '% neutraal (3)', '% ongunstig (1–2)', 'Respondenten'],
          s.themas.map((t) => [t.naam, g1(t.gemiddelde), pc(t.pct_gunstig), pc(t.pct_neutraal), pc(t.pct_ongunstig), n0(t.n)]), { bijschrift: "Gemiddelde en verdeling per thema" }),
        s.themas.some((t) => t.verborgen) ? noot(VERBORGEN_UITLEG) : null);
      const verg = (k.benchmarks || []).filter((b) => /^[tv]:/.test(b.sleutel));
      if (verg.length) deel.push(h('ul', { class: 'hr-vergelijk' }, verg.map((b) => h('li', {}, `${R.benchmarkNaam(b, k)}: ${benchmarkZin(b)}`))));
    } else deel.push(h('p', { class: 'zacht' }, 'Deze vragenlijst heeft geen schaalvragen (1 tot 5), dus geen themascores.'));
    const e = s.enps;
    if (e) {
      deel.push(h('h3', { class: 'hr-subkop' }, `eNPS: ${e.tekst}`));
      if (e.verborgen) deel.push(h('p', {}, kruisje(), ' ', VERBORGEN_UITLEG));
      else {
        deel.push(figuurVak(figs.find((f) => f.id === 'enps')),
          h('p', {}, R.enpsZin(e)),
          noot(R.ENPS_UITLEG),
          benchmark('enps').map((b) => h('p', { class: 'hr-vergelijk-zin' }, benchmarkZin(b))));
      }
    }
    for (const c of s.cijfers) {
      deel.push(h('h3', { class: 'hr-subkop' }, c.schaal_soort === 'nps' ? `eNPS: ${c.tekst}` : `Rapportcijfer: ${c.tekst}`));
      if (c.verborgen) {
        deel.push(h('p', {}, kruisje(), ' ', VERBORGEN_UITLEG));
        continue;
      }
      if (c.schaal_soort === 'nps') {
        deel.push(h('p', {}, R.enpsZin(c)));
        continue;
      }
      deel.push(h('div', { class: 'hr-tegels hr-tegels-klein' },
        tegel('Gemiddeld', g1(c.gemiddelde), eindig(c.ci_laag) ? `95%-interval ${nlGetal(c.ci_laag, 1)} tot ${nlGetal(c.ci_hoog, 1)}` : null),
        tegel('Onvoldoende (5 of lager)', pc(c.pct_onvoldoende)),
        tegel('Respondenten', n0(c.n))));
      if (c.verdeling?.length) {
        deel.push(figuurVak({
          soort: 'figuur', id: `cijfers-${c.vraag_id}`, vorm: 'staaf', titel: 'Verdeling van de cijfers', bijschrift: 'Verdeling van de cijfers',
          alt: `Verdeling van de cijfers: ${c.verdeling.map((v) => `${v.waarde}: ${v.aantal}`).join(', ')}.`,
          eenheid: 'aantal', schaal: null, categorieen: c.verdeling.map((v) => String(v.waarde)), reeksen: [{ label: 'Aantal', waarden: c.verdeling.map((v) => v.aantal) }],
        }));
      }
    }
    return kaart('hr-kernscores', 'Kernscores', 'Kernscores', { uitleg: 'Gunstig is een 4 of 5 op een schaal van 1 tot 5, ongunstig een 1 of 2. Een cijfervraag (0–10 of 1–10) telt nooit mee in de themascores.' }, deel);
  }

  // ---------- 5. Sterkste en zwakste punten ----------

  function sterkZwakKaart() {
    const s = k.scores;
    const lijstEl = (items) => h('ol', { class: 'hr-punten' }, items.map((x) => h('li', {},
      h('span', { class: 'hr-punt-tekst' }, x.tekst),
      h('span', { class: 'hr-punt-meta' }, `${g1(x.gemiddelde)} gemiddeld · ${pc(x.pct_gunstig)} gunstig${x.thema_naam ? ` · ${x.thema_naam}` : ''}`))));
    if (!s.sterkst.length && !s.zwakst.length) {
      return kaart('hr-sterkzwak', 'Sterkste en zwakste punten', 'Sterk en zwak', {}, h('p', { class: 'zacht' }, 'Er zijn nog geen schaalvragen met genoeg antwoorden om te vergelijken.'));
    }
    return kaart('hr-sterkzwak', 'Sterkste en zwakste punten', 'Sterk en zwak', { uitleg: 'De vragen met het hoogste en het laagste gemiddelde (schaal 1 tot 5).' },
      h('div', { class: 'raster-2' },
        h('div', {}, h('h3', { class: 'hr-subkop' }, 'Sterkste punten'), lijstEl(s.sterkst)),
        h('div', {}, h('h3', { class: 'hr-subkop' }, 'Zwakste punten'), s.zwakst.length ? lijstEl(s.zwakst) : h('p', { class: 'zacht' }, 'Te weinig vragen om ook zwakste punten te noemen.'))));
  }

  // ---------- 6. Thema's per groep ----------

  function groepenKaart() {
    const g = k.groepen.find((x) => x.vraag_id === keuze.groepering) || k.groepen[0] || null;
    if (!g) {
      return kaart('hr-groepen', "Thema's per groep", 'Per groep', {},
        h('p', { class: 'zacht' }, 'Met een achtergrondvraag (zoals afdeling) of een vraag om op uit te splitsen zie je hier de scores per groep.'));
    }
    const kolommen = g.kolommen;
    const tint = (soort, cel, totaal) => {
      if (!eindig(cel) || !eindig(totaal)) return '';
      const grens = HM_GRENS[soort === 'thema' ? 'thema' : soort];
      const d = Math.round((cel - totaal) * 10) / 10;
      return d >= grens - 1e-9 ? 'hm-hoger' : d <= -grens + 1e-9 ? 'hm-lager' : '';
    };
    const celEl = (rij, waarde, totaal) => {
      if (waarde === null || waarde === undefined) return h('td', { class: 'rechts getal hm-verborgen' }, kruisje());
      const klasse = tint(rij.soort, waarde, totaal);
      return h('td', { class: `rechts getal ${klasse}` }, rij.soort === 'enps' ? sc(waarde) : g1(waarde),
        klasse ? h('span', { class: 'sr-only' }, klasse === 'hm-hoger' ? ' (hoger dan iedereen)' : ' (lager dan iedereen)') : null);
    };
    // Cijfervragen kort ("eNPS", "Rapportcijfer", zoals in Word); de hele vraag staat erbij voor schermlezers en als je erop wijst.
    const rijNaam = (r) => {
      if (r.soort !== 'enps' && r.soort !== 'cijfer') return r.naam;
      return h('span', { title: r.naam }, R.rijNaamKort(g, r), h('span', { class: 'sr-only' }, ` (${r.naam})`));
    };
    const tabelEl = h('div', { class: 'tabel-wrapper hr-heatmap-wrapper' },
      h('table', { class: 'tabel hr-heatmap' },
        h('caption', { class: 'sr-only' }, `Gemiddelde per thema per groep, naar ${g.tekst}`),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, 'Thema'),
          kolommen.map((c) => h('th', { scope: 'col', class: 'rechts' }, c.label,
            c.samengevoegd && c.labels_samengevoegd.length ? h('span', { class: 'hr-th-sub' }, c.labels_samengevoegd.join(', ')) : null,
            c.verborgen ? h('span', { class: 'hr-th-sub' }, 'niet getoond') : null)),
          h('th', { scope: 'col', class: 'rechts' }, 'Iedereen'))),
        h('tbody', {},
          h('tr', { class: 'hm-aantal' }, h('th', { scope: 'row' }, 'Aantal respondenten'),
            kolommen.map((c) => h('td', { class: 'rechts getal' }, c.verborgen || c.n === null ? kruisje() : n0(c.n))),
            h('td', { class: 'rechts getal' }, n0(k.lijst.n))),
          g.rijen.map((r) => h('tr', {},
            h('th', { scope: 'row' }, rijNaam(r)),
            r.cellen.map((c) => celEl(r, c, r.totaal)),
            h('td', { class: 'rechts getal hm-totaal' }, r.totaal === null ? kruisje() : r.soort === 'enps' ? sc(r.totaal) : g1(r.totaal)))))));
    const toelichting = [...new Set(kolommen.map((c) => c.toelichting).filter(Boolean))];
    return kaart('hr-groepen', "Thema's per groep", 'Per groep',
      { uitleg: `Het gemiddelde per thema (1 tot 5) per groep, naar "${g.tekst}". Dezelfde getallen als bij Alle resultaten.` },
      g.rijen.length ? tabelEl : h('p', { class: 'zacht' }, 'Deze vragenlijst heeft geen schaalvragen of cijfervragen om per groep te vergelijken.'),
      h('p', { class: 'hr-legenda' }, h('span', { class: 'hm-voorbeeld hm-hoger', 'aria-hidden': 'true' }), h('span', { class: 'hm-voorbeeld hm-lager', 'aria-hidden': 'true' }), HM_LEGENDA),
      toelichting.map((t) => noot(t)),
      noot(`${VERBORGEN_UITLEG} Groepen met minder dan ${k.drempel} respondenten staan samen bij "Overige groepen samen" of worden niet getoond.`),
      noot('Leg de uitkomsten van verschillende indelingen niet naast elkaar om kleinere groepen af te leiden.'));
  }

  // ---------- 7. Wat hangt samen met …? ----------

  function drijversKaart() {
    const dr = k.drijvers;
    const opties = uitkomstOpties(model, lijst);
    const huidig = dr?.uitkomst?.sleutel || standaardUitkomst(lijst, inst()) || '';
    const kiesId = uniekeId('hr-uitkomst');
    const groepen = [...new Set(opties.map((o) => o.groep))];
    const kies = opties.length ? h('div', { class: 'hr-veld' },
      h('label', { for: kiesId }, 'Uitkomst'),
      h('select', {
        id: kiesId,
        onchange: async (e) => {
          const sleutel = e.target.value;
          if (ctx.alleenLezen) {
            keuze.uitkomst = sleutel;
            await bereken();
            return;
          }
          try {
            await bewaarHrInstellingen(onderzoekId, (i) => ({ ...i, uitkomst: { sleutel } }));
            keuze.uitkomst = null;
            meld('De uitkomst is opgeslagen voor dit onderzoek (ook voor rapporten).', 'succes');
            await laad();
          } catch (err) {
            meldFout(err);
          }
        },
      },
      huidig ? null : h('option', { value: '', selected: true }, 'Kies een uitkomst'),
      groepen.map((gr) => h('optgroup', { label: gr }, opties.filter((o) => o.groep === gr).map((o) => h('option', { value: o.sleutel, selected: o.sleutel === huidig }, o.naam.length > 90 ? `${o.naam.slice(0, 89)}…` : o.naam)))))) : null;
    const titelTekst = dr ? `Wat hangt samen met ${R.uitkomstKort(dr.uitkomst)}?` : 'Wat hangt samen met …?';
    if (!dr) {
      return kaart('hr-drijvers', titelTekst, 'Samenhang', {},
        kies,
        h('p', { class: 'zacht' }, 'Kies een uitkomst, bijvoorbeeld de eNPS, een rapportcijfer of de algemene tevredenheid. Dan zie je welke thema\'s daar het sterkst mee samenhangen.'));
    }
    const fig = R.kerncijferFiguren({ ...k, kenmerken: [], scores: {}, verloop: null, personeel: null }).find((f) => f.id === 'prioriteiten');
    const rijen = dr.rijen.map((r) => [
      r.naam,
      r.reden === 'weggevallen' ? 'niet getoond' : eindig(r.r) ? nlGetal(r.r, 2) : '–',
      eindig(r.ci_laag) ? `${nlGetal(r.ci_laag, 2)} tot ${nlGetal(r.ci_hoog, 2)}` : '–',
      eindig(r.n) ? n0(r.n) : '–',
      g1(r.gemiddelde),
      r.kwadrant ? R.kwadrantTekst(r) : eindig(r.r) ? 'geen duidelijke samenhang' : r.reden === 'te_weinig' ? 'te weinig paren' : '–',
    ]);
    const uitkomst = `"${dr.uitkomst.naam}"`;
    return kaart('hr-drijvers', titelTekst, 'Samenhang', {},
      kies,
      h('p', { class: 'hr-oordeel' }, R.SAMENHANG_UITLEG(uitkomst)),
      tabel(['Thema', 'Samenhang (r)', '95%-interval', 'Respondenten', 'Gemiddelde', 'Kwadrant'], rijen, { bijschrift: `Samenhang met ${uitkomst}`, rechts: new Set([1, 2, 3, 4]) }),
      dr.rijen.some((r) => r.reden === 'weggevallen') ? noot('niet getoond: te weinig volledig ingevulde antwoorden om dit veilig naast het dashboard te tonen') : null,
      dr.rijen.some((r) => r.overlap) ? noot('Is de uitkomst zelf een vraag uit een thema, dan telt die vraag bij dat thema niet mee.') : null,
      fig ? [figuurVak(fig),
        noot('Rechts staan thema\'s die hoog scoren, boven thema\'s die sterk samenhangen met de uitkomst. Een kwadrant staat er alleen bij een duidelijke samenhang (p < 0,05). Het gaat om thema\'s, nooit om personen.'),
        dr.rijen.some((r) => r.kwadrant) ? noot(R.MATRIX_UITLEG) : null] : null,
      noot(`Alleen thema's met minstens 10 respondenten die beide beantwoordden. r loopt van −1 tot +1; hoe verder van 0, hoe sterker de samenhang.`));
  }

  // ---------- 8. Signalen ----------

  function signalenKaart() {
    const regels = inst().signalen || [];
    const voorstellen = lijst && !regels.length ? standaardSignalen(data, lijst.id) : [];
    const lijstEl = k.signalen.length
      ? h('ul', { class: 'hr-signalen' }, k.signalen.map((s) => h('li', {},
        h('span', {}, R.signaalZin(s)),
        s.regel === 'ongunstig' && !ctx.alleenLezen
          ? h('button', { type: 'button', class: 'hr-link', onclick: () => instellingen('signalen') }, 'Pas de signaalgrens aan')
          : null)))
      : h('p', {}, 'Er zijn geen signalen volgens de ingestelde grenzen.');
    return kaart('hr-signalen', 'Signalen', 'Signalen',
      { uitleg: 'Een signaal is een vaste regel voor de hele groep, bijvoorbeeld: minstens 30% scoort ongunstig op een vraag. Per groep zijn er geen signalen.' },
      lijstEl,
      voorstellen.length && !ctx.alleenLezen
        ? melding([`Er ${voorstellen.length === 1 ? 'staat 1 voorstel' : `staan ${voorstellen.length} voorstellen`} voor signaalregels klaar (bijvoorbeeld over werkdruk). `,
          h('button', { type: 'button', class: 'hr-link', onclick: () => instellingen('signalen') }, 'Bekijk de voorstellen bij Instellingen')])
        : null);
  }

  // ---------- 9. Ontwikkeling ----------

  function ontwikkelingKaart() {
    const v = k.verloop;
    if (!v) {
      return kaart('hr-ontwikkeling', 'Ontwikkeling', 'Ontwikkeling', {},
        h('p', { class: 'zacht' }, 'Zodra er een tweede meetmoment met antwoorden is, zie je hier hoe de scores zich ontwikkelen.'));
    }
    const mm = v.meetmomenten;
    const fig = R.kerncijferFiguren({ ...k, kenmerken: [], scores: {}, drijvers: null, personeel: null }).find((f) => f.id === 'verloop');
    const rijen = v.themas.map((t) => [t.naam, ...mm.map((m) => g1(t.punten.find((p) => p.meetmoment_id === m.id)?.gemiddelde))]);
    if (v.enps?.length) rijen.push(['eNPS', ...mm.map((m) => sc(v.enps.find((p) => p.meetmoment_id === m.id)?.score))]);
    rijen.push(['Respons', ...mm.map((m) => {
      const p = v.respons.find((x) => x.meetmoment_id === m.id);
      return !p ? '–' : eindig(p.respons_pct) ? nlProcent(p.respons_pct) : p.n === null ? VERBORGEN : '–';
    })]);
    rijen.push(['Ingevuld', ...mm.map((m) => {
      const p = v.respons.find((x) => x.meetmoment_id === m.id);
      return !p ? '–' : p.n === null ? VERBORGEN : n0(p.n);
    })]);
    const zinnen = R.verloopZinnen(v);
    return kaart('hr-ontwikkeling', 'Ontwikkeling', 'Ontwikkeling', { uitleg: 'Het gemiddelde per thema per meetmoment, met de eNPS en de respons.' },
      fig ? figuurVak(fig) : null,
      tabel(['', ...mm.map((m) => m.naam)], rijen, { bijschrift: 'Ontwikkeling per meetmoment' }),
      rijen.some((r) => r.includes(VERBORGEN)) ? noot(VERBORGEN_UITLEG) : null,
      zinnen.length ? [h('h3', { class: 'hr-subkop' }, 'Is het verschil groot genoeg?'), h('ul', { class: 'hr-zinnenlijst' }, zinnen.map((z) => h('li', {}, z)))] : null,
      zinnen.length ? noot('Statistisch significant betekent: zo\'n verschil is niet goed door toeval te verklaren (p kleiner dan 0,05). Vergeleken worden het eerste en het laatste meetmoment.') : null,
      // Staat alleen een andere vragenlijst open (niet de gekozen), dan zegt deze zin welke (ook zonder het label aan te wijzen).
      k.lijst?.status !== 'open' && R.openZin(k) ? noot(R.openZin(k)) : null);
  }

  // ---------- 10. Kwaliteit van de gegevens ----------

  function kwaliteitKaart() {
    const kw = k.kwaliteit;
    if (!kw) return null;
    const rijen = kw.per_vraag.map((q) => [q.tekst, q.verborgen ? VERBORGEN : n0(q.n_beantwoord), q.verborgen ? VERBORGEN : pc(q.pct_leeg), q.pct_weet_niet === null ? (q.verborgen ? VERBORGEN : '–') : pc(q.pct_weet_niet)]);
    const veelLeeg = kw.per_vraag.filter((q) => eindig(q.pct_leeg) && q.pct_leeg >= 20);
    return kaart('hr-kwaliteit', 'Kwaliteit van de gegevens', 'Kwaliteit', {},
      h('p', {}, R.kwaliteitZinnen(kw).join(' ')),
      veelLeeg.length ? h('p', {}, `${aantal(veelLeeg.length, 'vraag is', 'vragen zijn')} door minstens 20% van de respondenten overgeslagen. Kijk of die vragen duidelijk genoeg zijn.`) : null,
      h('details', { class: 'hr-uitklap' },
        h('summary', {}, `Bekijk per vraag (${kw.per_vraag.length})`),
        tabel(['Vraag', 'Ingevuld', 'Leeg', 'Weet niet'], rijen, { bijschrift: 'Ingevuld, leeg en weet niet per vraag' }),
        rijen.some((r) => r.includes(VERBORGEN)) ? noot(VERBORGEN_UITLEG) : null),
      noot('In de Werkbank kun je respondenten die overal hetzelfde antwoord gaven, weglaten met een selectie.'));
  }

  // ---------- 11. Personeelscijfers ----------

  function personeelKaart() {
    const rij = (data.personeelscijfers || []).find((p) => p.id === Number(inst().personeel?.id)) || null;
    const p = k?.personeel || null;
    if (!rij || !p) {
      const andere = (data.personeelscijfers || []).length;
      return kaart('hr-personeel', 'Personeelscijfers', 'Personeel', {},
        h('div', { class: 'hr-leeg-blok' },
          h('p', {}, andere
            ? 'Er is een personeelsbestand, maar het is niet gekozen voor dit overzicht. Kies het bij Instellingen.'
            : 'Voeg een personeelsbestand toe voor kerncijfers als verzuim en verloop. Je kiest zelf welke kolommen worden bewaard; namen en personeelsnummers nooit.'),
          ctx.alleenLezen ? null : h('div', { class: 'knoppen' },
            andere ? h('button', { type: 'button', class: 'knop knop-klein', onclick: () => instellingen('personeel') }, 'Kiezen bij Instellingen') : null,
            h('button', { type: 'button', class: `knop knop-klein${andere ? ' knop-licht' : ' knop-primair'}`, onclick: () => personeelToevoegen().catch(meldFout) }, 'Personeelsbestand toevoegen'))));
    }
    const t = p.totaal;
    const verlopen = rij.bewaren_tot < vandaag();
    const kopEl = [
      h('p', { class: 'zacht' }, `Uit "${p.naam}", ${p.periode.van} tot en met ${p.periode.tot}; peildatum ${nlDatum(p.peildatum)}. Er zijn alleen groepscijfers bewaard (aantallen en totalen per groep), geen gegevens per medewerker. Bewaren tot ${nlDatum(rij.bewaren_tot)}.`),
      verlopen ? melding([h('strong', {}, 'De bewaartermijn is verstreken. '), `Dit personeelsbestand mocht bewaard worden tot ${nlDatum(rij.bewaren_tot)}. Verwijder het personeelsbestand als het rapport klaar is.`,
        ctx.alleenLezen ? null : h('div', { class: 'knoppen' }, h('button', { type: 'button', class: 'knop knop-klein', onclick: () => instellingen('personeel') }, 'Verwijderen of langer bewaren'))], 'waarschuwing') : null,
    ];
    if (t.verborgen) {
      return kaart('hr-personeel', 'Personeelscijfers', 'Personeel', {}, kopEl,
        melding(`Het personeelsbestand heeft minder dan ${k.drempel} medewerkers op de peildatum. Om de anonimiteit te beschermen staan hier geen cijfers.`, 'waarschuwing'));
    }
    const kan = (sl) => !p.ontbreekt.includes(sl);
    const geslacht = t.geslacht || [];
    const man = geslacht.find((x) => x.label === 'Man');
    const vrouw = geslacht.find((x) => x.label === 'Vrouw');
    const verg = (sleutel) => benchmark(sleutel).map(benchmarkZin);
    const KPI = new Map(R.KPI_NAMEN.map(([s, naam, f]) => [s, { naam, f }]));
    const kpi = (s, naam = null, ...onder) => (kan(s) && KPI.has(s) ? tegel(naam || KPI.get(s).naam, R.kpiNvt(p, s) ? '–' : KPI.get(s).f(t[s]), ...onder) : null);
    const tegels = [
      tegel('Medewerkers op de peildatum', n0(t.medewerkers)),
      kpi('fte', 'Fte'),
      kpi('gem_leeftijd', 'Gemiddelde leeftijd'),
      kpi('pct_55plus', '55 jaar of ouder'),
      kpi('pct_60plus', '60 jaar of ouder', 'pensioen binnen ongeveer 5 jaar'),
      kan('pct_vrouw') ? tegel('Man / vrouw', `${man ? pc(man.pct) : VERBORGEN} / ${vrouw ? pc(vrouw.pct) : VERBORGEN}`) : null,
      kpi('gem_diensttijd_jaar', 'Gemiddelde diensttijd', 'in jaren'),
      kpi('pct_deeltijd', 'Deeltijd'),
      kpi('pct_leidinggevend', 'Leidinggevend'),
      kpi('verzuim_pct', 'Verzuimpercentage', ...verg('verzuim_pct')),
      kpi('meldingsfrequentie', 'Meldingsfrequentie', 'ziekmeldingen per medewerker per jaar'),
      kpi('gem_duur_per_melding', 'Gemiddelde duur per melding', 'kalenderdagen (benadering)'),
      kpi('nulverzuim_pct', 'Nulverzuim', 'heel de periode in dienst, nooit ziek gemeld'),
      // Verloop en instroom van de hele organisatie staan er altijd, ook bij 1 tot 4 (besluit R18), met het aantal.
      kpi('verloop_pct', 'Verloop', eindig(t.uitstroom) ? R.aantalTekst(t.uitstroom, 'vertrekker', 'vertrekkers') : null, ...verg('verloop_pct')),
      kpi('verloop_vrijwillig_pct', 'Vrijwillig verloop', 'op eigen verzoek'),
      kpi('instroom_pct', 'Instroom', eindig(t.instroom) ? R.aantalTekst(t.instroom, 'nieuwe medewerker', 'nieuwe medewerkers') : null),
      kpi('pct_eerste_jaar', 'Vertrek in het eerste jaar', 'van de vertrekkers'),
    ].filter(Boolean);
    const tegelsVerborgen = tegels.some((x) => x.textContent.includes(VERBORGEN));
    // Per groep
    const dims = p.per_groep.filter((g) => g.rijen.length);
    if (!dims.some((g) => g.dimensie === keuze.dimensie)) keuze.dimensie = (dims.find((g) => g.dimensie === 'afdeling') || dims[0])?.dimensie || null;
    const perId = uniekeId('hr-per');
    const groepVak = h('div', {});
    const vulGroep = () => {
      const g = dims.find((x) => x.dimensie === keuze.dimensie);
      if (!g) {
        vervang(groepVak);
        return;
      }
      // Dezelfde tabel als in Word en Excel: kolommen die het bestand niet had, staan er niet in.
      const pt = R.personeelGroepTabel(p, g);
      vervang(groepVak,
        tabel(pt.kop, pt.rijen, { bijschrift: `Personeelscijfers per ${g.dimensie_naam.toLowerCase()}` }),
        pt.noten.map((n) => noot(n)));
    };
    vulGroep();
    const leeftijdFig = R.kerncijferFiguren({ ...k, kenmerken: [], scores: {}, verloop: null, drijvers: null }).find((f) => f.id === 'leeftijdsopbouw');
    const redenen = p.uitstroom_redenen || [];
    const zwanger = R.ZWANGERSCHAPSVERLOF[p.zwangerschapsverlof];
    return kaart('hr-personeel', 'Personeelscijfers', 'Personeel', {},
      kopEl,
      h('div', { class: 'hr-tegels' }, tegels),
      R.kleinVerloop(p) ? noot(R.KLEIN_VERLOOP_UITLEG) : null,
      tegelsVerborgen ? noot(R.PERSONEEL_VERBORGEN) : null,
      t.verzuim_reden ? noot(R.VERZUIM_VERBORGEN_ORGANISATIE) : null,
      kan('verzuim_pct') && eindig(t.verzuim_pct) ? noot(`${R.DAGEN_UITLEG}${zwanger ? ` ${zwanger}` : ''}`) : null,
      dims.length ? [h('h3', { class: 'hr-subkop' }, 'Per groep'),
        dims.length > 1 ? h('div', { class: 'hr-veld' }, h('label', { for: perId }, 'Per'),
          h('select', { id: perId, onchange: (e) => { keuze.dimensie = e.target.value; bewaarKeuze(onderzoekId, keuze); vulGroep(); } },
            dims.map((g) => h('option', { value: g.dimensie, selected: g.dimensie === keuze.dimensie }, g.dimensie_naam)))) : null,
        groepVak] : null,
      leeftijdFig ? figuurVak(leeftijdFig) : null,
      contractTabel(t.contract),
      redenen.length ? [h('h3', { class: 'hr-subkop' }, 'Redenen van vertrek (hele organisatie)'),
        tabel(['Reden', 'Aantal'], redenen.map((r) => [r.label, n0(r.aantal)]), { bijschrift: 'Redenen van vertrek' }),
        noot('Redenen van vertrek staan er alleen voor de hele organisatie, nooit per groep.')] : null,
      h('details', { class: 'hr-uitklap' },
        h('summary', {}, 'Hoe zijn deze cijfers berekend?'),
        h('ul', { class: 'hr-definities' },
          h('li', {}, 'Verzuimpercentage: de verzuimdagen gedeeld door de dagen dat medewerkers in dienst waren, in kalenderdagen en gewogen naar de deeltijdfactor (fte).'),
          h('li', {}, 'Meldingsfrequentie: het aantal ziekmeldingen per medewerker per jaar.'),
          h('li', {}, 'Gemiddelde duur per melding: de verzuimdagen gedeeld door het aantal meldingen. Dit is een benadering: een melding die over de grens van de periode loopt, telt maar voor een deel mee.'),
          h('li', {}, 'Nulverzuim: het deel van de medewerkers dat de hele periode in dienst was en zich niet ziek meldde.'),
          h('li', {}, 'Verloop en instroom: het aantal vertrekkers en nieuwe medewerkers in de periode, gedeeld door het gemiddelde aantal medewerkers (begin plus einde, gedeeld door twee).'),
          h('li', {}, `Verloop en instroom van de hele organisatie staan er altijd, ook bij minder dan ${k.drempel} vertrekkers of nieuwe medewerkers: wie dat zijn, weet iedereen in de organisatie al. Vrijwillig verloop, de redenen van vertrek en het verloop per groep staan er pas vanaf ${k.drempel} vertrekkers.`),
          h('li', {}, 'Volgens de gangbare norm voor verzuimregistratie (de NVS-standaard van het CBS) tel je verzuim in kalenderdagen, gewogen naar de deeltijdfactor, en zonder zwangerschaps- en bevallingsverlof.'),
          zwanger ? h('li', {}, `In dit bestand: ${zwanger.charAt(0).toLowerCase()}${zwanger.slice(1)}`) : null,
          h('li', {}, `Verzuim staat er alleen bij groepen van minstens ${R.MIN_VERZUIM} medewerkers, en niet als het cijfer vooral over één persoon zou gaan (bij de verzuimdagen of bij de ziekmeldingen).`))));
  }

  /** Soort dienstverband van de organisatie (afgeschermd zoals de leeftijdsopbouw). */
  function contractTabel(contract) {
    const rijen = (contract || []).filter((c) => c.verborgen || c.n > 0);
    if (rijen.length < 2) return null;
    return [h('h3', { class: 'hr-subkop' }, 'Soort dienstverband'),
      tabel(['Soort dienstverband', 'Medewerkers', '%'], rijen.map((c) => [c.label, n0(c.n), pc(c.pct)]), { bijschrift: 'Medewerkers per soort dienstverband' }),
      rijen.some((c) => c.verborgen) ? noot(R.PERSONEEL_VERBORGEN) : null];
  }

  // ---------- 12. Eigen cijfers ----------

  function eigenCijfersKaart() {
    const lijstC = k?.eigen_cijfers || [];
    const ww = (c, x) => (x ? `${nlGetal(x.waarde, Number.isInteger(x.waarde) ? 0 : 1)}${c.eenheid ? (c.eenheid === '%' ? '%' : ` ${c.eenheid}`) : ''}` : '–');
    if (!lijstC.length) {
      return kaart('hr-eigen', 'Eigen cijfers', 'Eigen cijfers', {},
        h('p', { class: 'zacht' }, 'Je hebt nog geen eigen cijfers ingevoerd, zoals verzuim per kwartaal uit je eigen administratie. Voeg ze toe bij Eigen invoer.'),
        ctx.alleenLezen ? null : h('p', {}, h('a', { href: `#/onderzoek/${onderzoekId}/invoer` }, 'Naar Eigen invoer')));
    }
    const rijen = lijstC.map((c) => {
      const verschil = c.laatste && c.vorige ? c.laatste.waarde - c.vorige.waarde : null;
      return [c.naam, ww(c, c.laatste), c.laatste ? nlDatum(c.laatste.datum) : '–', ww(c, c.vorige), eindig(verschil) ? metTeken(verschil, Number.isInteger(verschil) ? 0 : 1) : '–'];
    });
    return kaart('hr-eigen', 'Eigen cijfers', 'Eigen cijfers', { uitleg: 'De laatste waarde van elke reeks die je zelf hebt ingevoerd bij Eigen invoer, met de vorige waarde.' },
      tabel(['Cijfer', 'Laatste', 'Datum', 'Vorige', 'Verschil'], rijen, { bijschrift: 'Eigen cijfers', rechts: new Set([1, 3, 4]) }));
  }

  await laad();
}

/**
 * De blokken van kerncijferBlokken klaarmaken voor Word: een figuur wordt een afbeelding (PNG via canvas, met de
 * alt-tekst in wp:docPr descr) met de noot eronder, en het bijschrift van een tabel komt er als korte regel boven.
 */
export async function wordBlokken(blokken, figuurVoorWord) {
  const uit = [];
  let vorigeKop = '';
  for (const b of blokken) {
    if (b.soort === 'figuur') {
      uit.push(await figuurVoorWord(b));
      // De noot van een figuur (bijv. een groep die er niet in staat) ook in Word, onder het bijschrift.
      if (b.noot) uit.push({ soort: 'alinea', tekst: `*${b.noot}*` });
    }
    else if (b.soort === 'tabel') {
      if (b.bijschrift && b.bijschrift !== vorigeKop) uit.push({ soort: 'alinea', tekst: `**${b.bijschrift}**` });
      const { bijschrift, ...rest } = b;
      uit.push(rest);
    } else uit.push(b);
    vorigeKop = b.soort === 'kop' ? b.tekst : '';
  }
  return uit;
}
