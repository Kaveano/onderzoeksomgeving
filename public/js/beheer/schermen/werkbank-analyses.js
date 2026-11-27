// Werkbank, tabblad Mijn analyses: bewaarde analyses opnieuw uitvoeren, aanpassen, een notitie geven of
// verwijderen (D2 §9.1). Een bewaarde analyse is alleen de vraag (spec), nooit de uitkomst: hij rekent steeds
// opnieuw met de nieuwste gegevens.

import { h, vervang, meld, meldFout, bevestig, formulierDialoog, tijdstip } from '../ui.js';
import { api } from '../api.js';
import { PROCEDURES as META } from '../werkbank/definities.js';
import { beschikbaar } from '../werkbank/procedures/index.js';
import { bewerkAnalyse } from './werkbank-formulieren.js';

export const LEEG = 'Je hebt nog geen analyses bewaard. Bewaar een uitkomst met ‘Bewaren als analyse’. Dan kun je hem later opnieuw uitvoeren met de nieuwste gegevens en opnemen in een rapport.';

function bronTekst(wb, bron) {
  if (bron.soort === 'gestapeld') return 'Alle vragenlijsten samen';
  if (bron.soort === 'dataset') return `Dataset: ${wb.datasets.find((d) => d.id === bron.id)?.naam || 'verwijderd'}`;
  return `Vragenlijst: ${wb.data.vragenlijsten.find((l) => l.id === bron.id)?.titel || 'verwijderd'}`;
}

export function toonMijnAnalyses(paneel, wb) {
  const ro = wb.ctx.alleenLezen;
  const lijst = wb.analyses;
  if (!lijst.length) {
    vervang(paneel, h('section', { class: 'kaart wb-kaart', 'aria-labelledby': 'wb-mijn-kop' },
      h('h2', { id: 'wb-mijn-kop' }, 'Mijn analyses'),
      h('div', { class: 'leeg' }, h('p', {}, LEEG))));
    return;
  }
  const allesOpnieuw = async () => {
    let n = 0;
    for (const a of lijst) {
      if (!beschikbaar(a.spec.procedure)) continue;
      const u = await wb.voerUit(a.spec, { stil: true });
      if (!u) break;
      u.titel = a.titel;
      n++;
    }
    if (n) {
      meld(`${n} ${n === 1 ? 'analyse is' : 'analyses zijn'} opnieuw uitgevoerd.`, 'succes');
      wb.toonTab('uitvoer');
    }
  };
  vervang(paneel, h('section', { class: 'kaart wb-kaart', 'aria-labelledby': 'wb-mijn-kop' },
    h('h2', { id: 'wb-mijn-kop' }, 'Mijn analyses'),
    h('p', { class: 'zacht' }, 'Een bewaarde analyse rekent steeds opnieuw met de nieuwste gegevens. Je kunt hem bij Rapport in een hoofdstuk opnemen.'),
    h('div', { class: 'knoppen' }, h('button', { type: 'button', class: 'knop knop-klein', onclick: allesOpnieuw }, 'Alles opnieuw uitvoeren')),
    h('ul', { class: 'lijst wb-mijn' }, lijst.map((a) => {
      const meta = META[a.spec.procedure];
      const kan = beschikbaar(a.spec.procedure);
      return h('li', { class: 'lijst-item' },
        h('div', { class: 'lijst-item-hoofd' },
          h('div', { class: 'lijst-item-titel' }, a.titel),
          h('div', { class: 'lijst-item-meta' }, `${meta?.naam || a.procedure} · ${bronTekst(wb, a.spec.bron)} · laatst gewijzigd ${tijdstip(a.bijgewerkt_op)}`),
          a.notitie ? h('p', { class: 'wb-notitie zacht' }, a.notitie) : null,
          kan ? null : h('p', { class: 'zacht' }, 'Deze analyse kan de werkbank nog niet uitvoeren.')),
        h('div', { class: 'lijst-item-acties' },
          kan ? h('button', {
            type: 'button',
            class: 'knop knop-klein knop-primair',
            onclick: async () => {
              const u = await wb.voerUit(a.spec, { stil: true });
              if (!u) return;
              u.titel = a.titel;
              wb.toonTab('uitvoer');
              setTimeout(() => document.querySelector(`[data-uitvoer="${u.id}"] h3`)?.focus(), 0);
            },
          }, 'Opnieuw uitvoeren', h('span', { class: 'sr-only' }, `: ${a.titel}`)) : null,
          kan ? h('button', {
            type: 'button',
            class: 'knop knop-klein',
            onclick: async () => {
              await wb.wisselBron(a.spec.bron, a.spec.filter);
              bewerkAnalyse(wb, a);
              wb.toonTab('analyseren');
            },
          }, 'Aanpassen', h('span', { class: 'sr-only' }, `: ${a.titel}`)) : null,
          ro ? null : h('button', {
            type: 'button',
            class: 'knop knop-klein',
            'aria-haspopup': 'dialog',
            onclick: async () => {
              const w = await formulierDialoog({
                titel: 'Notitie',
                velden: [{ naam: 'notitie', label: 'Notitie (alleen voor jezelf; komt niet in het rapport)', type: 'textarea', waarde: a.notitie, max: 2000 }],
                opslaan: (x) => api.put(`/werkbank/analyses/${a.id}`, { notitie: x.notitie, bijgewerkt_op: a.bijgewerkt_op }),
              });
              if (w) await wb.herlaadWerkbank();
            },
          }, 'Notitie', h('span', { class: 'sr-only' }, `: ${a.titel}`)),
          ro ? null : h('button', {
            type: 'button',
            class: 'knop knop-klein knop-licht',
            onclick: async () => {
              if (!(await bevestig({ titel: `“${a.titel}” verwijderen?`, tekst: 'De bewaarde analyse verdwijnt. Staat hij in een rapport, dan verdwijnt hij daar bij het bijwerken van de cijfers.', knop: 'Verwijderen', gevaar: true }))) return;
              try {
                await api.del(`/werkbank/analyses/${a.id}`);
                await wb.herlaadWerkbank();
              } catch (e) {
                meldFout(e);
              }
            },
          }, 'Verwijderen', h('span', { class: 'sr-only' }, `: ${a.titel}`))));
    }))));
}
