// Scherm: Rapport · Bronnen – de bronnen uit de bibliotheek die je bij dit onderzoek gebruikt.
// Tijdelijke versie: dit onderdeel wordt nog gebouwd (BOUWPLAN pakket P5).

import { h, vervang, melding, tabSubnav } from '../ui.js';

export async function toon(container, ctx) {
  ctx.zetTitel(`Bronnen – ${ctx.onderzoek.onderzoek.titel}`);
  vervang(container,
    tabSubnav('rapport', ctx.params.id, 'bronnen'),
    h('section', { class: 'kaart', 'aria-labelledby': 'bn-kop' },
      h('h2', { id: 'bn-kop' }, 'Bronnen bij dit onderzoek'),
      melding('Dit onderdeel wordt nog gebouwd.')));
}
