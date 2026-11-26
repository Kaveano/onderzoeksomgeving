// Bestanden uitwisselen met andere programma's, zonder bibliotheken:
//   Excel    maakXlsx, leesXlsx en leesCsv
//   Word     maakDocx (van de eenvoudige Markdown-opmaak uit de schrijfomgeving)
//   Outlook  maakIcs (agenda-afspraken voor de hele dag)
//   SPSS     spssNaam en maakSpssSyntax (een syntaxbestand dat een CSV-bestand inleest)
// Een .xlsx en een .docx zijn zip-bestanden met XML erin; daarom staan hier ook maakZip en leesZip.
// Alles werkt in moderne browsers en in Node 22 (voor de tests). Alleen bewaarBestand gebruikt de pagina.

// ---------- Algemene hulpfuncties ----------

const codeerder = new TextEncoder();
const utf8 = (tekst) => codeerder.encode(tekst);
const decodeer = (bytes) => new TextDecoder().decode(bytes);

/** Aantal bytes van een tekst in UTF-8. */
function utf8Lengte(tekst) {
  let n = 0;
  for (const teken of tekst) {
    const c = teken.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Kort een tekst in tot een aantal UTF-8-bytes, zonder een teken door te knippen. */
function knipBytes(tekst, max) {
  let uit = '';
  let n = 0;
  for (const teken of tekst) {
    n += utf8Lengte(teken);
    if (n > max) break;
    uit += teken;
  }
  return uit;
}

/** Kort een tekst in tot een aantal tekens (UTF-16), zonder een emoji door te knippen. */
function knip(tekst, max) {
  if (tekst.length <= max) return tekst;
  const c = tekst.charCodeAt(max - 1);
  return tekst.slice(0, c >= 0xd800 && c <= 0xdbff ? max - 1 : max);
}

/** Maakt van de invoer een Uint8Array. */
function alsBytes(invoer) {
  if (invoer instanceof Uint8Array) return invoer;
  if (ArrayBuffer.isView(invoer)) return new Uint8Array(invoer.buffer, invoer.byteOffset, invoer.byteLength);
  if (invoer instanceof ArrayBuffer) return new Uint8Array(invoer);
  throw new TypeError('Verwacht de inhoud van een bestand (Uint8Array of ArrayBuffer).');
}

// Tekens die in XML 1.0 niet mogen voorkomen (stuurtekens, losse helften van een emoji).
const P_XML_ONGELDIG = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;
const XML_TEKENS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const XML_NAMEN = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const XML_KOP = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Veilige tekst voor in XML (ook binnen een attribuut). */
function xmlTekst(waarde) {
  return String(waarde).replace(P_XML_ONGELDIG, '').replace(/[&<>"]/g, (c) => XML_TEKENS[c]);
}

/** Zet &amp; en &#233; terug naar gewone tekens. */
function xmlTerug(tekst) {
  if (!tekst.includes('&')) return tekst;
  return tekst.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (alles, e) => {
    if (e[0] !== '#') return XML_NAMEN[e];
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

const P_XML_DEEL =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\/([^\s>]+)\s*>|<([^\s>\/]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
const P_ATTRIBUUT = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const zonderVoorvoegsel = (naam) => naam.slice(naam.indexOf(':') + 1);

/**
 * Loopt door een XML-tekst en meldt elk onderdeel: open(naam, attributen, zelfsluitend), tekst(t) en sluit(naam).
 * Voorvoegsels (x:row, r:id) worden weggelaten; attributen komen als ruwe tekst (zie attributen()).
 */
function leesXml(xml, { open, tekst, sluit }) {
  P_XML_DEEL.lastIndex = 0;
  let m;
  while ((m = P_XML_DEEL.exec(xml))) {
    if (m[3] !== undefined) {
      const naam = zonderVoorvoegsel(m[3]);
      open?.(naam, m[4], m[5] === '/');
      if (m[5] === '/') sluit?.(naam);
    } else if (m[2] !== undefined) sluit?.(zonderVoorvoegsel(m[2]));
    else if (m[6] !== undefined) tekst?.(xmlTerug(m[6]));
    else if (m[1] !== undefined) tekst?.(m[1]);
  }
}

/** Attributen van één XML-element als object. */
function attributen(ruw) {
  const uit = {};
  P_ATTRIBUUT.lastIndex = 0;
  let m;
  while ((m = P_ATTRIBUUT.exec(ruw))) {
    if (!m[1].startsWith('xmlns')) uit[zonderVoorvoegsel(m[1])] = xmlTerug(m[2] ?? m[3]);
  }
  return uit;
}

// ---------- Zip ----------

const MAX_ZIP_BESTANDEN = 2000;
const MAX_ZIP_BYTES = 60 * 1024 * 1024;
const DOS_DATUM = ((2026 - 1980) << 9) | (1 << 5) | 1; // vaste datum (1 januari 2026): dezelfde invoer geeft hetzelfde bestand
const ZIP_BESCHADIGD = 'Dit zip-bestand is beschadigd en kan niet worden gelezen.';

const CRC_TABEL = (() => {
  const tabel = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabel[n] = c >>> 0;
  }
  return tabel;
})();

/** Controlegetal (CRC-32) zoals zip-bestanden dat gebruiken. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABEL[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Maakt een zip-bestand (zonder compressie). Bestandsnamen staan er in UTF-8 in. */
export function maakZip(bestanden) {
  const delen = [];
  const map = [];
  const namen = new Set();
  let positie = 0;
  for (const { naam, inhoud } of bestanden) {
    const naamBytes = utf8(String(naam));
    const data = typeof inhoud === 'string' ? utf8(inhoud) : alsBytes(inhoud);
    if (!naamBytes.length || naamBytes.length > 0xffff || namen.has(naam)) {
      throw new Error(`Ongeldige of dubbele bestandsnaam in het zip-bestand: "${naam}".`);
    }
    namen.add(naam);
    // Het deel dat in de lokale kop en in de centrale map hetzelfde is (26 bytes).
    const vast = new DataView(new ArrayBuffer(26));
    vast.setUint16(0, 20, true); // benodigde versie: 2.0
    vast.setUint16(2, 0x0800, true); // vlag: bestandsnaam in UTF-8
    vast.setUint16(4, 0, true); // methode 0: opslaan zonder compressie
    vast.setUint16(8, DOS_DATUM, true);
    vast.setUint32(10, crc32(data), true);
    vast.setUint32(14, data.length, true);
    vast.setUint32(18, data.length, true);
    vast.setUint16(22, naamBytes.length, true);
    const vastBytes = new Uint8Array(vast.buffer);
    const lokaal = new Uint8Array(30 + naamBytes.length);
    lokaal.set([0x50, 0x4b, 0x03, 0x04]);
    lokaal.set(vastBytes, 4);
    lokaal.set(naamBytes, 30);
    const regel = new Uint8Array(46 + naamBytes.length);
    regel.set([0x50, 0x4b, 0x01, 0x02, 20, 0]);
    regel.set(vastBytes, 6);
    new DataView(regel.buffer).setUint32(42, positie, true);
    regel.set(naamBytes, 46);
    delen.push(lokaal, data);
    map.push(regel);
    positie += lokaal.length + data.length;
  }
  const mapLengte = map.reduce((som, r) => som + r.length, 0);
  if (map.length > 0xfffe || positie + mapLengte > 0xfffffffe) throw new Error('Het zip-bestand wordt te groot.');
  const slot = new DataView(new ArrayBuffer(22));
  slot.setUint32(0, 0x06054b50, true);
  slot.setUint16(8, map.length, true);
  slot.setUint16(10, map.length, true);
  slot.setUint32(12, mapLengte, true);
  slot.setUint32(16, positie, true);
  const uit = new Uint8Array(positie + mapLengte + 22);
  let p = 0;
  for (const deel of [...delen, ...map, new Uint8Array(slot.buffer)]) {
    uit.set(deel, p);
    p += deel.length;
  }
  return uit;
}

/** Pakt gecomprimeerde gegevens uit; stopt zodra er meer uitkomt dan het zip-bestand opgeeft (zipbom). */
async function pakUit(gegevens, verwacht) {
  const uit = new Uint8Array(verwacht);
  let n = 0;
  try {
    const lezer = new Blob([gegevens]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    for (;;) {
      const { done, value } = await lezer.read();
      if (done) break;
      if (n + value.length > verwacht) {
        await lezer.cancel().catch(() => {});
        throw new Error('te groot');
      }
      uit.set(value, n);
      n += value.length;
    }
  } catch {
    throw new Error(ZIP_BESCHADIGD);
  }
  if (n !== verwacht) throw new Error(ZIP_BESCHADIGD);
  return uit;
}

/**
 * Leest een zip-bestand: geeft een Map van bestandsnaam naar inhoud.
 * Weigert bestanden met een wachtwoord, zip64 en onbekende compressie, en bestanden die uitgepakt te groot zijn.
 */
export async function leesZip(invoer) {
  const b = alsBytes(invoer);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // Het slot van het bestand zoeken (achteraan, eventueel gevolgd door commentaar).
  let slot = -1;
  for (let i = b.length - 22; i >= 0 && i >= b.length - 22 - 0xffff; i--) {
    if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) <= b.length) {
      slot = i;
      break;
    }
  }
  if (slot < 0) throw new Error('Dit is geen geldig zip-bestand.');
  const aantal = v.getUint16(slot + 10, true);
  const mapLengte = v.getUint32(slot + 12, true);
  let p = v.getUint32(slot + 16, true);
  const zip64 = slot >= 20 && v.getUint32(slot - 20, true) === 0x07064b50;
  if (zip64 || aantal === 0xffff || mapLengte === 0xffffffff || p === 0xffffffff) {
    throw new Error('Dit zip-bestand heeft een indeling voor zeer grote bestanden (zip64); die wordt niet ondersteund.');
  }
  if (v.getUint16(slot + 4, true) !== 0 || v.getUint16(slot + 8, true) !== aantal) {
    throw new Error('Dit zip-bestand is in delen gesplitst; dat wordt niet ondersteund.');
  }
  if (aantal > MAX_ZIP_BESTANDEN) {
    throw new Error(`Dit zip-bestand bevat te veel bestanden (meer dan ${MAX_ZIP_BESTANDEN}).`);
  }
  const lijst = [];
  let totaal = 0;
  for (let i = 0; i < aantal; i++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) throw new Error(ZIP_BESCHADIGD);
    const vlaggen = v.getUint16(p + 8, true);
    const methode = v.getUint16(p + 10, true);
    const item = {
      methode,
      crc: v.getUint32(p + 16, true),
      ingepakt: v.getUint32(p + 20, true),
      grootte: v.getUint32(p + 24, true),
      begin: v.getUint32(p + 42, true),
    };
    const naamLengte = v.getUint16(p + 28, true);
    const naamBytes = b.subarray(p + 46, p + 46 + naamLengte);
    try {
      item.naam = new TextDecoder('utf-8', { fatal: true }).decode(naamBytes);
    } catch {
      item.naam = new TextDecoder('windows-1252').decode(naamBytes);
    }
    p += 46 + naamLengte + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    if (vlaggen & 0x41) throw new Error('Dit zip-bestand is beveiligd met een wachtwoord en kan niet worden gelezen.');
    if (item.ingepakt === 0xffffffff || item.grootte === 0xffffffff || item.begin === 0xffffffff) {
      throw new Error('Dit zip-bestand heeft een indeling voor zeer grote bestanden (zip64); die wordt niet ondersteund.');
    }
    if (methode !== 0 && methode !== 8) {
      throw new Error(`Het bestand "${item.naam}" in dit zip-bestand gebruikt een compressie die niet wordt ondersteund.`);
    }
    totaal += item.grootte;
    if (totaal > MAX_ZIP_BYTES) {
      throw new Error(`Dit bestand is uitgepakt te groot (meer dan ${MAX_ZIP_BYTES / 1024 / 1024} MB).`);
    }
    if (!item.naam.endsWith('/')) lijst.push(item); // mappen overslaan
  }
  const uit = new Map();
  for (const item of lijst) {
    const k = item.begin;
    if (k + 30 > b.length || v.getUint32(k, true) !== 0x04034b50) throw new Error(ZIP_BESCHADIGD);
    const start = k + 30 + v.getUint16(k + 26, true) + v.getUint16(k + 28, true);
    if (start + item.ingepakt > b.length) throw new Error(ZIP_BESCHADIGD);
    const ruw = b.subarray(start, start + item.ingepakt);
    if (item.methode === 0 && item.ingepakt !== item.grootte) throw new Error(ZIP_BESCHADIGD);
    const inhoud = item.methode === 0 ? ruw.slice() : await pakUit(ruw, item.grootte);
    if (crc32(inhoud) !== item.crc) throw new Error(ZIP_BESCHADIGD);
    uit.set(item.naam, inhoud);
  }
  return uit;
}

// ---------- Excel schrijven (.xlsx) ----------

const NS_BLAD = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_TYPEN = 'http://schemas.openxmlformats.org/package/2006/content-types';
const TYPE_BLAD = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
const MAX_CELTEKST = 32767; // meer tekens past niet in één Excel-cel
const KOLOMLETTERS = [];

/** Kolomnummer (vanaf 1) naar letters: 1 → A, 27 → AA. */
function kolomLetters(nr) {
  let uit = '';
  for (let n = nr; n > 0; n = Math.floor((n - 1) / 26)) uit = String.fromCharCode(65 + ((n - 1) % 26)) + uit;
  return uit;
}

/** Geldige, unieke naam voor een tabblad: maximaal 31 tekens en zonder [ ] : * ? / \. */
function bladNaam(naam, gebruikt, nr) {
  const schoon = String(naam ?? '').replace(P_XML_ONGELDIG, '').replace(/[/\\]/g, '-').replace(/[[\]:*?]/g, ' ');
  let basis = knip(schoon.replace(/\s+/g, ' ').trim(), 31).replace(/^'+|'+$/g, '').trim();
  if (!basis || basis.toLowerCase() === 'history') basis = `Blad${nr}`;
  let uit = basis;
  for (let n = 2; gebruikt.has(uit.toLowerCase()); n++) {
    const staart = ` (${n})`;
    uit = knip(basis, 31 - staart.length).trimEnd() + staart;
  }
  gebruikt.add(uit.toLowerCase());
  return uit;
}

/** Tekst voor in een cel. Excel leest _x0041_ als een teken; de eerste _ wordt daarom apart gecodeerd. */
function celTekst(waarde) {
  const t = knip(String(waarde).replace(/\r\n?/g, '\n'), MAX_CELTEKST);
  return xmlTekst(t.replace(/_(?=x[0-9A-Fa-f]{4}_)/g, '_x005F_'));
}

/** Eén waarde als tekst, getal of waar/onwaar; al het andere wordt tekst. */
function celWaarde(w) {
  if (typeof w === 'bigint') return Number.isSafeInteger(Number(w)) ? Number(w) : String(w);
  if (w instanceof Date) {
    if (Number.isNaN(w.getTime())) return null;
    const iso = w.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  }
  if (typeof w === 'number') return Number.isFinite(w) ? w : null;
  if (w === null || w === undefined || typeof w === 'boolean' || typeof w === 'string') return w;
  return String(w);
}

/** XML van één werkblad. De eerste rij is de kop: vet en vastgezet. */
function bladXml(blad, tekstNr, eerste) {
  const rijen = Array.isArray(blad.rijen) ? blad.rijen : [];
  if (rijen.length > 1048576) throw new Error('Te veel rijen voor één Excel-blad (maximaal 1.048.576).');
  const langste = []; // langste inhoud per kolom, voor de kolombreedte
  const uit = [];
  let laatsteRij = 1;
  for (let r = 0; r < rijen.length; r++) {
    const rij = Array.isArray(rijen[r]) ? rijen[r] : [];
    if (rij.length > 16384) throw new Error('Te veel kolommen voor één Excel-blad (maximaal 16.384).');
    const stijl = r === 0 ? ' s="1"' : '';
    let cellen = '';
    for (let k = 0; k < rij.length; k++) {
      const w = celWaarde(rij[k]);
      if (w === null || w === undefined || w === '') continue;
      const ref = (KOLOMLETTERS[k] ||= kolomLetters(k + 1)) + (r + 1);
      let lengte;
      if (typeof w === 'number') {
        const getal = String(w === 0 ? 0 : w);
        lengte = getal.length;
        cellen += `<c r="${ref}"${stijl}><v>${getal}</v></c>`;
      } else if (typeof w === 'boolean') {
        lengte = 7;
        cellen += `<c r="${ref}"${stijl} t="b"><v>${w ? 1 : 0}</v></c>`;
      } else {
        // Tekst gaat altijd als tekst het bestand in (nooit als formule), via de lijst met gedeelde teksten.
        lengte = w.includes('\n') ? Math.max(...w.split('\n', 50).map((regel) => regel.length)) : w.length;
        cellen += `<c r="${ref}"${stijl} t="s"><v>${tekstNr(w)}</v></c>`;
      }
      langste[k] = Math.max(langste[k] || 0, r === 0 ? lengte * 1.15 : lengte);
    }
    if (cellen) {
      uit.push(`<row r="${r + 1}">${cellen}</row>`);
      laatsteRij = r + 1;
    }
  }
  const opgegeven = Array.isArray(blad.kolombreedtes) ? blad.kolombreedtes : [];
  let kolommen = '';
  for (let k = 0; k < Math.max(langste.length, opgegeven.length); k++) {
    const eigen = Number(opgegeven[k]);
    const breedte = eigen > 0 ? Math.min(eigen, 255) : Math.min(Math.max((langste[k] || 0) + 2, 8), 60);
    kolommen += `<col min="${k + 1}" max="${k + 1}" width="${Math.round(breedte * 100) / 100}" customWidth="1"/>`;
  }
  const bereik = `A1:${kolomLetters(Math.max(langste.length, 1))}${laatsteRij}`;
  const vast = rijen.length
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
    : '';
  return (
    `${XML_KOP}<worksheet xmlns="${NS_BLAD}"><dimension ref="${bereik}"/>` +
    `<sheetViews><sheetView${eerste ? ' tabSelected="1"' : ''} workbookViewId="0">${vast}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>${kolommen ? `<cols>${kolommen}</cols>` : ''}` +
    `<sheetData>${uit.join('')}</sheetData></worksheet>`
  );
}

const XLSX_STIJLEN =
  `${XML_KOP}<styleSheet xmlns="${NS_BLAD}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

/**
 * Maakt een Excel-bestand (.xlsx) met één tabblad per blad: { naam, rijen, kolombreedtes? }.
 * De eerste rij is de kop (vet, blijft staan bij scrollen). Tekst blijft tekst, ook als die met = begint.
 */
export function maakXlsx(bladen) {
  const lijst = Array.isArray(bladen) && bladen.length ? bladen : [{ naam: 'Blad1', rijen: [] }];
  const teksten = new Map(); // gedeelde teksten: tekst → volgnummer
  let verwijzingen = 0;
  const tekstNr = (tekst) => {
    verwijzingen++;
    let nr = teksten.get(tekst);
    if (nr === undefined) teksten.set(tekst, (nr = teksten.size));
    return nr;
  };
  const namen = new Set();
  let typen = '';
  let bladRegels = '';
  let relaties = '';
  const bestanden = [];
  lijst.forEach((blad, i) => {
    const nr = i + 1;
    bestanden.push({ naam: `xl/worksheets/sheet${nr}.xml`, inhoud: bladXml(blad || {}, tekstNr, i === 0) });
    typen += `<Override PartName="/xl/worksheets/sheet${nr}.xml" ContentType="${TYPE_BLAD}.worksheet+xml"/>`;
    bladRegels += `<sheet name="${xmlTekst(bladNaam(blad?.naam, namen, nr))}" sheetId="${nr}" r:id="rId${nr}"/>`;
    relaties += `<Relationship Id="rId${nr}" Type="${NS_REL_DOC}/worksheet" Target="worksheets/sheet${nr}.xml"/>`;
  });
  const n = lijst.length;
  let gedeeld = `${XML_KOP}<sst xmlns="${NS_BLAD}" count="${verwijzingen}" uniqueCount="${teksten.size}">`;
  for (const tekst of teksten.keys()) {
    const ruimte = /^\s|\s$|\s\s|\n/.test(tekst) ? ' xml:space="preserve"' : '';
    gedeeld += `<si><t${ruimte}>${celTekst(tekst)}</t></si>`;
  }
  return maakZip([
    {
      naam: '[Content_Types].xml',
      inhoud:
        `${XML_KOP}<Types xmlns="${NS_TYPEN}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${TYPE_BLAD}.sheet.main+xml"/>` +
        `${typen}<Override PartName="/xl/styles.xml" ContentType="${TYPE_BLAD}.styles+xml"/>` +
        `<Override PartName="/xl/sharedStrings.xml" ContentType="${TYPE_BLAD}.sharedStrings+xml"/></Types>`,
    },
    {
      naam: '_rels/.rels',
      inhoud: `${XML_KOP}<Relationships xmlns="${NS_REL}"><Relationship Id="rId1" Type="${NS_REL_DOC}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      naam: 'xl/workbook.xml',
      inhoud: `${XML_KOP}<workbook xmlns="${NS_BLAD}" xmlns:r="${NS_REL_DOC}"><bookViews><workbookView/></bookViews><sheets>${bladRegels}</sheets></workbook>`,
    },
    {
      naam: 'xl/_rels/workbook.xml.rels',
      inhoud:
        `${XML_KOP}<Relationships xmlns="${NS_REL}">${relaties}<Relationship Id="rId${n + 1}" Type="${NS_REL_DOC}/styles" Target="styles.xml"/>` +
        `<Relationship Id="rId${n + 2}" Type="${NS_REL_DOC}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    },
    { naam: 'xl/styles.xml', inhoud: XLSX_STIJLEN },
    { naam: 'xl/sharedStrings.xml', inhoud: `${gedeeld}</sst>` },
    ...bestanden,
  ]);
}

// ---------- Excel lezen (.xlsx) ----------

const MAX_RIJEN = 20000;
const MAX_KOLOMMEN = 300;
const GEEN_XLSX = 'Dit is geen geldig Excel-bestand (.xlsx). Sla het in Excel op als "Excel-werkmap (.xlsx)" en probeer het opnieuw.';
const OUDE_XLS =
  'Dit is een oud Excel-bestand (.xls) of een bestand met een wachtwoord. ' +
  'Open het in Excel, sla het op als "Excel-werkmap (.xlsx)" zonder wachtwoord en probeer het opnieuw.';

/** Pad van een verwijzing binnen het zip-bestand, gerekend vanaf het bestand waarin de verwijzing staat. */
function zipPad(vanaf, doel) {
  if (doel.startsWith('/')) return doel.slice(1);
  const delen = vanaf.split('/').slice(0, -1);
  for (const deel of doel.split('/')) {
    if (deel === '..') delen.pop();
    else if (deel !== '.') delen.push(deel);
  }
  return delen.join('/');
}

/** Verwijzingen (relaties) die bij een onderdeel horen: Map van id naar { soort, pad }. */
function leesRelaties(zip, pad) {
  const uit = new Map();
  const i = pad.lastIndexOf('/') + 1;
  const bron = zip.get(`${pad.slice(0, i)}_rels/${pad.slice(i)}.rels`);
  if (!bron) return uit;
  leesXml(decodeer(bron), {
    open(naam, ruw) {
      if (naam !== 'Relationship') return;
      const a = attributen(ruw);
      if (a.Id && a.Target && a.TargetMode !== 'External') {
        uit.set(a.Id, { soort: (a.Type || '').split('/').pop(), pad: zipPad(pad, a.Target) });
      }
    },
  });
  return uit;
}

/** Excel schrijft sommige tekens als _x000D_; zet die terug. Lege tekst telt als lege cel. */
function excelTekst(tekst) {
  if (!tekst) return null;
  const t = tekst.includes('_x') ? tekst.replace(/_x([0-9A-Fa-f]{4})_/g, (alles, h) => String.fromCharCode(parseInt(h, 16))) : tekst;
  return t.includes('\r') ? t.replace(/\r\n?/g, '\n') : t;
}

/** De lijst met gedeelde teksten (ook tekst met opmaak in stukjes; uitspraakhulp wordt overgeslagen). */
function leesGedeeldeTeksten(xml) {
  const uit = [];
  let huidig = '';
  let inTekst = false;
  let uitspraak = 0;
  leesXml(xml, {
    open(naam, ruw, zelf) {
      if (naam === 'si') huidig = '';
      else if (naam === 'rPh') uitspraak++;
      else if (naam === 't' && !zelf) inTekst = true;
    },
    tekst(t) {
      if (inTekst && !uitspraak) huidig += t;
    },
    sluit(naam) {
      if (naam === 't') inTekst = false;
      else if (naam === 'rPh') uitspraak--;
      else if (naam === 'si') uit.push(excelTekst(huidig));
    },
  });
  return uit;
}

/** Bepaalt of een getalnotatie een datum en/of een tijd toont; null als het een gewoon getal is. */
function notatieSoort(id, code) {
  if (code === undefined) {
    // Ingebouwde notaties van Excel.
    if ((id >= 14 && id <= 17) || (id >= 27 && id <= 31) || id === 36 || (id >= 50 && id <= 58)) return { datum: true };
    if (id === 22) return { datum: true, tijd: true };
    if ((id >= 18 && id <= 21) || (id >= 32 && id <= 35) || (id >= 45 && id <= 47)) return { tijd: true, duur: id === 46 };
    return null;
  }
  // Eigen notatie: letters d, m, j/y, u/h en s buiten aanhalingstekens en blokhaken betekenen een datum of tijd.
  const duur = /\[h+\]/i.test(code);
  const kaal = code.replace(/"[^"]*"|\\.|_.|\*./g, '').replace(/\[[^\]]*\]/g, '');
  if (!duur && !/[dmyhs]/i.test(kaal)) return null;
  const tijd = duur || /[hs]/i.test(kaal);
  return { datum: /[dy]/i.test(kaal) || (/m/i.test(kaal) && !tijd), tijd, duur };
}

/** Per celstijl (volgnummer in cellXfs) of het een datum/tijd is. */
function leesStijlen(xml) {
  const eigen = new Map();
  const uit = [];
  let inCellen = false;
  leesXml(xml, {
    open(naam, ruw) {
      if (naam === 'numFmt') {
        const a = attributen(ruw);
        eigen.set(Number(a.numFmtId), a.formatCode || '');
      } else if (naam === 'cellXfs') inCellen = true;
      else if (naam === 'xf' && inCellen) uit.push(Number(attributen(ruw).numFmtId) || 0);
    },
    sluit(naam) {
      if (naam === 'cellXfs') inCellen = false;
    },
  });
  return uit.map((id) => notatieSoort(id, eigen.get(id)));
}

/** Volgnummer van Excel naar 'JJJJ-MM-DD', 'JJJJ-MM-DD uu:mm' of 'uu:mm'. */
function datumTekst(getal, soort, vanaf1904) {
  const tweeCijfers = (x) => String(x).padStart(2, '0');
  if (soort.duur && !soort.datum) {
    const minuten = Math.floor(Math.round(getal * 86400) / 60);
    return minuten < 0 ? getal : `${tweeCijfers(Math.floor(minuten / 60))}:${tweeCijfers(minuten % 60)}`;
  }
  // Dagen sinds 30-12-1899. Excel doet alsof 29 februari 1900 heeft bestaan; vóór die dag is het er één meer.
  const dagen = vanaf1904 ? getal + 1462 : getal < 60 ? getal + 1 : getal;
  const moment = new Date(Date.UTC(1899, 11, 30) + Math.round(dagen * 86400) * 1000);
  if (getal < 0 || Number.isNaN(moment.getTime()) || moment.getUTCFullYear() > 9999) return getal;
  const iso = moment.toISOString();
  if (!soort.datum) return getal < 1 ? iso.slice(11, 16) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  return soort.tijd ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10);
}

/** Leest één werkblad naar rijen. Lege plekken worden null; lege rijen en kolommen achteraan vervallen. */
function leesBlad(xml, naam, teksten, stijlen, vanaf1904) {
  const rijen = [];
  let breedte = 0;
  let rij = 0;
  let kolom = 0;
  let cel = null; // de cel die nu wordt gelezen: { soort, stijl, v, tekst }
  let lees = ''; // 'v' (waarde) of 't' (tekst in de cel zelf)
  let uitspraak = 0;

  const waarde = () => {
    const v = cel.v;
    if (cel.soort === 's') return teksten[parseInt(v, 10)] ?? null;
    if (cel.soort === 'inlineStr') return excelTekst(cel.tekst);
    if (cel.soort === 'str') return excelTekst(v);
    if (cel.soort === 'e' || v === null || v.trim() === '') return null; // foutcel (#N/B) of leeg
    if (cel.soort === 'b') return v.trim() === '1' || v.trim().toLowerCase() === 'true';
    if (cel.soort === 'd') {
      const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(v.trim());
      return m ? (m[2] && m[2] !== '00:00' ? `${m[1]} ${m[2]}` : m[1]) : v;
    }
    const getal = Number(v);
    if (!Number.isFinite(getal)) return null;
    const soort = stijlen[cel.stijl];
    return soort ? datumTekst(getal, soort, vanaf1904) : getal;
  };

  leesXml(xml, {
    open(el, ruw, zelf) {
      if (el === 'row') {
        const r = parseInt(attributen(ruw).r, 10);
        rij = r > 0 ? r : rij + 1;
        kolom = 0;
      } else if (el === 'c') {
        const a = attributen(ruw);
        const m = /^([A-Za-z]+)(\d+)$/.exec(a.r || '');
        if (m) {
          kolom = 0;
          for (const letter of m[1].toUpperCase()) kolom = kolom * 26 + letter.charCodeAt(0) - 64;
          rij = parseInt(m[2], 10);
        } else kolom++;
        cel = zelf ? null : { soort: a.t || 'n', stijl: Number(a.s) || 0, v: null, tekst: '' };
      } else if (cel && !zelf) {
        if (el === 'v') lees = 'v';
        else if (el === 'rPh') uitspraak++;
        else if (el === 't' && !uitspraak) lees = 't';
      }
    },
    tekst(t) {
      if (lees === 'v') cel.v = (cel.v ?? '') + t;
      else if (lees === 't') cel.tekst += t;
    },
    sluit(el) {
      if (el === 'v' || el === 't') lees = '';
      else if (el === 'rPh' && uitspraak) uitspraak--;
      else if (el === 'c' && cel) {
        const w = waarde();
        cel = null;
        if (w === null) return;
        // Alleen cellen met inhoud tellen; opmaak in lege cellen ver weg geeft dus geen foutmelding.
        if (rij > MAX_RIJEN) {
          throw new Error(`Het blad "${naam}" heeft te veel rijen (meer dan ${MAX_RIJEN}). Splits het bestand in kleinere delen.`);
        }
        if (kolom > MAX_KOLOMMEN) {
          throw new Error(`Het blad "${naam}" heeft te veel kolommen (meer dan ${MAX_KOLOMMEN}). Verwijder de kolommen die je niet nodig hebt.`);
        }
        (rijen[rij - 1] ||= [])[kolom - 1] = w;
        if (kolom > breedte) breedte = kolom;
      }
    },
  });
  // Rechthoekig maken: elke rij even lang, met null op de lege plekken.
  return Array.from({ length: rijen.length }, (leeg, r) => {
    const bron = rijen[r] || [];
    return Array.from({ length: breedte }, (ook, k) => bron[k] ?? null);
  });
}

/**
 * Leest een Excel-bestand (.xlsx): { bladen: [{ naam, rijen }] } in de volgorde van de tabbladen.
 * Cellen worden tekst, getal, waar/onwaar of null; datums worden 'JJJJ-MM-DD' (met tijd: 'JJJJ-MM-DD uu:mm').
 * Van een formule komt de laatst berekende uitkomst.
 */
export async function leesXlsx(invoer) {
  const b = alsBytes(invoer);
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) throw new Error(OUDE_XLS);
  if (b[0] !== 0x50 || b[1] !== 0x4b) throw new Error(GEEN_XLSX);
  const zip = await leesZip(b);
  const start = [...leesRelaties(zip, '').values()].find((r) => r.soort === 'officeDocument');
  const werkmapPad = start && zip.has(start.pad) ? start.pad : 'xl/workbook.xml';
  if (!zip.has(werkmapPad)) throw new Error(GEEN_XLSX);

  const tabbladen = [];
  let vanaf1904 = false;
  leesXml(decodeer(zip.get(werkmapPad)), {
    open(naam, ruw) {
      if (naam === 'sheet') tabbladen.push(attributen(ruw));
      else if (naam === 'workbookPr') vanaf1904 = /^(1|true)$/i.test(attributen(ruw).date1904 || '');
    },
  });
  const relaties = leesRelaties(zip, werkmapPad);
  const onderdeel = (soort, standaard) => {
    const pad = [...relaties.values()].find((r) => r.soort === soort)?.pad ?? zipPad(werkmapPad, standaard);
    return zip.has(pad) ? decodeer(zip.get(pad)) : '';
  };
  const teksten = leesGedeeldeTeksten(onderdeel('sharedStrings', 'sharedStrings.xml'));
  const stijlen = leesStijlen(onderdeel('styles', 'styles.xml'));

  const bladen = [];
  for (const tab of tabbladen) {
    const relatie = relaties.get(tab.id);
    if (!relatie || relatie.soort !== 'worksheet' || !zip.has(relatie.pad)) continue; // bijvoorbeeld een grafiekblad
    const naam = tab.name || `Blad${bladen.length + 1}`;
    bladen.push({ naam, rijen: leesBlad(decodeer(zip.get(relatie.pad)), naam, teksten, stijlen, vanaf1904) });
  }
  if (!bladen.length) throw new Error(GEEN_XLSX);
  return { bladen };
}

// ---------- CSV lezen ----------

/** Bytes naar tekst: UTF-8 (met of zonder BOM), UTF-16 met BOM, en anders windows-1252 (oude Excel-export). */
function csvTekst(b) {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

/** Kiest het scheidingsteken (; , of tab) aan de hand van de eerste regels, buiten aanhalingstekens geteld. */
function csvScheiding(tekst) {
  const kandidaten = [';', ',', '\t'];
  const regels = []; // per regel: hoe vaak elk teken voorkomt
  let telling = [0, 0, 0];
  let tussen = false;
  let leeg = true;
  for (let i = 0; i < tekst.length && regels.length < 10; i++) {
    const c = tekst[i];
    if (c === '"') tussen = !tussen;
    else if (!tussen && (c === '\n' || c === '\r')) {
      if (!leeg) regels.push(telling);
      telling = [0, 0, 0];
      leeg = true;
      continue;
    } else if (!tussen && kandidaten.includes(c)) telling[kandidaten.indexOf(c)]++;
    leeg = false;
  }
  if (!leeg && regels.length < 10) regels.push(telling);
  let beste = 0;
  let besteScore = -1;
  kandidaten.forEach((teken, k) => {
    const n = regels.map((r) => r[k]);
    const eerste = n[0] || 0;
    // Het zwaarst telt: op elke regel even vaak. Daarna: hoe vaak in de kopregel, en hoe vaak in totaal.
    const score = (eerste > 0 && n.every((x) => x === eerste) ? 1e9 : 0) + eerste * 1e4 + n.reduce((a, x) => a + x, 0);
    if (score > besteScore) {
      besteScore = score;
      beste = k;
    }
  });
  return kandidaten[beste];
}

/**
 * Leest een CSV-bestand (tekst of bytes) naar rijen met teksten. Herkent zelf het scheidingsteken (; , tab),
 * aanhalingstekens ("a ""b"" c", ook met regeleinden erin) en de tekenset (UTF-8 of die van oude Excel-versies).
 */
export function leesCsv(invoer) {
  let tekst = typeof invoer === 'string' ? invoer : csvTekst(alsBytes(invoer));
  if (tekst.charCodeAt(0) === 0xfeff) tekst = tekst.slice(1);
  const hint = /^sep=([^\r\n])(\r\n?|\n|$)/i.exec(tekst); // Excel-aanwijzing op de eerste regel: sep=;
  if (hint) tekst = tekst.slice(hint[0].length);
  const scheiding = hint ? hint[1] : csvScheiding(tekst);
  const rijen = [];
  let rij = [];
  let veld = '';
  let tussen = false; // binnen aanhalingstekens
  let begin = true; // aan het begin van een veld
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (tussen) {
      if (c !== '"') veld += c;
      else if (tekst[i + 1] === '"') {
        veld += '"';
        i++;
      } else tussen = false;
    } else if (c === '"' && begin) {
      tussen = true;
      begin = false;
    } else if (c === scheiding) {
      rij.push(veld);
      veld = '';
      begin = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && tekst[i + 1] === '\n') i++;
      rij.push(veld);
      rijen.push(rij);
      rij = [];
      veld = '';
      begin = true;
    } else {
      veld += c;
      begin = false;
    }
  }
  if (rij.length || veld !== '' || !begin) {
    rij.push(veld);
    rijen.push(rij);
  }
  while (rijen.length && rijen[rijen.length - 1].length === 1 && rijen[rijen.length - 1][0] === '') rijen.pop();
  return rijen;
}

// ---------- Word schrijven (.docx) ----------

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TYPE_W = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
const INSPRING_CITAAT = 567; // 1 cm per niveau
const MAX_CITAAT_DIEPTE = 6;

// Dezelfde patronen als het voorbeeld in de schrijfomgeving (schermen/stuk-bewerken.js).
const P_KOP = /^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/;
const P_OPSOMMING = /^[ \t]*[-*+][ \t]+/;
const P_GENUMMERD = /^[ \t]*(\d{1,9})[.)][ \t]+/;
const P_LIJST = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/;
const P_CITAAT = /^[ \t]{0,3}>[ \t]?/;
const isBlokStart = (regel) => P_KOP.test(regel) || P_LIJST.test(regel) || P_CITAAT.test(regel);
const isSpatie = (teken) => teken === undefined || /\s/.test(teken);

/** Verdeelt Markdown-tekst in blokken: kop, alinea, lijst en citaat (een citaat bevat zelf weer blokken). */
function mdBlokken(tekst, diepte = 0) {
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
      blokken.push({ soort: 'kop', niveau: m[1].length, regels: [m[2].replace(/[ \t]+#+[ \t]*$/, '').trim()] });
      i++;
      continue;
    }
    if (P_CITAAT.test(regel) && diepte < MAX_CITAAT_DIEPTE) {
      const binnen = [];
      while (i < regels.length && P_CITAAT.test(regels[i])) binnen.push(regels[i++].replace(P_CITAAT, ''));
      blokken.push({ soort: 'citaat', blokken: mdBlokken(binnen.join('\n'), diepte + 1) });
      continue;
    }
    const opsomming = P_OPSOMMING.test(regel);
    m = P_GENUMMERD.exec(regel);
    if (opsomming || m) {
      const patroon = opsomming ? P_OPSOMMING : P_GENUMMERD;
      const punten = [];
      while (i < regels.length && patroon.test(regels[i])) {
        const punt = [regels[i++].replace(patroon, '')];
        // Ingesprongen vervolgregels horen bij hetzelfde punt.
        while (i < regels.length && /^[ \t]{2,}\S/.test(regels[i]) && !P_LIJST.test(regels[i])) punt.push(regels[i++].trim());
        punten.push(punt);
      }
      blokken.push({ soort: 'lijst', genummerd: !opsomming, start: opsomming ? 1 : parseInt(m[1], 10), punten });
      continue;
    }
    // Gewone alinea: regels tot een lege regel of een nieuw blok; een enkel regeleinde blijft een regeleinde.
    const alinea = [];
    while (i < regels.length && regels[i].trim() && (!alinea.length || !isBlokStart(regels[i]))) alinea.push(regels[i++]);
    blokken.push({ soort: 'alinea', regels: alinea });
  }
  return blokken;
}

/** Zoekt de afsluitende * of ** voor opmaak die bij positie start begint; -1 als die er niet is. */
function zoekSluiting(t, start, mark) {
  if (start >= t.length || isSpatie(t[start])) return -1;
  let j = start;
  while (j < t.length) {
    if (t[j] === '\\') {
      j += 2;
      continue;
    }
    if (mark === '*' && t.startsWith('**', j)) {
      const k = t.indexOf('**', j + 2); // vet binnen cursief overslaan
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

/** Zet één regel om naar stukjes tekst met vet en/of cursief: [{ tekst, vet, cursief }]. */
function mdStukjes(t, vet = false, cursief = false, uit = []) {
  let buffer = '';
  let i = 0;
  const leeg = () => {
    if (buffer) uit.push({ tekst: buffer, vet, cursief });
    buffer = '';
  };
  while (i < t.length) {
    const c = t[i];
    if (c === '\\' && i + 1 < t.length && '*\\#>'.includes(t[i + 1])) {
      buffer += t[i + 1];
      i += 2;
      continue;
    }
    if (c === '*') {
      const mark = t.startsWith('**', i) ? '**' : '*';
      const eind = zoekSluiting(t, i + mark.length, mark);
      if (eind > i + mark.length) {
        leeg();
        mdStukjes(t.slice(i + mark.length, eind), vet || mark === '**', cursief || mark === '*', uit);
        i = eind + mark.length;
        continue;
      }
    }
    buffer += c;
    i++;
  }
  leeg();
  return uit;
}

const wTekst = (tekst) => `<w:t xml:space="preserve">${xmlTekst(tekst)}</w:t>`;

/** Eén Word-alinea van een of meer regels (met regeleinden ertussen). */
function wAlinea(regels, eigenschappen = '', plat = false) {
  const stukjes = regels.map((regel) => {
    const delen = plat ? [{ tekst: regel }] : mdStukjes(regel);
    return delen
      .map((s) => {
        const opmaak = s.vet || s.cursief ? `<w:rPr>${s.vet ? '<w:b/>' : ''}${s.cursief ? '<w:i/>' : ''}</w:rPr>` : '';
        return `<w:r>${opmaak}${s.tekst.split('\t').map(wTekst).join('<w:tab/>')}</w:r>`;
      })
      .join('');
  });
  return `<w:p>${eigenschappen ? `<w:pPr>${eigenschappen}</w:pPr>` : ''}${stukjes.join('<w:r><w:br/></w:r>')}</w:p>`;
}

/** Zet blokken om naar Word-alinea's. Elke genummerde lijst krijgt een eigen nummering (in lijsten). */
function wBlokken(blokken, lijsten, diepte = 0) {
  const inspring = diepte * INSPRING_CITAAT;
  let uit = '';
  for (const blok of blokken) {
    if (blok.soort === 'kop') uit += wAlinea(blok.regels, `<w:pStyle w:val="Heading${blok.niveau}"/>`);
    else if (blok.soort === 'citaat') uit += wBlokken(blok.blokken, lijsten, diepte + 1);
    else if (blok.soort === 'lijst') {
      let nummering = 1; // 1 = opsommingstekens
      if (blok.genummerd) {
        lijsten.push(blok.start);
        nummering = lijsten.length + 1;
      }
      const eigenschappen =
        `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${nummering}"/></w:numPr>` +
        (diepte ? `<w:ind w:left="${720 + inspring}" w:hanging="360"/>` : '');
      for (const punt of blok.punten) uit += wAlinea(punt, eigenschappen);
    } else if (diepte) {
      uit += wAlinea(blok.regels, `<w:pStyle w:val="Quote"/>${diepte > 1 ? `<w:ind w:left="${inspring}"/>` : ''}`);
    } else uit += wAlinea(blok.regels);
  }
  return uit;
}

// Opmaakprofielen. Word herkent "heading 1" en toont die in het Nederlands als "Kop 1" (ook in het navigatievenster).
function wStijl(id, naam, alinea, tekens, basis = 'Normal') {
  return (
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${naam}"/><w:basedOn w:val="${basis}"/>` +
    `${id === 'ListParagraph' || id === 'Footer' ? '' : '<w:next w:val="Normal"/>'}<w:qFormat/>` +
    `${alinea ? `<w:pPr>${alinea}</w:pPr>` : ''}${tekens ? `<w:rPr>${tekens}</w:rPr>` : ''}</w:style>`
  );
}
const wKop = (niveau, voor, grootte) =>
  wStijl(
    `Heading${niveau}`,
    `heading ${niveau}`,
    `<w:keepNext/><w:keepLines/><w:spacing w:before="${voor}" w:after="80"/><w:outlineLvl w:val="${niveau - 1}"/>`,
    `<w:b/><w:color w:val="1F2937"/><w:sz w:val="${grootte}"/><w:szCs w:val="${grootte}"/>`,
  );
const DOCX_STIJLEN =
  `${XML_KOP}<w:styles xmlns:w="${NS_W}"><w:docDefaults><w:rPrDefault><w:rPr>` +
  '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>' +
  '<w:lang w:val="nl-NL" w:eastAsia="nl-NL" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  wStijl('Title', 'Title', '<w:spacing w:after="240" w:line="240" w:lineRule="auto"/>', '<w:b/><w:color w:val="1F2937"/><w:sz w:val="44"/><w:szCs w:val="44"/>') +
  wKop(1, 360, 32) +
  wKop(2, 280, 26) +
  wKop(3, 240, 24) +
  wStijl('Quote', 'Quote', `<w:ind w:left="${INSPRING_CITAAT}" w:right="${INSPRING_CITAAT}"/>`, '<w:i/><w:color w:val="404040"/>') +
  wStijl('ListParagraph', 'List Paragraph', '<w:spacing w:after="60"/><w:ind w:left="720"/>', '') +
  wStijl('Footer', 'footer', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', '<w:color w:val="6B7280"/><w:sz w:val="18"/><w:szCs w:val="18"/>') +
  '</w:styles>';

/** Nummering: 1 = opsommingstekens; daarna één nummering per genummerde lijst, elk met een eigen beginnummer. */
function docxNummering(lijsten) {
  const niveau = (soort, teken) =>
    `<w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${soort}"/>` +
    `<w:lvlText w:val="${teken}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>`;
  let uit =
    `${XML_KOP}<w:numbering xmlns:w="${NS_W}"><w:abstractNum w:abstractNumId="0">${niveau('bullet', '•')}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1">${niveau('decimal', '%1.')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`;
  lijsten.forEach((start, i) => {
    uit +=
      `<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0">` +
      `<w:startOverride w:val="${Math.max(0, start)}"/></w:lvlOverride></w:num>`;
  });
  return `${uit}</w:numbering>`;
}

/**
 * Maakt een Word-document (.docx) op A4 van een tekst met de eenvoudige opmaak uit de schrijfomgeving:
 * # ## ### koppen, **vet**, *cursief*, opsommingen (- * +), genummerde lijsten (1.) en > citaten.
 */
export function maakDocx({ titel = '', markdown = '', voettekst = '' } = {}) {
  const lijsten = [];
  let inhoud = titel ? wAlinea([String(titel)], '<w:pStyle w:val="Title"/>', true) : '';
  inhoud += wBlokken(mdBlokken(String(markdown ?? '')), lijsten);
  const voet = String(voettekst ?? '').trim();
  const relatie = (nr, soort, doel) => `<Relationship Id="rId${nr}" Type="${NS_REL_DOC}/${soort}" Target="${doel}"/>`;
  const onderdeel = (naam) => `<Override PartName="/word/${naam}.xml" ContentType="${TYPE_W}.${naam.replace(/\d+$/, '')}+xml"/>`;
  const bestanden = [
    {
      naam: '[Content_Types].xml',
      inhoud:
        `${XML_KOP}<Types xmlns="${NS_TYPEN}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${TYPE_W}.document.main+xml"/>` +
        `${onderdeel('styles')}${onderdeel('numbering')}${onderdeel('settings')}${voet ? onderdeel('footer1') : ''}` +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
    },
    {
      naam: '_rels/.rels',
      inhoud:
        `${XML_KOP}<Relationships xmlns="${NS_REL}">${relatie(1, 'officeDocument', 'word/document.xml')}` +
        `<Relationship Id="rId2" Type="${NS_REL}/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    },
    {
      naam: 'docProps/core.xml',
      inhoud:
        `${XML_KOP}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
        `xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlTekst(titel)}</dc:title><dc:language>nl-NL</dc:language></cp:coreProperties>`,
    },
    {
      naam: 'word/document.xml',
      inhoud:
        `${XML_KOP}<w:document xmlns:w="${NS_W}" xmlns:r="${NS_REL_DOC}"><w:body>${inhoud || '<w:p/>'}` +
        `<w:sectPr>${voet ? '<w:footerReference w:type="default" r:id="rId4"/>' : ''}<w:pgSz w:w="11906" w:h="16838"/>` +
        '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>' +
        '</w:sectPr></w:body></w:document>',
    },
    {
      naam: 'word/_rels/document.xml.rels',
      inhoud:
        `${XML_KOP}<Relationships xmlns="${NS_REL}">${relatie(1, 'styles', 'styles.xml')}${relatie(2, 'numbering', 'numbering.xml')}` +
        `${relatie(3, 'settings', 'settings.xml')}${voet ? relatie(4, 'footer', 'footer1.xml') : ''}</Relationships>`,
    },
    { naam: 'word/styles.xml', inhoud: DOCX_STIJLEN },
    { naam: 'word/numbering.xml', inhoud: docxNummering(lijsten) },
    {
      naam: 'word/settings.xml', // compatibilityMode 15: Word opent het bestand niet in de "compatibiliteitsmodus"
      inhoud:
        `${XML_KOP}<w:settings xmlns:w="${NS_W}"><w:defaultTabStop w:val="708"/><w:compat><w:compatSetting w:name="compatibilityMode" ` +
        'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="nl-NL"/></w:settings>',
    },
  ];
  if (voet) {
    const alinea = wAlinea(voet.replace(/\r\n?/g, '\n').split('\n'), '<w:pStyle w:val="Footer"/>', true);
    bestanden.push({ naam: 'word/footer1.xml', inhoud: `${XML_KOP}<w:ftr xmlns:w="${NS_W}">${alinea}</w:ftr>` });
  }
  return maakZip(bestanden);
}

// ---------- Agenda (.ics voor Outlook en andere agenda's) ----------

/** Tekst volgens de regels van een agendabestand: \ ; , en regeleinden krijgen een \ ervoor. */
function icsTekst(tekst) {
  return String(tekst ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n?|\n/g, '\\n')
    .replace(/[\u0000-\u001f\u007f]/g, '');
}

/** Breekt een regel af op 75 bytes (vervolgregels beginnen met een spatie), nooit midden in een teken. */
function icsVouw(regel) {
  const delen = [];
  let huidig = '';
  let bytes = 0;
  for (const teken of regel) {
    const n = utf8Lengte(teken);
    if (bytes + n > 75) {
      delen.push(huidig);
      huidig = ' ';
      bytes = 1;
    }
    huidig += teken;
    bytes += n;
  }
  delen.push(huidig);
  return delen.join('\r\n');
}

/**
 * Maakt een agendabestand (.ics) met afspraken voor de hele dag: [{ titel, datum: 'JJJJ-MM-DD', omschrijving?, uid? }].
 * Afspraken zonder geldige datum worden overgeslagen. opties: { naam?, tijdstempel? } (tijdstempel: Date of ISO-tekst).
 */
export function maakIcs(afspraken, opties = {}) {
  const t = opties.tijdstempel;
  const moment = t instanceof Date ? t : new Date(typeof t === 'string' || typeof t === 'number' ? t : NaN);
  const stempel = Number.isNaN(moment.getTime())
    ? '20260101T000000Z' // vaste waarde: dezelfde invoer geeft hetzelfde bestand
    : `${moment.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const regels = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Onderzoeksomgeving//Agenda//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (opties.naam) regels.push(`X-WR-CALNAME:${icsTekst(opties.naam)}`);
  const uids = new Set();
  for (const afspraak of afspraken || []) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(String(afspraak?.datum ?? '').trim());
    if (!m) continue;
    const [jaar, maand, dag] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const begin = new Date(Date.UTC(jaar, maand - 1, dag));
    if (begin.getUTCMonth() !== maand - 1 || begin.getUTCDate() !== dag) continue; // bijvoorbeeld 31 februari
    const compact = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const titel = String(afspraak.titel ?? '').trim() || '(zonder titel)';
    // Vaste uid per afspraak, zodat opnieuw importeren de afspraak bijwerkt in plaats van verdubbelt.
    const basis = afspraak.uid
      ? String(afspraak.uid).replace(/\s+/g, '')
      : `${crc32(utf8(`${titel}\n${afspraak.omschrijving ?? ''}`)).toString(16).padStart(8, '0')}-${compact(begin)}@onderzoeksomgeving`;
    let uid = basis;
    for (let n = 2; uids.has(uid); n++) uid = `${n}-${basis}`;
    uids.add(uid);
    regels.push(
      'BEGIN:VEVENT',
      `UID:${icsTekst(uid)}`,
      `DTSTAMP:${stempel}`,
      `DTSTART;VALUE=DATE:${compact(begin)}`,
      `DTEND;VALUE=DATE:${compact(new Date(Date.UTC(jaar, maand - 1, dag + 1)))}`,
      `SUMMARY:${icsTekst(titel)}`,
    );
    if (afspraak.omschrijving) regels.push(`DESCRIPTION:${icsTekst(afspraak.omschrijving)}`);
    regels.push('TRANSP:TRANSPARENT', 'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE', 'END:VEVENT');
  }
  regels.push('END:VCALENDAR');
  return `${regels.map(icsVouw).join('\r\n')}\r\n`;
}

// ---------- SPSS ----------

const SPSS_GERESERVEERD = new Set(['ALL', 'AND', 'BY', 'EQ', 'GE', 'GT', 'LE', 'LT', 'NE', 'NOT', 'OR', 'TO', 'WITH']);
const SPSS_MAX_NAAM = 32;

/**
 * Maakt van een tekst een geldige, unieke SPSS-variabelenaam: begint met een letter, alleen letters, cijfers
 * en _, maximaal 32 tekens en geen gereserveerd woord. Bestaat de naam al, dan komt er _2, _3 … achter.
 * De naam wordt aan gebruikt toegevoegd.
 */
export function spssNaam(tekst, gebruikt = new Set()) {
  let basis = String(tekst ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!basis) basis = 'var';
  if (!/^[A-Za-z]/.test(basis)) basis = `v${basis}`;
  if (SPSS_GERESERVEERD.has(basis.toUpperCase())) basis = `v_${basis}`;
  basis = basis.slice(0, SPSS_MAX_NAAM).replace(/_+$/, '');
  const bezet = new Set([...gebruikt].map((naam) => String(naam).toLowerCase())); // SPSS let niet op hoofdletters
  let naam = basis;
  for (let n = 2; bezet.has(naam.toLowerCase()); n++) {
    const staart = `_${n}`;
    naam = basis.slice(0, SPSS_MAX_NAAM - staart.length).replace(/_+$/, '') + staart;
  }
  gebruikt.add(naam);
  return naam;
}

/** Tekst tussen enkele aanhalingstekens (' wordt ''). Lange tekst wordt in stukken geknipt met + ertussen. */
function spssTekst(tekst, maxBytes, inspring) {
  const schoon = knipBytes(String(tekst ?? '').replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim(), maxBytes);
  const stukken = [];
  let stuk = '';
  let bytes = 0;
  for (const teken of schoon) {
    const n = teken === "'" ? 2 : utf8Lengte(teken);
    if (bytes + n > 180) {
      stukken.push(stuk);
      stuk = '';
      bytes = 0;
    }
    stuk += teken === "'" ? "''" : teken;
    bytes += n;
  }
  stukken.push(stuk);
  return stukken.map((s) => `'${s}'`).join(` +\n${inspring}`);
}

/** Namen over regels verdelen, zodat geen regel te lang wordt. */
function spssNamen(namen, inspring = '  ') {
  const regels = [];
  let regel = '';
  for (const naam of namen) {
    if (regel && regel.length + naam.length + 1 > 100) {
      regels.push(regel);
      regel = '';
    }
    regel += (regel ? ' ' : '') + naam;
  }
  if (regel) regels.push(regel);
  return regels.map((r) => inspring + r).join('\n');
}

/** Variabelen met dezelfde instelling bij elkaar zetten: Map van instelling naar namen. */
function spssGroepen(variabelen, instelling) {
  const groepen = new Map();
  for (const v of variabelen) {
    const sleutel = instelling(v);
    if (sleutel) groepen.set(sleutel, [...(groepen.get(sleutel) || []), v.naam]);
  }
  return groepen;
}

/** Een waarde in SPSS-syntax: een getal, of tekst tussen aanhalingstekens; null als het geen geldig getal is. */
function spssWaarde(variabele, waarde) {
  if (variabele.soort === 'tekst') return spssTekst(waarde, 120, '      ');
  const getal = typeof waarde === 'number' ? waarde : Number(String(waarde).trim().replace(',', '.'));
  return String(waarde).trim() !== '' && Number.isFinite(getal) ? String(getal) : null;
}

/**
 * Maakt SPSS-syntax (.sps, werkt ook in PSPP) die een CSV-bestand inleest en labels instelt.
 * Het CSV-bestand: UTF-8, puntkomma als scheidingsteken, eerste regel met namen, een PUNT als decimaalteken
 * en geen regeleinden binnen een cel. Bij tekst is breedte het grootste aantal tekens.
 */
export function maakSpssSyntax({ databestand, variabelen, titel = '' }) {
  const lijst = (variabelen || []).map((v) => ({ ...v, soort: v.soort === 'tekst' ? 'tekst' : 'getal' }));
  if (!lijst.length) throw new Error('Er zijn geen variabelen om naar SPSS te exporteren.');
  const namen = new Set();
  for (const v of lijst) {
    const ok = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v.naam) && !SPSS_GERESERVEERD.has(v.naam.toUpperCase());
    if (!ok || namen.has(v.naam.toLowerCase())) throw new Error(`Ongeldige of dubbele SPSS-naam: "${v.naam}".`);
    namen.add(v.naam.toLowerCase());
  }
  const bestand = String(databestand || 'gegevens.csv').replace(/[\r\n]+/g, ' ');
  const opmerking = (tekst) => `* ${String(tekst).replace(/\s+/g, ' ').replace(/[.\s]+$/, '').slice(0, 200)}.`;
  const formaat = (v) => {
    if (v.soort === 'tekst') {
      // Breedte in bytes: drie per teken, zodat ook tekst met accenten en andere tekens altijd past.
      const tekens = Number.isFinite(v.breedte) && v.breedte > 0 ? Math.ceil(v.breedte) : 255;
      return `A${Math.min(tekens * 3, 32767)}`;
    }
    const decimalen = Math.min(Math.max(Math.round(v.decimalen ?? 2), 0), 16);
    const breedte = Math.min(Math.max(Math.round(v.breedte ?? 8), decimalen + 2), 40);
    return `F${breedte}.${decimalen}`;
  };
  const uit = [
    '* Encoding: UTF-8.',
    '* =====================================================================.',
    opmerking(titel || 'Gegevens uit de Onderzoeksomgeving'),
    '* Syntax voor SPSS (werkt ook in PSPP), gemaakt door de Onderzoeksomgeving.',
    '*.',
    '* Zo gebruik je dit bestand.',
    `* 1. Zet dit syntaxbestand en het gegevensbestand (${bestand.replace(/[.\s]+$/, '')}) samen in een map.`,
    '* 2. Open dit syntaxbestand in SPSS: File > Open > Syntax (Bestand > Openen > Syntax).',
    '* 3. Kan SPSS het gegevensbestand niet vinden? Zet dan bij /FILE hieronder het hele pad.',
    "*    Voorbeeld: /FILE='C:\\Users\\jouwnaam\\Documents\\onderzoek\\gegevens.csv'.",
    '* 4. Kies in het syntaxvenster Run > All (Uitvoeren > Alles).',
    '* 5. Bewaar de gegevens daarna als SPSS-bestand: File > Save As (Bestand > Opslaan als).',
    '*.',
    '* Het gegevensbestand gebruikt een punt als decimaalteken. SET DECIMAL=DOT zorgt dat SPSS dat goed',
    '* leest, ook op een Nederlandse computer. RESTORE zet aan het eind je eigen instelling terug.',
    '* Zie je vreemde tekens in plaats van letters met accenten? Sluit dan alle gegevens, voer eenmalig',
    '* SET UNICODE=ON uit en voer daarna deze syntax opnieuw uit.',
    '* =====================================================================.',
    '',
    'PRESERVE.',
    'SET DECIMAL=DOT.',
    '',
    'GET DATA',
    '  /TYPE=TXT',
    `  /FILE='${bestand.replace(/'/g, "''")}'`,
    "  /ENCODING='UTF8'",
    '  /DELCASE=LINE',
    '  /DELIMITERS=";"',
    "  /QUALIFIER='\"'",
    '  /ARRANGEMENT=DELIMITED',
    '  /FIRSTCASE=2',
    '  /VARIABLES=',
    `${lijst.map((v) => `    ${v.naam} ${formaat(v)}`).join('\n')}.`,
  ];
  // Een blok als "VARIABLE LABELS" met onderdelen, gescheiden door / en afgesloten met een punt.
  const blok = (kop, onderdelen) => {
    if (onderdelen.length) uit.push('', kop, `${onderdelen.map((o, i) => (i ? `  /${o.trimStart()}` : o)).join('\n')}.`);
  };
  blok('VARIABLE LABELS', lijst.filter((v) => String(v.label ?? '').trim()).map((v) => `  ${v.naam} ${spssTekst(v.label, 255, '    ')}`));
  const labels = (v) =>
    Object.entries(v.waardelabels || {})
      .map(([waarde, label]) => [spssWaarde(v, waarde), label])
      .filter(([waarde]) => waarde !== null)
      .map(([waarde, label]) => `    ${waarde} ${spssTekst(label, 120, '      ')}`)
      .join('\n');
  blok('VALUE LABELS', [...spssGroepen(lijst, labels)].map(([regels, groep]) => `${spssNamen(groep)}\n${regels}`));
  // SPSS staat per variabele hooguit drie losse ontbrekende waarden toe.
  const ontbrekend = (v) => (v.ontbrekend || []).map((w) => spssWaarde(v, w)).filter((w) => w !== null).slice(0, 3).join(', ');
  blok('MISSING VALUES', [...spssGroepen(lijst, ontbrekend)].map(([waarden, groep]) => `${spssNamen(groep)} (${waarden})`));
  const niveau = (v) => (['SCALE', 'ORDINAL', 'NOMINAL'].includes(v.meetniveau) ? v.meetniveau : '');
  blok('VARIABLE LEVEL', [...spssGroepen(lijst, niveau)].map(([soort, groep]) => `${spssNamen(groep)} (${soort})`));
  uit.push('', 'CACHE.', 'EXECUTE.', 'RESTORE.', '');
  return uit.join('\n');
}

// ---------- Opslaan in de browser ----------

/** Laat de browser een bestand opslaan (werkt alleen op een pagina, niet in Node). */
export function bewaarBestand(inhoud, naam, type) {
  const url = URL.createObjectURL(new Blob([inhoud], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = naam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
