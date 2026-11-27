// Scherm: Rapport · Bronnen – de bronnen uit de bibliotheek die je bij dit onderzoek gebruikt (D3 §2.10, BOUWPLAN §1.1).
// Per bron: de APA-verwijzing, waarvoor je hem gebruikt (opgeslagen als je het veld verlaat), Citeer, Ontkoppelen.
// Daaronder: passende bronnen bij de thema's en de onderzoeksvraag, en de literatuurlijst of RIS van deze bronnen.
// Alleen-lezen als het onderzoek gearchiveerd is.

import { api } from '../api.js';
import { h, vervang, laden, leeg, melding, meld, meldFout, bevestig, tabSubnav, uniekeId, aantal, vertraag } from '../ui.js';
import { sorteerLiteratuur, zonderSterren, auteursRegel, LIMIETEN } from '../bibliotheek-regels.js';
import { zoek, zoekBijOnderzoek, zoekvraagBijOnderzoek } from '../bibliotheek-zoeken.js';
import { haalBibliotheek, bibliotheekGewijzigd } from '../bibliotheek-data.js';
import { apaElement, citeerDialoog, bronMeta, exporteer, openKnop } from '../bibliotheek-ui.js';
import { kiesBron } from '../bronkiezer.js';

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const o = ctx.onderzoek.onderzoek;
  const ro = ctx.alleenLezen;
  ctx.zetTitel(`Bronnen – ${o.titel}`);
  const lijstKaart = h('section', { class: 'kaart', 'aria-labelledby': 'bn-kop' }, h('h2', { id: 'bn-kop' }, 'Bronnen bij dit onderzoek'), laden());
  const zoekKaart = h('section', { class: 'kaart', 'aria-labelledby': 'bn-zoek-kop' });
  const exportKaart = h('section', { class: 'kaart', 'aria-labelledby': 'bn-exp-kop' });
  vervang(container, tabSubnav('rapport', onderzoekId, 'bronnen'), lijstKaart, ro ? null : zoekKaart, exportKaart);

  let gekoppeld = [];
  let bib = null;

  async function laad() {
    const [g, b] = await Promise.all([api.get(`/onderzoeken/${onderzoekId}/bronnen`), haalBibliotheek()]);
    gekoppeld = g.bronnen;
    bib = b;
  }

  async function koppel(bron) {
    try {
      await api.put(`/onderzoeken/${onderzoekId}/bronnen/${bron.id}`, {});
      bibliotheekGewijzigd();
      meld('De bron is gekoppeld.', 'succes');
      await ververs();
    } catch (e) {
      meldFout(e);
    }
  }

  function tekenLijst() {
    const lijst = sorteerLiteratuur(gekoppeld);
    const items = lijst.map(({ bron, suffix }) => {
      const notId = uniekeId('bn-notitie');
      let bewaard = bron.koppeling?.notitie || '';
      const notitie = h('textarea', { id: notId, rows: 2, maxlength: LIMIETEN.koppeling_notitie, disabled: ro }, bewaard);
      const status = h('span', { class: 'klein zacht', role: 'status' });
      notitie.addEventListener('blur', async () => {
        if (ro || notitie.value.trim() === bewaard.trim()) return;
        try {
          await api.put(`/onderzoeken/${onderzoekId}/bronnen/${bron.id}`, { notitie: notitie.value });
          bewaard = notitie.value;
          status.textContent = 'Opgeslagen.';
        } catch (e) {
          meldFout(e);
        }
      });
      return h('li', { class: 'bn-bron' },
        h('p', { class: 'bn-apa' }, apaElement(bron, { suffix })),
        h('p', { class: 'klein zacht' }, bronMeta(bron), bron.collectie === 'start' ? ' · Startcollectie' : ' · Eigen bron', ` · code [@${bron.citeersleutel}]`),
        h('div', { class: 'veld bn-notitie' }, h('label', { for: notId }, 'Waarvoor gebruik je deze bron?'), notitie, status),
        h('div', { class: 'knoppen' },
          h('button', { type: 'button', class: 'knop knop-klein', onclick: () => citeerDialoog(bron) }, 'Citeer'),
          ro ? null : h('button', {
            type: 'button',
            class: 'knop knop-klein',
            onclick: async () => {
              if (!(await bevestig({ titel: 'Bron ontkoppelen?', tekst: 'De bron blijft in de bibliotheek staan, maar hoort dan niet meer bij dit onderzoek. In rapporten die hem noemen, blijft de verwijzing werken.', knop: 'Ontkoppelen' }))) return;
              try {
                await api.del(`/onderzoeken/${onderzoekId}/bronnen/${bron.id}`);
                bibliotheekGewijzigd();
                meld('De bron is ontkoppeld.');
                await ververs();
              } catch (e) {
                meldFout(e);
              }
            },
          }, 'Ontkoppelen'),
          h('a', { class: 'knop knop-klein knop-licht', href: `#/bibliotheek/${bron.id}` }, 'Bekijken in de bibliotheek'),
          openKnop(bron)));
    });
    vervang(lijstKaart,
      h('div', { class: 'kaart-kop' },
        h('h2', { id: 'bn-kop' }, 'Bronnen bij dit onderzoek'),
        ro ? null : h('button', {
          type: 'button',
          class: 'knop knop-primair knop-klein',
          onclick: async () => {
            const r = await kiesBron({ onderzoekId, metPagina: false, metVorm: false, knop: 'Koppelen', titel: 'Bron koppelen' });
            if (r) {
              meld('De bron is gekoppeld.', 'succes');
              await ververs();
            }
          },
        }, 'Bron uit de bibliotheek koppelen')),
      h('p', { class: 'zacht' }, 'Bronnen uit je bibliotheek die je voor dit onderzoek gebruikt. In een rapport noem je ze met de knop "Bron noemen"; dan komen ze vanzelf in de literatuurlijst.'),
      items.length ? h('ol', { class: 'bn-lijst' }, items)
        : leeg('Er zijn nog geen bronnen aan dit onderzoek gekoppeld. Zoek hieronder naar passende bronnen of ga naar de bibliotheek.',
          h('a', { class: 'knop', href: '#/bibliotheek' }, 'Naar de bibliotheek')));
  }

  function tekenZoeken() {
    if (ro) return;
    const zoekId = uniekeId('bn-zoek');
    const begin = zoekvraagBijOnderzoek({ themas: ctx.onderzoek.themas || [], onderzoeksvraag: o.onderzoeksvraag || '' });
    const veld = h('input', { id: zoekId, type: 'search', value: begin, autocomplete: 'off', placeholder: 'Bijvoorbeeld: werkdruk zorg' });
    const uitkomst = h('div', {});
    const status = h('p', { class: 'klein zacht', role: 'status' });
    const zoekNu = () => {
      const al = new Set(gekoppeld.map((b) => b.id));
      const bronnen = bib.bronnen.filter((b) => !al.has(b.id));
      const tekst = veld.value.trim();
      const treffers = !tekst ? []
        : tekst === begin ? zoekBijOnderzoek(bronnen, { themas: ctx.onderzoek.themas || [], onderzoeksvraag: o.onderzoeksvraag || '' }).treffers
          : zoek(bronnen, { tekst }).treffers.slice(0, 10);
      status.textContent = !tekst ? 'Typ een paar woorden om te zoeken.' : treffers.length ? `${aantal(treffers.length, 'bron', 'bronnen')} die passen${treffers.length === 10 ? ' (de beste 10)' : ''}.` : 'Geen passende bronnen gevonden.';
      vervang(uitkomst, treffers.length ? h('ul', { class: 'bn-voorstel' }, treffers.map(({ bron }) => h('li', {},
        h('div', {},
          h('a', { href: `#/bibliotheek/${bron.id}`, class: 'bn-voorstel-titel' }, zonderSterren(bron.titel)),
          h('p', { class: 'klein zacht' }, [auteursRegel(bron), bronMeta(bron)].filter(Boolean).join(' · '))),
        h('button', { type: 'button', class: 'knop knop-klein', onclick: () => koppel(bron) }, 'Koppelen')))) : null);
    };
    veld.addEventListener('input', vertraag(zoekNu, 150));
    vervang(zoekKaart,
      h('h2', { id: 'bn-zoek-kop' }, 'Passende bronnen zoeken'),
      h('p', { class: 'zacht' }, 'De zoekvraag komt uit de thema\'s en de onderzoeksvraag van dit onderzoek. Pas hem gerust aan.'),
      h('div', { class: 'veld' }, h('label', { for: zoekId }, 'Zoeken in de bibliotheek'), veld),
      status, uitkomst,
      h('p', {}, h('a', { href: '#/bibliotheek' }, 'Naar de hele bibliotheek')));
    zoekNu();
  }

  function tekenExport() {
    vervang(exportKaart,
      h('h2', { id: 'bn-exp-kop' }, 'Exporteren'),
      gekoppeld.length
        ? [h('p', { class: 'zacht' }, `De ${aantal(gekoppeld.length, 'bron', 'bronnen')} van dit onderzoek, zonder je eigen notities.`),
          h('div', { class: 'knoppen' },
            h('button', { type: 'button', class: 'knop', onclick: () => exporteer(gekoppeld, 'word') }, 'Literatuurlijst (Word)'),
            h('button', { type: 'button', class: 'knop', onclick: () => exporteer(gekoppeld, 'ris') }, 'RIS (voor Zotero, Mendeley of EndNote)'))]
        : h('p', { class: 'zacht' }, 'Koppel eerst bronnen aan dit onderzoek.'));
  }

  async function ververs() {
    await laad();
    tekenLijst();
    tekenZoeken();
    tekenExport();
  }

  try {
    await ververs();
  } catch (e) {
    vervang(lijstKaart, h('h2', { id: 'bn-kop' }, 'Bronnen bij dit onderzoek'), melding(e.message, 'gevaar'));
  }
}
