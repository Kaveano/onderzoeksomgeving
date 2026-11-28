// "Personeelsbestand toevoegen" (BOUWPLAN B4, §4 P3 "Personnel import"; D1 §5.3).
// Het bestand (één rij per medewerker) wordt in de BROWSER gelezen en verwerkt (verwerkPersoneel in
// personeel-regels.js). Naar de server gaan alleen groepscijfers: aantallen en totalen per groep, met het verzuim al
// afgeschermd. Namen, personeelsnummers, geboortedatums en rijen per medewerker verlaten de browser nooit.
//
// In de dialoog:
// - per kolom "Wat staat in deze kolom?" (vooraf ingevuld waar de kolomnaam bekend is; kolommen met namen of
//   nummers kunnen geen rol krijgen);
// - de periode van de verzuim- en vertrekgegevens, uren per fte, de naam en "Bewaren tot" (standaard 6 maanden);
// - de vraag of zwangerschaps- en bevallingsverlof meetellen (K S4);
// - per indeling (afdeling, locatie …) welke waarde in het bestand bij welk antwoord van de vragenlijst hoort, en
//   welke reden van vertrek bij welke vaste reden hoort; dat gebeurt nu, bij het inlezen;
// - een voorbeeld van wat er bewaard wordt.

import { api } from '../api.js';
import { h, vervang, melding, aantal, uniekeId, vandaag } from '../ui.js';
import { inleesDialoog } from './inlezen-kaart.js';
import { verdachteKolommen, normaal } from '../inlees-regels.js';
import {
  ROLLEN, REDENEN, DIMENSIE_VAN_KENMERK, verwerkPersoneel, herkenRollen, herkenReden, grenzenVoorVragen, ongekoppeldeGroepen, MAX_MAANDEN,
} from '../personeel-regels.js';
import { ZWANGERSCHAP_VRAAG } from '../hr-rapport.js';
import { haalGegevens, vergeetGegevens } from '../gegevens.js';
import { bewaarHrInstellingen } from './hr-instellingen.js';
import { KENMERKEN } from '../kenmerken.js';

/** Standaard bewaren: 6 maanden na vandaag (zoals de server, src/routes/hr.js standaardBewarenTot). */
export const STANDAARD_BEWAREN_MAANDEN = 6;
export const BEWAAR_ZIN = 'Er worden alleen groepscijfers bewaard (aantallen en totalen per groep), geen gegevens per medewerker.';
const CATEGORIE_DIMENSIES = ['afdeling', 'locatie', 'contract', 'functieniveau', 'opleiding'];
const MAX_KOPPELEN = 60;
const ROL_VOLGORDE = ['afdeling', 'locatie', 'functieniveau', 'contract', 'opleiding', 'geslacht', 'leidinggevend', 'leeftijd', 'geboortedatum', 'geboortejaar',
  'datum_in', 'datum_uit', 'reden_uit', 'fte', 'uren', 'verzuimdagen', 'verzuimpercentage', 'verzuimmeldingen'];
const MAG_PERSOONSKOLOM = new Set(['geboortedatum', 'geboortejaar']);

/** Een datum (JJJJ-MM-DD) een aantal maanden later; de dag schuift terug als die maand korter is. */
export function maandenLater(datum, maanden) {
  const [j, m, d] = datum.split('-').map(Number);
  const doel = new Date(Date.UTC(j, m - 1 + maanden, 1));
  const laatste = new Date(Date.UTC(doel.getUTCFullYear(), doel.getUTCMonth() + 1, 0)).getUTCDate();
  doel.setUTCDate(Math.min(d, laatste));
  return doel.toISOString().slice(0, 10);
}

/** De standaardperiode: de 12 maanden tot en met vorige maand. */
export function standaardPeriode(vandaagIso = vandaag()) {
  const [j, m] = vandaagIso.split('-').map(Number);
  const nr = j * 12 + (m - 1) - 1; // vorige maand
  const tekst = (x) => `${Math.floor(x / 12)}-${String((x % 12) + 1).padStart(2, '0')}`;
  return { van: tekst(nr - 11), tot: tekst(nr) };
}

const VOORBEELD = {
  naam: 'voorbeeld-personeelsbestand.xlsx',
  bladen: [{
    naam: 'Personeel',
    rijen: [
      ['Afdeling', 'Geboortedatum', 'Geslacht', 'Fte', 'In dienst', 'Uit dienst', 'Reden uit dienst', 'Verzuimdagen', 'Ziekmeldingen'],
      ['Kantoor', '1985-04-12', 'V', 0.8, '2015-03', '', '', 10, 2],
      ['Kantoor', '1972-11-03', 'M', 1, '2010-01', '2026-02', 'Pensioen', 5, 1],
      ['Productie', '1990-07-21', 'M', 1, '2018-06', '', '', 0, 0],
      ['Productie', '1999-01-30', 'V', 0.6, '2022-09', '', '', 20, 3],
      ['Logistiek', '1964-09-15', 'M', 1, '2005-02', '', '', 4, 1],
      ['Logistiek', '1996-05-02', 'V', 0.5, '2026-05', '', '', 0, 0],
    ],
  }],
};

/**
 * Opent de dialoog. → Promise<number|null>: het id van het nieuwe personeelsbestand, of null bij annuleren.
 * opties.data: de export (gegevens.js); zonder data worden de vragen opgehaald.
 */
export async function personeelToevoegen(ctx, { data = null } = {}) {
  const onderzoekId = ctx.params.id;
  const d = data || await haalGegevens(onderzoekId);
  // Achtergrondvragen van alle vragenlijsten: hun antwoorden zijn de groepen waaraan het bestand wordt gekoppeld.
  const vragen = (d.vragen || []).map((q) => {
    let opties = q.opties;
    if (typeof opties === 'string') {
      try { opties = JSON.parse(opties || '[]'); } catch { opties = []; }
    }
    return { ...q, opties: Array.isArray(opties) ? opties : [] };
  }).filter((q) => q.kenmerk);
  const extraGrenzen = grenzenVoorVragen(vragen);
  const optieLabels = (dim) => [...new Set(vragen.filter((q) => DIMENSIE_VAN_KENMERK[q.kenmerk] === dim && q.type === 'meerkeuze').flatMap((q) => q.opties.map((o) => o.label)))];

  return inleesDialoog({
    titel: 'Personeelsbestand toevoegen',
    uitleg: 'Met een personeelsbestand zie je bij HR-analytics de kerncijfers van de hele organisatie: aantal medewerkers, fte, leeftijdsopbouw, verzuim en verloop. Ook kun je controleren of de groep die de vragenlijst invulde, lijkt op de organisatie.',
    stappen: [
      'Eén rij per medewerker; in de eerste rij de namen van de kolommen.',
      'Laat namen, personeelsnummers en adressen weg. Kolommen zonder rol worden niet bewaard.',
      'Verzuim is een gegeven over de gezondheid van medewerkers. Gebruik alleen aantallen (dagen en meldingen), nooit redenen of diagnoses, en alleen als dat met de opdrachtgever is afgesproken.',
    ],
    voorbeeld: VOORBEELD,
    knopTekst: () => 'Groepscijfers bewaren',
    bouw: ({ kop, rijen, ververs }) => {
      const persoon = new Set(verdachteKolommen(kop, rijen.slice(0, 200), { metReden: true }).filter((x) => x.reden === 'persoon').map((x) => x.kolom));
      const rollen = { ...herkenRollen(kop, rijen) }; // { kolomIndex: rol }
      const periode = standaardPeriode();
      const st = {
        naam: `Personeelsbestand ${periode.tot.slice(0, 4)}`,
        van: periode.van,
        tot: periode.tot,
        urenPerFte: '36',
        bewarenTot: maandenLater(vandaag(), STANDAARD_BEWAREN_MAANDEN),
        zwanger: null,
        koppeling: {}, // dim → { waarde: label }
        redenen: {}, // waarde → sleutel
      };
      let laatste = null; // { aggregaat }

      const kolomVan = (rol) => {
        const e = Object.entries(rollen).find(([, r]) => r === rol);
        return e ? Number(e[0]) : null;
      };
      const waardenVan = (rol) => {
        const i = kolomVan(rol);
        if (i === null) return [];
        const tel = new Map();
        for (const r of rijen) {
          const w = r[i];
          if (w === null || w === undefined || String(w).trim() === '') continue;
          const t = String(w).trim().replace(/\s+/g, ' ').slice(0, 100);
          tel.set(t, (tel.get(t) || 0) + 1);
        }
        return [...tel.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'));
      };

      // Kolommen en hun rol
      const kolommenEl = h('div', { class: 'pk-kolommen' });
      function tekenKolommen() {
        vervang(kolommenEl, kop.map((naam, i) => {
          const id = uniekeId('pk-rol');
          const voorbeeld = rijen.find((r) => r[i] !== null && r[i] !== undefined && String(r[i]).trim() !== '');
          const isPersoon = persoon.has(naam);
          const keuzes = ROL_VOLGORDE.filter((r) => !isPersoon || MAG_PERSOONSKOLOM.has(r));
          return h('div', { class: 'pk-kolom' },
            h('label', { for: id, class: 'pk-kolomnaam' }, naam,
              h('span', { class: 'pk-kolomvoorbeeld' }, isPersoon ? 'lijkt namen, nummers of contactgegevens te bevatten' : voorbeeld ? `bijv. ${String(voorbeeld[i]).slice(0, 24)}` : 'leeg')),
            h('select', {
              id,
              'aria-describedby': null,
              onchange: (e) => {
                const rol = e.target.value;
                for (const [k, r] of Object.entries(rollen)) if (r === rol) delete rollen[k];
                if (rol) rollen[i] = rol;
                else delete rollen[i];
                tekenKolommen();
                tekenKoppelingen();
                ververs();
              },
            },
            h('option', { value: '', selected: !rollen[i] }, '— niet bewaren —'),
            keuzes.map((r) => h('option', { value: r, selected: rollen[i] === r }, ROLLEN[r].label))));
        }));
      }

      // Periode, naam, uren per fte, bewaren tot
      const veld = (label, input, hulp = null) => {
        input.id = input.id || uniekeId('pk-veld');
        return h('div', { class: 'veld' }, h('label', { for: input.id }, label), input, hulp ? h('div', { class: 'veld-hulp' }, hulp) : null);
      };
      const opInvoer = (sleutel) => (e) => { st[sleutel] = e.target.value; ververs(); };
      const naamVeld = h('input', { type: 'text', maxlength: 100, value: st.naam, oninput: opInvoer('naam') });
      const vanVeld = h('input', { type: 'month', value: st.van, placeholder: 'JJJJ-MM', oninput: opInvoer('van') });
      const totVeld = h('input', { type: 'month', value: st.tot, placeholder: 'JJJJ-MM', oninput: opInvoer('tot') });
      const urenVeld = h('input', { type: 'number', min: 1, max: 60, step: 0.5, inputmode: 'decimal', value: st.urenPerFte, oninput: opInvoer('urenPerFte') });
      const bewaarVeld = h('input', { type: 'date', value: st.bewarenTot, min: vandaag(), max: maandenLater(vandaag(), 36), oninput: opInvoer('bewarenTot') });

      // Zwangerschapsverlof (alleen bij verzuimkolommen)
      const zwangerEl = h('div', {});
      function tekenZwanger() {
        if (kolomVan('verzuimdagen') === null && kolomVan('verzuimpercentage') === null) {
          vervang(zwangerEl);
          return;
        }
        const naam = uniekeId('pk-zw');
        const keuze = (waarde, tekst) => {
          const id = uniekeId('pk-zwk');
          return h('label', { class: 'keuze', for: id },
            h('input', { type: 'radio', name: naam, id, value: waarde, checked: st.zwanger === waarde, onchange: () => { st.zwanger = waarde; ververs(); } }),
            h('span', {}, tekst));
        };
        vervang(zwangerEl, h('fieldset', { class: 'pk-zwanger' },
          h('legend', {}, ZWANGERSCHAP_VRAAG),
          keuze('telt_niet', 'Nee, die dagen staan niet in het bestand'),
          keuze('telt_mee', 'Ja, die dagen tellen mee in de verzuimdagen'),
          keuze('onbekend', 'Weet ik niet')));
      }

      // Koppelen: waarden in het bestand → antwoorden van de vragenlijst; redenen van vertrek → vaste redenen
      const koppelEl = h('div', {});
      function tekenKoppelingen() {
        tekenZwanger();
        const delen = [];
        for (const dim of CATEGORIE_DIMENSIES) {
          const labels = optieLabels(dim);
          const waarden = waardenVan(dim);
          if (!labels.length || !waarden.length) continue;
          const naam = KENMERKEN[dim]?.naam || dim;
          if (waarden.length > MAX_KOPPELEN) {
            delen.push(melding(`De kolom voor ${naam.toLowerCase()} heeft meer dan ${MAX_KOPPELEN} verschillende waarden. Koppel ze dan in het bestand zelf aan de antwoorden van de vragenlijst.`, 'waarschuwing'));
            continue;
          }
          const kaart = st.koppeling[dim] || (st.koppeling[dim] = {});
          for (const [w] of waarden) {
            if (kaart[w] !== undefined) continue;
            const gelijk = labels.find((l) => normaal(l) === normaal(w));
            kaart[w] = gelijk || '';
          }
          delen.push(h('fieldset', { class: 'pk-koppel' },
            h('legend', {}, `${naam}: welk antwoord van de vragenlijst hoort bij elke waarde in het bestand?`),
            h('div', { class: 'pk-koppel-rijen' }, waarden.map(([w, n]) => {
              const id = uniekeId('pk-k');
              return h('div', { class: 'pk-koppel-rij' },
                h('label', { for: id }, `${w} `, h('span', { class: 'zacht klein' }, `(${aantal(n, 'rij', 'rijen')})`)),
                h('select', { id, onchange: (e) => { kaart[w] = e.target.value; ververs(); } },
                  h('option', { value: '', selected: !kaart[w] }, '— eigen groep (niet koppelen) —'),
                  labels.map((l) => h('option', { value: l, selected: kaart[w] === l }, l))));
            }))));
        }
        const redenen = waardenVan('reden_uit');
        if (redenen.length && redenen.length <= MAX_KOPPELEN) {
          for (const [w] of redenen) if (st.redenen[w] === undefined) st.redenen[w] = herkenReden(w) || 'overig';
          delen.push(h('fieldset', { class: 'pk-koppel' },
            h('legend', {}, 'Reden uit dienst: welke vaste reden hoort bij elke waarde in het bestand?'),
            h('div', { class: 'pk-koppel-rijen' }, redenen.map(([w, n]) => {
              const id = uniekeId('pk-r');
              return h('div', { class: 'pk-koppel-rij' },
                h('label', { for: id }, `${w} `, h('span', { class: 'zacht klein' }, `(${aantal(n, 'rij', 'rijen')})`)),
                h('select', { id, onchange: (e) => { st.redenen[w] = e.target.value; ververs(); } },
                  Object.entries(REDENEN).map(([s, l]) => h('option', { value: s, selected: st.redenen[w] === s }, l))));
            })),
            h('p', { class: 'veld-hulp' }, 'Alleen het aantal vertrekkers per reden wordt bewaard, en alleen voor de hele organisatie.')));
        }
        vervang(koppelEl, delen.length ? [h('h3', { class: 'im-kop' }, 'Koppelen aan de vragenlijst'), delen] : null);
      }

      tekenKolommen();
      tekenKoppelingen();

      const koppelingVoorVerwerken = () => Object.fromEntries(Object.entries(st.koppeling).map(([dim, kaart]) => [dim, Object.fromEntries(Object.entries(kaart).filter(([, l]) => l))]));

      return {
        inhoud: [
          h('h3', { class: 'im-kop' }, 'Wat staat in elke kolom?'),
          kolommenEl,
          h('h3', { class: 'im-kop' }, 'Periode en bewaren'),
          h('div', { class: 'formulier-rij' },
            veld('Periode van', vanVeld, 'JJJJ-MM'),
            veld('tot en met', totVeld, 'De laatste maand is ook de peildatum voor het aantal medewerkers.')),
          h('p', { class: 'veld-hulp' }, 'Periode van de verzuim- en vertrekgegevens.'),
          h('div', { class: 'formulier-rij' },
            veld('Uren per fte', urenVeld, 'staat meestal in de cao'),
            veld('Bewaren tot', bewaarVeld, 'Daarna krijg je een melding om het personeelsbestand te verwijderen.')),
          veld('Naam', naamVeld),
          zwangerEl,
          koppelEl,
        ],
        controleer: () => {
          const metRol = Object.values(rollen);
          if (!metRol.length) return { items: [], problemen: [], regel: 'Kies bij minstens één kolom wat erin staat.' };
          if (!/^\d{4}-\d{2}$/.test(st.van) || !/^\d{4}-\d{2}$/.test(st.tot)) return { items: [], problemen: [], regel: 'Vul de periode in als maand (JJJJ-MM).' };
          if (!st.naam.trim()) return { items: [], problemen: [], regel: 'Geef het personeelsbestand een naam.' };
          if (!/^\d{4}-\d{2}-\d{2}$/.test(st.bewarenTot) || st.bewarenTot < vandaag()) return { items: [], problemen: [], regel: 'Kies bij "Bewaren tot" een datum vanaf vandaag.' };
          if ((kolomVan('verzuimdagen') !== null || kolomVan('verzuimpercentage') !== null) && !st.zwanger) {
            return { items: [], problemen: [], regel: 'Beantwoord nog de vraag over zwangerschaps- en bevallingsverlof.' };
          }
          let uit;
          try {
            uit = verwerkPersoneel(kop, rijen, {
              rollen, koppeling: koppelingVoorVerwerken(), redenen: st.redenen, periode: { van: st.van, tot: st.tot },
              uren_per_fte: Number(String(st.urenPerFte).replace(',', '.')), naam: st.naam.trim(), extraGrenzen, zwangerschapsverlof: st.zwanger,
            });
          } catch (e) {
            return { items: [], problemen: [], regel: e.message };
          }
          laatste = uit;
          const a = uit.aggregaat;
          const problemen = [...uit.meldingen];
          for (const q of vragen) {
            const los = ongekoppeldeGroepen(a, q);
            for (const g of los) problemen.push(`${aantal(g.medewerkers, 'medewerker', 'medewerkers')} met de waarde '${g.label}' ${g.medewerkers === 1 ? 'is' : 'zijn'} niet gekoppeld aan een antwoord van "${q.tekst}".`);
          }
          const uniek = [...new Set(problemen)];
          const kolommen = new Set(metRol.map((r) => (r === 'geboortedatum' || r === 'geboortejaar' ? 'leeftijd' : r))).size;
          const omzetten = [];
          if (metRol.includes('geboortedatum') || metRol.includes('geboortejaar')) omzetten.push('Geboortedatums worden omgezet naar leeftijd');
          if (metRol.includes('datum_in') || metRol.includes('datum_uit')) omzetten.push('datums naar maanden');
          const regel = `${aantal(a.totaal.medewerkers, 'medewerker', 'medewerkers')} op de peildatum (${aantal(a.totaal.in_periode, 'medewerker', 'medewerkers')} in de periode) en ${aantal(kolommen, 'kolom', 'kolommen')} worden gebruikt.${omzetten.length ? ` ${omzetten.join(' en ')}.` : ''}`;
          const dims = Object.keys(a.dimensies);
          const verzuim = a.totaal.verzuim;
          return {
            items: a.totaal.in_periode > 0 ? [a] : [],
            problemen: uniek,
            regel,
            extra: h('div', { class: 'pk-voorbeeld' },
              melding(BEWAAR_ZIN, 'succes'),
              h('ul', { class: 'pk-lijst' },
                dims.length ? h('li', {}, `Groepen per ${dims.map((x) => (KENMERKEN[x]?.naam || x).toLowerCase()).join(', ')}.`) : null,
                verzuim ? h('li', {}, verzuim.toonbaar ? 'Verzuim: voor de hele organisatie en voor groepen van minstens 10 medewerkers (niet als het vooral over één persoon gaat).' : 'Verzuim: niet bewaard; de organisatie is te klein of het cijfer zou vooral over één persoon gaan.') : null,
                a.totaal.medewerkers < 5 ? h('li', {}, 'Minder dan 5 medewerkers op de peildatum: alleen de aantallen worden bewaard.') : null,
                h('li', {}, `Periode ${a.periode.van} tot en met ${a.periode.tot} (hooguit ${MAX_MAANDEN} maanden), peildatum ${a.peildatum}.`))),
          };
        },
        opslaan: async (items) => {
          const aggregaat = items[0] || laatste?.aggregaat;
          const r = await api.post(`/onderzoeken/${onderzoekId}/personeelscijfers`, { aggregaat, bewaren_tot: st.bewarenTot });
          // Het nieuwe bestand wordt het bestand van het Overzicht.
          await bewaarHrInstellingen(onderzoekId, (i) => ({ ...i, personeel: { id: r.id } }));
          vergeetGegevens(onderzoekId);
          return r.id;
        },
      };
    },
  });
}
