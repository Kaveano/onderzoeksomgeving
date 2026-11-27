// Regels voor het inlezen van Excel- en CSV-bestanden (zonder DOM, dus ook te testen in Node).
// Een bestand komt binnen als rijen met cellen (tekst, getal of leeg). De functies hieronder maken er
// cijfers, vragen, antwoorden of een dataset van, en melden per regel wat niet te gebruiken is.
// Er wordt nooit iets geraden: wat niet herkend wordt, blijft leeg en staat in de lijst met opmerkingen.

const leeg = (w) => w === null || w === undefined || (typeof w === 'string' && w.trim() === '');
const tekstVan = (w) => (leeg(w) ? '' : String(w).trim());
const gelijk = (a, b) => tekstVan(a).toLowerCase() === tekstVan(b).toLowerCase();

/** Vergelijkbare vorm van een tekst: kleine letters, zonder accenten, leestekens en dubbele spaties. */
export function normaal(tekst) {
  return tekstVan(tekst).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Een rij waarvan de eerste cel alleen "Totaal", "Gemiddelde" en dergelijke is, is geen waarneming.
const P_TOTAALRIJ = /^((sub|eind)?totaal( generaal)?|totalen|gemiddelde?|som|totals?|grand total|average|mean)\s*:?$/i;

/**
 * Splitst een blad in de kopregel en de rijen eronder. De kop is de eerste rij die niet leeg is.
 * Lege rijen vervallen; kolommen zonder naam heten "Kolom C"; dubbele namen krijgen (2), (3).
 * nummers: per rij het regelnummer zoals in Excel (voor meldingen).
 * totaalrijen: rijen als "Totaal" of "Gemiddelde" onderaan een lijst; die worden overgeslagen: [{ nummer, tekst }].
 */
export function kopEnRijen(ruw) {
  const gevuld = [];
  (ruw || []).forEach((r, i) => {
    if (Array.isArray(r) && r.some((c) => !leeg(c))) gevuld.push({ r, nummer: i + 1 });
  });
  if (!gevuld.length) return { kop: [], rijen: [], nummers: [], totaalrijen: [] };
  const breedte = Math.max(...gevuld.map((x) => x.r.length));
  const letter = (i) => {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const gezien = new Map();
  const kop = Array.from({ length: breedte }, (_, i) => {
    let naam = tekstVan(gevuld[0].r[i]) || `Kolom ${letter(i)}`;
    naam = naam.replace(/\s+/g, ' ').slice(0, 100);
    const sleutel = naam.toLowerCase();
    const n = (gezien.get(sleutel) || 0) + 1;
    gezien.set(sleutel, n);
    return n > 1 ? `${naam.slice(0, 94)} (${n})` : naam;
  });
  const rijen = [];
  const nummers = [];
  const totaalrijen = [];
  for (const { r, nummer } of gevuld.slice(1)) {
    // Alleen als de eerste kolom precies "Totaal", "Gemiddelde" en dergelijke bevat (zoals onder een lijst in Excel).
    const eerste = r[0];
    if (typeof eerste === 'string' && P_TOTAALRIJ.test(eerste.trim())) {
      totaalrijen.push({ nummer, tekst: eerste.trim() });
      continue;
    }
    rijen.push(Array.from({ length: breedte }, (_, i) => (leeg(r[i]) ? null : r[i])));
    nummers.push(nummer);
  }
  return { kop, rijen, nummers, totaalrijen };
}

/** Meldingen voor overgeslagen totaalrijen. */
function totaalMeldingen(totaalrijen = []) {
  return totaalrijen.map((t) => `Regel ${t.nummer} ("${t.tekst}") lijkt een totaal- of gemiddelderij en is overgeslagen.`);
}

/** Zoekt de kolom waarvan de naam bij een van de patronen past; -1 als er geen is. */
export function herkenKolom(kop, patronen, bezet = new Set()) {
  for (const p of patronen) {
    const i = kop.findIndex((naam, k) => !bezet.has(k) && p.test(normaal(naam)));
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * Welke notatie een kolom gebruikt: 'nl' (komma als decimaalteken, punt tussen duizendtallen: 1.234,5)
 * of 'en' (punt als decimaalteken: 1,234.5). Gekeken wordt naar cellen die maar op één manier te lezen zijn;
 * zonder aanwijzing geldt de Nederlandse notatie.
 */
export function getalNotatie(waarden) {
  let nl = 0;
  let en = 0;
  for (const w of waarden || []) {
    if (typeof w !== 'string') continue;
    const t = w.replace(/[€%\s ]/g, '');
    if (/\d,\d{1,2}$|\d,\d{4,}$|\.\d{3},\d/.test(t)) nl++;
    if (/\d\.\d{1,2}$|\d\.\d{4,}$|,\d{3}\.\d/.test(t)) en++;
  }
  return en > 0 && nl === 0 ? 'en' : 'nl';
}

/** Een tekst als "2.450" of "12,500": met één scheidingsteken en precies drie cijfers erachter. */
export function isDubbelzinnig(w) {
  return typeof w === 'string' && /^[+-]?\d{1,3}[.,]\d{3}$/.test(w.replace(/[€%\s ]/g, ''));
}

/**
 * Getal uit een cel: 7,4 · 7.4 · 1.234,5 · 45% · € 12,50. Geeft null als het geen getal is.
 * notatie ('nl' of 'en', zie getalNotatie) beslist alleen bij "2.450" en "12,500": in de Nederlandse notatie
 * is 2.450 tweeduizend vierhonderdvijftig en 12,500 twaalf en een half.
 */
export function alsGetal(w, notatie = 'nl') {
  if (typeof w === 'number') return Number.isFinite(w) ? w : null;
  let t = tekstVan(w).replace(/[€%\s ]/g, '');
  if (!t || !/^[+-]?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const komma = t.lastIndexOf(',');
  const punt = t.lastIndexOf('.');
  if (komma !== -1 && punt !== -1) {
    // Het laatste teken is het decimaalteken; het andere scheidt duizendtallen.
    t = komma > punt ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (komma !== -1) {
    const enkel = t.match(/,/g).length === 1;
    t = !enkel || (notatie === 'en' && /,\d{3}$/.test(t)) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (punt !== -1) {
    const enkel = t.match(/\./g).length === 1;
    if (!enkel || (notatie !== 'en' && /\.\d{3}$/.test(t))) t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Melding als een kolom getallen als "2.450" bevat: zeg hoe die gelezen zijn. */
function notatieMelding(naam, waarden, notatie) {
  const lijst = waarden || [];
  const voorbeeld = lijst.find(isDubbelzinnig);
  if (!voorbeeld) return null;
  // Gaven andere cellen al uitsluitsel over de notatie, dan is er niets te melden.
  const zeker = lijst.some((w) => typeof w === 'string' && /\d,\d{1,2}$|\d,\d{4,}$|\.\d{3},\d|\d\.\d{1,2}$|\d\.\d{4,}$|,\d{3}\.\d/.test(w.replace(/[€%\s\u00a0]/g, '')));
  if (zeker) return null;
  const gelezen = alsGetal(voorbeeld, notatie).toLocaleString('nl-NL', { useGrouping: false, maximumFractionDigits: 3 });
  return `${naam ? `Kolom "${naam}": ` : ''}getallen als "${voorbeeld.trim()}" zijn gelezen als ${gelezen} (${notatie === 'en' ? 'met de punt als decimaalteken' : 'met de punt tussen de duizendtallen'}). Klopt dat niet, pas dan het bestand aan.`;
}

const MAANDEN = { jan: 1, feb: 2, mrt: 3, maa: 3, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dec: 12 };

function geldigeDatum(j, m, d) {
  if (j < 100) j += j < 70 ? 2000 : 1900;
  if (j < 1900 || j > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(j, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${String(j).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Datum uit een cel als 'JJJJ-MM-DD': 2026-11-26 · 26-11-2026 · 26/11/26 · 26 november 2026. Anders null. */
export function alsDatum(w) {
  const t = tekstVan(w);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(t);
  if (m) return geldigeDatum(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t);
  if (m) return geldigeDatum(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\s+([a-zA-Z]{3})[a-zA-Z]*\.?\s+(\d{4})$/.exec(t);
  if (m && MAANDEN[m[2].toLowerCase()]) return geldigeDatum(Number(m[3]), MAANDEN[m[2].toLowerCase()], Number(m[1]));
  return null;
}

const JA = new Set(['ja', 'j', 'yes', 'y', 'waar', 'true', '1', 'x']);
const NEE = new Set(['nee', 'n', 'no', 'onwaar', 'false', '0']);
function alsJaNee(w) {
  const t = normaal(w);
  return JA.has(t) ? 'ja' : NEE.has(t) ? 'nee' : null;
}

function zoekOpNaam(lijst, naam) {
  const n = normaal(naam);
  return n ? lijst.find((x) => normaal(x.naam) === n) || null : null;
}

// ---------- 1. Eigen cijfers ----------

export const CIJFER_VELDEN = [
  { sleutel: 'titel', label: 'Naam van het cijfer', verplicht: true, herken: [/^(naam|titel|cijfer|kengetal|indicator|omschrijving)\b/], hulp: 'Bijvoorbeeld "Verzuimpercentage". Cijfers met dezelfde naam vormen samen één lijn op het dashboard.' },
  { sleutel: 'datum', label: 'Datum', verplicht: true, herken: [/^(datum|date|peildatum|maand|periode)\b/] },
  { sleutel: 'waarde', label: 'Waarde', verplicht: true, herken: [/^(waarde|value|getal|percentage|aantal|score|bedrag)\b/] },
  { sleutel: 'eenheid', label: 'Eenheid', herken: [/^(eenheid|unit)\b/], hulp: 'Bijvoorbeeld % of dagen. Mag leeg blijven.' },
  { sleutel: 'thema', label: 'Thema', herken: [/^thema\b/], hulp: 'Naam van een thema uit dit onderzoek. Zonder kolom, of bij een lege cel, komt het cijfer bij het thema dat je hieronder kiest.' },
  { sleutel: 'meetmoment', label: 'Meetmoment', herken: [/^(meetmoment|meting)\b/], hulp: 'Naam van een meetmoment. Mag leeg blijven.' },
  { sleutel: 'tekst', label: 'Toelichting', herken: [/^(toelichting|opmerking|notitie|bron)\b/] },
];

/**
 * koppeling: { titel: kolomindex, datum: …, waarde: … } (-1 of weggelaten = niet gekoppeld).
 * context: { themas: [{id, naam}], meetmomenten: [{id, naam}], standaardThema: id }.
 */
export function verwerkCijfers(rijen, koppeling, context) {
  const items = [];
  const problemen = [];
  const cel = (rij, sleutel) => (koppeling[sleutel] >= 0 ? rij[koppeling[sleutel]] : null);
  const notatie = getalNotatie(rijen.map((r) => cel(r, 'waarde')));
  const nm = notatieMelding('', rijen.map((r) => cel(r, 'waarde')), notatie);
  if (nm) problemen.push(nm.charAt(0).toUpperCase() + nm.slice(1));
  problemen.push(...totaalMeldingen(context.totaalrijen));
  rijen.forEach((rij, i) => {
    const regel = context.nummers ? context.nummers[i] : i + 2; // regel 1 is de kopregel
    const titel = tekstVan(cel(rij, 'titel')).slice(0, 200);
    const datum = alsDatum(cel(rij, 'datum'));
    const waarde = alsGetal(cel(rij, 'waarde'), notatie);
    const mis = [];
    if (!titel) mis.push('geen naam');
    if (!datum) mis.push(leeg(cel(rij, 'datum')) ? 'geen datum' : `datum "${tekstVan(cel(rij, 'datum'))}" niet herkend`);
    if (waarde === null) mis.push(leeg(cel(rij, 'waarde')) ? 'geen waarde' : `waarde "${tekstVan(cel(rij, 'waarde'))}" is geen getal`);
    let themaId = context.standaardThema || null;
    const themaTekst = tekstVan(cel(rij, 'thema'));
    if (themaTekst) {
      const t = zoekOpNaam(context.themas, themaTekst);
      if (t) themaId = t.id;
      else mis.push(`thema "${themaTekst}" bestaat niet in dit onderzoek`);
    }
    if (!themaId) mis.push('geen thema');
    let meetmomentId = null;
    const mmTekst = tekstVan(cel(rij, 'meetmoment'));
    if (mmTekst) {
      const m = zoekOpNaam(context.meetmomenten, mmTekst);
      if (m) meetmomentId = m.id;
      else mis.push(`meetmoment "${mmTekst}" bestaat niet in dit onderzoek`);
    }
    if (mis.length) {
      problemen.push(`Regel ${regel}: ${mis.join('; ')}. Deze regel wordt overgeslagen.`);
      return;
    }
    items.push({ titel, datum, waarde, eenheid: tekstVan(cel(rij, 'eenheid')).slice(0, 30), thema_id: themaId, meetmoment_id: meetmomentId, tekst: tekstVan(cel(rij, 'tekst')).slice(0, 2000) });
  });
  return { items, problemen };
}

// ---------- 2. Vragen voor een vragenlijst ----------

export const VRAAG_VELDEN = [
  { sleutel: 'tekst', label: 'Vraag of stelling', verplicht: true, herken: [/^(vraag|stelling|vraagtekst|tekst|item)\b/] },
  { sleutel: 'thema', label: 'Thema', herken: [/^thema\b/], hulp: 'Naam van het thema. Bestaat het thema nog niet, dan wordt het aangemaakt. Zonder kolom komt alles bij het thema dat je hieronder kiest.' },
  { sleutel: 'soort', label: 'Soort vraag', herken: [/^(soort|type|vraagtype|vraagsoort)\b/], hulp: 'schaal, ja/nee, meerkeuze of open. Leeg: meerkeuze als er antwoordmogelijkheden staan, anders schaal.' },
  { sleutel: 'opties', label: 'Antwoordmogelijkheden', herken: [/^(antwoord|optie|keuze)/], hulp: 'Alleen voor meerkeuze: de mogelijkheden in één cel, gescheiden door een puntkomma (;).' },
  { sleutel: 'verplicht', label: 'Verplicht', herken: [/^verplicht\b/], hulp: 'ja of nee. Leeg telt als nee.' },
];

const SOORT_PATRONEN = [
  ['schaal', /^(schaal|stelling|likert|score|1 5|1 tot 5|schaalvraag|schaal 1 5)/],
  ['janee', /^(ja nee|janee|ja of nee|ja nee vraag)/],
  ['meerkeuze', /^(meerkeuze|keuze|multiple choice|keuzevraag|meerdere)/],
  ['open', /^(open|tekst|vrij|open vraag|toelichting)/],
];

/** context: { themas: [{id, naam}], standaardThema: id, bestaand: aantal vragen dat er al is, max: 100 }. */
export function verwerkVragen(rijen, koppeling, context) {
  const items = [];
  const problemen = [];
  const nieuweThemas = [];
  const cel = (rij, sleutel) => (koppeling[sleutel] >= 0 ? rij[koppeling[sleutel]] : null);
  problemen.push(...totaalMeldingen(context.totaalrijen));
  rijen.forEach((rij, i) => {
    const regel = context.nummers ? context.nummers[i] : i + 2;
    const tekst = tekstVan(cel(rij, 'tekst')).replace(/\s+/g, ' ').slice(0, 1000);
    if (!tekst) {
      problemen.push(`Regel ${regel}: geen vraagtekst. Deze regel wordt overgeslagen.`);
      return;
    }
    const opties = [];
    for (const deel of tekstVan(cel(rij, 'opties')).split(/[;|\n]/)) {
      const o = deel.trim().slice(0, 200);
      if (o && !opties.some((x) => gelijk(x, o))) opties.push(o);
    }
    const soortTekst = normaal(cel(rij, 'soort'));
    let type = null;
    if (soortTekst) {
      const gevonden = SOORT_PATRONEN.find(([, p]) => p.test(soortTekst));
      if (!gevonden) {
        problemen.push(`Regel ${regel}: soort "${tekstVan(cel(rij, 'soort'))}" niet herkend (kies schaal, ja/nee, meerkeuze of open). Deze regel wordt overgeslagen.`);
        return;
      }
      type = gevonden[0];
    } else {
      type = opties.length >= 2 ? 'meerkeuze' : 'schaal';
    }
    if (type === 'meerkeuze' && opties.length < 2) {
      problemen.push(`Regel ${regel}: een meerkeuzevraag heeft minstens twee antwoordmogelijkheden nodig (gescheiden door ;). Deze regel wordt overgeslagen.`);
      return;
    }
    if (type === 'meerkeuze' && opties.length > 30) {
      problemen.push(`Regel ${regel}: meer dan 30 antwoordmogelijkheden. Deze regel wordt overgeslagen.`);
      return;
    }
    const themaTekst = tekstVan(cel(rij, 'thema')).replace(/\s+/g, ' ').slice(0, 150);
    let thema = null; // { id } of { nieuw: naam }
    if (themaTekst) {
      const t = zoekOpNaam(context.themas, themaTekst);
      if (t) thema = { id: t.id };
      else {
        if (!nieuweThemas.some((n) => normaal(n) === normaal(themaTekst))) nieuweThemas.push(themaTekst);
        thema = { nieuw: nieuweThemas.find((n) => normaal(n) === normaal(themaTekst)) };
      }
    } else if (context.standaardThema) {
      thema = { id: context.standaardThema };
    } else {
      problemen.push(`Regel ${regel}: geen thema. Deze regel wordt overgeslagen.`);
      return;
    }
    items.push({ tekst, type, opties: type === 'meerkeuze' ? opties : [], verplicht: alsJaNee(cel(rij, 'verplicht')) === 'ja', thema });
  });
  const ruimte = Math.max(0, (context.max ?? 100) - (context.bestaand || 0));
  if (items.length > ruimte) {
    problemen.unshift(`Er passen nog ${ruimte} vragen in deze vragenlijst (maximaal ${context.max ?? 100}). Alleen de eerste ${ruimte} worden ingelezen.`);
    items.length = ruimte;
  }
  const gebruikt = new Set(items.map((q) => q.thema.nieuw).filter(Boolean));
  return { items, problemen, nieuweThemas: nieuweThemas.filter((n) => gebruikt.has(n)) };
}

// ---------- 3. Antwoorden op een vragenlijst ----------

/**
 * Stelt voor welke kolom bij welke vraag hoort: eerst op het nummer uit onze eigen Excel-export
 * ("V3. Vraagtekst"), dan op gelijke tekst. Geeft { vraagId: kolomindex } en de kolom met de datum.
 */
export function koppelVragen(kop, vragen) {
  const bezet = new Set();
  const koppeling = {};
  const genormaliseerd = kop.map((k) => normaal(String(k).replace(/^V\d+\.\s*/i, '')));
  vragen.forEach((q, i) => {
    const doel = normaal(q.tekst);
    let k = kop.findIndex((naam, idx) => !bezet.has(idx) && new RegExp(`^V${i + 1}\\.\\s`, 'i').test(String(naam)) && genormaliseerd[idx] === doel);
    if (k === -1) k = genormaliseerd.findIndex((naam, idx) => !bezet.has(idx) && naam === doel);
    if (k !== -1) {
      koppeling[q.id] = k;
      bezet.add(k);
    }
  });
  const datum = herkenKolom(kop, [/^(datum|date|ingevuld op|datum van invullen)\b/], bezet);
  return { koppeling, datum };
}

function optiesVan(q) {
  if (Array.isArray(q.opties)) return q.opties;
  try {
    const o = JSON.parse(q.opties || '[]');
    return Array.isArray(o) ? o : [];
  } catch {
    return [];
  }
}

const WEET_NIET = /^(weet niet|wn|n v t|nvt|geen mening|weet niet n v t|weet ik niet|niet van toepassing)$/;

/** Zet één cel om in een antwoord. Geeft { waarde } (undefined = leeg) of { fout: uitleg }. */
export function leesAntwoord(q, cel, schalen) {
  if (leeg(cel)) return { waarde: undefined };
  const t = tekstVan(cel);
  if (q.type === 'schaal') {
    const n = alsGetal(cel);
    if (n !== null) return Number.isInteger(n) && n >= 1 && n <= 5 ? { waarde: n } : { fout: `"${t}" is geen score van 1 tot 5` };
    if (WEET_NIET.test(normaal(t))) return q.weet_niet ? { waarde: 'weet_niet' } : { waarde: undefined, opmerking: 'weet niet telt hier als leeg' };
    const labels = (schalen && (schalen[q.schaal_soort] || schalen.eens)) || [];
    const i = labels.findIndex((l) => normaal(l) === normaal(t));
    return i !== -1 ? { waarde: i + 1 } : { fout: `"${t}" is geen score van 1 tot 5` };
  }
  if (q.type === 'janee') {
    const w = alsJaNee(cel);
    return w ? { waarde: w } : { fout: `"${t}" is geen ja of nee` };
  }
  if (q.type === 'meerkeuze') {
    const opties = optiesVan(q);
    const zoek = (tekst) => opties.find((o) => normaal(o.label) === normaal(tekst));
    const heel = zoek(t);
    if (!q.meerdere_antwoorden) return heel ? { waarde: heel.id } : { fout: `"${t}" is geen antwoordmogelijkheid van deze vraag` };
    if (heel) return { waarde: [heel.id] };
    // Meerdere antwoorden in één cel: gescheiden door | (zoals in onze eigen export) of door ;.
    // Een antwoordmogelijkheid kan zelf een ; bevatten, dus eerst proberen we alleen op | te splitsen.
    let eersteFout = null;
    for (const scheiding of [/\s*\|\s*/, /\s*;\s*/, /\s*[|;]\s*/]) {
      const delen = t.split(scheiding).filter(Boolean);
      const ids = [];
      let mis = null;
      for (const d of delen) {
        const o = zoek(d);
        if (!o) {
          mis = d;
          break;
        }
        if (!ids.includes(o.id)) ids.push(o.id);
      }
      if (mis === null) return { waarde: ids.length ? ids : undefined };
      if (eersteFout === null || mis.length < eersteFout.length) eersteFout = mis;
    }
    return { fout: `"${eersteFout}" is geen antwoordmogelijkheid van deze vraag` };
  }
  return { waarde: t.slice(0, 5000) };
}

/**
 * koppeling: { vraagId: kolomindex }; datumKolom: index of -1.
 * Geeft { items: [{ datum, antwoorden }], problemen, overgeslagen }. Een cel die niet te lezen is, blijft leeg.
 */
export function verwerkAntwoorden(rijen, koppeling, datumKolom, vragen, schalen, vandaag, { nummers = null, totaalrijen = [] } = {}) {
  const items = [];
  const problemen = [...totaalMeldingen(totaalrijen)];
  let legeRijen = 0;
  const perVraag = new Map();
  rijen.forEach((rij, i) => {
    const regel = nummers ? nummers[i] : i + 2;
    const antwoorden = {};
    for (const q of vragen) {
      const k = koppeling[q.id];
      if (k === undefined || k < 0) continue;
      const r = leesAntwoord(q, rij[k], schalen);
      if (r.fout) {
        const lijst = perVraag.get(q.id) || { q, regels: [], voorbeeld: r.fout };
        lijst.regels.push(regel);
        perVraag.set(q.id, lijst);
      } else if (r.waarde !== undefined) {
        antwoorden[q.id] = r.waarde;
      }
    }
    if (!Object.keys(antwoorden).length) {
      legeRijen++;
      return;
    }
    let datum = null;
    if (datumKolom >= 0 && !leeg(rij[datumKolom])) {
      datum = alsDatum(rij[datumKolom]);
      if (!datum) problemen.push(`Regel ${regel}: datum "${tekstVan(rij[datumKolom])}" niet herkend; de datum van vandaag wordt gebruikt.`);
      else if (vandaag && datum > vandaag) {
        problemen.push(`Regel ${regel}: de datum ligt in de toekomst; de datum van vandaag wordt gebruikt.`);
        datum = null;
      }
    }
    items.push({ datum: datum || vandaag || null, antwoorden });
  });
  for (const { q, regels, voorbeeld } of perVraag.values()) {
    const waar = regels.length > 6 ? `${regels.slice(0, 6).join(', ')} en nog ${regels.length - 6}` : regels.join(', ');
    problemen.push(`"${q.tekst.slice(0, 70)}": ${regels.length === 1 ? 'één antwoord is' : `${regels.length} antwoorden zijn`} niet herkend en blijft leeg (regel ${waar}; bijvoorbeeld: ${voorbeeld}).`);
  }
  if (legeRijen) problemen.push(`${legeRijen === 1 ? 'Eén regel heeft' : `${legeRijen} regels hebben`} geen enkel bruikbaar antwoord en ${legeRijen === 1 ? 'wordt' : 'worden'} overgeslagen.`);
  return { items, problemen, overgeslagen: legeRijen };
}

// ---------- 4. Eigen dataset ----------

/**
 * Soort van een kolom op basis van de inhoud:
 * 'getal' (bijna alles is een getal), 'categorie' (weinig verschillende waarden) of 'tekst'.
 */
export function kolomSoort(waarden) {
  const gevuld = waarden.filter((w) => !leeg(w));
  if (!gevuld.length) return 'leeg';
  const notatie = getalNotatie(gevuld);
  const getallen = gevuld.filter((w) => alsGetal(w, notatie) !== null).length;
  if (getallen / gevuld.length >= 0.9) return 'getal';
  const verschillend = new Set(gevuld.map((w) => tekstVan(w).toLowerCase())).size;
  if (verschillend <= Math.max(12, Math.sqrt(gevuld.length) * 1.5) && verschillend < gevuld.length) return 'categorie';
  return 'tekst';
}

// Woorden in een kolomnaam die op persoonsgegevens wijzen (na normaal(): kleine letters, zonder leestekens).
const PERSOON_WOORDEN = new Set([
  'naam', 'namen', 'voornaam', 'voornamen', 'achternaam', 'roepnaam', 'tussenvoegsel', 'voorletters', 'initialen',
  'medewerker', 'werknemer', 'persoon', 'deelnemer', 'respondent',
  'bsn', 'burgerservicenummer', 'sofinummer', 'iban', 'rekeningnummer', 'paspoort', 'paspoortnummer',
  'email', 'mail', 'mailadres', 'emailadres', 'telefoon', 'tel', 'telnr', 'mobiel', 'gsm', 'mobile', 'phone',
  'adres', 'straat', 'huisnummer', 'postcode', 'woonplaats',
  'geboortedatum', 'geb', 'gebdatum', 'geboortejaar', 'geboorteplaats',
  'personeelsnummer', 'personeelsnr', 'persnr', 'medewerkersnummer', 'medewerkernummer', 'werknemersnummer', 'werknemernummer', 'employee',
]);
// Samenstellingen: "E-mailadres", "Telefoonnummer", "Volledige naam", "Personeelsnr." en dergelijke.
const P_PERSOON_DEEL = /^(e?mail|telefoon|tel|mobiel|personeel|pers|medewerker|werknemer|voor|achter|roep|huis|rekening|burger|paspoort|geboorte)/;
const P_PERSOON_EIND = /(adres|nummer|nr|naam|datum)$/;
const P_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const P_TELEFOON = /^(\+|00|0)[\d\s().-]{8,}$/;

// Woorden die op gegevens over gezondheid wijzen (K M3): verzuim, ziekte, diagnose, arbo en dergelijke. Ook als deel
// van een woord: "Ziekteverzuim", "Verzuimdagen", "Ziekmeldingen", "Arbodienst".
const P_GEZONDHEID = /(verzuim|ziek|diagnose|medisch|gezondheid|arbeidsongeschikt|reintegratie|burnout|^arbo|bedrijfsarts)/;

/**
 * Kolommen die op persoonsgegevens lijken (om voor te waarschuwen en standaard uit te zetten):
 * op de naam van de kolom, ook samenstellingen als "E-mailadres" of "Telefoonnummer", en op de inhoud
 * (e-mailadressen of telefoonnummers). Liever een kolom te veel uitzetten dan een te weinig.
 * Zonder opties: de namen van die kolommen (zoals altijd).
 * Met { metReden: true }: [{ kolom, reden }] met reden 'persoon', en ook de kolommen die over gezondheid lijken te
 * gaan (verzuim, ziekmelding, diagnose …) met reden 'gezondheid'. Die horen niet in een vrije dataset, maar in het
 * personeelsbestand voor HR-analytics, waarvan alleen groepscijfers worden bewaard (BOUWPLAN B4/B5).
 */
export function verdachteKolommen(kop, rijen = [], { metReden = false } = {}) {
  const uit = [];
  kop.forEach((k, i) => {
    const woorden = normaal(k).split(' ').filter(Boolean);
    const opNaam = woorden.some((w) => PERSOON_WOORDEN.has(w) || (P_PERSOON_DEEL.test(w) && P_PERSOON_EIND.test(w)));
    let opInhoud = false;
    if (!opNaam && rijen.length) {
      const teksten = rijen.map((r) => r[i]).filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim());
      if (teksten.length) {
        const treffers = teksten.filter((w) => P_EMAIL.test(w) || (P_TELEFOON.test(w) && w.replace(/\D/g, '').length >= 9)).length;
        opInhoud = treffers / teksten.length >= 0.3;
      }
    }
    if (opNaam || opInhoud) uit.push(metReden ? { kolom: k, reden: 'persoon' } : k);
    else if (metReden && woorden.some((w) => P_GEZONDHEID.test(w))) uit.push({ kolom: k, reden: 'gezondheid' });
  });
  return uit;
}

/**
 * Maakt een dataset van de gekozen kolommen. Getalkolommen worden echte getallen (7,4 wordt 7.4);
 * een cel in een getalkolom die geen getal is, blijft leeg. Geeft { kolommen, rijen, soorten, problemen }.
 */
/**
 * Een kolom met getallen die eigenlijk codes zijn (jaar, teamnummer, 1 = man / 2 = vrouw): alleen hele
 * getallen en hooguit 12 verschillende waarden. Zo'n kolom kan ook als indeling in groepen dienen.
 */
export function isCodekolom(waarden) {
  const gevuld = waarden.filter((w) => !leeg(w));
  if (gevuld.length < 2) return false;
  const notatie = getalNotatie(gevuld);
  const getallen = gevuld.map((w) => alsGetal(w, notatie));
  if (getallen.some((x) => x === null || !Number.isInteger(x))) return false;
  const verschillend = new Set(getallen).size;
  return verschillend <= 12 && verschillend < gevuld.length;
}

export function verwerkDataset(kop, rijen, gekozen, { maxRijen = 2000, maxCel = 300, totaalrijen = [] } = {}) {
  const problemen = [...totaalMeldingen(totaalrijen)];
  const indexen = gekozen.filter((i) => i >= 0 && i < kop.length);
  const soorten = indexen.map((i) => kolomSoort(rijen.map((r) => r[i])));
  const notaties = indexen.map((i) => getalNotatie(rijen.map((r) => r[i])));
  let uit = rijen.map((r) => indexen.map((i, k) => {
    const w = r[i];
    if (leeg(w)) return null;
    if (soorten[k] === 'getal') return alsGetal(w, notaties[k]);
    return typeof w === 'number' ? w : tekstVan(w).slice(0, maxCel);
  })).filter((r) => r.some((c) => c !== null));
  indexen.forEach((i, k) => {
    if (soorten[k] !== 'getal') return;
    const nm = notatieMelding(kop[i], rijen.map((r) => r[i]), notaties[k]);
    if (nm) problemen.push(nm);
    const mis = rijen.filter((r) => !leeg(r[i]) && alsGetal(r[i], notaties[k]) === null).length;
    if (mis) problemen.push(`Kolom "${kop[i]}": ${mis === 1 ? 'één cel is' : `${mis} cellen zijn`} geen getal en ${mis === 1 ? 'blijft' : 'blijven'} leeg.`);
  });
  if (uit.length > maxRijen) {
    problemen.push(`Het bestand heeft ${uit.length.toLocaleString('nl-NL')} rijen; alleen de eerste ${maxRijen.toLocaleString('nl-NL')} worden bewaard.`);
    uit = uit.slice(0, maxRijen);
  }
  return { kolommen: indexen.map((i) => kop[i]), rijen: uit, soorten, problemen };
}
