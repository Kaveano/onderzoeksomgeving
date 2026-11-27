// Scherm: Analyse · Werkbank – zelf analyses kiezen en uitvoeren, zoals in SPSS.
// Tijdelijke versie: dit onderdeel wordt nog gebouwd (BOUWPLAN pakket P4).

import { h, vervang, melding, tabSubnav } from '../ui.js';

export async function toon(container, ctx) {
  ctx.zetTitel(`Werkbank – ${ctx.onderzoek.onderzoek.titel}`);
  vervang(container,
    tabSubnav('analyse', ctx.params.id, 'werkbank'),
    h('section', { class: 'kaart', 'aria-labelledby': 'wb-kop' },
      h('h2', { id: 'wb-kop' }, 'Werkbank'),
      melding('Dit onderdeel wordt nog gebouwd.')));
}
