// Bibliotheek: bestanden in en uit (D3 §2.9, ingekort volgens BOUWPLAN B23). Zuivere module (geen DOM).
// - RIS (Zotero, Mendeley en EndNote lezen en schrijven het allemaal): naarRis en leesRis;
// - Excel: bibliotheekBladen geeft de bladen voor maakXlsx (alleen uitvoer);
// - Word: literatuurBlokken geeft de blokken voor maakDocx (een literatuurlijst in APA-volgorde).
// Eigen notities gaan alleen mee in een RIS-bestand als je dat zelf aanzet (metNotities); in Excel wel,
// want dat is je eigen overzicht.

import {
  BRONSOORTEN, ONDERWERPEN, TALEN, BETROUWBAARHEID, legeBron, leesAuteur, auteurAlsTekst, apaVerwijzing, sorteerLiteratuur,
  normaliseer, paginaStreep, taalUitTekst, onderwerpUitTekst, zonderSterren, LIMIETEN,
} from './bibliotheek-regels.js';

// ---------- RIS ----------

const TY_UIT = {
  artikel: 'JOUR', rapport: 'RPRT', boek: 'BOOK', hoofdstuk: 'CHAP', website: 'ELEC', wet: 'STAT', richtlijn: 'STAND',
  cijfers: 'DATA', proefschrift: 'THES', notitie: 'GEN', overig: 'GEN',
};
const TY_IN = {
  JOUR: 'artikel', JFULL: 'artikel', MGZN: 'artikel', NEWS: 'artikel', EJOUR: 'artikel', INPR: 'artikel',
  RPRT: 'rapport', GOVDOC: 'rapport', BOOK: 'boek', EBOOK: 'boek', EDBOOK: 'boek', CHAP: 'hoofdstuk', ECHAP: 'hoofdstuk',
  ELEC: 'website', WEB: 'website', BLOG: 'website', STAT: 'wet', BILL: 'wet', LEGAL: 'wet', STAND: 'richtlijn',
  DATA: 'cijfers', DBASE: 'cijfers', AGGR: 'cijfers', THES: 'proefschrift',
};

/** '2024-03-05' → '2024/03/05/'; '2024-03' → '2024/03//'. */
function risDatum(iso) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(iso ?? ''));
  return m ? `${m[1]}/${m[2]}/${m[3] || ''}/` : '';
}
/** '2024/03/05/' · '2024/03/05' · '2024-03-05' → '2024-03-05'; '2024/03//' → '2024-03'. */
function vanRisDatum(t) {
  const m = /^(\d{4})[/-](\d{1,2})?(?:[/-](\d{1,2})?)?/.exec(String(t ?? '').trim());
  if (!m || !m[2]) return '';
  const mm = m[2].padStart(2, '0');
  return m[3] ? `${m[1]}-${mm}-${m[3].padStart(2, '0')}` : `${m[1]}-${mm}`;
}

const regel = (tag, waarde) => {
  const w = String(waarde ?? '').replace(/\r?\n/g, ' ').trim();
  return w ? [`${tag}  - ${w}`] : [];
};

/**
 * RIS-tekst van bronnen (regeleinden CRLF, UTF-8 zonder BOM). Personen als "Vries, M. de"; is er geen persoon,
 * dan de organisatie als één auteur. De afkorting (CBS) staat in C5, een vrij veld dat andere programma's laten staan.
 * Kernpunten gaan in een notitie (N1) die begint met "Kernpunten:"; eigen notities alleen met metNotities.
 */
export function naarRis(bronnen, { metNotities = false } = {}) {
  const uit = [];
  for (const b of bronnen || []) {
    const d = b.details || {};
    const r = [`TY  - ${TY_UIT[b.soort] || 'GEN'}`];
    const personen = (b.auteurs || []).filter((a) => a && a.achternaam);
    if (personen.length) for (const a of personen) r.push(...regel('AU', auteurAlsTekst(a)));
    else r.push(...regel('AU', b.organisatie));
    for (const a of Array.isArray(d.redacteuren) ? d.redacteuren : []) r.push(...regel('A2', auteurAlsTekst(a)));
    r.push(...regel('TI', b.titel));
    r.push(...regel('T2', d.tijdschrift || d.boektitel || d.sitenaam));
    if (Number.isInteger(b.jaar)) r.push(`PY  - ${b.jaar}`);
    r.push(...regel('DA', risDatum(d.datum)));
    r.push(...regel('VL', d.jaargang));
    r.push(...regel('IS', d.nummer));
    if (d.paginas) {
      const [sp, ep] = paginaStreep(d.paginas).split('–');
      r.push(...regel('SP', sp), ...regel('EP', ep));
    }
    r.push(...regel('C7', d.artikelnummer));
    r.push(...regel('ET', d.druk));
    const uitgever = b.soort === 'proefschrift' ? d.instelling : d.uitgever || (personen.length ? b.organisatie : '');
    r.push(...regel('PB', uitgever));
    r.push(...regel('M1', d.rapportnummer));
    r.push(...regel('M3', d.soort_werk));
    r.push(...regel('C5', b.afkorting));
    r.push(...regel('UR', b.url));
    r.push(...regel('DO', b.doi));
    r.push(...regel('LA', b.taal));
    for (const o of b.onderwerpen || []) r.push(...regel('KW', ONDERWERPEN[o]?.naam || o));
    for (const w of b.trefwoorden || []) r.push(...regel('KW', w));
    r.push(...regel('AB', b.samenvatting));
    if ((b.kernpunten || []).length) r.push(`N1  - Kernpunten:${b.kernpunten.map((k) => ` • ${String(k).replace(/\s+/g, ' ').trim()}`).join('')}`);
    if (metNotities && String(b.notities ?? '').trim()) r.push(...regel('N1', `Notities: ${b.notities}`));
    r.push(...regel('Y2', risDatum(d.geraadpleegd)));
    r.push('ER  - ');
    uit.push(r.join('\r\n'));
  }
  return uit.length ? `${uit.join('\r\n\r\n')}\r\n` : '';
}

/**
 * Leest een RIS-bestand. → { bronnen: [bron (zoals legeBron)], meldingen: [tekst] }.
 * Vervolgregels (zonder tag) horen bij de vorige tag. Een record zonder titel wordt overgeslagen.
 */
export function leesRis(tekst) {
  const regels = String(tekst ?? '').replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const records = [];
  let huidig = null;
  let laatste = null;
  regels.forEach((ruw, i) => {
    const m = /^([A-Z][A-Z0-9])  ?-(?: (.*))?$/.exec(ruw);
    if (m) {
      const [, tag, waarde = ''] = m;
      if (tag === 'TY') {
        huidig = { regel: i + 1, velden: [] };
        records.push(huidig);
      }
      if (!huidig) return;
      if (tag === 'ER') {
        huidig = null;
        laatste = null;
        return;
      }
      laatste = { tag, waarde: waarde.trim() };
      huidig.velden.push(laatste);
    } else if (huidig && laatste && ruw.trim()) {
      laatste.waarde = `${laatste.waarde} ${ruw.trim()}`.trim();
    }
  });

  const bronnen = [];
  const meldingen = [];
  for (const rec of records) {
    const alle = (tag) => rec.velden.filter((v) => v.tag === tag).map((v) => v.waarde).filter(Boolean);
    const eerste = (...tags) => {
      for (const t of tags) {
        const w = alle(t)[0];
        if (w) return w;
      }
      return '';
    };
    const type = eerste('TY').toUpperCase();
    const bron = legeBron(TY_IN[type] || 'overig');
    const d = {};
    bron.titel = eerste('TI', 'T1', 'CT', 'BT');
    if (!bron.titel) {
      meldingen.push(`Regel ${rec.regel}: geen titel; overgeslagen.`);
      continue;
    }
    for (const a of [...alle('AU'), ...alle('A1')]) {
      const gelezen = leesAuteur(a);
      if (!gelezen) continue;
      if (gelezen.organisatie) {
        if (!bron.organisatie) bron.organisatie = gelezen.organisatie;
      } else bron.auteurs.push(gelezen);
    }
    const redacteuren = [...alle('A2'), ...alle('ED')].map(leesAuteur).filter((a) => a && a.achternaam);
    const jaar = /(\d{4})/.exec(eerste('PY', 'Y1', 'DA'));
    if (jaar) bron.jaar = Number(jaar[1]);
    const t2 = eerste('T2', 'JO', 'JF', 'JA', 'BT', 'T3');
    if (bron.soort === 'artikel') d.tijdschrift = t2;
    else if (bron.soort === 'hoofdstuk') d.boektitel = t2;
    else if (bron.soort === 'website') d.sitenaam = t2;
    d.jaargang = eerste('VL');
    d.nummer = eerste('IS');
    const sp = eerste('SP');
    const ep = eerste('EP');
    if (sp) d.paginas = paginaStreep(ep && !sp.includes('-') ? `${sp}-${ep}` : sp);
    d.artikelnummer = eerste('C7');
    d.druk = eerste('ET');
    const pb = eerste('PB');
    if (bron.soort === 'proefschrift') d.instelling = pb;
    else if (bron.soort === 'rapport' && bron.auteurs.length && !bron.organisatie) bron.organisatie = pb;
    else d.uitgever = pb;
    d.rapportnummer = bron.soort === 'rapport' ? eerste('M1', 'SN') : '';
    if (bron.soort === 'proefschrift') d.soort_werk = /master/i.test(eerste('M3')) ? 'Masterscriptie' : /bachelor/i.test(eerste('M3')) ? 'Bachelorscriptie' : eerste('M3') ? 'Proefschrift' : '';
    if (redacteuren.length) d.redacteuren = redacteuren.slice(0, LIMIETEN.redacteuren);
    d.datum = vanRisDatum(eerste('DA'));
    d.geraadpleegd = vanRisDatum(eerste('Y2'));
    bron.afkorting = eerste('C5').slice(0, LIMIETEN.afkorting);
    bron.url = eerste('UR', 'L2');
    bron.doi = eerste('DO').replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
    if (!bron.doi) {
      const doiLink = /doi\.org\/(10\.\d{4,9}\/\S+)$/i.exec(bron.url);
      if (doiLink) {
        bron.doi = doiLink[1];
        bron.url = '';
      }
    }
    const taal = taalUitTekst(eerste('LA'));
    if (taal) bron.taal = taal;
    for (const k of alle('KW')) {
      for (const w of k.split(/\s*;\s*/).filter(Boolean)) {
        const o = onderwerpUitTekst(w);
        if (o && normaliseer(ONDERWERPEN[o].naam) === normaliseer(w)) {
          if (!bron.onderwerpen.includes(o)) bron.onderwerpen.push(o);
        } else if (bron.trefwoorden.length < LIMIETEN.trefwoorden && !bron.trefwoorden.includes(w)) {
          bron.trefwoorden.push(w.slice(0, LIMIETEN.trefwoord));
        }
      }
    }
    let samenvatting = eerste('AB', 'N2');
    if (samenvatting.length > LIMIETEN.samenvatting) {
      meldingen.push(`Regel ${rec.regel}: de samenvatting is ingekort tot ${LIMIETEN.samenvatting.toLocaleString('nl-NL')} tekens.`);
      samenvatting = samenvatting.slice(0, LIMIETEN.samenvatting);
    }
    bron.samenvatting = samenvatting;
    const notities = [];
    for (const n of alle('N1')) {
      if (/^Kernpunten:/i.test(n)) {
        bron.kernpunten = n.replace(/^Kernpunten:\s*/i, '').split(/\s*•\s*/).map((x) => x.trim()).filter(Boolean).slice(0, LIMIETEN.kernpunten);
      } else notities.push(n.replace(/^Notities:\s*/i, ''));
    }
    bron.notities = notities.join('\n\n').slice(0, LIMIETEN.notities);
    for (const [k, w] of Object.entries(d)) {
      if (Array.isArray(w) ? w.length : String(w ?? '').trim()) bron.details[k] = w;
    }
    bronnen.push(bron);
  }
  if (!records.length) meldingen.push('Dit bestand bevat geen bronnen in RIS-vorm (regels als "TY  - JOUR").');
  return { bronnen, meldingen };
}

/** Tekstbestand lezen: UTF-8, of anders windows-1252 (zoals oudere Windows-programma's het opslaan). */
export function leesTekstBestand(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

// ---------- Excel ----------

const KOLOMMEN = [
  ['Citeersleutel', (b) => b.citeersleutel || ''],
  ['Titel', (b) => b.titel],
  ['Auteurs', (b) => (b.auteurs || []).map(auteurAlsTekst).join('; ')],
  ['Organisatie', (b) => b.organisatie],
  ['Afkorting', (b) => b.afkorting],
  ['Jaar', (b) => (Number.isInteger(b.jaar) ? b.jaar : 'z.d.')],
  ['Soort', (b) => BRONSOORTEN[b.soort] || b.soort],
  ['Taal', (b) => TALEN[b.taal] || b.taal],
  ['Onderwerpen', (b) => (b.onderwerpen || []).map((o) => ONDERWERPEN[o]?.naam || o).join('; ')],
  ['Trefwoorden', (b) => (b.trefwoorden || []).join('; ')],
  ['Samenvatting', (b) => b.samenvatting],
  ['Kernpunten', (b) => (b.kernpunten || []).join('\n')],
  ['Betrouwbaarheid', (b) => BETROUWBAARHEID[b.betrouwbaarheid]?.naam || ''],
  ['Toelichting betrouwbaarheid', (b) => b.betrouwbaarheid_toelichting],
  ['URL', (b) => b.url],
  ['DOI', (b) => b.doi],
  ['Tijdschrift', (b) => b.details?.tijdschrift],
  ['Jaargang', (b) => b.details?.jaargang],
  ['Nummer', (b) => b.details?.nummer],
  ["Pagina's", (b) => b.details?.paginas],
  ['Uitgever', (b) => b.details?.uitgever || b.details?.instelling],
  ['Druk', (b) => b.details?.druk],
  ['Boektitel', (b) => b.details?.boektitel],
  ['Redacteuren', (b) => (b.details?.redacteuren || []).map(auteurAlsTekst).join('; ')],
  ['Rapportnummer', (b) => b.details?.rapportnummer],
  ['Naam website', (b) => b.details?.sitenaam],
  ['Datum', (b) => b.details?.datum],
  ['Geraadpleegd op', (b) => b.details?.geraadpleegd],
  ['Eigen notities', (b) => b.notities],
  ['Collectie', (b) => (b.collectie === 'start' ? 'Startcollectie' : 'Eigen bron')],
  ['Gebruikt in onderzoeken', null],
  ['APA-verwijzing', (b) => zonderSterren(apaVerwijzing(b))],
];

/**
 * De bladen voor maakXlsx: "Bronnen" (één rij per bron) en "Uitleg". onderzoeken: { id: titel } om "Gebruikt in
 * onderzoeken" in te vullen. Met metNotities: false blijft de kolom "Eigen notities" leeg.
 */
export function bibliotheekBladen(bronnen, { onderzoeken = {}, metNotities = true } = {}) {
  const rijen = [KOLOMMEN.map(([kop]) => kop)];
  for (const b of bronnen || []) {
    rijen.push(KOLOMMEN.map(([kop, f]) => {
      if (kop === 'Gebruikt in onderzoeken') return (b.onderzoeken || []).map((id) => onderzoeken[id] || `Onderzoek ${id}`).join('; ');
      if (kop === 'Eigen notities' && !metNotities) return '';
      const w = f(b);
      return w === undefined || w === null ? '' : w;
    }));
  }
  const uitleg = [
    ['Kolom', 'Betekenis'],
    ['Citeersleutel', 'De code waarmee je de bron in een rapport noemt, bijvoorbeeld [@bakker2017]. Verandert nooit.'],
    ['Auteurs', 'Personen als "Achternaam, Voorletters", gescheiden door een puntkomma. Is een organisatie de auteur, dan staat die bij Organisatie.'],
    ['Jaar', 'z.d. betekent: zonder datum.'],
    ['Soort', Object.values(BRONSOORTEN).join(' · ')],
    ['Taal', Object.values(TALEN).join(' · ')],
    ['Onderwerpen', Object.values(ONDERWERPEN).map((o) => o.naam).join(' · ')],
    ['Betrouwbaarheid', Object.values(BETROUWBAARHEID).map((x) => `${x.naam}${x.uitleg ? `: ${x.uitleg}` : ''}`).join(' · ')],
    ['Kernpunten', 'Eén kernpunt per regel.'],
    ['Eigen notities', 'Alleen voor jou. Deel dit bestand niet als er notities in staan die niet voor anderen bedoeld zijn.'],
    ['Collectie', 'Startcollectie (openbare bronnen, gecontroleerd) of Eigen bron.'],
    ['APA-verwijzing', 'Zo staat de bron in een literatuurlijst (APA, 7e editie, Nederlandse schrijfwijze), zonder cursief.'],
  ];
  return [
    { naam: 'Bronnen', rijen, kolombreedtes: [16, 50, 36, 30, 10, 8, 22, 12, 34, 30, 60, 50, 14, 30, 36, 24] },
    { naam: 'Uitleg', rijen: uitleg, kolombreedtes: [24, 100] },
  ];
}

// ---------- Word ----------

/**
 * Blokken voor maakDocx: een kop en één alinea per bron in APA-volgorde (met *cursief*). hangend: true vraagt om
 * een hangend inspringen; maakDocx negeert het tot bestanden.js dat ondersteunt (pakket P6).
 */
export function literatuurBlokken(bronnen, { titel = 'Literatuurlijst' } = {}) {
  const lijst = sorteerLiteratuur(bronnen);
  return [
    { soort: 'kop', niveau: 1, tekst: titel },
    ...lijst.map(({ bron, suffix }) => ({ soort: 'alinea', tekst: apaVerwijzing(bron, { suffix }), hangend: true })),
  ];
}
