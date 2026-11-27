// Tests voor de startcollectie van de bibliotheek (BOUWPLAN §4 P7, stap 4):
// - scripts/startcollectie.mjs: de eigen sleutel van een record, velden die niet gebruikt worden;
// - data/startcollectie.json: elk record geldig, elke bron een https-link of DOI en een vast onderwerp;
// - data/startcollectie-sleutels.json: sleutels en citeersleutels uniek en volgens hun patroon;
// - migrations/0016_bibliotheek_start.sql: byte voor byte gelijk aan een nieuwe generatie, vóór 0017, elke opdracht klein;
// - op een verse lokale D1 met alle migraties (0001–0017) geeft GET /bibliotheek precies de 89 startbronnen;
// - zoeken in deze collectie: de rangorde bij de woorden uit de review van P7 (wetgeving, WOR, diversiteit, loon).
// Er draait geen testserver (dus geen vaste poort): Wrangler voert de migraties uit in een tijdelijke map en de test
// leest de database via getPlatformProxy, net als test/migratie.test.mjs, en roept de route lijst() rechtstreeks aan.
// Uitvoeren: node --test test/bibliotheek-start.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';

import { CITEERSLEUTEL, ONDERWERPEN, onderwerpUitTekst, apaVerwijzing, apaKort } from '../public/js/beheer/bibliotheek-regels.js';
import { zoek } from '../public/js/beheer/bibliotheek-zoeken.js';
import { controleerRecords, wijsSleutelsToe, maakMigratie, MAX_STATEMENT, SLEUTEL_PATROON } from '../scripts/startcollectie.mjs';
import { lijst } from '../src/routes/bibliotheek.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIES = join(ROOT, 'migrations');
const RECORDS = JSON.parse(readFileSync(join(ROOT, 'data/startcollectie.json'), 'utf8'));
const SLEUTELS = JSON.parse(readFileSync(join(ROOT, 'data/startcollectie-sleutels.json'), 'utf8'));
const MIGRATIE = readFileSync(join(MIGRATIES, '0016_bibliotheek_start.sql'), 'utf8');
const N = 89;
const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
const opruimen = [];
after(() => {
  for (const map of opruimen) rmSync(map, { recursive: true, force: true });
});

// ---------- Het script: sleutels (besluit d van het onderzoeksteam) ----------

const record = (titel, extra = {}) => ({
  titel, auteurs: ['Bakker, A. B.'], jaar: 2017, soort: 'wetenschappelijk artikel', taal: 'en', doi: '', url: 'https://example.org/x',
  onderwerpen: ['werkdruk-werkstress'], betrouwbaarheid: 'peer-reviewed', ...extra,
});

test('script: de eigen sleutel van een record wordt de sleutel, als die past en uniek is', () => {
  const { bronnen, fouten, ongebruikt } = controleerRecords([
    record('Eerste artikel', { sleutel: 'bakker-2017-eerste' }),
    record('Tweede artikel', { sleutel: 'dubbel' }),
    record('Derde artikel', { sleutel: 'dubbel' }),
    record('Vierde artikel', { sleutel: 'Met Hoofdletters' }),
    record('Vijfde artikel', { sleutel: 'al-bezet' }),
    record('Zesde artikel'),
    record('Zevende artikel', { sleutel: 'nieuwe-naam', doi: '10.1234/bekend' }),
  ]);
  assert.deepEqual(fouten, []);
  assert.deepEqual([...ongebruikt], [], 'alle velden van deze records worden gelezen');
  const vorige = {
    samengesteld_op: '2026-01-01',
    bronnen: [
      { doi: '', titel_jaar: 'iets anders|2017', sleutel: 'al-bezet', citeersleutel: 'bakker2017', toegevoegd_op: '2026-01-01' },
      { doi: '10.1234/bekend', titel_jaar: 'oude titel|2017', sleutel: 'oude-sleutel', citeersleutel: 'bakker2017b', toegevoegd_op: '2026-01-01' },
    ],
  };
  const { lijst, sleutelbestand } = wijsSleutelsToe(bronnen, vorige, '2026-11-27');
  const op = (titel) => lijst.find((r) => r.bron.titel === titel);
  assert.equal(op('Eerste artikel').sleutel, 'bakker-2017-eerste');
  assert.equal(op('Tweede artikel').sleutel, 'bakker-2017-tweede-artikel', 'twee keer dezelfde sleutel: geen van beide');
  assert.equal(op('Derde artikel').sleutel, 'bakker-2017-derde-artikel');
  assert.equal(op('Vierde artikel').sleutel, 'bakker-2017-vierde-artikel', 'past niet');
  assert.equal(op('Vijfde artikel').sleutel, 'bakker-2017-vijfde-artikel', 'al gebruikt door een andere bron');
  assert.equal(op('Zesde artikel').sleutel, 'bakker-2017-zesde-artikel', 'geen eigen sleutel');
  // Een bron die al in het sleutelbestand staat (zelfde DOI) houdt zijn oude sleutels
  assert.equal(op('Zevende artikel').sleutel, 'oude-sleutel');
  assert.equal(op('Zevende artikel').citeersleutel, 'bakker2017b');
  assert.equal(op('Zevende artikel').toegevoegd_op, '2026-01-01');
  // Nieuwe citeersleutels botsen niet met de bestaande
  const citeer = sleutelbestand.bronnen.map((b) => b.citeersleutel);
  assert.equal(new Set(citeer).size, citeer.length);
  assert.equal(op('Eerste artikel').citeersleutel, 'bakker2017c');
  for (const r of lijst) assert.match(r.sleutel, SLEUTEL_PATROON);
  assert.equal(sleutelbestand.samengesteld_op, '2026-01-01');
});

test('script: velden die niet gebruikt worden, worden één keer geteld', () => {
  const { ongebruikt } = controleerRecords([
    record('A', { relevantie: 'Waarom relevant.', open_access: true }),
    record('B', { relevantie: 'Ook relevant.', open_access: false, iets: 1 }),
  ]);
  assert.deepEqual([...ongebruikt], [['relevantie', 2], ['open_access', 2], ['iets', 1]]);
});

// ---------- De collectie van het onderzoeksteam ----------

const omgezet = controleerRecords(RECORDS);

test('data: 89 records, elk geldig met dezelfde controle als de server, zonder harde fouten', () => {
  assert.ok(Array.isArray(RECORDS));
  assert.equal(RECORDS.length, N);
  assert.deepEqual(omgezet.fouten, []);
  assert.equal(omgezet.bronnen.length, N);
  assert.deepEqual([...omgezet.ongebruikt], [['relevantie', N], ['open_access', N]], 'besluit d: geen veld in de bibliotheek');
  for (const { meldingen } of omgezet.bronnen) {
    assert.ok(!meldingen.some((m) => /Onbekend onderwerp|http:\/\/|ingekort|hoort niet bij de soort/.test(m)), meldingen.join(' | '));
  }
});

test('data: elke bron heeft een https-link of een DOI en minstens één vast onderwerp', () => {
  RECORDS.forEach((r, i) => {
    const { bron } = omgezet.bronnen[i];
    assert.ok(r.url || r.doi, `record ${i + 1}: een link of DOI`);
    assert.ok(bron.url || bron.doi);
    if (r.url) assert.match(r.url, /^https:\/\/[^\s<>"]+$/, `record ${i + 1}`);
    if (bron.url) assert.match(bron.url, /^https:\/\//);
    if (bron.doi) assert.match(bron.doi, /^10\.\d{4,9}\/\S+$/);
    assert.ok(r.onderwerpen.length >= 1);
    for (const o of r.onderwerpen) assert.ok(onderwerpUitTekst(o), `record ${i + 1}: onderwerp "${o}" is een vast onderwerp`);
    assert.ok(bron.onderwerpen.length >= 1);
    for (const o of bron.onderwerpen) assert.ok(Object.hasOwn(ONDERWERPEN, o));
  });
  // Besluit a: 17 bronnen over wet- en regelgeving
  assert.equal(omgezet.bronnen.filter((b) => b.bron.onderwerpen.includes('wetgeving')).length, 17);
  // Besluit b: 64 artikelen en 5 CBS-bronnen hoog, 15 andere overheid en 5 kennisinstituut redelijk
  const tel = (n) => omgezet.bronnen.filter((b) => b.bron.betrouwbaarheid === n).length;
  assert.deepEqual([tel('hoog'), tel('redelijk'), tel('beperkt'), tel('onbekend')], [69, 20, 0, 0]);
});

test('sleutels: uniek en volgens hun patroon; elke bron heeft de sleutel van het onderzoeksteam', () => {
  const rijen = SLEUTELS.bronnen;
  assert.equal(rijen.length, N);
  const sleutels = rijen.map((b) => b.sleutel);
  const citeer = rijen.map((b) => b.citeersleutel);
  assert.equal(new Set(sleutels).size, N);
  assert.equal(new Set(citeer).size, N);
  for (const s of sleutels) assert.match(s, SLEUTEL_PATROON);
  for (const c of citeer) {
    assert.match(c, CITEERSLEUTEL);
    assert.match(`${c}st`, CITEERSLEUTEL, 'ook de uitwijksleutel bij een botsing met een eigen bron past');
  }
  assert.deepEqual([...sleutels].sort(), RECORDS.map((r) => r.sleutel).sort(), 'besluit d: de eigen sleutels van het onderzoeksteam');
  // Opnieuw toewijzen met het sleutelbestand verandert niets (vaste sleutels)
  const { lijst: opnieuw } = wijsSleutelsToe(omgezet.bronnen, structuredClone(SLEUTELS), '2030-01-01');
  for (const r of opnieuw) {
    const rij = rijen.find((x) => x.sleutel === r.sleutel);
    assert.equal(r.citeersleutel, rij.citeersleutel);
    assert.equal(r.toegevoegd_op, '2026-11-27');
  }
  const cbs = rijen.find((b) => b.sleutel === 'cbs-2025-cao-lonen');
  assert.equal(cbs.citeersleutel, 'cbs2025');
});

// ---------- Zoeken in de echte collectie (review van P7) ----------

test('zoeken: de rangorde in de startcollectie bij wetgeving, WOR, diversiteit en loon', () => {
  const bibliotheek = wijsSleutelsToe(omgezet.bronnen, structuredClone(SLEUTELS), '2026-11-27').lijst.map((r, i) => ({
    ...r.bron, id: i + 1, collectie: 'start', sleutel: r.sleutel, citeersleutel: r.citeersleutel, notities: '', verborgen: 0, onderzoeken: [],
  }));
  const zoekSleutels = (tekst) => zoek(bibliotheek, { tekst }).treffers.map((t) => t.bron.sleutel);
  const wetgeving = bibliotheek.filter((b) => b.onderwerpen.includes('wetgeving')).map((b) => b.sleutel).sort();
  assert.equal(wetgeving.length, 17);
  // Besluit a: het onderwerp is te vinden met het woord dat de HR-adviseur typt
  for (const tekst of ['wetgeving', 'regelgeving', 'Wet- en regelgeving']) {
    assert.deepEqual([...zoekSleutels(tekst)].sort(), wetgeving, tekst);
  }
  // WOR: alleen de drie bronnen die de WOR noemen, niet de Engelse artikelen met "work" of "workers"
  const wor = ['ap-2025-or-personeelsvolgsystemen', 'ser-zj-medezeggenschap-arbo', 'ser-zj-medezeggenschap-privacy'];
  assert.deepEqual([...zoekSleutels('WOR')].sort(), wor);
  assert.deepEqual([...zoekSleutels('wor')].sort(), wor);
  // Diversiteit: eerst de twee studies over diversiteit, daarna pas bronnen met alleen het samengevoegde onderwerp
  const div = zoekSleutels('diversiteit');
  assert.deepEqual(div.slice(0, 2).sort(), ['shore-2011-inclusie-diversiteit-werkgroepen', 'van-knippenberg-de-dreu-homan-2004-diversiteit-prestatie']);
  assert.ok(div.length > 2, 'de bronnen met het onderwerp "Sociale veiligheid, diversiteit en inclusie" blijven gevonden');
  assert.deepEqual(zoekSleutels('inclusie').slice(0, 1), ['shore-2011-inclusie-diversiteit-werkgroepen']);
  // Loon: het CBS-bericht over de cao-lonen en de meta-analyse over salaristevredenheid bovenaan
  for (const tekst of ['loon', 'salaris']) {
    assert.deepEqual(zoekSleutels(tekst).slice(0, 2).sort(), ['cbs-2025-cao-lonen', 'williams-mcdaniel-nguyen-2006-salaristevredenheid'], tekst);
  }
  // Wat al goed ging, blijft gelijk (aantallen uit de UI-controle van P7)
  assert.equal(zoekSleutels('verzuim').length, 17);
  assert.equal(zoekSleutels('werkdruk').length, 24);
  assert.equal(zoekSleutels('privacy').length, 13);
  assert.equal(zoekSleutels('eNPS').length, 0);
});

test('migratie: byte voor byte gelijk aan een nieuwe generatie (--controle en in een lege map)', () => {
  execFileSync('node', [join(ROOT, 'scripts/startcollectie.mjs'), join(ROOT, 'data/startcollectie.json'), '--controle'], { stdio: 'ignore' });
  const map = mkdtempSync(join(tmpdir(), 'onderzoek-startcollectie-'));
  opruimen.push(map);
  copyFileSync(join(ROOT, 'data/startcollectie-sleutels.json'), join(map, 'sleutels.json'));
  execFileSync('node', [join(ROOT, 'scripts/startcollectie.mjs'), join(ROOT, 'data/startcollectie.json'), '--uit', map, '--sleutels', join(map, 'sleutels.json')], { stdio: 'ignore' });
  assert.ok(readFileSync(join(map, '0016_bibliotheek_start.sql')).equals(readFileSync(join(MIGRATIES, '0016_bibliotheek_start.sql'))));
  assert.ok(readFileSync(join(map, 'sleutels.json')).equals(readFileSync(join(ROOT, 'data/startcollectie-sleutels.json'))));
  // Zonder sleutelbestand komen er dezelfde sleutels uit (vaste volgorde, geen toeval)
  const leeg = join(map, 'leeg');
  execFileSync('node', [join(ROOT, 'scripts/startcollectie.mjs'), join(ROOT, 'data/startcollectie.json'), '--uit', leeg, '--datum', '2026-11-27'], { stdio: 'ignore' });
  assert.equal(readFileSync(join(leeg, '0016_bibliotheek_start.sql'), 'utf8'), MIGRATIE);
  // En in het proces zelf
  const { lijst: toegewezen } = wijsSleutelsToe(omgezet.bronnen, structuredClone(SLEUTELS), '2026-11-27');
  assert.equal(maakMigratie(toegewezen, { versie: 1, datum: SLEUTELS.samengesteld_op }), MIGRATIE);
});

test('migratie: 0016 komt vóór 0017 (de sjabloonmigratie blijft de laatste), één kleine INSERT per bron', () => {
  const namen = readdirSync(MIGRATIES).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  assert.deepEqual(namen.filter((f) => f.startsWith('0016_')), ['0016_bibliotheek_start.sql']);
  assert.ok(namen.indexOf('0016_bibliotheek_start.sql') < namen.indexOf('0017_sjablonen_kenmerken.sql'));
  assert.equal(namen[namen.length - 1], '0017_sjablonen_kenmerken.sql');
  const opdrachten = MIGRATIE.split(';\n').map((x) => x.replace(/^(?:--[^\n]*\n)+/, ''));
  const inserts = opdrachten.filter((x) => x.startsWith('INSERT INTO bronnen'));
  assert.equal(opdrachten.filter(Boolean).length, N + 2, 'plus de versie en de gegevens van de collectie');
  assert.equal(inserts.length, N);
  for (const regel of inserts) {
    assert.ok(Buffer.byteLength(regel) <= MAX_STATEMENT, 'FT-04: elke opdracht onder 18 KB');
    assert.match(regel, /WHERE NOT EXISTS \(SELECT 1 FROM bronnen WHERE sleutel = '[a-z0-9-]+'\)/, 'overschrijft nooit iets');
  }
  assert.ok(MIGRATIE.includes(`'{"versie":1,"aantal":${N},"datum":"2026-11-27"}'`));
  assert.ok(!/\bUPDATE bronnen\b/.test(MIGRATIE), 'versie 1: alleen toevoegen');
});

// ---------- Op een verse lokale D1 ----------

test('D1: op een verse database met alle migraties (0001–0017) geeft GET /bibliotheek precies 89 startbronnen', async () => {
  const map = mkdtempSync(join(tmpdir(), 'onderzoek-startcollectie-d1-'));
  opruimen.push(map);
  const project = join(map, 'project');
  mkdirSync(join(project, 'migrations'), { recursive: true });
  writeFileSync(join(project, 'werker.js'), 'export default { fetch() { return new Response(""); } };\n');
  writeFileSync(join(project, 'wrangler.jsonc'), JSON.stringify({
    name: 'startcollectieproef',
    main: 'werker.js',
    compatibility_date: '2026-11-01',
    d1_databases: [{ binding: 'DB', database_name: 'startcollectieproef', database_id: '00000000-0000-4000-8000-000000000016', migrations_dir: 'migrations' }],
  }, null, 2));
  const namen = readdirSync(MIGRATIES).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const f of namen) copyFileSync(join(MIGRATIES, f), join(project, 'migrations', f));
  const wrangler = (...args) => execFileSync('npx', ['wrangler', 'd1', ...args, '--local', '--persist-to', join(map, 'staat')],
    { cwd: project, stdio: 'ignore', env: WRANGLER_ENV });
  wrangler('migrations', 'apply', 'DB');

  const open = () => getPlatformProxy({ configPath: join(project, 'wrangler.jsonc'), persist: { path: join(map, 'staat', 'v3') } });
  /** De hele bibliotheek via de route, deel voor deel (zoals bibliotheek-data.js). */
  async function heleLijst(env) {
    const bronnen = [];
    let vanaf = 0;
    let laatste;
    for (let i = 0; i < 50; i++) {
      const antwoord = await lijst({ env, url: new URL(`http://lokaal/api/beheer/bibliotheek?vanaf=${vanaf}`) });
      assert.equal(antwoord.status, 200);
      laatste = await antwoord.json();
      bronnen.push(...laatste.bronnen);
      if (laatste.volgende === null) break;
      vanaf = laatste.volgende;
    }
    return { bronnen, laatste };
  }

  let proxy = await open();
  try {
    const gedaan = (await proxy.env.DB.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map((r) => r.name);
    assert.deepEqual(gedaan, namen, 'alle migraties, in volgorde');
    const { bronnen, laatste } = await heleLijst(proxy.env);
    const start = bronnen.filter((b) => b.collectie === 'start');
    assert.equal(bronnen.length, N, 'een verse bibliotheek bevat alleen de startcollectie');
    assert.equal(start.length, N);
    assert.equal(new Set(start.map((b) => b.id)).size, N);
    assert.deepEqual(laatste.start, { aantal: N, verborgen: 0, totaal: N, versie: 1, datum: '2026-11-27' });
    // Elke bron staat erin zoals de generator hem maakte (sleutels, velden en dus ook de APA-verwijzing)
    const verwacht = new Map(wijsSleutelsToe(omgezet.bronnen, structuredClone(SLEUTELS), '2026-11-27').lijst.map((r) => [r.sleutel, r]));
    for (const b of start) {
      const v = verwacht.get(b.sleutel);
      assert.ok(v, b.sleutel);
      assert.equal(b.citeersleutel, v.citeersleutel);
      for (const veld of ['soort', 'titel', 'auteurs', 'organisatie', 'afkorting', 'jaar', 'taal', 'url', 'doi', 'details', 'onderwerpen', 'trefwoorden', 'samenvatting', 'kernpunten', 'betrouwbaarheid', 'betrouwbaarheid_toelichting']) {
        assert.deepEqual(b[veld], v.bron[veld], `${b.sleutel}: ${veld}`);
      }
      assert.equal(apaVerwijzing(b), apaVerwijzing(v.bron));
      assert.equal(b.notities, '');
      assert.equal(b.verborgen, 0);
      assert.equal(b.kopie_van, null);
      assert.deepEqual(b.onderzoeken, []);
    }
    const cbs = start.find((b) => b.citeersleutel === 'cbs2025');
    assert.equal(cbs.organisatie, 'Centraal Bureau voor de Statistiek');
    assert.equal(apaKort(cbs), '(CBS, 2025)');
    assert.equal(cbs.betrouwbaarheid, 'hoog');
    assert.equal(cbs.details.datum, '2025-12-31');
  } finally {
    await proxy.dispose();
  }

  // Nog een keer uitvoeren voegt niets dubbel toe en overschrijft niets (ook niet een notitie of verbergen)
  proxy = await open();
  try {
    await proxy.env.DB.batch([
      proxy.env.DB.prepare("UPDATE bronnen SET notities = 'eigen notitie', verborgen = 1 WHERE citeersleutel = 'cbs2025'"),
    ]);
  } finally {
    await proxy.dispose();
  }
  wrangler('execute', 'DB', '--file', join(project, 'migrations', '0016_bibliotheek_start.sql'));
  proxy = await open();
  try {
    const { bronnen, laatste } = await heleLijst(proxy.env);
    assert.equal(bronnen.filter((b) => b.collectie === 'start').length, N);
    assert.equal(laatste.start.verborgen, 1);
    assert.equal(bronnen.find((b) => b.citeersleutel === 'cbs2025').notities, 'eigen notitie');
  } finally {
    await proxy.dispose();
  }
});
