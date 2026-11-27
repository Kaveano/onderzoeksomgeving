// Tests voor public/js/beheer/figuren.js (BOUWPLAN §3.8, B27) en het afbeelding-blok van maakDocx (bestanden.js).
// Het plan (figuurPlan) is zuiver en wordt hier gecontroleerd: posities, namen en het "×"-vakje voor een verborgen
// waarde. De SVG wordt getekend met een kleine nep-DOM; de PNG met een nep-canvas.
// Uitvoeren: node --test test/figuren.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import * as F from '../public/js/beheer/figuren.js';
import { maakDocx, leesZip, crc32 } from '../public/js/beheer/bestanden.js';

const staaf = (over = {}) => ({
  soort: 'figuur', id: 'respons-groep', vorm: 'staaf', titel: 'Respons per afdeling', bijschrift: 'Respons per afdeling',
  alt: 'Respons per afdeling: Zorg 62%, Staf 48%, Facilitair niet getoond.', eenheid: '%', schaal: { min: 0, max: 100 },
  categorieen: ['Zorg', 'Staf', 'Facilitair'], reeksen: [{ label: 'Respons', waarden: [62, 48, null] }], ...over,
});

test('staaf: staven naar verhouding, de waarde ernaast, en een verborgen waarde als vakje met ×', () => {
  const p = F.figuurPlan(staaf(), { breedte: 600 });
  assert.equal(p.breedte, 600);
  assert.ok(p.hoogte > 60);
  assert.equal(p.alt, 'Respons per afdeling: Zorg 62%, Staf 48%, Facilitair niet getoond.');
  assert.deepEqual(p.balken.map((b) => [b.categorie, b.waarde]), [['Zorg', 62], ['Staf', 48]]);
  const [zorg, staf] = p.balken;
  assert.ok(Math.abs(zorg.b / staf.b - 62 / 48) < 1e-9, 'staaflengte naar verhouding');
  assert.equal(zorg.x, staf.x, 'staven beginnen op dezelfde lijn');
  // De verborgen waarde is een vakje met ×, nooit een staaf van 0.
  assert.deepEqual(p.verborgen.map((v) => v.categorie), ['Facilitair']);
  assert.ok(!p.balken.some((b) => b.categorie === 'Facilitair'));
  const kruisjes = p.elementen.filter((e) => e.soort === 'tekst' && e.tekst === '×');
  assert.equal(kruisjes.length, 1);
  assert.ok(p.elementen.some((e) => e.soort === 'rect' && e.klasse === 'fig-verborgen' && e.b > 0));
  // Namen en waarden.
  const teksten = p.elementen.filter((e) => e.soort === 'tekst').map((e) => e.tekst);
  for (const t of ['Zorg', 'Staf', 'Facilitair', '62%', '48%', '0%', '100%']) assert.ok(teksten.includes(t), t);
  // Zelfde invoer, zelfde plan.
  assert.deepEqual(F.figuurPlan(staaf(), { breedte: 600 }), p);
});

test('staaf: meer reeksen naast elkaar met een legenda; eNPS-score met negatieve waarden links van 0', () => {
  const twee = F.figuurPlan(staaf({
    categorieen: ['Zorg', 'Staf'], reeksen: [{ label: 'Respondenten', waarden: [40, 60] }, { label: 'Organisatie', waarden: [50, 50] }],
  }), { breedte: 600 });
  assert.deepEqual(twee.legenda.map((l) => [l.label, l.kleur]), [['Respondenten', 'reeks-1'], ['Organisatie', 'reeks-2']]);
  assert.equal(twee.balken.length, 4);
  const zorg = twee.balken.filter((b) => b.categorie === 'Zorg');
  assert.ok(zorg[1].y > zorg[0].y, 'reeksen onder elkaar binnen een rij');
  const score = F.figuurPlan({ ...staaf(), eenheid: 'score', schaal: null, categorieen: ['Zorg', 'Staf'], reeksen: [{ label: 'eNPS', waarden: [20, -30] }] }, { breedte: 600 });
  const [plus, min] = score.balken;
  const nul = plus.x;
  assert.ok(Math.abs(min.x + min.b - nul) < 1e-9, 'negatieve staaf eindigt op de nullijn');
  assert.ok(Math.abs(plus.b / min.b - 20 / 30) < 1e-9);
  const teksten = score.elementen.filter((e) => e.soort === 'tekst').map((e) => e.tekst);
  assert.ok(teksten.includes('+20') && teksten.includes('−30'));
});

test('gestapeld: stukken vullen de staaf; een rij met een verborgen waarde wordt één vakje met ×', () => {
  const fig = {
    soort: 'figuur', id: 'themas', vorm: 'gestapeld', titel: "Thema's", bijschrift: '', alt: 'x', eenheid: '%', schaal: null,
    categorieen: ['Werkdruk', 'Samenwerking', 'Leiderschap'],
    reeksen: [
      { label: 'Gunstig (4–5)', waarden: [40, 70, null], kleur: 'gunstig' },
      { label: 'Neutraal (3)', waarden: [25, 20, 30], kleur: 'neutraal' },
      { label: 'Ongunstig (1–2)', waarden: [35, 10, 20], kleur: 'ongunstig' },
    ],
  };
  for (const breedte of [700, 343]) {
    const p = F.figuurPlan(fig, { breedte });
    for (const cat of ['Werkdruk', 'Samenwerking']) {
      const stukken = p.balken.filter((b) => b.categorie === cat);
      assert.equal(stukken.length, 3);
      const breed = stukken.reduce((t, b) => t + b.b, 0);
      const vak = p.verborgen[0];
      assert.ok(Math.abs(breed - vak.b) < 1e-9, 'een staaf is even breed als het vakje (de hele as)');
      for (let i = 1; i < 3; i++) assert.ok(Math.abs(stukken[i].x - (stukken[i - 1].x + stukken[i - 1].b)) < 1e-9, 'aaneensluitend');
    }
    assert.deepEqual(p.verborgen.map((v) => v.categorie), ['Leiderschap']);
    assert.ok(!p.balken.some((b) => b.categorie === 'Leiderschap'));
    assert.deepEqual(p.legenda.map((l) => l.kleur), ['gunstig', 'neutraal', 'ongunstig']);
    // Tekst op de stukken: klasse volgens de kleur van het stuk.
    const op = p.elementen.filter((e) => e.soort === 'tekst' && e.klasse.includes('fig-op'));
    assert.ok(op.some((e) => e.tekst === '70%' && e.klasse.includes('fig-op-gunstig')));
    // Niets buiten het vak (geen horizontaal scrollen op een telefoon).
    for (const e of p.elementen) if (e.soort === 'rect') assert.ok(e.x >= -1e-9 && e.x + e.b <= breedte + 1e-9, `${e.klasse} past niet`);
  }
  // Op een smal scherm staat de naam boven de staaf.
  const smal = F.figuurPlan(fig, { breedte: 343 });
  const label = smal.labels.find((l) => l.categorie === 'Werkdruk');
  const staafY = smal.balken.find((b) => b.categorie === 'Werkdruk').y;
  assert.ok(label.y < staafY);
});

test('lijn: een verborgen punt onderbreekt de lijn en krijgt een ×; namen onder de as', () => {
  const fig = {
    soort: 'figuur', id: 'verloop', vorm: 'lijn', titel: 'Verloop', bijschrift: '', alt: 'x', eenheid: 'gem', schaal: { min: 1, max: 5 },
    categorieen: ['Nulmeting', 'Tussenmeting', 'Eindmeting', 'Nameting'],
    reeksen: [{ label: 'Werkdruk', waarden: [3.2, 3.4, null, 3.9] }, { label: 'Samenwerking', waarden: [3.8, 3.9, 4.0, 4.1] }],
  };
  const p = F.figuurPlan(fig, { breedte: 600 });
  const lijnen = p.elementen.filter((e) => e.soort === 'lijn' && e.klasse.startsWith('fig-lijn'));
  // Werkdruk: één stuk (Nulmeting–Tussenmeting; Nameting staat alleen); Samenwerking: één stuk van vier punten.
  assert.equal(lijnen.length, 2);
  assert.deepEqual(lijnen.map((l) => l.punten.length).sort(), [2, 4]);
  assert.deepEqual(p.verborgen.map((v) => [v.categorie, v.reeks]), [['Eindmeting', 'Werkdruk']]);
  assert.equal(p.balken.length, 7);
  const y35 = p.balken.find((b) => b.reeks === 'Werkdruk' && b.categorie === 'Tussenmeting').y;
  const y32 = p.balken.find((b) => b.reeks === 'Werkdruk' && b.categorie === 'Nulmeting').y;
  assert.ok(y35 < y32, 'hoger getal staat hoger');
  for (const c of fig.categorieen) assert.ok(p.labels.some((l) => l.categorie === c), c);
  assert.ok(p.elementen.some((e) => e.soort === 'tekst' && e.tekst === '3,9'));
  // Veel meetmomenten op een smal scherm: niet elke naam, wel de eerste en de laatste.
  const veel = F.figuurPlan({ ...fig, categorieen: Array.from({ length: 14 }, (_, i) => `Week ${i + 1}`), reeksen: [{ label: 'n', waarden: Array.from({ length: 14 }, (_, i) => 2 + i / 10) }] }, { breedte: 343 });
  const getoond = veel.labels.map((l) => l.categorie);
  assert.ok(getoond.length < 14 && getoond.includes('Week 1') && getoond.includes('Week 14'));
});

test('spreiding (prioriteitenmatrix): punten, het kruis en de vier kwadranten; thema zonder getal valt weg', () => {
  const fig = {
    soort: 'figuur', id: 'prioriteiten', vorm: 'spreiding', titel: 'Prioriteitenmatrix', bijschrift: '', alt: 'x', eenheid: 'gem',
    schaal: { min: 1, max: 5 }, schaalY: { min: 0, max: 1 }, categorieen: [], reeksen: [],
    punten: [{ label: 'Werkdruk', x: 2.8, y: 0.62 }, { label: 'Samenwerking', x: 4.1, y: 0.48 }, { label: 'Leiderschap', x: 3.5, y: 0.2 }, { label: 'Verborgen thema', x: null, y: 0.3 }],
    kruis: { x: 3.47, y: 0.43 },
    kwadrantLabels: ['Sterk punt – vasthouden', 'Verbeterpunt – hier liggen kansen', 'Minder belangrijk – goed genoeg', 'Minder belangrijk – later'],
    asLabels: { x: 'Gemiddelde score', y: 'Samenhang (r)' },
  };
  const p = F.figuurPlan(fig, { breedte: 600 });
  assert.deepEqual(p.punten.map((x) => x.label).sort(), ['Leiderschap', 'Samenwerking', 'Werkdruk']);
  assert.deepEqual(p.weggelaten, ['Verborgen thema']);
  const pt = (l) => p.punten.find((x) => x.label === l);
  assert.ok(pt('Samenwerking').cx > pt('Werkdruk').cx, 'hogere score staat rechts');
  assert.ok(pt('Werkdruk').cy < pt('Leiderschap').cy, 'sterkere samenhang staat hoger');
  const kruis = p.elementen.filter((e) => e.soort === 'lijn' && e.klasse === 'fig-kruis');
  assert.equal(kruis.length, 2);
  const kx = kruis[0].punten[0][0];
  const ky = kruis[1].punten[0][1];
  // Werkdruk: lage score, sterke samenhang → linksboven (verbeterpunt).
  assert.ok(pt('Werkdruk').cx < kx && pt('Werkdruk').cy < ky);
  const teksten = p.elementen.filter((e) => e.soort === 'tekst').map((e) => e.tekst).join(' ');
  assert.ok(teksten.includes('Verbeterpunt') && teksten.includes('vasthouden') && teksten.includes('later'));
  assert.ok(teksten.includes('Samenhang (r)'));
});

test('figuurPlan weigert een onbekende vorm; hulpjes voor tekst en verdeelstreepjes', () => {
  assert.throws(() => F.figuurPlan({ vorm: 'taart' }), /Onbekende vorm/);
  assert.deepEqual(F.streepjes(0, 100, 4), [0, 25, 50, 75, 100]);
  assert.deepEqual(F.streepjes(1, 5, 4), [1, 2, 3, 4, 5]);
  assert.equal(F.waardeTekst(3.84, 'gem'), '3,8');
  assert.equal(F.waardeTekst(47.6, '%'), '48%');
  assert.equal(F.waardeTekst(-8.2, 'score'), '−8');
  assert.equal(F.waardeTekst(1250, 'aantal'), '1.250');
  assert.equal(F.waardeTekst(null, '%'), '×');
  const regels = F.afbreken('Een heel lange naam van een thema die echt niet op één regel past', 120);
  assert.equal(regels.length, 2);
  assert.ok(regels[1].endsWith('…'));
});

// ---------- SVG met een kleine nep-DOM ----------

function nepDocument() {
  const maak = (ns, tag) => {
    const el = {
      ns, tag, attrs: {}, kinderen: [], textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      append(...k) { this.kinderen.push(...k); },
    };
    return el;
  };
  return { createElementNS: maak, createElement: (tag) => maak(null, tag) };
}

test('figuurNaarSvg: SVG via createElementNS, role=img met de alt-tekst, kleuren alleen via klassen (geen style)', () => {
  globalThis.document = nepDocument();
  try {
    const svg = F.figuurNaarSvg(staaf(), { breedte: 500 });
    assert.equal(svg.ns, 'http://www.w3.org/2000/svg');
    assert.equal(svg.tag, 'svg');
    assert.equal(svg.attrs.role, 'img');
    assert.equal(svg.attrs['aria-label'], staaf().alt);
    assert.equal(svg.attrs.viewBox.split(' ')[2], '500');
    assert.equal(svg.kinderen[0].tag, 'title');
    assert.equal(svg.kinderen[0].textContent, 'Respons per afdeling');
    const alle = [];
    const loop = (e) => { alle.push(e); (e.kinderen || []).forEach(loop); };
    loop(svg);
    for (const e of alle) {
      assert.ok(!('style' in e.attrs), `style-attribuut op ${e.tag}`);
      assert.equal(e.ns, 'http://www.w3.org/2000/svg');
      if (e.attrs.fill && e.tag !== 'polyline') assert.fail(`kleur als attribuut op ${e.tag}`);
    }
    assert.ok(alle.some((e) => e.tag === 'text' && e.textContent === '×'));
    assert.ok(alle.filter((e) => e.tag === 'rect').some((e) => /fig-reeks-1/.test(e.attrs.class)));
  } finally {
    delete globalThis.document;
  }
});

// ---------- PNG met een nep-canvas ----------

function nepCanvas() {
  const opdrachten = [];
  const ctx = new Proxy({}, {
    get(doel, naam) {
      if (naam in doel) return doel[naam];
      return (...args) => opdrachten.push([naam, ...args]);
    },
    set(doel, naam, waarde) { opdrachten.push([`=${String(naam)}`, waarde]); doel[naam] = waarde; return true; },
  });
  return { ctx, opdrachten };
}

test('figuurNaarPng: tekent hetzelfde plan op een canvas en geeft de bytes van de PNG', async () => {
  const { ctx, opdrachten } = nepCanvas();
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  globalThis.OffscreenCanvas = class {
    constructor(b, h) { this.width = b; this.height = h; }
    getContext() { return ctx; }
    async convertToBlob({ type }) { assert.equal(type, 'image/png'); return new Blob([PNG], { type }); }
  };
  try {
    const png = await F.figuurNaarPng(staaf(), { breedte: 1600 });
    assert.deepEqual([...png], [...PNG]);
    const teksten = opdrachten.filter((o) => o[0] === 'fillText').map((o) => o[1]);
    const plan = F.figuurPlan(staaf(), { breedte: 800 });
    assert.deepEqual(teksten, plan.elementen.filter((e) => e.soort === 'tekst').map((e) => e.tekst));
    assert.ok(teksten.includes('×'));
    // Een staaf in de reekskleur, het vakje met een stippellijn.
    assert.ok(opdrachten.some((o) => o[0] === '=fillStyle' && o[1] === F.PNG_KLEUREN['reeks-1']));
    assert.ok(opdrachten.some((o) => o[0] === 'setLineDash' && o[1].length === 2));
    const maten = F.figuurMaten(staaf());
    assert.equal(maten.breedte_cm, 16);
    assert.ok(Math.abs(maten.hoogte_cm - (16 * plan.hoogte) / 800) < 0.01);
    const blok = await F.figuurVoorWord(staaf());
    assert.equal(blok.soort, 'afbeelding');
    assert.equal(blok.alt, staaf().alt);
  } finally {
    delete globalThis.OffscreenCanvas;
  }
});

// ---------- Word: het afbeelding-blok ----------

/** Een echte (kleine) PNG van 2 × 2 pixels. */
function kleinePng() {
  const stuk = (soort, data) => {
    const lengte = Buffer.alloc(4);
    lengte.writeUInt32BE(data.length);
    const sd = Buffer.concat([Buffer.from(soort, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(new Uint8Array(sd)) >>> 0);
    return Buffer.concat([lengte, sd, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rauw = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), stuk('IHDR', ihdr), stuk('IDAT', deflateSync(rauw)), stuk('IEND', Buffer.alloc(0))]));
}
const tekstVan = (b) => new TextDecoder().decode(b);

/** Minimale controle op goedgevormde XML: elke open tag sluit in de goede volgorde. */
function goedGevormd(xml, naam) {
  const stapel = [];
  const zonderKop = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  let tags = 0;
  for (const m of zonderKop.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g)) {
    tags++;
    assert.ok(!m[3].includes('<') && !m[3].includes('>'), `${naam}: < of > in een attribuut`);
    if (m[4]) continue;
    if (m[1]) assert.equal(stapel.pop(), m[2], `${naam}: </${m[2]}> sluit niet de goede tag`);
    else stapel.push(m[2]);
  }
  assert.equal(stapel.length, 0, `${naam}: niet alles gesloten`);
  assert.equal((zonderKop.match(/</g) || []).length, tags, `${naam}: een losse <`);
}

test('maakDocx: een afbeelding komt als PNG in word/media, met de alt-tekst in wp:docPr descr', async () => {
  const png = kleinePng();
  const docx = maakDocx({
    titel: 'HR-analytics',
    voettekst: 'Vertrouwelijk',
    blokken: [
      { soort: 'kop', niveau: 1, tekst: 'Deelname' },
      { soort: 'afbeelding', png, breedte_cm: 16, hoogte_cm: 9, alt: 'Respons per afdeling: Zorg 62% & "Staf" 48%.', bijschrift: 'Figuur 1. Respons per afdeling' },
      { soort: 'alinea', tekst: 'Tekst erna.' },
      { soort: 'afbeelding', png, breedte_cm: 32, hoogte_cm: 9, alt: 'Tweede' },
    ],
  });
  const zip = await leesZip(docx);
  assert.deepEqual([...zip.keys()].filter((k) => k.startsWith('word/media/')), ['word/media/afbeelding1.png', 'word/media/afbeelding2.png']);
  assert.deepEqual([...zip.get('word/media/afbeelding1.png')], [...png]);
  const typen = tekstVan(zip.get('[Content_Types].xml'));
  assert.ok(typen.includes('<Default Extension="png" ContentType="image/png"/>'));
  const rels = tekstVan(zip.get('word/_rels/document.xml.rels'));
  assert.match(rels, /Id="rId4" [^>]*\/footer" Target="footer1.xml"/);
  assert.match(rels, /Id="rId5" Type="http:\/\/schemas.openxmlformats.org\/officeDocument\/2006\/relationships\/image" Target="media\/afbeelding1.png"/);
  assert.match(rels, /Id="rId6" [^>]*\/image" Target="media\/afbeelding2.png"/);
  const doc = tekstVan(zip.get('word/document.xml'));
  assert.ok(doc.includes('xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'));
  assert.ok(doc.includes('<wp:docPr id="1" name="Figuur 1" descr="Respons per afdeling: Zorg 62% &amp; &quot;Staf&quot; 48%."/>'));
  assert.ok(doc.includes('<a:blip r:embed="rId5"/>') && doc.includes('<a:blip r:embed="rId6"/>'));
  assert.ok(doc.includes(`<wp:extent cx="${16 * 360000}" cy="${9 * 360000}"/>`));
  // Te breed: naar verhouding kleiner (32 × 9 → 16 × 4,5 cm).
  assert.ok(doc.includes(`<wp:extent cx="${16 * 360000}" cy="${4.5 * 360000}"/>`));
  assert.ok(doc.includes('Figuur 1. Respons per afdeling'));
  for (const [naam, inhoud] of zip) if (naam.endsWith('.xml') || naam.endsWith('.rels')) goedGevormd(tekstVan(inhoud), naam);
  // Zonder voettekst begint de eerste afbeelding bij rId4.
  const zonder = await leesZip(maakDocx({ blokken: [{ soort: 'afbeelding', png, breedte_cm: 10, hoogte_cm: 5, alt: 'a' }] }));
  assert.match(tekstVan(zonder.get('word/_rels/document.xml.rels')), /Id="rId4" [^>]*\/image" Target="media\/afbeelding1.png"/);
});

test('maakDocx: zonder afbeeldingen verandert er niets; een kapotte afbeelding geeft een duidelijke fout', async () => {
  const zip = await leesZip(maakDocx({ blokken: [{ soort: 'alinea', tekst: 'Alleen tekst.' }] }));
  assert.ok(!tekstVan(zip.get('[Content_Types].xml')).includes('png'));
  assert.ok(!tekstVan(zip.get('word/document.xml')).includes('xmlns:wp'));
  assert.ok(![...zip.keys()].some((k) => k.startsWith('word/media')));
  assert.throws(() => maakDocx({ blokken: [{ soort: 'afbeelding', png: new Uint8Array([1, 2, 3]), breedte_cm: 5, hoogte_cm: 5, alt: '' }] }), /geen PNG/);
  assert.throws(() => maakDocx({ blokken: [{ soort: 'afbeelding', png: kleinePng(), breedte_cm: 0, hoogte_cm: 5, alt: '' }] }), /geen geldige maten/);
});
