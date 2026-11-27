// Scherm: Sjablonen – overzicht van alle sjablonen (standaard en eigen).
// Alle sjablonen zijn volledig te bewerken; een standaardsjabloon kun je terugzetten naar het origineel.
// Exporteert ook onderdelen voor andere schermen: samenvattingTekst(), sjabloonInhoud(),
// inhoudSchakelaar(), zetVoorkeuze()/neemVoorkeuze() en lokaleDatum().

import { api } from '../api.js';
import { h, vervang, leeg, laden, melding, meld, meldFout, bevestig, formulierDialoog, aantal, datum } from '../ui.js';

// Terugval als de vaste lijsten (nog) niet beschikbaar zijn.
const VRAAGTYPEN = { schaal: 'Schaal 1 tot 5', meerkeuze: 'Meerkeuze', janee: 'Ja / nee', cijfer: 'Cijfer (0–10 of 1–10)', open: 'Open tekst' };
const CIJFER_LABEL = { nps: 'Cijfer 0–10', rapport: 'Rapportcijfer 1–10' };
const SCHAAL_NAMEN = {
  eens: 'Eens – oneens',
  tevreden: 'Tevreden – ontevreden',
  frequentie: 'Nooit – altijd',
  kwaliteit: 'Zeer slecht – zeer goed',
};
const PLEK = '{bedrijf}';

// Sjabloon dat op dit scherm is gekozen om een nieuw onderzoek mee te starten. Staat ook even in
// het geheugen van het tabblad, zodat de keuze een herlaadbeurt van de pagina overleeft.
const VOORKEUZE = 'onderzoek-nieuw-sjabloon';
let voorkeuze = null;

export function zetVoorkeuze(id) {
  voorkeuze = String(id);
  try {
    sessionStorage.setItem(VOORKEUZE, voorkeuze);
  } catch {
    /* geen opslag beschikbaar: de keuze staat nog in het geheugen */
  }
}

/** Geeft (eenmalig) het id van het sjabloon dat is gekozen voor een nieuw onderzoek, of null. */
export function neemVoorkeuze() {
  let v = voorkeuze;
  voorkeuze = null;
  try {
    v = v ?? sessionStorage.getItem(VOORKEUZE);
    sessionStorage.removeItem(VOORKEUZE);
  } catch {
    /* geen opslag beschikbaar */
  }
  return v ? String(v) : null;
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

/** Labels bij een sjabloon: Standaard / Aangepast / Eigen sjabloon. */
export function sjabloonLabels(s) {
  if (!s.standaard) return [h('span', { class: 'label' }, 'Eigen sjabloon')];
  return [
    h('span', { class: 'label label-primair' }, 'Standaard'),
    s.gewijzigd ? h('span', { class: 'label label-waarschuwing', title: 'Je hebt dit standaardsjabloon aangepast' }, 'Aangepast') : null,
  ];
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
  } else if (v.type === 'cijfer') {
    delen.push(CIJFER_LABEL[v.schaal_soort] || CIJFER_LABEL.rapport);
    if (v.weet_niet) delen.push('met "weet niet"');
  } else if (v.type === 'meerkeuze') {
    delen.push(v.meerdere_antwoorden ? 'Meerkeuze, meerdere antwoorden mogelijk' : 'Meerkeuze');
  } else {
    delen.push(typen[v.type] || v.type);
  }
  if (v.meetpunt) delen.push(`meetpunt: ${v.meetpunt}`);
  const kenmerk = v.kenmerk && inst?.kenmerken?.[v.kenmerk];
  if (kenmerk) delen.push(`Kenmerk: ${kenmerk.naam}`);
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
    blokken.length ? blokken : h('p', { class: 'klein zacht' }, 'Dit sjabloon bevat nog geen thema\'s.'),
    acties.length
      ? h('section', { class: 'sjabloon-thema sjabloon-acties' },
        h(kop, { class: 'sjabloon-thema-naam' }, 'Acties'),
        h('ul', {}, acties.map((a) => h('li', {}, metPlek(typeof a === 'string' ? a : a?.titel)))),
      )
      : null,
  );
}

let teller = 0;

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
        const { inhoud } = await api.get(`/sjablonen/${encodeURIComponent(sjabloon.id)}`);
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
  const inhoudEl = h('div', {}, laden());
  const kopKnoppen = h('div', { class: 'knoppen sjo-kopknoppen' });
  let bezig = false;

  function tekenKopKnoppen(ontbrekend = []) {
    vervang(kopKnoppen,
      ontbrekend.length
        ? h('button', {
          type: 'button',
          class: 'knop',
          title: `Ontbreekt nu: ${ontbrekend.map((o) => o.naam).join(', ')}`,
          onclick: zetStandaardTerug,
        }, 'Standaardsjablonen terugzetten')
        : null,
      h('a', { class: 'knop knop-primair', href: '#/sjablonen/nieuw' }, '+ Nieuw sjabloon'),
    );
  }

  async function laad({ focus = null } = {}) {
    try {
      const data = await api.get('/sjablonen');
      teken(data.sjablonen || [], data.ontbrekend || []);
      if (focus) {
        const el = inhoudEl.querySelector(`[data-sjabloon="${focus}"]`);
        if (el) {
          el.classList.add('sjo-oplichten');
          el.scrollIntoView({ block: 'nearest' });
          const link = el.querySelector('a.sjo-naam-link');
          if (link) link.focus({ preventScroll: true });
        }
      }
    } catch (e) {
      if (e.status === 401) return;
      vervang(inhoudEl, melding([
        h('p', {}, h('strong', {}, 'De sjablonen konden niet worden geladen. '), e.message || ''),
        h('button', { type: 'button', class: 'knop knop-klein', onclick: () => { vervang(inhoudEl, laden()); laad(); } }, 'Opnieuw proberen'),
      ], 'gevaar'));
    }
  }

  /** Voert een actie op de server uit en ververst daarna de lijst; voorkomt dubbel klikken. */
  async function voerUit(actie, { focus = null } = {}) {
    if (bezig) return false;
    bezig = true;
    try {
      const r = await actie();
      await laad({ focus: typeof focus === 'function' ? focus(r) : focus });
      return true;
    } catch (e) {
      meldFout(e);
      await laad();
      return false;
    } finally {
      bezig = false;
    }
  }

  async function zetStandaardTerug() {
    let namen = [];
    const ok = await voerUit(async () => {
      namen = (await api.post('/sjablonen/herstellen', {})).toegevoegd || [];
    });
    if (!ok) return;
    meld(namen.length
      ? `${aantal(namen.length, 'standaardsjabloon', 'standaardsjablonen')} teruggezet: ${namen.join(', ')}.`
      : 'Alle standaardsjablonen staan er al.', 'succes');
  }

  function gebruik(s) {
    zetVoorkeuze(s.id);
    ctx.navigeer('#/nieuw');
  }

  async function maakKopie(s) {
    let nieuwId = null;
    const w = await formulierDialoog({
      titel: 'Kopie maken',
      knop: 'Kopie maken',
      intro: `Je maakt een eigen sjabloon met dezelfde inhoud als "${s.naam}". Het origineel blijft zoals het is.`,
      velden: [
        { naam: 'naam', label: 'Naam van de kopie', verplicht: true, max: 150, waarde: `${s.naam.slice(0, 140)} (kopie)` },
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
      opslaan: async (waarden) => {
        nieuwId = (await api.post('/sjablonen', { naam: waarden.naam, omschrijving: waarden.omschrijving, kopie_van: s.id })).id;
      },
    });
    if (!w) return;
    meld('Kopie gemaakt. Je vindt hem bij Eigen sjablonen.', 'succes');
    laad({ focus: nieuwId });
  }

  async function herstel(s) {
    const ok = await bevestig({
      titel: 'Origineel herstellen?',
      tekst: [
        `"${s.naam}" wordt teruggezet naar de oorspronkelijke versie. Alles wat je aan dit sjabloon hebt veranderd, gaat verloren.`,
        'Wil je jouw versie bewaren? Maak dan eerst een kopie.',
        'Onderzoeken die je al met dit sjabloon hebt gemaakt, veranderen niet.',
      ],
      knop: 'Origineel herstellen',
      gevaar: true,
    });
    if (!ok) return;
    if (await voerUit(() => api.post(`/sjablonen/${s.id}/origineel`, {}), { focus: s.id })) {
      meld('Het originele sjabloon is teruggezet.', 'succes');
    }
  }

  async function verwijder(s) {
    const ok = await bevestig({
      titel: 'Sjabloon verwijderen?',
      tekst: [
        `"${s.naam}" wordt verwijderd.`,
        s.herstelbaar
          ? 'Dit is een standaardsjabloon. Je kunt het later terugzetten met "Standaardsjablonen terugzetten"; je eigen aanpassingen zijn dan wel weg.'
          : 'Dit kun je niet ongedaan maken.',
        'Onderzoeken die je al met dit sjabloon hebt gemaakt, blijven gewoon bestaan.',
      ],
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    if (await voerUit(() => api.del(`/sjablonen/${s.id}`))) meld('Sjabloon verwijderd.');
  }

  function kaart(s) {
    const { knop, paneel } = inhoudSchakelaar(s, { instellingen: ctx.instellingen, niveau: 4 });
    const gewijzigdOp = s.bijgewerkt_op ? lokaleDatum(s.bijgewerkt_op) : '';
    const gemaaktOp = !s.standaard && s.aangemaakt_op ? lokaleDatum(s.aangemaakt_op) : '';
    return h('li', { class: 'kaart sjo-kaart', 'data-sjabloon': String(s.id) },
      h('div', { class: 'sjo-kaart-kop' },
        h('h3', { class: 'sjo-naam' },
          h('a', { class: 'sjo-naam-link', href: `#/sjablonen/${s.id}` }, s.naam)),
        h('div', { class: 'sjo-labels' }, sjabloonLabels(s)),
      ),
      s.omschrijving ? h('p', { class: 'sjo-oms' }, s.omschrijving) : null,
      h('p', { class: 'klein zacht sjo-meta' },
        samenvattingTekst(s.samenvatting),
        gewijzigdOp ? ` · gewijzigd op ${gewijzigdOp}` : gemaaktOp ? ` · gemaakt op ${gemaaktOp}` : ''),
      h('div', { class: 'sjo-acties' },
        h('a', { class: 'knop knop-klein', href: `#/sjablonen/${s.id}`, 'aria-label': `Bewerken: ${s.naam}` }, 'Bewerken'),
        h('button', { type: 'button', class: 'knop knop-klein', 'aria-label': `Kopie maken van ${s.naam}`, onclick: () => maakKopie(s) }, 'Kopie maken'),
        h('button', {
          type: 'button', class: 'knop knop-klein', 'aria-label': `Gebruiken voor nieuw onderzoek: ${s.naam}`, onclick: () => gebruik(s),
        }, 'Gebruiken voor nieuw onderzoek'),
        s.herstelbaar && s.gewijzigd
          ? h('button', { type: 'button', class: 'knop knop-klein', 'aria-label': `Herstel origineel: ${s.naam}`, onclick: () => herstel(s) }, 'Herstel origineel')
          : null,
        h('button', {
          type: 'button', class: 'knop knop-klein knop-licht sjo-knop-gevaar', 'aria-label': `Verwijderen: ${s.naam}`, onclick: () => verwijder(s),
        }, 'Verwijderen'),
      ),
      h('div', { class: 'sjo-voorbeeld' }, knop, paneel),
    );
  }

  function teken(sjablonen, ontbrekend) {
    tekenKopKnoppen(ontbrekend);
    const standaard = sjablonen.filter((s) => s.standaard);
    const eigen = sjablonen.filter((s) => !s.standaard);
    const groep = (id, titel, uitleg, lijst, leegTekst, leegKnop = null) => h('section', { class: 'sjo-groep', 'aria-labelledby': id },
      h('div', { class: 'sjo-groep-kop' },
        h('h2', { id }, titel),
        lijst.length ? h('span', { class: 'zacht klein' }, aantal(lijst.length, 'sjabloon', 'sjablonen')) : null),
      h('p', { class: 'zacht klein sjo-groep-uitleg' }, uitleg),
      lijst.length ? h('ul', { class: 'sjo-kaarten' }, lijst.map(kaart)) : leeg(leegTekst, leegKnop),
    );
    vervang(inhoudEl,
      groep('sjablonen-standaard', 'Standaardsjablonen',
        'Deze sjablonen horen bij de onderzoeksomgeving. Je kunt ze net als je eigen sjablonen aanpassen of verwijderen. '
        + 'Met "Herstel origineel" zet je een aangepast standaardsjabloon terug zoals het was.',
        standaard,
        'Er staan nu geen standaardsjablonen. Zet ze terug als je ze weer wilt gebruiken.',
        ontbrekend.length ? h('button', { type: 'button', class: 'knop', onclick: zetStandaardTerug }, 'Standaardsjablonen terugzetten') : null),
      groep('sjablonen-eigen', 'Eigen sjablonen',
        'Sjablonen die je zelf hebt gemaakt: nieuw, als kopie, of opgeslagen vanuit een onderzoek (Opzet → "Opslaan als sjabloon").',
        eigen,
        'Je hebt nog geen eigen sjablonen. Maak een nieuw sjabloon, of maak een kopie van een standaardsjabloon en pas die aan.',
        h('a', { class: 'knop knop-primair', href: '#/sjablonen/nieuw' }, '+ Nieuw sjabloon')),
    );
  }

  tekenKopKnoppen();
  vervang(container,
    h('div', { class: 'paginakop' },
      h('div', {},
        h('h1', {}, 'Sjablonen'),
        h('p', { class: 'ondertitel' }, 'Kant-en-klare opzetten om een onderzoek snel mee te beginnen.'),
      ),
      kopKnoppen,
    ),
    melding([
      h('p', {}, h('strong', {}, 'Wat is een sjabloon? '),
        'Een sjabloon is een opzet voor een onderzoek: thema\'s met meetpunten, een vragenlijst en een lijst met acties. '
        + 'Bij een nieuw onderzoek kies je een of meer sjablonen. Daarna pas je alles nog aan voordat het onderzoek wordt aangemaakt.'),
      h('p', {}, 'Wat je hier in een sjabloon verandert, geldt voor onderzoeken die je daarna maakt. Bestaande onderzoeken veranderen niet mee.'),
    ]),
    inhoudEl,
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
