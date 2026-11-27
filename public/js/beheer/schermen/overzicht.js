// Scherm: Dashboard · Overzicht (HR-analytics) – kerncijfers, samenstelling en verschillen tussen groepen.
// Tijdelijke versie: dit onderdeel wordt nog gebouwd (BOUWPLAN pakket P3). De resultaten staan bij "Alle resultaten".

import { h, vervang, melding, tabSubnav } from '../ui.js';

export async function toon(container, ctx) {
  ctx.zetTitel(`HR-analytics – ${ctx.onderzoek.onderzoek.titel}`);
  vervang(container,
    tabSubnav('dashboard', ctx.params.id, ''),
    h('section', { class: 'kaart', 'aria-labelledby': 'hr-kop' },
      h('h2', { id: 'hr-kop' }, 'HR-analytics'),
      melding('Dit onderdeel wordt nog gebouwd.')));
}
