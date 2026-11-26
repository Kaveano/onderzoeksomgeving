// Rapport tonen: zet de "blokken" uit rapport-feiten.js om in DOM-elementen.
// Wordt gebruikt in het beheer (voorbeeld en afdrukken) en op de kijkpagina (deellink).
// Tekst gaat altijd via h()/textContent, nooit via innerHTML.

import { h } from './ui.js';

/** Zet **vet** en *cursief* om in elementen; de rest blijft platte tekst. Regeleinden worden <br>. */
export function inline(tekst) {
  const uit = [];
  const regels = String(tekst ?? '').split('\n');
  regels.forEach((regel, r) => {
    if (r > 0) uit.push(h('br'));
    const patroon = /\*\*([^*\n]+?)\*\*|\*([^*\s][^*\n]*?)\*/g;
    let vorige = 0;
    let m;
    while ((m = patroon.exec(regel)) !== null) {
      if (m.index > vorige) uit.push(document.createTextNode(regel.slice(vorige, m.index)));
      uit.push(m[1] !== undefined ? h('strong', {}, m[1]) : h('em', {}, m[2]));
      vorige = m.index + m[0].length;
    }
    if (vorige < regel.length) uit.push(document.createTextNode(regel.slice(vorige)));
  });
  return uit;
}

const isGetal = (cel) => typeof cel === 'number' || /^[+−-]?\d[\d.,]*\s?%?$/.test(String(cel)) || cel === '–';

function tabelEl(b) {
  // Kolommen met (bijna) alleen getallen worden rechts uitgelijnd.
  const rechts = b.kop.map((_, k) => k > 0 && b.rijen.length > 0 && b.rijen.every((rij) => isGetal(rij[k])));
  const cel = (waarde) => (typeof waarde === 'number' ? waarde.toLocaleString('nl-NL') : String(waarde ?? ''));
  return h('div', { class: 'tabel-wrapper rp-tabel-wrapper' },
    h('table', { class: 'tabel rp-tabel' },
      b.bijschrift ? h('caption', {}, b.bijschrift) : null,
      h('thead', {}, h('tr', {}, b.kop.map((k, i) => h('th', { scope: 'col', class: rechts[i] ? 'rechts' : null }, k)))),
      h('tbody', {}, b.rijen.map((rij) => h('tr', {}, rij.map((w, i) => (i === 0
        ? h('th', { scope: 'row', class: 'rp-rijkop' }, inline(cel(w)))
        : h('td', { class: rechts[i] ? 'rechts getal' : null }, cel(w)))))))));
}

function blokEl(b) {
  switch (b.soort) {
    case 'titel':
      return h('header', { class: 'rp-voorblad' },
        h('p', { class: 'rp-soort' }, b.soortNaam),
        h('h1', { class: 'rp-titel' }, b.tekst),
        b.ondertitel ? h('p', { class: 'rp-ondertitel' }, b.ondertitel) : null);
    case 'gegevens':
      return h('dl', { class: 'rp-gegevens' }, b.rijen.map(([k, w]) => h('div', {}, h('dt', {}, k), h('dd', {}, w))));
    case 'kop':
      return h(`h${Math.min(4, b.niveau + 1)}`, { class: `rp-kop rp-kop-${b.niveau}` }, b.tekst);
    case 'alinea':
      return h('p', {}, inline(b.tekst));
    case 'citaat':
      return h('blockquote', { class: 'rp-citaat' }, inline(b.tekst));
    case 'lijst':
      return h(b.genummerd ? 'ol' : 'ul', { class: 'rp-lijst' }, b.items.map((item) => h('li', {}, inline(item))));
    case 'tabel':
      return tabelEl(b);
    case 'paginaeinde':
      return h('div', { class: 'rp-pagina-einde', 'aria-hidden': 'true' });
    case 'feiten':
      return h('div', { class: 'rp-feiten' },
        b.blokken.map(blokEl),
        b.bron ? h('p', { class: 'rp-bron' }, b.bron) : null);
    case 'leeg':
      return h('p', { class: 'rp-leeg' }, b.tekst);
    default:
      return null;
  }
}

/** Geeft de DOM-elementen voor een lijst blokken. */
export function toonBlokken(blokken) {
  return blokken.map(blokEl).filter(Boolean);
}
