// Scherm: Analyse · Open antwoorden – open antwoorden en interviews coderen.
// Tijdelijke versie: dit onderdeel wordt nog gebouwd (BOUWPLAN pakket P5).

import { h, vervang, melding, tabSubnav } from '../ui.js';

export async function toon(container, ctx) {
  ctx.zetTitel(`Open antwoorden – ${ctx.onderzoek.onderzoek.titel}`);
  vervang(container,
    tabSubnav('analyse', ctx.params.id, 'coderen'),
    h('section', { class: 'kaart', 'aria-labelledby': 'cd-kop' },
      h('h2', { id: 'cd-kop' }, 'Open antwoorden'),
      melding('Dit onderdeel wordt nog gebouwd.')));
}
