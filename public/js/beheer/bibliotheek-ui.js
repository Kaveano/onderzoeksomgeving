// Gedeelde onderdelen voor de schermen van de bibliotheek (Bibliotheek, Bron, Rapport · Bronnen en de
// bronkiezer): markeringen van zoektreffers, de dialogen Citeer en Koppel, "Plak een verwijzing" en de exports.
// Alles via h() (geen innerHTML); links alleen als http(s).

import { api } from './api.js';
import { h, maakDialoog, meld, meldFout, kopieer, formulierDialoog, uniekeId, vandaag } from './ui.js';
import { inline } from './rapport-weergave.js';
import {
  BRONSOORTEN, TALEN, apaVerwijzing, apaInTekst, leesApaVerwijzing, zonderSterren,
} from './bibliotheek-regels.js';
import { naarRis, bibliotheekBladen, literatuurBlokken } from './bibliotheek-bestanden.js';
import { maakDocx, maakXlsx, bewaarBestand } from './bestanden.js';
import { bibliotheekGewijzigd } from './bibliotheek-data.js';

/** Tekst met gemarkeerde stukken ([[van, tot]]) als <mark class="bb-treffer">. */
export function markeer(tekst, stukken = []) {
  const t = String(tekst ?? '');
  if (!stukken.length) return [t];
  const uit = [];
  let vorige = 0;
  for (const [van, tot] of stukken) {
    if (van > vorige) uit.push(t.slice(vorige, van));
    uit.push(h('mark', { class: 'bb-treffer' }, t.slice(van, tot)));
    vorige = tot;
  }
  if (vorige < t.length) uit.push(t.slice(vorige));
  return uit;
}

/** "Rapport · 2024 · Nederlands" */
export function bronMeta(bron) {
  return [BRONSOORTEN[bron.soort] || bron.soort, Number.isInteger(bron.jaar) ? String(bron.jaar) : 'zonder datum', TALEN[bron.taal] || '']
    .filter(Boolean).join(' · ');
}

/** De link naar de bron zelf (DOI heeft voorrang), of null. */
export function bronLink(bron) {
  const doi = String(bron.doi || '').trim();
  const href = doi ? `https://doi.org/${doi}` : String(bron.url || '').trim();
  return /^https?:\/\/[^\s<>"]+$/i.test(href) ? href : null;
}

/** Knop-link "Open de bron" (nieuw tabblad, zonder doorgeven van dit adres), of null. */
export function openKnop(bron, tekst = 'Open de bron') {
  const href = bronLink(bron);
  return href ? h('a', { class: 'knop knop-klein knop-licht', href, target: '_blank', rel: 'noopener noreferrer' }, tekst) : null;
}

/** De APA-verwijzing als elementen (met cursief). */
export function apaElement(bron, { suffix = '' } = {}) {
  return h('span', { class: 'bb-apa' }, inline(apaVerwijzing(bron, { suffix })));
}

/** Dialoog "Zo verwijs je naar deze bron", met een knop Kopieer per vorm. */
export function citeerDialoog(bron) {
  const eersteKeer = new Set();
  const haakjes = apaInTekst([{ bron }], { eersteKeer });
  const haakjesLater = apaInTekst([{ bron }], { eersteKeer });
  const zin = apaInTekst([{ bron }], { verhalend: true });
  const code = `[@${bron.citeersleutel}]`;
  const rij = (label, inhoud, tekst, uitleg = null) => h('div', { class: 'bb-citeer-rij' },
    h('div', { class: 'bb-citeer-tekst' }, h('p', { class: 'bb-citeer-label' }, label), h('p', { class: 'bb-citeer-vorm' }, inhoud), uitleg),
    h('button', {
      type: 'button',
      class: 'knop knop-klein',
      'aria-label': `Kopieer: ${label}`,
      onclick: async () => meld((await kopieer(tekst)) ? 'Gekopieerd.' : 'Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.', 'succes'),
    }, 'Kopieer'));
  const lijst = zonderSterren(apaVerwijzing(bron));
  const sluit = h('button', { type: 'button', class: 'knop knop-primair' }, 'Sluiten');
  const d = maakDialoog('Zo verwijs je naar deze bron', [
    rij('In de literatuurlijst (APA)', inline(apaVerwijzing(bron)), lijst),
    rij('In je tekst, tussen haakjes', haakjes, haakjes, haakjesLater !== haakjes ? h('p', { class: 'klein zacht' }, `Daarna: ${haakjesLater}`) : null),
    rij('In je tekst, in de zin', zin, zin),
    rij('Code voor een rapport', h('code', {}, code), code,
      h('p', { class: 'klein zacht' }, `Gebruik in een rapport de knop "Bron noemen". Die zet deze code in je tekst; in het rapport wordt dat ${haakjes} en de bron komt vanzelf in de literatuurlijst.`)),
  ], [sluit]);
  d.classList.add('bb-dialoog');
  sluit.addEventListener('click', () => d.close());
  d.showModal();
  sluit.focus();
}

/** Dialoog "Koppel aan onderzoek". Geeft true als er gekoppeld is. */
export async function koppelDialoog(bron) {
  let onderzoeken;
  try {
    onderzoeken = (await api.get('/onderzoeken')).onderzoeken.filter((o) => o.status !== 'gearchiveerd');
  } catch (e) {
    meldFout(e);
    return false;
  }
  if (!onderzoeken.length) {
    meld('Er is nog geen actief onderzoek om deze bron aan te koppelen.', 'waarschuwing');
    return false;
  }
  const al = new Set((bron.onderzoeken || []).map((o) => Number(typeof o === 'object' ? o.id : o)));
  const waarden = await formulierDialoog({
    titel: 'Koppel aan onderzoek',
    intro: zonderSterren(bron.titel),
    knop: 'Koppelen',
    velden: [
      { naam: 'onderzoek', label: 'Onderzoek', type: 'select', waarde: onderzoeken.find((o) => !al.has(o.id))?.id ?? onderzoeken[0].id,
        opties: onderzoeken.map((o) => ({ waarde: o.id, label: `${o.titel} (${o.bedrijfsnaam})${al.has(o.id) ? ' – al gekoppeld' : ''}` })) },
      { naam: 'notitie', label: 'Waarvoor gebruik je deze bron? (optioneel)', type: 'textarea', rijen: 3, max: 1000 },
    ],
    opslaan: async (w) => {
      await api.put(`/onderzoeken/${w.onderzoek}/bronnen/${bron.id}`, w.notitie ? { notitie: w.notitie } : {});
    },
  });
  if (!waarden) return false;
  bibliotheekGewijzigd();
  meld('De bron is gekoppeld.', 'succes');
  return true;
}

/**
 * "Plak een verwijzing": een tekstvak en een knop. bijResultaat(resultaat van leesApaVerwijzing) vult de velden.
 * Daaronder staat welke velden niet herkend zijn.
 */
export function plakVerwijzing(bijResultaat, { open = false } = {}) {
  const id = uniekeId('bb-plak');
  const vak = h('textarea', { id, rows: 3, maxlength: 3000, placeholder: 'Bakker, A. B., & Demerouti, E. (2017). Job demands–resources theory … 22(3), 273–285.' });
  const uitkomst = h('div', { role: 'status', class: 'bb-plak-uitkomst' });
  const knop = h('button', {
    type: 'button',
    class: 'knop knop-klein',
    onclick: () => {
      const r = leesApaVerwijzing(vak.value);
      uitkomst.replaceChildren();
      if (!vak.value.trim()) {
        uitkomst.append(h('p', { class: 'veld-fout' }, 'Plak eerst een verwijzing.'));
        return;
      }
      bijResultaat(r);
      const regels = [];
      if (r.ontbreekt.length) regels.push(h('p', {}, `Deze velden zijn niet herkend: ${r.ontbreekt.join(', ')}. Vul ze zelf in als je ze weet.`));
      for (const m of r.meldingen) regels.push(h('p', {}, m));
      uitkomst.append(regels.length
        ? h('div', { class: 'melding melding-waarschuwing' }, h('p', {}, h('strong', {}, 'Ingevuld. Controleer alle velden.')), regels)
        : h('div', { class: 'melding melding-succes' }, 'Ingevuld. Controleer alle velden.'));
    },
  }, 'Velden invullen');
  return h('details', { class: 'bb-plak', open: open || null },
    h('summary', {}, 'Plak een verwijzing'),
    h('div', { class: 'veld' },
      h('label', { for: id }, 'Verwijzing'),
      vak,
      h('div', { class: 'veld-hulp' }, 'Plak hier een verwijzing, bijvoorbeeld uit Google Scholar (knop ‘Citeer’, APA). Controleer daarna alle velden.')),
    h('div', { class: 'knoppen' }, knop),
    uitkomst);
}

/** Bestanden met bronnen: soort 'word' (literatuurlijst), 'excel' of 'ris'. */
export function exporteer(bronnen, soort, { metNotities = false, onderzoeken = {}, naam = 'bronnen' } = {}) {
  const datum = vandaag();
  if (soort === 'word') {
    bewaarBestand(maakDocx({ blokken: literatuurBlokken(bronnen) }), `literatuurlijst-${datum}.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } else if (soort === 'excel') {
    bewaarBestand(maakXlsx(bibliotheekBladen(bronnen, { onderzoeken, metNotities })), `${naam === 'bronnen' ? 'bibliotheek' : naam}-${datum}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else {
    bewaarBestand(naarRis(bronnen, { metNotities }), `${naam}-${datum}.ris`, 'application/x-research-info-systems');
  }
}
