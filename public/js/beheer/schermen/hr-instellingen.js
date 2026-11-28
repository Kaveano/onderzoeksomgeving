// Instellingen van HR-analytics (Dashboard · Overzicht → "Instellingen"; BOUWPLAN §3.4, D1 §4.2).
// Een dialoog met vijf tabbladen:
// - Uitkomst: waarmee "Wat hangt samen met …?" rekent (eNPS, rapportcijfer, een thema of een vraag);
// - Signalen: per vraag of thema welke antwoorden ongunstig zijn en vanaf welk percentage dat een signaal is
//   (met voorstellen bij bekende sjabloonvragen; de onderzoeker bevestigt ze zelf);
// - Aantallen medewerkers: per achtergrondvraag en antwoord het aantal medewerkers (voor de respons per groep en de
//   vergelijking met de organisatie); leeg = uit het personeelsbestand;
// - Personeelsbestand: welk bestand het Overzicht gebruikt, bewaren tot, verwijderen, een nieuw bestand toevoegen;
// - Vergelijkingscijfers: zelf ingevulde cijfers om mee te vergelijken, met een bron uit de bibliotheek. Ze worden
//   nooit automatisch ingevuld (B28).
// Alles gaat in één keer naar de server (PUT /onderzoeken/:id/hr, met een controle op gelijktijdig wijzigen).
// Een personeelsbestand toevoegen, verwijderen of langer bewaren gebeurt meteen.

import { api } from '../api.js';
import { h, vervang, maakDialoog, uniekeId, melding, meld, meldFout, bevestig, vandaag } from '../ui.js';
import { bouwModel, vragenVan } from '../analyse-model.js';
import { standaardSignalen } from '../hr-analytics.js';
import { populatieVoorVraag } from '../personeel-regels.js';
import { isLieverNiet, KENMERKEN, magKenmerk } from '../kenmerken.js';
import { nlDatum, nlGetal } from '../opmaak.js';
import { vergeetGegevens } from '../gegevens.js';

export const TABS = [
  ['uitkomst', 'Uitkomst'],
  ['signalen', 'Signalen'],
  ['populatie', 'Aantallen medewerkers'],
  ['personeel', 'Personeelsbestand'],
  ['vergelijking', 'Vergelijkingscijfers'],
];
const MAX_SIGNALEN = 30;
const MAX_BENCHMARKS = 30;
const MAX_POPULATIE_VRAGEN = 20;
const SCHAAL_LABELS = {
  eens: ['Helemaal oneens', 'Oneens', 'Neutraal', 'Eens', 'Helemaal eens'],
  tevreden: ['Zeer ontevreden', 'Ontevreden', 'Neutraal', 'Tevreden', 'Zeer tevreden'],
  frequentie: ['Nooit', 'Zelden', 'Soms', 'Vaak', 'Altijd'],
  kwaliteit: ['Zeer slecht', 'Slecht', 'Voldoende', 'Goed', 'Zeer goed'],
};
const BENCHMARK_VAST = [
  ['verzuim_pct', 'Verzuimpercentage (%)'],
  ['verloop_pct', 'Verloop (%)'],
  ['respons_pct', 'Respons (%)'],
  ['enps', 'eNPS (−100 tot +100)'],
];

/**
 * Past de HR-instellingen aan op de server: haalt de huidige op, past wijzig(instellingen) toe en slaat op
 * (met de controle op gelijktijdig wijzigen). Geeft het antwoord van de server.
 */
export async function bewaarHrInstellingen(onderzoekId, wijzig) {
  const huidig = await api.get(`/onderzoeken/${onderzoekId}/hr`);
  const nieuw = wijzig(structuredClone(huidig.instellingen || {}));
  return api.put(`/onderzoeken/${onderzoekId}/hr`, { instellingen: { ...nieuw, versie: 1 }, bijgewerkt_op: huidig.bijgewerkt_op });
}

/** Mogelijke uitkomsten voor "Wat hangt samen met …?" bij een vragenlijst: [{ groep, sleutel, naam }]. */
export function uitkomstOpties(model, lijst) {
  if (!lijst) return [];
  const opties = [];
  for (const q of lijst.vragen.filter((x) => x.type === 'cijfer')) opties.push({ groep: 'Cijfervragen', sleutel: `v:${q.stam}`, naam: q.tekst });
  for (const t of model.themas) if (vragenVan(lijst, `t:${t.id}`).length) opties.push({ groep: "Thema's", sleutel: `t:${t.id}`, naam: t.naam });
  for (const q of lijst.vragen.filter((x) => x.type === 'schaal')) opties.push({ groep: 'Losse vragen', sleutel: `v:${q.stam}`, naam: q.tekst });
  return opties;
}

/** Een getal uit een invoerveld: 5 · 5,0 · 5.0 · 1.234 (geen getal: null). */
export function leesGetal(t) {
  const s = String(t ?? '').trim().replace(/\s/g, '').replace('−', '-');
  if (!s) return null;
  let n;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const kort = (t, max = 80) => (String(t).length > max ? `${String(t).slice(0, max - 1)}…` : String(t));

/**
 * Opent de instellingen. → Promise<boolean>: true als er iets is opgeslagen of veranderd (dan opnieuw rekenen).
 * data: de export (gegevens.js); lijstId: de vragenlijst die het Overzicht toont; tab: het tabblad om mee te beginnen.
 */
export async function openHrInstellingen({ ctx, data, lijstId = null, tab = null }) {
  const onderzoekId = ctx.params.id;
  let server;
  try {
    server = await api.get(`/onderzoeken/${onderzoekId}/hr`);
  } catch (e) {
    meldFout(e);
    return false;
  }
  const model = bouwModel(data);
  const lijst = model.lijsten.find((l) => l.id === Number(lijstId)) || model.lijsten.find((l) => l.inz.length) || model.lijsten[0] || null;
  const alleenLezen = !!ctx.alleenLezen;
  let veranderd = false;

  // Werkkopie; wordt pas bij "Opslaan" bewaard.
  const begin = server.instellingen || {};
  const werk = {
    uitkomst: begin.uitkomst?.sleutel || '',
    signalen: (begin.signalen || []).map((s) => ({ ...s, ongunstig: [...s.ongunstig] })),
    populatie: structuredClone(begin.populatie || {}),
    personeel: begin.personeel?.id ?? null,
    benchmarks: (begin.benchmarks || []).map((b) => ({ ...b, waardeTekst: nlGetal(b.waarde, Number.isInteger(b.waarde) ? 0 : 1) })),
  };
  let bijgewerkt = server.bijgewerkt_op;
  let bestanden = server.personeelscijfers || [];
  const aggregaten = new Map((data.personeelscijfers || []).map((p) => [p.id, p.inhoud]));
  const bronnenKort = new Map();

  return new Promise((klaar) => {
    let actief = TABS.some(([t]) => t === tab) ? tab : 'uitkomst';
    const fout = h('div', { class: 'veld-fout', role: 'alert' });
    const paneel = h('div', { class: 'hri-paneel', role: 'tabpanel', tabindex: '0' });
    const tabKnoppen = new Map();
    const tabRij = h('div', { class: 'hri-tabs', role: 'tablist', 'aria-label': 'Onderdelen van de instellingen' },
      TABS.map(([t, label], i) => {
        const k = h('button', {
          type: 'button', role: 'tab', class: 'hri-tab', id: uniekeId('hri-tab'),
          onclick: () => kies(t),
          onkeydown: (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const j = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
            kies(TABS[j][0]);
            tabKnoppen.get(TABS[j][0]).focus();
          },
        }, label);
        tabKnoppen.set(t, k);
        return k;
      }));
    const opslaan = h('button', { type: 'submit', class: 'knop knop-primair', disabled: alleenLezen }, 'Opslaan');
    const annuleer = h('button', { type: 'button', class: 'knop' }, alleenLezen ? 'Sluiten' : 'Annuleren');
    const d = maakDialoog('Instellingen van HR-analytics', [
      alleenLezen ? melding('Dit onderzoek is gearchiveerd; je kunt de instellingen alleen bekijken.', 'waarschuwing') : null,
      lijst ? h('p', { class: 'zacht klein' }, `Vragen uit "${lijst.titel}". Kies een andere vragenlijst in het Overzicht om de vragen daarvan te zien.`) : null,
      tabRij, paneel, fout,
    ], [annuleer, opslaan]);
    d.classList.add('hri-dialoog');
    // Wat er het laatst is opgeslagen (om bij sluiten te vragen of wijzigingen weg mogen).
    let basis = JSON.stringify(werk);
    const vuil = () => JSON.stringify(werk) !== basis;

    function kies(t) {
      actief = t;
      for (const [s, k] of tabKnoppen) {
        k.setAttribute('aria-selected', s === t ? 'true' : 'false');
        k.tabIndex = s === t ? 0 : -1;
        if (s === t) paneel.setAttribute('aria-labelledby', k.id);
      }
      teken();
    }

    function teken() {
      fout.textContent = '';
      const delen = {
        uitkomst: tekenUitkomst, signalen: tekenSignalen, populatie: tekenPopulatie, personeel: tekenPersoneel, vergelijking: tekenVergelijking,
      };
      vervang(paneel, delen[actief]());
    }

    const geenLijst = () => h('p', { class: 'zacht' }, 'Er is nog geen vragenlijst met vragen. Maak eerst een vragenlijst bij Vragenlijsten.');

    // ---------- Uitkomst ----------
    function tekenUitkomst() {
      if (!lijst) return geenLijst();
      const opties = uitkomstOpties(model, lijst);
      const id = uniekeId('hri-uitkomst');
      const groepen = [...new Set(opties.map((o) => o.groep))];
      return [
        h('p', {}, 'Bij "Wat hangt samen met …?" zie je welke thema\'s het sterkst samenhangen met één uitkomst. Kies die uitkomst hier; hij geldt ook voor rapporten.'),
        h('div', { class: 'veld' },
          h('label', { for: id }, 'Uitkomst'),
          h('select', { id, disabled: alleenLezen, onchange: (e) => { werk.uitkomst = e.target.value; } },
            h('option', { value: '', selected: !werk.uitkomst }, 'Automatisch: eNPS, anders het rapportcijfer, anders de algemene tevredenheid'),
            groepen.map((g) => h('optgroup', { label: g }, opties.filter((o) => o.groep === g).map((o) => h('option', { value: o.sleutel, selected: o.sleutel === werk.uitkomst }, kort(o.naam, 90))))))),
        werk.uitkomst && !opties.some((o) => o.sleutel === werk.uitkomst)
          ? melding('De gekozen uitkomst staat niet in deze vragenlijst. Dan wordt automatisch gekozen.', 'waarschuwing') : null,
      ];
    }

    // ---------- Signalen ----------
    const vraagBijStam = (stam) => lijst?.vragen.find((q) => q.stam === Number(stam) && q.type !== 'open') || null;
    const themaNaam = (id) => model.themas.find((t) => t.id === Number(id))?.naam || null;
    function regelNaam(s) {
      const [soort, id] = String(s.sleutel).split(':');
      if (soort === 't') return themaNaam(id) ? `Thema: ${themaNaam(id)}` : 'Thema (bestaat niet meer)';
      const q = vraagBijStam(id);
      return q ? q.tekst : 'Een vraag die niet in deze vragenlijst staat';
    }
    /** De mogelijke antwoorden van een regel: [{ waarde, label }]. */
    function antwoordenVan(s) {
      const [soort, id] = String(s.sleutel).split(':');
      if (soort === 't') {
        const q = lijst ? vragenVan(lijst, s.sleutel)[0] : null;
        const labels = SCHAAL_LABELS[q?.schaal_soort] || SCHAAL_LABELS.eens;
        return labels.map((l, i) => ({ waarde: i + 1, label: `${i + 1} – ${l}` }));
      }
      const q = vraagBijStam(id);
      if (!q) return s.ongunstig.map((w) => ({ waarde: w, label: String(w) }));
      if (q.type === 'schaal') return (SCHAAL_LABELS[q.schaal_soort] || SCHAAL_LABELS.eens).map((l, i) => ({ waarde: i + 1, label: `${i + 1} – ${l}` }));
      if (q.type === 'janee') return [{ waarde: 'ja', label: 'Ja' }, { waarde: 'nee', label: 'Nee' }];
      if (q.type === 'cijfer') {
        const min = q.bereik?.min ?? (q.schaal_soort === 'nps' ? 0 : 1);
        const max = q.bereik?.max ?? 10;
        return Array.from({ length: max - min + 1 }, (_, i) => ({ waarde: min + i, label: String(min + i) }));
      }
      return q.opties.map((o) => ({ waarde: o.id, label: o.label }));
    }
    const signaalKandidaten = () => {
      if (!lijst) return [];
      const uit = [];
      for (const t of model.themas) if (vragenVan(lijst, `t:${t.id}`).length) uit.push({ sleutel: `t:${t.id}`, naam: `Thema: ${t.naam}` });
      for (const q of lijst.vragen) {
        if (q.type === 'open' || (q.kenmerk || q.uitsplitsen)) continue; // achtergrondvragen nooit
        uit.push({ sleutel: `v:${q.stam}`, naam: q.tekst });
      }
      return uit;
    };
    const standaardOngunstig = (sleutel) => {
      const [soort, id] = sleutel.split(':');
      if (soort === 't') return [1, 2];
      const q = vraagBijStam(id);
      if (!q) return [];
      if (q.type === 'schaal') return [1, 2];
      if (q.type === 'janee') return ['ja'];
      if (q.type === 'cijfer') return q.schaal_soort === 'nps' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
      return [];
    };

    function tekenSignalen() {
      if (!lijst) return geenLijst();
      const voorstellen = standaardSignalen(data, lijst.id).filter((v) => !werk.signalen.some((s) => s.sleutel === v.sleutel));
      const rij = (s, i) => {
        const antwoorden = antwoordenVan(s);
        const gekozen = new Set(s.ongunstig.map(String));
        const grensId = uniekeId('hri-grens');
        return h('li', { class: 'hri-regel' },
          h('div', { class: 'hri-regel-kop' },
            h('strong', {}, regelNaam(s)),
            alleenLezen ? null : h('button', { type: 'button', class: 'knop knop-klein knop-licht', onclick: () => { werk.signalen.splice(i, 1); teken(); } }, 'Weghalen')),
          h('fieldset', { class: 'hri-keuzes' },
            h('legend', {}, 'Ongunstig is:'),
            antwoorden.map((a) => {
              const id = uniekeId('hri-o');
              return h('label', { class: 'keuze', for: id },
                h('input', {
                  type: 'checkbox', id, checked: gekozen.has(String(a.waarde)), disabled: alleenLezen,
                  onchange: (e) => {
                    s.ongunstig = s.ongunstig.filter((w) => String(w) !== String(a.waarde));
                    if (e.target.checked) s.ongunstig.push(a.waarde);
                  },
                }),
                h('span', {}, a.label));
            })),
          h('div', { class: 'veld hri-grens' },
            h('label', { for: grensId }, 'Signaal vanaf (% ongunstig)'),
            h('input', { id: grensId, type: 'number', min: 1, max: 100, step: 1, inputmode: 'numeric', value: s.grens, disabled: alleenLezen, oninput: (e) => { s.grens = Number(e.target.value); } }),
            s.standaard ? h('div', { class: 'veld-hulp' }, 'standaardgrens; pas aan als je wilt') : null));
      };
      const kandidaten = signaalKandidaten().filter((c) => !werk.signalen.some((s) => s.sleutel === c.sleutel));
      const kiesId = uniekeId('hri-nieuw');
      const kiesEl = h('select', { id: kiesId }, h('option', { value: '' }, 'Kies een vraag of thema'), kandidaten.map((c) => h('option', { value: c.sleutel }, kort(c.naam, 90))));
      return [
        h('p', {}, 'Een signaal verschijnt als het deel ongunstige antwoorden op een vraag of thema minstens de grens is. Signalen gaan altijd over de hele groep, nooit over een afdeling of andere groep. Achtergrondvragen kunnen geen signaal zijn.'),
        werk.signalen.length ? h('ul', { class: 'hri-regels' }, werk.signalen.map(rij)) : h('p', { class: 'zacht' }, 'Er zijn nog geen signaalregels.'),
        voorstellen.length && !alleenLezen ? h('div', { class: 'hri-voorstellen' },
          h('h3', {}, 'Voorstellen'),
          h('p', { class: 'zacht klein' }, 'Bij deze vragen uit de standaardsjablonen hoort een vaste regel. Neem ze over als ze passen.'),
          h('ul', { class: 'lijst' }, voorstellen.map((v) => h('li', { class: 'lijst-item' },
            h('div', { class: 'lijst-item-hoofd' }, h('div', { class: 'lijst-item-titel' }, v.tekst), h('div', { class: 'lijst-item-meta' }, `Grens ${v.grens}% (standaardgrens; pas aan als je wilt)`)),
            h('div', { class: 'lijst-item-acties' }, h('button', {
              type: 'button', class: 'knop knop-klein',
              onclick: () => {
                if (werk.signalen.length >= MAX_SIGNALEN) return meld(`Er kunnen hooguit ${MAX_SIGNALEN} signalen zijn.`, 'waarschuwing');
                werk.signalen.push({ sleutel: v.sleutel, ongunstig: [...v.ongunstig], grens: v.grens, standaard: true });
                teken();
                return null;
              },
            }, 'Overnemen')))))) : null,
        alleenLezen ? null : h('div', { class: 'hri-toevoegen' },
          h('div', { class: 'veld' }, h('label', { for: kiesId }, 'Nieuwe signaalregel'), kiesEl),
          h('button', {
            type: 'button', class: 'knop knop-klein',
            onclick: () => {
              if (!kiesEl.value) return;
              if (werk.signalen.length >= MAX_SIGNALEN) {
                meld(`Er kunnen hooguit ${MAX_SIGNALEN} signalen zijn.`, 'waarschuwing');
                return;
              }
              werk.signalen.push({ sleutel: kiesEl.value, ongunstig: standaardOngunstig(kiesEl.value), grens: 30 });
              teken();
            },
          }, 'Toevoegen')),
      ];
    }

    // ---------- Aantallen medewerkers ----------
    function tekenPopulatie() {
      if (!lijst) return geenLijst();
      const vragen = lijst.vragen.filter((q) => q.kenmerk && magKenmerk({ type: q.type, meerdere_antwoorden: q.meerdere }));
      const aggregaat = werk.personeel ? aggregaten.get(werk.personeel) : null;
      if (!vragen.length) {
        return h('p', {}, "Deze vragenlijst heeft nog geen achtergrondvragen. Voeg ze toe bij Vragenlijsten met de knop 'Achtergrondvragen toevoegen'.");
      }
      return [
        h('p', {}, 'Vul per groep in hoeveel medewerkers er werken. Dan zie je de respons per groep en of de respondenten op de organisatie lijken. Een aantal onder de 5 wordt in het Overzicht niet getoond.'),
        aggregaat ? h('p', { class: 'zacht klein' }, 'Laat een vakje leeg om het aantal uit het personeelsbestand te gebruiken.') : null,
        vragen.slice(0, MAX_POPULATIE_VRAGEN).map((q) => {
          const opties = (q.type === 'janee' ? [{ id: 'ja', label: 'Ja' }, { id: 'nee', label: 'Nee' }] : q.opties).filter((o) => !isLieverNiet(o.label));
          const uitBestand = aggregaat ? populatieVoorVraag(aggregaat, { type: q.type, kenmerk: q.kenmerk, opties: q.opties }) : null;
          const sleutel = String(q.stam);
          const huidig = werk.populatie[sleutel] || werk.populatie[String(q.id)] || {};
          return h('fieldset', { class: 'hri-populatie' },
            h('legend', {}, KENMERKEN[q.kenmerk]?.naam && q.kenmerk !== 'overig' ? `${KENMERKEN[q.kenmerk].naam}: ${q.tekst}` : q.tekst),
            h('div', { class: 'hri-populatie-rijen' }, opties.map((o) => {
              const id = uniekeId('hri-pop');
              const bestand = uitBestand && Number.isInteger(uitBestand[o.id]) ? uitBestand[o.id] : null;
              return h('div', { class: 'hri-populatie-rij' },
                h('label', { for: id }, o.label),
                h('input', {
                  id, type: 'number', min: 0, max: 1000000, step: 1, inputmode: 'numeric', disabled: alleenLezen,
                  value: Number.isInteger(huidig[o.id]) ? huidig[o.id] : '',
                  placeholder: bestand !== null ? String(bestand) : '',
                  oninput: (e) => {
                    const v = e.target.value.trim();
                    if (werk.populatie[String(q.id)] && sleutel !== String(q.id)) {
                      werk.populatie[sleutel] = { ...werk.populatie[String(q.id)], ...(werk.populatie[sleutel] || {}) };
                      delete werk.populatie[String(q.id)];
                    }
                    const p = werk.populatie[sleutel] || {};
                    if (v === '') delete p[o.id];
                    else p[o.id] = Number(v);
                    if (Object.keys(p).length) werk.populatie[sleutel] = p;
                    else delete werk.populatie[sleutel];
                  },
                }),
                bestand !== null ? h('span', { class: 'hri-hulp' }, `uit het personeelsbestand: ${bestand}`) : null);
            })));
        }),
        vragen.length > MAX_POPULATIE_VRAGEN ? h('p', { class: 'zacht klein' }, `Aantallen kunnen bij hooguit ${MAX_POPULATIE_VRAGEN} vragen.`) : null,
      ];
    }

    // ---------- Personeelsbestand ----------
    async function verversServer() {
      const s = await api.get(`/onderzoeken/${onderzoekId}/hr`);
      bijgewerkt = s.bijgewerkt_op;
      bestanden = s.personeelscijfers || [];
      const schoon = !vuil();
      werk.personeel = s.instellingen?.personeel?.id ?? null;
      if (schoon) basis = JSON.stringify(werk);
      const nieuw = await (await import('../gegevens.js')).haalGegevens(onderzoekId);
      aggregaten.clear();
      for (const p of nieuw.personeelscijfers || []) aggregaten.set(p.id, p.inhoud);
      veranderd = true;
    }

    function tekenPersoneel() {
      const naam = uniekeId('hri-bestand');
      const vandaagT = vandaag();
      const rij = (b) => {
        const id = uniekeId('hri-b');
        const datumId = uniekeId('hri-tot');
        const datumVeld = h('input', { id: datumId, type: 'date', value: b.bewaren_tot, min: vandaagT, disabled: alleenLezen });
        return h('li', { class: 'lijst-item hri-bestand' },
          h('div', { class: 'lijst-item-hoofd' },
            h('label', { class: 'keuze', for: id },
              h('input', { type: 'radio', name: naam, id, checked: werk.personeel === b.id, disabled: alleenLezen, onchange: () => { werk.personeel = b.id; } }),
              h('span', {}, h('strong', {}, b.naam), h('span', { class: 'lijst-item-meta' }, ` · ${b.periode_van} tot en met ${b.periode_tot}`))),
            h('div', { class: 'lijst-item-meta' }, `Bewaren tot ${nlDatum(b.bewaren_tot)}`,
              b.bewaren_tot < vandaagT ? h('span', { class: 'label label-waarschuwing' }, 'bewaartermijn verstreken') : null),
            alleenLezen ? null : h('div', { class: 'hri-bewaren' },
              h('label', { for: datumId }, 'Bewaren tot'), datumVeld,
              h('button', {
                type: 'button', class: 'knop knop-klein',
                onclick: async (e) => {
                  e.target.disabled = true;
                  try {
                    await api.put(`/personeelscijfers/${b.id}`, { bewaren_tot: datumVeld.value });
                    await verversServer();
                    meld('De bewaartermijn is aangepast.', 'succes');
                    teken();
                  } catch (err) {
                    meldFout(err);
                    e.target.disabled = false;
                  }
                },
              }, 'Aanpassen'))),
          h('div', { class: 'lijst-item-acties' },
            h('button', {
              type: 'button', class: 'knop knop-klein knop-gevaar',
              onclick: async () => {
                if (!(await bevestig({ titel: 'Personeelsbestand verwijderen?', tekst: [`De groepscijfers van "${b.naam}" worden verwijderd. Dit kan niet ongedaan worden gemaakt.`, 'Rapporten waarin de cijfers al zijn vastgelegd, houden hun cijfers.'], knop: 'Verwijderen', gevaar: true }))) return;
                try {
                  await api.del(`/personeelscijfers/${b.id}`);
                  vergeetGegevens(onderzoekId);
                  await verversServer();
                  meld('Het personeelsbestand is verwijderd.', 'succes');
                  teken();
                } catch (err) {
                  meldFout(err);
                }
              },
            }, 'Verwijderen')));
      };
      const geenId = uniekeId('hri-geen');
      return [
        h('p', {}, 'Met een personeelsbestand zie je verzuim, verloop en de opbouw van de organisatie, en kun je de respondenten vergelijken met alle medewerkers. Er worden alleen groepscijfers bewaard (aantallen en totalen per groep), geen gegevens per medewerker.'),
        h('p', { class: 'zacht klein' }, 'Verwijder het personeelsbestand als het rapport klaar is.'),
        bestanden.length ? h('ul', { class: 'lijst' },
          bestanden.map(rij),
          h('li', { class: 'lijst-item' }, h('label', { class: 'keuze', for: geenId },
            h('input', { type: 'radio', name: naam, id: geenId, checked: werk.personeel === null, disabled: alleenLezen, onchange: () => { werk.personeel = null; } }),
            h('span', {}, 'Geen personeelsbestand gebruiken'))))
          : h('p', { class: 'zacht' }, 'Er is nog geen personeelsbestand.'),
        alleenLezen ? null : h('div', { class: 'knoppen' },
          h('button', {
            type: 'button', class: 'knop',
            disabled: bestanden.length >= (server.limieten?.personeelscijfers || 5),
            onclick: async () => {
              if (vuil()) {
                if (!(await bevestig({ titel: 'Eerst opslaan?', tekst: 'Je hebt instellingen veranderd die nog niet zijn opgeslagen. Die worden eerst opgeslagen.', knop: 'Opslaan en doorgaan' }))) return;
                if (!(await bewaar({ sluit: false }))) return;
              }
              try {
                const m = await import('./personeel-kaart.js');
                const id = await m.personeelToevoegen(ctx, { data });
                if (id) {
                  await verversServer();
                  meld('Het personeelsbestand is verwerkt. Alleen de groepscijfers zijn bewaard.', 'succes');
                  teken();
                }
              } catch (err) {
                meldFout(err);
              }
            },
          }, 'Personeelsbestand toevoegen')),
        bestanden.length >= (server.limieten?.personeelscijfers || 5) ? h('p', { class: 'zacht klein' }, 'Een onderzoek kan hooguit 5 personeelsbestanden hebben. Verwijder er eerst een.') : null,
      ];
    }

    // ---------- Vergelijkingscijfers ----------
    function sleutelOpties() {
      const uit = BENCHMARK_VAST.map(([s, n]) => ({ sleutel: s, naam: n }));
      if (lijst) {
        for (const t of model.themas) if (vragenVan(lijst, `t:${t.id}`).length) uit.push({ sleutel: `t:${t.id}`, naam: `Thema: ${t.naam} (gemiddelde 1–5)` });
        for (const q of lijst.vragen.filter((x) => (x.type === 'schaal' || x.type === 'cijfer') && !x.kenmerk && !x.uitsplitsen)) uit.push({ sleutel: `v:${q.stam}`, naam: `Vraag: ${kort(q.tekst, 70)} (gemiddelde)` });
      }
      return uit;
    }
    async function bronTekst(sleutel) {
      if (!sleutel) return '';
      if (bronnenKort.has(sleutel)) return bronnenKort.get(sleutel);
      try {
        const [{ bronBijCiteersleutel }, { apaKort }] = await Promise.all([import('../bibliotheek-data.js'), import('../bibliotheek-regels.js')]);
        const b = await bronBijCiteersleutel(sleutel);
        const t = b ? `${apaKort(b)} ${b.titel ? `– ${kort(b.titel, 60)}` : ''}`.trim() : `[@${sleutel}] (niet gevonden in de bibliotheek)`;
        bronnenKort.set(sleutel, t);
        return t;
      } catch {
        return `[@${sleutel}]`;
      }
    }

    function tekenVergelijking() {
      const opties = sleutelOpties();
      const rij = (b, i) => {
        const sId = uniekeId('hri-bs');
        const wId = uniekeId('hri-bw');
        const oId = uniekeId('hri-bo');
        const bronEl = h('span', { class: 'hri-bron' }, b.citeersleutel ? '…' : 'Geen bron');
        if (b.citeersleutel) bronTekst(b.citeersleutel).then((t) => { bronEl.textContent = t; });
        return h('li', { class: 'hri-regel' },
          h('div', { class: 'formulier-rij' },
            h('div', { class: 'veld' }, h('label', { for: sId }, 'Waarmee vergelijk je?'),
              h('select', { id: sId, disabled: alleenLezen, onchange: (e) => { b.sleutel = e.target.value; } },
                opties.map((o) => h('option', { value: o.sleutel, selected: o.sleutel === b.sleutel }, o.naam)),
                opties.some((o) => o.sleutel === b.sleutel) ? null : h('option', { value: b.sleutel, selected: true }, 'Een vraag of thema uit een andere vragenlijst'))),
            h('div', { class: 'veld' }, h('label', { for: wId }, 'Vergelijkingscijfer'),
              h('input', { id: wId, type: 'text', inputmode: 'decimal', value: b.waardeTekst ?? '', disabled: alleenLezen, placeholder: 'bijv. 5,0', oninput: (e) => { b.waardeTekst = e.target.value; } }))),
          h('div', { class: 'veld' }, h('label', { for: oId }, 'Omschrijving (optioneel)'),
            h('input', { id: oId, type: 'text', maxlength: 120, value: b.omschrijving || '', disabled: alleenLezen, placeholder: 'bijv. Landelijk verzuim 2025', oninput: (e) => { b.omschrijving = e.target.value; } })),
          h('div', { class: 'hri-bronregel' },
            h('span', { class: 'zacht' }, 'Bron: '), bronEl,
            alleenLezen ? null : h('button', {
              type: 'button', class: 'knop knop-klein',
              onclick: async () => {
                try {
                  const { kiesBron } = await import('../bronkiezer.js');
                  const gekozen = await kiesBron({ onderzoekId, metPagina: false, metVorm: false, knop: 'Kiezen', titel: 'Bron van het vergelijkingscijfer' });
                  if (gekozen?.bron?.citeersleutel) {
                    b.citeersleutel = gekozen.bron.citeersleutel;
                    teken();
                  }
                } catch (err) {
                  meldFout(err);
                }
              },
            }, b.citeersleutel ? 'Andere bron' : 'Kies een bron'),
            !alleenLezen && b.citeersleutel ? h('button', { type: 'button', class: 'knop knop-klein knop-licht', onclick: () => { b.citeersleutel = ''; teken(); } }, 'Bron weghalen') : null),
          alleenLezen ? null : h('div', { class: 'knoppen' }, h('button', { type: 'button', class: 'knop knop-klein knop-licht', onclick: () => { werk.benchmarks.splice(i, 1); teken(); } }, 'Weghalen')));
      };
      return [
        h('p', {}, 'Een vergelijkingscijfer zet je naast je eigen cijfer, bijvoorbeeld het landelijk verzuim. In het Overzicht en in rapporten staat het als "Ter vergelijking: 5,0% (CBS, 2025)".'),
        h('p', { class: 'zacht klein' }, 'Vul het cijfer zelf in en kies de bron uit de bibliotheek. Een vergelijkingscijfer wordt nooit automatisch ingevuld.'),
        werk.benchmarks.length ? h('ul', { class: 'hri-regels' }, werk.benchmarks.map(rij)) : h('p', { class: 'zacht' }, 'Er zijn nog geen vergelijkingscijfers.'),
        alleenLezen ? null : h('button', {
          type: 'button', class: 'knop knop-klein',
          onclick: () => {
            if (werk.benchmarks.length >= MAX_BENCHMARKS) {
              meld(`Er kunnen hooguit ${MAX_BENCHMARKS} vergelijkingscijfers zijn.`, 'waarschuwing');
              return;
            }
            werk.benchmarks.push({ sleutel: 'verzuim_pct', waardeTekst: '', omschrijving: '', citeersleutel: '' });
            teken();
          },
        }, 'Vergelijkingscijfer toevoegen'),
      ];
    }

    // ---------- Opslaan ----------
    function controleer() {
      for (const [i, s] of werk.signalen.entries()) {
        if (!s.ongunstig.length) return [`Signaal ${i + 1} ("${kort(regelNaam(s), 50)}"): kies welke antwoorden ongunstig zijn.`, 'signalen'];
        if (!Number.isInteger(s.grens) || s.grens < 1 || s.grens > 100) return [`Signaal ${i + 1}: de grens is een heel getal van 1 tot en met 100.`, 'signalen'];
      }
      for (const [vraag, opties] of Object.entries(werk.populatie)) {
        for (const n of Object.values(opties)) {
          if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return [`Een aantal medewerkers moet een heel getal van 0 tot 1.000.000 zijn (vraag ${vraag}).`, 'populatie'];
        }
      }
      for (const [i, b] of werk.benchmarks.entries()) {
        const w = leesGetal(b.waardeTekst);
        if (w === null) return [`Vergelijkingscijfer ${i + 1}: vul een getal in, bijvoorbeeld 5,0.`, 'vergelijking'];
        if ((b.sleutel.endsWith('_pct') && (w < 0 || w > 100)) || (b.sleutel === 'enps' && (w < -100 || w > 100))) return [`Vergelijkingscijfer ${i + 1}: dit getal kan niet kloppen.`, 'vergelijking'];
      }
      return null;
    }

    function inhoud() {
      const uit = { versie: 1 };
      if (werk.uitkomst) uit.uitkomst = { sleutel: werk.uitkomst };
      uit.signalen = werk.signalen.map((s) => ({ sleutel: s.sleutel, ongunstig: s.ongunstig, grens: s.grens }));
      uit.populatie = werk.populatie;
      if (werk.personeel) uit.personeel = { id: werk.personeel };
      uit.benchmarks = werk.benchmarks.map((b) => ({ sleutel: b.sleutel, waarde: leesGetal(b.waardeTekst), omschrijving: (b.omschrijving || '').trim(), citeersleutel: b.citeersleutel || '' }));
      return uit;
    }

    async function bewaar({ sluit = true } = {}) {
      const f = controleer();
      if (f) {
        kies(f[1]);
        fout.textContent = f[0];
        return false;
      }
      opslaan.disabled = true;
      try {
        const r = await api.put(`/onderzoeken/${onderzoekId}/hr`, { instellingen: inhoud(), bijgewerkt_op: bijgewerkt });
        bijgewerkt = r.bijgewerkt_op;
        veranderd = true;
        basis = JSON.stringify(werk);
        if (sluit) {
          meld('De instellingen zijn opgeslagen.', 'succes');
          d.close();
        }
        return true;
      } catch (e) {
        fout.textContent = e.status === 409 && e.data?.conflict
          ? `${e.message} Sluit dit venster en open de instellingen opnieuw; je wijzigingen hier zijn dan niet bewaard.`
          : e.message || 'Opslaan is mislukt.';
        return false;
      } finally {
        opslaan.disabled = alleenLezen;
      }
    }

    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!alleenLezen) bewaar();
    });
    const sluitNaVragen = async () => {
      if (alleenLezen || !vuil()
        || (await bevestig({ titel: 'Wijzigingen weggooien?', tekst: 'Wat je hier hebt veranderd, wordt niet opgeslagen.', knop: 'Weggooien', gevaar: true }))) d.close();
    };
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      sluitNaVragen();
    });
    annuleer.addEventListener('click', sluitNaVragen);
    d.addEventListener('close', () => klaar(veranderd));
    kies(actief);
    d.showModal();
    tabKnoppen.get(actief).focus();
  });
}
