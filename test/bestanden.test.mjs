// Automatische test van public/js/beheer/bestanden.js: zip, Excel (.xlsx), CSV, Word (.docx), agenda (.ics) en SPSS.
// Uitvoeren: node --test test/bestanden.test.mjs   (er is geen server of database voor nodig)
//
// De testbestanden in test/fixtures/ zijn met andere programma's gemaakt, zodat de lezer niet alleen zijn
// eigen uitvoer leest:
//   openpyxl-voorbeeld.xlsx     openpyxl 3.1.5 (Python): tekst in de cel zelf (inlineStr), getallen, waar/onwaar,
//                               datums en tijden met Nederlandse en ingebouwde notaties, formules met de laatst
//                               berekende uitkomst (die zijn er achteraf bij gezet, openpyxl rekent niet), een
//                               foutcel, lege plekken, een blad met een Nederlandse naam en een leeg blad; met compressie.
//   libreoffice-voorbeeld.xlsx  hetzelfde bestand, geopend en opnieuw opgeslagen met LibreOffice 24.2 (gedeelde
//                               teksten, eigen stijlnummers, zelf uitgerekende formules).
//   excel-nl.csv                zoals de Nederlandse Excel "CSV (gescheiden door lijstscheidingsteken)" opslaat:
//                               puntkomma's, windows-1252, CRLF, decimale komma, "aanhalingstekens ""verdubbeld""".
//   deflate.zip                 Python zipfile met compressie, een map, een bestandsnaam met é en een emoji, en commentaar.
// Wat de module schrijft is daarnaast met de hand nagelezen met openpyxl, python-docx 1.2.0, icalendar 7.3.2,
// LibreOffice 24.2 (omzetten naar xlsx, pdf en tekst) en PSPP 2.0.0 (de SPSS-syntax uitgevoerd op een bijpassend CSV-bestand).
// Dat geldt ook voor een rapport uit blokken met tabellen: python-docx leest de tabellen terug, en in de pdf van
// LibreOffice staat de kopregel van een lange tabel bovenaan elke pagina. Met Word en SPSS zelf is niet getest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import * as B from '../public/js/beheer/bestanden.js';

const fixture = (naam) => new Uint8Array(readFileSync(new URL(`./fixtures/${naam}`, import.meta.url)));
const alsTekst = (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const bytes = (tekst) => new TextEncoder().encode(tekst);
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Controleert of XML netjes is opgebouwd: elk element gesloten, geen losse < > of &. */
function controleerXml(xml, naam) {
  const stapel = [];
  const rest = xml
    .replace(/^<\?xml[^>]*\?>\s*/, '')
    .replace(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g, (alles, sluit, element, attributen, zelf) => {
      if (sluit) assert.equal(stapel.pop(), element, `${naam}: </${element}> past niet`);
      else if (!zelf) stapel.push(element);
      return '';
    });
  assert.deepEqual(stapel, [], `${naam}: niet alle elementen zijn gesloten`);
  assert.ok(!/[<>]/.test(rest), `${naam}: losse < of > in de tekst`);
  assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(xml), `${naam}: losse &`);
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(xml), `${naam}: teken dat niet in XML mag`);
}

/** Zip met één gecomprimeerd bestand, gemaakt met zlib van Node; de opgegeven grootte en crc zijn instelbaar. */
function zipMetCompressie(naam, inhoud, { opgegeven = inhoud.length, crc = B.crc32(inhoud) } = {}) {
  const data = deflateRawSync(inhoud);
  const n = Buffer.from(naam);
  const lokaal = Buffer.alloc(30);
  lokaal.writeUInt32LE(0x04034b50, 0);
  lokaal.writeUInt16LE(20, 4);
  lokaal.writeUInt16LE(0x0800, 6);
  lokaal.writeUInt16LE(8, 8);
  lokaal.writeUInt32LE(crc, 14);
  lokaal.writeUInt32LE(data.length, 18);
  lokaal.writeUInt32LE(opgegeven, 22);
  lokaal.writeUInt16LE(n.length, 26);
  const centraal = Buffer.alloc(46);
  centraal.writeUInt32LE(0x02014b50, 0);
  centraal.writeUInt16LE(20, 4);
  centraal.writeUInt16LE(20, 6);
  centraal.writeUInt16LE(0x0800, 8);
  centraal.writeUInt16LE(8, 10);
  centraal.writeUInt32LE(crc, 16);
  centraal.writeUInt32LE(data.length, 20);
  centraal.writeUInt32LE(opgegeven, 24);
  centraal.writeUInt16LE(n.length, 28);
  const slot = Buffer.alloc(22);
  slot.writeUInt32LE(0x06054b50, 0);
  slot.writeUInt16LE(1, 8);
  slot.writeUInt16LE(1, 10);
  slot.writeUInt32LE(46 + n.length, 12);
  slot.writeUInt32LE(30 + n.length + data.length, 16);
  return new Uint8Array(Buffer.concat([lokaal, n, data, centraal, n, slot]));
}

/** Positie van een vaste bytereeks (bijvoorbeeld het begin van de centrale map) in een bestand. */
function zoek(b, ...reeks) {
  for (let i = 0; i <= b.length - reeks.length; i++) if (reeks.every((x, k) => b[i + k] === x)) return i;
  return -1;
}

// ---------- crc32 en zip ----------

test('crc32: bekende uitkomsten', () => {
  assert.equal(B.crc32(bytes('123456789')), 0xcbf43926);
  assert.equal(B.crc32(bytes('The quick brown fox jumps over the lazy dog')), 0x414fa339);
  assert.equal(B.crc32(new Uint8Array(0)), 0);
});

test('zip: schrijven en teruglezen, ook met bijzondere bestandsnamen', async () => {
  const invoer = [
    { naam: 'leesmij.txt', inhoud: 'Hallo wereld\n' },
    { naam: 'map/één 🙂 bestand.txt', inhoud: 'inhoud met é en €' },
    { naam: 'leeg.bin', inhoud: new Uint8Array(0) },
    { naam: 'bytes.bin', inhoud: Uint8Array.from({ length: 70000 }, (x, i) => (i * 7) % 256) },
  ];
  const zip = B.maakZip(invoer);
  assert.ok(zip instanceof Uint8Array);
  assert.deepEqual([...zip.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.equal(new DataView(zip.buffer).getUint16(6, true), 0x0800, 'vlag voor UTF-8-namen');
  assert.equal(new DataView(zip.buffer).getUint16(8, true), 0, 'methode: opslaan');
  assert.deepEqual(B.maakZip(invoer), zip, 'dezelfde invoer geeft hetzelfde bestand');

  const uit = await B.leesZip(zip);
  assert.ok(uit instanceof Map);
  assert.deepEqual([...uit.keys()], invoer.map((b) => b.naam));
  assert.equal(alsTekst(uit.get('leesmij.txt')), 'Hallo wereld\n');
  assert.equal(alsTekst(uit.get('map/één 🙂 bestand.txt')), 'inhoud met é en €');
  assert.equal(uit.get('leeg.bin').length, 0);
  assert.deepEqual(uit.get('bytes.bin'), invoer[3].inhoud);
  // Ook een ArrayBuffer en een stuk uit een grotere buffer worden gelezen.
  assert.equal((await B.leesZip(zip.buffer.slice(0))).size, 4);
  const groter = new Uint8Array(zip.length + 10);
  groter.set(zip, 5);
  assert.equal((await B.leesZip(groter.subarray(5, 5 + zip.length))).size, 4);
  assert.throws(() => B.maakZip([{ naam: 'a', inhoud: '1' }, { naam: 'a', inhoud: '2' }]), /dubbele bestandsnaam/);
});

test('zip: bestand met compressie uit Python (fixture) en uit zlib', async () => {
  const uit = await B.leesZip(fixture('deflate.zip'));
  assert.deepEqual([...uit.keys()], ['tekst.txt', 'map/één 🙂.txt', 'opgeslagen.bin']);
  assert.equal(alsTekst(uit.get('tekst.txt')), 'Dit is een tekst die goed comprimeert. '.repeat(200));
  assert.equal(alsTekst(uit.get('map/één 🙂.txt')), 'inhoud met é en €');
  assert.deepEqual([...uit.get('opgeslagen.bin')], Array.from({ length: 256 }, (x, i) => i));

  const groot = bytes('abc '.repeat(100000));
  const zelf = await B.leesZip(zipMetCompressie('groot.txt', groot));
  assert.deepEqual(zelf.get('groot.txt'), groot);
});

test('zip: foutmeldingen in het Nederlands bij ongeldige of gevaarlijke bestanden', async () => {
  const zip = B.maakZip([{ naam: 'a.txt', inhoud: 'hallo hallo hallo' }]);
  const centraal = zoek(zip, 0x50, 0x4b, 0x01, 0x02);
  const slot = zoek(zip, 0x50, 0x4b, 0x05, 0x06);
  const aangepast = (wijzig) => {
    const kopie = zip.slice();
    wijzig(kopie, new DataView(kopie.buffer));
    return kopie;
  };
  await assert.rejects(B.leesZip(bytes('dit is geen zip-bestand, maar gewone tekst')), /geen geldig zip-bestand/);
  await assert.rejects(B.leesZip(new Uint8Array(0)), /geen geldig zip-bestand/);
  await assert.rejects(B.leesZip(zip.subarray(0, zip.length - 30)), /geen geldig zip-bestand/);
  await assert.rejects(B.leesZip(aangepast((b) => (b[centraal + 8] |= 1))), /wachtwoord/);
  await assert.rejects(B.leesZip(aangepast((b, v) => v.setUint16(centraal + 10, 12, true))), /compressie die niet wordt ondersteund/);
  await assert.rejects(B.leesZip(aangepast((b, v) => (v.setUint16(slot + 8, 0xffff, true), v.setUint16(slot + 10, 0xffff, true)))), /zip64/);
  await assert.rejects(B.leesZip(aangepast((b, v) => v.setUint32(centraal + 16, 12345, true))), /beschadigd/); // crc klopt niet
  await assert.rejects(B.leesZip(aangepast((b, v) => v.setUint32(centraal + 42, 9999, true))), /beschadigd/); // wijst buiten het bestand
  await assert.rejects(B.leesZip(aangepast((b) => (b[centraal] = 0))), /beschadigd/);
  await assert.rejects(() => B.leesZip('tekst'), TypeError);

  // Te veel bestanden.
  const veel = Array.from({ length: 2001 }, (x, i) => ({ naam: `b${i}.txt`, inhoud: '' }));
  await assert.rejects(B.leesZip(B.maakZip(veel)), /te veel bestanden/);
  assert.equal((await B.leesZip(B.maakZip(veel.slice(0, 2000)))).size, 2000);

  // Zipbom: het bestand zegt 61 MB uit te pakken (geweigerd vóór het uitpakken) ...
  const nullen = new Uint8Array(5 * 1024 * 1024);
  await assert.rejects(B.leesZip(zipMetCompressie('bom.bin', nullen, { opgegeven: 61 * 1024 * 1024 })), /uitgepakt te groot \(meer dan 60 MB\)/);
  // ... of het geeft een kleine grootte op en pakt veel groter uit: het uitpakken stopt en het bestand wordt geweigerd.
  await assert.rejects(B.leesZip(zipMetCompressie('bom.bin', nullen, { opgegeven: 1000 })), /beschadigd/);
  await assert.rejects(B.leesZip(zipMetCompressie('kort.bin', bytes('kort'), { opgegeven: 5000 })), /beschadigd/);
  await assert.rejects(B.leesZip(zipMetCompressie('crc.bin', bytes('inhoud'), { crc: 1 })), /beschadigd/);
});

// ---------- Excel schrijven en lezen ----------

test('xlsx: schrijven en teruglezen behoudt soorten en bijzondere tekens', async () => {
  const rijen = [
    ['Naam', 'Getal', 'Waar', 'Tekst'],
    ['Zoë Çelik', 34, true, 'Prima 🙂 👩‍💻'],
    ['<b>&"\'</b>', 3.75, false, ' spaties  dubbel '],
    ['regel 1\nregel 2', -2.5, null, 'tab\ttab'],
    ['_x0041_ blijft letterlijk', 0, undefined, '中文 عربى € ‰'],
    ['wetenschappelijk', 1e21, true, '0012'],
    ['klein', 1e-7, false, "'apostrof"],
    [null, 1234567.891, null, null],
  ];
  const xlsx = B.maakXlsx([{ naam: 'Gegevens', rijen }]);
  const { bladen } = await B.leesXlsx(xlsx);
  assert.equal(bladen.length, 1);
  assert.equal(bladen[0].naam, 'Gegevens');
  assert.deepEqual(bladen[0].rijen, rijen.map((rij) => rij.map((w) => w ?? null)));
  assert.equal(typeof bladen[0].rijen[1][1], 'number');
  assert.equal(typeof bladen[0].rijen[1][2], 'boolean');
  assert.equal(typeof bladen[0].rijen[5][3], 'string', 'tekst die op een getal lijkt blijft tekst');
  assert.deepEqual(B.maakXlsx([{ naam: 'Gegevens', rijen }]), xlsx, 'dezelfde invoer geeft hetzelfde bestand');
});

test('xlsx: tekst die op een formule lijkt blijft tekst', async () => {
  const gevaarlijk = ['=1+1', '+31 6 12345678', '-5', '@SUM(A1)', '=HYPERLINK("http://x","klik")', '=cmd|\'/c calc\'!A1', '\t=1+1'];
  const xlsx = B.maakXlsx([{ naam: 'Test', rijen: [['Kop'], ...gevaarlijk.map((t) => [t])] }]);
  const zip = await B.leesZip(xlsx);
  const blad = alsTekst(zip.get('xl/worksheets/sheet1.xml'));
  assert.ok(!blad.includes('<f'), 'er staat geen enkele formule in het blad');
  assert.equal((blad.match(/<c /g) || []).length, gevaarlijk.length + 1);
  assert.equal((blad.match(/ t="s"/g) || []).length, gevaarlijk.length + 1, 'elke cel is een tekstcel');
  const { bladen } = await B.leesXlsx(xlsx);
  assert.deepEqual(bladen[0].rijen.slice(1).map((r) => r[0]), gevaarlijk);
});

test('xlsx: lege waarden, ongeldige getallen en tekens die niet in XML mogen', async () => {
  const rijen = [
    ['a', 'b', 'c', 'd', 'e'],
    [NaN, Infinity, -Infinity, '', -0],
    ['stuur\u0000\u0001\u0008teken', 'halve \ud83d emoji', 'wagenterugloop\r\nen\rlos', 12n, new Date(Date.UTC(2026, 2, 14))],
    [{ toString: () => 'object' }, new Date(Date.UTC(2026, 2, 14, 9, 30)), new Date(NaN), Symbol.iterator.description, null],
    [null, null, null, null, null],
    [],
  ];
  const xlsx = B.maakXlsx([{ naam: 'Randgevallen', rijen }]);
  for (const [naam, inhoud] of await B.leesZip(xlsx)) controleerXml(alsTekst(inhoud), naam);
  const { bladen } = await B.leesXlsx(xlsx);
  assert.deepEqual(bladen[0].rijen, [
    ['a', 'b', 'c', 'd', 'e'],
    [null, null, null, null, 0],
    ['stuurteken', 'halve  emoji', 'wagenterugloop\nen\nlos', '12', '2026-03-14'],
    ['object', '2026-03-14 09:30', null, 'Symbol.iterator', null],
  ]);
  assert.ok(Object.is(bladen[0].rijen[1][4], 0), '-0 wordt 0');
  // Een cel kan in Excel hooguit 32.767 tekens bevatten.
  const lang = await B.leesXlsx(B.maakXlsx([{ naam: 'Lang', rijen: [['x'.repeat(40000)]] }]));
  assert.equal(lang.bladen[0].rijen[0][0].length, 32767);
});

test('xlsx: opbouw van het bestand (onderdelen, vette en vastgezette kop, kolombreedtes)', async () => {
  const xlsx = B.maakXlsx([
    { naam: 'Eerste', rijen: [['Naam', 'Een hele lange kolomkop voor de breedte', 'N'], ['Jan', 'x'.repeat(500), 5]], kolombreedtes: [30] },
    { naam: 'Tweede', rijen: [['alleen kop']] },
    { naam: 'Leeg', rijen: [] },
  ]);
  const zip = await B.leesZip(xlsx);
  assert.equal([...zip.keys()][0], '[Content_Types].xml', 'het typenoverzicht staat vooraan');
  for (const naam of ['_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml',
    'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) {
    assert.ok(zip.has(naam), `${naam} ontbreekt`);
    assert.ok(alsTekst(zip.get(naam)).startsWith('<?xml version="1.0" encoding="UTF-8"'));
  }
  for (const [naam, inhoud] of zip) controleerXml(alsTekst(inhoud), naam);
  const typen = alsTekst(zip.get('[Content_Types].xml'));
  for (const deel of ['/xl/workbook.xml', '/xl/styles.xml', '/xl/sharedStrings.xml', '/xl/worksheets/sheet3.xml']) {
    assert.ok(typen.includes(`PartName="${deel}"`), `type van ${deel} ontbreekt`);
  }
  const blad = alsTekst(zip.get('xl/worksheets/sheet1.xml'));
  assert.match(blad, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(blad, /<row r="1"><c r="A1" s="1" t="s"><v>0<\/v><\/c><c r="B1" s="1" t="s">/, 'de kop gebruikt de vette stijl');
  assert.match(blad, /<row r="2"><c r="A2" t="s">/, 'gewone rijen niet');
  assert.match(blad, /<c r="C2"><v>5<\/v><\/c>/);
  assert.match(blad, /<dimension ref="A1:C2"\/>/);
  const breedtes = [...blad.matchAll(/<col min="(\d+)" max="\1" width="([\d.]+)" customWidth="1"\/>/g)].map((m) => Number(m[2]));
  assert.equal(breedtes.length, 3);
  assert.equal(breedtes[0], 30, 'opgegeven breedte');
  assert.equal(breedtes[1], 60, 'lange inhoud wordt begrensd');
  assert.equal(breedtes[2], 8, 'korte inhoud krijgt de kleinste breedte');
  assert.match(alsTekst(zip.get('xl/styles.xml')), /<font><b\/>/);
  assert.ok(!alsTekst(zip.get('xl/worksheets/sheet3.xml')).includes('<pane'), 'een leeg blad heeft geen vastgezette kop');
  assert.equal((alsTekst(zip.get('xl/sharedStrings.xml')).match(/<si>/g) || []).length, 6, 'elke tekst staat één keer in de lijst');
});

test('xlsx: namen van tabbladen worden geldig en uniek gemaakt', async () => {
  const namen = ['Gegevens: 2025/2026 [proef]*?', 'Vragenlijst één', 'vragenlijst ÉÉN', 'Vragenlijst één', '',
    'Een hele lange naam voor een tabblad die niet past', 'Een hele lange naam voor een tabblad die niet past', "'aanhaling'", 'History', '🙂'.repeat(20)];
  const { bladen } = await B.leesXlsx(B.maakXlsx(namen.map((naam) => ({ naam, rijen: [['x']] }))));
  const uit = bladen.map((b) => b.naam);
  assert.deepEqual(uit.slice(0, 9), ['Gegevens 2025-2026 proef', 'Vragenlijst één', 'vragenlijst ÉÉN (2)', 'Vragenlijst één (3)', 'Blad5',
    'Een hele lange naam voor een ta', 'Een hele lange naam voor ee (2)', 'aanhaling', 'Blad9']);
  assert.equal(uit[9], '🙂'.repeat(15), 'een emoji wordt niet doormidden geknipt');
  assert.equal(new Set(uit.map((n) => n.toLowerCase())).size, namen.length);
  for (const naam of uit) {
    assert.ok(naam.length >= 1 && naam.length <= 31, naam);
    assert.ok(!/[[\]:*?/\\]/.test(naam), naam);
  }
  // Zonder bladen komt er toch een geldig bestand met één leeg blad.
  assert.deepEqual(await B.leesXlsx(B.maakXlsx([])), { bladen: [{ naam: 'Blad1', rijen: [] }] });
});

test('xlsx: lege plekken worden null; lege rijen en kolommen achteraan vervallen', async () => {
  const rijen = [['a', null, 'c', null, null], [null, null, null, null, null], [null, 2, null, null, null], [null, null, null, null, null], []];
  const { bladen } = await B.leesXlsx(B.maakXlsx([{ naam: 'Gaten', rijen }]));
  assert.deepEqual(bladen[0].rijen, [['a', null, 'c'], [null, null, null], [null, 2, null]]);
});

test('xlsx: 5000 rijen schrijven en teruglezen binnen 2 seconden', async () => {
  const rijen = [['Respondent', 'Afdeling', 'Leeftijd', 'Score', 'Actief', 'Antwoord', 'Toelichting', 'Datum']];
  const antwoorden = ['Helemaal mee eens', 'Mee eens', 'Neutraal', 'Mee oneens', 'Helemaal mee oneens'];
  for (let i = 1; i <= 5000; i++) {
    rijen.push([i, `Afdeling ${i % 12}`, 20 + (i % 45), (i % 50) / 10, i % 2 === 0, antwoorden[i % 5], `Open antwoord nummer ${i} met wat tekst erbij`, '2026-03-14']);
  }
  const start = performance.now();
  const xlsx = B.maakXlsx([{ naam: 'Groot', rijen }]);
  const { bladen } = await B.leesXlsx(xlsx);
  const duur = performance.now() - start;
  assert.equal(bladen[0].rijen.length, 5001);
  assert.deepEqual(bladen[0].rijen[5000], rijen[5000]);
  assert.deepEqual(bladen[0].rijen[2500], rijen[2500]);
  assert.ok(duur < 2000, `duurde ${Math.round(duur)} ms`);
});

const LEEG13 = Array(13).fill(null);
const VERWACHT_VOORBEELD = [
  {
    naam: 'Gegevens',
    rijen: [
      ['Naam', 'Leeftijd', 'Score', 'Actief', 'Geboortedatum', 'Ingevuld op', 'Tijd', 'Formule', 'Opmerking', 'Bedrag', 'Aandeel', null, null],
      ['Jan de Vries', 34, 3.75, true, '1990-05-17', '2026-03-14 09:30', '08:15', 68, 'Prima 🙂', 1234.5, 0.25, null, null],
      ['Zoë Çelik', 51, 4, false, '1975-12-01', '2026-03-15 16:45', null, 4.5, 'Zoë Çelik!', 99, 1, null, null],
      LEEG13,
      ['Ömer', null, -2.5, null, null, null, null, null, 'regel 1\nregel 2', null, null, null, null],
      LEEG13,
      [...Array(12).fill(null), 'ver weg'],
    ],
  },
  {
    naam: 'Vragenlijst één',
    rijen: [
      ['Respondent', 'Ik kan mijn werk goed aan', 'Ik voel me gewaardeerd', 'Toelichting'],
      ...Array.from({ length: 12 }, (x, k) => {
        const i = k + 1;
        const antwoorden = ['Helemaal mee eens', 'Mee eens', 'Neutraal', 'Mee oneens', 'Helemaal mee oneens'];
        const toelichting = i === 2 ? 'Te veel werkdruk; "deadlines" & <overleg> — zie ook \'bijlage\'' : i % 3 ? 'Geen' : null;
        return [i, antwoorden[i % 5], antwoorden[(i * 2) % 5], toelichting];
      }),
    ],
  },
  { naam: 'Leeg', rijen: [] },
];

test('xlsx lezen: bestand van openpyxl (tekst in de cel, datums, formules, lege plekken, compressie)', async () => {
  const bestand = fixture('openpyxl-voorbeeld.xlsx');
  assert.ok(alsTekst((await B.leesZip(bestand)).get('xl/worksheets/sheet1.xml')).includes('t="inlineStr"'));
  assert.deepEqual(await B.leesXlsx(bestand), { bladen: VERWACHT_VOORBEELD });
  assert.deepEqual(await B.leesXlsx(bestand.buffer.slice(bestand.byteOffset, bestand.byteOffset + bestand.byteLength)), { bladen: VERWACHT_VOORBEELD });
});

test('xlsx lezen: hetzelfde bestand opgeslagen door LibreOffice (gedeelde teksten, berekende formules)', async () => {
  const bestand = fixture('libreoffice-voorbeeld.xlsx');
  const zip = await B.leesZip(bestand);
  assert.ok(zip.has('xl/sharedStrings.xml'));
  assert.ok(alsTekst(zip.get('xl/worksheets/sheet1.xml')).includes('<f aca="false">B2*2</f><v>68</v>'));
  assert.deepEqual(await B.leesXlsx(bestand), { bladen: VERWACHT_VOORBEELD });
});

/** Bouwt met de hand een werkmap, om precies te bepalen wat erin staat. */
function werkmap({ bladen, teksten = '', stijlen = '', eigenschappen = '' }) {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const tabs = bladen.map((b, i) => `<sheet name="${b.naam}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const relaties = bladen.map((b, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/${b.soort || 'worksheet'}" Target="${b.doel}"/>`).join('');
  return B.maakZip([
    { naam: '_rels/.rels', inhoud: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { naam: 'xl/workbook.xml', inhoud: `${XML}<workbook xmlns="${ns}" xmlns:r="${rel}">${eigenschappen}<sheets>${tabs}</sheets></workbook>` },
    { naam: 'xl/_rels/workbook.xml.rels', inhoud: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relaties}</Relationships>` },
    { naam: 'xl/sharedStrings.xml', inhoud: `${XML}<sst xmlns="${ns}">${teksten}</sst>` },
    { naam: 'xl/styles.xml', inhoud: `${XML}<styleSheet xmlns="${ns}">${stijlen}</styleSheet>` },
    ...bladen.filter((b) => b.xml !== undefined).map((b) => ({ naam: b.pad, inhoud: `${XML}${b.xml}` })),
  ]);
}
const blad = (rijen) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rijen}</sheetData></worksheet>`;

test('xlsx lezen: datums en tijden volgens de notatie van de cel', async () => {
  const stijlen =
    '<numFmts count="8"><numFmt numFmtId="164" formatCode="dd-mm-yyyy"/><numFmt numFmtId="165" formatCode="[h]:mm"/>' +
    '<numFmt numFmtId="166" formatCode="&quot;€&quot; #,##0.00"/><numFmt numFmtId="167" formatCode="d mmm yyyy &quot;om&quot; hh:mm"/>' +
    '<numFmt numFmtId="168" formatCode="mm:ss"/><numFmt numFmtId="169" formatCode="0.0 &quot;dagen&quot;"/>' +
    '<numFmt numFmtId="170" formatCode="[Red]0.00;[Blue]-0.00"/><numFmt numFmtId="171" formatCode="yyyy\\-mm\\-dd;@"/></numFmts>' +
    '<cellStyleXfs count="1"><xf numFmtId="14"/></cellStyleXfs>' + // telt niet mee: alleen cellXfs bepaalt de stijl van een cel
    `<cellXfs count="13">${[0, 14, 164, 22, 165, 166, 167, 20, 168, 169, 170, 171, 9].map((id) => `<xf numFmtId="${id}"/>`).join('')}</cellXfs>`;
  const cel = (ref, stijl, waarde, soort = '') => `<c r="${ref}" s="${stijl}"${soort}><v>${waarde}</v></c>`;
  const rij1 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s, i) => {
    const waarde = { 4: 1.5, 7: 0.5, 8: 0.0006944444444, 12: 0.5 }[s] ?? 45000.75;
    return cel(`${String.fromCharCode(65 + i)}1`, s, waarde);
  });
  const rij2 = [cel('A2', 1, 1), cel('B2', 1, 59), cel('C2', 1, 61), cel('D2', 1, 2958465), cel('E2', 1, -1),
    cel('F2', 0, '2024-02-29T13:45:00Z', ' t="d"'), cel('G2', 0, '2024-02-29', ' t="d"'), cel('H2', 3, 45000), cel('I2', 7, 45000.25)];
  const bestand = werkmap({ stijlen, bladen: [{ naam: 'Datums', doel: 'worksheets/sheet1.xml', pad: 'xl/worksheets/sheet1.xml', xml: blad(`<row r="1">${rij1.join('')}</row><row r="2">${rij2.join('')}</row>`) }] });
  const { bladen } = await B.leesXlsx(bestand);
  assert.deepEqual(bladen[0].rijen[0], [
    45000.75, // standaardnotatie: gewoon getal
    '2023-03-15', // ingebouwde datumnotatie (14)
    '2023-03-15', // eigen notatie dd-mm-yyyy
    '2023-03-15 18:00', // ingebouwd: datum met tijd (22)
    '36:00', // duur [h]:mm
    45000.75, // bedrag in euro's blijft een getal
    '2023-03-15 18:00', // d mmm yyyy "om" hh:mm
    '12:00', // alleen tijd (20)
    '00:01', // mm:ss
    45000.75, // "dagen" tussen aanhalingstekens is geen datum
    45000.75, // kleur tussen blokhaken is geen datum
    '2023-03-15', // yyyy\-mm\-dd
    0.5, // percentage
  ]);
  assert.deepEqual(bladen[0].rijen[1].slice(0, 9), ['1900-01-01', '1900-02-28', '1900-03-01', '9999-12-31', -1, '2024-02-29 13:45', '2024-02-29', '2023-03-15 00:00', '2023-03-15 06:00']);

  // Werkmap met het datumstelsel van 1904 (oude Mac-bestanden).
  const mac = werkmap({ stijlen, eigenschappen: '<workbookPr date1904="1"/>', bladen: [{ naam: 'Mac', doel: 'worksheets/sheet1.xml', pad: 'xl/worksheets/sheet1.xml', xml: blad(`<row r="1">${cel('A1', 1, 0)}${cel('B1', 1, 43538)}${cel('C1', 3, 43538.75)}</row>`) }] });
  assert.deepEqual((await B.leesXlsx(mac)).bladen[0].rijen, [['1904-01-01', '2023-03-15', '2023-03-15 18:00']]);
});

test('xlsx lezen: soorten cellen, tekst met opmaak, volgorde van de bladen en andere schrijfwijzen', async () => {
  const teksten =
    '<si><t>gewoon</t></si>' +
    '<si><r><rPr><b/></rPr><t>vet </t></r><r><t xml:space="preserve">en gewoon</t></r><rPh sb="0" eb="1"><t>UITSPRAAK</t></rPh><phoneticPr fontId="1"/></si>' +
    '<si><t>regel 1_x000D_\nregel 2</t></si><si><t/></si><si><t>&lt;a&gt; &amp; &#233;&#x1F642; &quot;x&quot;</t></si><si><t><![CDATA[<ruw> & zo]]></t></si>';
  const eerste = blad(
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c>' +
      '<c r="E1" t="s"><v>4</v></c><c r="F1" t="inlineStr"><is><t>in de cel</t></is></c><c r="G1" t="str"><f>A1&amp;"!"</f><v>gewoon!</v></c>' +
      '<c r="H1" t="e"><f>1/0</f><v>#DIV/0!</v></c><c r="I1" t="b"><v>1</v></c><c r="J1" t="b"><v>0</v></c><c r="K1"><f>SUM(1,2)</f><v>3</v></c>' +
      '<c r="L1" t="s"><v>5</v></c><c r="M1" t="n"><v> 7.5 </v></c><c r="N1" t="s"><v>99</v></c><c r="O1" s="0"/><c r="P1"><f>A1</f></c></row>' +
      // Rij en cellen zonder verwijzing: ze volgen op de vorige.
      '<row><c t="inlineStr"><is><r><t>a</t></r><r><t>b</t></r></is></c><c><v>2</v></c></row>' +
      // Alleen opmaak, helemaal onderaan en rechts: telt niet mee en geeft geen foutmelding.
      '<row r="1048576"><c r="XFD1048576" s="0"/></row>',
  );
  const metVoorvoegsel =
    '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r="2">' +
    "<x:c r='B2' t='inlineStr'><x:is><x:t>met voorvoegsel</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>";
  const bestand = werkmap({
    teksten,
    bladen: [
      { naam: 'Tweede bestand eerst', doel: 'worksheets/sheet2.xml', pad: 'xl/worksheets/sheet2.xml', xml: metVoorvoegsel },
      { naam: 'Grafiek', soort: 'chartsheet', doel: 'chartsheets/sheet1.xml', pad: 'xl/chartsheets/sheet1.xml', xml: '<chartsheet/>' },
      { naam: 'Soorten &amp; zo', doel: '/xl/worksheets/sheet1.xml', pad: 'xl/worksheets/sheet1.xml', xml: eerste },
      { naam: 'Ontbreekt', doel: 'worksheets/sheet9.xml' },
    ],
  });
  const { bladen } = await B.leesXlsx(bestand);
  assert.deepEqual(bladen.map((b) => b.naam), ['Tweede bestand eerst', 'Soorten & zo']);
  assert.deepEqual(bladen[0].rijen, [[null, null], [null, 'met voorvoegsel']]);
  // N1 (verwijst naar een tekst die niet bestaat), O1 (alleen opmaak) en P1 (formule zonder uitkomst) zijn leeg.
  // Lege kolommen achteraan vervallen, dus het blad is 13 kolommen breed (A t/m M) en niet 16.
  assert.deepEqual(bladen[1].rijen, [
    ['gewoon', 'vet en gewoon', 'regel 1\nregel 2', null, '<a> & é🙂 "x"', 'in de cel', 'gewoon!', null, true, false, 3, '<ruw> & zo', 7.5],
    ['ab', 2, ...Array(11).fill(null)],
  ]);
  // Dezelfde lege cellen midden in een rij blijven een lege plek (null).
  const midden = werkmap({
    teksten,
    bladen: [{ naam: 'Midden', doel: 'worksheets/sheet1.xml', pad: 'xl/worksheets/sheet1.xml', xml: blad('<row r="1"><c r="A1" t="s"><v>99</v></c><c r="B1" s="0"/><c r="C1"><f>A1</f></c><c r="D1"><v>4</v></c><c r="E1" s="0"/></row>') }],
  });
  assert.deepEqual((await B.leesXlsx(midden)).bladen[0].rijen, [[null, null, null, 4]]);
});

test('xlsx lezen: foutmeldingen in het Nederlands', async () => {
  await assert.rejects(B.leesXlsx(bytes('Naam;Score\r\nJan;3,5\r\n')), /geen geldig Excel-bestand \(\.xlsx\)/);
  await assert.rejects(B.leesXlsx(new Uint8Array(0)), /geen geldig Excel-bestand/);
  // Oud .xls-bestand (en ook een .xlsx met wachtwoord) begint met deze bytes.
  const xls = new Uint8Array(2048);
  xls.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  await assert.rejects(B.leesXlsx(xls), /oud Excel-bestand \(\.xls\).*Excel-werkmap \(\.xlsx\)/);
  // Een ander zip-bestand (hier een Word-document) is geen Excel-bestand.
  await assert.rejects(B.leesXlsx(B.maakDocx({ markdown: 'tekst' })), /geen geldig Excel-bestand/);
  await assert.rejects(B.leesXlsx(B.maakZip([{ naam: 'xl/workbook.xml', inhoud: '<workbook><sheets/></workbook>' }])), /geen geldig Excel-bestand/);
  await assert.rejects(B.leesXlsx(B.maakXlsx([{ naam: 'x', rijen: [['a']] }]).subarray(0, 300)), /geen geldig zip-bestand/);
  await assert.rejects(() => B.leesXlsx('tekst'), TypeError);
});

test('xlsx lezen: te grote bladen worden geweigerd', async () => {
  const kolom = (aantal) => B.maakXlsx([{ naam: 'Groot blad', rijen: Array.from({ length: aantal }, (x, i) => [i]) }]);
  await assert.rejects(B.leesXlsx(kolom(20001)), /Het blad "Groot blad" heeft te veel rijen \(meer dan 20000\)/);
  assert.equal((await B.leesXlsx(kolom(20000))).bladen[0].rijen.length, 20000);
  const rij = (aantal) => B.maakXlsx([{ naam: 'Breed', rijen: [Array.from({ length: aantal }, (x, i) => i)] }]);
  await assert.rejects(B.leesXlsx(rij(301)), /te veel kolommen \(meer dan 300\)/);
  assert.equal((await B.leesXlsx(rij(300))).bladen[0].rijen[0].length, 300);
});

// ---------- CSV ----------

test('csv: bestand zoals de Nederlandse Excel het opslaat (puntkomma, windows-1252, aanhalingstekens)', () => {
  assert.deepEqual(B.leesCsv(fixture('excel-nl.csv')), [
    ['Naam', 'Afdeling', 'Score', 'Opmerking'],
    ['Zoë de Vries', 'Financiën', '3,5', 'Goed; maar druk'],
    ['José', 'Café "De Tijd"', '4', 'Zegt: "prima"'],
    ['Ömer', 'ICT', '', 'regel 1\nregel 2'],
    ['€ 5,00', '‘enkel’ – streepje', '-1,25', 'laatste'],
  ]);
});

test('csv: tekensets (UTF-8 met en zonder BOM, UTF-16, windows-1252)', () => {
  const verwacht = [['naam', 'plaats'], ['Zoë', 'Curaçao €']];
  assert.deepEqual(B.leesCsv(bytes('naam,plaats\nZoë,Curaçao €\n')), verwacht);
  assert.deepEqual(B.leesCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('naam,plaats\nZoë,Curaçao €\n')])), verwacht);
  assert.deepEqual(B.leesCsv('\ufeffnaam,plaats\nZoë,Curaçao €'), verwacht);
  // Excel "Unicode-tekst": UTF-16 met BOM en tabs.
  const utf16 = new Uint8Array([0xff, 0xfe, ...Buffer.from('naam\tplaats\r\nZoë\tCuraçao €\r\n', 'utf16le')]);
  assert.deepEqual(B.leesCsv(utf16), verwacht);
  // windows-1252: é = E9, € = 80; dat is geen geldige UTF-8.
  const w1252 = new Uint8Array([...Buffer.from('naam;plaats\r\nZo', 'latin1'), 0xeb, ...Buffer.from(';Cura', 'latin1'), 0xe7, ...Buffer.from('ao ', 'latin1'), 0x80, 0x0d, 0x0a]);
  assert.deepEqual(B.leesCsv(w1252), verwacht);
  assert.deepEqual(B.leesCsv(w1252.buffer), verwacht, 'ook een ArrayBuffer');
});

test('csv: scheidingsteken wordt herkend (puntkomma, komma, tab)', () => {
  assert.deepEqual(B.leesCsv('a;b;c\n1;2;3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(B.leesCsv('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(B.leesCsv('a\tb\tc\n1\t2\t3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  // Decimale komma's in een bestand met puntkomma's.
  assert.deepEqual(B.leesCsv('naam;score;cijfer\nJan;3,5;7,25\nPiet;4,5;8,5'), [['naam', 'score', 'cijfer'], ['Jan', '3,5', '7,25'], ['Piet', '4,5', '8,5']]);
  // Vrije tekst met veel komma's in een bestand met puntkomma's, en andersom.
  assert.deepEqual(B.leesCsv('naam;opmerking\nJan;goed, maar druk, veel werk, weinig tijd\nPiet;prima'), [['naam', 'opmerking'], ['Jan', 'goed, maar druk, veel werk, weinig tijd'], ['Piet', 'prima']]);
  assert.deepEqual(B.leesCsv('naam,opmerking\nJan,"a; b; c; d"\nPiet,x'), [['naam', 'opmerking'], ['Jan', 'a; b; c; d'], ['Piet', 'x']]);
  // Scheidingstekens tussen aanhalingstekens tellen niet mee bij het herkennen.
  assert.deepEqual(B.leesCsv('"a,b,c,d";x\n"e,f,g,h";y'), [['a,b,c,d', 'x'], ['e,f,g,h', 'y']]);
  // Eén kolom, en de aanwijzing die Excel begrijpt (sep=).
  assert.deepEqual(B.leesCsv('naam\nJan\nPiet\n'), [['naam'], ['Jan'], ['Piet']]);
  assert.deepEqual(B.leesCsv('sep=|\r\na|b;c\r\n1|2,5\r\n'), [['a', 'b;c'], ['1', '2,5']]);
  assert.deepEqual(B.leesCsv('sep=;\na;b,c'), [['a', 'b,c']]);
});

test('csv: aanhalingstekens, regeleinden en lege regels', () => {
  assert.deepEqual(B.leesCsv('a;b\r\n1;2\r\n'), [['a', 'b'], ['1', '2']], 'CRLF');
  assert.deepEqual(B.leesCsv('a;b\n1;2\n'), [['a', 'b'], ['1', '2']], 'LF');
  assert.deepEqual(B.leesCsv('a;b\r1;2\r'), [['a', 'b'], ['1', '2']], 'CR (oude Mac)');
  assert.deepEqual(B.leesCsv('a;b\r\n1;2'), [['a', 'b'], ['1', '2']], 'zonder regeleinde aan het eind');
  assert.deepEqual(B.leesCsv('a;b\n1;2\n\n\r\n'), [['a', 'b'], ['1', '2']], 'lege regels achteraan vervallen');
  assert.deepEqual(B.leesCsv('a;b\n\n1;2\n'), [['a', 'b'], [''], ['1', '2']], 'een lege regel middenin blijft');
  assert.deepEqual(B.leesCsv('"a ""b"" c";"regel 1\r\nregel 2";"x;y";""\n'), [['a "b" c', 'regel 1\r\nregel 2', 'x;y', '']]);
  assert.deepEqual(B.leesCsv('5" pijp;maat "L"\n1;2'), [['5" pijp', 'maat "L"'], ['1', '2']], 'aanhalingsteken midden in een cel is gewone tekst');
  assert.deepEqual(B.leesCsv('a;b;\n1;;\n'), [['a', 'b', ''], ['1', '', '']], 'lege cellen aan het eind blijven');
  assert.deepEqual(B.leesCsv(' a ; b \n'), [[' a ', ' b ']], 'spaties blijven staan');
  assert.deepEqual(B.leesCsv(''), []);
  assert.deepEqual(B.leesCsv(new Uint8Array(0)), []);
  assert.deepEqual(B.leesCsv('\n\n'), []);
  // Een regel met alleen "" is geen lege regel: het is een rij met één (lege) cel, ook achteraan.
  assert.deepEqual(B.leesCsv('""'), [['']]);
  assert.deepEqual(B.leesCsv('a\n""\n\n'), [['a'], ['']]);
  assert.deepEqual(B.leesCsv('a\n\n""\n'), [['a'], [''], ['']]);
  assert.deepEqual(B.leesCsv('a;b\n;\n\n'), [['a', 'b'], ['', '']], 'een regel met alleen een scheidingsteken blijft');
  for (const rij of B.leesCsv('a;1\nb;2')) for (const celwaarde of rij) assert.equal(typeof celwaarde, 'string');
});

// ---------- Word ----------

const ontXml = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** Haalt de alinea's uit document.xml: stijl, lijstnummering, inspringing en de stukjes tekst met opmaak. */
function alineas(xml) {
  return [...xml.matchAll(/<w:p>(.*?)<\/w:p>/gs)].map(([, binnen]) => {
    const stukjes = [...binnen.matchAll(/<w:r>(.*?)<\/w:r>/gs)].map(([, r]) => ({
      tekst: ontXml(r.replace(/<w:rPr>.*?<\/w:rPr>/s, '').replace(/<w:br\/>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '')),
      vet: r.includes('<w:b/>'),
      cursief: r.includes('<w:i/>'),
    }));
    return {
      stijl: /<w:pStyle w:val="([^"]+)"/.exec(binnen)?.[1] ?? null,
      lijst: Number(/<w:numId w:val="(\d+)"/.exec(binnen)?.[1] ?? 0) || null,
      links: Number(/<w:ind w:left="(\d+)"/.exec(binnen)?.[1] ?? 0),
      tekst: stukjes.map((s) => s.tekst).join(''),
      stukjes: stukjes.filter((s) => s.tekst !== '\n'),
    };
  });
}

const MARKDOWN = [
  '# Hoofdstuk één: resultaten',
  '',
  'Dit is een **vette** en *cursieve* tekst met **vet met *allebei* erin** en een \\*sterretje\\*.',
  'Tweede regel van dezelfde alinea <met> & "tekens".',
  '',
  '## Bevindingen',
  '',
  '- eerste punt',
  '- tweede punt met **vet**',
  '  vervolgregel van het tweede punt',
  '* derde punt',
  '+ vierde punt',
  '',
  '### Aanbevelingen',
  '',
  '1. Eerst dit',
  '2. Dan dat',
  '',
  'Tussentekst.',
  '',
  '5. Vijfde',
  '6) Zesde',
  '',
  '> Een citaat van een *medewerker*.',
  '> Tweede regel van het citaat.',
  '>',
  '> > Genest citaat',
  '> - punt in een citaat',
  '',
  '#### Geen kop (vier hekjes)',
  '',
  'Slot met 2 * 3 = 6 en een losse * ster.\tNa een tab.',
].join('\r\n');

test('docx: geldig zip-bestand met alle onderdelen', async () => {
  const docx = B.maakDocx({ titel: 'Rapport “Werkbeleving” & meer', markdown: MARKDOWN, voettekst: 'Vertrouwelijk <concept>\nregel 2' });
  assert.ok(docx instanceof Uint8Array);
  const zip = await B.leesZip(docx);
  assert.deepEqual([...zip.keys()], ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels',
    'word/styles.xml', 'word/numbering.xml', 'word/settings.xml', 'word/footer1.xml']);
  for (const [naam, inhoud] of zip) {
    controleerXml(alsTekst(inhoud), naam);
    assert.ok(alsTekst(inhoud).startsWith('<?xml version="1.0" encoding="UTF-8"'), naam);
  }
  const typen = alsTekst(zip.get('[Content_Types].xml'));
  assert.ok(typen.includes('<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'));
  for (const deel of ['styles', 'numbering', 'settings', 'footer']) {
    assert.ok(typen.includes(`ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${deel}+xml"`), deel);
  }
  assert.match(alsTekst(zip.get('_rels/.rels')), /officeDocument" Target="word\/document.xml"/);
  const relaties = alsTekst(zip.get('word/_rels/document.xml.rels'));
  assert.match(relaties, /Id="rId1" [^>]*\/styles" Target="styles.xml"/);
  assert.match(relaties, /Id="rId2" [^>]*\/numbering" Target="numbering.xml"/);
  assert.match(relaties, /Id="rId4" [^>]*\/footer" Target="footer1.xml"/);

  const document = alsTekst(zip.get('word/document.xml'));
  assert.match(document, /<w:footerReference w:type="default" r:id="rId4"\/><w:pgSz w:w="11906" w:h="16838"\/>/, 'A4 met voettekst');
  assert.ok(document.endsWith('</w:sectPr></w:body></w:document>'));
  const stijlen = alsTekst(zip.get('word/styles.xml'));
  assert.match(stijlen, /<w:lang w:val="nl-NL"/);
  for (const n of [1, 2, 3]) {
    assert.ok(stijlen.includes(`<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/>`), `kop ${n}`);
    assert.ok(stijlen.includes(`<w:outlineLvl w:val="${n - 1}"/>`), `niveau van kop ${n} voor het navigatievenster`);
  }
  for (const id of ['Normal', 'Title', 'Quote', 'ListParagraph', 'Footer']) assert.ok(stijlen.includes(`w:styleId="${id}"`), id);
  assert.match(alsTekst(zip.get('word/settings.xml')), /compatibilityMode" w:uri="http:\/\/schemas.microsoft.com\/office\/word" w:val="15"/);
  assert.equal(alineas(alsTekst(zip.get('word/footer1.xml')))[0].tekst, 'Vertrouwelijk <concept>\nregel 2');
  assert.deepEqual(B.maakDocx({ titel: 'T', markdown: MARKDOWN }), B.maakDocx({ titel: 'T', markdown: MARKDOWN }), 'dezelfde invoer geeft hetzelfde bestand');
});

test('docx: koppen, vet, cursief, lijsten en citaten uit de opmaak van de schrijfomgeving', async () => {
  const zip = await B.leesZip(B.maakDocx({ titel: 'Rapport “Werkbeleving” & meer', markdown: MARKDOWN }));
  const p = alineas(alsTekst(zip.get('word/document.xml')));
  assert.deepEqual(p.map((a) => [a.stijl, a.lijst, a.tekst]), [
    ['Title', null, 'Rapport “Werkbeleving” & meer'],
    ['Heading1', null, 'Hoofdstuk één: resultaten'],
    [null, null, 'Dit is een vette en cursieve tekst met vet met allebei erin en een *sterretje*.\nTweede regel van dezelfde alinea <met> & "tekens".'],
    ['Heading2', null, 'Bevindingen'],
    ['ListParagraph', 1, 'eerste punt'],
    ['ListParagraph', 1, 'tweede punt met vet\nvervolgregel van het tweede punt'],
    ['ListParagraph', 1, 'derde punt'],
    ['ListParagraph', 1, 'vierde punt'],
    ['Heading3', null, 'Aanbevelingen'],
    ['ListParagraph', 2, 'Eerst dit'],
    ['ListParagraph', 2, 'Dan dat'],
    [null, null, 'Tussentekst.'],
    ['ListParagraph', 3, 'Vijfde'],
    ['ListParagraph', 3, 'Zesde'],
    ['Quote', null, 'Een citaat van een medewerker.\nTweede regel van het citaat.'],
    ['Quote', null, 'Genest citaat'],
    ['ListParagraph', 1, 'punt in een citaat'],
    [null, null, '#### Geen kop (vier hekjes)'],
    [null, null, 'Slot met 2 * 3 = 6 en een losse * ster.\tNa een tab.'],
  ]);
  assert.deepEqual(p[2].stukjes.filter((s) => s.vet || s.cursief), [
    { tekst: 'vette', vet: true, cursief: false },
    { tekst: 'cursieve', vet: false, cursief: true },
    { tekst: 'vet met ', vet: true, cursief: false },
    { tekst: 'allebei', vet: true, cursief: true },
    { tekst: ' erin', vet: true, cursief: false },
  ]);
  assert.deepEqual(p[5].stukjes.find((s) => s.vet), { tekst: 'vet', vet: true, cursief: false });
  assert.deepEqual(p[14].stukjes.find((s) => s.cursief), { tekst: 'medewerker', vet: false, cursief: true });
  assert.ok(p[15].links > 0 && p[16].links > p[15].links - 1, 'genest citaat en lijst in een citaat springen in');
  assert.ok(!p[1].stukjes.some((s) => s.vet), 'vet van een kop komt uit de stijl, niet uit de tekst');

  // Elke genummerde lijst heeft een eigen nummering met het juiste beginnummer; opsommingen delen nummer 1.
  const nummering = alsTekst(zip.get('word/numbering.xml'));
  assert.match(nummering, /<w:num w:numId="1"><w:abstractNumId w:val="0"\/><\/w:num>/);
  assert.match(nummering, /<w:numFmt w:val="bullet"\/><w:lvlText w:val="•"\/>/);
  assert.match(nummering, /<w:num w:numId="2"><w:abstractNumId w:val="1"\/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"\/>/);
  assert.match(nummering, /<w:num w:numId="3"><w:abstractNumId w:val="1"\/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"\/>/);
});

test('docx: randgevallen (leeg, alleen tekst, tekens die niet in XML mogen, opmaak die niet sluit)', async () => {
  const document = async (invoer) => alsTekst((await B.leesZip(B.maakDocx(invoer))).get('word/document.xml'));
  const leeg = await B.leesZip(B.maakDocx({ markdown: '' }));
  assert.ok(!leeg.has('word/footer1.xml'));
  assert.ok(alsTekst(leeg.get('word/document.xml')).includes('<w:body><w:p/><w:sectPr><w:pgSz'), 'leeg document heeft één lege alinea en geen voettekst');
  assert.ok((await B.leesZip(B.maakDocx())).has('word/document.xml'), 'ook zonder invoer');

  const p = alineas(await document({ markdown: 'Los **begin zonder eind en *ook zo\n\n\\# geen kop\n\n\\> geen citaat\n\n#geen kop\n\n-geen lijst\n\n**vet**\u0001\u0008 <w:t>&amp;</w:t> \ud83d' }));
  assert.deepEqual(p.map((a) => [a.stijl, a.tekst]), [
    [null, 'Los **begin zonder eind en *ook zo'],
    [null, '# geen kop'],
    [null, '> geen citaat'],
    [null, '#geen kop'],
    [null, '-geen lijst'],
    [null, 'vet <w:t>&amp;</w:t> '],
  ]);
  controleerXml(await document({ titel: '<&">\u0000', markdown: '# <&">\n\n> <&"> \u000b\n\n- <&">', voettekst: '<&">' }), 'document.xml');
  // Koppen met afsluitende hekjes en opmaak; een titel wordt letterlijk overgenomen.
  const q = alineas(await document({ titel: '**geen** opmaak', markdown: '## Kop met *nadruk* ##\n### Derde\ntekst direct eronder' }));
  assert.deepEqual(q.map((a) => [a.stijl, a.tekst]), [['Title', '**geen** opmaak'], ['Heading2', 'Kop met nadruk'], ['Heading3', 'Derde'], [null, 'tekst direct eronder']]);
});

// ---------- Word: blokken en tabellen voor rapporten ----------

/** Haalt de tabellen uit document.xml: de opmaak, het raster met kolombreedtes en per rij de cellen. */
function tabellen(xml) {
  return [...xml.matchAll(/<w:tbl>(.*?)<\/w:tbl>/gs)].map(([, binnen]) => ({
    opmaak: /<w:tblPr>(.*?)<\/w:tblPr>/s.exec(binnen)[1],
    raster: [...binnen.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1])),
    rijen: [...binnen.matchAll(/<w:tr>(.*?)<\/w:tr>/gs)].map(([, rij]) => ({
      herhaald: /<w:trPr>(?:<w:cantSplit\/>)?<w:tblHeader\/><\/w:trPr>/.test(rij),
      cellen: [...rij.matchAll(/<w:tc>(.*?)<\/w:tc>/gs)].map(([, cel]) => {
        const p = alineas(cel);
        assert.equal(p.length, 1, 'elke cel bevat precies één alinea');
        return {
          tekst: p[0].tekst,
          stijl: p[0].stijl,
          vet: p[0].stukjes.length > 0 && p[0].stukjes.every((s) => s.vet),
          rechts: cel.includes('<w:jc w:val="right"/>'),
          breedte: Number(/<w:tcPr><w:tcW w:w="(\d+)" w:type="dxa"\/><\/w:tcPr>/.exec(cel)[1]),
        };
      }),
    })),
  }));
}

/** document.xml van een document dat uit blokken is gemaakt. */
const documentVan = async (invoer) => alsTekst((await B.leesZip(B.maakDocx(invoer))).get('word/document.xml'));
/** De alinea's buiten de tabellen; op de plek van een tabel staat [tabel]. */
const zonderTabellen = (xml) => alineas(xml.replace(/<w:tbl>.*?<\/w:tbl>/gs, '<w:p><w:r><w:t>[tabel]</w:t></w:r></w:p>'));

const TABEL = {
  soort: 'tabel',
  kop: ['Vraag', 'N', 'Gemiddelde', 'Aandeel', 'Opmerking'],
  rijen: [
    ['Ik kan mijn werk goed aan', 42, 3.75, '45%', 'Prima <b> & "zo"'],
    ['Ik voel me **gewaardeerd**', 7, -0.5, '–', 12],
    ['Totaal', 1250, 4, '100,0%', ''],
  ],
};

test('docx: blokken in plaats van Markdown (koppen, alinea, lijsten, citaat, pagina-einde en tabel)', async () => {
  const blokken = [
    { soort: 'kop', niveau: 1, tekst: 'Resultaten <2026> & meer' },
    { soort: 'alinea', tekst: 'Een **vette** en *cursieve* tekst.\r\nTweede regel met 2 * 3 = 6.' },
    { soort: 'kop', niveau: 2, tekst: 'Bevindingen' },
    { soort: 'lijst', items: ['eerste', 'tweede met **vet**', 'derde\nvervolg'] },
    { soort: 'lijst', genummerd: true, items: ['een', 'twee'] },
    { soort: 'lijst', genummerd: true, items: ['opnieuw vanaf één'] },
    { soort: 'lijst', items: [] },
    { soort: 'citaat', tekst: 'Een *citaat* van een medewerker.\nTweede regel.' },
    { soort: 'paginaeinde' },
    { soort: 'kop', niveau: 3, tekst: 'Bijlage: cijfers' },
    TABEL,
    { soort: 'alinea', tekst: '# geen kop, - geen lijst en > geen citaat: een alinea blijft een alinea' },
  ];
  const invoer = { titel: 'Tussenrapport', blokken, markdown: '# Dit wordt niet gebruikt', voettekst: 'Vertrouwelijk' };
  const docx = B.maakDocx(invoer);
  assert.deepEqual(B.maakDocx(invoer), docx, 'dezelfde invoer geeft hetzelfde bestand');
  const zip = await B.leesZip(docx);
  for (const [naam, inhoud] of zip) controleerXml(alsTekst(inhoud), naam);
  const document = alsTekst(zip.get('word/document.xml'));
  assert.ok(!document.includes('Dit wordt niet gebruikt'), 'met blokken wordt markdown overgeslagen');

  const p = zonderTabellen(document);
  assert.deepEqual(p.map((a) => [a.stijl, a.lijst, a.tekst]), [
    ['Title', null, 'Tussenrapport'],
    ['Heading1', null, 'Resultaten <2026> & meer'],
    [null, null, 'Een vette en cursieve tekst.\nTweede regel met 2 * 3 = 6.'],
    ['Heading2', null, 'Bevindingen'],
    ['ListParagraph', 1, 'eerste'],
    ['ListParagraph', 1, 'tweede met vet'],
    ['ListParagraph', 1, 'derde\nvervolg'],
    ['ListParagraph', 2, 'een'],
    ['ListParagraph', 2, 'twee'],
    ['ListParagraph', 3, 'opnieuw vanaf één'],
    ['Quote', null, 'Een citaat van een medewerker.\nTweede regel.'],
    [null, null, ''], // het pagina-einde
    ['Heading3', null, 'Bijlage: cijfers'],
    [null, null, '[tabel]'],
    [null, null, ''], // smalle lege regel na de tabel
    [null, null, '# geen kop, - geen lijst en > geen citaat: een alinea blijft een alinea'],
  ]);
  assert.deepEqual(p[2].stukjes.filter((s) => s.vet || s.cursief), [{ tekst: 'vette', vet: true, cursief: false }, { tekst: 'cursieve', vet: false, cursief: true }]);
  assert.deepEqual(p[5].stukjes.find((s) => s.vet), { tekst: 'vet', vet: true, cursief: false });
  assert.deepEqual(p[10].stukjes.find((s) => s.cursief), { tekst: 'citaat', vet: false, cursief: true });
  // Het pagina-einde staat precies één keer in het document, tussen het citaat en de volgende kop.
  assert.equal(document.split('<w:br w:type="page"/>').length - 1, 1);
  assert.match(document, /Tweede regel\.<\/w:t><\/w:r><\/w:p><w:p>(?:<w:pPr><w:spacing [^>]*\/><\/w:pPr>)?<w:r><w:br w:type="page"\/><\/w:r><\/w:p><w:p><w:pPr><w:pStyle w:val="Heading3"\/>/);
  // Elke genummerde lijst begint opnieuw bij 1; een lege lijst geeft niets (ook geen nummering).
  const nummering = alsTekst(zip.get('word/numbering.xml'));
  assert.equal((nummering.match(/<w:startOverride w:val="1"\/>/g) || []).length, 2);
  assert.ok(!nummering.includes('<w:num w:numId="4">'));
  assert.equal(alineas(alsTekst(zip.get('word/footer1.xml')))[0].tekst, 'Vertrouwelijk');

  // Zonder blokken (of met iets anders dan een lijst) geldt de markdown; een lege lijst blokken geeft een leeg document.
  for (const geen of [undefined, null, 'tekst']) {
    assert.deepEqual(alineas(await documentVan({ blokken: geen, markdown: '# Kop' })).map((a) => [a.stijl, a.tekst]), [['Heading1', 'Kop']]);
  }
  assert.ok((await documentVan({ blokken: [], markdown: '# Kop' })).includes('<w:body><w:p/><w:sectPr>'));
  // Niveaus buiten 1 t/m 3 worden het dichtstbijzijnde niveau; een kop is altijd één regel.
  const koppen = alineas(await documentVan({ blokken: [{ soort: 'kop', niveau: 0, tekst: 'a' }, { soort: 'kop', niveau: 7, tekst: 'b\nc' }, { soort: 'kop', tekst: ' d ' }, { soort: 'kop', niveau: '2', tekst: 'e' }] }));
  assert.deepEqual(koppen.map((a) => [a.stijl, a.tekst]), [['Heading1', 'a'], ['Heading3', 'b c'], ['Heading1', 'd'], ['Heading2', 'e']]);
  // Een onbekend blok is een fout in het programma en wordt gemeld, met de plaats erbij.
  assert.throws(() => B.maakDocx({ blokken: [{ soort: 'alinea', tekst: 'x' }, { soort: 'plaatje' }] }), (fout) => fout instanceof TypeError && /Onbekend soort blok op plaats 2 van het document: "plaatje"/.test(fout.message));
  assert.throws(() => B.maakDocx({ blokken: [null] }), /Onbekend soort blok op plaats 1/);
});

test('docx: tabel met dunne randen, een vette kopregel die op elke pagina terugkomt en getallen rechts', async () => {
  const document = await documentVan({ blokken: [{ soort: 'alinea', tekst: 'Vooraf.' }, TABEL] });
  const [t, ...meer] = tabellen(document);
  assert.equal(meer.length, 0);

  // Dunne enkele lijn (sz is in achtste punten: 4 = een halve punt) rondom en tussen alle cellen.
  for (const kant of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
    const rand = new RegExp(`<w:${kant} w:val="single" w:sz="(\\d+)" w:space="0" w:color="[0-9A-F]{6}"/>`).exec(t.opmaak);
    assert.ok(rand, `rand ${kant}`);
    assert.ok(Number(rand[1]) >= 2 && Number(rand[1]) <= 6, `rand ${kant} is dun`);
  }
  // Zo breed als de tekst op de pagina (A4 min twee marges van 2,5 cm), met vaste kolombreedtes die samen kloppen.
  assert.match(t.opmaak, /^<w:tblW w:w="9072" w:type="dxa"\/><w:tblBorders>/);
  assert.match(t.opmaak, /<w:tblLayout w:type="fixed"\/>/);
  assert.equal(t.raster.length, 5);
  assert.equal(t.raster.reduce((a, b) => a + b, 0), 9072);
  assert.ok(t.raster[0] > t.raster[1] * 2, 'de kolom met lange tekst is breder dan die met korte getallen');
  for (const rij of t.rijen) assert.deepEqual(rij.cellen.map((c) => c.breedte), t.raster);

  // De kopregel: vet, en gemarkeerd als kop die Word bovenaan elke volgende pagina herhaalt. Alleen de eerste rij.
  assert.equal(t.rijen.length, 4);
  assert.deepEqual(t.rijen.map((r) => r.herhaald), [true, false, false, false]);
  assert.deepEqual(t.rijen[0].cellen.map((c) => c.tekst), TABEL.kop);
  assert.ok(t.rijen[0].cellen.every((c) => c.vet), 'kopregel is vet');
  assert.ok(t.rijen.slice(1).every((r) => r.cellen.every((c) => !c.vet)), 'de andere rijen niet');
  assert.ok(document.includes('<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr><w:tc>'));

  // Getallen krijgen een komma als decimaalteken; de tekst in een cel wordt letterlijk overgenomen (geen opmaak).
  assert.deepEqual(t.rijen.slice(1).map((r) => r.cellen.map((c) => c.tekst)), [
    ['Ik kan mijn werk goed aan', '42', '3,75', '45%', 'Prima <b> & "zo"'],
    ['Ik voel me **gewaardeerd**', '7', '-0,5', '–', '12'],
    ['Totaal', '1250', '4', '100,0%', ''],
  ]);
  // Rechts: elk getal (ook als tekst, zoals 45%), en van een kolom met alleen getallen ook de kop en een los streepje.
  assert.deepEqual(t.rijen.map((r) => r.cellen.map((c) => (c.rechts ? 'R' : 'L')).join('')), ['LRRRL', 'LRRRL', 'LRRRR', 'LRRRL']);
  assert.ok(t.rijen.every((r) => r.cellen.every((c) => c.stijl === 'TableText')), 'elke cel gebruikt de stijl voor tabeltekst');
  const stijlen = alsTekst((await B.leesZip(B.maakDocx({ blokken: [TABEL] }))).get('word/styles.xml'));
  assert.match(stijlen, /<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Tabeltekst"\/><w:basedOn w:val="Normal"\/>/);

  // Na een tabel komt altijd een alinea: aan het eind van het document en tussen twee tabellen (anders plakt Word ze aaneen).
  assert.match(document, /<\/w:tbl><w:p><w:pPr>.*?<\/w:pPr><\/w:p><w:sectPr>/);
  const twee = await documentVan({ blokken: [TABEL, TABEL] });
  assert.equal(tabellen(twee).length, 2);
  assert.ok(!twee.includes('</w:tbl><w:tbl>'));
  assert.deepEqual(zonderTabellen(twee).map((a) => a.tekst), ['[tabel]', '', '[tabel]', '']);
});

test('docx: tabellen, randgevallen (zonder kop, ongelijke rijen, breedtes, lege en te brede tabellen)', async () => {
  const tabel = async (blok) => tabellen(await documentVan({ blokken: [{ soort: 'tabel', ...blok }] }))[0];

  // Zonder kop is er geen herhaalde of vette rij. Te korte rijen worden aangevuld met lege cellen.
  const los = await tabel({ rijen: [['a', 'b', 'c'], ['d'], [], 'geen rij', [null, undefined, NaN, 0, -0]] });
  assert.equal(los.raster.length, 5);
  assert.ok(los.rijen.every((r) => !r.herhaald && r.cellen.length === 5 && r.cellen.every((c) => !c.vet)));
  assert.deepEqual(los.rijen.map((r) => r.cellen.map((c) => c.tekst)), [['a', 'b', 'c', '', ''], ['d', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '0', '0']]);
  // Een kop die breder is dan de rijen, en andersom; een kop zonder rijen geeft alleen de kopregel.
  assert.deepEqual((await tabel({ kop: ['a', 'b', 'c'], rijen: [[1]] })).rijen.map((r) => r.cellen.length), [3, 3]);
  assert.deepEqual((await tabel({ kop: ['a'], rijen: [[1, 2, 3]] })).rijen.map((r) => r.cellen.map((c) => c.tekst)), [['a', '', ''], ['1', '2', '3']]);
  assert.deepEqual((await tabel({ kop: ['alleen', 'kop'] })).rijen.map((r) => [r.herhaald, r.cellen.length]), [[true, 2]]);
  // Een tabel zonder kolommen wordt weggelaten.
  for (const leeg of [{}, { kop: [], rijen: [] }, { rijen: [[], []] }, { kop: 'geen lijst', rijen: 5 }]) {
    const xml = await documentVan({ blokken: [{ soort: 'alinea', tekst: 'voor' }, { soort: 'tabel', ...leeg }, { soort: 'alinea', tekst: 'na' }] });
    assert.ok(!xml.includes('<w:tbl>'));
    assert.deepEqual(alineas(xml).map((a) => a.tekst), ['voor', 'na']);
  }

  // Wat een getal is (en dus rechts staat): echte getallen, en tekst in Nederlandse of gewone schrijfwijze.
  const soorten = [12, -3.5, 1e21, '12', '-3,5', '+4', '−2', '1.250', '1.250,50', '3.14', '45%', '45 %', '€ 12,50', '€5', ' 7 ', '2‰',
    'A12', '12a', '2024-01', '12:30', '1,2,3', '1.25.000', '12 (34%)', 'n = 12', '-', '', '   ', 'ja', '€', '%', true];
  const getallen = (await tabel({ rijen: soorten.map((w) => ['x', w]) })).rijen.map((r) => r.cellen[1].rechts);
  assert.deepEqual(getallen, soorten.map((w, i) => i < 16), soorten.filter((w, i) => getallen[i] !== i < 16).join(' | '));
  // Een streepje staat alleen rechts in een kolom met verder alleen getallen; in een gemengde kolom staat de kop links.
  const gemengd = await tabel({ kop: ['Naam', 'Score', 'Gemengd', 'Leeg'], rijen: [['a', 1, 'tekst', ''], ['b', '-', '—', ''], ['c', '–', 5, '-']] });
  assert.deepEqual(gemengd.rijen.map((r) => r.cellen.map((c) => (c.rechts ? 'R' : 'L')).join('')), ['LRLL', 'LRLL', 'LRLL', 'LRRL']);

  // Regeleinden en tabs in een cel blijven; tekens die niet in XML mogen verdwijnen.
  const tekens = await documentVan({ blokken: [{ soort: 'tabel', kop: ['a\nb'], rijen: [['regel 1\r\nregel 2\tna tab'], ['stuur\u0000\u0008teken <&"> \ud83d']] }] });
  controleerXml(tekens, 'document.xml');
  assert.deepEqual(tabellen(tekens)[0].rijen.map((r) => r.cellen[0].tekst), ['a\nb', 'regel 1\nregel 2\tna tab', 'stuurteken <&"> ']);

  // Opgegeven breedtes zijn een verhouding; samen blijft het de breedte van de tekst.
  const breed = await tabel({ kop: ['a', 'b', 'c'], rijen: [['x', 'y', 'z']], breedtes: [3, 1, 2] });
  assert.deepEqual(breed.raster, [4536, 1512, 3024]);
  assert.deepEqual((await tabel({ kop: ['a', 'b'], rijen: [], breedtes: [50, 50] })).raster, [4536, 4536]);
  // Ontbrekende of ongeldige breedtes krijgen het gemiddelde van de wel opgegeven breedtes; zonder geldige breedte telt de inhoud.
  assert.deepEqual((await tabel({ kop: ['a', 'b', 'c'], breedtes: [1, 3] })).raster, [1512, 4536, 3024]);
  assert.deepEqual((await tabel({ kop: ['a', 'b', 'c', 'd'], breedtes: [2, 0, -1, 'x'] })).raster, [2268, 2268, 2268, 2268]);
  assert.deepEqual((await tabel({ kop: ['a', 'b'], breedtes: 'breed' })).raster, [4536, 4536]);
  // Geen kolom wordt onbruikbaar smal, ook niet met een scheve verhouding of heel veel tekst in één kolom.
  const scheef = (await tabel({ kop: ['a', 'b'], breedtes: [1000, 1] })).raster;
  assert.ok(scheef[1] >= 400 && scheef[0] + scheef[1] === 9072, String(scheef));
  const vanzelf = (await tabel({ kop: ['Vraag', 'N'], rijen: [['x'.repeat(500), 3]] })).raster;
  assert.ok(vanzelf[0] > vanzelf[1] * 3 && vanzelf[1] >= 800 && vanzelf[0] + vanzelf[1] === 9072, String(vanzelf));

  // Word kan hooguit 63 kolommen aan.
  assert.equal((await tabel({ rijen: [Array.from({ length: 63 }, (x, i) => i)] })).raster.reduce((a, b) => a + b, 0), 9072);
  assert.throws(() => B.maakDocx({ blokken: [{ soort: 'tabel', rijen: [Array(64).fill('x')] }] }), /hooguit 63 kolommen hebben; deze tabel heeft er 64/);
  // Een grote tabel (2000 rijen) geeft een geldig document.
  const groot = await documentVan({ blokken: [{ soort: 'tabel', kop: ['Nr', 'Antwoord', 'Score'], rijen: Array.from({ length: 2000 }, (x, i) => [i + 1, `Antwoord ${i + 1}`, (i % 50) / 10]) }] });
  controleerXml(groot, 'document.xml');
  const rijenGroot = tabellen(groot)[0].rijen;
  assert.equal(rijenGroot.length, 2001);
  assert.deepEqual(rijenGroot[2000].cellen.map((c) => [c.tekst, c.rechts]), [['2000', true], ['Antwoord 2000', false], ['4,9', true]]);
});

// ---------- Agenda ----------

const ontvouw = (ics) => ics.replace(/\r\n /g, '');

test('ics: afspraken voor de hele dag in de juiste opbouw', () => {
  const ics = B.maakIcs(
    [
      { titel: 'Actieplan werkdruk', datum: '2026-12-01', omschrijving: 'Bespreken in het teamoverleg' },
      { titel: 'Oudejaarsdag', datum: '2026-12-31' },
      { titel: 'Schrikkeldag', datum: '2028-02-29', uid: 'actie-42@onderzoek' },
      { titel: 'Laatste dag van de maand', datum: '2027-04-30T10:00:00Z' },
    ],
    { naam: 'Acties; onderzoek', tijdstempel: '2026-11-26T12:34:56Z' },
  );
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!ics.replace(/\r\n/g, '').includes('\n') && !ics.replace(/\r\n/g, '').includes('\r'), 'alleen CRLF als regeleinde');
  const regels = ontvouw(ics).split('\r\n');
  assert.deepEqual(regels.slice(0, 6), ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Onderzoeksomgeving//Agenda//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Acties\\; onderzoek']);
  assert.equal(regels.filter((r) => r === 'BEGIN:VEVENT').length, 4);
  assert.equal(regels.filter((r) => r === 'END:VEVENT').length, 4);
  const eerste = regels.slice(regels.indexOf('BEGIN:VEVENT'), regels.indexOf('END:VEVENT') + 1);
  assert.match(eerste[1], /^UID:[0-9a-f]{8}-20261201@onderzoeksomgeving$/);
  assert.deepEqual(eerste.slice(2), ['DTSTAMP:20261126T123456Z', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261202', 'SUMMARY:Actieplan werkdruk',
    'DESCRIPTION:Bespreken in het teamoverleg', 'TRANSP:TRANSPARENT', 'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE', 'END:VEVENT']);
  // Het einde is de dag erna, ook over de grens van maand, jaar en schrikkeldag.
  const paren = regels.filter((r) => r.startsWith('DTSTART') || r.startsWith('DTEND')).map((r) => r.split(':')[1]);
  assert.deepEqual(paren, ['20261201', '20261202', '20261231', '20270101', '20280229', '20280301', '20270430', '20270501']);
  assert.ok(regels.includes('UID:actie-42@onderzoek'));
  assert.ok(!regels.some((r) => r.startsWith('DESCRIPTION:') && r.length === 12));
});

test('ics: bijzondere tekens krijgen een \\ en lange regels worden afgebroken op 75 bytes', () => {
  const titel = 'Deadline: plan; team A, B en C \\ pad C:\\map';
  const omschrijving = 'Regel 1\nRegel 2\r\nmet een hele lange tekst die zeker over de vijfenzeventig bytes heen gaat, met é, ë, € en emoji 🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂 en nog wat tekst erachteraan.';
  const ics = B.maakIcs([{ titel, datum: '2026-12-01', omschrijving }, { titel: 'ééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééé', datum: '2026-12-02' }]);
  const fysiek = ics.split('\r\n');
  assert.ok(fysiek.some((r) => r.startsWith(' ')), 'er zijn vervolgregels');
  for (const regel of fysiek) {
    const b = bytes(regel);
    assert.ok(b.length <= 75, `regel van ${b.length} bytes`);
    assert.equal(alsTekst(b), regel);
    assert.ok(!/[\ud800-\udbff]$/.test(regel) && !/^ ?[\udc00-\udfff]/.test(regel), 'een teken is niet doormidden geknipt');
  }
  // Elke fysieke regel is op zichzelf geldige UTF-8 (ook als bytes geknipt): knip het bestand op CRLF in bytes.
  const ruw = bytes(ics);
  let begin = 0;
  for (let i = 0; i < ruw.length - 1; i++) {
    if (ruw[i] === 13 && ruw[i + 1] === 10) {
      assert.doesNotThrow(() => alsTekst(ruw.subarray(begin, i)));
      begin = i + 2;
    }
  }
  const regels = ontvouw(ics).split('\r\n');
  assert.ok(regels.includes('SUMMARY:Deadline: plan\\; team A\\, B en C \\\\ pad C:\\\\map'));
  const beschrijving = regels.find((r) => r.startsWith('DESCRIPTION:')).slice(12);
  assert.ok(beschrijving.startsWith('Regel 1\\nRegel 2\\nmet een hele lange tekst'));
  // Terugvertalen geeft de oorspronkelijke tekst.
  const terug = beschrijving.replace(/\\(.)/g, (alles, c) => (c === 'n' ? '\n' : c));
  assert.equal(terug, omschrijving.replace(/\r\n/g, '\n'));
  assert.ok(regels.includes(`SUMMARY:${'é'.repeat(79)}`));
});

test('ics: vaste uitvoer, vaste en unieke uid, ongeldige datums overgeslagen', () => {
  const afspraken = [
    { titel: 'A', datum: '2026-12-01' },
    { titel: 'A', datum: '2026-12-01' },
    { titel: 'A', datum: '2026-12-02' },
    { titel: 'B', datum: '2026-12-01' },
    { titel: 'Bestaat niet', datum: '2026-02-31' },
    { titel: 'Geen datum', datum: '' },
    { titel: 'Verkeerde vorm', datum: '01-12-2026' },
    { titel: 'Zonder datum' },
    { titel: '', datum: '2026-12-03' },
  ];
  const ics = B.maakIcs(afspraken);
  assert.equal(B.maakIcs(afspraken), ics, 'dezelfde invoer geeft hetzelfde bestand');
  const regels = ics.split('\r\n');
  const uids = regels.filter((r) => r.startsWith('UID:'));
  assert.equal(uids.length, 5, 'alleen afspraken met een geldige datum');
  assert.equal(new Set(uids).size, 5, 'elke afspraak een eigen uid');
  assert.equal(regels.filter((r) => r === 'DTSTAMP:20260101T000000Z').length, 5, 'vaste tijdstempel als er geen is opgegeven');
  assert.ok(regels.includes('SUMMARY:(zonder titel)'));
  // De uid hangt alleen af van de afspraak zelf, niet van de plek in de lijst.
  const alleen = B.maakIcs([{ titel: 'B', datum: '2026-12-01' }]).split('\r\n').find((r) => r.startsWith('UID:'));
  assert.ok(uids.includes(alleen));
  assert.ok(B.maakIcs([{ titel: 'x', datum: '2026-12-01' }], { tijdstempel: new Date(Date.UTC(2027, 0, 2, 3, 4, 5)) }).includes('DTSTAMP:20270102T030405Z'));
  // Zonder afspraken blijft het een geldige, lege agenda.
  assert.equal(B.maakIcs([]), 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Onderzoeksomgeving//Agenda//NL\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR\r\n');
});

// ---------- SPSS ----------

test('spssNaam: geldige en unieke namen', () => {
  const gebruikt = new Set();
  assert.equal(B.spssNaam('Leeftijd', gebruikt), 'Leeftijd');
  assert.equal(B.spssNaam('Ik kan mijn werk goed aan', gebruikt), 'Ik_kan_mijn_werk_goed_aan');
  assert.equal(B.spssNaam('Geïnformeerd over één beleid?', gebruikt), 'Geinformeerd_over_een_beleid');
  assert.equal(B.spssNaam('1e vraag', gebruikt), 'v1e_vraag');
  assert.equal(B.spssNaam('  % ziekteverzuim (2025) ', gebruikt), 'ziekteverzuim_2025');
  assert.equal(B.spssNaam('leeftijd', gebruikt), 'leeftijd_2', 'SPSS let niet op hoofdletters');
  assert.equal(B.spssNaam('LEEFTIJD', gebruikt), 'LEEFTIJD_3');
  assert.equal(B.spssNaam('', gebruikt), 'var');
  assert.equal(B.spssNaam('???', gebruikt), 'var_2');
  assert.equal(B.spssNaam(null, gebruikt), 'var_3');
  assert.equal(B.spssNaam('🙂', gebruikt), 'var_4');
  for (const woord of ['ALL', 'and', 'By', 'EQ', 'GE', 'GT', 'LE', 'LT', 'NE', 'NOT', 'OR', 'TO', 'WITH']) {
    assert.equal(B.spssNaam(woord, gebruikt), `v_${woord}`);
  }
  assert.equal(B.spssNaam('to', gebruikt), 'v_to_2');
  assert.ok(gebruikt.has('Leeftijd') && gebruikt.has('leeftijd_2') && gebruikt.has('v_TO'), 'de namen staan in de set');

  // Lange namen: hooguit 32 tekens, ook met een volgnummer erachter.
  const lang = 'Dit is een hele lange vraag die veel te lang is voor een naam in SPSS';
  const namen = Array.from({ length: 12 }, () => B.spssNaam(lang, gebruikt));
  assert.equal(namen[0], 'Dit_is_een_hele_lange_vraag_die');
  assert.equal(namen[1], 'Dit_is_een_hele_lange_vraag_di_2');
  assert.equal(namen[11], 'Dit_is_een_hele_lange_vraag_d_12');
  assert.equal(new Set(namen).size, 12);
  const alles = [...gebruikt];
  assert.equal(new Set(alles.map((n) => n.toLowerCase())).size, alles.length, 'uniek, ook zonder op hoofdletters te letten');
  for (const naam of alles) assert.match(naam, /^[A-Za-z][A-Za-z0-9_]{0,31}$/);
  assert.equal(B.spssNaam('Zonder set'), 'Zonder_set');
});

const VARIABELEN = [
  { naam: 'respondent', soort: 'getal', decimalen: 0, meetniveau: 'NOMINAL' },
  { naam: 'afdeling', label: "Afdeling van de medewerker ('team')", soort: 'tekst', breedte: 12, meetniveau: 'NOMINAL' },
  { naam: 'werk_aan', label: 'Ik kan mijn werk goed aan', soort: 'getal', decimalen: 0, meetniveau: 'ORDINAL', waardelabels: { 1: 'Helemaal mee oneens', 2: 'Mee oneens', 3: 'Neutraal', 4: 'Mee eens', 5: 'Helemaal mee eens', 99: "Weet niet / 'n.v.t.'" }, ontbrekend: [99] },
  { naam: 'gewaardeerd', label: 'Ik voel me gewaardeerd', soort: 'getal', decimalen: 0, meetniveau: 'ORDINAL', waardelabels: { 1: 'Helemaal mee oneens', 2: 'Mee oneens', 3: 'Neutraal', 4: 'Mee eens', 5: 'Helemaal mee eens', 99: "Weet niet / 'n.v.t.'" }, ontbrekend: [99] },
  { naam: 'score', label: `Gemiddelde score op het thema werkdruk. ${'Dit is een heel lang label met é, ë en een ‘aanhaling’. '.repeat(6)}`, soort: 'getal', breedte: 6, decimalen: 2, meetniveau: 'SCALE', ontbrekend: [-1, -2, -3, -4] },
  { naam: 'geslacht', soort: 'tekst', breedte: 1, waardelabels: { m: 'Man', v: 'Vrouw', x: 'Anders' }, ontbrekend: ['?', 'veel te lange waarde'] },
  { naam: 'toelichting', label: 'Open\ntoelichting', soort: 'tekst' },
  { naam: 'standaard', soort: 'getal' },
];

test('maakSpssSyntax: opbouw van de syntax', () => {
  const syntax = B.maakSpssSyntax({ databestand: 'onderzoek-gegevens.csv', variabelen: VARIABELEN, titel: 'Medewerkersonderzoek 2026.\nTweede regel' });
  const regels = syntax.split('\n');
  assert.equal(regels[0], '* Encoding: UTF-8.');
  assert.ok(regels.includes('* Medewerkersonderzoek 2026. Tweede regel.'));
  // Uitleg in het Nederlands: zelfde map, openen, pad aanpassen, alles uitvoeren.
  assert.match(syntax, /\* 1\. Zet dit syntaxbestand en het gegevensbestand \(onderzoek-gegevens\.csv\) samen in een map\./);
  assert.match(syntax, /\* 2\. Open dit syntaxbestand in SPSS/);
  assert.match(syntax, /\* 3\. Kan SPSS het gegevensbestand niet vinden\? Zet dan bij \/FILE hieronder het hele pad\./);
  assert.match(syntax, /\* 4\. Kies in het syntaxvenster Run > All/);
  // Elke regel met uitleg is een eigen opmerking: begint met * en eindigt met een punt.
  const einde = regels.indexOf('PRESERVE.');
  assert.ok(einde > 5);
  for (const regel of regels.slice(0, einde)) assert.ok(regel === '' || /^\*.*\.$/.test(regel), regel);

  const opdrachten = syntax.slice(syntax.indexOf('PRESERVE.'));
  assert.ok(opdrachten.startsWith('PRESERVE.\nSET DECIMAL=DOT.\n\nGET DATA\n  /TYPE=TXT\n  /FILE=\'onderzoek-gegevens.csv\'\n  /ENCODING=\'UTF8\'\n  /DELCASE=LINE\n  /DELIMITERS=";"\n  /QUALIFIER=\'"\'\n  /ARRANGEMENT=DELIMITED\n  /FIRSTCASE=2\n  /VARIABLES=\n'));
  assert.ok(opdrachten.includes('    respondent F8.0\n    afdeling A36\n    werk_aan F8.0\n    gewaardeerd F8.0\n    score F6.2\n    geslacht A3\n    toelichting A765\n    standaard F8.2.\n'), 'soort en breedte per variabele');
  assert.ok(opdrachten.includes("\nVARIABLE LABELS\n  afdeling 'Afdeling van de medewerker (''team'')'\n  /werk_aan 'Ik kan mijn werk goed aan'\n  /gewaardeerd 'Ik voel me gewaardeerd'\n  /score '"), 'labels, met verdubbelde aanhalingstekens');
  assert.ok(opdrachten.includes("  /toelichting 'Open toelichting'.\n"), 'regeleinde in een label wordt een spatie');
  // Variabelen met dezelfde waardelabels staan bij elkaar.
  assert.ok(opdrachten.includes("\nVALUE LABELS\n  werk_aan\n  gewaardeerd\n    1 'Helemaal mee oneens'\n    2 'Mee oneens'\n    3 'Neutraal'\n    4 'Mee eens'\n    5 'Helemaal mee eens'\n    99 'Weet niet / ''n.v.t.'''\n  /geslacht\n    'm' 'Man'\n    'v' 'Vrouw'\n    'x' 'Anders'.\n"));
  // Hooguit drie ontbrekende waarden; bij tekst hooguit 8 bytes per waarde.
  assert.ok(opdrachten.includes("\nMISSING VALUES\n  werk_aan\n  gewaardeerd (99)\n  /score (-1, -2, -3)\n  /geslacht ('?').\n"));
  assert.ok(opdrachten.includes('\nVARIABLE LEVEL\n  respondent\n  afdeling (NOMINAL)\n  /werk_aan\n  gewaardeerd (ORDINAL)\n  /score (SCALE).\n'));
  assert.ok(opdrachten.endsWith('\nCACHE.\nEXECUTE.\nRESTORE.\n'));
  const volgorde = ['GET DATA', 'VARIABLE LABELS', 'VALUE LABELS', 'MISSING VALUES', 'VARIABLE LEVEL', 'EXECUTE.'].map((kop) => regels.indexOf(kop));
  assert.deepEqual(volgorde, [...volgorde].sort((a, b) => a - b));
  assert.ok(volgorde.every((plek) => plek > 0));
  assert.ok(!/^SET UNICODE/m.test(syntax), 'SET UNICODE staat alleen in de uitleg (geeft een fout als er al gegevens open staan)');
});

test('maakSpssSyntax: lange labels worden afgebroken met + en geen regel is langer dan 250 bytes', () => {
  const syntax = B.maakSpssSyntax({ databestand: 'gegevens.csv', variabelen: VARIABELEN, titel: 'x'.repeat(600) });
  for (const regel of syntax.split('\n')) assert.ok(bytes(regel).length <= 250, `regel van ${bytes(regel).length} bytes: ${regel.slice(0, 60)}`);
  // Het lange label staat er in stukken, die samen weer het label vormen (ingekort tot 255 bytes).
  const m = /\/score ((?:'(?:[^']|'')*'(?: \+\n {4})?)+)/.exec(syntax);
  assert.ok(m, 'label van score gevonden');
  assert.ok(m[1].includes("' +\n    '"), 'afgebroken met een plusteken');
  const label = m[1].split(" +\n    ").map((stuk) => stuk.slice(1, -1).replace(/''/g, "'")).join('');
  const volledig = VARIABELEN[4].label.trim();
  assert.ok(volledig.startsWith(label) && label.length > 200);
  assert.ok(bytes(label).length <= 255 && bytes(label).length > 250, `${bytes(label).length} bytes`);
  // Een waardelabel is hooguit 120 bytes.
  const lang = B.maakSpssSyntax({ databestand: 'g.csv', variabelen: [{ naam: 'v1', soort: 'getal', waardelabels: { 1: 'é'.repeat(100) } }] });
  assert.ok(lang.includes(`    1 '${'é'.repeat(60)}'.`));
});

test('maakSpssSyntax: bestandsnaam, getallen als waarden en foutmeldingen', () => {
  const syntax = B.maakSpssSyntax({
    databestand: "C:\\Users\\Zoë\\Documents\\onderzoek 'proef'\\gegevens.csv",
    variabelen: [
      { naam: 'v1', soort: 'getal', decimalen: 1, waardelabels: { '1,5': 'anderhalf', ' 2 ': 'twee', abc: 'geen getal', '': 'leeg' }, ontbrekend: ['99', 'x', 98.5] },
      { naam: 'v2', soort: 'tekst', breedte: 20000, meetniveau: 'ONBEKEND', label: '   ' },
    ],
  });
  assert.ok(syntax.includes("  /FILE='C:\\Users\\Zoë\\Documents\\onderzoek ''proef''\\gegevens.csv'\n"));
  assert.ok(syntax.includes('    v1 F8.1\n    v2 A32767.\n'));
  assert.ok(syntax.includes("\nVALUE LABELS\n  v1\n    2 'twee'\n    1.5 'anderhalf'.\n") || syntax.includes("\nVALUE LABELS\n  v1\n    1.5 'anderhalf'\n    2 'twee'.\n"));
  assert.ok(syntax.includes('\nMISSING VALUES\n  v1 (99, 98.5).\n'));
  assert.ok(!syntax.includes('VARIABLE LABELS') && !syntax.includes('VARIABLE LEVEL'), 'lege blokken worden weggelaten');
  const eenvoudig = B.maakSpssSyntax({ databestand: 'g.csv', variabelen: [{ naam: 'a', soort: 'getal' }] });
  assert.ok(eenvoudig.includes('  /VARIABLES=\n    a F8.2.\n\nCACHE.\nEXECUTE.\nRESTORE.\n'));
  assert.ok(eenvoudig.includes('* Gegevens uit de Onderzoeksomgeving.'));

  assert.throws(() => B.maakSpssSyntax({ databestand: 'g.csv', variabelen: [] }), /geen variabelen/);
  for (const naam of ['1abc', 'met spatie', 'é', 'TO', 'a-b', '', 'x'.repeat(65)]) {
    assert.throws(() => B.maakSpssSyntax({ databestand: 'g.csv', variabelen: [{ naam, soort: 'getal' }] }), /Ongeldige of dubbele SPSS-naam/, naam);
  }
  assert.throws(() => B.maakSpssSyntax({ databestand: 'g.csv', variabelen: [{ naam: 'Leeftijd', soort: 'getal' }, { naam: 'leeftijd', soort: 'getal' }] }), /dubbele SPSS-naam: "leeftijd"/);
});

// ---------- De module als geheel ----------

test('module: de kop noemt precies de functies die er zijn; geen eval, en de pagina alleen in bewaarBestand', () => {
  const namen = ['bewaarBestand', 'crc32', 'leesCsv', 'leesXlsx', 'leesZip', 'maakDocx', 'maakIcs', 'maakSpssSyntax', 'maakXlsx', 'maakZip', 'spssNaam'];
  assert.deepEqual(Object.keys(B).sort(), namen);
  for (const naam of namen) assert.equal(typeof B[naam], 'function', naam);

  const bron = readFileSync(new URL('../public/js/beheer/bestanden.js', import.meta.url), 'utf8');
  const kop = bron.slice(0, bron.indexOf('\n\n'));
  assert.ok(kop.split('\n').every((regel) => regel.startsWith('//')), 'de kop is het commentaar bovenaan het bestand');
  const genoemd = [...new Set(kop.match(/\b(?:maak|lees|bewaar|spss|crc)[A-Za-z0-9]+/g))].sort();
  assert.deepEqual(genoemd, namen, 'de kop van de module en de functies die de module naar buiten geeft zijn gelijk');
  assert.deepEqual([...bron.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]).sort(), namen);
  assert.equal((bron.match(/^export /gm) || []).length, namen.length, 'er zijn geen andere exports');

  assert.ok(!/\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|\bimport\s*\(|^import /m.test(bron), 'geen eval, Function of andere modules');
  // De pagina (document, window en dergelijke) komt alleen voor in bewaarBestand, de laatste functie van het bestand.
  const pagina = /\b(?:document\.(?:createElement|body|querySelector|getElementById|head)|window\b|navigator\b|localStorage\b|sessionStorage\b|location\.)/g;
  const eerste = bron.search(pagina);
  assert.ok(eerste > bron.indexOf('export function bewaarBestand('), 'alleen bewaarBestand gebruikt de pagina');
});

// ---------- Opslaan in de browser ----------

test('bewaarBestand: maakt een tijdelijke downloadkoppeling (met een nagebootste pagina)', async () => {
  const stappen = [];
  const koppeling = { click: () => stappen.push('klik'), remove: () => stappen.push('weg') };
  const oud = { document: globalThis.document, maak: URL.createObjectURL, wis: URL.revokeObjectURL };
  let blob;
  globalThis.document = { createElement: (soort) => (stappen.push(soort), koppeling), body: { append: (el) => stappen.push(el === koppeling ? 'toegevoegd' : '?') } };
  URL.createObjectURL = (b) => ((blob = b), 'blob:test');
  URL.revokeObjectURL = () => {};
  try {
    B.bewaarBestand(B.maakZip([{ naam: 'a.txt', inhoud: 'hallo' }]), 'proef.zip', 'application/zip');
  } finally {
    globalThis.document = oud.document;
    URL.createObjectURL = oud.maak;
    URL.revokeObjectURL = oud.wis;
  }
  assert.deepEqual(stappen, ['a', 'toegevoegd', 'klik', 'weg']);
  assert.equal(koppeling.href, 'blob:test');
  assert.equal(koppeling.download, 'proef.zip');
  assert.equal(blob.type, 'application/zip');
  assert.equal((await B.leesZip(await blob.arrayBuffer())).size, 1);
});
