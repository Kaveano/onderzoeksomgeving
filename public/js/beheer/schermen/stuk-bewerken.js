// Scherm: één stuk schrijven.
// - Automatisch opslaan (na een korte pauze in het typen, bij wisselen van veld/tabblad en bij weggaan).
// - Eenvoudige opmaak met Markdown-tekens (## kop, **vet**, *cursief*, - opsomming, 1. genummerd, > citaat).
// - Voorbeeldweergave die de opmaak veilig met DOM-elementen opbouwt (nooit innerHTML).
// - Conflictafhandeling als het stuk ergens anders (ander tabblad/apparaat) is gewijzigd.

import { api, downloadUrl } from '../api.js';
import { h, vervang, melding, meld, meldFout, kopieer, download, aantal } from '../ui.js';
import { wanneer } from './stukken.js';

const WACHTTIJD = 1500; // ms stilte na typen voordat we opslaan
const OPNIEUW_NA = 10000; // ms tot een nieuwe poging na een netwerkfout
const MAX_DIEPTE = 6; // maximaal geneste citaten in het voorbeeld

const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
const CTRL = IS_MAC ? 'Cmd' : 'Ctrl';

// ---------- Markdown-patronen ----------

const P_KOP = /^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/;
const P_KOP_PREFIX = /^[ \t]{0,3}#{1,6}[ \t]+/;
const P_OPSOMMING = /^[ \t]*[-*+][ \t]+/;
const P_GENUMMERD = /^[ \t]*(\d{1,9})[.)][ \t]+/;
const P_LIJST = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/;
const P_CITAAT = /^[ \t]{0,3}>[ \t]?/;

function isBlokStart(regel) {
  return P_KOP.test(regel) || P_OPSOMMING.test(regel) || P_GENUMMERD.test(regel) || P_CITAAT.test(regel);
}

/** Telt woorden (letters/cijfers); opmaaktekens zoals ## en ** tellen niet mee. */
export function telWoorden(tekst) {
  const m = tekst.match(/[\p{L}\p{N}]+(?:['’.,-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

function isSpatie(teken) {
  return teken === undefined || /\s/.test(teken);
}

/** Zoekt de afsluitende markering (* of **) voor opmaak die bij positie start begint; -1 als die er niet is. */
function zoekSluiting(t, start, mark) {
  if (start >= t.length || isSpatie(t[start])) return -1;
  let j = start;
  while (j < t.length) {
    if (t[j] === '\\') {
      j += 2;
      continue;
    }
    if (mark === '*' && t.startsWith('**', j)) {
      // Vet binnen cursief overslaan.
      const k = t.indexOf('**', j + 2);
      j = k === -1 ? j + 2 : k + 2;
      continue;
    }
    if (j > start && t.startsWith(mark, j) && !isSpatie(t[j - 1])) {
      if (mark === '**' || t[j + 1] !== '*' || t.startsWith('**', j + 1)) return j;
    }
    j++;
  }
  return -1;
}

/** Zet een regel tekst om naar tekst + <strong>/<em>. Alles wordt als tekst ingevoegd (veilig). */
function inline(t) {
  const uit = [];
  let buffer = '';
  let i = 0;
  const leeg = () => {
    if (buffer) uit.push(buffer);
    buffer = '';
  };
  while (i < t.length) {
    const c = t[i];
    if (c === '\\' && (t[i + 1] === '*' || t[i + 1] === '\\' || t[i + 1] === '#' || t[i + 1] === '>')) {
      buffer += t[i + 1];
      i += 2;
      continue;
    }
    if (c === '*') {
      if (t.startsWith('**', i)) {
        const eind = zoekSluiting(t, i + 2, '**');
        if (eind > i + 2) {
          leeg();
          uit.push(h('strong', {}, inline(t.slice(i + 2, eind))));
          i = eind + 2;
          continue;
        }
      } else {
        const eind = zoekSluiting(t, i + 1, '*');
        if (eind > i + 1) {
          leeg();
          uit.push(h('em', {}, inline(t.slice(i + 1, eind))));
          i = eind + 1;
          continue;
        }
      }
    }
    buffer += c;
    i++;
  }
  leeg();
  return uit;
}

/** Bouwt het voorbeeld van een Markdown-tekst als lijst DOM-elementen. */
export function maakVoorbeeld(tekst, diepte = 0) {
  const regels = tekst.replace(/\r\n?/g, '\n').split('\n');
  const blokken = [];
  let i = 0;
  while (i < regels.length) {
    const regel = regels[i];
    if (!regel.trim()) {
      i++;
      continue;
    }
    let m = P_KOP.exec(regel);
    if (m && m[1].length <= 3) {
      const niveau = m[1].length;
      blokken.push(h(`h${niveau + 2}`, { class: `st-v-kop st-v-kop-${niveau}` }, inline(m[2].replace(/[ \t]+#+[ \t]*$/, '').trim())));
      i++;
      continue;
    }
    if (P_CITAAT.test(regel) && diepte < MAX_DIEPTE) {
      const binnen = [];
      while (i < regels.length && P_CITAAT.test(regels[i])) {
        binnen.push(regels[i].replace(P_CITAAT, ''));
        i++;
      }
      blokken.push(h('blockquote', { class: 'st-v-citaat' }, maakVoorbeeld(binnen.join('\n'), diepte + 1)));
      continue;
    }
    const isOps = P_OPSOMMING.test(regel);
    m = P_GENUMMERD.exec(regel);
    if (isOps || m) {
      const patroon = isOps ? P_OPSOMMING : P_GENUMMERD;
      const items = [];
      while (i < regels.length && patroon.test(regels[i])) {
        const li = h('li', {}, inline(regels[i].replace(patroon, '')));
        i++;
        // Ingesprongen vervolgregels horen bij hetzelfde punt.
        while (i < regels.length && /^[ \t]{2,}\S/.test(regels[i]) && !P_LIJST.test(regels[i])) {
          li.append(h('br'), ...inline(regels[i].trim()));
          i++;
        }
        items.push(li);
      }
      if (isOps) {
        blokken.push(h('ul', { class: 'st-v-lijst' }, items));
      } else {
        const start = parseInt(m[1], 10);
        blokken.push(h('ol', { class: 'st-v-lijst', start: start !== 1 ? String(start) : null }, items));
      }
      continue;
    }
    // Gewone alinea: regels tot een lege regel of een nieuw blok; enkele regeleinden blijven zichtbaar.
    const p = h('p', {});
    let eerste = true;
    while (i < regels.length && regels[i].trim() && (eerste || !isBlokStart(regels[i]))) {
      if (!eerste) p.append(h('br'));
      for (const n of inline(regels[i])) p.append(n);
      eerste = false;
      i++;
    }
    blokken.push(p);
  }
  return blokken;
}

// ---------- Scherm ----------

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const stukId = ctx.params.stukId;
  const lijstAdres = `#/onderzoek/${onderzoekId}/stukken`;
  const soorten = ctx.instellingen.stuksoorten || {};
  const kruimel = () => h('div', { class: 'kruimel st-kruimel' }, h('a', { href: lijstAdres }, '← Alle stukken'));

  let data;
  try {
    data = await api.get(`/stukken/${stukId}`);
  } catch (e) {
    if (e.status === 401) return;
    vervang(container,
      kruimel(),
      melding([
        h('strong', {}, e.status === 404 ? 'Dit stuk bestaat niet (meer). ' : 'Dit stuk kon niet worden geladen. '),
        e.status === 404 ? 'Misschien is het verwijderd. ' : `${e.message || ''} `,
        h('a', { href: lijstAdres }, 'Naar alle stukken'),
      ], 'gevaar'),
    );
    return;
  }

  const stuk = data.stuk;
  if (String(stuk.onderzoek_id) !== String(onderzoekId)) {
    ctx.navigeer(`#/onderzoek/${stuk.onderzoek_id}/stukken/${stuk.id}`);
    return;
  }
  const alleenLezen = !!ctx.alleenLezen || data.onderzoek_status === 'gearchiveerd';
  ctx.zetTitel(`${stuk.titel} – Stukken`);

  // ---------- Toestand ----------

  let bekend = { titel: stuk.titel, soort: stuk.soort, inhoud: stuk.inhoud || '' }; // zoals laatst opgeslagen
  let bijgewerktOp = stuk.bijgewerkt_op;
  let timer = null;
  let opnieuwTimer = null;
  let lopend = null; // de opslagronde die nu loopt (Promise)
  let nogmaals = false; // tijdens het opslaan is er weer iets gewijzigd
  let verstuurt = false;
  let conflict = null; // { actueel } zolang er een conflict is
  let geblokkeerd = null; // 'weg' (stuk verwijderd) of 'gearchiveerd': opslaan kan niet meer
  let fout = null; // { soort: 'netwerk' | 'anders', tekst }
  let laatsteFoutTekst = '';
  let opgeslagenOm = null;
  let gestopt = false;
  let voorbeeldAan = alleenLezen;
  let waarschuwingAan = false;
  let openDialoog = null;
  const banners = new Map();

  const CONCEPT = `onderzoeksomgeving:stuk-concept:${stukId}`;

  // ---------- Elementen ----------

  const titelFout = h('div', { class: 'veld-fout', id: 'st-titel-fout', 'aria-live': 'polite' });
  const titelVeld = h('input', {
    type: 'text',
    id: 'st-titel',
    class: 'st-titel',
    maxlength: 200,
    value: stuk.titel,
    autocomplete: 'off',
    spellcheck: 'true',
    lang: 'nl',
    placeholder: 'Titel van het stuk',
    'aria-describedby': 'st-titel-fout',
    oninput: () => {
      controleerTitel();
      plan();
    },
    onchange: () => slaOp(),
    onkeydown: (e) => sneltoets(e),
  });

  const soortVeld = h('select', { id: 'st-soort', onchange: () => slaOp() },
    Object.entries(soorten).map(([waarde, label]) => h('option', { value: waarde, selected: waarde === stuk.soort }, label)));

  const tekstVeld = h('textarea', {
    id: 'st-tekst',
    class: 'st-tekst',
    value: bekend.inhoud,
    spellcheck: 'true',
    lang: 'nl',
    autocapitalize: 'sentences',
    'aria-describedby': 'st-tekst-hulp',
    placeholder: alleenLezen ? '' : 'Begin hier met schrijven…\n\nGebruik de knoppen hierboven voor kopjes, vetgedrukte tekst en opsommingen. Alles wordt vanzelf opgeslagen.',
    oninput: () => naInvoer(),
    onblur: () => {
      if (gewijzigd()) slaOp();
    },
    onkeydown: (e) => {
      if (sneltoets(e)) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && !alleenLezen) {
        if (vervolgLijst()) e.preventDefault();
      }
    },
  });
  if (alleenLezen) {
    tekstVeld.readOnly = true;
    tekstVeld.setAttribute('aria-readonly', 'true');
  }

  const voorbeeldEl = h('article', { class: 'st-voorbeeld verborgen', 'aria-label': 'Voorbeeld van de opgemaakte tekst' });
  const statusEl = h('p', { class: 'st-status', role: 'status', 'aria-atomic': 'true' });
  const woordenEl = h('span', { class: 'st-woorden zacht' });
  const meldingenEl = h('div', { class: 'st-meldingen' });

  // ---------- Opmaakknoppen ----------

  const opmaakKnoppen = [
    ['Kop', 'Kop: zet ## voor de regel', () => regelOpmaak('kop'), 'st-ok-kop'],
    ['Subkop', 'Subkop: zet ### voor de regel', () => regelOpmaak('subkop'), 'st-ok-subkop'],
    ['Vet', `Vet: zet ** om de tekst (${CTRL}+B)`, () => omring('**', 'vetgedrukte tekst'), 'st-ok-vet', 'Control+B Meta+B'],
    ['Cursief', `Cursief: zet * om de tekst (${CTRL}+I)`, () => omring('*', 'schuine tekst'), 'st-ok-cursief', 'Control+I Meta+I'],
    ['Opsomming', 'Opsomming: zet - voor de regel', () => regelOpmaak('opsomming'), 'st-ok-ops'],
    ['Genummerd', 'Genummerde lijst: zet 1. voor de regel', () => regelOpmaak('genummerd'), 'st-ok-num'],
    ['Citaat', 'Citaat: zet > voor de regel', () => regelOpmaak('citaat'), 'st-ok-citaat'],
  ].map(([label, titel, actie, klasse, toetsen]) => h('button', {
    type: 'button',
    class: `knop knop-klein st-opmaakknop ${klasse}`,
    title: titel,
    'aria-keyshortcuts': toetsen || null,
    // Voorkomt dat het tekstvak de focus (en de selectie) verliest bij klikken/tikken.
    onmousedown: (e) => e.preventDefault(),
    onclick: () => {
      if (alleenLezen || voorbeeldAan) return;
      actie();
    },
  }, label));

  const opmaakGroep = h('div', { class: 'st-opmaak', role: 'group', 'aria-label': 'Opmaak' }, opmaakKnoppen);

  const weergaveKnoppen = (alleenLezen ? ['Opgemaakt', 'Platte tekst'] : ['Schrijven', 'Voorbeeld']).map((label, i) => h('button', {
    type: 'button',
    class: 'st-weergaveknop',
    // Bij alleen lezen is de eerste knop het voorbeeld; bij schrijven de tweede.
    onclick: () => zetVoorbeeld(alleenLezen ? i === 0 : i === 1),
  }, label));
  const weergaveGroep = h('div', { class: 'st-weergave', role: 'group', 'aria-label': 'Weergave' }, weergaveKnoppen);

  const downloadKnop = h('button', {
    type: 'button',
    class: 'knop knop-klein',
    onclick: async () => {
      if (gewijzigd() && !conflict && !geblokkeerd) await slaOp();
      if (gewijzigd()) meld('Let op: je laatste wijzigingen zijn nog niet opgeslagen en staan dus niet in de download.', 'fout');
      download(downloadUrl(`/stukken/${stukId}/download`));
    },
  }, 'Downloaden (.txt)');

  // ---------- Hulpfuncties toestand ----------

  function weg() {
    return gestopt || !tekstVeld.isConnected;
  }

  function huidig() {
    return { titel: titelVeld.value.trim() || bekend.titel, soort: soortVeld.value, inhoud: tekstVeld.value };
  }

  function gewijzigd() {
    if (alleenLezen) return false;
    const n = huidig();
    return n.titel !== bekend.titel || n.soort !== bekend.soort || n.inhoud !== bekend.inhoud;
  }

  function uur(d) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function controleerTitel() {
    const leegTitel = !titelVeld.value.trim();
    titelVeld.setAttribute('aria-invalid', leegTitel ? 'true' : 'false');
    titelFout.textContent = leegTitel ? `Geef het stuk een titel. Tot die tijd blijft de oude titel ("${bekend.titel}") bewaard.` : '';
  }

  const telLater = (() => {
    let t = null;
    return () => {
      clearTimeout(t);
      t = setTimeout(telNu, 250);
    };
  })();
  function telNu() {
    woordenEl.textContent = aantal(telWoorden(tekstVeld.value), 'woord', 'woorden');
  }

  function naInvoer() {
    telLater();
    plan();
  }

  // ---------- Concept op dit apparaat (vangnet als opslaan niet lukt) ----------

  function bewaarConcept() {
    if (alleenLezen) return;
    try {
      sessionStorage.setItem(CONCEPT, JSON.stringify({ ...huidig(), basis: bijgewerktOp, tijd: new Date().toISOString() }));
    } catch {
      /* opslag niet beschikbaar of vol: geen probleem */
    }
  }
  function wisConcept() {
    try {
      sessionStorage.removeItem(CONCEPT);
    } catch {
      /* niets */
    }
  }
  function leesConcept() {
    try {
      const ruw = sessionStorage.getItem(CONCEPT);
      const c = ruw ? JSON.parse(ruw) : null;
      return c && typeof c.inhoud === 'string' && typeof c.titel === 'string' ? c : null;
    } catch {
      return null;
    }
  }

  // ---------- Status ----------

  function toonStatus() {
    let tekst;
    let soort;
    if (alleenLezen) {
      tekst = `Laatst bijgewerkt ${wanneer(bijgewerktOp)}`;
      soort = 'rust';
    } else if (geblokkeerd) {
      tekst = geblokkeerd === 'weg' ? 'Niet opgeslagen: dit stuk bestaat niet meer.' : 'Niet opgeslagen: het onderzoek is gearchiveerd.';
      soort = 'fout';
    } else if (conflict) {
      tekst = 'Niet opgeslagen: dit stuk is ergens anders gewijzigd.';
      soort = 'fout';
    } else if (verstuurt) {
      tekst = 'Bezig met opslaan…';
      soort = 'bezig';
    } else if (fout && fout.soort === 'netwerk') {
      tekst = 'Niet opgeslagen: geen verbinding. We proberen het zo opnieuw.';
      soort = 'fout';
    } else if (fout) {
      tekst = `Niet opgeslagen: ${fout.tekst}`;
      soort = 'fout';
    } else if (gewijzigd()) {
      tekst = 'Nog niet opgeslagen';
      soort = 'wacht';
    } else if (opgeslagenOm) {
      tekst = `Opgeslagen om ${uur(opgeslagenOm)}`;
      soort = 'ok';
    } else {
      const w = wanneer(bijgewerktOp);
      tekst = w.startsWith('vandaag ') ? `Opgeslagen ${w.slice(8)}` : `Opgeslagen ${w}`;
      soort = 'ok';
    }
    if (statusEl.textContent !== tekst) statusEl.textContent = tekst;
    statusEl.className = `st-status st-status-${soort}`;
    zetVertrekWaarschuwing();
  }

  // Waarschuwing bij sluiten van het tabblad, alleen zolang er iets niet is opgeslagen.
  function bijSluiten(e) {
    if (weg()) {
      opruimen();
      return;
    }
    if (!gewijzigd() && !verstuurt) return;
    bewaarConcept();
    e.preventDefault();
    e.returnValue = '';
  }
  function zetVertrekWaarschuwing() {
    const nodig = !weg() && !alleenLezen && (gewijzigd() || verstuurt);
    if (nodig && !waarschuwingAan) window.addEventListener('beforeunload', bijSluiten);
    if (!nodig && waarschuwingAan) window.removeEventListener('beforeunload', bijSluiten);
    waarschuwingAan = nodig;
  }

  // ---------- Opslaan ----------

  function plan() {
    if (alleenLezen || weg()) return;
    clearTimeout(timer);
    if (!conflict && !geblokkeerd) timer = setTimeout(() => slaOp(), WACHTTIJD);
    toonStatus();
  }

  /** Slaat op. Er loopt nooit meer dan één opslag tegelijk; wat tussentijds verandert gaat in de volgende ronde mee. */
  function slaOp(opties = {}) {
    clearTimeout(timer);
    if (alleenLezen) return Promise.resolve();
    if (lopend) {
      nogmaals = true;
      return lopend;
    }
    const ronde = (async () => {
      try {
        let o = opties;
        do {
          nogmaals = false;
          await eenKeerOpslaan(o);
          o = {};
        } while (nogmaals && !conflict && !geblokkeerd && !fout && !weg());
      } finally {
        lopend = null;
        if (!weg()) toonStatus();
      }
    })();
    lopend = ronde;
    return ronde;
  }

  async function eenKeerOpslaan({ overschrijven = false } = {}) {
    if (weg() || geblokkeerd) return;
    if (conflict && !overschrijven) return;
    if (!gewijzigd() && !overschrijven) return;
    const n = huidig();
    const body = { soort: n.soort, inhoud: n.inhoud, bijgewerkt_op: bijgewerktOp };
    if (titelVeld.value.trim()) body.titel = n.titel;
    if (overschrijven) body.overschrijven = true;
    bewaarConcept();
    verstuurt = true;
    toonStatus();
    try {
      const r = await api.put(`/stukken/${stukId}`, body);
      const titelAnders = n.titel !== bekend.titel;
      bijgewerktOp = r.bijgewerkt_op;
      bekend = n;
      fout = null;
      laatsteFoutTekst = '';
      conflict = null;
      opgeslagenOm = new Date();
      clearTimeout(opnieuwTimer);
      verbergBanner('conflict');
      if (!gewijzigd()) wisConcept();
      if (titelAnders) {
        ctx.zetTitel(`${n.titel} – Stukken`);
        controleerTitel();
      }
    } catch (e) {
      if (e.status === 409 && e.data && e.data.conflict) {
        conflict = { actueel: e.data.actueel || {} };
        toonConflict();
      } else if (e.status === 0) {
        fout = { soort: 'netwerk' };
        clearTimeout(opnieuwTimer);
        opnieuwTimer = setTimeout(() => {
          if (!weg()) slaOp();
        }, OPNIEUW_NA);
      } else if (e.status === 401) {
        fout = { soort: 'anders', tekst: 'je sessie is verlopen. Log opnieuw in via het venster; daarna wordt je tekst automatisch opgeslagen.' };
      } else if (e.status === 404) {
        geblokkeerd = 'weg';
        toonGeblokkeerd();
      } else if (e.status === 409) {
        geblokkeerd = 'gearchiveerd';
        toonGeblokkeerd(e.message);
      } else {
        fout = { soort: 'anders', tekst: e.message || 'er ging iets mis.' };
        if (fout.tekst !== laatsteFoutTekst) meldFout(e);
        laatsteFoutTekst = fout.tekst;
      }
    } finally {
      verstuurt = false;
    }
  }

  // ---------- Meldingen boven de editor ----------

  function toonBanner(sleutel, el) {
    verbergBanner(sleutel);
    banners.set(sleutel, el);
    meldingenEl.append(el);
  }
  function verbergBanner(sleutel) {
    const el = banners.get(sleutel);
    if (el) el.remove();
    banners.delete(sleutel);
  }

  function kopieerKnop(klasse = 'knop knop-klein') {
    const uitkomst = h('span', { class: 'st-kopieer-uitkomst klein', 'aria-live': 'polite' });
    const knop = h('button', {
      type: 'button',
      class: klasse,
      onclick: async () => {
        const gelukt = await kopieer(tekstVeld.value);
        uitkomst.textContent = gelukt
          ? 'Je tekst staat op het klembord. Plak hem ergens anders om hem te bewaren.'
          : 'Kopiëren lukte niet. Selecteer de tekst zelf en kopieer hem.';
      },
    }, 'Kopieer mijn tekst');
    return [knop, uitkomst];
  }

  function toonGeblokkeerd(tekst) {
    clearTimeout(timer);
    clearTimeout(opnieuwTimer);
    bewaarConcept();
    const [knop, uitkomst] = kopieerKnop();
    toonBanner('geblokkeerd', melding([
      h('p', {}, h('strong', {}, geblokkeerd === 'weg' ? 'Dit stuk bestaat niet meer. ' : 'Dit stuk kan niet meer worden gewijzigd. '),
        geblokkeerd === 'weg'
          ? 'Het is intussen verwijderd, bijvoorbeeld in een ander tabblad. Je laatste wijzigingen zijn niet opgeslagen.'
          : `${tekst || 'Het onderzoek is gearchiveerd.'} Je laatste wijzigingen zijn niet opgeslagen.`),
      h('div', { class: 'knoppen' }, knop, h('a', { class: 'knop knop-klein', href: lijstAdres }, 'Naar alle stukken')),
      uitkomst,
    ], 'gevaar'));
    toonStatus();
  }

  function toonConflict() {
    clearTimeout(timer);
    clearTimeout(opnieuwTimer);
    toonBanner('conflict', melding([
      h('p', {}, h('strong', {}, 'Dit stuk is ergens anders gewijzigd. '),
        'Je wijzigingen worden niet meer vanzelf opgeslagen totdat je kiest welke versie je wilt houden.'),
      h('div', { class: 'knoppen' }, h('button', { type: 'button', class: 'knop knop-klein knop-primair', onclick: conflictDialoog }, 'Kies welke versie je houdt')),
    ], 'gevaar'));
    toonStatus();
    conflictDialoog();
  }

  function conflictDialoog() {
    if (!conflict || (openDialoog && openDialoog.open)) return;
    const actueel = conflict.actueel || {};
    const foutEl = h('div', { class: 'veld-fout', role: 'alert' });
    const inhoud = h('div', { class: 'dialoog-inhoud' });
    const voet = h('div', { class: 'dialoog-voet' });
    const d = h('dialog', { class: 'dialoog st-dialoog', 'aria-labelledby': 'st-conflict-titel' }, inhoud, voet);
    openDialoog = d;

    // Terug naar het tekstvak (tenzij de focus netjes op de knop in de melding terugkwam).
    let focusGedaan = false;
    function herstelFocus() {
      if (focusGedaan) return;
      focusGedaan = true;
      const actief = document.activeElement;
      if (!actief || actief === document.body || actief === tekstVeld) terugNaarTekst();
    }
    function sluit() {
      d.close();
      herstelFocus();
    }

    function stap1() {
      const andereWoorden = telWoorden(actueel.inhoud || '');
      const mijnWoorden = telWoorden(tekstVeld.value);
      const bewaar = h('button', { type: 'button', class: 'knop knop-primair' }, 'Mijn versie bewaren');
      const andere = h('button', { type: 'button', class: 'knop' }, 'De andere versie laden');
      const later = h('button', { type: 'button', class: 'knop knop-licht' }, 'Later beslissen');
      vervang(inhoud,
        h('h2', { id: 'st-conflict-titel', tabindex: '-1' }, 'Dit stuk is ergens anders gewijzigd'),
        h('p', {}, 'Terwijl jij aan het schrijven was, is dit stuk op een andere plek opgeslagen. Bijvoorbeeld in een ander tabblad, op een ander apparaat of met “Neem op in stuk” op het dashboard.'),
        h('ul', { class: 'st-conflict-feiten' },
          h('li', {}, `De andere versie is opgeslagen ${wanneer(actueel.bijgewerkt_op) || 'zojuist'} en heeft ${aantal(andereWoorden, 'woord', 'woorden')}.`),
          h('li', {}, `Jouw versie in dit scherm heeft ${aantal(mijnWoorden, 'woord', 'woorden')}.`),
        ),
        h('details', { class: 'st-conflict-details' },
          h('summary', {}, 'Bekijk de andere versie'),
          actueel.titel ? h('p', { class: 'klein zacht' }, `Titel: ${actueel.titel}`) : null,
          h('div', { class: 'st-conflict-tekst' }, actueel.inhoud || '(Deze versie is leeg.)'),
        ),
        h('p', {}, h('strong', {}, 'Welke versie wil je houden?')),
        h('ul', { class: 'st-conflict-keuzes' },
          h('li', {}, h('strong', {}, 'Mijn versie bewaren: '), 'jouw tekst wordt opgeslagen en vervangt de andere versie.'),
          h('li', {}, h('strong', {}, 'De andere versie laden: '), 'je ziet de andere versie; jouw wijzigingen verdwijnen uit dit scherm. Je kunt ze eerst kopiëren.'),
        ),
        foutEl,
      );
      vervang(voet, later, andere, bewaar);
      later.addEventListener('click', sluit);
      andere.addEventListener('click', stap2);
      bewaar.addEventListener('click', async () => {
        bewaar.disabled = true;
        andere.disabled = true;
        foutEl.textContent = '';
        if (lopend) await lopend;
        await slaOp({ overschrijven: true });
        if (!conflict && !fout && !geblokkeerd) {
          sluit();
          meld('Jouw versie is opgeslagen.', 'succes');
        } else {
          foutEl.textContent = fout && fout.soort === 'netwerk'
            ? 'Opslaan is niet gelukt: er is geen verbinding. Probeer het zo nog eens.'
            : `Opslaan is niet gelukt${fout && fout.tekst ? `: ${fout.tekst}` : '.'}`;
          bewaar.disabled = false;
          andere.disabled = false;
          if (geblokkeerd) sluit();
        }
      });
      // Focus op de kop, niet op een knop: wie nog aan het typen was, kiest zo niet per ongeluk (spatie/Enter).
      inhoud.querySelector('h2').focus();
    }

    function stap2() {
      const [kopieerKnopEl, uitkomst] = kopieerKnop('knop');
      const terug = h('button', { type: 'button', class: 'knop knop-licht' }, 'Terug');
      const laad = h('button', { type: 'button', class: 'knop knop-gevaar' }, 'Andere versie laden');
      vervang(inhoud,
        h('h2', { id: 'st-conflict-titel' }, 'De andere versie laden?'),
        h('p', {}, 'Je eigen tekst verdwijnt dan uit dit scherm. Wil je (een deel ervan) bewaren? Kopieer hem dan eerst. Daarna kun je hem in de andere versie plakken.'),
        h('div', { class: 'knoppen' }, kopieerKnopEl),
        uitkomst,
        foutEl,
      );
      vervang(voet, terug, laad);
      terug.addEventListener('click', stap1);
      laad.addEventListener('click', async () => {
        laad.disabled = true;
        await laadAndereVersie();
        sluit();
      });
      kopieerKnopEl.focus();
    }

    d.addEventListener('close', () => {
      setTimeout(() => d.remove(), 0);
      if (openDialoog === d) openDialoog = null;
      herstelFocus(); // ook bij sluiten met Escape
    });
    document.body.append(d);
    d.showModal();
    stap1();
  }

  function terugNaarTekst() {
    if (voorbeeldAan || weg()) return;
    // Na het sluiten van een dialoog zet Chrome de focus soms "half" terug op het tekstvak (typen komt dan
    // niet aan). Opnieuw focussen maakt de cursor weer actief.
    if (document.activeElement === tekstVeld) tekstVeld.blur();
    tekstVeld.focus({ preventScroll: true });
  }

  function pasToe(nieuw) {
    titelVeld.value = nieuw.titel;
    if (nieuw.soort && soorten[nieuw.soort]) soortVeld.value = nieuw.soort;
    tekstVeld.value = nieuw.inhoud || '';
    bekend = { titel: nieuw.titel, soort: soortVeld.value, inhoud: nieuw.inhoud || '' };
    bijgewerktOp = nieuw.bijgewerkt_op;
    controleerTitel();
    telNu();
    if (voorbeeldAan) tekenVoorbeeld();
    ctx.zetTitel(`${nieuw.titel} – Stukken`);
  }

  async function laadAndereVersie() {
    let nieuw = null;
    try {
      nieuw = (await api.get(`/stukken/${stukId}`)).stuk;
    } catch {
      const a = conflict ? conflict.actueel : {};
      nieuw = { titel: a.titel || bekend.titel, soort: soortVeld.value, inhoud: a.inhoud || '', bijgewerkt_op: a.bijgewerkt_op };
    }
    clearTimeout(timer);
    pasToe(nieuw);
    conflict = null;
    fout = null;
    opgeslagenOm = null;
    verbergBanner('conflict');
    wisConcept();
    toonStatus();
    meld('De andere versie staat nu in beeld.', 'succes');
  }

  // Terug naar dit tabblad: als hier niets openstaat, haal stilletjes de nieuwste versie op.
  async function verversAlsNodig() {
    if (alleenLezen || weg() || gewijzigd() || lopend || conflict || geblokkeerd || fout) return;
    try {
      const r = await api.get(`/stukken/${stukId}`);
      if (weg() || gewijzigd() || lopend || conflict) return;
      if (r.stuk.bijgewerkt_op !== bijgewerktOp) {
        const sel = [tekstVeld.selectionStart, tekstVeld.selectionEnd, tekstVeld.scrollTop];
        pasToe(r.stuk);
        const max = tekstVeld.value.length;
        tekstVeld.setSelectionRange(Math.min(sel[0], max), Math.min(sel[1], max));
        tekstVeld.scrollTop = sel[2];
        opgeslagenOm = null;
        toonStatus();
        meld('Dit stuk is ergens anders bijgewerkt. Je ziet nu de nieuwste versie.');
      }
    } catch {
      /* niet erg: de volgende opslag merkt een eventueel conflict op */
    }
  }

  // ---------- Opmaak invoegen ----------

  /** Vervangt een stuk tekst zo dat "ongedaan maken" (Ctrl+Z) blijft werken waar de browser dat toelaat. */
  function vervangBereik(van, tot, tekst, selVan, selTot) {
    const oud = tekstVeld.value;
    const verwacht = oud.slice(0, van) + tekst + oud.slice(tot);
    tekstVeld.focus({ preventScroll: true });
    tekstVeld.setSelectionRange(van, tot);
    let gelukt = false;
    try {
      if (tekst) gelukt = document.execCommand('insertText', false, tekst);
      else gelukt = van === tot || document.execCommand('delete', false);
    } catch {
      gelukt = false;
    }
    if (!gelukt || tekstVeld.value !== verwacht) {
      tekstVeld.value = verwacht;
      naInvoer();
    }
    tekstVeld.setSelectionRange(selVan, selTot);
  }

  function regelOpmaak(soort) {
    const t = tekstVeld.value;
    const s = tekstVeld.selectionStart;
    const e = tekstVeld.selectionEnd;
    const begin = s > 0 ? t.lastIndexOf('\n', s - 1) + 1 : 0;
    const eindZoek = e > s && t[e - 1] === '\n' ? e - 1 : e;
    let eind = t.indexOf('\n', eindZoek);
    if (eind === -1) eind = t.length;
    const regels = t.slice(begin, eind).split('\n');
    const gevuld = regels.filter((r) => r.trim());

    const isKop = soort === 'kop' || soort === 'subkop';
    const hekjes = soort === 'kop' ? 2 : 3;
    const heeftAl = (r) => {
      if (isKop) {
        const m = P_KOP.exec(r);
        return !!m && m[1].length === hekjes;
      }
      if (soort === 'opsomming') return P_OPSOMMING.test(r);
      if (soort === 'genummerd') return P_GENUMMERD.test(r);
      return P_CITAAT.test(r);
    };
    const uitzetten = gevuld.length > 0 && gevuld.every(heeftAl);
    const vast = { kop: '## ', subkop: '### ', opsomming: '- ', citaat: '> ' };

    let nr = 0;
    let eersteVoorvoegsel = 0;
    const nieuw = regels.map((r, idx) => {
      if (!r.trim() && regels.length > 1) return r;
      if (uitzetten) {
        const patroon = isKop ? P_KOP_PREFIX : soort === 'opsomming' ? P_OPSOMMING : soort === 'genummerd' ? P_GENUMMERD : P_CITAAT;
        return r.replace(patroon, '');
      }
      let kaal = r;
      if (isKop) kaal = r.replace(P_CITAAT, '').replace(P_KOP_PREFIX, '').replace(P_LIJST, '').replace(/^[ \t]+/, '');
      else if (soort === 'opsomming' || soort === 'genummerd') kaal = r.replace(P_KOP_PREFIX, '').replace(P_LIJST, '').replace(/^[ \t]+/, '');
      nr++;
      const voorvoegsel = soort === 'genummerd' ? `${nr}. ` : vast[soort];
      if (idx === 0) eersteVoorvoegsel = voorvoegsel.length;
      return voorvoegsel + kaal;
    });
    const blok = nieuw.join('\n');
    let selVan;
    let selTot;
    if (s === e && regels.length === 1) {
      const vanafEinde = eind - s;
      selVan = Math.max(begin + eersteVoorvoegsel, begin + blok.length - vanafEinde);
      selVan = Math.min(selVan, begin + blok.length);
      selTot = selVan;
    } else {
      selVan = begin;
      selTot = begin + blok.length;
    }
    vervangBereik(begin, eind, blok, selVan, selTot);
  }

  function sterrenVoor(t, pos) {
    let n = 0;
    while (pos - n - 1 >= 0 && t[pos - n - 1] === '*') n++;
    return n;
  }
  function sterrenNa(t, pos) {
    let n = 0;
    while (pos + n < t.length && t[pos + n] === '*') n++;
    return n;
  }
  function heeftOpmaak(voor, na, n) {
    // Vet: aan beide kanten minstens 2 sterren. Cursief: aan beide kanten 1 of 3 sterren.
    return n === 2 ? voor >= 2 && na >= 2 : voor % 2 === 1 && na % 2 === 1;
  }

  /** Zet ** (vet) of * (cursief) om de selectie, of haalt ze weg als ze er al staan. */
  function omring(teken, voorbeeld) {
    const t = tekstVeld.value;
    let s = tekstVeld.selectionStart;
    let e = tekstVeld.selectionEnd;
    const n = teken.length;
    if (s === e) {
      // Geen selectie: neem het woord waar de cursor in of naast staat.
      const woordTeken = /[\p{L}\p{N}_'’-]/u;
      let a = s;
      let b = s;
      while (a > 0 && woordTeken.test(t[a - 1])) a--;
      while (b < t.length && woordTeken.test(t[b])) b++;
      if (a < b) {
        s = a;
        e = b;
      }
    }
    while (s < e && /\s/.test(t[s])) s++;
    while (e > s && /\s/.test(t[e - 1])) e--;
    if (s === e) {
      const invoeg = teken + voorbeeld + teken;
      vervangBereik(s, e, invoeg, s + n, s + n + voorbeeld.length);
      return;
    }
    const gekozen = t.slice(s, e);
    // Opmaaktekens staan net buiten de selectie: weghalen.
    if (heeftOpmaak(sterrenVoor(t, s), sterrenNa(t, e), n)) {
      vervangBereik(s - n, e + n, gekozen, s - n, e - n);
      return;
    }
    // Opmaaktekens zijn mee geselecteerd: weghalen.
    if (gekozen.length > 2 * n && heeftOpmaak(sterrenNa(gekozen, 0), sterrenVoor(gekozen, gekozen.length), n)) {
      const kaal = gekozen.slice(n, gekozen.length - n);
      vervangBereik(s, e, kaal, s, s + kaal.length);
      return;
    }
    if (gekozen.includes('\n')) {
      // Per regel, en buiten eventuele tekens voor kopjes/lijsten/citaten om.
      const nieuw = gekozen.split('\n').map((r) => {
        const m = /^([ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d{1,9}[.)][ \t]+)*)(.*?)([ \t]*)$/.exec(r);
        if (!m || !m[2]) return r;
        return m[1] + teken + m[2] + teken + m[3];
      }).join('\n');
      vervangBereik(s, e, nieuw, s, s + nieuw.length);
      return;
    }
    vervangBereik(s, e, teken + gekozen + teken, s + n, e + n);
  }

  /** Enter in een lijst of citaat: volgende regel krijgt hetzelfde teken; op een leeg punt stopt de lijst. */
  function vervolgLijst() {
    const s = tekstVeld.selectionStart;
    if (s !== tekstVeld.selectionEnd) return false;
    const t = tekstVeld.value;
    const begin = s > 0 ? t.lastIndexOf('\n', s - 1) + 1 : 0;
    let regelEind = t.indexOf('\n', s);
    if (regelEind === -1) regelEind = t.length;
    const m = /^([ \t]*)([-*+]|\d{1,9}[.)]|>)([ \t]+)(.*)$/.exec(t.slice(begin, s));
    if (!m) return false;
    if (!m[4].trim() && !t.slice(s, regelEind).trim()) {
      vervangBereik(begin, regelEind, '', begin, begin);
      return true;
    }
    let teken = m[2];
    if (/^\d/.test(teken)) teken = `${parseInt(teken, 10) + 1}${teken.slice(-1)}`;
    const invoeg = `\n${m[1]}${teken}${m[3]}`;
    vervangBereik(s, s, invoeg, s + invoeg.length, s + invoeg.length);
    return true;
  }

  function sneltoets(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
    const toets = (e.key || '').toLowerCase();
    if (toets === 's') {
      e.preventDefault();
      if (!alleenLezen) slaOp();
      return true;
    }
    if (e.target !== tekstVeld || alleenLezen || voorbeeldAan) return false;
    if (toets === 'b') {
      e.preventDefault();
      omring('**', 'vetgedrukte tekst');
      return true;
    }
    if (toets === 'i') {
      e.preventDefault();
      omring('*', 'schuine tekst');
      return true;
    }
    return false;
  }

  // ---------- Voorbeeld ----------

  function tekenVoorbeeld() {
    const blokken = maakVoorbeeld(tekstVeld.value);
    vervang(voorbeeldEl, blokken.length ? blokken : h('p', { class: 'zacht' }, 'Er staat nog niets in dit stuk.'));
  }

  function zetVoorbeeld(aan) {
    voorbeeldAan = aan;
    if (aan) tekenVoorbeeld();
    voorbeeldEl.classList.toggle('verborgen', !aan);
    tekstVeld.classList.toggle('verborgen', aan);
    opmaakGroep.classList.toggle('verborgen', aan || alleenLezen);
    weergaveKnoppen.forEach((k, i) => {
      const actief = alleenLezen ? (i === 0) === aan : (i === 1) === aan;
      k.setAttribute('aria-pressed', actief ? 'true' : 'false');
    });
    if (!aan && !alleenLezen && document.activeElement && weergaveGroep.contains(document.activeElement)) {
      tekstVeld.focus({ preventScroll: true });
    }
  }

  // ---------- Luisteraars voor pagina en tabblad ----------

  function bijZichtbaarheid() {
    if (weg()) {
      opruimen();
      return;
    }
    if (document.visibilityState === 'hidden') {
      if (gewijzigd() && !conflict && !geblokkeerd) {
        bewaarConcept();
        slaOp();
      }
    } else {
      verversAlsNodig();
    }
  }
  /** Na opnieuw inloggen (verlopen sessie): meteen alsnog opslaan. */
  function bijWeerIngelogd() {
    if (weg()) return;
    if (fout) {
      fout = null;
      slaOp();
    }
  }

  function bijOnline() {
    if (weg()) {
      opruimen();
      return;
    }
    if (fout && fout.soort === 'netwerk') slaOp();
  }
  // Op een telefoon staat de schakelaar Schrijven/Voorbeeld boven de werkbalk, zodat die laag blijft.
  const smal = window.matchMedia('(max-width: 640px)');
  function plaatsWeergave() {
    if (weg()) {
      opruimen();
      return;
    }
    if (alleenLezen) return;
    const doel = smal.matches ? weergaveVak : balkRechts;
    if (weergaveGroep.parentNode !== doel) doel.append(weergaveGroep);
    zetBalkPositie();
  }
  const kop = document.querySelector('.kop');
  function zetBalkPositie() {
    if (weg()) {
      opruimen();
      return;
    }
    balk.style.top = `${kop ? kop.offsetHeight : 0}px`;
  }

  function opruimen() {
    gestopt = true;
    clearTimeout(timer);
    clearTimeout(opnieuwTimer);
    document.removeEventListener('visibilitychange', bijZichtbaarheid);
    window.removeEventListener('online', bijOnline);
    window.removeEventListener('weer-ingelogd', bijWeerIngelogd);
    window.removeEventListener('resize', zetBalkPositie);
    window.removeEventListener('beforeunload', bijSluiten);
    smal.removeEventListener('change', plaatsWeergave);
    waarschuwingAan = false;
  }

  // ---------- Opbouw ----------

  const balkRechts = h('div', { class: 'st-balk-rechts' }, statusEl, weergaveGroep);
  const balk = h('div', { class: 'st-balk' }, alleenLezen ? null : opmaakGroep, balkRechts);
  const weergaveVak = h('div', { class: 'st-weergavevak' });

  const kopDeel = alleenLezen
    ? h('div', { class: 'st-kop-lezen' },
      h('h2', { class: 'st-titel-lezen' }, stuk.titel),
      h('div', { class: 'rij' },
        h('span', { class: 'label' }, soorten[stuk.soort] || stuk.soort),
        h('span', { class: 'label label-archief' }, 'Alleen lezen'),
      ))
    : h('div', { class: 'st-kop' },
      h('h2', { class: 'sr-only' }, 'Stuk bewerken'),
      h('div', { class: 'veld st-titelveld' },
        h('label', { for: 'st-titel', class: 'st-veldlabel' }, 'Titel'),
        titelVeld,
        titelFout,
      ),
      h('div', { class: 'veld st-soortveld' },
        h('label', { for: 'st-soort', class: 'st-veldlabel' }, 'Soort'),
        soortVeld,
      ),
      weergaveVak,
    );

  const hulp = alleenLezen ? null : h('details', { class: 'kaart st-hulp' },
    h('summary', {}, 'Hoe werkt de opmaak?'),
    h('p', { class: 'zacht' }, 'Je maakt tekst op met een paar eenvoudige tekens. De knoppen boven het tekstvak zetten ze voor je neer; je kunt ze ook zelf typen. Onder “Voorbeeld” zie je hoe het eruitziet. In de download (.txt) blijven de tekens gewoon staan.'),
    h('div', { class: 'tabel-wrapper' },
      h('table', { class: 'tabel st-hulptabel' },
        h('caption', { class: 'sr-only' }, 'Overzicht van de opmaaktekens'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Je typt'), h('th', { scope: 'col' }, 'Je krijgt'))),
        h('tbody', {},
          [
            ['## Inleiding', 'een kop'],
            ['### Werkdruk', 'een subkop'],
            ['**belangrijk**', h('strong', {}, 'belangrijk')],
            ['*let op*', h('em', {}, 'let op')],
            ['- eerste punt', 'een opsomming met bolletjes'],
            ['1. eerste stap', 'een genummerde lijst'],
            ['> een uitspraak', 'een citaat'],
            [h('span', {}, 'Twee keer Enter (een lege regel)'), 'een nieuwe alinea'],
          ].map(([typ, krijg]) => h('tr', {},
            h('td', {}, typeof typ === 'string' ? h('code', { class: 'st-code' }, typ) : typ),
            h('td', {}, krijg))),
        ),
      ),
    ),
    h('p', { class: 'zacht klein' }, `Sneltoetsen: ${CTRL}+B voor vet, ${CTRL}+I voor cursief, ${CTRL}+S om meteen op te slaan. Druk in een lijst op Enter voor een volgend punt; op een leeg punt stopt de lijst.`),
  );

  vervang(container,
    kruimel(),
    meldingenEl,
    h('section', { class: `kaart st-scherm st-bewerken${alleenLezen ? ' st-alleen-lezen' : ''}` },
      kopDeel,
      balk,
      h('div', { class: 'st-schrijfvlak' },
        h('label', { for: 'st-tekst', class: 'sr-only' }, alleenLezen ? 'Tekst van het stuk (alleen lezen)' : 'Tekst van het stuk'),
        tekstVeld,
        voorbeeldEl,
        h('p', { id: 'st-tekst-hulp', class: 'sr-only' },
          alleenLezen ? 'Dit stuk kun je alleen lezen.' : 'Wordt vanzelf opgeslagen. Opmaak met Markdown-tekens, zie “Hoe werkt de opmaak?” onder het tekstvak.'),
      ),
      h('div', { class: 'st-voet' }, woordenEl, downloadKnop),
    ),
    hulp,
  );

  // ---------- Start ----------

  telNu();
  zetVoorbeeld(voorbeeldAan);
  toonStatus();
  plaatsWeergave();
  zetBalkPositie();
  smal.addEventListener('change', plaatsWeergave);
  window.addEventListener('resize', zetBalkPositie);
  document.addEventListener('visibilitychange', bijZichtbaarheid);
  window.addEventListener('online', bijOnline);
  window.addEventListener('weer-ingelogd', bijWeerIngelogd);

  // Niet-opgeslagen tekst van een eerder bezoek (bijv. verbinding weg of uitgelogd) terugzetten?
  if (!alleenLezen) {
    const concept = leesConcept();
    const andersDanServer = concept && (concept.inhoud !== bekend.inhoud || concept.titel !== bekend.titel || concept.soort !== bekend.soort);
    if (andersDanServer) {
      const terugzetten = h('button', { type: 'button', class: 'knop knop-klein knop-primair' }, 'Terugzetten');
      const weggooien = h('button', { type: 'button', class: 'knop knop-klein' }, 'Weggooien');
      toonBanner('concept', melding([
        h('p', {}, h('strong', {}, 'Er is nog tekst die niet is opgeslagen. '),
          `In dit tabblad staat een versie van ${wanneer(concept.tijd) || 'eerder'} (${aantal(telWoorden(concept.inhoud), 'woord', 'woorden')}) die niet bij de server is aangekomen. Wil je die terugzetten? De tekst die nu in het stuk staat, wordt dan vervangen.`),
        h('details', { class: 'st-conflict-details' },
          h('summary', {}, 'Bekijk die tekst'),
          h('div', { class: 'st-conflict-tekst' }, concept.inhoud || '(leeg)'),
        ),
        h('div', { class: 'knoppen' }, terugzetten, weggooien),
      ], 'waarschuwing'));
      terugzetten.addEventListener('click', async () => {
        titelVeld.value = concept.titel || bekend.titel;
        if (soorten[concept.soort]) soortVeld.value = concept.soort;
        tekstVeld.value = concept.inhoud;
        controleerTitel();
        telNu();
        if (voorbeeldAan) tekenVoorbeeld();
        verbergBanner('concept');
        await slaOp();
        if (!gewijzigd()) meld('Je tekst is teruggezet en opgeslagen.', 'succes');
      });
      weggooien.addEventListener('click', () => {
        wisConcept();
        verbergBanner('concept');
      });
    } else if (concept) {
      wisConcept();
    }
  }

  // Voor het verlaten van het scherm: eerst opslaan wat nog openstaat.
  ctx.bijVertrek(async () => {
    window.removeEventListener('beforeunload', bijSluiten);
    waarschuwingAan = false;
    clearTimeout(timer);
    clearTimeout(opnieuwTimer);
    if (openDialoog && openDialoog.open) openDialoog.close();
    if (!alleenLezen && !conflict && !geblokkeerd && tekstVeld.isConnected) {
      if (lopend) await lopend;
      if (gewijzigd()) await slaOp();
    }
    const nietOpgeslagen = !alleenLezen && gewijzigd();
    if (nietOpgeslagen) bewaarConcept();
    opruimen();
    if (nietOpgeslagen) {
      meld(`Je laatste wijzigingen in "${huidig().titel}" zijn niet opgeslagen. Open het stuk opnieuw in dit tabblad om ze terug te zetten.`, 'fout');
    }
  });

  // Een nieuw (leeg) stuk: meteen kunnen beginnen met typen.
  if (!alleenLezen && !bekend.inhoud) {
    setTimeout(() => {
      if (!weg() && !document.querySelector('dialog[open]')) tekstVeld.focus({ preventScroll: true });
    }, 0);
  }
}
