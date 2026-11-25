// Scherm: Sjablonen – overzicht van standaard- en eigen sjablonen.
// Exporteert ook de onderdelen die het scherm "Nieuw onderzoek" gebruikt:
// samenvattingTekst(), inhoudSchakelaar() en sjabloonInhoud().

import { api } from '../api.js';
import { h, vervang, leeg, laden, melding, meld, meldFout, bevestig, formulierDialoog, aantal, datum } from '../ui.js';

// Terugval als de vaste lijsten (nog) niet beschikbaar zijn.
const VRAAGTYPEN = { schaal: 'Schaal 1 tot 5', meerkeuze: 'Meerkeuze', janee: 'Ja / nee', open: 'Open tekst' };
const SCHAAL_NAMEN = {
  eens: 'Eens – oneens',
  tevreden: 'Tevreden – ontevreden',
  frequentie: 'Nooit – altijd',
  kwaliteit: 'Zeer slecht – zeer goed',
};
const PLEK = '{bedrijf}';

// Sjabloon dat vanuit dit scherm is gekozen om een nieuw onderzoek mee te starten.
let voorkeuze = null;

/** Geeft (eenmalig) het sjabloon-id dat op dit scherm is gekozen voor een nieuw onderzoek. */
export function neemVoorkeuze() {
  const v = voorkeuze;
  voorkeuze = null;
  return v;
}

/** "8 thema's · 13 meetpunten · 25 vragen · 7 acties" */
export function samenvattingTekst(s = {}) {
  return [
    aantal(s.themas || 0, 'thema', "thema's"),
    aantal(s.meetpunten || 0, 'meetpunt', 'meetpunten'),
    aantal(s.vragen || 0, 'vraag', 'vragen'),
    aantal(s.acties || 0, 'actie', 'acties'),
  ].join(' · ');
}

/** Tekst uit een sjabloon, met {bedrijf} zichtbaar als "[bedrijfsnaam]". */
function metPlek(tekst) {
  const delen = String(tekst ?? '').split(PLEK);
  const uit = [];
  delen.forEach((deel, i) => {
    if (i > 0) uit.push(h('span', { class: 'sjabloon-plek' }, '[bedrijfsnaam]'));
    if (deel) uit.push(deel);
  });
  return uit;
}

const sleutel = (s) => String(s ?? '').trim().toLowerCase();

function vraagKenmerken(v, inst) {
  const typen = inst?.vraagtypen || VRAAGTYPEN;
  const schalen = inst?.schaal_namen || SCHAAL_NAMEN;
  const delen = [];
  if (v.type === 'schaal') {
    delen.push(`Schaal: ${schalen[v.schaal_soort] || schalen.eens}`);
    if (v.weet_niet) delen.push('met "weet niet"');
  } else if (v.type === 'meerkeuze') {
    delen.push(v.meerdere_antwoorden ? 'Meerkeuze, meerdere antwoorden mogelijk' : 'Meerkeuze');
  } else {
    delen.push(typen[v.type] || v.type);
  }
  if (v.meetpunt) delen.push(`meetpunt: ${v.meetpunt}`);
  return delen;
}

/**
 * Toont de inhoud van een sjabloon: per thema de meetpunten en vragen, daarna de acties.
 * niveau = kopniveau voor de thema's (3 of 4), zodat de koppen op de pagina op volgorde blijven.
 */
export function sjabloonInhoud(inhoud, { instellingen = null, niveau = 4 } = {}) {
  const themas = Array.isArray(inhoud?.themas) ? inhoud.themas : [];
  const vragen = Array.isArray(inhoud?.vragen) ? inhoud.vragen : [];
  const acties = Array.isArray(inhoud?.acties) ? inhoud.acties : [];
  const kop = `h${Math.min(Math.max(niveau, 2), 6)}`;

  // Vragen groeperen per thema, in de volgorde van de thema's.
  const groepen = themas.map((t) => ({ thema: t, vragen: [] }));
  const perSleutel = new Map(groepen.map((g) => [sleutel(g.thema.naam), g]));
  for (const v of vragen) {
    const k = sleutel(v.thema);
    let g = perSleutel.get(k);
    if (!g) {
      g = { thema: { naam: v.thema || 'Zonder thema', omschrijving: '', meetpunten: [] }, vragen: [] };
      perSleutel.set(k, g);
      groepen.push(g);
    }
    g.vragen.push(v);
  }

  const heeftPlek = JSON.stringify(inhoud || {}).includes(PLEK);
  const vlTitel = inhoud?.vragenlijst?.titel;

  const blokken = groepen.map(({ thema, vragen: vr }) => {
    const meetpunten = Array.isArray(thema.meetpunten) ? thema.meetpunten : [];
    return h('section', { class: 'sjabloon-thema' },
      h(kop, { class: 'sjabloon-thema-naam' }, metPlek(thema.naam)),
      thema.omschrijving ? h('p', { class: 'klein zacht' }, metPlek(thema.omschrijving)) : null,
      meetpunten.length
        ? h('div', { class: 'sjabloon-meetpunten' },
          h('span', { class: 'sjabloon-sublabel' }, 'Meetpunten'),
          h('ul', {}, meetpunten.map((m) => h('li', {},
            metPlek(m.naam),
            m.eenheid ? h('span', { class: 'zacht' }, ` (${m.eenheid})`) : null,
          ))),
        )
        : null,
      vr.length
        ? h('div', { class: 'sjabloon-vragen' },
          h('span', { class: 'sjabloon-sublabel' }, aantal(vr.length, 'vraag', 'vragen')),
          h('ol', {}, vr.map((v) => h('li', {},
            h('span', { class: 'sjabloon-vraag-tekst' }, metPlek(v.tekst)),
            h('span', { class: 'sjabloon-vraag-meta' },
              vraagKenmerken(v, instellingen).join(' · '),
              v.uitsplitsen ? h('span', { class: 'label label-primair' }, 'Voor uitsplitsing') : null,
            ),
            v.type === 'meerkeuze' && Array.isArray(v.opties) && v.opties.length
              ? h('span', { class: 'sjabloon-vraag-opties' },
                'Opties: ',
                v.opties.map((o, i) => [i ? ' · ' : '', metPlek(typeof o === 'string' ? o : o?.label)]),
              )
              : null,
          ))),
        )
        : h('p', { class: 'klein zacht sjabloon-geen' }, meetpunten.length
          ? 'Geen vragen bij dit thema. De meetpunten vul je zelf in bij Eigen invoer.'
          : 'Geen vragen bij dit thema.'),
    );
  });

  return h('div', { class: 'sjabloon-inhoud-binnen' },
    vlTitel || heeftPlek
      ? h('div', { class: 'sjabloon-inleiding klein' },
        vlTitel ? h('p', {}, 'Vragenlijst: ', h('strong', {}, metPlek(vlTitel))) : null,
        heeftPlek ? h('p', { class: 'zacht' }, 'Op de plek van ', h('span', { class: 'sjabloon-plek' }, '[bedrijfsnaam]'),
          ' komt straks de naam van het bedrijf.') : null,
      )
      : null,
    blokken.length ? blokken : h('p', { class: 'klein zacht' }, 'Dit sjabloon bevat geen thema\'s.'),
    acties.length
      ? h('section', { class: 'sjabloon-thema sjabloon-acties' },
        h(kop, { class: 'sjabloon-thema-naam' }, 'Acties'),
        h('ul', {}, acties.map((a) => h('li', {}, metPlek(typeof a === 'string' ? a : a?.titel)))),
      )
      : null,
  );
}

let teller = 0;
const cache = new Map();

/**
 * Knop "Bekijk inhoud" met een uitklapbaar paneel dat de inhoud van het sjabloon laadt.
 * Geeft { knop, paneel }; zet beide zelf op de pagina.
 */
export function inhoudSchakelaar(sjabloon, { instellingen = null, niveau = 4 } = {}) {
  const id = `sjabloon-inhoud-${++teller}`;
  const paneel = h('div', { class: 'sjabloon-inhoud', id, hidden: true });
  let gevuld = false;
  let bezig = false;

  const knop = h('button', {
    type: 'button',
    class: 'knop knop-klein knop-licht sjabloon-schakel',
    'aria-expanded': 'false',
    'aria-controls': id,
    onclick: async () => {
      const open = knop.getAttribute('aria-expanded') !== 'true';
      const tekst = open ? 'Verberg inhoud' : 'Bekijk inhoud';
      knop.setAttribute('aria-expanded', String(open));
      knop.textContent = tekst;
      knop.setAttribute('aria-label', `${tekst} van "${sjabloon.naam}"`);
      paneel.hidden = !open;
      if (!open || gevuld || bezig) return;
      bezig = true;
      vervang(paneel, laden('Inhoud wordt geladen…'));
      try {
        let inhoud = cache.get(sjabloon.id);
        if (!inhoud) {
          ({ inhoud } = await api.get(`/sjablonen/${encodeURIComponent(sjabloon.id)}`));
          // Alleen standaardsjablonen bewaren: die veranderen nooit.
          if (sjabloon.standaard) cache.set(sjabloon.id, inhoud);
        }
        vervang(paneel, sjabloonInhoud(inhoud, { instellingen, niveau }));
        gevuld = true;
      } catch (e) {
        vervang(paneel, melding(['De inhoud kon niet worden geladen. ', e.message || ''], 'gevaar'));
      } finally {
        bezig = false;
      }
    },
  }, 'Bekijk inhoud');
  knop.setAttribute('aria-label', `Bekijk inhoud van "${sjabloon.naam}"`);
  return { knop, paneel };
}

// ---------- Het scherm ----------

export async function toon(container, ctx) {
  ctx.zetTitel('Sjablonen');
  const standaardEl = h('div', {}, laden());
  const eigenEl = h('div', {}, laden());

  async function laad() {
    try {
      const { sjablonen } = await api.get('/sjablonen');
      teken(sjablonen || []);
    } catch (e) {
      const opnieuw = h('button', { type: 'button', class: 'knop knop-klein', onclick: () => { vervang(standaardEl, laden()); vervang(eigenEl, laden()); laad(); } }, 'Opnieuw proberen');
      vervang(standaardEl, melding([h('p', {}, `De sjablonen konden niet worden geladen. ${e.message || ''}`), opnieuw], 'gevaar'));
      vervang(eigenEl);
    }
  }

  function gebruik(s) {
    voorkeuze = s.id;
    ctx.navigeer('#/nieuw');
  }

  async function wijzig(s) {
    const resultaat = await formulierDialoog({
      titel: 'Sjabloon wijzigen',
      intro: 'Je wijzigt hier alleen de naam en omschrijving. De inhoud pas je aan in een onderzoek, dat je daarna opnieuw opslaat als sjabloon.',
      velden: [
        { naam: 'naam', label: 'Naam van het sjabloon', verplicht: true, max: 150, waarde: s.naam },
        {
          naam: 'omschrijving',
          label: 'Omschrijving',
          type: 'textarea',
          rijen: 3,
          max: 1000,
          waarde: s.omschrijving,
          hulp: 'Waar is dit sjabloon voor bedoeld? Je ziet dit bij het kiezen van een sjabloon.',
        },
      ],
      opslaan: (w) => api.put(`/sjablonen/${encodeURIComponent(s.id)}`, { naam: w.naam, omschrijving: w.omschrijving }),
    });
    if (resultaat) {
      meld('Sjabloon opgeslagen.', 'succes');
      laad();
    }
  }

  async function verwijder(s) {
    const ok = await bevestig({
      titel: 'Sjabloon verwijderen?',
      tekst: [
        `"${s.naam}" wordt verwijderd. Dit kun je niet ongedaan maken.`,
        'Onderzoeken die je al met dit sjabloon hebt gemaakt, blijven gewoon bestaan.',
      ],
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    try {
      await api.del(`/sjablonen/${encodeURIComponent(s.id)}`);
      meld('Sjabloon verwijderd.');
      laad();
    } catch (e) {
      meldFout(e);
      laad();
    }
  }

  function item(s) {
    const { knop, paneel } = inhoudSchakelaar(s, { instellingen: ctx.instellingen, niveau: 4 });
    return h('li', { class: 'sjabloon-item' },
      h('div', { class: 'sjabloon-item-kop' },
        h('div', { class: 'sjabloon-item-hoofd' },
          h('div', { class: 'rij sjabloon-item-titelrij' },
            h('h3', { class: 'sjabloon-item-naam' }, s.naam),
            s.standaard
              ? h('span', { class: 'label label-primair' }, 'Standaard')
              : h('span', { class: 'label' }, 'Eigen sjabloon'),
          ),
          s.omschrijving ? h('p', { class: 'sjabloon-item-oms' }, s.omschrijving) : null,
          h('p', { class: 'klein zacht sjabloon-item-meta' },
            samenvattingTekst(s.samenvatting),
            !s.standaard && s.aangemaakt_op ? ` · opgeslagen op ${lokaleDatum(s.aangemaakt_op)}` : '',
          ),
        ),
        h('div', { class: 'sjabloon-item-acties' },
          h('button', {
            type: 'button',
            class: 'knop knop-klein',
            'aria-label': `Gebruik voor nieuw onderzoek: ${s.naam}`,
            onclick: () => gebruik(s),
          }, 'Gebruik voor nieuw onderzoek'),
          s.standaard ? null : h('button', {
            type: 'button',
            class: 'knop knop-klein',
            'aria-label': `Wijzigen: ${s.naam}`,
            onclick: () => wijzig(s),
          }, 'Wijzigen'),
          s.standaard ? null : h('button', {
            type: 'button',
            class: 'knop knop-klein knop-licht sjabloon-verwijder',
            'aria-label': `Verwijderen: ${s.naam}`,
            onclick: () => verwijder(s),
          }, 'Verwijderen'),
        ),
      ),
      h('div', { class: 'sjabloon-item-voorbeeld' }, knop, paneel),
    );
  }

  function teken(sjablonen) {
    const standaard = sjablonen.filter((s) => s.standaard);
    const eigen = sjablonen.filter((s) => !s.standaard);
    vervang(standaardEl, standaard.length
      ? h('ul', { class: 'lijst sjabloon-lijst' }, standaard.map(item))
      : leeg('Er zijn geen standaardsjablonen.'));
    vervang(eigenEl, eigen.length
      ? h('ul', { class: 'lijst sjabloon-lijst' }, eigen.map(item))
      : leeg('Je hebt nog geen eigen sjablonen. Open een onderzoek, ga naar Opzet en kies "Opslaan als sjabloon" om de opzet van dat onderzoek te bewaren.'));
  }

  vervang(container,
    h('div', { class: 'paginakop' },
      h('div', {},
        h('h1', {}, 'Sjablonen'),
        h('p', { class: 'ondertitel' }, 'Kant-en-klare opzetten om een onderzoek snel mee te beginnen.'),
      ),
      h('a', { class: 'knop knop-primair', href: '#/nieuw' }, '+ Nieuw onderzoek'),
    ),
    melding([
      h('p', {}, h('strong', {}, 'Wat is een sjabloon? '),
        'Een sjabloon is een opzet voor een onderzoek: thema\'s met meetpunten, een vragenlijst en een lijst met acties. '
        + 'Je kiest een of meer sjablonen als je een nieuw onderzoek aanmaakt.'),
      h('p', {}, 'De inhoud wordt dan in het onderzoek gezet. Daarna kun je alles in het onderzoek vrij aanpassen. '
        + 'Wat je in een onderzoek verandert, verandert het sjabloon niet.'),
    ]),
    h('section', { class: 'kaart', 'aria-labelledby': 'sjablonen-standaard' },
      h('h2', { id: 'sjablonen-standaard' }, 'Standaardsjablonen'),
      h('p', { class: 'zacht klein sjabloon-sectie-uitleg' },
        'Deze sjablonen horen bij de onderzoeksomgeving en kun je niet wijzigen of verwijderen. Wil je een eigen versie? '
        + 'Kies het sjabloon bij een nieuw onderzoek, pas het onderzoek naar wens aan en bewaar het via Opzet → "Opslaan als sjabloon".'),
      standaardEl,
    ),
    h('section', { class: 'kaart', 'aria-labelledby': 'sjablonen-eigen' },
      h('h2', { id: 'sjablonen-eigen' }, 'Eigen sjablonen'),
      h('p', { class: 'zacht klein sjabloon-sectie-uitleg' },
        'Sjablonen die je zelf hebt opgeslagen vanuit een onderzoek. Je kunt de naam en omschrijving wijzigen of een sjabloon verwijderen. '
        + 'De inhoud pas je aan in een onderzoek, dat je daarna opnieuw opslaat als sjabloon.'),
      eigenEl,
    ),
  );
  await laad();
}

/** ISO-tijdstip → '25 nov. 2026' (datum in lokale tijd). */
export function lokaleDatum(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const tweeCijfers = (n) => String(n).padStart(2, '0');
  return datum(`${t.getFullYear()}-${tweeCijfers(t.getMonth() + 1)}-${tweeCijfers(t.getDate())}`);
}
