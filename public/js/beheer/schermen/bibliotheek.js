// Scherm: Bibliotheek – bronnen om je onderzoek op te baseren (voor alle onderzoeken samen).
// Tijdelijke versie: dit onderdeel wordt nog gebouwd (BOUWPLAN pakket P5).

import { h, vervang, melding } from '../ui.js';

export async function toon(container, ctx) {
  ctx.zetTitel('Bibliotheek');
  vervang(container,
    h('div', { class: 'paginakop' },
      h('div', {},
        h('h1', {}, 'Bibliotheek'),
        h('p', { class: 'ondertitel' }, 'Bronnen om je onderzoek op te baseren: een startcollectie met openbaar HR-onderzoek en je eigen bronnen.'))),
    melding('Dit onderdeel wordt nog gebouwd.'));
}
