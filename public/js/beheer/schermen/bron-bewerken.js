// Scherm: één bron uit de bibliotheek bekijken, toevoegen of aanpassen (#/bibliotheek/nieuw, #/bibliotheek/<id>).
// Tijdelijke versie: dit onderdeel wordt nog gebouwd (BOUWPLAN pakket P5).

import { h, vervang, melding } from '../ui.js';

export async function toon(container, ctx) {
  const isNieuw = ctx.params.bronId === 'nieuw';
  ctx.zetTitel(isNieuw ? 'Bron toevoegen – Bibliotheek' : 'Bron – Bibliotheek');
  vervang(container,
    h('div', { class: 'kruimel' }, h('a', { href: '#/bibliotheek' }, '← Bibliotheek')),
    h('div', { class: 'paginakop' }, h('div', {}, h('h1', {}, isNieuw ? 'Bron toevoegen' : 'Bron'))),
    melding('Dit onderdeel wordt nog gebouwd.'));
}
