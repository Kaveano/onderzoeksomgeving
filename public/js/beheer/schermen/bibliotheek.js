// Scherm: Bibliotheek – bronnen om je onderzoek op te baseren (voor alle onderzoeken samen; BOUWPLAN §1.1, D3 §2.10).
// Zoeken (bibliotheek-zoeken.js) gebeurt helemaal in de browser. De startcollectie is alleen-lezen; je eigen
// bronnen voeg je toe, plak je als verwijzing of lees je in uit een RIS-bestand (Zotero, Mendeley, EndNote).

import { api } from '../api.js';
import { h, vervang, laden, leeg, melding, meld, meldFout, bevestig, maakDialoog, uniekeId, aantal, vertraag } from '../ui.js';
import { nlDatum } from '../opmaak.js';
import {
  BRONSOORTEN, ONDERWERPEN, TALEN, BETROUWBAARHEID, dubbelZoeker, reeksDelen, auteursRegel,
} from '../bibliotheek-regels.js';
import { zoek, markeringen, SORTERING_LABELS } from '../bibliotheek-zoeken.js';
import { leesRis, leesTekstBestand, taalGeradenTekst } from '../bibliotheek-bestanden.js';
import { haalBibliotheek, bibliotheekGewijzigd } from '../bibliotheek-data.js';
import { markeer, bronMeta, openKnop, citeerDialoog, koppelDialoog, exporteer } from '../bibliotheek-ui.js';

const PER_KEER = 30;
const KORT = 300;
let meldingWeg = false; // de uitleg over de startcollectie is weggeklikt (alleen in dit tabblad)
// Zoekvraag, filters en sortering blijven staan als je terugkomt (in het geheugen van dit tabblad).
const stand = { tekst: '', sortering: 'relevantie', filters: {} };

export async function toon(container, ctx) {
  ctx.zetTitel('Bibliotheek');
  const titelBalk = h('div', { class: 'paginakop' },
    h('div', {},
      h('h1', {}, 'Bibliotheek'),
      h('p', { class: 'ondertitel' }, 'Bronnen om je onderzoek op te baseren: een startcollectie met openbaar HR-onderzoek en je eigen bronnen.')),
    h('div', { class: 'knoppen bb-kopknoppen' },
      h('a', { class: 'knop knop-primair', href: '#/bibliotheek/nieuw' }, '+ Bron toevoegen'),
      h('button', { type: 'button', class: 'knop', onclick: () => importeer() }, 'Importeren'),
      h('button', { type: 'button', class: 'knop', onclick: () => exportDialoog() }, 'Exporteren')));
  const inhoud = h('div', {}, laden('De bibliotheek wordt geladen…'));
  vervang(container, titelBalk, inhoud);

  let bib;
  try {
    bib = await haalBibliotheek();
  } catch (e) {
    vervang(inhoud, melding(e.message, 'gevaar'));
    return;
  }

  let getoond = PER_KEER;
  let laatste = null; // laatste zoekuitslag

  // ---------- Vaste onderdelen ----------

  const zoekId = uniekeId('bb-zoek');
  const zoekVeld = h('input', {
    id: zoekId, type: 'search', value: stand.tekst, autocomplete: 'off',
    placeholder: 'Bijvoorbeeld: verzuim jongeren, werkdruk zorg, onboarding',
  });
  const sorteerId = uniekeId('bb-sorteer');
  const sorteer = h('select', { id: sorteerId }, Object.entries(SORTERING_LABELS).map(([k, l]) => h('option', { value: k, selected: k === stand.sortering }, l)));
  const teller = h('p', { class: 'bb-teller', role: 'status' });
  const modusEl = h('div', {});
  const lijstEl = h('ol', { class: 'bb-lijst' });
  const meerEl = h('div', { class: 'knoppen bb-meer' });
  const filterEl = h('div', { class: 'bb-filters-inhoud' });
  const filterKop = h('summary', {}, 'Filters');
  const filters = h('details', { class: 'kaart bb-filters', open: window.matchMedia('(min-width: 900px)').matches || null }, filterKop, filterEl);

  // ---------- Uitleg en terugzetten ----------

  function uitlegEl() {
    const s = bib.start;
    const delen = [];
    if (!s.aantal) {
      delen.push(melding('De startcollectie wordt nog toegevoegd. Je kunt nu al eigen bronnen toevoegen.'));
    } else if (!meldingWeg) {
      const weg = h('button', { type: 'button', class: 'knop knop-licht knop-klein bb-melding-weg', 'aria-label': 'Uitleg sluiten' }, 'Sluiten');
      const m = melding(h('div', { class: 'bb-melding' },
        h('p', {}, `De startcollectie bevat ${aantal(s.aantal, 'openbare bron', 'openbare bronnen')} over HR-onderzoek${s.datum ? `, gecontroleerd op ${nlDatum(s.datum)}` : ''}. Controleer bij gebruik altijd de originele bron. Bronnen uit de startcollectie kun je niet aanpassen; wel kun je er een eigen kopie van maken.`),
        weg));
      weg.addEventListener('click', () => {
        meldingWeg = true;
        m.remove();
      });
      delen.push(m);
    }
    if (s.verborgen > 0) {
      delen.push(h('p', {}, h('button', {
        type: 'button',
        class: 'knop knop-licht knop-klein',
        onclick: async () => {
          if (!(await bevestig({
            titel: 'Startcollectie terugzetten?',
            tekst: `De ${aantal(s.verborgen, 'verborgen bron', 'verborgen bronnen')} uit de startcollectie ${s.verborgen === 1 ? 'komt' : 'komen'} weer in de lijst. Je eigen bronnen en notities blijven zoals ze zijn.`,
            knop: 'Terugzetten',
          }))) return;
          try {
            await api.post('/bibliotheek/herstellen', {});
            bibliotheekGewijzigd();
            meld('De startcollectie is teruggezet.', 'succes');
            ctx.navigeer('#/bibliotheek');
          } catch (e) {
            meldFout(e);
          }
        },
      }, `Startcollectie terugzetten (${s.verborgen} verborgen)`)));
    }
    return delen;
  }

  // ---------- Filters ----------

  const f = stand.filters;
  function filterAantal() {
    return [f.onderwerpen?.length, f.soort, f.taal, f.collectie && f.collectie !== 'alle', f.betrouwbaarheid, Number.isInteger(f.jaarVan) || Number.isInteger(f.jaarTot), f.metNotities, f.metVerborgen]
      .filter(Boolean).length;
  }

  function tekenFilters(facetten) {
    const n = (tel, k) => tel[k] || 0;
    const groep = (titel, ...kinderen) => h('fieldset', { class: 'bb-filtergroep' }, h('legend', {}, titel), kinderen);
    const onderwerpen = groep('Onderwerp', Object.entries(ONDERWERPEN)
      .filter(([k]) => n(facetten.onderwerp, k) > 0 || f.onderwerpen?.includes(k))
      .map(([k, o]) => {
        const vak = h('input', { type: 'checkbox', checked: !!f.onderwerpen?.includes(k) });
        vak.addEventListener('change', () => {
          const set = new Set(f.onderwerpen || []);
          if (vak.checked) set.add(k);
          else set.delete(k);
          f.onderwerpen = [...set];
          ververs();
        });
        return h('label', { class: 'keuze bb-filterkeuze' }, vak, h('span', {}, o.naam, ' ', h('span', { class: 'zacht' }, `(${n(facetten.onderwerp, k)})`)));
      }));
    const keuzeSelect = (titel, sleutel, opties, facet) => {
      const id = uniekeId('bb-f');
      const sel = h('select', { id },
        h('option', { value: '' }, 'Alle'),
        Object.entries(opties).map(([k, l]) => h('option', { value: k, selected: f[sleutel] === k }, `${typeof l === 'string' ? l : l.naam} (${n(facet, k)})`)));
      sel.addEventListener('change', () => {
        f[sleutel] = sel.value || null;
        ververs();
      });
      return h('div', { class: 'veld' }, h('label', { for: id }, titel), sel);
    };
    const jaarVeld = (label, sleutel) => {
      const id = uniekeId('bb-jaar');
      const el = h('input', { id, type: 'number', inputmode: 'numeric', min: 1800, max: 2200, value: Number.isInteger(f[sleutel]) ? f[sleutel] : '' });
      el.addEventListener('change', () => {
        const w = Number(el.value);
        f[sleutel] = el.value && Number.isInteger(w) ? w : null;
        ververs();
      });
      return h('div', { class: 'bb-jaarveld' }, h('label', { for: id }, label), el);
    };
    const collectieNaam = uniekeId('bb-col');
    const collectie = groep('Collectie', [['alle', 'Alles'], ['start', 'Startcollectie'], ['eigen', 'Mijn eigen bronnen']].map(([k, l]) => {
      const r = h('input', { type: 'radio', name: collectieNaam, value: k, checked: (f.collectie || 'alle') === k });
      r.addEventListener('change', () => {
        f.collectie = k;
        ververs();
      });
      const tel = k === 'alle' ? n(facetten.collectie, 'start') + n(facetten.collectie, 'eigen') : n(facetten.collectie, k);
      return h('label', { class: 'keuze bb-filterkeuze' }, r, h('span', {}, l, ' ', h('span', { class: 'zacht' }, `(${tel})`)));
    }));
    const betrId = uniekeId('bb-betr');
    const betr = h('select', { id: betrId },
      h('option', { value: '' }, 'Alle'),
      ['hoog', 'redelijk', 'beperkt'].map((k) => h('option', { value: k, selected: f.betrouwbaarheid === k }, BETROUWBAARHEID[k].naam)));
    betr.addEventListener('change', () => {
      f.betrouwbaarheid = betr.value || null;
      ververs();
    });
    const vinkje = (label, sleutel) => {
      const v = h('input', { type: 'checkbox', checked: !!f[sleutel] });
      v.addEventListener('change', () => {
        f[sleutel] = v.checked;
        ververs();
      });
      return h('label', { class: 'keuze bb-filterkeuze' }, v, h('span', {}, label));
    };
    const aan = filterAantal();
    filterKop.textContent = aan ? `Filters (${aan} aan)` : 'Filters';
    vervang(filterEl,
      onderwerpen,
      keuzeSelect('Soort bron', 'soort', BRONSOORTEN, facetten.soort),
      groep('Jaar', h('div', { class: 'bb-jaren' }, jaarVeld('van', 'jaarVan'), jaarVeld('tot', 'jaarTot'))),
      keuzeSelect('Taal', 'taal', TALEN, facetten.taal),
      collectie,
      h('div', { class: 'veld' }, h('label', { for: betrId }, 'Betrouwbaarheid minstens'), betr),
      vinkje('Alleen bronnen met eigen notities', 'metNotities'),
      facetten.verborgen > 0 || f.metVerborgen ? vinkje(`Ook verborgen bronnen tonen (${facetten.verborgen})`, 'metVerborgen') : null,
      h('button', {
        type: 'button',
        class: 'knop knop-klein',
        disabled: !aan,
        onclick: () => {
          for (const k of Object.keys(f)) delete f[k];
          ververs();
        },
      }, 'Filters wissen'));
  }

  // ---------- Resultaten ----------

  function kaart(bron, vraag) {
    const m = markeringen(bron, vraag);
    const samenvatting = String(bron.samenvatting || '');
    const kortStuk = samenvatting.length > KORT + 40 ? `${samenvatting.slice(0, KORT).replace(/\s+\S*$/, '')}…` : null;
    const markKort = (m.samenvatting || []).filter(([van, tot]) => tot <= (kortStuk ? kortStuk.length - 1 : Infinity));
    const gebruikt = (bron.onderzoeken || []).length;
    const labels = [
      h('span', { class: `label ${bron.collectie === 'start' ? 'label-primair' : ''}` }, bron.collectie === 'start' ? 'Startcollectie' : 'Eigen bron'),
      bron.verborgen ? h('span', { class: 'label label-waarschuwing' }, 'verborgen') : null,
      bron.kopie_van ? h('span', { class: 'label' }, 'eigen kopie') : null,
    ];
    const auteurs = auteursRegel(bron);
    const ber = BETROUWBAARHEID[bron.betrouwbaarheid] || BETROUWBAARHEID.onbekend;
    return h('li', { class: 'kaart bb-bron' },
      h('p', { class: 'bb-meta klein zacht' }, bronMeta(bron), ' ', labels),
      h('h3', { class: 'bb-titel' }, h('a', { href: `#/bibliotheek/${bron.id}` }, markeer(bron.titel, m.titel))),
      auteurs ? h('p', { class: 'bb-auteurs' }, markeer(auteurs, m.auteurs)) : null,
      samenvatting
        ? (kortStuk
          ? h('div', { class: 'bb-samenvatting' }, h('p', {}, markeer(kortStuk, markKort)),
            h('details', {}, h('summary', {}, 'Hele samenvatting'), h('p', {}, markeer(samenvatting, m.samenvatting))))
          : h('p', { class: 'bb-samenvatting' }, markeer(samenvatting, m.samenvatting)))
        : null,
      (bron.kernpunten || []).length
        ? h('details', { class: 'bb-kernpunten' }, h('summary', {}, `Kernpunten (${bron.kernpunten.length})`),
          h('ul', {}, bron.kernpunten.map((k, i) => h('li', {}, markeer(k, m.kernpunten[i] || [])))))
        : null,
      h('div', { class: 'bb-chips' },
        (bron.onderwerpen || []).map((o) => h('span', { class: 'bb-chip' }, ONDERWERPEN[o]?.naam || o)),
        h('span', { class: 'bb-chip bb-chip-betr', title: ber.uitleg || null }, `Betrouwbaarheid: ${ber.naam.toLowerCase()}`),
        gebruikt ? h('span', { class: 'bb-chip bb-chip-gebruikt' }, `Gebruikt in ${aantal(gebruikt, 'onderzoek', 'onderzoeken')}`) : null),
      h('div', { class: 'knoppen bb-acties' },
        h('button', { type: 'button', class: 'knop knop-klein', onclick: () => citeerDialoog(bron) }, 'Citeer'),
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          onclick: async () => {
            if (await koppelDialoog(bron)) {
              bib = await haalBibliotheek();
              ververs({ behoud: true });
            }
          },
        }, 'Koppel aan onderzoek'),
        h('a', { class: 'knop knop-klein', href: `#/bibliotheek/${bron.id}` }, bron.collectie === 'start' ? 'Bekijken' : 'Bewerken'),
        openKnop(bron)));
  }

  function toonResultaten() {
    const r = laatste;
    const tekst = zoekVeld.value;
    vervang(modusEl, r.modus === 'deel' ? melding('Geen bronnen met al deze woorden. Dit zijn bronnen met een deel van de woorden.', 'waarschuwing') : null);
    teller.textContent = r.totaal === 0
      ? 'Geen bronnen gevonden. Probeer een ander woord of zet een filter uit.'
      : r.totaal === 1 ? '1 bron gevonden' : `${r.totaal.toLocaleString('nl-NL')} bronnen gevonden`;
    vervang(lijstEl, r.treffers.slice(0, getoond).map((t) => kaart(t.bron, tekst)));
    vervang(meerEl, r.totaal > getoond
      ? h('button', {
        type: 'button',
        class: 'knop',
        onclick: () => {
          const eerst = getoond;
          getoond += PER_KEER;
          toonResultaten();
          lijstEl.children[eerst]?.querySelector('a')?.focus();
        },
      }, `Meer tonen (${(r.totaal - getoond).toLocaleString('nl-NL')})`)
      : null);
  }

  function ververs({ behoud = false } = {}) {
    stand.tekst = zoekVeld.value;
    stand.sortering = sorteer.value;
    if (!behoud) getoond = PER_KEER;
    laatste = zoek(bib.bronnen, { tekst: stand.tekst, filters: f, sortering: stand.sortering });
    tekenFilters(laatste.facetten);
    toonResultaten();
  }

  zoekVeld.addEventListener('input', vertraag(() => ververs(), 150));
  sorteer.addEventListener('change', () => ververs());

  if (!bib.bronnen.length) {
    vervang(inhoud, uitlegEl(), leeg('Er staan nog geen bronnen in de bibliotheek. Voeg een bron toe, plak een verwijzing of lees een RIS-bestand in.',
      h('a', { class: 'knop knop-primair', href: '#/bibliotheek/nieuw' }, '+ Bron toevoegen')));
    return;
  }

  vervang(inhoud,
    uitlegEl(),
    h('div', { class: 'bb-zoekrij' },
      h('div', { class: 'veld bb-zoekveld' }, h('label', { for: zoekId }, 'Zoeken in de bibliotheek'), zoekVeld),
      h('div', { class: 'veld bb-sorteer' }, h('label', { for: sorteerId }, 'Sorteren op'), sorteer)),
    h('div', { class: 'bb-indeling' },
      filters,
      h('section', { class: 'bb-resultaten', 'aria-label': 'Gevonden bronnen' }, teller, modusEl, lijstEl, meerEl)));
  ververs();

  // ---------- Exporteren ----------

  async function exportDialoog() {
    if (!bib) return;
    const naam = uniekeId('bb-wat');
    const gevonden = laatste ? laatste.treffers.map((t) => t.bron) : bib.bronnen;
    const kiesGevonden = h('input', { type: 'radio', name: naam, value: 'gevonden', checked: true });
    const kiesAlles = h('input', { type: 'radio', name: naam, value: 'alles' });
    const notities = h('input', { type: 'checkbox' });
    const sluit = h('button', { type: 'button', class: 'knop' }, 'Sluiten');
    let onderzoekNamen = {};
    try {
      onderzoekNamen = Object.fromEntries((await api.get('/onderzoeken')).onderzoeken.map((o) => [o.id, o.titel]));
    } catch { /* zonder namen */ }
    const welke = () => (kiesAlles.checked ? bib.bronnen.filter((b) => !b.verborgen) : gevonden);
    const knop = (tekst, soort) => h('button', {
      type: 'button',
      class: 'knop',
      onclick: () => {
        const bronnen = welke();
        if (!bronnen.length) {
          meld('Er zijn geen bronnen om te exporteren.', 'waarschuwing');
          return;
        }
        exporteer(bronnen, soort, { metNotities: notities.checked, onderzoeken: onderzoekNamen });
      },
    }, tekst);
    const d = maakDialoog('Exporteren', [
      h('fieldset', { class: 'veld' }, h('legend', {}, 'Wat exporteer je?'),
        h('label', { class: 'keuze' }, kiesGevonden, h('span', {}, `De ${aantal(gevonden.length, 'gevonden bron', 'gevonden bronnen')}`)),
        h('label', { class: 'keuze' }, kiesAlles, h('span', {}, `De hele bibliotheek (${aantal(bib.bronnen.filter((b) => !b.verborgen).length, 'bron', 'bronnen')})`))),
      h('div', { class: 'veld' }, h('label', { class: 'keuze' }, notities, h('span', {}, 'Eigen notities meenemen (alleen RIS en Excel)')),
        h('div', { class: 'veld-hulp' }, 'Je eigen notities komen nooit in een rapport of een deellink. Zet dit alleen aan voor een bestand dat je zelf houdt.')),
      h('div', { class: 'knoppen bb-exportknoppen' },
        knop('Literatuurlijst (Word)', 'word'), knop('Excel', 'excel'), knop('RIS (voor Zotero, Mendeley of EndNote)', 'ris')),
    ], [sluit]);
    sluit.addEventListener('click', () => d.close());
    d.showModal();
    sluit.focus();
  }

  // ---------- Importeren (RIS) ----------

  function importeer() {
    const bestandId = uniekeId('bb-bestand');
    const kies = h('input', { type: 'file', id: bestandId, accept: '.ris,.txt,application/x-research-info-systems,text/plain' });
    const uitkomst = h('div', { role: 'status' });
    const voeg = h('button', { type: 'button', class: 'knop knop-primair', disabled: true }, 'Toevoegen');
    const sluit = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
    let nieuw = [];
    const d = maakDialoog('Bronnen importeren', [
      h('p', {}, 'Kies een RIS-bestand (.ris), bijvoorbeeld uit Zotero, Mendeley of EndNote. Bronnen die al in je bibliotheek staan (zelfde DOI, of zelfde titel en jaar), worden overgeslagen.'),
      h('div', { class: 'veld' }, h('label', { for: bestandId }, 'Bestand'), kies),
      uitkomst,
    ], [sluit, voeg]);
    let bezig = false;
    sluit.addEventListener('click', () => {
      if (!bezig) d.close();
    });
    d.addEventListener('cancel', (e) => {
      if (bezig) e.preventDefault();
    });
    kies.addEventListener('change', async () => {
      const bestand = kies.files && kies.files[0];
      if (!bestand) return;
      vervang(uitkomst, h('p', { class: 'zacht' }, 'Het bestand wordt gelezen…'));
      voeg.disabled = true;
      try {
        if (bestand.size > 20_000_000) throw new Error('Dit bestand is te groot (meer dan 20 MB).');
        const { bronnen, meldingen, taalGeraden } = leesRis(leesTekstBestand(new Uint8Array(await bestand.arrayBuffer())));
        const alBekend = [];
        nieuw = [];
        const zoeker = dubbelZoeker(bib.bronnen);
        for (const b of bronnen) {
          if (zoeker.vind(b)) {
            alBekend.push(b);
          } else {
            nieuw.push(b);
            zoeker.voegToe(b);
          }
        }
        const ruimte = 1000 - bib.bronnen.length;
        vervang(uitkomst,
          h('p', {}, `${aantal(bronnen.length, 'bron', 'bronnen')} gevonden.${alBekend.length ? ` ${alBekend.length} ${alBekend.length === 1 ? 'staat' : 'staan'} al in je bibliotheek en ${alBekend.length === 1 ? 'wordt' : 'worden'} overgeslagen.` : ''}`),
          nieuw.length > ruimte ? melding(`Er passen nog ${ruimte} bronnen in de bibliotheek (maximaal 1.000).`, 'waarschuwing') : null,
          taalGeraden ? melding(taalGeradenTekst(taalGeraden, bronnen.length)) : null,
          meldingen.length ? melding(h('ul', { class: 'bb-meldingen' }, meldingen.slice(0, 10).map((m) => h('li', {}, m)), meldingen.length > 10 ? h('li', {}, `… en nog ${meldingen.length - 10}.`) : null), 'waarschuwing') : null);
        voeg.disabled = !nieuw.length || nieuw.length > ruimte;
        voeg.textContent = nieuw.length ? `${aantal(nieuw.length, 'bron', 'bronnen')} toevoegen` : 'Niets om toe te voegen';
      } catch (e) {
        vervang(uitkomst, melding(e.message || 'Dit bestand kan niet worden gelezen.', 'gevaar'));
      }
    });
    voeg.addEventListener('click', async () => {
      bezig = true;
      voeg.disabled = true;
      kies.disabled = true;
      const voortgang = h('p', { role: 'status' });
      uitkomst.append(voortgang);
      let toegevoegd = 0;
      const overgeslagen = [];
      try {
        // Kleine delen (hooguit 25 bronnen): zo blijft elk verzoek binnen de rekentijd van de server.
        for (const deel of reeksDelen(nieuw)) {
          voortgang.textContent = `Bezig: ${deel.vanaf + deel.bronnen.length} van ${nieuw.length}…`;
          const r = await api.post('/bibliotheek/reeks', { bronnen: deel.bronnen, dubbel: 'overslaan' });
          toegevoegd += r.toegevoegd.length;
          overgeslagen.push(...r.overgeslagen.map((o) => `Bron ${deel.vanaf + o.rij}: ${o.reden}`));
        }
        bibliotheekGewijzigd();
        bezig = false;
        d.close();
        meld(`${aantal(toegevoegd, 'bron', 'bronnen')} toegevoegd.${overgeslagen.length ? ` ${overgeslagen.length} overgeslagen.` : ''}`, overgeslagen.length ? 'waarschuwing' : 'succes');
        ctx.navigeer('#/bibliotheek');
      } catch (e) {
        bezig = false;
        bibliotheekGewijzigd();
        vervang(voortgang, `Gestopt na ${toegevoegd} bronnen: ${e.message}`);
        meldFout(e);
      }
    });
    d.showModal();
    kies.focus();
  }
}
