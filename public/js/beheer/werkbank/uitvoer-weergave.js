// Werkbank: een uitvoer op het scherm (D2 §8.2). DOM via h(); geen innerHTML.
// Tabellen staan in een .tabel-wrapper (schuiven binnen de kaart, niet de pagina). Een correlatiematrix wordt op
// een smal scherm een lijst met paren (gesorteerd op de sterkte); de keuze tussen de twee maakt de CSS.

import { h, kopieer, meld } from '../ui.js';
import { inline } from '../rapport-weergave.js';
import { VERBORGEN, VERBORGEN_UITLEG } from '../privacy.js';
import { opmaakCel, metaTekst, pWaarde } from './uitvoer-tekst.js';

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
const NIVEAU = { privacy: 'melding wb-melding-privacy', waarschuwing: 'melding melding-waarschuwing', fout: 'melding melding-gevaar', info: 'melding wb-melding-info' };

function celEl(c, kopTekst, eerste) {
  const tekst = opmaakCel(c);
  const attrs = { 'data-label': kopTekst };
  if (c && c.verborgen) {
    attrs.class = 'rechts getal wb-verborgen';
    attrs.title = VERBORGEN_UITLEG;
  } else if (c && c.soort !== 'tekst') {
    attrs.class = `rechts getal${c.nadruk ? ' wb-nadruk' : ''}`;
  } else if (c && c.nadruk) {
    attrs.class = 'wb-nadruk';
  }
  if (eerste) return h('th', { scope: 'row', class: c?.nadruk ? 'wb-nadruk' : null }, tekst);
  return h('td', attrs, tekst);
}

function tabelEl(o) {
  const n = o.kop.length;
  const tabel = h('table', { class: `tabel wb-tabel${o.weergave === 'matrix' ? ' wb-matrix' : ''}` },
    h('caption', { class: 'sr-only' }, o.titel),
    h('thead', {}, h('tr', {}, o.kop.map((k, i) => h('th', { scope: 'col', class: i > 0 && k.uitlijning === 'rechts' ? 'rechts' : null }, k.tekst)))),
    h('tbody', {}, o.rijen.map((rij) => {
      const cellen = rij.map((c, i) => {
        const el = celEl(c, o.kop[i]?.tekst || '', i === 0);
        // Een tekst die de rest van de rij beslaat (bijv. "Te weinig (minder dan 5)").
        if (c?.breed && i === rij.length - 1 && rij.length < n) {
          el.setAttribute('colspan', String(n - rij.length + 1));
          el.classList.remove('rechts', 'getal');
          el.classList.add('wb-breed');
        }
        return el;
      });
      return h('tr', { class: rij[0]?.zacht ? 'wb-zacht' : null }, cellen);
    })));
  return h('div', { class: 'tabel-wrapper wb-tabel-wrapper' }, tabel);
}

/** De paren van een correlatiematrix als lijst (voor een telefoon), gesorteerd op |r|. */
function parenEl(o) {
  const paren = o.paren.filter((p) => !p.teWeinig).sort((a, b) => Number(!!a.verborgen) - Number(!!b.verborgen) || Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0));
  return h('ol', { class: 'wb-paren', 'aria-label': `${o.titel} als lijst` }, paren.map((p) => h('li', {},
    h('span', { class: 'wb-paar' }, `${p.a} – ${p.b}`),
    p.verborgen
      ? h('span', { class: 'wb-paar-waarde wb-verborgen', title: VERBORGEN_UITLEG }, VERBORGEN)
      : h('span', { class: 'wb-paar-waarde getal' }, `${o.maat || 'r'} = ${opmaakCel({ w: p.r, soort: 'r', ster: p.ster })}; p ${p.p < 0.001 ? '' : '= '}${pWaarde(p.p)}; n = ${Math.round(p.n).toLocaleString('nl-NL')}`))));
}

function grafiekEl(o) {
  const max = Math.max(1, ...o.reeksen.map((r) => (eindig(r.waarde) ? r.waarde : 0)));
  return h('figure', { class: 'wb-grafiek' },
    h('figcaption', { class: 'sr-only' }, o.titel),
    h('ul', { class: 'wb-staven', 'aria-hidden': 'true' }, o.reeksen.map((r) => {
      const balk = h('span', { class: `wb-staaf${eindig(r.waarde) ? '' : ' wb-staaf-verborgen'}` });
      if (eindig(r.waarde)) balk.style.width = `${Math.max(1, (r.waarde / max) * 100)}%`;
      return h('li', {},
        h('span', { class: 'wb-staaf-label' }, r.label),
        h('span', { class: 'wb-staaf-baan' }, balk),
        h('span', { class: 'wb-staaf-waarde getal' }, eindig(r.waarde) ? `${r.waarde.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%` : VERBORGEN));
    })));
}

/**
 * Eén uitvoer als section. acties: { bewaar, stuk, excel, word, weghalen, schaalscore } (functies; ontbreekt er een, dan geen
 * knop). notatie: 'rapport' | 'apa'. nieuwste: "Wat betekent dit?" staat open.
 */
export function toonUitvoer(u, { notatie = 'rapport', acties = {}, nieuwste = false } = {}) {
  const kopId = `wb-uitvoer-${u.id}`;
  const onderdelen = [];
  const extra = [];
  let verborgen = false;
  for (const o of u.onderdelen) {
    if (o.soort === 'melding') onderdelen.push(h('div', { class: NIVEAU[o.niveau] || 'melding', role: o.niveau === 'fout' ? 'alert' : null }, o.tekst));
    else if (o.soort === 'grafiek') onderdelen.push(grafiekEl(o));
    else if (o.soort === 'tabel') {
      if (o.rijen.some((r) => r.some((c) => c && c.verborgen))) verborgen = true;
      const blok = h('div', { class: `wb-blok${o.weergave === 'matrix' ? ' wb-blok-matrix' : ''}` },
        h('h4', { class: 'wb-tabel-titel' }, o.titel),
        o.uitleg ? h('p', { class: 'wb-tabel-uitleg zacht' }, o.uitleg) : null,
        tabelEl(o),
        o.weergave === 'matrix' && o.paren ? parenEl(o) : null,
        (o.voetnoten || []).map((v) => h('p', { class: 'wb-voetnoot' }, v)));
      (o.verborgenStandaard ? extra : onderdelen).push(blok);
    }
  }
  if (extra.length) onderdelen.push(h('details', { class: 'wb-extra' }, h('summary', {}, 'p-waarden en aantallen per paar tonen'), extra));
  if (verborgen) onderdelen.push(h('p', { class: 'wb-voetnoot' }, VERBORGEN_UITLEG));
  const zin = u.apa ? u.apa[notatie === 'apa' ? 'apa' : 'rapport'] : '';
  const knop = (tekst, fn, extraAttrs = {}) => (fn ? h('button', { type: 'button', class: 'knop knop-klein', onclick: fn, ...extraAttrs }, tekst, h('span', { class: 'sr-only' }, `: ${u.titel}`)) : null);
  return h('section', { class: `kaart wb-uitvoer-item${u.geweigerd ? ' wb-geweigerd' : ''}`, 'aria-labelledby': kopId, 'data-uitvoer': u.id },
    h('h3', { id: kopId, tabindex: '-1' }, u.titel),
    h('p', { class: 'wb-meta zacht' }, metaTekst(u)),
    u.gegevens.instellingen ? h('p', { class: 'wb-meta zacht' }, u.gegevens.instellingen) : null,
    onderdelen,
    u.duiding?.zinnen?.length
      ? h('details', { class: 'wb-duiding', open: nieuwste },
        h('summary', {}, 'Wat betekent dit?'),
        h('p', {}, u.duiding.zinnen.join(' ')))
      : null,
    zin
      ? h('div', { class: 'wb-apa' },
        h('p', { class: 'wb-apa-zin' }, inline(zin)),
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          onclick: async () => meld((await kopieer(zin.replace(/\*/g, ''))) ? 'De zin is gekopieerd.' : 'Kopiëren is niet gelukt.', 'succes'),
        }, 'Kopieer zin'))
      : null,
    u.geweigerd ? null : h('div', { class: 'knoppen wb-acties' },
      u.schaalscore ? knop('Maak hiervan een schaalscore', acties.schaalscore, { 'aria-haspopup': 'dialog' }) : null,
      knop('Bewaren als analyse', acties.bewaar, { 'aria-haspopup': 'dialog' }),
      knop('Neem op in stuk', acties.stuk, { 'aria-haspopup': 'dialog' }),
      knop('Naar Excel', acties.excel),
      knop('Naar Word', acties.word),
      knop('Weghalen', acties.weghalen)),
    u.geweigerd && acties.weghalen ? h('div', { class: 'knoppen wb-acties' }, knop('Weghalen', acties.weghalen)) : null);
}
