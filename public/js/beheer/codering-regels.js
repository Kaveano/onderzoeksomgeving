// Open antwoorden en interviews coderen: tellen en de feiten voor het rapport (BOUWPLAN B24, §3.10, PR-19).
// Zuivere module (geen DOM, geen fetch): de Worker, het scherm Analyse · Open antwoorden, het rapport (P6) en de
// tests gebruiken dezelfde code.
//
// Privacy (PR-19):
// - een vraag komt alleen in de feiten als hij minstens 5 (DREMPEL) niet-lege antwoorden heeft;
// - aantallen per code van 1 tot 4 worden niet getoond (×), met aanvullend verbergen via verbergReeks over
//   [codes…, antwoorden zonder code], zodat een klein aantal niet terug te rekenen is;
// - een citaat komt alleen in het rapport als het gecontroleerd én voor het rapport gekozen is; bij een vraag uit
//   een vragenlijst ook alleen als die vraag minstens 5 antwoorden heeft. Het citaat is een aanpasbare kopie;
// - per groep (afdeling …) alleen via de gemaskeerde kruistabellen van de werkbank (codes zijn daar 0/1-variabelen).

import { DREMPEL, verbergReeks } from './privacy.js';

export const MAX_CODES = 200;
export const MAX_CODERINGEN = 50_000;
export const MAX_CITATEN = 300;
export const MAX_CITAAT = 1000;
export const MAX_CODENAAM = 60;
export const MAX_OMSCHRIJVING = 500;
/** Soorten eigen invoer die je kunt coderen (tab Interviews). */
export const INTERVIEW_SOORTEN = ['interview', 'observatie'];

export const HULP_CODE = 'Een code is een kort label voor wat iemand zegt, bijvoorbeeld ‘werkdruk’ of ‘waardering’. Geef elk antwoord één of meer codes. Zo zie je wat vaak genoemd wordt.';
export const CITAAT_CONTROLE = 'Controleer of dit citaat iemand herkenbaar maakt. Haal namen, functies en andere herkenbare details weg.';
export const GECONTROLEERD_LABEL = 'Gecontroleerd: dit citaat maakt niemand herkenbaar';
export const CITAAT_NIET_GECONTROLEERD = 'Een citaat komt pas in het rapport als je hebt aangevinkt dat het gecontroleerd is: het maakt niemand herkenbaar.';

/** Een open antwoord dat meetelt: tekst met iets anders dan spaties. */
export const isAntwoord = (w) => typeof w === 'string' && w.trim() !== '';

/** Sleutel van één te coderen stuk: een antwoord (inzending + vraag) of een stuk eigen invoer. */
export const itemSleutel = (c) => (c.invoer_id ? `v:${c.invoer_id}` : `i:${c.inzending_id}:${c.vraag_id}`);

/** coderingen → Map<itemSleutel, Set<code_id>>. */
export function codesPerItem(coderingen) {
  const uit = new Map();
  for (const c of coderingen || []) {
    const k = itemSleutel(c);
    if (!uit.has(k)) uit.set(k, new Set());
    uit.get(k).add(c.code_id);
  }
  return uit;
}

/** Codes in de volgorde van het codeboek (volgorde, dan id). */
export function codeboek(codes) {
  return [...(codes || [])].sort((a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0) || a.id - b.id);
}

/**
 * Gemaskeerde telling voor een reeks stukken (de antwoorden op één vraag, of alle interviews).
 * items: [itemSleutel]; perItem: codesPerItem(); codes: codeboek.
 * metNul: ook codes die niet voorkomen (voor het codeboek op het scherm); anders alleen gebruikte codes.
 * → { n, codes: [{ code_id, naam, aantal: number|null, verborgen }], geen_code: number|null, geen_code_verborgen, iets_verborgen }
 */
export function telling(items, perItem, codes, { d = DREMPEL, metNul = false } = {}) {
  const n = items.length;
  const tel = new Map();
  let zonder = 0;
  for (const k of items) {
    const set = perItem.get(k);
    let heeft = false;
    if (set) {
      for (const id of set) {
        tel.set(id, (tel.get(id) || 0) + 1);
        heeft = true;
      }
    }
    if (!heeft) zonder++;
  }
  const lijst = codeboek(codes).filter((c) => metNul || tel.get(c.id) > 0);
  const aantallen = [...lijst.map((c) => tel.get(c.id) || 0), zonder];
  const verborgen = verbergReeks(aantallen, d);
  return {
    n,
    codes: lijst.map((c, i) => ({ code_id: c.id, naam: c.naam, aantal: verborgen[i] ? null : aantallen[i], verborgen: verborgen[i] })),
    geen_code: verborgen[lijst.length] ? null : zonder,
    geen_code_verborgen: verborgen[lijst.length],
    iets_verborgen: verborgen.some(Boolean),
  };
}

/** De open vragen van een vragenlijst met hun niet-lege antwoorden: [{ vraag, lijst, items: [itemSleutel], teksten: Map<inzending_id, tekst> }]. */
export function openVragen(data, { lijstIds = null } = {}) {
  const lijsten = (data.vragenlijsten || []).filter((l) => !lijstIds || lijstIds.map(Number).includes(Number(l.id)));
  const perLijst = new Map();
  for (const inz of data.inzendingen || []) {
    if (!perLijst.has(inz.vragenlijst_id)) perLijst.set(inz.vragenlijst_id, []);
    perLijst.get(inz.vragenlijst_id).push(inz);
  }
  const uit = [];
  for (const lijst of lijsten) {
    const inz = perLijst.get(lijst.id) || [];
    for (const vraag of (data.vragen || []).filter((q) => q.vragenlijst_id === lijst.id && q.type === 'open')) {
      const items = [];
      const teksten = new Map();
      for (const i of inz) {
        const w = i.antwoorden?.[vraag.id];
        if (isAntwoord(w) && i.id !== undefined && i.id !== null) {
          items.push(`i:${i.id}:${vraag.id}`);
          teksten.set(i.id, w);
        }
      }
      uit.push({ vraag, lijst, items, teksten });
    }
  }
  return uit;
}

/** De interviews en observaties uit Eigen invoer. */
export function interviews(data) {
  return (data.eigen_invoer || []).filter((e) => INTERVIEW_SOORTEN.includes(e.soort));
}

/**
 * Feiten voor het rapport en het overzicht, al gemaskeerd (PR-19).
 * data: Export met inzendingen (met id), codes, coderingen, citaten en eigen_invoer.
 * lijstIds: alleen deze vragenlijsten (null = alle).
 * → { vragen: [{ vraag_id, stam, tekst, lijst_id, lijst_titel, n_antwoorden, codes: [{ code_id, naam, aantal, verborgen }], geen_code }],
 *     interviews: { n, codes: [...], geen_code } | null,
 *     citaten: [{ code_naam, tekst, bron: 'vragenlijst'|'interview', vraag: tekst|null }] }
 * Een vraag staat erin als hij minstens d niet-lege antwoorden heeft en er minstens één code bij is gegeven.
 */
export function coderingFeiten(data, { d = DREMPEL, lijstIds = null } = {}) {
  const codes = codeboek(data.codes);
  const perItem = codesPerItem(data.coderingen);
  const naamVan = new Map(codes.map((c) => [c.id, c.naam]));
  const vragen = [];
  const groteVragen = new Set(); // `${inzending_id}:${vraag_id}` mag een citaat geven
  const vraagTekst = new Map();
  for (const { vraag, lijst, items, teksten } of openVragen(data, { lijstIds })) {
    if (items.length < d) continue;
    for (const inzId of teksten.keys()) groteVragen.add(`${inzId}:${vraag.id}`);
    vraagTekst.set(vraag.id, vraag.tekst);
    if (!items.some((k) => perItem.get(k)?.size)) continue;
    const t = telling(items, perItem, codes, { d });
    vragen.push({
      vraag_id: vraag.id, stam: vraag.bron_vraag_id || vraag.id, tekst: vraag.tekst, lijst_id: lijst.id, lijst_titel: lijst.titel,
      n_antwoorden: items.length, codes: t.codes, geen_code: t.geen_code,
    });
  }
  const iv = interviews(data);
  let ivFeiten = null;
  const ivItems = iv.map((e) => `v:${e.id}`);
  if (ivItems.some((k) => perItem.get(k)?.size)) {
    const t = telling(ivItems, perItem, codes, { d });
    ivFeiten = { n: iv.length, codes: t.codes, geen_code: t.geen_code };
  }
  const ivIds = new Set(iv.map((e) => e.id));
  const citaten = [...(data.citaten || [])]
    .sort((a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0) || a.id - b.id)
    .filter((c) => Number(c.gecontroleerd) === 1 && Number(c.in_rapport) === 1 && isAntwoord(c.tekst))
    .filter((c) => (c.invoer_id ? ivIds.has(c.invoer_id) : groteVragen.has(`${c.inzending_id}:${c.vraag_id}`)))
    .map((c) => ({
      code_naam: c.code_id ? naamVan.get(c.code_id) ?? null : null,
      tekst: String(c.tekst).trim(),
      bron: c.invoer_id ? 'interview' : 'vragenlijst',
      vraag: c.invoer_id ? null : vraagTekst.get(c.vraag_id) ?? null,
    }));
  return { vragen, interviews: ivFeiten, citaten };
}
