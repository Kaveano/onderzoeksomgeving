// Scherm: Rapport – overzicht van de rapporten van een onderzoek en het maken van een nieuw rapport.
// Het schrijven zelf gebeurt in rapport-bewerken.js.

import { api } from '../api.js';
import { h, vervang, leeg, laden, melding, meld, meldFout, bevestig, formulierDialoog, datum, tabSubnav } from '../ui.js';
import { RAPPORTSOORTEN, standaardInhoud } from '../rapport-feiten.js';
import { wanneer } from './stukken.js';

const UITLEG = {
  tussen: 'Halverwege het onderzoek: de stand van zaken, voorlopige resultaten, het vervolg en vragen aan de opdrachtgever.',
  eind: 'Het adviesrapport als kleine scriptie: aanleiding, aanpak, resultaten, conclusies en aanbevelingen, met bijlagen.',
};

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const o = ctx.onderzoek.onderzoek;
  const basis = `#/onderzoek/${onderzoekId}/rapport`;
  ctx.zetTitel(`Rapport – ${o.titel}`);

  const lijstEl = h('div', {}, laden('De rapporten worden geladen…'));

  async function maak(soort) {
    const naam = RAPPORTSOORTEN[soort];
    const w = await formulierDialoog({
      titel: `${naam} maken`,
      knop: 'Rapport maken',
      intro: 'Het rapport krijgt een vaste opbouw met hoofdstukken. De cijfers en tabellen worden uit je onderzoek gehaald; de tekst schrijf je zelf. Alles is daarna nog aan te passen.',
      velden: [
        { naam: 'titel', label: 'Titel van het rapport', verplicht: true, max: 200, waarde: `${naam} ${o.titel}` },
        { naam: 'opdrachtgever', label: 'Opdrachtgever', max: 200, waarde: o.bedrijfsnaam, hulp: 'Voor wie is het rapport? Dit komt op het voorblad.' },
        { naam: 'opsteller', label: 'Opgesteld door', max: 200, hulp: 'Je naam en eventueel je organisatie, voor op het voorblad.' },
      ],
      opslaan: async (waarden) => {
        const inhoud = standaardInhoud(soort);
        inhoud.opdrachtgever = waarden.opdrachtgever;
        inhoud.opsteller = waarden.opsteller;
        const d = new Date();
        inhoud.datum = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const r = await api.post(`/onderzoeken/${onderzoekId}/rapporten`, { soort, titel: waarden.titel, inhoud });
        waarden.id = r.id;
      },
    });
    if (w && w.id) ctx.navigeer(`${basis}/${w.id}`);
  }

  function teken(rapporten) {
    if (!rapporten.length) {
      vervang(lijstEl, leeg(ctx.alleenLezen
        ? 'Bij dit onderzoek zijn geen rapporten gemaakt.'
        : 'Je hebt nog geen rapport gemaakt. Kies hierboven een tussenrapport of een eindrapport om te beginnen.'));
      return;
    }
    vervang(lijstEl, h('ul', { class: 'lijst' }, rapporten.map((r) => h('li', { class: 'lijst-item' },
      h('div', { class: 'lijst-item-hoofd' },
        h('a', { class: 'lijst-item-titel rp-lijst-titel', href: `${basis}/${r.id}` }, r.titel),
        h('div', { class: 'lijst-item-meta rij' },
          h('span', { class: `label ${r.soort === 'eind' ? 'label-primair' : ''}` }, RAPPORTSOORTEN[r.soort] || 'Rapport'),
          h('span', {}, `bewerkt ${wanneer(r.bijgewerkt_op)}`),
          r.peildatum ? h('span', {}, `cijfers van ${datum(r.peildatum)}`) : null)),
      h('div', { class: 'lijst-item-acties' },
        h('a', { class: 'knop knop-klein knop-primair', href: `${basis}/${r.id}` }, ctx.alleenLezen ? 'Bekijken' : 'Openen', h('span', { class: 'sr-only' }, `: ${r.titel}`)),
        ctx.alleenLezen ? null : h('button', {
          type: 'button',
          class: 'knop knop-klein knop-licht',
          onclick: async () => {
            if (!(await bevestig({ titel: 'Rapport verwijderen?', tekst: `"${r.titel}" wordt verwijderd, met alle tekst die je erin hebt geschreven. Dit kan niet ongedaan worden gemaakt.`, knop: 'Verwijderen', gevaar: true, typTekst: 'verwijder' }))) return;
            try {
              await api.del(`/rapporten/${r.id}`);
              meld('Rapport verwijderd.');
              laad();
            } catch (e) {
              meldFout(e);
            }
          },
        }, 'Verwijderen', h('span', { class: 'sr-only' }, `: ${r.titel}`)))))));
  }

  async function laad() {
    try {
      const { rapporten } = await api.get(`/onderzoeken/${onderzoekId}/rapporten`);
      teken(rapporten || []);
    } catch (e) {
      vervang(lijstEl, melding([h('strong', {}, 'De rapporten konden niet worden geladen. '), e.message || ''], 'gevaar'));
    }
  }

  const keuze = (soort) => h('div', { class: 'rp-keuze' },
    h('h3', {}, RAPPORTSOORTEN[soort]),
    h('p', { class: 'zacht' }, UITLEG[soort]),
    h('button', { type: 'button', class: 'knop knop-primair', onclick: () => maak(soort) }, `${RAPPORTSOORTEN[soort]} maken`));

  vervang(container,
    tabSubnav('rapport', onderzoekId, ''),
    h('section', { class: 'kaart', 'aria-labelledby': 'rp-kop-nieuw' },
      h('div', { class: 'kaart-kop' }, h('h2', { id: 'rp-kop-nieuw' }, 'Rapport maken')),
      h('div', { class: 'rp-principe' },
        h('div', { class: 'rp-principe-deel rp-principe-feiten' },
          h('strong', {}, 'Feiten uit je onderzoek'),
          h('p', {}, 'Respons, scores, tabellen en toetsen komen rechtstreeks uit de gegevens. Er wordt niets bij verzonnen: dezelfde gegevens geven altijd dezelfde cijfers en zinnen.')),
        h('div', { class: 'rp-principe-deel rp-principe-eigen' },
          h('strong', {}, 'Jouw eigen tekst'),
          h('p', {}, 'Wat de cijfers betekenen, de conclusies en de aanbevelingen schrijf je zelf. Bij elk hoofdstuk staan hulpvragen om je op weg te helpen.'))),
      ctx.alleenLezen ? null : h('div', { class: 'rp-keuzes' }, keuze('tussen'), keuze('eind'))),
    h('section', { class: 'kaart', 'aria-labelledby': 'rp-kop-lijst' },
      h('div', { class: 'kaart-kop' }, h('h2', { id: 'rp-kop-lijst' }, 'Rapporten van dit onderzoek')),
      lijstEl),
  );
  await laad();
}
