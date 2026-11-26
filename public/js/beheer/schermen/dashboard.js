// Scherm: Dashboard – de resultaten van een onderzoek in één overzicht:
// respons, gemiddelde score per thema, antwoorden per vraag, verloop over meetmomenten,
// eigen cijfers, open antwoorden en uitsplitsing per groep.
//
// Grafieken zijn gewone HTML-balken (breedte via element.style) en kleine SVG-lijngrafieken
// (via document.createElementNS). Elke grafiek heeft zichtbare getallen of een tabel ernaast.
// Tekst van respondenten en gebruikers gaat altijd via h()/textContent, nooit via innerHTML.

import { api } from '../api.js';
import {
  h, vervang, leeg, laden, melding, meld, meldFout, getal, procent, datum, aantal, kopieer, statusLabel,
} from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OPEN_EERST = 10; // zoveel open antwoorden direct tonen, de rest via "Toon alle"
const MAX_DAGEN = 92; // langer dan dit: alleen de dagen mét antwoorden tonen
const OPSLAG = 'dashboard-keuzes';

// Keuzes per onderzoek (vragenlijst, uitsplitsvraag) blijven bewaard bij wisselen van tabblad.
const keuzes = new Map();
const laatsteStuk = new Map();
let tabelWeergave = false;

function leesKeuze(id) {
  if (keuzes.has(id)) return keuzes.get(id);
  const k = { vragenlijst: null, uitsplitsen: null };
  try {
    const alles = JSON.parse(sessionStorage.getItem(OPSLAG) || '{}');
    const opgeslagen = alles && typeof alles === 'object' ? alles[id] : null;
    if (opgeslagen && typeof opgeslagen === 'object') {
      k.vragenlijst = Number(opgeslagen.vragenlijst) || null;
      k.uitsplitsen = Number(opgeslagen.uitsplitsen) || null;
    }
  } catch {
    /* geen opslag beschikbaar: dan alleen voor deze sessie onthouden */
  }
  keuzes.set(id, k);
  return k;
}

function bewaarKeuze(id, k) {
  keuzes.set(id, k);
  try {
    const alles = JSON.parse(sessionStorage.getItem(OPSLAG) || '{}') || {};
    alles[id] = { vragenlijst: k.vragenlijst, uitsplitsen: k.uitsplitsen };
    sessionStorage.setItem(OPSLAG, JSON.stringify(alles));
  } catch {
    /* niet erg */
  }
}

// ---------- Kleine hulpfuncties ----------

function svg(tag, attrs = {}, ...kinderen) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  }
  for (const k of kinderen.flat()) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

const heeft = (x) => x !== null && x !== undefined && !Number.isNaN(Number(x));
const nl = (n) => Number(n || 0).toLocaleString('nl-NL');
// Verschillen altijd berekenen uit de getoonde (afgeronde) waarden, zodat de getallen optellen.
const r1 = (x) => Math.round(x * 10) / 10;
const nTekst = (n) => `n = ${nl(n)}`;

/** Getal met maximaal 2 decimalen, zonder overbodige nullen: 4,25 / 12 / 0,5 */
function getalVrij(x) {
  if (!heeft(x)) return '–';
  return Number(x).toLocaleString('nl-NL', { maximumFractionDigits: 2 });
}

function waardeMetEenheid(w, eenheid) {
  const g = getalVrij(w);
  if (!eenheid) return g;
  return eenheid === '%' ? `${g}%` : `${g} ${eenheid}`;
}

function kort(tekst, max) {
  const t = String(tekst || '');
  return t.length > max ? `${t.slice(0, Math.max(1, max - 1))}…` : t;
}

/** Verschil als tekst met teken: +0,4 / −0,2 / 0,0 */
function metTeken(d, dec = 1) {
  if (!heeft(d)) return '–';
  const gelijk = Math.abs(d) < 0.5 * 10 ** -dec;
  if (gelijk) return getal(0, dec);
  return `${d > 0 ? '+' : '−'}${getal(Math.abs(d), dec)}`;
}

/** ▲ 0,4 (met uitleg voor schermlezers). Met dec = null: zonder vaste decimalen (4,25 / 12). */
function verschilEl(d, dec = 1, achtervoegsel = '') {
  if (!heeft(d)) return null;
  const gelijk = dec === null ? Math.abs(d) < 0.005 : Math.abs(d) < 0.5 * 10 ** -dec;
  const waarde = `${dec === null ? getalVrij(Math.abs(d)) : getal(Math.abs(d), dec)}${achtervoegsel}`;
  return h('span', { class: 'db-verschil' },
    h('span', { 'aria-hidden': 'true' }, gelijk ? '= gelijk' : `${d > 0 ? '▲' : '▼'} ${waarde}`),
    h('span', { class: 'sr-only' }, gelijk ? 'gelijk gebleven' : `${d > 0 ? 'gestegen' : 'gedaald'} met ${waarde}`),
  );
}

function isoNaarDag(iso) {
  const [j, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(j, m - 1, d);
}

function dagNaarIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Nette asverdeling voor een reeks waarden (ongeveer 3 tot 5 streepjes). */
function netteSchaal(min, max) {
  let lo = min;
  let hi = max;
  if (lo === hi) {
    const marge = Math.abs(lo) * 0.1 || 1;
    lo -= marge;
    hi += marge;
  }
  const ruw = (hi - lo) / 3;
  const macht = 10 ** Math.floor(Math.log10(ruw));
  const stap = [1, 2, 2.5, 5, 10].map((f) => f * macht).find((s) => s >= ruw) || ruw;
  let onder = Math.floor(lo / stap) * stap;
  const boven = Math.ceil(hi / stap) * stap;
  if (min >= 0 && onder < 0) onder = 0;
  const ticks = [];
  for (let t = onder; t <= boven + stap / 2; t += stap) ticks.push(Math.round(t * 1e6) / 1e6);
  return { min: onder, max: boven, ticks };
}

/** Kort, vriendelijk label voor een schaal: "Eens of helemaal eens" */
function samenLabel(a, b) {
  return `${a} of ${String(b).charAt(0).toLowerCase()}${String(b).slice(1)}`;
}

function scrollNaar(el) {
  if (!el) return;
  const rustig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'start' });
  const doel = el.matches('[tabindex]') ? el : el.querySelector('[tabindex="-1"]');
  if (doel) doel.focus({ preventScroll: true });
}

// ---------- Het scherm ----------

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const basis = `#/onderzoek/${onderzoekId}`;
  ctx.zetTitel(`Dashboard – ${ctx.onderzoek.onderzoek.titel}`);
  const keuze = leesKeuze(onderzoekId);
  const invoersoorten = ctx.instellingen.invoersoorten || {};
  const stuksoorten = ctx.instellingen.stuksoorten || {};

  let data = null;
  let teller = 0;

  // Lijngrafieken tekenen zichzelf op de werkelijke breedte (scherp en leesbaar op elk scherm).
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

  const filterEl = h('div', { class: 'db-filter' });
  const inhoud = h('div', { class: 'db-inhoud' }, laden('De resultaten worden geladen…'));
  let uitsplitsInhoud = null;
  vervang(container, h('div', { class: 'dashboard' }, filterEl, inhoud));

  // ---------- Gegevens ophalen ----------

  async function haal() {
    const q = new URLSearchParams();
    if (keuze.vragenlijst) q.set('vragenlijst', String(keuze.vragenlijst));
    if (keuze.uitsplitsen) q.set('uitsplitsen', String(keuze.uitsplitsen));
    const qs = q.toString();
    return api.get(`/onderzoeken/${onderzoekId}/dashboard${qs ? `?${qs}` : ''}`);
  }

  async function laad({ alleenUitsplitsing = false } = {}) {
    const mijnBeurt = ++teller;
    const bezigEl = alleenUitsplitsing && uitsplitsInhoud ? uitsplitsInhoud : inhoud;
    bezigEl.classList.add('db-bezig');
    bezigEl.setAttribute('aria-busy', 'true');
    try {
      const nieuw = await haal();
      if (mijnBeurt !== teller || !container.isConnected) return false;
      data = nieuw;
      if (alleenUitsplitsing && uitsplitsInhoud) vulUitsplitsing(uitsplitsInhoud);
      else teken();
      return true;
    } catch (e) {
      if (mijnBeurt !== teller || e.status === 401) return false;
      if (data) {
        meldFout(e);
      } else {
        vervang(inhoud, melding([
          h('p', {}, h('strong', {}, 'Het dashboard kon niet worden geladen. '), e.message || ''),
          h('button', { type: 'button', class: 'knop knop-klein', onclick: () => { vervang(inhoud, laden()); laad(); } }, 'Opnieuw proberen'),
        ], 'gevaar'));
      }
      return false;
    } finally {
      if (mijnBeurt === teller) {
        bezigEl.classList.remove('db-bezig');
        bezigEl.removeAttribute('aria-busy');
      }
    }
  }

  async function kiesVragenlijst(id) {
    const vorige = data && data.selectie
      ? data.selectie.uitsplitsvragen.find((q) => q.id === keuze.uitsplitsen)
      : null;
    keuze.vragenlijst = id;
    keuze.uitsplitsen = null;
    bewaarKeuze(onderzoekId, keuze);
    if (!(await laad())) return;
    // Dezelfde uitsplitsvraag (zelfde tekst) in de andere vragenlijst? Dan die meteen weer kiezen.
    const zelfde = vorige && data.selectie
      ? data.selectie.uitsplitsvragen.find((q) => q.tekst === vorige.tekst)
      : null;
    if (zelfde) {
      keuze.uitsplitsen = zelfde.id;
      bewaarKeuze(onderzoekId, keuze);
      await laad({ alleenUitsplitsing: true });
    }
  }

  // ---------- Opbouw ----------

  function lijstNaam() {
    const s = data.selectie;
    const r = data.respons.find((x) => x.vragenlijst_id === s.vragenlijst_id);
    return r && r.meetmoment_naam ? `${s.titel}, ${r.meetmoment_naam}` : s.titel;
  }

  function teken() {
    if (waarnemer) waarnemer.disconnect();
    tekenaars.clear();
    uitsplitsInhoud = null;
    const d = data;
    const sel = d.selectie;

    // Keuze van de vragenlijst (alleen bij meer dan één)
    const hadFocus = document.activeElement && document.activeElement.id === 'db-vragenlijst';
    if (d.respons.length > 1 && sel) {
      const kies = h('select', {
        id: 'db-vragenlijst',
        onchange: (e) => kiesVragenlijst(Number(e.target.value)),
      }, d.respons.map((r) => h('option', { value: r.vragenlijst_id, selected: r.vragenlijst_id === sel.vragenlijst_id },
        `${r.titel}${r.meetmoment_naam ? ` (${r.meetmoment_naam})` : ''} – ${aantal(r.aantal, 'antwoord', 'antwoorden')}`)));
      vervang(filterEl,
        h('label', { for: 'db-vragenlijst', class: 'db-filter-label' }, 'Resultaten van vragenlijst'),
        kies,
      );
      if (hadFocus) kies.focus();
    } else {
      vervang(filterEl);
    }

    const kaarten = [responsKaart()];
    const metAntwoorden = sel && sel.n > 0;
    if (!d.respons.length) {
      // al uitgelegd in de responskaart
    } else if (sel && !metAntwoorden) {
      kaarten.push(geenAntwoorden());
    } else if (sel) {
      if (sel.klein) {
        kaarten.push(melding([
          h('strong', {}, `Nog maar ${aantal(sel.n, 'respondent', 'respondenten')}. `),
          `Wees voorzichtig met conclusies: bij minder dan ${d.drempel} respondenten kan één persoon het beeld sterk bepalen. `,
          `Resultaten per groep (uitsplitsing) worden pas getoond vanaf ${d.drempel} respondenten per groep.`,
        ], 'waarschuwing'));
      }
      kaarten.push(themaKaart(), vragenKaart());
    }
    kaarten.push(verloopKaart(), eigenCijfersKaart());
    if (metAntwoorden) kaarten.push(openKaart(), uitsplitsKaart());

    vervang(inhoud, snelNaar(kaarten), kaarten);
  }

  function snelNaar(kaarten) {
    const doelen = kaarten.filter((k) => k && k.id && k.id !== 'db-respons');
    if (doelen.length < 3) return null;
    return h('nav', { class: 'db-snelnaar', 'aria-label': 'Onderdelen van het dashboard' },
      h('span', { class: 'db-snelnaar-label' }, 'Ga naar:'),
      doelen.map((k) => h('button', {
        type: 'button',
        class: 'knop knop-klein knop-licht',
        onclick: () => scrollNaar(k),
      }, k.dataset.kort || k.querySelector('h2').textContent)),
    );
  }

  function kaart(id, titel, kort, { knop = null, uitleg = null } = {}, ...kinderen) {
    return h('section', { class: 'kaart db-kaart', id, 'aria-labelledby': `${id}-kop`, dataset: { kort } },
      h('div', { class: 'kaart-kop' }, h('h2', { id: `${id}-kop`, tabindex: '-1' }, titel), knop),
      uitleg ? h('p', { class: 'db-uitleg' }, uitleg) : null,
      kinderen,
    );
  }

  // ---------- "Neem op in stuk" ----------

  function stukKnop(maakTekst, onderwerp, { licht = false } = {}) {
    const klasse = `knop knop-klein${licht ? ' knop-licht' : ''} db-stukknop`;
    if (ctx.alleenLezen) {
      return h('button', {
        type: 'button',
        class: klasse,
        onclick: async () => {
          if (await kopieer(maakTekst())) meld('Tekst gekopieerd. Je kunt hem nu in een ander document plakken.', 'succes');
          else meld('Kopiëren is niet gelukt.', 'fout');
        },
      }, 'Kopiëren', h('span', { class: 'sr-only' }, `: ${onderwerp}`));
    }
    return h('button', {
      type: 'button',
      class: klasse,
      'aria-haspopup': 'dialog',
      onclick: () => stukDialoog(maakTekst()),
    }, 'Neem op in stuk', h('span', { class: 'sr-only' }, `: ${onderwerp}`));
  }

  function stukDialoog(tekst) {
    const tekstVeld = h('textarea', { id: 'db-stuk-tekst', rows: 9, maxlength: 50000 }, tekst);
    const stukVeld = h('div', { class: 'veld' }, laden('Stukken worden geladen…'));
    const fout = h('div', { class: 'veld-fout', role: 'alert' });
    const status = h('span', { class: 'sr-only', role: 'status' });
    const toevoegen = h('button', { type: 'submit', class: 'knop knop-primair', disabled: true }, 'Toevoegen aan stuk');
    const kopieerKnop = h('button', { type: 'button', class: 'knop' }, 'Kopiëren');
    const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
    let keuzeEl = null;
    let stukken = [];

    const formulier = h('form', { method: 'dialog' },
      h('div', { class: 'dialoog-inhoud' },
        h('h2', { id: 'db-stuk-titel' }, 'Neem op in stuk'),
        h('p', { class: 'zacht' }, 'De tekst hieronder komt onderaan het gekozen stuk te staan. Je kunt hem hier eerst nog aanpassen.'),
        stukVeld,
        h('div', { class: 'veld' }, h('label', { for: 'db-stuk-tekst' }, 'Tekst'), tekstVeld),
        fout,
        status,
      ),
      h('div', { class: 'dialoog-voet' }, annuleer, kopieerKnop, toevoegen),
    );
    const dlg = h('dialog', { class: 'dialoog db-stukdialoog', 'aria-labelledby': 'db-stuk-titel' }, formulier);
    document.body.append(dlg);
    dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 0));
    annuleer.addEventListener('click', () => dlg.close());

    let kopieerTimer = null;
    kopieerKnop.addEventListener('click', async () => {
      const gelukt = await kopieer(tekstVeld.value);
      kopieerKnop.textContent = gelukt ? 'Gekopieerd ✓' : 'Kopiëren mislukt';
      status.textContent = gelukt ? 'De tekst is gekopieerd.' : 'Kopiëren is niet gelukt.';
      clearTimeout(kopieerTimer);
      kopieerTimer = setTimeout(() => { kopieerKnop.textContent = 'Kopiëren'; }, 2500);
    });

    formulier.addEventListener('submit', async (e) => {
      e.preventDefault();
      fout.textContent = '';
      if (!keuzeEl || !stukken.length) return;
      const waarde = tekstVeld.value.trim();
      if (!waarde) {
        fout.textContent = 'Er is geen tekst om toe te voegen.';
        tekstVeld.focus();
        return;
      }
      const stukId = Number(keuzeEl.value);
      const stuk = stukken.find((s) => s.id === stukId);
      toevoegen.disabled = true;
      try {
        await api.post(`/stukken/${stukId}/toevoegen`, { tekst: waarde });
        laatsteStuk.set(onderzoekId, stukId);
        dlg.close();
        meld(`Toegevoegd aan "${stuk ? stuk.titel : 'het stuk'}".`, 'succes');
      } catch (err) {
        fout.textContent = err.message || 'Toevoegen is niet gelukt.';
        toevoegen.disabled = false;
      }
    });

    dlg.showModal();
    kopieerKnop.focus();

    api.get(`/onderzoeken/${onderzoekId}/stukken`).then((r) => {
      stukken = (r && r.stukken) || [];
      if (!stukken.length) {
        vervang(stukVeld, melding([
          'Er zijn nog geen stukken in dit onderzoek. ',
          h('a', { href: `${basis}/stukken`, onclick: () => dlg.close() }, 'Maak er een aan bij Stukken'),
          ', of kopieer de tekst.',
        ]));
        return;
      }
      const vorige = laatsteStuk.get(onderzoekId);
      const standaard = stukken.find((s) => s.id === vorige) || stukken.find((s) => s.soort === 'bevindingen') || stukken[0];
      keuzeEl = h('select', { id: 'db-stuk-keuze' }, stukken.map((s) => {
        const soort = stuksoorten[s.soort] || s.soort;
        const label = s.titel.toLowerCase().includes(String(soort).toLowerCase()) ? s.titel : `${s.titel} (${soort})`;
        return h('option', { value: s.id, selected: s.id === standaard.id }, label);
      }));
      vervang(stukVeld, h('label', { for: 'db-stuk-keuze' }, 'Aan welk stuk toevoegen?'), keuzeEl);
      toevoegen.disabled = false;
      if (dlg.open && document.activeElement === kopieerKnop) keuzeEl.focus();
    }).catch((err) => {
      vervang(stukVeld, melding(`De stukken konden niet worden geladen. ${err.message || ''} Je kunt de tekst wel kopiëren.`, 'gevaar'));
    });
  }

  // ---------- 1. Respons ----------

  function responsKaart() {
    const d = data;
    const sel = d.selectie;
    if (!d.respons.length) {
      return kaart('db-respons', 'Respons', 'Respons', {},
        leeg(ctx.alleenLezen
          ? 'Dit onderzoek heeft geen vragenlijst.'
          : 'Dit onderzoek heeft nog geen vragenlijst. Maak er een bij Vragenlijsten; daarna zie je hier de resultaten.',
        ctx.alleenLezen ? null : h('a', { class: 'knop knop-primair', href: `${basis}/vragenlijsten` }, 'Naar Vragenlijsten')));
    }
    const meerdere = d.respons.length > 1;
    const tegels = d.respons.map((r) => {
      const gekozen = meerdere && sel && r.vragenlijst_id === sel.vragenlijst_id;
      let responsDeel;
      if (r.aantal_uitgenodigd) {
        const balk = h('div', { class: 'db-meter-vulling' });
        balk.style.width = `${Math.min(100, r.percentage || 0)}%`;
        responsDeel = [
          h('div', { class: 'db-meter', 'aria-hidden': 'true' }, balk),
          h('div', { class: 'db-respons-pct' },
            h('strong', {}, `${procent(r.percentage)} respons`),
            ` · ${nl(r.aantal_uitgenodigd)} uitgenodigd`),
        ];
      } else {
        responsDeel = h('div', { class: 'klein zacht' }, ctx.alleenLezen
          ? 'Aantal uitgenodigden niet bekend.'
          : 'Vul bij de vragenlijst het aantal uitgenodigden in om het responspercentage te zien.');
      }
      return h('div', { class: `kengetal db-respons-tegel${gekozen ? ' db-gekozen' : ''}` },
        h('div', { class: 'db-respons-titel' }, r.titel),
        h('div', { class: 'db-respons-labels' },
          statusLabel(r.status),
          r.meetmoment_naam ? h('span', { class: 'label' }, r.meetmoment_naam) : h('span', { class: 'klein zacht' }, 'geen meetmoment'),
          gekozen ? h('span', { class: 'label label-primair' }, 'Hieronder getoond') : null,
        ),
        h('div', { class: 'db-respons-getal' },
          h('span', { class: 'kengetal-waarde' }, nl(r.aantal)),
          h('span', { class: 'kengetal-label' }, 'keer ingevuld')),
        responsDeel,
      );
    });
    const gekozenRespons = sel ? d.respons.find((r) => r.vragenlijst_id === sel.vragenlijst_id) : null;
    return kaart('db-respons', 'Respons', 'Respons', {
      uitleg: meerdere ? 'Hoe vaak elke vragenlijst is ingevuld.' : null,
    },
    h('div', { class: 'db-respons-raster' }, tegels),
    gekozenRespons ? perDagStrook(gekozenRespons, meerdere) : null,
    );
  }

  function perDagStrook(r, meerdere) {
    if (!r.per_dag.length) return null;
    const kop = h('h3', { class: 'db-subkop' }, meerdere ? `Ingevuld per dag – ${r.titel}` : 'Ingevuld per dag');
    if (r.per_dag.length === 1) {
      return h('div', { class: 'db-perdag' }, kop,
        h('p', { class: 'zacht' }, r.aantal === 1
          ? `Ingevuld op ${datum(r.per_dag[0].datum)}.`
          : `Alles is ingevuld op ${datum(r.per_dag[0].datum)}.`));
    }
    const telling = new Map(r.per_dag.map((p) => [p.datum, p.aantal]));
    const begin = isoNaarDag(r.per_dag[0].datum);
    const eind = isoNaarDag(r.per_dag[r.per_dag.length - 1].datum);
    const dagen = Math.round((eind - begin) / 86400000) + 1;
    const reeks = dagen <= MAX_DAGEN
      ? Array.from({ length: dagen }, (_, i) => {
        const iso = dagNaarIso(begin + i * 86400000);
        return { datum: iso, aantal: telling.get(iso) || 0 };
      })
      : r.per_dag;
    const max = Math.max(...reeks.map((p) => p.aantal));
    const piek = reeks.find((p) => p.aantal === max);
    const kolommen = reeks.map((p) => {
      const balk = h('div', { class: `db-dag-balk${p.aantal ? '' : ' db-dag-nul'}` });
      if (p.aantal) balk.style.height = `${Math.max(4, (p.aantal / max) * 100)}%`;
      return h('div', { class: 'db-dag', title: `${datum(p.datum)}: ${aantal(p.aantal, 'antwoord', 'antwoorden')}` }, balk);
    });
    const kader = h('div', { class: 'db-dagen-kader', 'aria-hidden': 'true' },
      h('div', { class: 'db-dagen' }, kolommen),
      h('div', { class: 'db-dagen-as' },
        h('span', {}, datum(reeks[0].datum)),
        h('span', {}, datum(reeks[reeks.length - 1].datum))),
    );
    kader.style.maxWidth = `${Math.max(240, reeks.length * 26)}px`;
    return h('div', { class: 'db-perdag' }, kop,
      kader,
      h('p', { class: 'klein zacht db-perdag-tekst' },
        `${aantal(r.per_dag.length, 'dag', 'dagen')} met antwoorden${dagen > MAX_DAGEN ? ' (dagen zonder antwoorden zijn weggelaten)' : ''}. `,
        `Meeste op één dag: ${nl(max)} (${datum(piek.datum)}).`),
      h('ul', { class: 'sr-only' }, r.per_dag.map((p) => h('li', {}, `${datum(p.datum)}: ${aantal(p.aantal, 'antwoord', 'antwoorden')}`))),
    );
  }

  // ---------- 3. Geen antwoorden ----------

  function geenAntwoorden() {
    const sel = data.selectie;
    const r = data.respons.find((x) => x.vragenlijst_id === sel.vragenlijst_id);
    let tekst;
    if (ctx.alleenLezen) {
      tekst = 'Deze vragenlijst is niet ingevuld. Omdat het onderzoek gearchiveerd is, komen er geen antwoorden meer bij.';
    } else if (r && r.status === 'open') {
      tekst = 'De vragenlijst staat open, maar er zijn nog geen antwoorden. Deel de link met de respondenten (die vind je bij Vragenlijsten). Zodra de eerste antwoorden binnen zijn, zie je hier de resultaten.';
    } else {
      tekst = 'Er zijn nog geen antwoorden op deze vragenlijst. Zet de vragenlijst open en deel de link met de respondenten; dat doe je bij Vragenlijsten. Zodra de eerste antwoorden binnen zijn, zie je hier de resultaten.';
    }
    return h('section', { class: 'kaart db-kaart', 'aria-labelledby': 'db-leeg-kop' },
      h('h2', { id: 'db-leeg-kop', class: 'sr-only' }, 'Nog geen resultaten'),
      leeg(tekst, ctx.alleenLezen ? null : h('a', { class: 'knop knop-primair', href: `${basis}/vragenlijsten` }, 'Naar Vragenlijsten')),
    );
  }

  // ---------- 4. Gemiddelde score per thema ----------

  /** Horizontale balken op een vaste as van 1 tot 5 (balken beginnen bij 1). */
  function scoreLijst(rijen, { compact = false, label = '' } = {}) {
    const lijst = h('div', { class: `db-scores${compact ? ' db-scores-compact' : ''}`, role: 'list', 'aria-label': label || null },
      rijen.map((r) => {
        const plot = h('div', { class: 'db-score-plot', 'aria-hidden': 'true' });
        if (heeft(r.waarde)) {
          const pct = ((Math.min(5, Math.max(1, r.waarde)) - 1) / 4) * 100;
          const balk = h('div', { class: 'db-score-balk' });
          balk.style.width = `${pct}%`;
          const waarde = h('span', { class: 'db-score-waarde' }, getal(r.waarde, 1));
          waarde.style.left = `${pct}%`;
          plot.append(balk, waarde);
        } else {
          plot.append(h('span', { class: 'db-score-waarde db-score-geen' }, 'geen scores'));
        }
        return h('div', { class: 'db-score-rij', role: 'listitem', title: `${r.naam}: ${heeft(r.waarde) ? `gemiddeld ${getal(r.waarde, 1)}` : 'geen scores'}${r.n !== undefined ? ` (${nTekst(r.n)})` : ''}` },
          h('div', { class: 'db-score-naam' },
            h('span', { class: 'db-score-titel' }, r.naam),
            r.sub ? h('span', { class: 'db-score-sub' }, r.sub) : null,
            h('span', { class: 'sr-only' }, heeft(r.waarde) ? `: gemiddeld ${getal(r.waarde, 1)}` : ': nog geen scores'),
          ),
          plot,
        );
      }),
    );
    const as = h('div', { class: 'db-score-as', 'aria-hidden': 'true' },
      h('div', {}),
      h('div', { class: 'db-score-as-plot' }, [1, 2, 3, 4, 5].map((t) => {
        const s = h('span', {}, String(t));
        s.style.left = `${((t - 1) / 4) * 100}%`;
        return s;
      })),
    );
    return [lijst, as];
  }

  function snippetThemas() {
    const s = data.selectie;
    const regels = [`Gemiddelde score per thema – ${lijstNaam()} (${nTekst(s.n)})`, 'Schaal van 1 (laagst) tot 5 (hoogst)'];
    for (const t of s.themas) regels.push(`- ${t.naam}: ${getal(t.gemiddelde, 1)}${t.n !== s.n ? ` (${nTekst(t.n)})` : ''}`);
    if (s.meetpunten.length) {
      regels.push('', 'Per meetpunt:');
      for (const m of s.meetpunten) regels.push(`- ${m.naam}: ${getal(m.gemiddelde, 1)}${m.n !== s.n ? ` (${nTekst(m.n)})` : ''}`);
    }
    return regels.join('\n');
  }

  function themaKaart() {
    const s = data.selectie;
    if (!s.themas.length) {
      return kaart('db-themas', 'Gemiddelde score per thema', "Thema's", {},
        leeg('Deze vragenlijst heeft geen schaalvragen (1 tot 5), dus er zijn geen gemiddelde scores. De antwoorden per vraag staan hieronder.'));
    }
    const themaNaam = new Map((ctx.onderzoek.themas || []).map((t) => [t.id, t.naam]));
    return kaart('db-themas', 'Gemiddelde score per thema', "Thema's", {
      knop: stukKnop(snippetThemas, 'gemiddelde score per thema'),
      uitleg: `Het gemiddelde van alle schaalvragen per thema, op een schaal van 1 (laagst) tot 5 (hoogst); 3 is neutraal. ${aantal(s.n, 'respondent', 'respondenten')}.`,
    },
    scoreLijst(s.themas.map((t) => ({
      naam: t.naam,
      waarde: t.gemiddelde,
      n: t.n,
      sub: `${aantal(t.aantal_vragen, 'vraag', 'vragen')} · ${nTekst(t.n)}`,
    })), { label: 'Gemiddelde score per thema' }),
    s.meetpunten.length
      ? h('div', { class: 'db-meetpunten' },
        h('h3', { class: 'db-subkop' }, 'Per meetpunt'),
        scoreLijst(s.meetpunten.map((m) => ({
          naam: m.naam,
          waarde: m.gemiddelde,
          n: m.n,
          sub: `${themaNaam.get(m.thema_id) || ''}${m.n !== s.n ? ` · ${nTekst(m.n)}` : ''}`,
        })), { compact: true, label: 'Gemiddelde score per meetpunt' }))
      : null,
    );
  }

  // ---------- 5. Antwoorden per vraag ----------

  function verloopRegel(q) {
    if (!q.verloop) return null;
    const isJaNee = q.type === 'janee';
    const punten = q.verloop.filter((p) => heeft(isJaNee ? p.percentage_ja : p.gemiddelde));
    if (punten.length < 2) return null;
    const w = (p) => (isJaNee ? p.percentage_ja : p.gemiddelde);
    const tekst = punten.map((p) => `${p.naam} ${isJaNee ? `${procent(w(p))} ja` : getal(w(p), 1)}`).join(' → ');
    const dlt = isJaNee
      ? Math.round(w(punten[punten.length - 1])) - Math.round(w(punten[0]))
      : r1(w(punten[punten.length - 1])) - r1(w(punten[0]));
    return {
      tekst,
      verschil: dlt,
      el: h('div', { class: 'db-vraag-verloop' },
        h('span', { class: 'db-verloop-label' }, 'Verloop: '),
        h('span', {}, tekst), ' ',
        isJaNee ? verschilEl(dlt, 0, ' procentpunt') : verschilEl(dlt, 1)),
    };
  }

  function telTabel(q, eenheid = 'percentage') {
    return h('div', { class: 'tabel-wrapper db-tabelweergave' },
      h('table', { class: 'tabel db-teltabel' },
        h('caption', { class: 'sr-only' }, `Antwoorden op: ${q.tekst}`),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, 'Antwoord'),
          h('th', { scope: 'col', class: 'rechts' }, 'Aantal'),
          h('th', { scope: 'col', class: 'rechts' }, eenheid === 'respondenten' ? '% van respondenten' : 'Percentage'))),
        h('tbody', {}, q.verdeling.map((v) => h('tr', {},
          h('td', {}, v.label),
          h('td', { class: 'rechts getal' }, nl(v.aantal)),
          h('td', { class: 'rechts getal' }, procent(v.percentage))))),
      ),
    );
  }

  function schaalLegenda(labels, metWeetNiet) {
    const items = labels.map((l, i) => h('li', {}, h('span', { class: `db-swatch db-s${i + 1}`, 'aria-hidden': 'true' }), l));
    if (metWeetNiet) items.push(h('li', {}, h('span', { class: 'db-swatch db-swn', 'aria-hidden': 'true' }), 'Weet niet / n.v.t.'));
    return h('ul', { class: 'db-legenda db-grafiek', 'aria-label': 'Legenda' }, items);
  }

  function schaalSamenvatting(q) {
    const v = q.verdeling;
    const tot = q.n || 0;
    if (!tot || v.length < 5) return null;
    const hoog = v[3].aantal + v[4].aantal;
    const laag = v[0].aantal + v[1].aantal;
    return {
      hoogLabel: samenLabel(v[3].label, v[4].label),
      laagLabel: samenLabel(v[1].label, v[0].label),
      hoog: (hoog / tot) * 100,
      laag: (laag / tot) * 100,
    };
  }

  function schaalBlok(q) {
    if (!q.n) return [h('p', { class: 'zacht klein' }, 'Nog geen antwoorden op deze vraag.')];
    const delen = q.verdeling.filter((v) => v.aantal > 0);
    const balk = h('div', {
      class: 'db-stapel db-grafiek',
      role: 'img',
      'aria-label': `Verdeling: ${q.verdeling.map((v) => `${v.label} ${procent(v.percentage)} (${nl(v.aantal)})`).join(', ')}`,
    }, delen.map((v) => {
      const wn = v.waarde === 'weet_niet';
      const seg = h('div', { class: `db-seg ${wn ? 'db-swn' : `db-s${v.waarde}`}`, title: `${v.label}: ${procent(v.percentage)} (${nl(v.aantal)})` },
        h('span', { class: 'db-seg-tekst' }, procent(v.percentage)));
      seg.style.flexGrow = String(v.percentage || 0.0001);
      return seg;
    }));
    const sv = schaalSamenvatting(q);
    const wn = q.verdeling.find((v) => v.waarde === 'weet_niet');
    return [
      balk,
      telTabel(q),
      h('div', { class: 'db-vraag-meta' },
        h('span', {}, 'Gemiddeld ', h('strong', {}, getal(q.gemiddelde, 1))),
        h('span', {}, nTekst(q.n), wn && wn.aantal ? ` (waarvan ${nl(wn.aantal)} weet niet)` : ''),
        sv ? h('span', {}, `${sv.hoogLabel}: `, h('strong', {}, procent(sv.hoog))) : null,
        sv ? h('span', {}, `${sv.laagLabel}: `, h('strong', {}, procent(sv.laag))) : null,
      ),
    ];
  }

  function janeeBlok(q) {
    if (!q.n) return [h('p', { class: 'zacht klein' }, 'Nog geen antwoorden op deze vraag.')];
    const [ja, nee] = q.verdeling;
    const vulling = h('div', { class: 'db-meter-vulling' });
    vulling.style.width = `${q.percentage_ja || 0}%`;
    return [
      h('div', { class: 'db-janee db-grafiek' },
        h('div', { class: 'db-meter db-meter-groot', role: 'img', 'aria-label': `${procent(q.percentage_ja)} ja` }, vulling),
        h('span', { class: 'db-janee-waarde', 'aria-hidden': 'true' }, `${procent(q.percentage_ja)} ja`)),
      telTabel(q),
      h('div', { class: 'db-vraag-meta' },
        h('span', {}, `${nl(ja.aantal)} ja · ${nl(nee.aantal)} nee`),
        h('span', {}, nTekst(q.n))),
    ];
  }

  function meerkeuzeBlok(q) {
    if (!q.n) return [h('p', { class: 'zacht klein' }, 'Nog geen antwoorden op deze vraag.')];
    return [
      h('div', { class: 'db-opties db-grafiek', role: 'list' }, q.verdeling.map((v) => {
        const vulling = h('div', { class: 'db-meter-vulling' });
        vulling.style.width = `${Math.min(100, v.percentage || 0)}%`;
        return h('div', { class: 'db-optie', role: 'listitem' },
          h('span', { class: 'db-optie-label' }, v.label),
          h('div', { class: 'db-meter', 'aria-hidden': 'true' }, vulling),
          h('span', { class: 'db-optie-waarde' }, h('strong', {}, procent(v.percentage)), ` (${nl(v.aantal)})`));
      })),
      telTabel(q, q.meerdere_antwoorden ? 'respondenten' : 'percentage'),
      h('div', { class: 'db-vraag-meta' },
        h('span', {}, nTekst(q.n)),
        q.meerdere_antwoorden ? h('span', {}, 'Meerdere antwoorden mogelijk; percentages tellen op tot meer dan 100%.') : null),
    ];
  }

  function vraagSnippet(q, { kort: beknopt = false } = {}) {
    const vl = verloopRegel(q);
    if (beknopt) {
      let r = `- “${q.tekst}”`;
      if (!q.n) return `${r}: nog geen antwoorden`;
      if (q.type === 'schaal') {
        const sv = schaalSamenvatting(q);
        r += `: gemiddeld ${getal(q.gemiddelde, 1)}${sv ? `; ${sv.hoogLabel.toLowerCase()} ${procent(sv.hoog)}` : ''}`;
      } else if (q.type === 'janee') {
        r += `: ${procent(q.percentage_ja)} ja`;
      } else if (q.type === 'meerkeuze') {
        r += `: ${q.verdeling.map((v) => `${v.label} ${procent(v.percentage)}`).join(', ')}`;
      } else {
        r += `: ${aantal(q.n, 'antwoord', 'antwoorden')} (open vraag)`;
      }
      if (vl) r += ` (verloop: ${vl.tekst})`;
      return r;
    }
    const regels = [`“${q.tekst}” – ${lijstNaam()} (${nTekst(q.n)})`];
    if (!q.n) {
      regels.push('Nog geen antwoorden.');
    } else if (q.type === 'open') {
      regels.push(`${aantal(q.n, 'antwoord', 'antwoorden')} op deze open vraag.`);
    } else {
      for (const v of q.verdeling) regels.push(`- ${v.label}: ${procent(v.percentage)} (${nl(v.aantal)})`);
      if (q.type === 'schaal') regels.push(`Gemiddelde score: ${getal(q.gemiddelde, 1)} (schaal 1–5)`);
      if (q.type === 'meerkeuze' && q.meerdere_antwoorden) regels.push('Meerdere antwoorden mogelijk; percentages tellen op tot meer dan 100%.');
    }
    if (vl) regels.push(`Verloop: ${vl.tekst} (${q.type === 'janee' ? `${metTeken(vl.verschil, 0)} procentpunt` : metTeken(vl.verschil, 1)})`);
    return regels.join('\n');
  }

  function vraagBlok(q) {
    let delen;
    if (q.type === 'schaal') delen = schaalBlok(q);
    else if (q.type === 'janee') delen = janeeBlok(q);
    else if (q.type === 'meerkeuze') delen = meerkeuzeBlok(q);
    else {
      delen = [h('p', { class: 'db-vraag-meta' },
        q.n ? `${aantal(q.n, 'antwoord', 'antwoorden')} op deze open vraag. ` : 'Nog geen antwoorden op deze open vraag. ',
        q.n ? h('button', {
          type: 'button',
          class: 'knop knop-klein knop-licht db-naar-open',
          onclick: () => scrollNaar(document.getElementById(`db-open-${q.id}`)),
        }, 'Bekijk de open antwoorden') : null)];
    }
    const vl = verloopRegel(q);
    return h('li', { class: 'db-vraag' },
      h('div', { class: 'db-vraag-kop' },
        h('h4', { class: 'db-vraag-tekst' }, q.tekst),
        q.type !== 'open' ? stukKnop(() => vraagSnippet(q), `vraag “${kort(q.tekst, 60)}”`, { licht: true }) : null),
      delen,
      vl ? vl.el : null,
    );
  }

  function vragenKaart() {
    const s = data.selectie;
    // Vragen per thema groeperen (volgorde van de server aanhouden).
    const groepen = [];
    for (const q of s.vragen) {
      let g = groepen[groepen.length - 1];
      if (!g || g.thema_id !== q.thema_id) {
        g = { thema_id: q.thema_id, naam: q.thema_naam || 'Zonder thema', vragen: [] };
        groepen.push(g);
      }
      g.vragen.push(q);
    }
    if (!groepen.length) {
      return kaart('db-vragen', 'Antwoorden per vraag', 'Vragen', {}, leeg('Deze vragenlijst heeft nog geen vragen.'));
    }

    const wissel = h('input', {
      type: 'checkbox',
      id: 'db-tabelweergave',
      checked: tabelWeergave,
      onchange: (e) => {
        tabelWeergave = e.target.checked;
        kaartEl.classList.toggle('db-als-tabel', tabelWeergave);
      },
    });

    const themaBlokken = groepen.map((g, i) => {
      // Legenda bij elke reeks vragen met dezelfde antwoordschaal.
      const items = [];
      let vorigeSleutel = null;
      g.vragen.forEach((q, j) => {
        if (q.type === 'schaal') {
          const labels = q.verdeling.filter((v) => v.waarde !== 'weet_niet').map((v) => v.label);
          const sleutel = labels.join('|');
          if (sleutel !== vorigeSleutel) {
            let metWn = false;
            for (let k = j; k < g.vragen.length; k++) {
              const ander = g.vragen[k];
              if (ander.type !== 'schaal') continue;
              const sl = ander.verdeling.filter((v) => v.waarde !== 'weet_niet').map((v) => v.label).join('|');
              if (sl !== sleutel) break;
              if (ander.verdeling.some((v) => v.waarde === 'weet_niet')) metWn = true;
            }
            items.push(h('li', { class: 'db-legenda-item', 'aria-hidden': 'true' }, schaalLegenda(labels, metWn)));
            vorigeSleutel = sleutel;
          }
        }
        items.push(vraagBlok(q));
      });
      const themaSnippet = () => [
        `Thema ${g.naam} – ${lijstNaam()} (${nTekst(s.n)})`,
        ...g.vragen.map((q) => vraagSnippet(q, { kort: true })),
      ].join('\n');
      return h('details', { class: 'db-thema', open: i === 0 },
        h('summary', {},
          h('h3', { class: 'db-thema-naam' }, g.naam),
          h('span', { class: 'db-thema-aantal' }, aantal(g.vragen.length, 'vraag', 'vragen'))),
        h('div', { class: 'db-thema-inhoud' },
          h('div', { class: 'db-thema-acties' }, stukKnop(themaSnippet, `alle vragen van thema ${g.naam}`)),
          h('ul', { class: 'db-vragen' }, items)),
      );
    });

    const kaartEl = kaart('db-vragen', 'Antwoorden per vraag', 'Vragen', {
      uitleg: 'Per thema hoe de vragen zijn beantwoord. Klik op een thema om het open of dicht te klappen.',
    },
    h('div', { class: 'db-vragen-opties' },
      h('label', { class: 'keuze', for: 'db-tabelweergave' }, wissel, h('span', {}, 'Toon aantallen en percentages als tabel'))),
    themaBlokken,
    );
    kaartEl.classList.toggle('db-als-tabel', tabelWeergave);
    return kaartEl;
  }

  // ---------- 6. Verloop over meetmomenten ----------

  function grafiekHouder(tekenFn) {
    const el = h('div', { class: 'db-lijngrafiek' });
    let laatste = 0;
    const f = (b) => {
      const w = Math.floor(b);
      if (w < 60 || w === laatste) return;
      laatste = w;
      tekenFn(el, w);
    };
    if (waarnemer) {
      tekenaars.set(el, f);
      waarnemer.observe(el);
    } else {
      f(320);
    }
    return el;
  }

  /**
   * Tekent een kleine lijngrafiek.
   * o.punten: [{ x (0..1), y (of null), yLabel, titel }]; o.xLabels: [{ x, tekst, anker }]
   */
  function tekenLijn(el, breedte, o) {
    const H = o.hoogte || 170;
    const m = { l: o.margeLinks || 26, r: 12, t: 24, b: 30 };
    const inset = o.xInset || 0;
    const pw = breedte - m.l - m.r - inset * 2;
    const ph = H - m.t - m.b;
    const X = (x) => m.l + inset + x * pw;
    const Y = (y) => m.t + (1 - (y - o.yMin) / (o.yMax - o.yMin)) * ph;
    const s = svg('svg', {
      viewBox: `0 0 ${breedte} ${H}`, width: breedte, height: H, class: 'db-svg', role: 'img', 'aria-label': o.beschrijving, focusable: 'false',
    });
    for (const t of o.yTicks) {
      s.append(svg('line', { x1: m.l, x2: breedte - m.r, y1: Y(t), y2: Y(t), class: 'db-svg-raster' }));
      s.append(svg('text', { x: m.l - 7, y: Y(t) + 4, class: 'db-svg-as', 'text-anchor': 'end' }, o.yFmt(t)));
    }
    // x-labels, ingekort als ze niet passen
    const ruimte = o.xLabels.length > 1 ? pw / (o.xLabels.length - 1) : pw;
    const maxTekens = Math.max(4, Math.floor(Math.min(ruimte - 8, inset * 2 + 16) / 6.2));
    for (const xl of o.xLabels) {
      s.append(svg('text', { x: X(xl.x), y: H - 9, class: 'db-svg-as', 'text-anchor': xl.anker || 'middle' },
        xl.anker ? xl.tekst : kort(xl.tekst, maxTekens)));
    }
    let pad = '';
    let verbonden = false;
    for (const p of o.punten) {
      if (!heeft(p.y)) {
        verbonden = false;
        continue;
      }
      pad += `${verbonden ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`;
      verbonden = true;
    }
    if (pad) s.append(svg('path', { d: pad, class: 'db-svg-lijn' }));
    const metWaarde = o.punten.filter((p) => heeft(p.y));
    metWaarde.forEach((p, i) => {
      const cx = X(p.x);
      const cy = Y(p.y);
      s.append(svg('g', { class: 'db-svg-punt' },
        svg('title', {}, p.titel),
        svg('circle', { cx, cy, r: 12, class: 'db-svg-raak' }),
        svg('circle', { cx, cy, r: 4.5, class: 'db-svg-stip' })));
      if (o.labelAlle || i === 0 || i === metWaarde.length - 1) {
        // Label boven het punt; bij de randen naar binnen laten wijzen zodat het niet over de as valt.
        const half = String(p.yLabel).length * 3.8;
        let anker = 'middle';
        let lx = cx;
        if (cx - half < m.l + 2) {
          anker = 'start';
          lx = cx - 4;
        } else if (cx + half > breedte - 2) {
          anker = 'end';
          lx = cx + 4;
        }
        s.append(svg('text', { x: lx, y: cy - 11, class: 'db-svg-waarde', 'text-anchor': anker }, p.yLabel));
      }
    });
    vervang(el, s);
  }

  function snippetVerloop(mmData) {
    const v = data.verloop;
    const regels = ['Verloop over meetmomenten – gemiddelde score per thema (schaal 1–5)'];
    for (const t of v.themas) {
      const punten = mmData.map((mm) => ({ mm, p: t.punten.find((x) => x.meetmoment_id === mm.id) }))
        .filter((x) => x.p && heeft(x.p.gemiddelde));
      if (!punten.length) continue;
      const tekst = punten.map((x) => `${x.mm.naam} ${getal(x.p.gemiddelde, 1)}`).join(' → ');
      const dlt = punten.length > 1 ? r1(punten[punten.length - 1].p.gemiddelde) - r1(punten[0].p.gemiddelde) : null;
      regels.push(`- ${t.naam}: ${tekst}${dlt !== null ? ` (${metTeken(dlt, 1)})` : ''}`);
    }
    return regels.join('\n');
  }

  function verloopTabel(reeksen, mmData, caption, naamKop) {
    return h('div', { class: 'tabel-wrapper' },
      h('table', { class: 'tabel db-verloop-tabel' },
        h('caption', { class: 'sr-only' }, caption),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, naamKop),
          mmData.map((mm) => h('th', { scope: 'col', class: 'rechts' }, mm.naam, mm.datum ? h('span', { class: 'db-th-sub' }, datum(mm.datum)) : null)),
          h('th', { scope: 'col', class: 'rechts' }, 'Verschil'))),
        h('tbody', {}, reeksen.map((t) => {
          const cellen = mmData.map((mm) => t.punten.find((p) => p.meetmoment_id === mm.id));
          const met = cellen.filter((p) => p && heeft(p.gemiddelde));
          const dlt = met.length > 1 ? r1(met[met.length - 1].gemiddelde) - r1(met[0].gemiddelde) : null;
          return h('tr', {},
            h('th', { scope: 'row' }, t.naam, t.thema_naam ? h('span', { class: 'db-th-sub' }, t.thema_naam) : null),
            cellen.map((p) => h('td', { class: 'rechts getal' },
              p && heeft(p.gemiddelde) ? [getal(p.gemiddelde, 1), h('span', { class: 'db-td-sub' }, nTekst(p.n))] : '–')),
            h('td', { class: 'rechts getal' }, dlt !== null ? verschilEl(dlt, 1) : '–'));
        })),
      ),
    );
  }

  function verloopKaart() {
    const v = data.verloop;
    const mmData = v.meetmomenten.filter((mm) => v.themas.some((t) => t.punten.some((p) => p.meetmoment_id === mm.id && heeft(p.gemiddelde))));
    const zonder = v.zonder_meetmoment && v.zonder_meetmoment.length
      ? h('p', { class: 'klein zacht db-zonder-mm' },
        `Niet meegeteld omdat ${v.zonder_meetmoment.length === 1 ? 'deze vragenlijst' : 'deze vragenlijsten'} niet aan een meetmoment gekoppeld ${v.zonder_meetmoment.length === 1 ? 'is' : 'zijn'}: `,
        v.zonder_meetmoment.map((t) => `“${t}”`).join(', '),
        ctx.alleenLezen ? '.' : '. Je koppelt een vragenlijst aan een meetmoment bij Vragenlijsten.')
      : null;

    if (mmData.length < 2) {
      const tekst = mmData.length === 1
        ? `Er zijn nu alleen resultaten van ${mmData[0].naam}. Zodra een tweede meetmoment (bijvoorbeeld een vervolgmeting) antwoorden heeft, zie je hier hoe de scores per thema veranderen.`
        : 'Zodra minstens twee meetmomenten (bijvoorbeeld een nulmeting en een vervolgmeting) antwoorden hebben, zie je hier hoe de scores per thema veranderen.';
      const hoe = ctx.alleenLezen
        ? null
        : 'Een vervolgmeting maak je door bij Opzet een nieuw meetmoment toe te voegen en bij Vragenlijsten de vragenlijst daarvoor te kopiëren. Zo blijven de vragen vergelijkbaar.';
      return kaart('db-verloop', 'Verloop over meetmomenten', 'Verloop', {},
        h('div', { class: 'db-zacht-blok' }, h('p', {}, tekst), hoe ? h('p', { class: 'klein zacht' }, hoe) : null),
        zonder);
    }

    const k = mmData.length;
    const figuren = v.themas.map((t) => {
      const punten = mmData.map((mm, i) => {
        const p = t.punten.find((x) => x.meetmoment_id === mm.id);
        const y = p && heeft(p.gemiddelde) ? p.gemiddelde : null;
        return {
          x: k === 1 ? 0.5 : i / (k - 1),
          y,
          yLabel: getal(y, 1),
          titel: y === null ? `${mm.naam}: geen gegevens` : `${mm.naam}: gemiddeld ${getal(y, 1)} (${nTekst(p.n)})`,
        };
      });
      const met = punten.filter((p) => p.y !== null);
      const dlt = met.length > 1 ? r1(met[met.length - 1].y) - r1(met[0].y) : null;
      const beschrijving = `${t.naam}: ${mmData.map((mm, i) => `${mm.naam} ${punten[i].y === null ? 'geen gegevens' : getal(punten[i].y, 1)}`).join(', ')}`;
      return h('figure', { class: 'db-mini' },
        h('figcaption', { class: 'db-mini-kop' }, h('span', { class: 'db-mini-titel' }, t.naam), verschilEl(dlt, 1)),
        grafiekHouder((el, w) => tekenLijn(el, w, {
          punten,
          yMin: 1,
          yMax: 5,
          yTicks: [1, 2, 3, 4, 5],
          yFmt: (x) => String(x),
          xLabels: mmData.map((mm, i) => ({ x: k === 1 ? 0.5 : i / (k - 1), tekst: mm.naam })),
          xInset: Math.min(46, (w - 40) / 4),
          labelAlle: k <= 5,
          hoogte: w < 360 ? 150 : 170,
          beschrijving,
        })),
      );
    });

    return kaart('db-verloop', 'Verloop over meetmomenten', 'Verloop', {
      knop: stukKnop(() => snippetVerloop(mmData), 'verloop over meetmomenten'),
      uitleg: `Gemiddelde score per thema (1 tot 5) per meetmoment. Alle vragenlijsten van hetzelfde meetmoment tellen samen. Het verschil is ${mmData[mmData.length - 1].naam} ten opzichte van ${mmData[0].naam}.`,
    },
    h('div', { class: 'db-mini-raster' }, figuren),
    h('h3', { class: 'db-subkop' }, 'In cijfers'),
    verloopTabel(v.themas, mmData, 'Gemiddelde score per thema per meetmoment', 'Thema'),
    v.meetpunten.length
      ? h('details', { class: 'db-uitklap' },
        h('summary', {}, `Per meetpunt (${v.meetpunten.length})`),
        verloopTabel(v.meetpunten, mmData, 'Gemiddelde score per meetpunt per meetmoment', 'Meetpunt'))
      : null,
    zonder,
    );
  }

  // ---------- 7. Eigen cijfers ----------

  function snippetReeks(r) {
    const regels = [`${r.naam}${r.thema_naam ? ` (thema ${r.thema_naam})` : ''}`];
    for (const p of r.punten) {
      regels.push(`- ${datum(p.datum)}: ${waardeMetEenheid(p.waarde, r.eenheid)}${p.titel && p.titel !== r.naam ? ` – ${p.titel}` : ''}`);
    }
    return regels.join('\n');
  }

  function reeksBlok(r) {
    const punten = [...r.punten].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
    const laatste = punten[punten.length - 1];
    const vorige = punten.length > 1 ? punten[punten.length - 2] : null;
    let grafiek = null;
    if (punten.length > 1) {
      const t0 = isoNaarDag(punten[0].datum);
      const t1 = isoNaarDag(laatste.datum);
      const schaal = netteSchaal(Math.min(...punten.map((p) => p.waarde)), Math.max(...punten.map((p) => p.waarde)));
      const tickTekst = schaal.ticks.map((t) => getalVrij(t));
      const margeLinks = Math.max(24, Math.max(...tickTekst.map((t) => t.length)) * 7 + 12);
      const gp = punten.map((p) => ({
        x: t1 === t0 ? 0.5 : (isoNaarDag(p.datum) - t0) / (t1 - t0),
        y: p.waarde,
        yLabel: waardeMetEenheid(p.waarde, r.eenheid === '%' ? '%' : ''),
        titel: `${datum(p.datum)}: ${waardeMetEenheid(p.waarde, r.eenheid)}${p.titel ? ` – ${p.titel}` : ''}`,
      }));
      grafiek = grafiekHouder((el, w) => tekenLijn(el, w, {
        punten: gp,
        yMin: schaal.min,
        yMax: schaal.max,
        yTicks: schaal.ticks,
        yFmt: getalVrij,
        xLabels: t1 === t0
          ? [{ x: 0.5, tekst: datum(punten[0].datum), anker: 'middle' }]
          : [{ x: 0, tekst: datum(punten[0].datum), anker: 'start' }, { x: 1, tekst: datum(laatste.datum), anker: 'end' }],
        margeLinks,
        xInset: 14,
        labelAlle: punten.length <= 4,
        hoogte: 150,
        beschrijving: `${r.naam}: ${punten.map((p) => `${datum(p.datum)} ${waardeMetEenheid(p.waarde, r.eenheid)}`).join(', ')}`,
      }));
    }
    const tabel = h('div', { class: 'tabel-wrapper' },
      h('table', { class: 'tabel db-reeks-tabel' },
        h('caption', { class: 'sr-only' }, `Waarden van ${r.naam}`),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, 'Datum'),
          h('th', { scope: 'col', class: 'rechts' }, 'Waarde'),
          h('th', { scope: 'col' }, 'Omschrijving'))),
        h('tbody', {}, [...punten].reverse().map((p) => h('tr', {},
          h('td', { class: 'nowrap' }, datum(p.datum)),
          h('td', { class: 'rechts getal nowrap' }, waardeMetEenheid(p.waarde, r.eenheid)),
          h('td', { class: 'db-td-tekst' }, p.titel || '', p.meetmoment_naam ? h('span', { class: 'db-td-sub' }, p.meetmoment_naam) : null)))),
      ),
    );
    return h('article', { class: 'db-reeks' },
      h('div', { class: 'db-reeks-kop' },
        h('div', {},
          h('h3', { class: 'db-reeks-naam' }, r.naam),
          h('div', { class: 'db-reeks-sub' }, [r.thema_naam, r.eenheid ? `eenheid: ${r.eenheid}` : null].filter(Boolean).join(' · '))),
        stukKnop(() => snippetReeks(r), `cijfers van ${r.naam}`, { licht: true })),
      h('div', { class: 'db-reeks-stand' },
        h('span', { class: 'db-reeks-waarde' }, waardeMetEenheid(laatste.waarde, r.eenheid)),
        h('span', { class: 'db-reeks-wanneer' },
          `op ${datum(laatste.datum)}`,
          vorige ? [' · vorige: ', waardeMetEenheid(vorige.waarde, r.eenheid), ' ', verschilEl(laatste.waarde - vorige.waarde, null)] : null,
          !vorige && laatste.titel && laatste.titel !== r.naam ? ` · ${laatste.titel}` : null)),
      grafiek,
      grafiek ? h('details', { class: 'db-uitklap' }, h('summary', {}, `Alle waarden (${punten.length})`), tabel) : null,
    );
  }

  function eigenCijfersKaart() {
    const reeksen = data.eigen_cijfers || [];
    const telling = data.eigen_invoer_telling || {};
    const totaal = Object.values(telling).reduce((a, b) => a + (Number(b) || 0), 0);
    const tellingEl = h('div', { class: 'db-invoer-telling' },
      h('h3', { class: 'db-subkop' }, 'Eigen invoer in dit onderzoek'),
      totaal
        ? h('ul', { class: 'db-telling-lijst' }, Object.keys(invoersoorten).map((s) => h('li', {},
          h('span', { class: 'db-telling-getal' }, nl(telling[s] || 0)), ' ', invoersoorten[s])))
        : h('p', { class: 'zacht klein' }, 'Nog niets ingevoerd.'),
      h('p', { class: 'klein' }, h('a', { href: `${basis}/invoer` }, ctx.alleenLezen ? 'Bekijk alles bij Eigen invoer' : 'Naar Eigen invoer')),
    );
    if (!reeksen.length) {
      return kaart('db-cijfers', 'Eigen cijfers', 'Eigen cijfers', {},
        leeg(ctx.alleenLezen
          ? 'Er zijn in dit onderzoek geen cijfers ingevoerd.'
          : 'Je hebt nog geen cijfers ingevoerd. Voeg bijvoorbeeld verzuim- of verloopcijfers toe bij Eigen invoer (kies de soort "Cijfer"); ze verschijnen dan hier.'),
        tellingEl);
    }
    return kaart('db-cijfers', 'Eigen cijfers', 'Eigen cijfers', {
      uitleg: 'Cijfers die je zelf hebt ingevoerd bij Eigen invoer, zoals verzuim of verloop. Per meetpunt (of titel) een reeks.',
    },
    h('div', { class: 'db-reeksen' }, reeksen.map(reeksBlok)),
    tellingEl,
    );
  }

  // ---------- 8. Open antwoorden ----------

  function openKaart() {
    const s = data.selectie;
    if (!s.open.length) {
      return kaart('db-open', 'Open antwoorden', 'Open antwoorden', {}, h('p', { class: 'zacht' }, 'Deze vragenlijst heeft geen open vragen.'));
    }
    return kaart('db-open', 'Open antwoorden', 'Open antwoorden', {
      uitleg: 'De antwoorden staan in willekeurige volgorde, zodat ze niet aan een persoon te koppelen zijn.',
    },
    s.open.map((o) => {
      const lijst = h('ul', { class: 'db-open-lijst', tabindex: '-1' },
        o.antwoorden.slice(0, OPEN_EERST).map((a) => h('li', {}, a)));
      const meer = o.antwoorden.length > OPEN_EERST
        ? h('button', {
          type: 'button',
          class: 'knop knop-klein',
          onclick: (e) => {
            lijst.append(...o.antwoorden.slice(OPEN_EERST).map((a) => h('li', {}, a)));
            const volgende = lijst.children[OPEN_EERST];
            e.currentTarget.remove();
            if (volgende) {
              volgende.setAttribute('tabindex', '-1');
              volgende.focus();
            }
          },
        }, `Toon alle (${nl(o.antwoorden.length)})`)
        : null;
      return h('div', { class: 'db-open', id: `db-open-${o.vraag_id}` },
        h('h3', { class: 'db-open-vraag', tabindex: '-1' }, o.tekst),
        h('p', { class: 'klein zacht' }, [o.thema_naam, aantal(o.antwoorden.length, 'antwoord', 'antwoorden')].filter(Boolean).join(' · ')),
        o.antwoorden.length ? lijst : h('p', { class: 'zacht' }, 'Nog geen antwoorden op deze vraag.'),
        meer,
      );
    }),
    );
  }

  // ---------- 9. Uitsplitsing ----------

  function snippetUitsplitsing() {
    const s = data.selectie;
    const u = s.uitsplitsing;
    const regels = [
      `Uitsplitsing naar “${u.tekst}” – ${lijstNaam()} (${nTekst(s.n)})`,
      'Gemiddelde score per thema (1 = laagst, 5 = hoogst)',
    ];
    const kop = (t) => {
      regels.push('', t);
    };
    kop(`Iedereen (${nTekst(s.n)})`);
    for (const t of s.themas) regels.push(`- ${t.naam}: ${getal(t.gemiddelde, 1)}`);
    for (const g of u.groepen) {
      const naam = g.samengevoegd && g.samengevoegd.length ? `${g.label}: ${g.samengevoegd.join(', ')}` : g.label;
      if (g.verborgen) {
        kop(`${naam} – niet getoond`);
        if (g.reden) regels.push(g.reden);
        continue;
      }
      kop(`${naam} (${nTekst(g.n)})`);
      for (const t of g.themas) {
        regels.push(`- ${t.naam}: ${t.verborgen ? `niet getoond (minder dan ${u.drempel} respondenten)` : getal(t.gemiddelde, 1)}`);
      }
    }
    regels.push('', `Groepen en scores met minder dan ${u.drempel} respondenten worden niet apart getoond, zodat niemand herkenbaar is.`);
    return regels.join('\n');
  }

  function groepNaamCel(g, reden = null) {
    return h('th', { scope: 'row', class: 'db-groep-naam' },
      g.label,
      g.samengevoegd && g.samengevoegd.length ? h('span', { class: 'db-th-sub' }, g.samengevoegd.join(', ')) : null,
      reden ? h('span', { class: 'db-th-sub db-reden' }, reden) : null,
      !reden && g.toelichting ? h('span', { class: 'db-th-sub' }, g.toelichting) : null);
  }

  /** Cel in de uitsplitsing: getal, of "<5" als het om te weinig respondenten gaat. */
  function groepCel(w, drempel) {
    if (w && w.verborgen) {
      return h('td', { class: 'rechts getal db-cel-verborgen', title: `Minder dan ${drempel} respondenten; niet getoond` },
        h('span', { 'aria-hidden': 'true' }, `<${drempel}`),
        h('span', { class: 'sr-only' }, `minder dan ${drempel} respondenten, niet getoond`));
    }
    return h('td', { class: 'rechts getal' }, w && heeft(w.gemiddelde) ? getal(w.gemiddelde, 1) : '–');
  }

  function vulUitsplitsing(el) {
    const s = data.selectie;
    const u = s && s.uitsplitsing;
    const kies = document.getElementById('db-uitsplitsen');
    if (kies) kies.value = u ? String(u.vraag_id) : '';
    if (!u) {
      vervang(el, h('p', { class: 'zacht' }, 'Kies hierboven een vraag om de gemiddelde scores per groep te zien.'));
      return;
    }
    const themas = s.themas;
    const zichtbaar = u.groepen.filter((g) => !g.verborgen);
    const kop = h('div', { class: 'db-uitsplits-kop' },
      h('h3', { class: 'db-subkop' }, `Gemiddelde score per thema, per antwoord op “${u.tekst}”`),
      themas.length ? stukKnop(snippetUitsplitsing, 'uitsplitsing') : null);

    if (!themas.length) {
      vervang(el, kop, h('p', { class: 'zacht' }, 'Deze vragenlijst heeft geen schaalvragen, dus er zijn geen scores om per groep te vergelijken.'));
      return;
    }

    const themaKop = themas.map((t) => h('th', { scope: 'col', class: 'rechts' }, t.naam));
    const rijIedereen = h('tr', { class: 'db-rij-totaal' },
      h('th', { scope: 'row', class: 'db-groep-naam' }, 'Iedereen'),
      h('td', { class: 'rechts getal' }, nl(s.n)),
      themas.map((t) => h('td', { class: 'rechts getal' }, getal(t.gemiddelde, 1))));
    const rijen = u.groepen.map((g) => {
      if (g.verborgen) {
        // De reden staat bij de groepsnaam (blijft zichtbaar bij schuiven op een telefoon); nooit getallen.
        return h('tr', { class: 'db-rij-verborgen' },
          groepNaamCel(g, g.reden || `Minder dan ${u.drempel} respondenten per groep; niet getoond om anonimiteit te beschermen.`),
          h('td', { colspan: themas.length + 1, class: 'db-reden' }, 'Niet getoond'));
      }
      const perThema = new Map(g.themas.map((t) => [t.thema_id, t]));
      return h('tr', {},
        groepNaamCel(g),
        h('td', { class: 'rechts getal' }, nl(g.n)),
        themas.map((t) => groepCel(perThema.get(t.thema_id), u.drempel)));
    });

    // Per vraag (alleen zichtbare groepen)
    const schaalVragen = s.vragen.filter((q) => q.type === 'schaal');
    const perVraag = zichtbaar.length && schaalVragen.length
      ? h('details', { class: 'db-uitklap' },
        h('summary', {}, `Bekijk per vraag (${schaalVragen.length})`),
        h('div', { class: 'tabel-wrapper' },
          h('table', { class: 'tabel db-uitsplits-tabel' },
            h('caption', { class: 'sr-only' }, 'Gemiddelde score per vraag per groep'),
            h('thead', {}, h('tr', {},
              h('th', { scope: 'col' }, 'Vraag'),
              h('th', { scope: 'col', class: 'rechts' }, 'Iedereen'),
              zichtbaar.map((g) => h('th', { scope: 'col', class: 'rechts' }, g.label)))),
            h('tbody', {}, schaalVragen.map((q) => h('tr', {},
              h('th', { scope: 'row', class: 'db-vraag-cel' }, q.tekst),
              h('td', { class: 'rechts getal' }, getal(q.gemiddelde, 1)),
              zichtbaar.map((g) => groepCel((g.vragen || []).find((x) => x.vraag_id === q.id), u.drempel))))),
          )))
      : null;

    vervang(el,
      kop,
      h('div', { class: 'tabel-wrapper' },
        h('table', { class: 'tabel db-uitsplits-tabel' },
          h('caption', { class: 'sr-only' }, `Gemiddelde score per thema per groep, uitgesplitst naar ${u.tekst}`),
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, 'Groep'),
            h('th', { scope: 'col', class: 'rechts' }, 'n'),
            themaKop)),
          h('tbody', {}, rijIedereen, rijen),
        )),
      !zichtbaar.length
        ? melding((u.groepen.find((g) => g.verborgen) || {}).reden || `Geen enkele groep heeft ${u.drempel} of meer respondenten, dus er zijn geen resultaten per groep te tonen.`)
        : null,
      zichtbaar.length && u.uitleg_cel ? h('p', { class: 'klein zacht' }, u.uitleg_cel) : null,
      perVraag,
    );
  }

  function uitsplitsKaart() {
    const s = data.selectie;
    const drempel = data.drempel;
    const regel = h('p', { class: 'db-uitleg' },
      `Om anonimiteit te beschermen tonen we alleen groepen met minimaal ${drempel} respondenten. `,
      'Kleinere groepen voegen we samen tot "Overige groepen samen". Is die samengevoegde groep nog te klein, ',
      'dan gaat ook de kleinste andere groep erin op; anders zou je de kleine groep kunnen terugrekenen uit het totaal. ',
      `Ook een score binnen een groep tonen we alleen als minstens ${drempel} respondenten uit die groep de vragen beantwoordden. `,
      'Leg uitkomsten van verschillende uitsplitsingen niet naast elkaar om kleinere groepen af te leiden.');

    if (s.klein) {
      return kaart('db-uitsplitsing', 'Uitsplitsing', 'Uitsplitsing', {},
        h('p', {}, `Met een uitsplitsing zie je de scores per groep, bijvoorbeeld per afdeling. Dat kan pas als er minstens ${drempel} respondenten per groep zijn; met ${aantal(s.n, 'respondent', 'respondenten')} in totaal is dat nog niet mogelijk.`),
        h('p', { class: 'zacht' }, 'Zo beschermen we de anonimiteit: bij kleinere groepen zijn antwoorden terug te leiden naar personen.'));
    }

    if (!s.uitsplitsvragen.length) {
      return kaart('db-uitsplitsing', 'Uitsplitsing', 'Uitsplitsing', {},
        h('p', {}, 'Met een uitsplitsing zie je de scores per groep, bijvoorbeeld per afdeling. In deze vragenlijst is nog geen vraag gemarkeerd om op uit te splitsen.'),
        ctx.alleenLezen
          ? null
          : h('p', { class: 'zacht' },
            'Open de vragenlijst en zet bij een meerkeuzevraag met één antwoord (of een ja/nee-vraag), zoals "Op welke afdeling werk je?", de optie voor uitsplitsing aan. ',
            h('a', { href: `${basis}/vragenlijsten/${s.vragenlijst_id}` }, 'Vragenlijst openen')),
        regel);
    }

    uitsplitsInhoud = h('div', { class: 'db-uitsplits-inhoud' });
    const kies = h('select', {
      id: 'db-uitsplitsen',
      onchange: async (e) => {
        keuze.uitsplitsen = Number(e.target.value) || null;
        bewaarKeuze(onderzoekId, keuze);
        if (!keuze.uitsplitsen) {
          data.selectie.uitsplitsing = null;
          vulUitsplitsing(uitsplitsInhoud);
          return;
        }
        await laad({ alleenUitsplitsing: true });
      },
    },
    h('option', { value: '' }, 'Kies een vraag…'),
    s.uitsplitsvragen.map((q) => h('option', { value: q.id, selected: s.uitsplitsing && s.uitsplitsing.vraag_id === q.id }, q.tekst)));
    vulUitsplitsing(uitsplitsInhoud);
    return kaart('db-uitsplitsing', 'Uitsplitsing', 'Uitsplitsing', {
      uitleg: 'Vergelijk de scores per groep, bijvoorbeeld per afdeling.',
    },
    h('div', { class: 'veld db-uitsplits-keuze' }, h('label', { for: 'db-uitsplitsen' }, 'Uitsplitsen naar'), kies),
    regel,
    uitsplitsInhoud,
    );
  }

  await laad();
}
