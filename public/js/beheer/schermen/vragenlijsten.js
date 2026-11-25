// Scherm: Vragenlijsten – overzicht van alle vragenlijsten van een onderzoek, per meetmoment.
// Per vragenlijst: bewerken, link kopiëren, openzetten/sluiten, kopie voor een volgend meetmoment en verwijderen.

import { api } from '../api.js';
import {
  h, vervang, leeg, laden, melding, meld, meldFout, bevestig, formulierDialoog,
  datum, aantal, procent, kopieer, statusLabel, vragenlijstLink,
} from '../ui.js';

/** 'Nulmeting (25 nov. 2026)' of 'Nulmeting'. */
function meetmomentNaam(naam, dag) {
  return dag ? `${naam} (${datum(dag)})` : naam;
}

/** Keuzelijst-opties voor een meetmoment: eerst "Geen meetmoment", dan alle meetmomenten. */
function meetmomentOpties(meetmomenten) {
  return [
    { waarde: '', label: 'Geen meetmoment' },
    ...meetmomenten.map((mm) => ({ waarde: String(mm.id), label: meetmomentNaam(mm.naam, mm.datum) })),
  ];
}

/** Laat zien dat kopiëren niet lukte, met de link in een veld om zelf te kopiëren. */
async function toonLinkHandmatig(link) {
  const veld = h('input', { type: 'text', readonly: true, value: link, 'aria-label': 'Link naar de vragenlijst' });
  veld.addEventListener('focus', () => veld.select());
  await bevestig({
    titel: 'Kopieer de link zelf',
    tekst: [
      h('p', {}, 'Het automatisch kopiëren lukte niet. Selecteer de link hieronder en kopieer hem zelf (Ctrl+C, of lang indrukken op een telefoon).'),
      veld,
    ],
    knop: 'Klaar',
  });
}

/** Kopieert de link van een vragenlijst en meldt het resultaat. */
export async function kopieerLink(vl) {
  const link = vragenlijstLink(vl.code);
  if (!(await kopieer(link))) {
    await toonLinkHandmatig(link);
    return;
  }
  if (vl.status === 'open') {
    meld('Link gekopieerd. Je kunt hem nu plakken in een e-mail of bericht aan de respondenten.', 'succes');
  } else {
    meld('Link gekopieerd. Let op: deze vragenlijst is nog gesloten. Respondenten zien de melding "gesloten" tot je hem openzet.');
  }
}

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const basis = `#/onderzoek/${onderzoekId}`;
  const meetmomenten = ctx.onderzoek.meetmomenten || [];
  ctx.zetTitel(`Vragenlijsten – ${ctx.onderzoek.onderzoek.titel}`);

  const lijstEl = h('div', { class: 'vl-overzicht-lijst' }, laden());
  const tellerEl = h('p', { class: 'zacht klein vl-onderkop' });
  const aankondiging = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  let vragenlijsten = [];
  let bezig = false;

  async function laad({ markeer = null, focus = null } = {}) {
    try {
      ({ vragenlijsten } = await api.get(`/onderzoeken/${onderzoekId}/vragenlijsten`));
    } catch (e) {
      meldFout(e);
      if (!vragenlijsten.length) vervang(lijstEl, melding('De vragenlijsten konden niet worden geladen. Probeer het opnieuw.', 'gevaar'));
      return;
    }
    teken();
    if (markeer) {
      const el = lijstEl.querySelector(`[data-vl="${markeer}"]`);
      if (el) {
        el.classList.add('vl-oplichten');
        el.scrollIntoView({ block: 'nearest' });
      }
    }
    if (focus) {
      const el = lijstEl.querySelector(focus);
      if (el) el.focus();
    }
  }

  // ---------- Acties ----------

  async function nieuw() {
    const zonder = meetmomenten.find((mm) => !vragenlijsten.some((vl) => vl.meetmoment_id === mm.id));
    const standaardMm = zonder || meetmomenten[0];
    let nieuwId = null;
    const r = await formulierDialoog({
      titel: 'Nieuwe vragenlijst',
      knop: 'Maken en vragen toevoegen',
      intro: 'Geef de vragenlijst een naam. Daarna voeg je de vragen toe. Een nieuwe vragenlijst staat eerst gesloten: respondenten kunnen pas invullen als jij hem openzet.',
      velden: [
        {
          naam: 'titel',
          label: 'Titel',
          verplicht: true,
          max: 200,
          placeholder: 'Bijvoorbeeld: Medewerkersonderzoek voorjaar',
          hulp: 'Respondenten zien deze titel bovenaan de vragenlijst.',
        },
        {
          naam: 'meetmoment_id',
          label: 'Meetmoment',
          type: 'select',
          waarde: standaardMm ? String(standaardMm.id) : '',
          opties: meetmomentOpties(meetmomenten),
          hulp: meetmomenten.length
            ? 'Bij welke meting hoort deze vragenlijst? Zo kun je op het dashboard metingen met elkaar vergelijken.'
            : 'Dit onderzoek heeft nog geen meetmomenten. Die kun je later toevoegen bij Opzet.',
        },
      ],
      opslaan: async (w) => {
        const res = await api.post(`/onderzoeken/${onderzoekId}/vragenlijsten`, {
          titel: w.titel,
          meetmoment_id: w.meetmoment_id ? Number(w.meetmoment_id) : null,
        });
        nieuwId = res.id;
      },
    });
    if (r && nieuwId) {
      meld('Vragenlijst gemaakt. Voeg nu de vragen toe.', 'succes');
      ctx.navigeer(`${basis}/vragenlijsten/${nieuwId}`);
    }
  }

  async function wisselStatus(vl) {
    if (bezig) return;
    const nieuweStatus = vl.status === 'open' ? 'gesloten' : 'open';
    if (nieuweStatus === 'gesloten') {
      const ok = await bevestig({
        titel: 'Vragenlijst sluiten?',
        tekst: [
          `Respondenten kunnen "${vl.titel}" daarna niet meer invullen; ze zien dan de melding dat de vragenlijst gesloten is.`,
          'Antwoorden die al binnen zijn, blijven bewaard. Je kunt de vragenlijst later weer openzetten.',
        ],
        knop: 'Sluiten',
      });
      if (!ok) return;
    }
    bezig = true;
    try {
      await api.post(`/vragenlijsten/${vl.id}/status`, { status: nieuweStatus });
      meld(nieuweStatus === 'open'
        ? `"${vl.titel}" staat open. Respondenten kunnen hem nu invullen via de link.`
        : `"${vl.titel}" is gesloten.`, 'succes');
      await laad({ focus: `[data-focus="status-${vl.id}"]` });
    } catch (e) {
      meldFout(e);
    } finally {
      bezig = false;
    }
  }

  async function kopie(vl) {
    // Standaard: een ander meetmoment, bij voorkeur een zonder vragenlijst, anders het volgende in de lijst.
    const i = meetmomenten.findIndex((mm) => mm.id === vl.meetmoment_id);
    const anderen = meetmomenten.filter((mm) => mm.id !== vl.meetmoment_id);
    const volgend = anderen.find((mm) => !vragenlijsten.some((x) => x.meetmoment_id === mm.id))
      || (i >= 0 ? meetmomenten[i + 1] : null)
      || anderen[0]
      || meetmomenten[i]
      || null;
    let nieuwId = null;
    const r = await formulierDialoog({
      titel: 'Kopie voor volgend meetmoment',
      knop: 'Kopie maken',
      intro: 'Er komt een nieuwe vragenlijst met dezelfde vragen, uitleg en bedanktekst. De vragen blijven aan de oorspronkelijke vragen gekoppeld, zodat je op het dashboard de uitkomsten van beide metingen kunt vergelijken. Antwoorden worden niet meegekopieerd en de kopie krijgt een eigen link. De kopie staat eerst gesloten.',
      velden: [
        {
          naam: 'titel',
          label: 'Titel van de kopie',
          verplicht: true,
          max: 200,
          waarde: vl.titel,
          hulp: 'Respondenten zien deze titel bovenaan de vragenlijst.',
        },
        {
          naam: 'meetmoment_id',
          label: 'Meetmoment',
          type: 'select',
          waarde: volgend ? String(volgend.id) : '',
          opties: meetmomentOpties(meetmomenten),
          hulp: meetmomenten.length > 1
            ? 'Kies de meting waarvoor je de kopie gebruikt, bijvoorbeeld de vervolgmeting.'
            : 'Staat het volgende meetmoment er nog niet tussen? Voeg het dan eerst toe bij Opzet. Je kunt het meetmoment later ook nog bij de instellingen van de kopie kiezen.',
        },
      ],
      opslaan: async (w) => {
        const res = await api.post(`/vragenlijsten/${vl.id}/kopie`, {
          titel: w.titel,
          meetmoment_id: w.meetmoment_id ? Number(w.meetmoment_id) : null,
        });
        nieuwId = res.id;
      },
    });
    if (r && nieuwId) {
      meld('Kopie gemaakt. Hij staat nog gesloten; zet hem open als de meting begint.', 'succes');
      await laad({ markeer: nieuwId });
      aankondiging.textContent = `Kopie "${r.titel}" is toegevoegd aan de lijst.`;
    }
  }

  /** Tweede, sterkere bevestiging als er al antwoorden zijn. */
  function bevestigMetAntwoorden(n) {
    return bevestig({
      titel: 'Ook alle antwoorden verwijderen?',
      tekst: [
        h('p', {}, h('strong', {}, `Deze vragenlijst is al ${aantal(n, 'keer', 'keer')} ingevuld.`)),
        'Als je hem verwijdert, worden al die antwoorden ook definitief gewist. Ze verdwijnen van het dashboard en uit de exports. Dit kun je niet ongedaan maken.',
        'Wil je de antwoorden bewaren? Sluit de vragenlijst dan alleen in plaats van hem te verwijderen.',
      ],
      knop: 'Definitief verwijderen',
      gevaar: true,
      typTekst: 'VERWIJDEREN',
    });
  }

  async function verwijder(vl) {
    const bekend = vl.aantal_inzendingen || 0;
    const ok = await bevestig({
      titel: 'Vragenlijst verwijderen?',
      tekst: [
        `"${vl.titel}" wordt verwijderd, met alle ${aantal(vl.aantal_vragen, 'vraag', 'vragen')}. De link werkt daarna niet meer.`,
        bekend ? `Let op: deze vragenlijst is al ${aantal(bekend, 'keer', 'keer')} ingevuld.` : null,
      ].filter(Boolean),
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    try {
      if (bekend) {
        // Er zijn al antwoorden: meteen de sterkere bevestiging vragen.
        if (!(await bevestigMetAntwoorden(bekend))) return;
        await api.del(`/vragenlijsten/${vl.id}?bevestig=1`);
      } else {
        await api.del(`/vragenlijsten/${vl.id}`);
      }
    } catch (e) {
      // Intussen toch ingevuld (de lijst was niet meer actueel): de server vraagt om bevestiging.
      if (e.status === 409 && e.data && e.data.aantal_inzendingen && !bekend) {
        if (!(await bevestigMetAntwoorden(e.data.aantal_inzendingen))) {
          await laad();
          return;
        }
        try {
          await api.del(`/vragenlijsten/${vl.id}?bevestig=1`);
        } catch (e2) {
          meldFout(e2);
          return;
        }
      } else {
        meldFout(e);
        return;
      }
    }
    meld(`"${vl.titel}" is verwijderd.`);
    await laad();
    const kop = container.querySelector('#vl-overzicht-kop');
    if (kop) kop.focus();
  }

  // ---------- Tekenen ----------

  function vragenlijstItem(vl) {
    const ingevuld = vl.aantal_inzendingen || 0;
    const maxBereikt = vl.max_inzendingen && ingevuld >= vl.max_inzendingen;
    const metaDelen = [
      h('span', {}, aantal(vl.aantal_vragen, 'vraag', 'vragen')),
      h('span', {}, `${ingevuld.toLocaleString('nl-NL')} keer ingevuld`),
      vl.aantal_uitgenodigd
        ? h('span', {}, `${procent((ingevuld / vl.aantal_uitgenodigd) * 100)} respons`,
          h('span', { class: 'zacht' }, ` (van ${vl.aantal_uitgenodigd.toLocaleString('nl-NL')} uitgenodigd)`))
        : null,
    ].filter(Boolean);
    const meta = [];
    metaDelen.forEach((d, i) => {
      if (i) meta.push(h('span', { class: 'vl-scheiding', 'aria-hidden': 'true' }, '·'));
      meta.push(d);
    });

    const editor = `${basis}/vragenlijsten/${vl.id}`;
    const knoppen = [
      h('a', { class: 'knop knop-klein', href: editor, 'aria-label': `${ctx.alleenLezen ? 'Bekijk' : 'Bewerk'} "${vl.titel}"` },
        ctx.alleenLezen ? 'Bekijken' : 'Bewerken'),
    ];
    if (!ctx.alleenLezen) {
      knoppen.push(
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          'aria-label': `Link van "${vl.titel}" kopiëren`,
          onclick: () => kopieerLink(vl),
        }, 'Link kopiëren'),
        h('button', {
          type: 'button',
          class: `knop knop-klein${vl.status === 'open' || !vl.aantal_vragen ? '' : ' knop-primair'}`,
          'data-focus': `status-${vl.id}`,
          'aria-label': vl.status === 'open' ? `"${vl.titel}" sluiten` : `"${vl.titel}" openzetten`,
          onclick: () => wisselStatus(vl),
        }, vl.status === 'open' ? 'Sluiten' : 'Openzetten'),
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          'aria-label': `Kopie van "${vl.titel}" maken voor een volgend meetmoment`,
          onclick: () => kopie(vl),
        }, 'Kopie voor volgend meetmoment'),
        h('button', {
          type: 'button',
          class: 'knop knop-klein knop-licht vl-knop-gevaar',
          'aria-label': `"${vl.titel}" verwijderen`,
          onclick: () => verwijder(vl),
        }, 'Verwijderen'),
      );
    }

    return h('li', { class: 'lijst-item vl-item', 'data-vl': String(vl.id) },
      h('div', { class: 'lijst-item-hoofd' },
        h('div', { class: 'vl-item-kop' },
          h('a', { class: 'lijst-item-titel vl-item-titel', href: editor }, vl.titel),
          statusLabel(vl.status),
          maxBereikt ? h('span', { class: 'label label-waarschuwing' }, 'Maximum bereikt') : null,
        ),
        h('div', { class: 'lijst-item-meta vl-item-meta' }, meta),
        !vl.aantal_vragen && !ctx.alleenLezen
          ? h('p', { class: 'klein zacht vl-item-hint' }, 'Nog geen vragen. Kies Bewerken om vragen toe te voegen; daarna kun je de vragenlijst openzetten.')
          : null,
      ),
      h('div', { class: 'lijst-item-acties vl-item-acties' }, knoppen),
    );
  }

  function teken() {
    const open = vragenlijsten.filter((vl) => vl.status === 'open').length;
    const ingevuld = vragenlijsten.reduce((n, vl) => n + (vl.aantal_inzendingen || 0), 0);
    tellerEl.textContent = vragenlijsten.length
      ? `${aantal(vragenlijsten.length, 'vragenlijst', 'vragenlijsten')} · ${open} open · ${ingevuld.toLocaleString('nl-NL')} keer ingevuld in totaal`
      : 'Een vragenlijst deel je via een link met respondenten. De antwoorden zijn anoniem.';

    if (!vragenlijsten.length) {
      vervang(lijstEl, leeg(
        ctx.alleenLezen
          ? 'Dit onderzoek heeft geen vragenlijsten.'
          : 'Er zijn nog geen vragenlijsten. Maak er een en voeg vragen toe; als hij klaar is, zet je hem open en deel je de link.',
        ctx.alleenLezen ? null : h('button', { type: 'button', class: 'knop knop-primair', onclick: nieuw }, 'Vragenlijst maken'),
      ));
      return;
    }

    // Groeperen per meetmoment, in de volgorde van de server; "Zonder meetmoment" altijd als laatste.
    const groepen = new Map();
    for (const vl of vragenlijsten) {
      const sleutel = vl.meetmoment_id || 'geen';
      if (!groepen.has(sleutel)) {
        groepen.set(sleutel, {
          naam: vl.meetmoment_id ? meetmomentNaam(vl.meetmoment_naam, vl.meetmoment_datum) : 'Zonder meetmoment',
          items: [],
        });
      }
      groepen.get(sleutel).items.push(vl);
    }
    const volgorde = [...groepen.keys()].filter((k) => k !== 'geen');
    const leegMm = meetmomenten.filter((mm) => !groepen.has(mm.id));
    if (groepen.has('geen')) volgorde.push('geen');

    const blokken = volgorde.map((sleutel) => {
      const g = groepen.get(sleutel);
      return h('section', { class: 'vl-groep', 'aria-label': g.naam },
        h('h3', { class: 'vl-groep-kop' },
          h('span', {}, g.naam),
          h('span', { class: 'vl-groep-aantal' }, aantal(g.items.length, 'vragenlijst', 'vragenlijsten'))),
        sleutel === 'geen' && meetmomenten.length && !ctx.alleenLezen
          ? h('p', { class: 'klein zacht vl-groep-uitleg' }, 'Koppel een vragenlijst aan een meetmoment (via Bewerken › Instellingen) om metingen op het dashboard te kunnen vergelijken.')
          : null,
        h('ul', { class: 'lijst' }, g.items.map(vragenlijstItem)),
      );
    });

    if (leegMm.length && !ctx.alleenLezen) {
      blokken.push(h('div', { class: 'vl-leeg-mm' },
        h('p', { class: 'klein' },
          h('strong', {}, `Nog geen vragenlijst voor: ${leegMm.map((mm) => meetmomentNaam(mm.naam, mm.datum)).join(', ')}.`),
          ' Wil je dezelfde vragen opnieuw stellen? Kies dan bij een bestaande vragenlijst "Kopie voor volgend meetmoment"; dan kun je de uitkomsten vergelijken.'),
      ));
    }
    vervang(lijstEl, blokken);
  }

  vervang(container,
    h('section', { class: 'kaart vl-scherm', 'aria-labelledby': 'vl-overzicht-kop' },
      h('div', { class: 'kaart-kop' },
        h('div', {}, h('h2', { id: 'vl-overzicht-kop', tabindex: '-1' }, 'Vragenlijsten'), tellerEl),
        ctx.alleenLezen ? null : h('div', { class: 'knoppen' },
          h('button', { type: 'button', class: 'knop knop-primair', onclick: nieuw }, '+ Nieuwe vragenlijst')),
      ),
      lijstEl,
      aankondiging,
    ),
  );
  await laad();
}
