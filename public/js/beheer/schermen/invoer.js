// Scherm: Eigen invoer – interviews, observaties, cijfers, documentanalyse en overige bronnen.
// Alles wat de onderzoeker buiten de vragenlijsten om te weten komt, per thema vastgelegd.
// De invoerdialoog is een eigen <dialog> (zelfde opbouw als in ui.js), omdat de velden
// meeveranderen met de gekozen soort en het gekozen thema.

import { api } from '../api.js';
import { h, vervang, leeg, laden, melding, meld, meldFout, bevestig, getal, datum, vandaag, aantal } from '../ui.js';
import { inleesKaart } from './inlezen-kaart.js';

const STANDAARD_SOORTEN = {
  interview: 'Interview',
  observatie: 'Observatie',
  cijfer: 'Cijfer',
  document: 'Documentanalyse',
  overig: 'Overig',
};

const SOORT_UITLEG = {
  interview: 'Aantekeningen van een gesprek, bijvoorbeeld met een leidinggevende of met een groep medewerkers.',
  observatie: 'Wat je zelf hebt gezien of gehoord, bijvoorbeeld tijdens een werkoverleg of op de werkvloer.',
  cijfer: 'Een getal uit een registratie, zoals het verzuimpercentage, het verloop of het aantal vacatures.',
  document: 'Wat je haalt uit documenten, zoals beleidsstukken, jaarverslagen of verslagen van exitgesprekken.',
  overig: 'Alles wat niet bij de andere soorten past.',
};

const TITEL_VOORBEELD = {
  interview: 'Bijv. Interview met teamleider productie',
  observatie: 'Bijv. Werkoverleg afdeling logistiek',
  cijfer: 'Bijv. Verzuim Q3 2026',
  document: 'Bijv. Analyse exitgesprekken 2025',
  overig: 'Bijv. Signalen uit het OR-overleg',
};

const DATUM_HULP = {
  interview: 'Wanneer was het gesprek?',
  observatie: 'Wanneer heb je dit gezien of gehoord?',
  cijfer: 'Over welke datum gaat het cijfer? Bijvoorbeeld de laatste dag van het kwartaal.',
  document: 'De datum van het document, of wanneer je het hebt bekeken.',
  overig: 'Wanneer was het, of wanneer heb je het gehoord?',
};

const TEKST_HULP = {
  cijfer: 'Optioneel. Bijvoorbeeld de bron of hoe het cijfer is berekend.',
  document: 'Optioneel. Bijvoorbeeld welk document het is en wat je opviel.',
  overig: 'Optioneel.',
};

const MEERVOUD = {
  interview: ['interview', 'interviews'],
  observatie: ['observatie', 'observaties'],
  cijfer: ['cijfer', 'cijfers'],
  document: ['documentanalyse', 'documentanalyses'],
  overig: ['overig', 'overig'],
};

// Lange teksten worden ingekort tot ongeveer zoveel tekens of regels ("Lees meer" toont alles).
const KORT_TEKENS = 200;
const KORT_REGELS = 4;

let dialoogTeller = 0;

/** Ingekorte versie van een lange tekst, of null als de tekst kort genoeg is om helemaal te tonen. */
function uittreksel(tekst) {
  const regels = tekst.split('\n');
  const teLang = tekst.length > KORT_TEKENS + 40;
  const teVeelRegels = regels.length > KORT_REGELS + 1;
  if (!teLang && !teVeelRegels) return null;
  let eerste = regels.slice(0, KORT_REGELS);
  // Liefst afbreken na een hele alinea (bij een witregel), als er dan nog genoeg overblijft.
  for (let i = eerste.length - 1; i > 0; i--) {
    if (!eerste[i].trim()) {
      if (eerste.slice(0, i).join('\n').trim().length >= 60) eerste = eerste.slice(0, i);
      break;
    }
  }
  let stuk = eerste.join('\n');
  if (stuk.length > KORT_TEKENS) {
    stuk = stuk.slice(0, KORT_TEKENS);
    const grens = stuk.search(/\s\S*$/); // op een woordgrens afbreken
    if (grens > KORT_TEKENS * 0.6) stuk = stuk.slice(0, grens);
  }
  return `${stuk.replace(/[\s.,;:–-]+$/, '')}…`;
}

/** Getal met maximaal 2 decimalen, zonder overbodige nullen: 12 → "12", 5.4 → "5,4", 3.14159 → "3,14". */
function toonGetal(x) {
  const n = Number(x);
  const c = Math.round(Math.abs(n) * 100);
  const decimalen = c % 100 === 0 ? 0 : c % 10 === 0 ? 1 : 2;
  return getal(n, decimalen);
}

/**
 * Leest een getal zoals mensen het typen: "5,4", "5.4", "1.234,5", "-2", "1 250".
 * Geeft { leeg: true }, { fout: true } of { waarde }.
 */
function leesGetal(invoer) {
  let s = String(invoer ?? '').replace(/[\s  ]/g, '').replace(/^−/, '-');
  if (!s) return { leeg: true };
  if (!/^[-+]?[\d.,]*\d[\d.,]*$/.test(s)) return { fout: true };
  const komma = s.lastIndexOf(',');
  const punt = s.lastIndexOf('.');
  if (komma !== -1 && punt !== -1) {
    // Allebei gebruikt: het laatste teken scheidt de decimalen, het andere de duizendtallen.
    s = komma > punt ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    if ((s.match(/\./g) || []).length > 1 || s.includes(',')) return { fout: true };
  } else if (komma !== -1) {
    if (s.indexOf(',') !== komma) return { fout: true };
    s = s.replace(',', '.');
  } else if (punt !== -1 && s.indexOf('.') !== punt) {
    s = s.replace(/\./g, ''); // 1.250.000
  }
  const n = Number(s);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) return { fout: true };
  return { waarde: n };
}

/** Getal uit de database als invoertekst met een komma: 5.4 → "5,4". */
function getalAlsTekst(x) {
  if (x === null || x === undefined || x === '') return '';
  return String(x).replace('.', ',');
}

function meetmomentNaam(mm) {
  return mm.datum ? `${mm.naam} (${datum(mm.datum)})` : mm.naam;
}

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const basis = `#/onderzoek/${onderzoekId}`;
  const soorten = ctx.instellingen.invoersoorten || STANDAARD_SOORTEN;
  const themas = ctx.onderzoek.themas || [];
  const meetmomenten = ctx.onderzoek.meetmomenten || [];
  const ro = ctx.alleenLezen;
  const kanToevoegen = !ro && themas.length > 0;
  ctx.zetTitel(`Eigen invoer – ${ctx.onderzoek.onderzoek.titel}`);

  let alles = null; // alle invoer van dit onderzoek (null = nog niet geladen)
  const filter = { soort: '', thema: '' };
  const voorkeur = { soort: null, thema: null }; // laatst gekozen soort en thema, voor de volgende nieuwe invoer
  const openTeksten = new Set(); // id's waarvan de hele tekst wordt getoond
  let openDialoog = null;

  // ---------- Vaste onderdelen van de pagina ----------

  const kopTitel = h('h2', { id: 'iv-kop', tabindex: '-1' }, 'Eigen invoer');
  const tellerEl = h('p', { class: 'zacht klein iv-teller' });
  const statusEl = h('p', { class: 'iv-filterstatus klein zacht', role: 'status' });
  const lijstEl = h('div', { class: 'iv-lijst' }, laden('De invoer wordt geladen…'));

  const soortFilter = h('select', { id: 'iv-filter-soort', onchange: () => zetFilter('soort', soortFilter.value) },
    h('option', { value: '' }, 'Alle soorten'),
    Object.entries(soorten).map(([waarde, label]) => h('option', { value: waarde }, label)));
  const themaFilter = h('select', { id: 'iv-filter-thema', onchange: () => zetFilter('thema', themaFilter.value) },
    h('option', { value: '' }, "Alle thema's"),
    themas.map((t) => h('option', { value: String(t.id) }, t.naam)));
  const wisKnop = h('button', { type: 'button', class: 'knop knop-klein knop-licht iv-wis verborgen', onclick: wisFilters }, 'Filters wissen');
  const filtersEl = h('div', { class: 'iv-filters verborgen', role: 'group', 'aria-label': 'Filteren' },
    h('div', { class: 'veld iv-filter' }, h('label', { for: soortFilter.id }, 'Soort'), soortFilter),
    h('div', { class: 'veld iv-filter' }, h('label', { for: themaFilter.id }, 'Thema'), themaFilter),
    wisKnop,
  );
  const toevoegKnop = kanToevoegen
    ? h('button', { type: 'button', class: 'knop knop-primair iv-toevoegen', onclick: () => nieuw() },
      h('span', { 'aria-hidden': 'true' }, '+ '), 'Invoer toevoegen')
    : null;
  const balk = h('div', { class: 'iv-balk' }, filtersEl, toevoegKnop);

  // ---------- Gegevens ----------

  async function laad(na = {}) {
    try {
      const r = await api.get(`/onderzoeken/${onderzoekId}/invoer`);
      alles = r.invoer || [];
    } catch (e) {
      vervang(lijstEl, melding([
        h('p', {}, h('strong', {}, 'De invoer kon niet worden geladen. '), e.message || ''),
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          onclick: () => {
            vervang(lijstEl, laden('De invoer wordt geladen…'));
            laad();
          },
        }, 'Opnieuw proberen'),
      ], 'gevaar'));
      return;
    }
    teken(na);
  }

  function past(e) {
    return (!filter.soort || e.soort === filter.soort) && (!filter.thema || String(e.thema_id) === filter.thema);
  }

  function zetFilter(sleutel, waarde) {
    filter[sleutel] = waarde;
    teken();
  }

  function wisFilters({ focus = true } = {}) {
    filter.soort = '';
    filter.thema = '';
    soortFilter.value = '';
    themaFilter.value = '';
    teken();
    if (focus) soortFilter.focus();
  }

  // ---------- Tekenen ----------

  function werkTellersBij() {
    const perSoort = {};
    const perThema = {};
    for (const e of alles) {
      perSoort[e.soort] = (perSoort[e.soort] || 0) + 1;
      perThema[e.thema_id] = (perThema[e.thema_id] || 0) + 1;
    }
    tellerEl.textContent = alles.length
      ? Object.keys(soorten).filter((s) => perSoort[s])
        .map((s) => aantal(perSoort[s], ...(MEERVOUD[s] || [soorten[s], soorten[s]]))).join(' · ')
      : 'Nog niets vastgelegd';
    // Aantallen in de filterkeuzes, zodat je ziet waar iets te vinden is.
    for (const o of soortFilter.options) {
      if (o.value) o.textContent = `${soorten[o.value]} (${perSoort[o.value] || 0})`;
    }
    for (const o of themaFilter.options) {
      if (o.value) {
        const t = themas.find((x) => String(x.id) === o.value);
        o.textContent = `${t ? t.naam : o.value} (${perThema[o.value] || 0})`;
      }
    }
  }

  function teken(na = {}) {
    if (!alles) return;
    tekenLijst();
    zetFocusNa(na);
  }

  /** Na opslaan of verwijderen: de betreffende invoer laten oplichten en de focus op een logische plek zetten. */
  function zetFocusNa({ focusId = null, focusIndex = null, oplichten = null }) {
    if (oplichten) {
      const li = lijstEl.querySelector(`[data-id="${oplichten}"]`);
      if (li) {
        li.classList.remove('iv-oplichten');
        void li.offsetWidth; // animatie opnieuw starten
        li.classList.add('iv-oplichten');
        li.addEventListener('animationend', () => li.classList.remove('iv-oplichten'), { once: true });
      }
    }
    if (focusId === null && focusIndex === null) return;
    let doel = null;
    if (focusId !== null) doel = lijstEl.querySelector(`[data-id="${focusId}"] .iv-item-titel`);
    if (!doel && focusIndex !== null) {
      const titels = lijstEl.querySelectorAll('.iv-item-titel');
      if (titels.length) doel = titels[Math.min(focusIndex, titels.length - 1)];
    }
    if (doel) {
      doel.focus({ preventScroll: true });
      doel.closest('.iv-item').scrollIntoView({ block: 'nearest' });
    } else {
      kopTitel.focus();
    }
  }

  function tekenLijst() {
    werkTellersBij();
    const actief = !!(filter.soort || filter.thema);
    filtersEl.classList.toggle('verborgen', !alles.length);
    wisKnop.classList.toggle('verborgen', !actief);
    balk.classList.toggle('verborgen', !alles.length); // de lege toestand heeft een eigen knop
    const zichtbaar = alles.filter(past);
    statusEl.textContent = actief && alles.length ? `${zichtbaar.length} van ${alles.length} getoond` : '';

    if (!alles.length) {
      if (!ro && !themas.length) {
        vervang(lijstEl); // de uitleg over thema's staat al bovenaan
      } else {
        vervang(lijstEl, leeg(
          ro
            ? 'In dit onderzoek is niets vastgelegd bij Eigen invoer.'
            : 'Je hebt nog niets vastgelegd. Begin bijvoorbeeld met je aantekeningen van een interview, of met het verzuimcijfer van het afgelopen kwartaal.',
          toevoegKnop ? h('button', { type: 'button', class: 'knop knop-primair', onclick: () => nieuw() }, 'Eerste invoer toevoegen') : null,
        ));
      }
      return;
    }

    if (!zichtbaar.length) {
      const thema = themas.find((t) => String(t.id) === filter.thema);
      const delen = [];
      if (filter.soort) delen.push(` van de soort "${soorten[filter.soort] || filter.soort}"`);
      if (filter.thema) delen.push(` bij het thema "${thema ? thema.naam : ''}"`);
      vervang(lijstEl, leeg(
        `Er is geen invoer${delen.join('')}.`,
        h('button', { type: 'button', class: 'knop', onclick: () => wisFilters() }, 'Alles tonen'),
      ));
      return;
    }

    vervang(lijstEl, h('ul', { class: 'lijst iv-items' }, zichtbaar.map(item)));
  }

  function item(e) {
    const p = `iv-item-${e.id}`;
    const soortLabel = h('span', { class: `label iv-soort iv-soort-${e.soort}` },
      h('span', { class: 'iv-stip', 'aria-hidden': 'true' }), soorten[e.soort] || e.soort);

    const plaats = h('span', { class: 'iv-plaats' },
      h('span', { class: 'sr-only' }, 'Thema: '), e.thema_naam,
      e.meetpunt_naam
        ? [h('span', { class: 'iv-pijl', 'aria-hidden': 'true' }, ' › '), h('span', { class: 'sr-only' }, ', meetpunt: '), e.meetpunt_naam]
        : null);
    const meta = h('div', { class: 'lijst-item-meta iv-meta' },
      plaats,
      e.meetmoment_naam ? h('span', { class: 'iv-meetmoment' }, `Meetmoment: ${e.meetmoment_naam}`) : null);

    let waarde = null;
    if (e.soort === 'cijfer' && e.waarde !== null && e.waarde !== undefined) {
      const eenheid = (e.eenheid || '').trim();
      waarde = h('p', { class: 'iv-waarde' },
        h('span', { class: 'iv-waarde-getal getal' }, toonGetal(e.waarde)),
        eenheid ? h('span', { class: `iv-waarde-eenheid${eenheid === '%' ? ' iv-waarde-procent' : ''}` }, eenheid) : null);
    }

    let tekstBlok = null;
    const vol = (e.tekst || '').replace(/^\s*\n/, '').trimEnd();
    if (vol.trim()) {
      const kort = uittreksel(vol);
      const tekstEl = h('p', { class: 'iv-tekst', id: `${p}-tekst` });
      let knop = null;
      const zet = (open) => {
        tekstEl.textContent = open || !kort ? vol : kort;
        if (!knop) return;
        knop.textContent = open ? 'Minder' : 'Lees meer';
        knop.setAttribute('aria-expanded', String(open));
        knop.setAttribute('aria-label', `${open ? 'Minder' : 'Lees meer'}: "${e.titel}"`);
      };
      if (kort) {
        knop = h('button', {
          type: 'button',
          class: 'knop knop-klein knop-licht iv-meer',
          'aria-controls': tekstEl.id,
          onclick: () => {
            const open = !openTeksten.has(e.id);
            if (open) openTeksten.add(e.id);
            else openTeksten.delete(e.id);
            zet(open);
          },
        });
      }
      zet(openTeksten.has(e.id));
      tekstBlok = h('div', { class: 'iv-tekstblok' }, tekstEl, knop);
    }

    // [P5] Interviews en observaties kun je coderen (Analyse · Open antwoorden). De "/" voor "?" is nodig, omdat de
    // adresverwerking in app.js geen zoekdeel kent; het scherm Coderen leest invoer= zelf uit het adres.
    const coderen = e.soort === 'interview' || e.soort === 'observatie'
      ? h('a', { class: 'knop knop-klein', href: `${basis}/analyse/coderen/?invoer=${e.id}`, 'aria-label': `Coderen: "${e.titel}"` }, 'Coderen')
      : null;
    const acties = ro ? (coderen ? h('div', { class: 'lijst-item-acties iv-acties' }, coderen) : null) : h('div', { class: 'lijst-item-acties iv-acties' },
      coderen,
      h('button', {
        type: 'button',
        class: 'knop knop-klein',
        'aria-label': `Wijzigen: "${e.titel}"`,
        onclick: () => wijzig(e),
      }, 'Wijzigen'),
      h('button', {
        type: 'button',
        class: 'knop knop-klein knop-licht iv-knop-gevaar',
        'aria-label': `Verwijderen: "${e.titel}"`,
        onclick: () => verwijder(e),
      }, 'Verwijderen'),
    );

    return h('li', { class: 'lijst-item iv-item', 'data-id': String(e.id) },
      h('div', { class: 'lijst-item-hoofd' },
        h('div', { class: 'rij iv-item-kop' }, soortLabel, h('span', { class: 'iv-datum' }, datum(e.datum))),
        h('h3', { class: 'lijst-item-titel iv-item-titel', id: `${p}-titel`, tabindex: '-1' }, e.titel),
        meta,
        waarde,
        tekstBlok,
      ),
      acties,
    );
  }

  // ---------- Toevoegen, wijzigen, verwijderen ----------

  async function nieuw() {
    if (!kanToevoegen) return;
    const r = await invoerDialoog();
    if (!r) return;
    meld('Invoer toegevoegd.', 'succes');
    if (!past(r.invoer)) {
      // Anders verdwijnt de nieuwe invoer meteen achter het filter.
      filter.soort = '';
      filter.thema = '';
      soortFilter.value = '';
      themaFilter.value = '';
    }
    await laad({ focusId: r.id, oplichten: r.id });
  }

  async function wijzig(e) {
    const r = await invoerDialoog(e);
    if (!r) return;
    meld('Wijzigingen opgeslagen.', 'succes');
    await laad({ focusId: r.id, oplichten: r.id });
  }

  async function verwijder(e) {
    const ok = await bevestig({
      titel: 'Invoer verwijderen?',
      tekst: [
        `"${e.titel}" wordt definitief verwijderd. Dit kun je niet ongedaan maken.`,
        e.soort === 'cijfer' ? 'Het cijfer verdwijnt dan ook van het Dashboard.' : null,
      ].filter(Boolean),
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    const index = alles.filter(past).findIndex((x) => x.id === e.id);
    try {
      await api.del(`/invoer/${e.id}`);
    } catch (err) {
      meldFout(err);
      return;
    }
    openTeksten.delete(e.id);
    meld('Invoer verwijderd.', 'succes');
    await laad({ focusIndex: Math.max(0, index) });
  }

  // ---------- Dialoog voor toevoegen en wijzigen ----------

  function invoerDialoog(e = null) {
    return new Promise((klaar) => {
      const p = `iv-dlg${++dialoogTeller}-`;
      const bewerken = !!e;
      let resultaat = null;
      let bezig = false;
      let vraagtAlOmSluiten = false;

      const startSoort = e ? e.soort : (filter.soort || voorkeur.soort || 'interview');
      let startThema = '';
      if (e) startThema = String(e.thema_id);
      else if (filter.thema) startThema = filter.thema;
      else if (voorkeur.thema) startThema = String(voorkeur.thema);
      else if (themas.length === 1) startThema = String(themas[0].id);

      // Velden
      const soortKeuze = h('select', { id: `${p}soort` },
        Object.entries(soorten).map(([w, l]) => h('option', { value: w, selected: w === startSoort }, l)));
      const themaKeuze = h('select', { id: `${p}thema` },
        startThema && themas.length === 1 ? null : h('option', { value: '' }, 'Kies een thema…'),
        themas.map((t) => h('option', { value: String(t.id), selected: String(t.id) === startThema }, t.naam)));
      const mpKeuze = h('select', { id: `${p}mp` });
      const mmKeuze = meetmomenten.length
        ? h('select', { id: `${p}mm` },
          h('option', { value: '' }, 'Geen meetmoment'),
          meetmomenten.map((m) => h('option', { value: String(m.id), selected: !!e && m.id === e.meetmoment_id }, meetmomentNaam(m))))
        : null;
      const datumVeld = h('input', { type: 'date', id: `${p}datum`, value: e ? e.datum : vandaag() });
      const titelVeld = h('input', { type: 'text', id: `${p}titel`, maxlength: 200, autocomplete: 'off', value: e ? e.titel : '' });
      const waardeVeld = h('input', {
        type: 'text', id: `${p}waarde`, inputmode: 'decimal', autocomplete: 'off', maxlength: 30, value: e ? getalAlsTekst(e.waarde) : '',
      });
      const eenheidVeld = h('input', {
        type: 'text', id: `${p}eenheid`, maxlength: 30, autocomplete: 'off', placeholder: 'Bijv. % of dagen', value: e ? (e.eenheid || '') : '',
      });
      const tekstVeld = h('textarea', { id: `${p}tekst`, rows: 6, maxlength: 100000 }, e ? (e.tekst || '') : '');

      // Hulpteksten die meeveranderen
      const soortHulp = h('div', { class: 'veld-hulp', id: `${p}soort-hulp` });
      const datumHulp = h('div', { class: 'veld-hulp', id: `${p}datum-hulp` });
      const mpHulp = h('div', { class: 'veld-hulp', id: `${p}mp-hulp` });
      const tekstHulp = h('div', { class: 'veld-hulp', id: `${p}tekst-hulp` });
      const tekstLabel = h('span', {}, 'Aantekeningen');

      const velden = {}; // naam → { el, foutEl }

      function veld(naam, label, el, { verplicht = false, hulp = null, klasse = '' } = {}) {
        const foutEl = h('div', { class: 'veld-fout', id: `${p}${naam}-fout` });
        velden[naam] = { el, foutEl };
        el.setAttribute('aria-describedby', [hulp ? hulp.id : null, foutEl.id].filter(Boolean).join(' '));
        return h('div', { class: `veld${klasse ? ` ${klasse}` : ''}` },
          h('label', { for: el.id }, label, verplicht ? h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *') : null),
          el,
          foutEl,
          hulp,
        );
      }

      function zetFout(naam, tekst) {
        const v = velden[naam];
        v.foutEl.textContent = tekst;
        v.el.setAttribute('aria-invalid', 'true');
      }

      function wisFout(naam) {
        const v = velden[naam];
        if (!v) return;
        v.foutEl.textContent = '';
        v.el.removeAttribute('aria-invalid');
      }

      const gekozenThema = () => themas.find((t) => String(t.id) === themaKeuze.value) || null;
      const gekozenMeetpunt = () => {
        const t = gekozenThema();
        return (t && (t.meetpunten || []).find((m) => String(m.id) === mpKeuze.value)) || null;
      };

      function vulMeetpunten(behoud) {
        const t = gekozenThema();
        const mps = (t && t.meetpunten) || [];
        vervang(mpKeuze,
          h('option', { value: '' }, !t ? 'Kies eerst een thema' : mps.length ? 'Geen meetpunt' : 'Geen meetpunten bij dit thema'),
          mps.map((m) => h('option', { value: String(m.id), selected: String(m.id) === String(behoud ?? '') },
            m.eenheid ? `${m.naam} (${m.eenheid})` : m.naam)));
        mpKeuze.disabled = !mps.length;
      }

      // Eenheid overnemen van het meetpunt, zolang de gebruiker die niet zelf heeft ingevuld.
      let eenheidAutomatisch = false;
      function vulEenheid() {
        if (soortKeuze.value !== 'cijfer') return;
        const mp = gekozenMeetpunt();
        const leegVeld = !eenheidVeld.value.trim();
        if (mp && mp.eenheid && (leegVeld || eenheidAutomatisch)) {
          eenheidVeld.value = mp.eenheid.slice(0, 30);
          eenheidAutomatisch = true;
        } else if ((!mp || !mp.eenheid) && eenheidAutomatisch) {
          eenheidVeld.value = '';
          eenheidAutomatisch = false;
        }
      }

      function werkHulpBij() {
        const s = soortKeuze.value;
        const t = gekozenThema();
        soortHulp.textContent = SOORT_UITLEG[s] || '';
        datumHulp.textContent = DATUM_HULP[s] || '';
        if (!t) {
          mpHulp.textContent = 'Optioneel. Kies eerst een thema; daarna zie je hier de meetpunten van dat thema.';
        } else if (!(t.meetpunten || []).length) {
          mpHulp.textContent = 'Dit thema heeft geen meetpunten. Die kun je toevoegen bij Opzet.';
        } else if (s === 'cijfer' && mpKeuze.value) {
          mpHulp.textContent = 'Op het Dashboard zie je alle cijfers van dit meetpunt samen door de tijd.';
        } else if (s === 'cijfer') {
          mpHulp.textContent = 'Kies het meetpunt waar dit cijfer bij hoort, bijvoorbeeld Verzuimpercentage. Dan zie je op het Dashboard al je cijfers van dat meetpunt samen door de tijd. Zonder meetpunt is elke titel een aparte reeks.';
        } else {
          mpHulp.textContent = 'Optioneel. Koppel de invoer aan een meetpunt als hij daar iets over zegt.';
        }
      }

      function werkSoortBij() {
        const s = soortKeuze.value;
        const cijfer = s === 'cijfer';
        cijferBlok.classList.toggle('verborgen', !cijfer);
        titelVeld.placeholder = TITEL_VOORBEELD[s] || '';
        tekstLabel.textContent = cijfer ? 'Toelichting' : 'Aantekeningen';
        const anoniem = s === 'interview' || s === 'observatie';
        tekstHulp.classList.toggle('iv-privacy', anoniem);
        vervang(tekstHulp, anoniem
          ? [h('strong', {}, 'Schrijf anoniem. '), 'Noem geen namen van medewerkers en niets waaraan iemand te herkennen is, zoals een functie die maar één persoon heeft.']
          : (TEKST_HULP[s] || ''));
        if (!cijfer) wisFout('waarde');
        werkHulpBij();
        vulEenheid();
      }

      const cijferBlok = h('div', { class: 'formulier-rij iv-cijfer' },
        veld('waarde', 'Waarde', waardeVeld, {
          verplicht: true,
          hulp: h('div', { class: 'veld-hulp', id: `${p}waarde-hulp` }, 'Alleen het getal, bijvoorbeeld 5,4.'),
        }),
        veld('eenheid', 'Eenheid', eenheidVeld, {
          hulp: h('div', { class: 'veld-hulp', id: `${p}eenheid-hulp` }, 'Optioneel. Bijvoorbeeld %, dagen of aantal.'),
        }),
      );

      const algemeneFout = h('div', { class: 'veld-fout iv-dlg-fout', role: 'alert' });
      const opslaanTekst = bewerken ? 'Opslaan' : 'Toevoegen';
      const opslaanKnop = h('button', { type: 'submit', class: 'knop knop-primair' }, opslaanTekst);
      const annuleerKnop = h('button', { type: 'button', class: 'knop', onclick: () => vraagSluiten() }, 'Annuleren');
      const titelId = `${p}titel-kop`;

      const d = h('dialog', { class: 'dialoog iv-dialoog', 'aria-labelledby': titelId },
        h('form', {
          method: 'dialog',
          novalidate: true,
          onsubmit: (ev) => {
            ev.preventDefault();
            verstuur();
          },
        },
        h('div', { class: 'dialoog-inhoud' },
          h('h2', { id: titelId }, bewerken ? 'Invoer wijzigen' : 'Invoer toevoegen'),
          h('p', { class: 'klein zacht iv-dlg-intro' }, 'Velden met een ', h('span', { class: 'verplicht-teken' }, '*'), ' zijn verplicht.'),
          h('div', { class: 'formulier-rij' },
            veld('soort', 'Soort', soortKeuze, { verplicht: true, hulp: soortHulp }),
            veld('datum', 'Datum', datumVeld, { verplicht: true, hulp: datumHulp }),
          ),
          veld('titel', 'Titel', titelVeld, {
            verplicht: true,
            hulp: h('div', { class: 'veld-hulp', id: `${p}titel-hulp` }, 'Een korte omschrijving, zodat je de invoer later terugvindt.'),
          }),
          h('div', { class: 'formulier-rij' },
            veld('thema', 'Thema', themaKeuze, { verplicht: true }),
            veld('meetpunt', 'Meetpunt', mpKeuze, { hulp: mpHulp }),
          ),
          cijferBlok,
          mmKeuze
            ? veld('meetmoment', 'Meetmoment', mmKeuze, {
              hulp: h('div', { class: 'veld-hulp', id: `${p}mm-hulp` }, 'Optioneel. Bij welke meting hoort dit, bijvoorbeeld de nulmeting?'),
            })
            : null,
          veld('tekst', tekstLabel, tekstVeld, { hulp: tekstHulp, klasse: 'iv-tekstveld' }),
          algemeneFout,
        ),
        h('div', { class: 'dialoog-voet' }, annuleerKnop, opslaanKnop),
        ),
      );

      vulMeetpunten(e ? e.meetpunt_id : null);
      werkSoortBij();
      // Bij wijzigen: een al ingevulde eenheid nooit automatisch vervangen.
      eenheidAutomatisch = false;

      soortKeuze.addEventListener('change', () => {
        wisFout('soort');
        werkSoortBij();
      });
      themaKeuze.addEventListener('change', () => {
        wisFout('thema');
        vulMeetpunten(null);
        werkHulpBij();
        vulEenheid();
      });
      mpKeuze.addEventListener('change', () => {
        werkHulpBij();
        vulEenheid();
      });
      eenheidVeld.addEventListener('input', () => {
        eenheidAutomatisch = false;
      });
      for (const [naam, el] of [['datum', datumVeld], ['titel', titelVeld], ['waarde', waardeVeld]]) {
        el.addEventListener('input', () => wisFout(naam));
        el.addEventListener('change', () => wisFout(naam));
      }

      const momentopname = () => JSON.stringify([
        soortKeuze.value, themaKeuze.value, mpKeuze.value, mmKeuze ? mmKeuze.value : '', datumVeld.value,
        titelVeld.value, waardeVeld.value, eenheidVeld.value, tekstVeld.value,
      ]);
      const begin = momentopname();
      const gewijzigd = () => momentopname() !== begin;

      function controleer() {
        const fouten = [];
        const s = soortKeuze.value;
        if (!soorten[s]) fouten.push(['soort', 'Kies een soort.']);
        const dt = datumVeld.value;
        if (!dt) {
          fouten.push(['datum', datumVeld.validity && datumVeld.validity.badInput
            ? 'Deze datum is niet compleet of bestaat niet. Vul dag, maand en jaar in.'
            : 'Vul een datum in.']);
        } else {
          const jaar = Number(dt.slice(0, 4));
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dt) || jaar < 1900 || jaar > 2200) fouten.push(['datum', 'Controleer de datum: het jaartal klopt niet.']);
        }
        if (!titelVeld.value.trim()) fouten.push(['titel', 'Geef de invoer een titel, zodat je hem later terugvindt.']);
        if (!themaKeuze.value) fouten.push(['thema', 'Kies bij welk thema dit hoort.']);
        let waarde = null;
        let eenheid = eenheidVeld.value.trim();
        if (s === 'cijfer') {
          let ruw = waardeVeld.value.trim();
          // "5,4%" → waarde 5,4 en eenheid %
          if (/\d\s*%$/.test(ruw)) {
            ruw = ruw.replace(/\s*%$/, '');
            waardeVeld.value = ruw;
            if (!eenheid) {
              eenheid = '%';
              eenheidVeld.value = '%';
            }
          }
          const g = leesGetal(ruw);
          if (g.leeg) fouten.push(['waarde', 'Vul bij een cijfer de waarde in, bijvoorbeeld 5,4.']);
          else if (g.fout) fouten.push(['waarde', 'Vul alleen een getal in, bijvoorbeeld 5,4 of 12. Zet de eenheid (zoals % of dagen) in het veld Eenheid.']);
          else waarde = g.waarde;
        }
        return { fouten, waarde, eenheid };
      }

      async function verstuur() {
        if (bezig) return;
        algemeneFout.textContent = '';
        for (const naam of Object.keys(velden)) wisFout(naam);
        const { fouten, waarde, eenheid } = controleer();
        if (fouten.length) {
          for (const [naam, tekst] of fouten) zetFout(naam, tekst);
          velden[fouten[0][0]].el.focus();
          return;
        }
        const cijfer = soortKeuze.value === 'cijfer';
        const body = {
          soort: soortKeuze.value,
          thema_id: Number(themaKeuze.value),
          meetpunt_id: mpKeuze.value ? Number(mpKeuze.value) : null,
          meetmoment_id: mmKeuze && mmKeuze.value ? Number(mmKeuze.value) : null,
          datum: datumVeld.value,
          titel: titelVeld.value.trim(),
          tekst: tekstVeld.value.trimEnd(),
          waarde: cijfer ? waarde : null,
          eenheid: cijfer ? eenheid : '',
        };
        bezig = true;
        opslaanKnop.disabled = true;
        annuleerKnop.disabled = true;
        opslaanKnop.textContent = 'Bezig met opslaan…';
        let id = e ? e.id : null;
        try {
          if (bewerken) await api.put(`/invoer/${e.id}`, body);
          else id = (await api.post(`/onderzoeken/${onderzoekId}/invoer`, body)).id;
        } catch (err) {
          bezig = false;
          opslaanKnop.disabled = false;
          annuleerKnop.disabled = false;
          opslaanKnop.textContent = opslaanTekst;
          algemeneFout.textContent = err.status === 401
            ? 'Je sessie was verlopen, daardoor is dit nog niet opgeslagen. Log opnieuw in via het venster dat verschijnt en klik daarna nog een keer op opslaan. Wat je hebt ingevuld blijft staan.'
            : `Niet opgeslagen: ${err.message || 'er ging iets mis.'} Probeer het opnieuw.`;
          algemeneFout.scrollIntoView({ block: 'nearest' });
          return;
        }
        voorkeur.soort = body.soort;
        voorkeur.thema = body.thema_id;
        resultaat = { id, invoer: body };
        d.close();
      }

      async function vraagSluiten() {
        if (bezig || vraagtAlOmSluiten) return;
        if (!gewijzigd()) {
          d.close();
          return;
        }
        vraagtAlOmSluiten = true;
        const ok = await bevestig({
          titel: 'Stoppen zonder opslaan?',
          tekst: 'Je hebt iets ingevuld of gewijzigd dat nog niet is opgeslagen. Als je stopt, ben je dat kwijt.',
          knop: 'Stoppen zonder opslaan',
          gevaar: true,
        });
        vraagtAlOmSluiten = false;
        if (ok && d.open) d.close();
      }

      // Escape en de terugknop (Android) sluiten de dialoog niet zomaar: eerst vragen als er iets is gewijzigd.
      d.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        vraagSluiten();
      });
      d.addEventListener('cancel', (ev) => {
        ev.preventDefault();
        vraagSluiten();
      });

      const bijVerlaten = (ev) => {
        if (!gewijzigd()) return;
        ev.preventDefault();
        ev.returnValue = '';
      };
      window.addEventListener('beforeunload', bijVerlaten);

      d.addEventListener('close', () => {
        openDialoog = null;
        window.removeEventListener('beforeunload', bijVerlaten);
        setTimeout(() => d.remove(), 0);
        klaar(resultaat);
      });

      document.body.append(d);
      openDialoog = d;
      d.showModal();
      d.querySelector('.dialoog-inhoud').scrollTop = 0;
      (bewerken ? titelVeld : soortKeuze).focus();
    });
  }

  // Bij het verlaten van het scherm (bijv. met de terugknop) een open dialoog opruimen.
  ctx.bijVertrek(() => {
    if (openDialoog && openDialoog.open) openDialoog.close();
  });

  // ---------- Pagina opbouwen ----------

  const geenThemas = !themas.length && !ro
    ? melding([
      h('p', {}, h('strong', {}, "Dit onderzoek heeft nog geen thema's. "),
        'Alles wat je hier vastlegt, hoort bij een thema (bijvoorbeeld Werkdruk of Verzuim), zodat je het later terugvindt bij de juiste resultaten. Voeg daarom eerst thema\'s toe.'),
      h('p', {}, h('a', { href: `${basis}/opzet` }, "Thema's toevoegen bij Opzet")),
    ], 'waarschuwing')
    : null;

  vervang(container,
    h('section', { class: 'kaart iv-scherm', 'aria-labelledby': 'iv-kop' },
      h('div', { class: 'kaart-kop' }, h('div', {}, kopTitel, tellerEl)),
      h('div', { class: 'iv-uitleg' },
        h('p', {}, ro
          ? 'Hier staat wat er buiten de vragenlijst om is vastgelegd: interviews, observaties, cijfers zoals verzuim of verloop, en documentanalyse.'
          : 'Leg hier vast wat je buiten de vragenlijst om te weten komt: interviews, je eigen observaties, cijfers zoals verzuim of verloop, en wat je uit documenten haalt. Zo staat alles per thema bij elkaar.'),
        h('p', { class: 'klein zacht' }, 'Cijfers (soort "Cijfer" met een waarde) verschijnen op het ',
          h('a', { href: `${basis}/dashboard/resultaten` }, 'Dashboard'), ' onder "Eigen cijfers", per meetpunt door de tijd.'),
      ),
      geenThemas,
      balk,
      statusEl,
      lijstEl,
    ),
    // Gegevens die al in Excel staan, hoef je niet over te typen.
    inleesKaart(ctx, { naInlezen: (soort) => { if (soort === 'cijfers') laad(); } }),
  );
  await laad();
}
