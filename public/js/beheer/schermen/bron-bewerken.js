// Scherm: één bron uit de bibliotheek (#/bibliotheek/nieuw, #/bibliotheek/<id>; D3 §2.10, BOUWPLAN B21).
// - Een eigen bron voeg je toe of pas je aan, met expliciet opslaan. "Plak een verwijzing" vult de velden.
// - Een bron uit de startcollectie is alleen-lezen: je ziet alles, kunt eigen notities bewaren, hem verbergen of
//   een eigen kopie maken (die kun je wel aanpassen).

import { api } from '../api.js';
import { h, vervang, laden, melding, meld, meldFout, bevestig, maakDialoog, uniekeId, aantal } from '../ui.js';
import { inline } from '../rapport-weergave.js';
import {
  BRONSOORTEN, ONDERWERPEN, TALEN, BETROUWBAARHEID, DETAILVELDEN, LIMIETEN, legeBron, apaVerwijzing, apaInTekst,
  citeersleutelBasis, auteursRegel, zonderSterren, nlDatumKort, dubbeleVan,
} from '../bibliotheek-regels.js';
import { haalBibliotheek, bibliotheekGewijzigd } from '../bibliotheek-data.js';
import { citeerDialoog, koppelDialoog, openKnop, plakVerwijzing, bronMeta } from '../bibliotheek-ui.js';

const kopie = (x) => JSON.parse(JSON.stringify(x));

export async function toon(container, ctx) {
  const isNieuw = ctx.params.bronId === 'nieuw';
  ctx.zetTitel(isNieuw ? 'Bron toevoegen – Bibliotheek' : 'Bron – Bibliotheek');
  const kruimel = h('div', { class: 'kruimel' }, h('a', { href: '#/bibliotheek' }, '← Bibliotheek'));
  vervang(container, kruimel, laden());

  let bron;
  let gebruik = { onderzoeken: [], rapporten: [] };
  if (isNieuw) {
    bron = legeBron('artikel');
  } else {
    try {
      const r = await api.get(`/bibliotheek/${ctx.params.bronId}`);
      bron = r.bron;
      gebruik = { onderzoeken: r.bron.onderzoeken || [], rapporten: r.bron.rapporten || [] };
    } catch (e) {
      vervang(container, kruimel, melding(e.status === 404 ? 'Deze bron bestaat niet (meer).' : e.message, 'gevaar'));
      return;
    }
    ctx.zetTitel(`${zonderSterren(bron.titel)} – Bibliotheek`);
  }

  if (bron.collectie === 'start') {
    toonStartbron(container, ctx, kruimel, bron, gebruik);
    return;
  }
  toonFormulier(container, ctx, kruimel, bron, gebruik, isNieuw);
}

// ---------- Gedeeld: verwijzingen en gebruik ----------

function verwijzingKaart(bron, { nieuw = false } = {}) {
  const apa = h('p', { class: 'bb-apa-groot' });
  const haakjes = h('span', {});
  const zin = h('span', {});
  const code = h('p', { class: 'klein' });
  const werkBij = (b) => {
    vervang(apa, inline(apaVerwijzing(b)));
    haakjes.textContent = apaInTekst([{ bron: b }]);
    zin.textContent = apaInTekst([{ bron: b }], { verhalend: true });
    code.textContent = nieuw
      ? `De code voor een rapport krijgt de bron bij het opslaan, bijvoorbeeld [@${citeersleutelBasis(b)}].`
      : `Code: [@${b.citeersleutel}] (verandert niet)`;
  };
  werkBij(bron);
  const el = h('section', { class: 'kaart bb-voorbeeld', 'aria-labelledby': 'bb-vb-kop' },
    h('h2', { id: 'bb-vb-kop' }, 'Zo komt de bron in de literatuurlijst'),
    apa,
    h('dl', { class: 'bb-vormen' },
      h('div', {}, h('dt', {}, 'Tussen haakjes'), h('dd', {}, haakjes)),
      h('div', {}, h('dt', {}, 'In de zin'), h('dd', {}, zin))),
    code);
  return { el, werkBij };
}

function gebruikKaart(bron, gebruik) {
  return h('section', { class: 'kaart', 'aria-labelledby': 'bb-gebruik-kop' },
    h('h2', { id: 'bb-gebruik-kop' }, 'Gebruikt in'),
    gebruik.onderzoeken.length
      ? h('ul', { class: 'bb-gebruik' }, gebruik.onderzoeken.map((o) => h('li', {},
        h('a', { href: `#/onderzoek/${o.id}/rapport/bronnen` }, o.titel), ` (${o.bedrijfsnaam})`, o.notitie ? h('span', { class: 'zacht' }, ` – ${o.notitie}`) : null)))
      : h('p', { class: 'zacht' }, 'Deze bron is nog niet aan een onderzoek gekoppeld.'),
    gebruik.rapporten.length
      ? [h('h3', {}, 'Genoemd in rapporten'), h('ul', { class: 'bb-gebruik' }, gebruik.rapporten.map((r) => h('li', {},
        h('a', { href: `#/onderzoek/${r.onderzoek_id}/rapport/${r.id}` }, r.titel), ` (${r.onderzoek_titel})`)))]
      : null);
}

// ---------- Startbron: alleen-lezen ----------

function toonStartbron(container, ctx, kruimel, bron, gebruik) {
  const d = bron.details || {};
  const ber = BETROUWBAARHEID[bron.betrouwbaarheid] || BETROUWBAARHEID.onbekend;
  const notitieId = uniekeId('bb-notitie');
  const notities = h('textarea', { id: notitieId, rows: 5, maxlength: LIMIETEN.notities }, bron.notities || '');
  const bewaar = h('button', { type: 'button', class: 'knop knop-primair knop-klein' }, 'Notities opslaan');
  const veldRij = (label, waarde) => (waarde ? h('div', {}, h('dt', {}, label), h('dd', {}, waarde)) : null);
  const detailRijen = [...(DETAILVELDEN[bron.soort] || []), ...DETAILVELDEN.alle].map((v) => {
    const w = d[v.sleutel];
    if (!w || (Array.isArray(w) && !w.length)) return null;
    const tekst = Array.isArray(w) ? w.map((a) => [a.voorletters, a.tussenvoegsel, a.achternaam].filter(Boolean).join(' ')).join(', ')
      : v.type === 'datum' ? nlDatumKort(w) || w : w;
    return veldRij(v.label, tekst);
  });
  const verbergKnop = h('button', {
    type: 'button',
    class: 'knop',
    onclick: async () => {
      try {
        await api.put(`/bibliotheek/${bron.id}/verbergen`, { verborgen: !bron.verborgen });
        bibliotheekGewijzigd();
        meld(bron.verborgen ? 'De bron staat weer in de lijst.' : 'De bron is verborgen. Met "Startcollectie terugzetten" in de bibliotheek komt hij terug.', 'succes');
        ctx.navigeer(`#/bibliotheek/${bron.id}`);
      } catch (e) {
        meldFout(e);
      }
    },
  }, bron.verborgen ? 'Weer tonen' : 'Verbergen');
  const kopieKnop = h('button', {
    type: 'button',
    class: 'knop',
    onclick: async () => {
      try {
        const r = await api.post(`/bibliotheek/${bron.id}/kopie`, {});
        bibliotheekGewijzigd();
        meld(`Eigen kopie gemaakt (code [@${r.citeersleutel}]). Je kunt hem nu aanpassen.`, 'succes');
        ctx.navigeer(`#/bibliotheek/${r.id}`);
      } catch (e) {
        meldFout(e);
      }
    },
  }, 'Eigen kopie maken');
  bewaar.addEventListener('click', async () => {
    bewaar.disabled = true;
    try {
      const r = await api.put(`/bibliotheek/${bron.id}`, { bron: { notities: notities.value }, bijgewerkt_op: bron.bijgewerkt_op });
      bron.bijgewerkt_op = r.bijgewerkt_op;
      bron.notities = notities.value;
      bibliotheekGewijzigd();
      meld('Notities opgeslagen.', 'succes');
    } catch (e) {
      meldFout(e);
    } finally {
      bewaar.disabled = false;
    }
  });
  window.addEventListener('beforeunload', bijSluiten);
  function bijSluiten(e) {
    if (notities.value === (bron.notities || '')) return;
    e.preventDefault();
    e.returnValue = '';
  }
  ctx.bijVertrek(async () => {
    window.removeEventListener('beforeunload', bijSluiten);
    if (notities.value !== (bron.notities || '') && await bevestig({ titel: 'Notities opslaan?', tekst: 'Je hebt je eigen notities bij deze bron aangepast, maar nog niet opgeslagen.', knop: 'Opslaan' })) {
      try {
        await api.put(`/bibliotheek/${bron.id}`, { bron: { notities: notities.value }, bijgewerkt_op: bron.bijgewerkt_op });
        bibliotheekGewijzigd();
        meld('Notities opgeslagen.', 'succes');
      } catch (e) {
        meldFout(e);
      }
    }
  });

  const { el: voorbeeld } = verwijzingKaart(bron);
  vervang(container,
    kruimel,
    h('div', { class: 'paginakop' },
      h('div', {},
        h('p', { class: 'bovenschrift' }, bronMeta(bron), ' ', h('span', { class: 'label label-primair' }, 'Startcollectie'),
          bron.verborgen ? [' ', h('span', { class: 'label label-waarschuwing' }, 'verborgen')] : null),
        h('h1', {}, zonderSterren(bron.titel)),
        auteursRegel(bron) ? h('p', { class: 'ondertitel' }, auteursRegel(bron)) : null),
      h('div', { class: 'knoppen' },
        h('button', { type: 'button', class: 'knop knop-primair', onclick: () => citeerDialoog(bron) }, 'Citeer'),
        h('button', { type: 'button', class: 'knop', onclick: async () => { if (await koppelDialoog(bron)) ctx.navigeer(`#/bibliotheek/${bron.id}`); } }, 'Koppel aan onderzoek'),
        openKnop(bron))),
    melding('Deze bron komt uit de startcollectie en is gecontroleerd door een onderzoeksteam. Daarom kun je hem niet aanpassen. Wel kun je eigen notities toevoegen, hem koppelen aan een onderzoek of verbergen. Wil je iets veranderen? Maak dan een eigen kopie.'),
    h('div', { class: 'bb-detail' },
      h('div', {},
        voorbeeld,
        bron.samenvatting || (bron.kernpunten || []).length
          ? h('section', { class: 'kaart', 'aria-labelledby': 'bb-inh-kop' },
            h('h2', { id: 'bb-inh-kop' }, 'Inhoud'),
            bron.samenvatting ? h('p', { class: 'bb-tekst' }, bron.samenvatting) : null,
            (bron.kernpunten || []).length ? [h('h3', {}, 'Kernpunten'), h('ul', {}, bron.kernpunten.map((k) => h('li', {}, k)))] : null)
          : null,
        h('section', { class: 'kaart', 'aria-labelledby': 'bb-geg-kop' },
          h('h2', { id: 'bb-geg-kop' }, 'Gegevens'),
          h('dl', { class: 'bb-gegevens' },
            veldRij('Soort', BRONSOORTEN[bron.soort]),
            veldRij('Jaar', Number.isInteger(bron.jaar) ? String(bron.jaar) : 'zonder datum (z.d.)'),
            veldRij('Organisatie', bron.organisatie),
            veldRij('Afkorting', bron.afkorting),
            veldRij('Taal', TALEN[bron.taal]),
            veldRij('DOI', bron.doi),
            veldRij('Link', bron.url),
            detailRijen,
            veldRij('Onderwerpen', (bron.onderwerpen || []).map((o) => ONDERWERPEN[o]?.naam || o).join(', ')),
            veldRij('Trefwoorden', (bron.trefwoorden || []).join(', ')),
            veldRij('Betrouwbaarheid', `${ber.naam}${bron.betrouwbaarheid_toelichting ? `: ${bron.betrouwbaarheid_toelichting}` : ''}`)))),
      h('div', {},
        h('section', { class: 'kaart', 'aria-labelledby': 'bb-not-kop' },
          h('h2', { id: 'bb-not-kop' }, 'Eigen notities'),
          h('div', { class: 'veld' }, h('label', { for: notitieId }, 'Notities'), notities,
            h('div', { class: 'veld-hulp' }, 'Alleen voor jou. Notities komen nooit in een rapport, een deellink of een RIS-bestand.')),
          h('div', { class: 'knoppen' }, bewaar)),
        h('section', { class: 'kaart', 'aria-labelledby': 'bb-act-kop' },
          h('h2', { id: 'bb-act-kop' }, 'Aanpassen of verbergen'),
          h('p', { class: 'klein' }, 'Een eigen kopie kun je helemaal aanpassen. In rapporten die deze bron al noemen, blijft de bron uit de startcollectie staan.'),
          h('div', { class: 'knoppen' }, kopieKnop, verbergKnop)),
        gebruikKaart(bron, gebruik))));
}

// ---------- Eigen bron: formulier ----------

/** Rijen met personen (auteurs of redacteuren): Achternaam, Tussenvoegsel, Voorletters, ↑ ↓ ×. */
function personenEditor(lijst, { label, toevoegTekst, hulp = null, bijWijziging }) {
  const houder = h('div', { class: 'bb-personen' });
  const rijenEl = h('ol', { class: 'bb-personen-lijst' });
  const teken = () => {
    rijenEl.replaceChildren(...lijst.map((p, i) => {
      const veld = (sleutel, tekst, max, placeholder = null) => {
        const id = uniekeId('bb-p');
        const el = h('input', { id, type: 'text', value: p[sleutel] || '', maxlength: max, autocomplete: 'off', placeholder });
        el.addEventListener('input', () => {
          p[sleutel] = el.value;
          bijWijziging();
        });
        return h('div', { class: 'bb-persoon-veld' }, h('label', { for: id, class: 'klein' }, tekst), el);
      };
      const knop = (tekst, aria, fn, uit) => h('button', { type: 'button', class: 'knop knop-icoon knop-klein', 'aria-label': aria, disabled: uit, onclick: fn }, tekst);
      return h('li', { class: 'bb-persoon' },
        veld('achternaam', 'Achternaam', LIMIETEN.achternaam),
        veld('tussenvoegsel', 'Tussenvoegsel', LIMIETEN.tussenvoegsel, 'bijv. de, van der'),
        veld('voorletters', 'Voorletters', LIMIETEN.voorletters, 'bijv. A. B.'),
        h('div', { class: 'bb-persoon-knoppen' },
          knop('↑', `${label} ${i + 1} omhoog`, () => { [lijst[i - 1], lijst[i]] = [lijst[i], lijst[i - 1]]; teken(); bijWijziging(); }, i === 0),
          knop('↓', `${label} ${i + 1} omlaag`, () => { [lijst[i + 1], lijst[i]] = [lijst[i], lijst[i + 1]]; teken(); bijWijziging(); }, i === lijst.length - 1),
          knop('×', `${label} ${i + 1} verwijderen`, () => { lijst.splice(i, 1); teken(); bijWijziging(); }, false)));
    }));
  };
  teken();
  const voeg = h('button', {
    type: 'button',
    class: 'knop knop-klein',
    onclick: () => {
      lijst.push({ achternaam: '', tussenvoegsel: '', voorletters: '' });
      teken();
      rijenEl.lastElementChild?.querySelector('input')?.focus();
      bijWijziging();
    },
  }, toevoegTekst);
  houder.append(h('p', { class: 'veld-label' }, label), rijenEl, h('div', { class: 'knoppen' }, voeg), hulp ? h('div', { class: 'veld-hulp' }, hulp) : null);
  return { el: houder, teken };
}

function toonFormulier(container, ctx, kruimel, origineel, gebruik, isNieuw) {
  const bron = kopie({ ...legeBron(origineel.soort), ...origineel });
  bron.details = bron.details || {};
  if (!Array.isArray(bron.details.redacteuren)) bron.details.redacteuren = [];
  let opgeslagen = JSON.stringify(schoonVoorOpslaan(bron));
  const fout = h('div', { class: 'veld-fout', role: 'alert' });
  const { el: voorbeeldEl, werkBij: werkVoorbeeldBij } = verwijzingKaart(bron, { nieuw: isNieuw });
  const isVuil = () => JSON.stringify(schoonVoorOpslaan(bron)) !== opgeslagen;
  const gewijzigd = () => werkVoorbeeldBij({ ...schoonVoorOpslaan(bron), citeersleutel: origineel.citeersleutel });

  const id = (n) => `bb-veld-${n}`;
  const tekstVeld = (sleutel, label, { max = 300, hulp = null, type = 'text', inputmode = null, placeholder = null, waarde = bron[sleutel], bij = (v) => { bron[sleutel] = v; } } = {}) => {
    const el = h('input', { id: id(sleutel), type, value: waarde ?? '', maxlength: max, autocomplete: 'off', inputmode, placeholder });
    el.addEventListener('input', () => {
      bij(el.value);
      gewijzigd();
    });
    return { veld: h('div', { class: 'veld' }, h('label', { for: id(sleutel) }, label), el, hulp ? h('div', { class: 'veld-hulp' }, hulp) : null), el };
  };
  const tekstVak = (sleutel, label, { max, hulp = null, rijen = 4, waarde = bron[sleutel], bij = (v) => { bron[sleutel] = v; } } = {}) => {
    const el = h('textarea', { id: id(sleutel), rows: rijen, maxlength: max }, waarde ?? '');
    el.addEventListener('input', () => {
      bij(el.value);
      gewijzigd();
    });
    return { veld: h('div', { class: 'veld' }, h('label', { for: id(sleutel) }, label), el, hulp ? h('div', { class: 'veld-hulp' }, hulp) : null), el };
  };

  // 1. Soort
  const soortSel = h('select', { id: id('soort') }, Object.entries(BRONSOORTEN).map(([k, l]) => h('option', { value: k, selected: bron.soort === k }, l)));
  // 2. Gegevens
  const titel = tekstVeld('titel', 'Titel', { max: LIMIETEN.titel });
  const auteurs = personenEditor(bron.auteurs, {
    label: 'Auteurs',
    toevoegTekst: '+ Auteur toevoegen',
    hulp: 'Is een organisatie de auteur, zoals CBS of TNO? Laat de auteurs leeg en vul hieronder de organisatie in.',
    bijWijziging: gewijzigd,
  });
  const organisatie = tekstVeld('organisatie', 'Organisatie of uitgever', { max: LIMIETEN.organisatie });
  const afkorting = tekstVeld('afkorting', 'Afkorting voor in de tekst (bijv. CBS)', { max: LIMIETEN.afkorting });
  const jaar = tekstVeld('jaar', 'Jaar', {
    max: 4, inputmode: 'numeric', waarde: Number.isInteger(bron.jaar) ? String(bron.jaar) : '',
    hulp: 'Leeg laten als er geen datum is; in de verwijzing staat dan z.d. (zonder datum).',
    bij: (v) => { bron.jaar = v.trim() && /^\d{4}$/.test(v.trim()) ? Number(v.trim()) : v.trim() ? v.trim() : null; },
  });
  const detailHouder = h('div', {});
  let redacteuren = null;
  function tekenDetails() {
    const velden = DETAILVELDEN[bron.soort] || [];
    redacteuren = null;
    vervang(detailHouder, velden.map((v) => {
      if (v.type === 'auteurs') {
        redacteuren = personenEditor(bron.details.redacteuren, { label: v.label, toevoegTekst: '+ Redacteur toevoegen', bijWijziging: gewijzigd });
        return h('div', { class: 'veld' }, redacteuren.el);
      }
      if (v.type === 'keuze') {
        const sel = h('select', { id: id(`d-${v.sleutel}`) }, h('option', { value: '' }, '–'), v.opties.map((o) => h('option', { value: o, selected: bron.details[v.sleutel] === o }, o)));
        sel.addEventListener('change', () => {
          bron.details[v.sleutel] = sel.value;
          gewijzigd();
        });
        return h('div', { class: 'veld' }, h('label', { for: sel.id }, v.label), sel);
      }
      return tekstVeld(`d-${v.sleutel}`, v.label, {
        max: LIMIETEN.detail,
        waarde: bron.details[v.sleutel],
        hulp: v.type === 'datum' ? (v.sleutel === 'datum' ? 'Als JJJJ-MM-DD of JJJJ-MM, bijvoorbeeld 2024-03-05.' : 'Als JJJJ-MM-DD, bijvoorbeeld 2026-11-20.') : v.hulp || null,
        placeholder: v.type === 'datum' ? 'JJJJ-MM-DD' : null,
        bij: (w) => { bron.details[v.sleutel] = w; },
      }).veld;
    }));
  }
  tekenDetails();
  soortSel.addEventListener('change', () => {
    bron.soort = soortSel.value;
    tekenDetails();
    gewijzigd();
  });
  // 3. Vindplaats
  const url = tekstVeld('url', 'Link (URL)', { max: LIMIETEN.url, type: 'url', placeholder: 'https://…' });
  const doi = tekstVeld('doi', 'DOI', { max: LIMIETEN.doi, placeholder: '10.1037/ocp0000056', hulp: 'Staat er een DOI bij de bron? Die heeft de voorkeur boven een link.' });
  // 4. Inhoud
  const samenvatting = tekstVak('samenvatting', 'Samenvatting', { max: LIMIETEN.samenvatting, rijen: 6 });
  const kernpunten = tekstVak('kernpunten', 'Kernpunten', {
    max: LIMIETEN.kernpunten * (LIMIETEN.kernpunt + 1), rijen: 5, waarde: (bron.kernpunten || []).join('\n'),
    hulp: 'Eén punt per regel, maximaal 10.', bij: (v) => { bron.kernpunten = v.split('\n').map((x) => x.trim()).filter(Boolean); },
  });
  const onderwerpenEl = h('fieldset', { class: 'veld bb-onderwerpen' }, h('legend', {}, 'Onderwerpen'),
    Object.entries(ONDERWERPEN).map(([k, o]) => {
      const vak = h('input', { type: 'checkbox', checked: bron.onderwerpen.includes(k) });
      vak.addEventListener('change', () => {
        bron.onderwerpen = vak.checked ? [...bron.onderwerpen, k] : bron.onderwerpen.filter((x) => x !== k);
        gewijzigd();
      });
      return h('label', { class: 'keuze' }, vak, h('span', {}, o.naam));
    }));
  const trefwoorden = tekstVeld('trefwoorden', 'Trefwoorden', {
    max: 1300, waarde: (bron.trefwoorden || []).join(', '), hulp: 'Gescheiden door komma\'s.',
    bij: (v) => { bron.trefwoorden = v.split(',').map((x) => x.trim()).filter(Boolean); },
  });
  const taalSel = h('select', { id: id('taal') }, Object.entries(TALEN).map(([k, l]) => h('option', { value: k, selected: bron.taal === k }, l)));
  taalSel.addEventListener('change', () => {
    bron.taal = taalSel.value;
    gewijzigd();
  });
  // 5. Beoordeling
  const betrNaam = uniekeId('bb-betr');
  const betrEl = h('fieldset', { class: 'veld' }, h('legend', {}, 'Betrouwbaarheid'),
    Object.entries(BETROUWBAARHEID).map(([k, b]) => {
      const r = h('input', { type: 'radio', name: betrNaam, value: k, checked: bron.betrouwbaarheid === k });
      r.addEventListener('change', () => {
        bron.betrouwbaarheid = k;
        gewijzigd();
      });
      return h('label', { class: 'keuze' }, r, h('span', {}, h('strong', {}, b.naam), b.uitleg ? h('span', { class: 'zacht' }, ` – ${b.uitleg}`) : null));
    }));
  const toelichting = tekstVeld('betrouwbaarheid_toelichting', 'Toelichting', { max: LIMIETEN.betrouwbaarheid_toelichting });
  // 6. Notities
  const notities = tekstVak('notities', 'Eigen notities', { max: LIMIETEN.notities, hulp: 'Alleen voor jou. Notities komen nooit in een rapport, een deellink of een RIS-bestand.' });

  // "Plak een verwijzing": vult de velden; alles blijft aanpasbaar.
  const plak = plakVerwijzing((r) => {
    const b = r.bron;
    Object.assign(bron, {
      soort: b.soort, titel: b.titel, auteurs: b.auteurs, organisatie: b.organisatie, jaar: b.jaar, taal: b.taal,
      url: b.url, doi: b.doi, details: { redacteuren: [], ...b.details },
    });
    soortSel.value = bron.soort;
    titel.el.value = bron.titel;
    organisatie.el.value = bron.organisatie;
    jaar.el.value = Number.isInteger(bron.jaar) ? String(bron.jaar) : '';
    url.el.value = bron.url;
    doi.el.value = bron.doi;
    taalSel.value = bron.taal;
    // De editor van de auteurs werkt op de lijst zelf: die vervangen we door een nieuwe editor.
    const nieuw = personenEditor(bron.auteurs, { label: 'Auteurs', toevoegTekst: '+ Auteur toevoegen', hulp: 'Is een organisatie de auteur, zoals CBS of TNO? Laat de auteurs leeg en vul hieronder de organisatie in.', bijWijziging: gewijzigd });
    auteursVak.replaceChildren(nieuw.el);
    tekenDetails();
    gewijzigd();
  }, { open: isNieuw });
  const auteursVak = h('div', { class: 'veld' }, auteurs.el);

  const opslaanKnop = h('button', { type: 'button', class: 'knop knop-primair' }, 'Opslaan');
  const verwijderKnop = isNieuw ? null : h('button', { type: 'button', class: 'knop knop-gevaar' }, 'Verwijderen');

  async function slaOp({ stil = false } = {}) {
    fout.textContent = '';
    const s = schoonVoorOpslaan(bron);
    if (!s.titel) return toonFout('Vul de titel van de bron in.', titel.el);
    if (s.jaar !== null && !Number.isInteger(s.jaar)) return toonFout('Het jaar moet tussen 1800 en 2200 liggen, of leeg zijn (zonder datum).', jaar.el);
    if (isNieuw && !stil) {
      // Staat deze bron er al in (zelfde DOI, of zelfde titel en jaar)? Dan eerst vragen.
      let zelfde = null;
      try {
        zelfde = dubbeleVan(s, (await haalBibliotheek()).bronnen);
      } catch { /* zonder controle verder */ }
      if (zelfde && !(await bevestig({
        titel: 'Deze bron staat er misschien al in',
        tekst: `In je bibliotheek staat al "${zonderSterren(zelfde.titel)}"${Number.isInteger(zelfde.jaar) ? ` (${zelfde.jaar})` : ''}. Wil je deze bron toch apart toevoegen?`,
        knop: 'Toch toevoegen',
      }))) return 'dubbel';
    }
    opslaanKnop.disabled = true;
    try {
      if (isNieuw) {
        const r = await api.post('/bibliotheek', { bron: s });
        opgeslagen = JSON.stringify(s);
        bibliotheekGewijzigd();
        if (!stil) {
          meld(`Bron toegevoegd (code [@${r.citeersleutel}]).`, 'succes');
          ctx.navigeer(`#/bibliotheek/${r.id}`);
        }
      } else {
        const r = await api.put(`/bibliotheek/${origineel.id}`, { bron: s, bijgewerkt_op: origineel.bijgewerkt_op });
        origineel.bijgewerkt_op = r.bijgewerkt_op;
        opgeslagen = JSON.stringify(s);
        bibliotheekGewijzigd();
        if (!stil) meld('Bron opgeslagen.', 'succes');
      }
      return null;
    } catch (e) {
      fout.textContent = e.message;
      if (!stil) meldFout(e);
      return e.message;
    } finally {
      opslaanKnop.disabled = false;
    }
  }
  function toonFout(tekst, el) {
    fout.textContent = tekst;
    el?.focus();
    return tekst;
  }
  opslaanKnop.addEventListener('click', () => slaOp());
  verwijderKnop?.addEventListener('click', async () => {
    const rapporten = gebruik.rapporten || [];
    const tekst = rapporten.length
      ? `Deze bron wordt genoemd in ${aantal(rapporten.length, 'rapport', 'rapporten')}: ${rapporten.map((r) => r.titel).join(', ')}. Verwijder je hem, dan staat in die rapporten de code [@${origineel.citeersleutel}] zonder verwijzing. Toch verwijderen?`
      : 'De bron verdwijnt uit de bibliotheek en uit de onderzoeken waaraan hij gekoppeld is. Dit kun je niet ongedaan maken.';
    if (!(await bevestig({ titel: 'Bron verwijderen?', tekst, knop: 'Verwijderen', gevaar: true }))) return;
    try {
      await api.del(`/bibliotheek/${origineel.id}`, { bevestigd: true });
      opgeslagen = JSON.stringify(schoonVoorOpslaan(bron));
      bibliotheekGewijzigd();
      meld('Bron verwijderd.');
      ctx.navigeer('#/bibliotheek');
    } catch (e) {
      meldFout(e);
    }
  });

  const bijSluiten = (e) => {
    if (!isVuil()) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', bijSluiten);
  ctx.bijVertrek(async () => {
    window.removeEventListener('beforeunload', bijSluiten);
    if (!isVuil()) return;
    const keuze = await new Promise((klaar) => {
      let k = 'weggooien';
      const knop = (tekst, waarde, klasse = '') => h('button', { type: 'button', class: `knop ${klasse}`, onclick: () => { k = waarde; d.close(); } }, tekst);
      const d = maakDialoog('Wijzigingen opslaan?', h('p', {}, 'Je hebt wijzigingen in deze bron die nog niet zijn opgeslagen.'),
        [knop('Niet opslaan', 'weggooien'), knop('Opslaan', 'opslaan', 'knop-primair')]);
      d.addEventListener('close', () => klaar(k));
      d.showModal();
    });
    if (keuze === 'opslaan') {
      const f = await slaOp({ stil: true });
      meld(f ? `Opslaan is niet gelukt: ${f}` : 'Bron opgeslagen.', f ? 'fout' : 'succes');
    }
  });

  const sectie = (kop, ...kinderen) => {
    const kopId = uniekeId('bb-sectie');
    return h('section', { class: 'kaart', 'aria-labelledby': kopId }, h('h2', { id: kopId }, kop), kinderen);
  };
  vervang(container,
    kruimel,
    h('div', { class: 'paginakop' },
      h('div', {},
        isNieuw ? null : h('p', { class: 'bovenschrift' }, bronMeta(origineel), ' ', h('span', { class: 'label' }, 'Eigen bron'), origineel.kopie_van ? [' ', h('span', { class: 'label' }, 'eigen kopie')] : null),
        h('h1', {}, isNieuw ? 'Bron toevoegen' : zonderSterren(origineel.titel))),
      isNieuw ? null : h('div', { class: 'knoppen' },
        h('button', { type: 'button', class: 'knop', onclick: () => citeerDialoog(origineel) }, 'Citeer'),
        h('button', { type: 'button', class: 'knop', onclick: async () => { if (await koppelDialoog(origineel)) ctx.navigeer(`#/bibliotheek/${origineel.id}`); } }, 'Koppel aan onderzoek'),
        openKnop(origineel))),
    origineel.kopie_van ? melding('Dit is je eigen kopie van een bron uit de startcollectie. Je kunt hem aanpassen; de bron in de startcollectie blijft zoals hij is.') : null,
    h('div', { class: 'bb-detail' },
      h('div', { class: 'bb-formulier' },
        h('section', { class: 'kaart' }, plak),
        sectie('Wat voor bron is het?', h('div', { class: 'veld' }, h('label', { for: id('soort') }, 'Soort bron'), soortSel)),
        sectie('Gegevens voor de verwijzing', titel.veld, auteursVak, organisatie.veld, afkorting.veld, jaar.veld, detailHouder),
        sectie('Vindplaats', url.veld, doi.veld, h('p', { class: 'klein zacht' }, 'De app zoekt niets op internet op: vul de gegevens zelf in of plak een verwijzing.')),
        sectie('Inhoud', samenvatting.veld, kernpunten.veld, onderwerpenEl, trefwoorden.veld, h('div', { class: 'veld' }, h('label', { for: id('taal') }, 'Taal'), taalSel)),
        sectie('Beoordeling', betrEl, toelichting.veld),
        sectie('Eigen notities', notities.veld),
        h('div', { class: 'bb-opslaan' }, fout, h('div', { class: 'knoppen' }, opslaanKnop, verwijderKnop))),
      h('div', { class: 'bb-zijkant' }, voorbeeldEl, isNieuw ? null : gebruikKaart(origineel, gebruik))));
  gewijzigd();
  if (isNieuw) titel.el.focus();
}

/** De bron zoals hij naar de server gaat: lege personen weg, lege details weg, jaar als getal of null. */
function schoonVoorOpslaan(bron) {
  const personen = (lijst) => (lijst || []).map((p) => ({ achternaam: (p.achternaam || '').trim(), tussenvoegsel: (p.tussenvoegsel || '').trim(), voorletters: (p.voorletters || '').trim() }))
    .filter((p) => p.achternaam);
  const details = {};
  for (const v of [...(DETAILVELDEN[bron.soort] || []), ...DETAILVELDEN.alle]) {
    const w = bron.details?.[v.sleutel];
    if (v.type === 'auteurs') {
      const p = personen(w);
      if (p.length) details[v.sleutel] = p;
    } else if (w !== undefined && w !== null && String(w).trim()) details[v.sleutel] = String(w).trim();
  }
  const jaarTekst = bron.jaar === null || bron.jaar === undefined ? '' : String(bron.jaar).trim();
  return {
    soort: bron.soort,
    titel: (bron.titel || '').trim(),
    auteurs: personen(bron.auteurs),
    organisatie: (bron.organisatie || '').trim(),
    afkorting: (bron.afkorting || '').trim(),
    jaar: jaarTekst === '' ? null : /^\d{4}$/.test(jaarTekst) && Number(jaarTekst) >= 1800 && Number(jaarTekst) <= 2200 ? Number(jaarTekst) : NaN,
    taal: bron.taal || 'nl',
    url: (bron.url || '').trim(),
    doi: (bron.doi || '').trim(),
    details,
    onderwerpen: [...(bron.onderwerpen || [])],
    trefwoorden: [...(bron.trefwoorden || [])],
    samenvatting: (bron.samenvatting || '').trim(),
    kernpunten: [...(bron.kernpunten || [])].slice(0, LIMIETEN.kernpunten),
    betrouwbaarheid: bron.betrouwbaarheid || 'onbekend',
    betrouwbaarheid_toelichting: (bron.betrouwbaarheid_toelichting || '').trim(),
    notities: bron.notities || '',
  };
}
