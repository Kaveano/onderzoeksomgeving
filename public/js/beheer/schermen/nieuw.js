// Scherm: Nieuw onderzoek – basisgegevens invullen en eventueel startsjablonen kiezen.

import { api } from '../api.js';
import { h, vervang, laden, melding, meld } from '../ui.js';
import { samenvattingTekst, inhoudSchakelaar, neemVoorkeuze } from './sjablonen.js';

const MAX_SJABLONEN = 10; // de server neemt er maximaal 10 mee

// Welk veld hoort bij een foutmelding van de server ("Titel is verplicht." e.d.)?
const VELD_BIJ_MELDING = [
  ['Bedrijfsnaam', 'bedrijfsnaam'],
  ['Titel', 'titel'],
  ['Onderzoeksvraag', 'onderzoeksvraag'],
  ['Toelichting', 'toelichting'],
];

export async function toon(container, ctx) {
  ctx.zetTitel('Nieuw onderzoek');
  const voorkeuze = neemVoorkeuze();
  let bezig = false;

  // ---------- Velden ----------

  const velden = {};
  function veld(naam, label, invoer, { verplicht = false, hulp = null } = {}) {
    const id = `nieuw-${naam}`;
    const hulpId = hulp ? `${id}-hulp` : null;
    const foutId = `${id}-fout`;
    invoer.id = id;
    invoer.name = naam;
    invoer.setAttribute('aria-describedby', [hulpId, foutId].filter(Boolean).join(' '));
    if (verplicht) invoer.setAttribute('aria-required', 'true');
    const fout = h('div', { class: 'veld-fout', id: foutId });
    invoer.addEventListener('input', () => {
      if (invoer.getAttribute('aria-invalid')) {
        invoer.removeAttribute('aria-invalid');
        fout.textContent = '';
      }
    });
    velden[naam] = { invoer, fout };
    return h('div', { class: 'veld' },
      h('label', { for: id }, label, verplicht ? h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *') : null),
      invoer,
      hulp ? h('div', { class: 'veld-hulp', id: hulpId }, hulp) : null,
      fout,
    );
  }

  function zetFout(naam, tekst) {
    const v = velden[naam];
    v.invoer.setAttribute('aria-invalid', 'true');
    v.fout.textContent = tekst;
    return v.invoer;
  }

  function wisFouten() {
    for (const v of Object.values(velden)) {
      v.invoer.removeAttribute('aria-invalid');
      v.fout.textContent = '';
    }
    vervang(algemeneFout);
  }

  const algemeneFout = h('div', { class: 'nieuw-algemene-fout' });

  const gegevens = h('section', { class: 'kaart', 'aria-labelledby': 'nieuw-gegevens-kop' },
    h('h2', { id: 'nieuw-gegevens-kop' }, 'Gegevens'),
    h('p', { class: 'klein zacht' }, 'Velden met een ', h('span', { class: 'verplicht-teken' }, '*'), ' zijn verplicht. Je kunt alles later nog aanpassen.'),
    h('div', { class: 'nieuw-rij' },
      veld('bedrijfsnaam', 'Bedrijfsnaam',
        h('input', { type: 'text', maxlength: 150, autocomplete: 'off', placeholder: 'Bijv. Voorbeeld BV' }),
        { verplicht: true, hulp: 'De organisatie waar je het onderzoek doet. In de teksten van een sjabloon komt deze naam op de plek van [bedrijfsnaam].' }),
      veld('titel', 'Titel van het onderzoek',
        h('input', { type: 'text', maxlength: 200, autocomplete: 'off', placeholder: 'Bijv. Medewerkersonderzoek 2026' }),
        { verplicht: true }),
    ),
    veld('onderzoeksvraag', 'Onderzoeksvraag',
      h('textarea', { rows: 3, maxlength: 2000, placeholder: 'Bijv. Hoe ervaren medewerkers hun werkdruk, en wat kan er beter?' }),
      { hulp: 'Wat wil de opdrachtgever weten? Respondenten zien dit niet.' }),
    veld('toelichting', 'Toelichting (optioneel)',
      h('textarea', { rows: 3, maxlength: 5000 }),
      { hulp: 'Bijvoorbeeld de aanleiding, afspraken met de opdrachtgever of de planning. Respondenten zien dit niet.' }),
  );

  // ---------- Startsjablonen ----------

  const sjabloonLijst = h('div', {}, laden('Sjablonen worden geladen…'));
  const keuzeSamenvatting = h('p', { class: 'nieuw-keuze', 'aria-live': 'polite' });
  let vakjes = [];
  let namen = new Map();

  function werkKeuzeBij() {
    const gekozen = vakjes.filter((v) => v.checked);
    for (const v of vakjes) v.closest('.nieuw-sjabloon').classList.toggle('is-gekozen', v.checked);
    if (!gekozen.length) {
      vervang(keuzeSamenvatting, 'Geen sjabloon gekozen: je begint met een leeg onderzoek.');
    } else {
      const lijst = gekozen.map((v) => namen.get(v.value));
      const tekst = lijst.length === 1 ? lijst[0] : `${lijst.slice(0, -1).join(', ')} en ${lijst[lijst.length - 1]}`;
      vervang(keuzeSamenvatting, `Gekozen: ${tekst}.`,
        gekozen.length > 1 ? ' De sjablonen worden samengevoegd tot één opzet.' : '');
    }
  }

  function tekenSjablonen(sjablonen) {
    // Standaardsjablonen eerst, daarna eigen sjablonen.
    const gesorteerd = [...sjablonen.filter((s) => s.standaard), ...sjablonen.filter((s) => !s.standaard)];
    namen = new Map(gesorteerd.map((s) => [s.id, s.naam]));
    vakjes = [];
    if (!gesorteerd.length) {
      vervang(sjabloonLijst, h('p', { class: 'zacht' }, 'Er zijn nog geen sjablonen beschikbaar. Je begint met een leeg onderzoek.'));
      werkKeuzeBij();
      return;
    }
    const items = gesorteerd.map((s, i) => {
      const id = `nieuw-sj-${i}`;
      const vakje = h('input', {
        type: 'checkbox',
        id,
        value: s.id,
        checked: s.id === voorkeuze,
        'aria-labelledby': `${id}-naam`,
        'aria-describedby': `${id}-oms ${id}-tal`,
        onchange: werkKeuzeBij,
      });
      vakjes.push(vakje);
      const { knop, paneel } = inhoudSchakelaar(s, { instellingen: ctx.instellingen, niveau: 3 });
      return h('li', { class: 'nieuw-sjabloon' },
        h('label', { class: 'keuze nieuw-sjabloon-keuze', for: id },
          vakje,
          h('span', { class: 'nieuw-sjabloon-tekst' },
            h('span', { class: 'nieuw-sjabloon-naam', id: `${id}-naam` },
              s.naam,
              s.standaard ? null : [' ', h('span', { class: 'label' }, 'Eigen sjabloon')],
            ),
            h('span', { class: 'nieuw-sjabloon-oms', id: `${id}-oms` }, s.omschrijving || ''),
            h('span', { class: 'nieuw-sjabloon-tal', id: `${id}-tal` }, samenvattingTekst(s.samenvatting)),
          ),
        ),
        h('div', { class: 'nieuw-sjabloon-voorbeeld' }, knop, paneel),
      );
    });
    vervang(sjabloonLijst, h('ul', { class: 'nieuw-sjablonen' }, items));
    werkKeuzeBij();
  }

  async function laadSjablonen() {
    try {
      const { sjablonen } = await api.get('/sjablonen');
      tekenSjablonen(sjablonen || []);
    } catch (e) {
      vakjes = [];
      vervang(sjabloonLijst, melding([
        h('p', {}, `De sjablonen konden niet worden geladen. ${e.message || ''}`),
        h('p', {}, 'Je kunt het onderzoek ook zonder sjabloon aanmaken.'),
        h('button', { type: 'button', class: 'knop knop-klein', onclick: () => { vervang(sjabloonLijst, laden()); laadSjablonen(); } }, 'Opnieuw proberen'),
      ], 'waarschuwing'));
      vervang(keuzeSamenvatting, 'Geen sjabloon gekozen: je begint met een leeg onderzoek.');
    }
  }

  const sjablonenKaart = h('section', { class: 'kaart', 'aria-labelledby': 'nieuw-sjablonen-kop' },
    h('h2', { id: 'nieuw-sjablonen-kop' }, 'Startsjablonen (optioneel)'),
    h('p', {}, 'Met een sjabloon begin je niet met een leeg onderzoek: je krijgt meteen thema\'s met meetpunten, een vragenlijst en een actielijst.'),
    h('ul', { class: 'nieuw-uitleg klein' },
      h('li', {}, 'Je kunt meerdere sjablonen combineren. Thema\'s met dezelfde naam worden samengevoegd; dubbele vragen en acties komen er maar één keer in.'),
      h('li', {}, 'Alle gekozen vragen komen samen in één vragenlijst voor het meetmoment "Nulmeting". De vragenlijst staat nog dicht tot je hem zelf openzet.'),
      h('li', {}, 'Alles blijft aan te passen: je kunt thema\'s, vragen en acties daarna wijzigen, toevoegen of verwijderen.'),
      h('li', {}, 'Kies je niets, dan krijg je een leeg onderzoek met het meetmoment "Nulmeting" en drie lege stukken (Notities, Bevindingen en Conceptrapport).'),
    ),
    h('fieldset', { class: 'nieuw-sjablonen-veld' },
      h('legend', {}, 'Kies een of meer sjablonen'),
      sjabloonLijst,
    ),
  );

  // ---------- Opslaan ----------

  const knop = h('button', { type: 'submit', class: 'knop knop-primair' }, 'Onderzoek aanmaken');

  async function verstuur(e) {
    e.preventDefault();
    if (bezig) return;
    wisFouten();
    const w = {};
    for (const [naam, v] of Object.entries(velden)) w[naam] = v.invoer.value.trim();
    const gekozen = vakjes.filter((v) => v.checked).map((v) => v.value);

    const ontbreekt = [];
    if (!w.bedrijfsnaam) ontbreekt.push(zetFout('bedrijfsnaam', 'Vul de naam van het bedrijf in.'));
    if (!w.titel) ontbreekt.push(zetFout('titel', 'Geef het onderzoek een titel.'));
    if (ontbreekt.length) {
      ontbreekt[0].focus();
      return;
    }
    if (gekozen.length > MAX_SJABLONEN) {
      vervang(algemeneFout, melding(`Je kunt maximaal ${MAX_SJABLONEN} sjablonen tegelijk kiezen.`, 'gevaar'));
      return;
    }

    bezig = true;
    knop.disabled = true;
    knop.textContent = 'Bezig met aanmaken…';
    try {
      const { id } = await api.post('/onderzoeken', { ...w, sjablonen: gekozen });
      meld('Onderzoek aangemaakt.', 'succes');
      ctx.navigeer(`#/onderzoek/${id}/opzet`);
    } catch (err) {
      bezig = false;
      knop.disabled = false;
      knop.textContent = 'Onderzoek aanmaken';
      if (err.status === 401) return; // inlogscherm verschijnt vanzelf
      const gevonden = VELD_BIJ_MELDING.find(([begin]) => (err.message || '').startsWith(begin));
      if (gevonden && err.status === 400) {
        zetFout(gevonden[1], err.message).focus();
      } else {
        vervang(algemeneFout, melding([h('strong', {}, 'Het onderzoek is niet aangemaakt. '), err.message || 'Er ging iets mis.'], 'gevaar'));
        algemeneFout.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  const formulier = h('form', { class: 'nieuw-formulier', novalidate: true, onsubmit: verstuur },
    gegevens,
    sjablonenKaart,
    h('div', { class: 'nieuw-voet' },
      keuzeSamenvatting,
      algemeneFout,
      h('div', { class: 'knoppen' },
        knop,
        h('a', { class: 'knop', href: '#/' }, 'Annuleren'),
      ),
    ),
  );

  vervang(container,
    h('div', { class: 'kruimel nieuw-kruimel' }, h('a', { href: '#/' }, '← Alle onderzoeken')),
    h('div', { class: 'paginakop' },
      h('div', {},
        h('h1', {}, 'Nieuw onderzoek'),
        h('p', { class: 'ondertitel' }, 'Vul de basisgegevens in en kies eventueel een of meer startsjablonen.'),
      ),
    ),
    formulier,
  );
  await laadSjablonen();
}
