// Scherm: Onderzoeken (startpagina) – lopende onderzoeken als kaarten en het archief als lijst.

import { api } from '../api.js';
import { h, vervang, leeg, laden, melding, aantal } from '../ui.js';
import { lokaleDatum } from './sjablonen.js';

const ARCHIEF_ZOEKEN_VANAF = 8; // vanaf zoveel gearchiveerde onderzoeken verschijnt een zoekveld

export async function toon(container, ctx) {
  ctx.zetTitel('Onderzoeken');
  const inhoud = h('div', {}, laden());

  vervang(container,
    h('div', { class: 'paginakop' },
      h('div', {},
        h('h1', {}, 'Onderzoeken'),
        h('p', { class: 'ondertitel' }, 'Je lopende onderzoeken en het archief.'),
      ),
      h('a', { class: 'knop knop-primair', href: '#/nieuw' }, '+ Nieuw onderzoek'),
    ),
    inhoud,
  );

  async function laad() {
    try {
      const { onderzoeken } = await api.get('/onderzoeken');
      teken(onderzoeken || []);
    } catch (e) {
      if (e.status === 401) return;
      vervang(inhoud, melding([
        h('p', {}, h('strong', {}, 'De onderzoeken konden niet worden geladen. '), e.message || ''),
        h('button', { type: 'button', class: 'knop knop-klein', onclick: () => { vervang(inhoud, laden()); laad(); } }, 'Opnieuw proberen'),
      ], 'gevaar'));
    }
  }

  function teken(onderzoeken) {
    const lopend = onderzoeken.filter((o) => o.status === 'actief');
    const archief = onderzoeken
      .filter((o) => o.status === 'gearchiveerd')
      .sort((a, b) => String(b.gearchiveerd_op || '').localeCompare(String(a.gearchiveerd_op || '')));

    vervang(inhoud,
      h('section', { class: 'start-sectie', 'aria-labelledby': 'start-lopend-kop' },
        h('div', { class: 'start-sectie-kop' },
          h('h2', { id: 'start-lopend-kop' }, 'Lopende onderzoeken'),
          lopend.length ? h('span', { class: 'zacht klein' }, aantal(lopend.length, 'onderzoek', 'onderzoeken')) : null,
        ),
        lopend.length
          ? h('ul', { class: 'raster start-kaarten' }, lopend.map(kaart))
          : leeg(
            onderzoeken.length
              ? 'Er lopen op dit moment geen onderzoeken. Start een nieuw onderzoek of bekijk een afgerond onderzoek in het archief hieronder.'
              : 'Je hebt nog geen onderzoeken. Maak je eerste onderzoek aan om te beginnen.',
            h('a', { class: 'knop knop-primair', href: '#/nieuw' }, onderzoeken.length ? '+ Nieuw onderzoek' : 'Eerste onderzoek aanmaken'),
          ),
      ),
      onderzoeken.length ? null : zoWerktHet(),
      archief.length ? archiefSectie(archief) : null,
    );
  }

  await laad();
}

// ---------- Kaart van een lopend onderzoek ----------

function cijfer(waarde, label, extra = null) {
  return h('div', { class: 'start-cijfer' },
    h('dt', {}, label),
    h('dd', {}, h('span', { class: 'start-cijfer-waarde' }, Number(waarde || 0).toLocaleString('nl-NL')), extra),
  );
}

function kaart(o) {
  const open = Number(o.open_vragenlijsten || 0);
  return h('li', { class: 'kaart start-kaart' },
    h('p', { class: 'start-kaart-bedrijf' }, o.bedrijfsnaam),
    h('h3', { class: 'start-kaart-titel' },
      h('a', { class: 'start-kaart-link', href: `#/onderzoek/${o.id}/dashboard` }, o.titel),
    ),
    o.onderzoeksvraag ? h('p', { class: 'start-kaart-vraag' }, o.onderzoeksvraag) : null,
    h('dl', { class: 'start-cijfers' },
      cijfer(o.aantal_vragenlijsten, o.aantal_vragenlijsten === 1 ? 'vragenlijst' : 'vragenlijsten',
        open ? h('span', { class: 'label label-open start-cijfer-open' }, `${open} open`) : null),
      cijfer(o.aantal_inzendingen, 'keer ingevuld'),
      cijfer(o.open_acties, o.open_acties === 1 ? 'open actie' : 'open acties'),
    ),
    o.aangemaakt_op ? h('p', { class: 'start-kaart-voet' }, `Gestart op ${lokaleDatum(o.aangemaakt_op)}`) : null,
  );
}

// ---------- Uitleg als er nog niets is ----------

function zoWerktHet() {
  const stap = (titel, tekst) => h('li', { class: 'start-stap' },
    h('strong', { class: 'start-stap-titel' }, titel),
    h('span', { class: 'start-stap-tekst' }, tekst),
  );
  return h('section', { class: 'kaart start-uitleg', 'aria-labelledby': 'start-uitleg-kop' },
    h('h2', { id: 'start-uitleg-kop' }, 'Zo werkt het'),
    h('ol', { class: 'start-stappen' },
      stap('Maak een onderzoek aan',
        ['Vul de bedrijfsnaam en een titel in. Kies eventueel een ', h('a', { href: '#/sjablonen' }, 'sjabloon'),
          ': dan krijg je meteen thema\'s, een vragenlijst en acties.']),
      stap('Zet de vragenlijst open en deel de link',
        'Controleer de vragen, zet de vragenlijst open en stuur de link naar de respondenten. Zij vullen de vragenlijst anoniem in.'),
      stap('Volg de resultaten en rond af',
        'Bekijk de resultaten op het dashboard, schrijf je stukken, exporteer wat je nodig hebt en archiveer het onderzoek als het klaar is.'),
    ),
  );
}

// ---------- Archief ----------

function archiefSectie(archief) {
  const lijstEl = h('div', {});

  function tekenLijst(filter = '') {
    const zoek = filter.trim().toLowerCase();
    const zichtbaar = zoek
      ? archief.filter((o) => `${o.titel} ${o.bedrijfsnaam}`.toLowerCase().includes(zoek))
      : archief;
    if (!zichtbaar.length) {
      vervang(lijstEl, h('p', { class: 'zacht start-archief-geen' }, `Geen gearchiveerde onderzoeken gevonden voor "${filter.trim()}".`));
      return;
    }
    vervang(lijstEl, h('ul', { class: 'lijst start-archief' }, zichtbaar.map((o) => h('li', { class: 'start-archief-item' },
      h('a', { class: 'start-archief-link', href: `#/onderzoek/${o.id}/dashboard` }, o.titel),
      h('span', { class: 'start-archief-meta' },
        o.bedrijfsnaam,
        o.gearchiveerd_op ? ` · gearchiveerd op ${lokaleDatum(o.gearchiveerd_op)}` : '',
      ),
    ))));
  }

  const zoekveld = archief.length >= ARCHIEF_ZOEKEN_VANAF
    ? h('div', { class: 'veld start-archief-zoek' },
      h('label', { for: 'start-archief-zoek' }, 'Zoek in het archief'),
      h('input', {
        type: 'search',
        id: 'start-archief-zoek',
        autocomplete: 'off',
        placeholder: 'Titel of bedrijfsnaam',
        oninput: (e) => tekenLijst(e.target.value),
      }),
    )
    : null;

  tekenLijst();
  return h('section', { class: 'kaart start-archief-kaart', 'aria-labelledby': 'start-archief-kop' },
    h('div', { class: 'kaart-kop' },
      h('h2', { id: 'start-archief-kop' }, 'Archief'),
      h('span', { class: 'zacht klein' }, aantal(archief.length, 'onderzoek', 'onderzoeken')),
    ),
    h('p', { class: 'zacht klein' }, 'Afgeronde onderzoeken. Je kunt ze nog inzien en exporteren, maar niet meer wijzigen.'),
    zoekveld,
    lijstEl,
  );
}
