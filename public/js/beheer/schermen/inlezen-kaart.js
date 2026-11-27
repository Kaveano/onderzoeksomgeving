// Inlezen uit Excel of CSV: cijfers, vragen, antwoorden en een eigen dataset.
// Het bestand wordt in de browser gelezen (het gaat niet als bestand naar de server). Je ziet eerst wat er
// herkend is en wat niet; pas na "Inlezen" wordt er iets opgeslagen. Wat niet herkend wordt, blijft leeg:
// er wordt niets geraden of aangevuld.

import { api } from '../api.js';
import { h, vervang, melding, meld, meldFout, maakDialoog, uniekeId, aantal, vandaag } from '../ui.js';
import {
  kopEnRijen, herkenKolom, CIJFER_VELDEN, VRAAG_VELDEN, verwerkCijfers, verwerkVragen, koppelVragen, verwerkAntwoorden,
  kolomSoort, verdachteKolommen, verwerkDataset,
} from '../inlees-regels.js';

const MAX_BESTAND = 5 * 1024 * 1024;
const REEKS = 300;
const SOORT_NAAM = { getal: 'getallen', categorie: 'indeling in groepen', tekst: 'tekst', leeg: 'leeg' };

/** Leest een gekozen bestand: { naam, bladen: [{ naam, rijen }] }. */
async function leesBestand(bestand) {
  if (bestand.size > MAX_BESTAND) throw new Error('Dit bestand is te groot (maximaal 5 MB). Verwijder tabbladen of rijen die je niet nodig hebt.');
  if (/\.xls$/i.test(bestand.name)) throw new Error('Dit is een oud Excel-bestand (.xls). Open het in Excel, kies Opslaan als en sla het op als Excel-werkmap (.xlsx). Probeer het daarna opnieuw.');
  const b = await import('../bestanden.js');
  const bytes = new Uint8Array(await bestand.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) {
    const { bladen } = await b.leesXlsx(bytes);
    return { naam: bestand.name, bladen: bladen.filter((x) => x.rijen.length) };
  }
  if (/\.(xlsx|xlsm)$/i.test(bestand.name)) throw new Error('Dit bestand is geen geldig Excel-bestand. Sla het opnieuw op als .xlsx en probeer het nog eens.');
  return { naam: bestand.name, bladen: [{ naam: 'Bestand', rijen: b.leesCsv(bytes) }] };
}

async function downloadVoorbeeld(naam, bladen) {
  const b = await import('../bestanden.js');
  b.bewaarBestand(b.maakXlsx(bladen), naam, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function voorbeeldTabel(kop, rijen, max = 4) {
  const cel = (w) => (w === null || w === undefined ? '' : typeof w === 'number' ? w.toLocaleString('nl-NL') : String(w).slice(0, 60));
  return h('div', { class: 'tabel-wrapper im-voorbeeld' },
    h('table', { class: 'tabel' },
      h('caption', { class: 'sr-only' }, 'De eerste rijen van het bestand'),
      h('thead', {}, h('tr', {}, kop.map((k) => h('th', { scope: 'col' }, k)))),
      h('tbody', {}, rijen.slice(0, max).map((r) => h('tr', {}, r.map((w) => h('td', {}, cel(w))))))));
}

/** Keuzelijst van kolommen, met een voorbeeldwaarde erbij. */
function kolomKeuze(kop, rijen, gekozen, bijKeuze, { leeg = '— niet gebruiken —', id = uniekeId('im-kolom') } = {}) {
  const voorbeeld = (i) => {
    const r = rijen.find((rij) => rij[i] !== null && rij[i] !== undefined);
    return r ? ` (bijv. ${String(r[i]).slice(0, 24)})` : '';
  };
  const s = h('select', { id, onchange: (e) => bijKeuze(Number(e.target.value)) },
    h('option', { value: -1 }, leeg),
    kop.map((k, i) => h('option', { value: i, selected: i === gekozen }, `${k}${voorbeeld(i)}`)));
  return s;
}

/**
 * De gedeelde dialoog. soort.bouw({ kop, rijen, bestand, ververs }) geeft:
 *   { inhoud: [elementen voor de koppeling], controleer(): { items, problemen, regel }, opslaan(items): Promise<aantal> }
 * Geeft het aantal ingelezen regels terug, of null bij annuleren.
 */
function inleesDialoog({ titel, uitleg, stappen, voorbeeld, bouw, knopTekst = (n) => `${n} inlezen` }) {
  return new Promise((klaar) => {
    let resultaat = null;
    let huidig = null; // { controleer, opslaan }
    let gelezen = null; // { naam, bladen }
    const fout = h('div', { class: 'veld-fout', role: 'alert' });
    const koppelEl = h('div', {});
    const controleEl = h('div', { role: 'status' });
    const inlezen = h('button', { type: 'submit', class: 'knop knop-primair', disabled: true }, 'Inlezen');
    const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
    const bestandId = uniekeId('im-bestand');
    const kies = h('input', { type: 'file', id: bestandId, accept: '.xlsx,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv' });

    function controleer() {
      if (!huidig) return;
      let uit;
      try {
        uit = huidig.controleer();
      } catch (e) {
        vervang(controleEl, melding(e.message || 'Dit bestand kan niet worden verwerkt.', 'gevaar'));
        inlezen.disabled = true;
        return;
      }
      const n = uit.items.length;
      inlezen.disabled = n === 0;
      inlezen.textContent = n ? knopTekst(n) : 'Niets om in te lezen';
      inlezen.dataset.aantal = String(n);
      vervang(controleEl,
        h('h3', { class: 'im-kop' }, 'Controle'),
        h('p', {}, uit.regel),
        uit.extra || null,
        uit.problemen.length
          ? melding([
            h('strong', {}, `${aantal(uit.problemen.length, 'opmerking', 'opmerkingen')}:`),
            h('ul', { class: 'im-problemen' }, uit.problemen.slice(0, 8).map((p) => h('li', {}, p))),
            uit.problemen.length > 8 ? h('p', { class: 'klein' }, `… en nog ${uit.problemen.length - 8}. Verbeter het bestand en kies het opnieuw, of lees in wat wel bruikbaar is.`) : null,
          ], 'waarschuwing')
          : null);
      huidig.items = uit.items;
    }

    function toonBlad(blad) {
      const { kop, rijen, nummers, totaalrijen } = kopEnRijen(blad.rijen);
      fout.textContent = '';
      if (!kop.length || !rijen.length) {
        huidig = null;
        vervang(koppelEl);
        vervang(controleEl, melding('Dit blad heeft geen rijen onder de kopregel. De eerste rij moet de namen van de kolommen bevatten.', 'waarschuwing'));
        inlezen.disabled = true;
        return;
      }
      huidig = bouw({ kop, rijen, nummers, totaalrijen, bestand: gelezen, ververs: controleer });
      vervang(koppelEl,
        h('p', { class: 'klein zacht' }, `Gelezen: ${gelezen.naam}${gelezen.bladen.length > 1 ? `, blad "${blad.naam}"` : ''} – ${aantal(rijen.length, 'rij', 'rijen')} en ${aantal(kop.length, 'kolom', 'kolommen')}.`),
        voorbeeldTabel(kop, rijen),
        huidig.inhoud);
      controleer();
    }

    kies.addEventListener('change', async () => {
      const bestand = kies.files && kies.files[0];
      if (!bestand) return;
      fout.textContent = '';
      vervang(koppelEl, h('p', { class: 'zacht' }, 'Het bestand wordt gelezen…'));
      vervang(controleEl);
      inlezen.disabled = true;
      try {
        gelezen = await leesBestand(bestand);
        if (!gelezen.bladen.length) throw new Error('Dit bestand is leeg.');
        if (gelezen.bladen.length > 1) {
          const id = uniekeId('im-blad');
          const keuze = h('select', { id, onchange: (e) => toonBlad(gelezen.bladen[Number(e.target.value)]) },
            gelezen.bladen.map((b, i) => h('option', { value: i }, `${b.naam} (${aantal(Math.max(0, b.rijen.length - 1), 'rij', 'rijen')})`)));
          vervang(bladEl, h('div', { class: 'veld' }, h('label', { for: id }, 'Tabblad'), keuze));
        } else {
          vervang(bladEl);
        }
        toonBlad(gelezen.bladen[0]);
      } catch (e) {
        huidig = null;
        vervang(koppelEl);
        fout.textContent = e.message || 'Dit bestand kan niet worden gelezen.';
      }
    });
    const bladEl = h('div', {});

    const d = maakDialoog(titel, [
      h('p', { class: 'zacht' }, uitleg),
      stappen ? h('ol', { class: 'im-stappen' }, stappen.map((s) => h('li', {}, s))) : null,
      h('div', { class: 'veld' },
        h('label', { for: bestandId }, 'Excel-bestand (.xlsx) of CSV-bestand'),
        h('div', { class: 'im-kies' },
          kies,
          voorbeeld ? h('button', { type: 'button', class: 'knop knop-klein knop-licht', onclick: () => downloadVoorbeeld(voorbeeld.naam, voorbeeld.bladen).catch(meldFout) }, 'Download een voorbeeldbestand') : null)),
      fout,
      bladEl,
      koppelEl,
      controleEl,
    ], [annuleer, inlezen]);
    d.classList.add('im-dialoog');
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!huidig || !huidig.items || !huidig.items.length) return;
      inlezen.disabled = true;
      const oud = inlezen.textContent;
      inlezen.textContent = 'Bezig met inlezen…';
      try {
        resultaat = await huidig.opslaan(huidig.items);
        d.close();
      } catch (err) {
        fout.textContent = err.message || 'Inlezen is mislukt.';
        fout.scrollIntoView({ block: 'center' });
        inlezen.disabled = false;
        inlezen.textContent = oud;
      }
    });
    annuleer.addEventListener('click', () => d.close());
    d.addEventListener('close', () => klaar(resultaat));
    d.showModal();
    kies.focus();
  });
}

function veldRij(label, element, hulp) {
  const id = element.id || uniekeId('im-veld');
  element.id = id;
  return [
    h('label', { class: 'im-kolomnaam', for: id }, label, hulp ? h('span', { class: 'im-kolomvoorbeeld' }, hulp) : null),
    element,
  ];
}

function themaKeuze(themas, gekozen, bijKeuze) {
  return h('select', { onchange: (e) => bijKeuze(Number(e.target.value) || null) },
    themas.map((t) => h('option', { value: t.id, selected: t.id === gekozen }, t.naam)));
}

/** Stuurt items in delen naar de server; elk deel is alles-of-niets. */
async function inDelen(items, stuur, perKeer = REEKS) {
  let klaar = 0;
  for (let i = 0; i < items.length; i += perKeer) {
    try {
      await stuur(items.slice(i, i + perKeer));
      klaar += Math.min(perKeer, items.length - i);
    } catch (e) {
      if (klaar) throw new Error(`De eerste ${klaar} regels zijn ingelezen; daarna ging het mis: ${e.message} Lees de rest opnieuw in zonder de eerste ${klaar} regels.`);
      throw e;
    }
  }
  return klaar;
}

// ---------- 1. Cijfers ----------

export function cijfersInlezen(ctx) {
  const o = ctx.onderzoek;
  if (!o.themas.length) {
    meld('Maak eerst een thema bij Opzet; elk cijfer hoort bij een thema.', 'waarschuwing');
    return Promise.resolve(null);
  }
  return inleesDialoog({
    titel: 'Cijfers inlezen',
    uitleg: 'Lees een lijst met cijfers in één keer in, bijvoorbeeld het verzuimpercentage per maand. Elke rij wordt één cijfer bij Eigen invoer en komt op het dashboard.',
    stappen: ['Zet in de eerste rij de namen van de kolommen.', 'Elke rij daaronder is één cijfer: een naam, een datum en een waarde.'],
    voorbeeld: {
      naam: 'voorbeeld-cijfers.xlsx',
      bladen: [{ naam: 'Cijfers', kolombreedtes: [14, 26, 10, 10, 24, 18, 30], rijen: [
        ['Datum', 'Naam', 'Waarde', 'Eenheid', 'Thema', 'Meetmoment', 'Toelichting'],
        ['2026-01-31', 'Verzuimpercentage', 5.8, '%', o.themas[0].naam, o.meetmomenten[0]?.naam || '', 'Bron: HR-administratie'],
        ['2026-02-28', 'Verzuimpercentage', 6.1, '%', o.themas[0].naam, '', ''],
        ['2026-03-31', 'Verzuimpercentage', 5.2, '%', o.themas[0].naam, '', ''],
      ] }],
    },
    knopTekst: (n) => `${aantal(n, 'cijfer', 'cijfers')} inlezen`,
    bouw: ({ kop, rijen, nummers, totaalrijen, ververs }) => {
      const bezet = new Set();
      const koppeling = {};
      for (const f of CIJFER_VELDEN) {
        koppeling[f.sleutel] = herkenKolom(kop, f.herken, bezet);
        if (koppeling[f.sleutel] >= 0) bezet.add(koppeling[f.sleutel]);
      }
      let standaardThema = o.themas[0].id;
      const inhoud = [
        h('h3', { class: 'im-kop' }, 'Welke kolom is wat?'),
        h('div', { class: 'im-koppeling' },
          CIJFER_VELDEN.flatMap((f) => veldRij(`${f.label}${f.verplicht ? ' *' : ''}`,
            kolomKeuze(kop, rijen, koppeling[f.sleutel], (i) => { koppeling[f.sleutel] = i; ververs(); }, { leeg: f.verplicht ? '— kies een kolom —' : '— niet gebruiken —' }), f.hulp)),
          veldRij('Thema als er geen thema staat', themaKeuze(o.themas, standaardThema, (id) => { standaardThema = id; ververs(); }))),
      ];
      return {
        inhoud,
        controleer: () => {
          const mist = CIJFER_VELDEN.filter((f) => f.verplicht && koppeling[f.sleutel] < 0).map((f) => f.label.toLowerCase());
          if (mist.length) return { items: [], problemen: [], regel: `Kies nog een kolom voor: ${mist.join(', ')}.` };
          const r = verwerkCijfers(rijen, koppeling, { themas: o.themas, meetmomenten: o.meetmomenten, standaardThema, nummers, totaalrijen });
          const namen = [...new Set(r.items.map((x) => x.titel))];
          return { ...r, regel: `${aantal(r.items.length, 'cijfer', 'cijfers')} van de ${aantal(rijen.length, 'rij', 'rijen')} ${r.items.length === 1 ? 'is' : 'zijn'} bruikbaar${namen.length ? ` (${namen.slice(0, 4).join(', ')}${namen.length > 4 ? ', …' : ''})` : ''}.` };
        },
        opslaan: (items) => inDelen(items, (deel) => api.post(`/onderzoeken/${ctx.params.id}/invoer/reeks`, { items: deel })),
      };
    },
  });
}

// ---------- Keuze van een vragenlijst ----------

async function kiesVragenlijst(ctx, { titel, uitleg, filter = () => true, geen }) {
  const { vragenlijsten } = await api.get(`/onderzoeken/${ctx.params.id}/vragenlijsten`);
  const lijst = vragenlijsten.filter(filter);
  if (!lijst.length) {
    meld(geen, 'waarschuwing');
    return null;
  }
  if (lijst.length === 1) return lijst[0];
  return new Promise((klaar) => {
    let gekozen = null;
    const id = uniekeId('im-vl');
    const keuze = h('select', { id }, lijst.map((l) => h('option', { value: l.id }, `${l.titel}${l.meetmoment_naam ? ` (${l.meetmoment_naam})` : ''} – ${aantal(l.aantal_vragen, 'vraag', 'vragen')}, ${l.aantal_inzendingen} keer ingevuld`)));
    const verder = h('button', { type: 'button', class: 'knop knop-primair' }, 'Verder');
    const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
    const d = maakDialoog(titel, [h('p', { class: 'zacht' }, uitleg), h('div', { class: 'veld' }, h('label', { for: id }, 'Vragenlijst'), keuze)], [annuleer, verder]);
    verder.addEventListener('click', () => { gekozen = lijst.find((l) => l.id === Number(keuze.value)); d.close(); });
    annuleer.addEventListener('click', () => d.close());
    d.addEventListener('close', () => klaar(gekozen));
    d.showModal();
    keuze.focus();
  });
}

// ---------- 2. Vragen ----------

export async function vragenInlezen(ctx) {
  const o = ctx.onderzoek;
  const vl = await kiesVragenlijst(ctx, {
    titel: 'Vragen inlezen',
    uitleg: 'Kies de vragenlijst waar de vragen bij komen. Ze worden achteraan toegevoegd.',
    geen: 'Maak eerst een vragenlijst bij Vragenlijsten; daarna kun je er vragen in inlezen.',
  });
  if (!vl) return null;
  const eersteThema = o.themas[0]?.naam || 'Werkbeleving';
  return inleesDialoog({
    titel: `Vragen inlezen in "${vl.titel}"`,
    uitleg: 'Heb je de vragen al in Excel staan? Lees ze in één keer in. Daarna kun je elke vraag nog aanpassen bij Vragenlijsten.',
    stappen: ['Zet in de eerste rij de namen van de kolommen.', 'Elke rij daaronder is één vraag of stelling.', 'Bij een meerkeuzevraag zet je de antwoordmogelijkheden in één cel, gescheiden door een puntkomma.'],
    voorbeeld: {
      naam: 'voorbeeld-vragen.xlsx',
      bladen: [{ naam: 'Vragen', kolombreedtes: [26, 60, 14, 44, 10], rijen: [
        ['Thema', 'Vraag', 'Soort', 'Antwoordmogelijkheden', 'Verplicht'],
        [eersteThema, 'Ik kan mijn werk goed aan.', 'schaal', '', 'ja'],
        [eersteThema, 'Heb je het afgelopen jaar een ontwikkelgesprek gehad?', 'ja/nee', '', 'nee'],
        ['Achtergrond', 'Op welke afdeling werk je?', 'meerkeuze', 'Kantoor; Productie; Logistiek', 'nee'],
        [eersteThema, 'Wat zou je als eerste veranderen?', 'open', '', 'nee'],
      ] }],
    },
    knopTekst: (n) => `${aantal(n, 'vraag', 'vragen')} inlezen`,
    bouw: ({ kop, rijen, nummers, totaalrijen, ververs }) => {
      const bezet = new Set();
      const koppeling = {};
      for (const f of VRAAG_VELDEN) {
        koppeling[f.sleutel] = herkenKolom(kop, f.herken, bezet);
        if (koppeling[f.sleutel] >= 0) bezet.add(koppeling[f.sleutel]);
      }
      let standaardThema = o.themas[0]?.id || null;
      let nieuweThemas = [];
      return {
        inhoud: [
          h('h3', { class: 'im-kop' }, 'Welke kolom is wat?'),
          h('div', { class: 'im-koppeling' },
            VRAAG_VELDEN.flatMap((f) => veldRij(`${f.label}${f.verplicht ? ' *' : ''}`,
              kolomKeuze(kop, rijen, koppeling[f.sleutel], (i) => { koppeling[f.sleutel] = i; ververs(); }, { leeg: f.verplicht ? '— kies een kolom —' : '— niet gebruiken —' }), f.hulp)),
            o.themas.length ? veldRij('Thema als er geen thema staat', themaKeuze(o.themas, standaardThema, (id) => { standaardThema = id; ververs(); })) : []),
        ],
        controleer: () => {
          if (koppeling.tekst < 0) return { items: [], problemen: [], regel: 'Kies nog de kolom met de vraag of stelling.' };
          const r = verwerkVragen(rijen, koppeling, { themas: o.themas, standaardThema, bestaand: vl.aantal_vragen, max: 100, nummers, totaalrijen });
          nieuweThemas = r.nieuweThemas;
          const tel = (t) => r.items.filter((q) => q.type === t).length;
          const soorten = [[tel('schaal'), 'schaal'], [tel('janee'), 'ja/nee'], [tel('meerkeuze'), 'meerkeuze'], [tel('open'), 'open']].filter(([n]) => n).map(([n, s]) => `${n} × ${s}`);
          return {
            items: r.items,
            problemen: r.problemen,
            regel: `${aantal(r.items.length, 'vraag', 'vragen')} van de ${aantal(rijen.length, 'rij', 'rijen')} ${r.items.length === 1 ? 'is' : 'zijn'} bruikbaar${soorten.length ? ` (${soorten.join(', ')})` : ''}.`,
            extra: nieuweThemas.length ? h('p', {}, `${nieuweThemas.length === 1 ? 'Dit thema bestaat nog niet en wordt' : 'Deze thema\'s bestaan nog niet en worden'} aangemaakt: `, h('strong', {}, nieuweThemas.join(', ')), '.') : null,
          };
        },
        opslaan: async (items) => {
          const themaId = new Map();
          for (const naam of nieuweThemas) {
            const r = await api.post(`/onderzoeken/${ctx.params.id}/themas`, { naam });
            themaId.set(naam, r.id);
          }
          const vragen = items.map((q) => ({ thema_id: q.thema.id || themaId.get(q.thema.nieuw), type: q.type, tekst: q.tekst, opties: q.opties, verplicht: q.verplicht, schaal_soort: 'eens' }));
          await api.post(`/vragenlijsten/${vl.id}/vragen/reeks`, { vragen });
          if (nieuweThemas.length) await ctx.herlaadOnderzoek();
          return vragen.length;
        },
      };
    },
  });
}

// ---------- 3. Antwoorden ----------

export async function antwoordenInlezen(ctx) {
  const vl = await kiesVragenlijst(ctx, {
    titel: 'Antwoorden inlezen',
    uitleg: 'Kies de vragenlijst waar de antwoorden bij horen.',
    filter: (l) => l.aantal_vragen > 0,
    geen: 'Er is nog geen vragenlijst met vragen. Maak die eerst bij Vragenlijsten.',
  });
  if (!vl) return null;
  const { vragen } = await api.get(`/vragenlijsten/${vl.id}`);
  const schalen = ctx.instellingen.schalen || {};
  const voorbeeldCel = (q) => {
    if (q.type === 'schaal') return 4;
    if (q.type === 'janee') return 'ja';
    if (q.type === 'meerkeuze') return q.opties[0]?.label || '';
    return 'Vrije tekst';
  };
  return inleesDialoog({
    titel: `Antwoorden inlezen in "${vl.titel}"`,
    uitleg: 'Voor antwoorden die je op papier hebt verzameld of uit een ander programma komen. Elke rij in het bestand is één respondent, elke kolom één vraag.',
    stappen: [
      'Schaalvragen: een cijfer van 1 tot 5. Ja/nee-vragen: ja of nee. Meerkeuze: de tekst van het antwoord.',
      'Alleen kolommen die je aan een vraag koppelt, worden ingelezen. Een kolom met namen of e-mailadressen wordt niet bewaard.',
      'Lees hetzelfde bestand niet twee keer in: de antwoorden tellen dan dubbel.',
    ],
    voorbeeld: {
      naam: 'voorbeeld-antwoorden.xlsx',
      bladen: [{ naam: 'Antwoorden', rijen: [['Datum', ...vragen.map((q, i) => `V${i + 1}. ${q.tekst}`)], [vandaag(), ...vragen.map(voorbeeldCel)]] }],
    },
    knopTekst: (n) => `${aantal(n, 'respondent', 'respondenten')} inlezen`,
    bouw: ({ kop, rijen, nummers, totaalrijen, ververs }) => {
      const voorstel = koppelVragen(kop, vragen);
      const koppeling = voorstel.koppeling;
      let datumKolom = voorstel.datum;
      const gekoppeld = () => vragen.filter((q) => koppeling[q.id] >= 0).length;
      const teller = h('p', { class: 'klein zacht' });
      const bijwerken = () => {
        teller.textContent = `${gekoppeld()} van de ${aantal(vragen.length, 'vraag', 'vragen')} gekoppeld aan een kolom.`;
        ververs();
      };
      setTimeout(bijwerken, 0);
      return {
        inhoud: [
          h('h3', { class: 'im-kop' }, 'Welke kolom hoort bij welke vraag?'),
          teller,
          h('div', { class: 'im-koppeling' },
            veldRij('Datum van invullen', kolomKeuze(kop, rijen, datumKolom, (i) => { datumKolom = i; bijwerken(); }, { leeg: '— geen: gebruik vandaag —' })),
            vragen.flatMap((q, i) => veldRij(`V${i + 1}. ${q.tekst}`,
              kolomKeuze(kop, rijen, koppeling[q.id] ?? -1, (k) => { koppeling[q.id] = k; bijwerken(); }, { leeg: '— niet in het bestand —' }),
              { schaal: 'schaal 1–5', janee: 'ja/nee', meerkeuze: 'meerkeuze', open: 'open vraag' }[q.type]))),
        ],
        controleer: () => {
          if (!gekoppeld()) return { items: [], problemen: [], regel: 'Koppel minstens één vraag aan een kolom.' };
          const r = verwerkAntwoorden(rijen, koppeling, datumKolom, vragen, schalen, vandaag(), { nummers, totaalrijen });
          return { items: r.items, problemen: r.problemen, regel: `${aantal(r.items.length, 'respondent', 'respondenten')} van de ${aantal(rijen.length, 'rij', 'rijen')} ${r.items.length === 1 ? 'heeft' : 'hebben'} bruikbare antwoorden. Na het inlezen tellen ze mee in alle resultaten.` };
        },
        // Per verzoek hooguit zo'n 3.000 antwoordcellen, zodat de server binnen de gratis rekentijd blijft.
        opslaan: (items) => inDelen(items, (deel) => api.post(`/vragenlijsten/${vl.id}/inzendingen/reeks`, { inzendingen: deel }), Math.max(10, Math.min(REEKS, Math.floor(3000 / Math.max(1, vragen.length))))),
      };
    },
  });
}

// ---------- 4. Eigen dataset ----------

/** Geeft het id van de nieuwe dataset terug, of null. */
export function datasetToevoegen(ctx) {
  return inleesDialoog({
    titel: 'Eigen dataset toevoegen',
    uitleg: 'Voeg een eigen Excel- of CSV-bestand toe om het bij Analyse te onderzoeken, bijvoorbeeld verzuim per afdeling of gegevens uit een ander systeem. Elke rij is één waarneming, elke kolom één kenmerk.',
    stappen: [
      'Zet in de eerste rij de namen van de kolommen.',
      'Laat namen, personeelsnummers en andere gegevens waarmee iemand te herkennen is uit het bestand, of vink die kolommen hieronder uit.',
    ],
    knopTekst: () => 'Dataset opslaan',
    bouw: ({ kop, rijen, totaalrijen, bestand, ververs }) => {
      const verdacht = new Set(verdachteKolommen(kop, rijen));
      const soorten = kop.map((_, i) => kolomSoort(rijen.map((r) => r[i])));
      const gekozen = new Set(kop.map((k, i) => i).filter((i) => !verdacht.has(kop[i]) && soorten[i] !== 'leeg'));
      const naamId = uniekeId('im-naam');
      const naam = h('input', { type: 'text', id: naamId, maxlength: 150, value: bestand.naam.replace(/\.[a-z0-9]+$/i, '').slice(0, 150) });
      naam.addEventListener('input', ververs);
      let verwerkt = null;
      return {
        inhoud: [
          h('div', { class: 'veld' }, h('label', { for: naamId }, 'Naam van de dataset'), naam),
          h('h3', { class: 'im-kop' }, 'Welke kolommen wil je bewaren?'),
          verdacht.size ? melding(`${verdacht.size === 1 ? 'De kolom' : 'De kolommen'} ${[...verdacht].map((k) => `"${k}"`).join(', ')} ${verdacht.size === 1 ? 'lijkt' : 'lijken'} persoonsgegevens te bevatten en ${verdacht.size === 1 ? 'staat' : 'staan'} daarom uit. Bewaar alleen wat je voor het onderzoek nodig hebt.`, 'waarschuwing') : null,
          h('div', { class: 'im-kolommen' }, kop.map((k, i) => {
            const id = uniekeId('im-k');
            return h('label', { class: 'keuze', for: id },
              h('input', { type: 'checkbox', id, checked: gekozen.has(i), disabled: soorten[i] === 'leeg', onchange: (e) => { if (e.target.checked) gekozen.add(i); else gekozen.delete(i); ververs(); } }),
              h('span', {}, k, h('span', { class: 'klein zacht' }, ` – ${SOORT_NAAM[soorten[i]]}`)));
          })),
        ],
        controleer: () => {
          const lijst = [...gekozen].sort((a, b) => a - b);
          if (!naam.value.trim()) return { items: [], problemen: [], regel: 'Geef de dataset een naam.' };
          if (!lijst.length) return { items: [], problemen: [], regel: 'Kies minstens één kolom.' };
          if (lijst.length > 40) return { items: [], problemen: [], regel: `Je hebt ${lijst.length} kolommen gekozen; een dataset kan er maximaal 40 hebben. Vink kolommen uit die je niet nodig hebt.` };
          verwerkt = verwerkDataset(kop, rijen, lijst, { totaalrijen });
          return { items: verwerkt.rijen.length ? [verwerkt] : [], problemen: verwerkt.problemen, regel: `${aantal(verwerkt.rijen.length, 'rij', 'rijen')} en ${aantal(verwerkt.kolommen.length, 'kolom', 'kolommen')} worden bewaard.` };
        },
        opslaan: async () => {
          const r = await api.post(`/onderzoeken/${ctx.params.id}/datasets`, { naam: naam.value.trim(), kolommen: verwerkt.kolommen, rijen: verwerkt.rijen });
          return r.id;
        },
      };
    },
  });
}

// ---------- De kaart op het scherm Eigen invoer ----------

/** Kaart met de vier mogelijkheden. naInlezen(soort) wordt aangeroepen als er iets is ingelezen. */
export function inleesKaart(ctx, { naInlezen = () => {} } = {}) {
  if (ctx.alleenLezen) return null;
  const basis = `#/onderzoek/${ctx.params.id}`;
  const keuze = (titel, uitleg, knop, start, klaar) => h('li', { class: 'lijst-item' },
    h('div', { class: 'lijst-item-hoofd' },
      h('div', { class: 'lijst-item-titel' }, titel),
      h('div', { class: 'lijst-item-meta' }, uitleg)),
    h('div', { class: 'lijst-item-acties' },
      h('button', {
        type: 'button',
        class: 'knop',
        'aria-haspopup': 'dialog',
        onclick: async () => {
          try {
            const n = await start(ctx);
            if (n !== null && n !== undefined) klaar(n);
          } catch (e) {
            meldFout(e);
          }
        },
      }, knop)));
  return h('section', { class: 'kaart im-kaart', 'aria-labelledby': 'im-kaart-kop' },
    h('div', { class: 'kaart-kop' }, h('h2', { id: 'im-kaart-kop' }, 'Inlezen uit Excel of CSV')),
    h('p', { class: 'zacht' }, 'Heb je gegevens al in een bestand staan? Lees ze in plaats van ze over te typen. Je ziet altijd eerst wat er herkend is, voordat er iets wordt opgeslagen.'),
    h('ul', { class: 'lijst' },
      keuze('Cijfers in één keer', 'Bijvoorbeeld verzuim of verloop per maand. Elke rij wordt een cijfer bij Eigen invoer.', 'Cijfers inlezen', cijfersInlezen,
        (n) => { meld(`${aantal(n, 'cijfer is', 'cijfers zijn')} ingelezen.`, 'succes'); naInlezen('cijfers'); }),
      keuze('Antwoorden op een vragenlijst', 'Voor papieren formulieren of antwoorden uit een ander programma. Elke rij is één respondent.', 'Antwoorden inlezen', antwoordenInlezen,
        (n) => { meld(`${aantal(n, 'respondent is', 'respondenten zijn')} ingelezen. Je ziet ze terug op het dashboard.`, 'succes'); naInlezen('antwoorden'); }),
      keuze('Vragen voor een vragenlijst', 'Een lijst met vragen of stellingen die je al in Excel hebt staan.', 'Vragen inlezen', vragenInlezen,
        (n) => { meld(`${aantal(n, 'vraag is', 'vragen zijn')} ingelezen. Je vindt ze bij Vragenlijsten.`, 'succes'); naInlezen('vragen'); }),
      keuze('Eigen dataset voor Analyse', 'Een eigen bestand om verschillen en verbanden in te onderzoeken, zoals in SPSS.', 'Dataset toevoegen', datasetToevoegen,
        () => { meld('De dataset is opgeslagen. Je vindt hem bij Analyse, onderdeel 6.', 'succes'); naInlezen('dataset'); ctx.navigeer(`${basis}/analyse`); })),
  );
}
