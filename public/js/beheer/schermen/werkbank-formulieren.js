// Werkbank, tabblad Analyseren: het menu met analyses en één formulier per analyse (D2 §11.4).
// De formulieren volgen uit de beschrijving in werkbank/definities.js (vakjes en opties); welke analyses er al
// zijn, staat in werkbank/procedures/index.js. Een nieuwe analyse (fase 5 en 6) verschijnt hier dus vanzelf.

import { h, vervang, uniekeId, meld, meldFout } from '../ui.js';
import { api } from '../api.js';
import { PROCEDURES as META, standaardOpties } from '../werkbank/definities.js';
import { beschikbaar } from '../werkbank/procedures/index.js';
import { GROEPEN, isGetal, isIndeling, isVerdeling } from '../werkbank/dataset.js';
import { variabeleSelect } from './werkbank-variabelen.js';

const KEUZE_TEKST = {
  procenten: { geen: 'Geen', rij: 'Binnen de rij', kolom: 'Binnen de kolom', totaal: 'Van het totaal' },
  verwacht: { gelijk: 'Gelijke verdeling over de groepen', aantallen: 'Aantallen die ik invul (bijvoorbeeld medewerkers)' },
  levene: { gemiddelde: 'Het gemiddelde (zoals SPSS)', mediaan: 'De mediaan (Brown-Forsythe)' },
  posthoc: { 'games-howell': 'Games-Howell (aanbevolen)', tukey: 'Tukey HSD', beide: 'Allebei', geen: 'Geen' },
  methode: { pearson: 'Pearson', spearman: 'Spearman (rangnummers)', beide: 'Allebei', pca: 'Hoofdcomponenten (PCA)', paf: 'Principale assen (PAF)' },
  ontbrekend: { paarsgewijs: 'Per paar (paarsgewijs)', lijstgewijs: 'Alleen wie alles beantwoordde (lijstgewijs)' },
  rotatie: { varimax: 'Varimax', geen: 'Geen' },
  aantal: { kaiser: 'Eigenwaarde groter dan 1 (Kaiser)' },
};
const NIET_IN_LIJST = 'Niet in de lijst? Alleen variabelen met het juiste meetniveau staan erbij. Je kunt het meetniveau aanpassen bij Variabelen.';
const GROEP_VOLGORDE = ['Beschrijven', 'Groepen vergelijken', 'Samenhang', 'Schalen', 'Voorspellen'];

// Per onderzoek: de gekozen analyse en wat er in het formulier staat.
const formulieren = new Map();

function past(slot, v) {
  if (!v || v.verwijderd || !v.analyseerbaar) return false;
  if (slot.soort === 'verdeling') return isVerdeling(v) && v.soort !== 'onbekend' && !v.lid_van;
  if (slot.soort === 'groep') return isIndeling(v) && !!v.beschermd?.bruikbaar;
  if (slot.soort === 'voorspeller') return isGetal(v) || isIndeling(v);
  return isGetal(v);
}

/** Meerdere variabelen kiezen: zoeken plus een lijst met vinkjes, met snelkeuze per thema. */
function meerdereKiezer(wb, slot, gekozen, bijWijziging) {
  const kandidaten = wb.overzicht.variabelen.filter((v) => past(slot, v));
  const zoekId = uniekeId('wb-zoek');
  const zoek = h('input', { id: zoekId, type: 'search', placeholder: 'Zoek een variabele', autocomplete: 'off' });
  const lijst = h('div', { class: 'wb-kieslijst' });
  const teller = h('span', { class: 'wb-teller zacht' });
  const teken = () => {
    const q = zoek.value.trim().toLowerCase();
    teller.textContent = `${gekozen.length} gekozen (hooguit ${slot.max})`;
    const groepen = new Map();
    for (const v of kandidaten) {
      if (q && !`${v.naam} ${v.label}`.toLowerCase().includes(q) && !gekozen.includes(v.id)) continue;
      if (!groepen.has(v.groep)) groepen.set(v.groep, []);
      groepen.get(v.groep).push(v);
    }
    vervang(lijst, Object.keys(GROEPEN).filter((g) => groepen.has(g)).map((g) => h('div', { class: 'wb-kiesgroep' },
      h('p', { class: 'wb-kiesgroep-kop' }, GROEPEN[g]),
      groepen.get(g).map((v) => {
        const id = uniekeId('wb-v');
        return h('label', { class: 'keuze wb-kies-item', for: id },
          h('input', {
            id,
            type: 'checkbox',
            checked: gekozen.includes(v.id),
            onchange: (e) => {
              if (e.target.checked) {
                if (gekozen.length >= slot.max) { e.target.checked = false; meld(`Kies hooguit ${slot.max} variabelen.`, 'waarschuwing'); return; }
                gekozen.push(v.id);
              } else gekozen.splice(gekozen.indexOf(v.id), 1);
              teller.textContent = `${gekozen.length} gekozen (hooguit ${slot.max})`;
              bijWijziging();
            },
          }),
          h('span', {}, h('span', { class: 'mono' }, v.naam), ` ${v.label}`));
      }))));
    if (!groepen.size) vervang(lijst, h('p', { class: 'zacht' }, 'Geen passende variabelen.'));
  };
  zoek.addEventListener('input', teken);
  const themas = [...new Map(kandidaten.filter((v) => v.groep === 'vraag' && v.thema_id).map((v) => [v.thema_id, wb.variabele(`t:${v.thema_id}`)?.label || `Thema ${v.thema_id}`])).entries()];
  const snel = themas.length && (slot.soort === 'item' || slot.soort === 'getal') ? h('select', {
    'aria-label': `Snel kiezen voor ${slot.label}`,
    onchange: (e) => {
      const t = Number(e.target.value);
      e.target.value = '';
      for (const v of kandidaten) if (v.thema_id === t && v.groep === 'vraag' && !gekozen.includes(v.id) && gekozen.length < slot.max) gekozen.push(v.id);
      teken();
      bijWijziging();
    },
  }, h('option', { value: '' }, 'Alle vragen van een thema…'), themas.map(([id, naam]) => h('option', { value: String(id) }, naam))) : null;
  teken();
  return h('fieldset', { class: 'wb-slot' },
    h('legend', {}, slot.label),
    h('div', { class: 'wb-slot-balk' }, h('label', { class: 'sr-only', for: zoekId }, `Zoek bij ${slot.label}`), zoek, snel, teller),
    lijst);
}

/** De opties van een analyse ("Meer opties"). waarden: object met de huidige keuzes (wordt aangepast). */
function optieVelden(wb, meta, waarden, vakken) {
  const uit = [];
  for (const [sleutel, o] of Object.entries(meta.opties)) {
    const id = uniekeId('wb-opt');
    if (o.soort === 'keuze') {
      uit.push(h('div', { class: 'veld' }, h('label', { for: id }, o.label),
        h('select', { id, onchange: (e) => { waarden[sleutel] = e.target.value; } },
          o.waarden.map((w) => h('option', { value: w, selected: (waarden[sleutel] ?? o.standaard) === w }, KEUZE_TEKST[sleutel]?.[w] || w)))));
    } else if (o.soort === 'vlag') {
      uit.push(h('label', { class: 'keuze', for: id }, h('input', { id, type: 'checkbox', checked: waarden[sleutel] ?? o.standaard, onchange: (e) => { waarden[sleutel] = e.target.checked; } }), h('span', {}, o.label)));
    } else if (o.soort === 'waarden' || o.soort === 'waarde') {
      // Groepen van de gekozen indeling (bijv. de twee groepen van een t-toets).
      const v = wb.variabele(vakken[o.van]);
      if (!v?.beschermd) continue;
      const groepen = v.beschermd.groepen.map((g) => {
        const l = v.labels.find((x) => x.label === g.labels[0]);
        return { label: g.label, waarde: l ? l.bronwaarde : null };
      }).filter((g) => g.waarde !== null);
      const aantal = o.soort === 'waarde' ? 1 : o.max;
      const huidig = Array.isArray(waarden[sleutel]) ? waarden[sleutel] : waarden[sleutel] !== undefined ? [waarden[sleutel]] : [];
      const keuzes = Array.from({ length: aantal }, (_, i) => huidig[i] ?? groepen[i]?.waarde ?? null);
      waarden[sleutel] = o.soort === 'waarde' ? keuzes[0] : keuzes;
      uit.push(h('fieldset', { class: 'wb-slot' }, h('legend', {}, o.label),
        h('div', { class: 'formulier-rij' }, keuzes.map((k, i) => {
          const gid = uniekeId('wb-g');
          return h('div', { class: 'veld' }, h('label', { for: gid }, aantal > 1 ? `Groep ${i + 1}` : 'Groep'),
            h('select', {
              id: gid,
              onchange: (e) => {
                const w = groepen.find((g) => String(g.waarde) === e.target.value)?.waarde ?? null;
                if (o.soort === 'waarde') waarden[sleutel] = w;
                else waarden[sleutel][i] = w;
              },
            }, groepen.map((g) => h('option', { value: String(g.waarde), selected: String(g.waarde) === String(k) }, g.label))));
        }))));
    } else if (o.soort === 'aantallen') {
      const v = wb.variabele(vakken[o.van]);
      if (!v?.labels?.length) continue;
      // Vooraf ingevuld uit de HR-instellingen (populatie per vraag en antwoord), als die er zijn.
      const populatie = wb.data.hr_instellingen?.populatie || {};
      const vraagIds = Object.values(v.vraagIds || {});
      const bekend = vraagIds.map((q) => populatie[q]).find(Boolean) || {};
      waarden[sleutel] = { ...(waarden[sleutel] || {}) };
      uit.push(h('fieldset', { class: 'wb-slot' }, h('legend', {}, o.label),
        h('p', { class: 'zacht' }, 'Hiermee controleer je of de respons lijkt op de organisatie: vul per groep het aantal medewerkers in.'),
        h('div', { class: 'wb-groepen-invoer' }, v.labels.map((l) => {
          const nid = uniekeId('wb-n');
          const sleutelW = String(l.bronwaarde);
          if (waarden[sleutel][sleutelW] === undefined && bekend[sleutelW] !== undefined) waarden[sleutel][sleutelW] = Number(bekend[sleutelW]);
          return h('div', { class: 'veld wb-groep-rij' }, h('label', { for: nid }, l.label),
            h('input', {
              id: nid, type: 'number', min: 0, step: 1, inputmode: 'numeric', value: waarden[sleutel][sleutelW] ?? '',
              onchange: (e) => { if (e.target.value === '') delete waarden[sleutel][sleutelW]; else waarden[sleutel][sleutelW] = Math.max(0, Number(e.target.value)); },
            }));
        }))));
    } else if (o.soort === 'refs') {
      const items = (vakken[o.van] || []).map((id) => wb.variabele(id)).filter((v) => v?.bereik);
      if (!items.length) continue;
      const set = new Set(waarden[sleutel] || []);
      uit.push(h('fieldset', { class: 'wb-slot' }, h('legend', {}, `${o.label} (vragen die andersom gesteld zijn)`),
        items.map((v) => {
          const rid = uniekeId('wb-r');
          return h('label', { class: 'keuze', for: rid }, h('input', { id: rid, type: 'checkbox', checked: set.has(v.id), onchange: (e) => { if (e.target.checked) set.add(v.id); else set.delete(v.id); waarden[sleutel] = [...set]; } }), h('span', {}, `${v.naam} ${v.label}`));
        })));
    }
  }
  return uit;
}

function menu(paneel, wb, f) {
  const groepen = new Map();
  for (const [sleutel, meta] of Object.entries(META)) {
    if (!beschikbaar(sleutel)) continue;
    if (!groepen.has(meta.groep)) groepen.set(meta.groep, []);
    groepen.get(meta.groep).push([sleutel, meta]);
  }
  vervang(paneel, h('section', { class: 'kaart wb-kaart', 'aria-labelledby': 'wb-menu-kop' },
    h('h2', { id: 'wb-menu-kop' }, 'Wat wil je weten?'),
    h('p', { class: 'zacht' }, 'Kies een analyse. Bij elke analyse staat waarvoor je hem gebruikt.'),
    GROEP_VOLGORDE.filter((g) => groepen.has(g)).map((g) => h('div', { class: 'wb-menu-groep' },
      h('h3', {}, g),
      h('ul', { class: 'wb-menu' }, groepen.get(g).map(([sleutel, meta]) => h('li', {},
        h('button', {
          type: 'button',
          class: 'wb-menu-knop',
          onclick: () => {
            f.procedure = sleutel;
            f.vakken = {};
            f.opties = standaardOpties(sleutel);
            f.bewerk = null;
            toonAnalyseren(paneel, wb);
            paneel.querySelector('h2')?.focus();
          },
        },
        h('span', { class: 'wb-menu-vraag' }, meta.vraag),
        h('span', { class: 'wb-menu-naam' }, meta.naam),
        h('span', { class: 'wb-menu-gebruik zacht' }, meta.gebruik)))))))));
}

/** Opent het formulier voor een bewaarde analyse (Mijn analyses → Aanpassen). */
export function bewerkAnalyse(wb, analyse) {
  formulieren.set(wb.onderzoekId, {
    procedure: analyse.spec.procedure,
    vakken: JSON.parse(JSON.stringify(analyse.spec.variabelen || {})),
    opties: { ...standaardOpties(analyse.spec.procedure), ...JSON.parse(JSON.stringify(analyse.spec.opties || {})) },
    bewerk: analyse,
  });
}

export function toonAnalyseren(paneel, wb) {
  if (!formulieren.has(wb.onderzoekId)) formulieren.set(wb.onderzoekId, { procedure: null, vakken: {}, opties: {}, bewerk: null });
  const f = formulieren.get(wb.onderzoekId);
  if (!f.procedure || !beschikbaar(f.procedure)) {
    menu(paneel, wb, f);
    return;
  }
  const meta = META[f.procedure];
  const bewerk = f.bewerk;
  const andereBron = bewerk && JSON.stringify(bewerk.spec.bron) !== JSON.stringify(wb.bron());
  const opnieuw = () => toonAnalyseren(paneel, wb);
  const slots = meta.slots.map((slot) => {
    if (slot.meerdere) {
      if (!Array.isArray(f.vakken[slot.sleutel])) f.vakken[slot.sleutel] = [];
      // Alleen variabelen die hier bestaan (na het wisselen van gegevens).
      f.vakken[slot.sleutel] = f.vakken[slot.sleutel].filter((id) => wb.variabele(id));
      return meerdereKiezer(wb, slot, f.vakken[slot.sleutel], () => {
        if (Object.values(meta.opties).some((o) => o.van === slot.sleutel)) tekenOpties();
      });
    }
    const id = uniekeId('wb-slot');
    const sel = variabeleSelect(wb, {
      id,
      waarde: f.vakken[slot.sleutel] || '',
      filter: (v) => past(slot, v),
      onchange: (e) => {
        f.vakken[slot.sleutel] = e.target.value || undefined;
        for (const [k, o] of Object.entries(meta.opties)) if (o.van === slot.sleutel) delete f.opties[k];
        tekenOpties();
      },
    });
    if (f.vakken[slot.sleutel] && !wb.variabele(f.vakken[slot.sleutel])) f.vakken[slot.sleutel] = undefined;
    return h('div', { class: 'veld wb-slot' }, h('label', { for: id }, slot.label), sel);
  });
  const optiesEl = h('div', { class: 'wb-opties' });
  const tekenOpties = () => vervang(optiesEl, optieVelden(wb, meta, f.opties, f.vakken));
  tekenOpties();
  const spec = () => ({
    versie: 1,
    bron: bewerk && andereBron ? bewerk.spec.bron : wb.bron(),
    filter: bewerk && andereBron ? bewerk.spec.filter : wb.st.filter,
    procedure: f.procedure,
    variabelen: Object.fromEntries(Object.entries(f.vakken).filter(([, w]) => (Array.isArray(w) ? w.length : w))),
    opties: Object.fromEntries(Object.entries(f.opties).filter(([, w]) => w !== undefined && w !== null)),
  });
  const fout = h('div', { class: 'veld-fout', role: 'alert' });
  const uitvoeren = h('button', {
    type: 'submit',
    class: 'knop knop-primair wb-uitvoeren',
    disabled: !!wb.bezig,
  }, 'Uitvoeren');
  const opslaan = bewerk && !wb.ctx.alleenLezen ? h('button', {
    type: 'button',
    class: 'knop',
    onclick: async () => {
      try {
        await api.put(`/werkbank/analyses/${bewerk.id}`, { spec: spec(), bijgewerkt_op: bewerk.bijgewerkt_op });
        meld('De bewaarde analyse is aangepast.', 'succes');
        f.bewerk = null;
        await wb.herlaadWerkbank();
      } catch (e) {
        meldFout(e);
      }
    },
  }, 'Opslaan') : null;
  const formulier = h('form', {
    class: 'wb-formulier',
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      fout.textContent = '';
      for (const slot of meta.slots) {
        const w = f.vakken[slot.sleutel];
        const n = Array.isArray(w) ? w.length : w ? 1 : 0;
        if (n < slot.min) { fout.textContent = `${slot.label}: kies ${slot.min === 1 && !slot.meerdere ? 'een variabele' : `minstens ${slot.min}`}.`; return; }
      }
      await wb.voerUit(spec());
    },
  },
  slots,
  h('p', { class: 'wb-noot zacht' }, NIET_IN_LIJST),
  Object.keys(meta.opties).length ? h('details', { class: 'wb-meer', open: !!bewerk }, h('summary', {}, 'Meer opties'), optiesEl) : null,
  fout,
  h('div', { class: 'knoppen' }, uitvoeren, opslaan));
  vervang(paneel, h('section', { class: 'kaart wb-kaart', 'aria-labelledby': 'wb-form-kop' },
    h('button', { type: 'button', class: 'knop knop-klein knop-licht wb-terug', onclick: () => { f.procedure = null; f.bewerk = null; opnieuw(); } }, '← Alle analyses'),
    h('h2', { id: 'wb-form-kop', tabindex: '-1' }, meta.vraag),
    h('p', { class: 'wb-form-naam' }, meta.naam),
    h('p', { class: 'zacht' }, meta.gebruik),
    bewerk ? h('div', { class: 'melding wb-melding-info' }, `Je past de bewaarde analyse “${bewerk.titel}” aan.${andereBron ? ' Hij gebruikt andere gegevens dan nu gekozen; die blijven zo.' : ''}`) : null,
    formulier));
}
