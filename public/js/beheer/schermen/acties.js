// Scherm: Acties – eenvoudige actielijst met status en datum.
// Dit scherm dient ook als voorbeeld voor de opbouw van de andere schermen.

import { api } from '../api.js';
import { h, vervang, leeg, laden, meld, meldFout, bevestig, formulierDialoog, datum, vandaag, aantal } from '../ui.js';

const STATUS_KLASSE = { te_doen: '', bezig: 'label-primair', klaar: 'label-succes' };

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const statussen = ctx.instellingen.actiestatussen; // { te_doen: 'Te doen', bezig: 'Bezig', klaar: 'Klaar' }
  ctx.zetTitel(`Acties – ${ctx.onderzoek.onderzoek.titel}`);

  let filter = 'open'; // 'open' = te doen + bezig, 'alle'
  const lijstEl = h('div', {}, laden());
  const tellerEl = h('p', { class: 'zacht klein' });

  async function laad() {
    try {
      const { acties } = await api.get(`/onderzoeken/${onderzoekId}/acties`);
      teken(acties);
    } catch (e) {
      meldFout(e);
    }
  }

  function formulier(actie = null) {
    return formulierDialoog({
      titel: actie ? 'Actie wijzigen' : 'Nieuwe actie',
      knop: actie ? 'Opslaan' : 'Toevoegen',
      velden: [
        { naam: 'titel', label: 'Wat moet er gebeuren?', verplicht: true, max: 300, waarde: actie?.titel },
        {
          naam: 'status',
          label: 'Status',
          type: 'select',
          waarde: actie?.status || 'te_doen',
          opties: Object.entries(statussen).map(([waarde, label]) => ({ waarde, label })),
        },
        { naam: 'datum', label: 'Datum (deadline)', type: 'date', waarde: actie?.datum || '' },
        { naam: 'notitie', label: 'Notitie', type: 'textarea', rijen: 3, max: 5000, waarde: actie?.notitie },
      ],
      opslaan: async (w) => {
        if (actie) await api.put(`/acties/${actie.id}`, w);
        else await api.post(`/onderzoeken/${onderzoekId}/acties`, w);
      },
    });
  }

  async function wisselStatus(actie, status) {
    try {
      await api.put(`/acties/${actie.id}`, { ...actie, status });
      laad();
    } catch (e) {
      meldFout(e);
    }
  }

  function teken(acties) {
    const open = acties.filter((a) => a.status !== 'klaar');
    const zichtbaar = filter === 'open' ? open : acties;
    tellerEl.textContent = `${aantal(open.length, 'openstaande actie', 'openstaande acties')} · ${aantal(acties.length - open.length, 'afgerond', 'afgerond')}`;

    if (!zichtbaar.length) {
      vervang(lijstEl, leeg(
        acties.length ? 'Alle acties zijn afgerond.' : 'Er staan nog geen acties op de lijst.',
        ctx.alleenLezen ? null : h('button', { class: 'knop knop-primair', onclick: nieuw }, 'Actie toevoegen'),
      ));
      return;
    }

    const items = zichtbaar.map((a) => {
      const telaat = a.status !== 'klaar' && a.datum && a.datum < vandaag();
      const statusKeuze = h('select', {
        'aria-label': `Status van "${a.titel}"`,
        disabled: ctx.alleenLezen,
        onchange: (e) => wisselStatus(a, e.target.value),
      }, Object.entries(statussen).map(([waarde, label]) => h('option', { value: waarde, selected: a.status === waarde }, label)));
      statusKeuze.style.width = 'auto';

      return h('li', { class: 'lijst-item' },
        h('div', { class: 'lijst-item-hoofd' },
          h('div', { class: 'lijst-item-titel' }, a.titel),
          h('div', { class: 'lijst-item-meta rij' },
            h('span', { class: `label ${STATUS_KLASSE[a.status]}` }, statussen[a.status]),
            a.datum ? h('span', { class: telaat ? 'label label-gevaar' : '' }, `${telaat ? 'Te laat: ' : ''}${datum(a.datum)}`) : null,
          ),
          a.notitie ? h('p', { class: 'klein zacht' }, a.notitie) : null,
        ),
        ctx.alleenLezen ? null : h('div', { class: 'lijst-item-acties' },
          statusKeuze,
          h('button', { class: 'knop knop-klein', 'aria-label': `Wijzigen: "${a.titel}"`, onclick: async () => { if (await formulier(a)) laad(); } }, 'Wijzigen'),
          h('button', {
            class: 'knop knop-klein knop-licht',
            'aria-label': `Verwijderen: "${a.titel}"`,
            onclick: async () => {
              if (!(await bevestig({ titel: 'Actie verwijderen?', tekst: `"${a.titel}" wordt verwijderd.`, knop: 'Verwijderen', gevaar: true }))) return;
              try {
                await api.del(`/acties/${a.id}`);
                meld('Actie verwijderd.');
                laad();
              } catch (e) {
                meldFout(e);
              }
            },
          }, 'Verwijderen'),
        ),
      );
    });
    vervang(lijstEl, h('ul', { class: 'lijst' }, items));
  }

  async function nieuw() {
    if (await formulier()) {
      meld('Actie toegevoegd.', 'succes');
      laad();
    }
  }

  const filterKeuze = h('select', {
    'aria-label': 'Welke acties tonen',
    onchange: (e) => {
      filter = e.target.value;
      laad();
    },
  }, h('option', { value: 'open' }, 'Openstaande acties'), h('option', { value: 'alle' }, 'Alle acties'));
  filterKeuze.style.width = 'auto';

  vervang(container,
    h('section', { class: 'kaart' },
      h('div', { class: 'kaart-kop' },
        h('div', {}, h('h2', {}, 'Actielijst'), tellerEl),
        h('div', { class: 'knoppen' },
          filterKeuze,
          ctx.alleenLezen ? null : h('button', { class: 'knop knop-primair', onclick: nieuw }, '+ Actie toevoegen'),
        ),
      ),
      lijstEl,
    ),
  );
  await laad();
}
