// Maakt de migratie met de startcollectie van de bibliotheek uit het JSON-bestand van het onderzoeksteam
// (BOUWPLAN §2.6, B21 en pakket P7). Alleen voor de beheerder; dit script komt niet in de Worker.
//
// Gebruik:
//   node scripts/startcollectie.mjs data/startcollectie.json
//   node scripts/startcollectie.mjs <invoer.json> --uit <map>          (bijv. een tijdelijke map, voor een proef)
// Opties:
//   --uit <map>          waar de migratie komt (standaard: migrations/)
//   --sleutels <bestand> de vaste sleutels per bron (standaard: data/startcollectie-sleutels.json; met --uit:
//                        <map>/startcollectie-sleutels.json)
//   --versie <n>         versie van de collectie (standaard 1). Bij een latere versie komt er per bron ook een UPDATE
//                        bij (startbronnen zijn alleen-lezen, dus dat mag); geef dan ook --bestand op.
//   --bestand <naam>     naam van de migratie (standaard bij versie 1: 0016_bibliotheek_start.sql)
//   --datum JJJJ-MM-DD   datum in de kop (standaard: de datum uit het sleutelbestand, anders vandaag)
//   --controle           niets schrijven; stopt met code 1 als de migratie of het sleutelbestand anders zou worden
//
// Wat het script doet:
// 1. elk record omzetten (normaliseerStartbron) en controleren (controleerBron, dezelfde controle als de server);
//    bij een harde fout (geen titel, geen URL en geen DOI, onbekende soort, geen bekend onderwerp) stopt het,
//    zonder iets te schrijven. Los die op door het onderzoeksteam te vragen; vul nooit zelf iets in;
// 2. sleutel en citeersleutel per bron vastleggen in het sleutelbestand. Een bron die er al in staat (zelfde DOI,
//    anders zelfde titel en jaar) houdt zijn sleutels; een nieuwe krijgt nieuwe. Heeft het record zelf een
//    'sleutel' die past (SLEUTEL_PATROON) en maar één keer voorkomt, dan wordt dat de sleutel van een nieuwe bron;
//    anders maakt het script er een (achternaam-jaar-titelwoorden);
// 3. de migratie schrijven: per bron één INSERT die nooit iets overschrijft;
// 4. de waarschuwingen tonen (onbekende onderwerpen naar de trefwoorden, http in plaats van https, ingekorte velden,
//    wat er uit bron_details wel en niet is overgenomen) en één keer de velden die het script niet gebruikt.
//
// Hetzelfde invoerbestand en sleutelbestand geven altijd precies dezelfde migratie (geen tijdstempel van nu).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normaliseerStartbron, citeersleutelBasis, vrijeCiteersleutel, normaliseer, kaleDoi, CITEERSLEUTEL, STARTRECORD_VELDEN,
} from '../public/js/beheer/bibliotheek-regels.js';
import { controleerBron } from '../src/lib/bibliotheek.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Grootte van één INSERT (bytes); ruim onder de 100 KB van D1 (BOUWPLAN FT-04). */
export const MAX_STATEMENT = 18_000;
/** Vaste sleutel van een bron in de startcollectie (bijv. bakker-demerouti-2007-jdr). */
export const SLEUTEL_PATROON = /^[a-z][a-z0-9-]{2,79}$/;

function leesOpties(argv) {
  const opties = { invoer: null, uit: null, sleutels: null, versie: 1, bestand: null, datum: null, controle: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--uit') opties.uit = argv[++i];
    else if (a === '--sleutels') opties.sleutels = argv[++i];
    else if (a === '--versie') opties.versie = Number(argv[++i]);
    else if (a === '--bestand') opties.bestand = argv[++i];
    else if (a === '--datum') opties.datum = argv[++i];
    else if (a === '--controle') opties.controle = true;
    else if (!a.startsWith('--') && !opties.invoer) opties.invoer = a;
    else throw new Error(`Onbekende optie: ${a}`);
  }
  if (!opties.invoer) throw new Error('Geef het invoerbestand op, bijvoorbeeld: node scripts/startcollectie.mjs data/startcollectie.json');
  if (!Number.isInteger(opties.versie) || opties.versie < 1) throw new Error('--versie moet een geheel getal van 1 of meer zijn.');
  if (opties.versie > 1 && !opties.bestand) throw new Error('Geef bij een nieuwe versie ook --bestand op (het volgende vrije migratienummer).');
  if (opties.datum && !/^\d{4}-\d{2}-\d{2}$/.test(opties.datum)) throw new Error('--datum moet JJJJ-MM-DD zijn.');
  return opties;
}

const sql = (w) => (w === null || w === undefined ? 'NULL' : typeof w === 'number' ? String(w) : `'${String(w).replace(/'/g, "''")}'`);
const slug = (t) => normaliseer(t).replace(/ /g, '-').replace(/^-+|-+$/g, '');
const titelJaar = (b) => `${normaliseer(b.titel)}|${Number.isInteger(b.jaar) ? b.jaar : 'zd'}`;

/** Een leesbare, vaste sleutel: achternaam (of organisatie)-jaar-eerste drie woorden van de titel. */
function maakSleutel(bron, bezet) {
  const wie = bron.auteurs[0]?.achternaam || bron.afkorting || bron.organisatie || '';
  const basis = [slug(wie).split('-').slice(0, 3).join('-'), Number.isInteger(bron.jaar) ? bron.jaar : 'zd',
    slug(bron.titel).split('-').slice(0, 3).join('-')].filter(Boolean).join('-').slice(0, 70).replace(/-+$/, '');
  let s = /^[a-z]/.test(basis) ? basis : `bron-${basis}`;
  for (let n = 2; bezet.has(s); n++) s = `${basis}-${n}`;
  return s;
}

/**
 * Zet de records om; → { bronnen: [{ bron, meldingen, voorkeur }], fouten: [tekst], ongebruikt: Map<veld, aantal> }.
 * voorkeur = de eigen 'sleutel' van het record (of ''); ongebruikt = velden die het script niet leest.
 */
export function controleerRecords(records) {
  const fouten = [];
  const bronnen = [];
  const ongebruikt = new Map();
  records.forEach((record, i) => {
    const naam = `Record ${i + 1}${record?.titel ? ` ("${String(record.titel).slice(0, 60)}")` : ''}`;
    for (const k of Object.keys(record && typeof record === 'object' ? record : {})) {
      if (!STARTRECORD_VELDEN.has(k)) ongebruikt.set(k, (ongebruikt.get(k) || 0) + 1);
    }
    const { bron, meldingen, fouten: harde } = normaliseerStartbron(record);
    for (const f of harde) fouten.push(`${naam}: ${f}`);
    if (harde.length) return;
    try {
      const schoon = controleerBron(bron);
      const voorkeur = typeof record.sleutel === 'string' ? record.sleutel.trim() : '';
      bronnen.push({ bron: schoon, meldingen: meldingen.map((m) => `${naam}: ${m}`), voorkeur });
    } catch (e) {
      fouten.push(`${naam}: ${e.message}`);
    }
  });
  return { bronnen, fouten, ongebruikt };
}

/**
 * Wijst sleutels toe (bestaande blijven). sleutelbestand: { samengesteld_op, bronnen: [{ doi, titel_jaar, sleutel,
 * citeersleutel, toegevoegd_op }] } (of null). → { lijst: [{ bron, sleutel, citeersleutel, toegevoegd_op }], sleutelbestand }.
 */
export function wijsSleutelsToe(bronnen, sleutelbestand, datum) {
  const vorige = Array.isArray(sleutelbestand?.bronnen) ? sleutelbestand.bronnen : [];
  const opDoi = new Map(vorige.filter((s) => s.doi).map((s) => [s.doi, s]));
  const opTitel = new Map(vorige.map((s) => [s.titel_jaar, s]));
  const sleutels = new Set(vorige.map((s) => s.sleutel));
  const citeer = new Set(vorige.map((s) => s.citeersleutel));
  const gebruikt = new Set();
  // Eigen sleutels uit de records: alleen bruikbaar als ze passen en maar één keer voorkomen.
  const keren = new Map();
  for (const { voorkeur } of bronnen) if (voorkeur) keren.set(voorkeur, (keren.get(voorkeur) || 0) + 1);
  const lijst = bronnen.map(({ bron, voorkeur }) => {
    const doi = kaleDoi(bron.doi);
    let bekend = (doi && opDoi.get(doi)) || opTitel.get(titelJaar(bron));
    if (bekend && gebruikt.has(bekend.sleutel)) bekend = null; // twee records op dezelfde oude regel: de tweede is nieuw
    if (bekend) {
      gebruikt.add(bekend.sleutel);
      bekend.doi = doi;
      bekend.titel_jaar = titelJaar(bron);
      return { bron, sleutel: bekend.sleutel, citeersleutel: bekend.citeersleutel, toegevoegd_op: bekend.toegevoegd_op || datum };
    }
    const eigen = voorkeur && SLEUTEL_PATROON.test(voorkeur) && keren.get(voorkeur) === 1 && !sleutels.has(voorkeur);
    const sleutel = eigen ? voorkeur : maakSleutel(bron, sleutels);
    sleutels.add(sleutel);
    const citeersleutel = vrijeCiteersleutel(citeersleutelBasis(bron), citeer);
    citeer.add(citeersleutel);
    const nieuw = { doi, titel_jaar: titelJaar(bron), sleutel, citeersleutel, toegevoegd_op: datum };
    vorige.push(nieuw);
    gebruikt.add(sleutel);
    return { bron, sleutel, citeersleutel, toegevoegd_op: datum };
  });
  for (const r of lijst) {
    if (!CITEERSLEUTEL.test(r.citeersleutel)) throw new Error(`Ongeldige citeersleutel "${r.citeersleutel}".`);
    if (!SLEUTEL_PATROON.test(r.sleutel)) throw new Error(`Ongeldige sleutel "${r.sleutel}".`);
  }
  lijst.sort((a, b) => (a.sleutel < b.sleutel ? -1 : a.sleutel > b.sleutel ? 1 : 0));
  const bestand = {
    toelichting: 'Vaste sleutels van de startcollectie (scripts/startcollectie.mjs). Niet met de hand wijzigen: rapporten verwijzen naar de citeersleutels.',
    samengesteld_op: sleutelbestand?.samengesteld_op || datum,
    bronnen: [...vorige].sort((a, b) => (a.sleutel < b.sleutel ? -1 : a.sleutel > b.sleutel ? 1 : 0)),
  };
  return { lijst, sleutelbestand: bestand };
}

const KOLOMMEN = ['collectie', 'sleutel', 'citeersleutel', 'soort', 'titel', 'auteurs', 'organisatie', 'afkorting', 'jaar', 'taal', 'url', 'doi',
  'details', 'onderwerpen', 'trefwoorden', 'samenvatting', 'kernpunten', 'betrouwbaarheid', 'betrouwbaarheid_toelichting',
  'aangemaakt_op', 'bijgewerkt_op'];

/** De tekst van de migratie. */
export function maakMigratie(lijst, { versie = 1, datum }) {
  const kop = [
    `-- Startcollectie van de bibliotheek, versie ${versie} (gegenereerd door scripts/startcollectie.mjs uit`,
    `-- data/startcollectie.json op ${datum}; niet met de hand wijzigen). Bestaande bronnen worden nooit overschreven.`,
    '-- Is de citeersleutel al bezet door een eigen bron, dan krijgt de startbron dezelfde sleutel met "st" erachter.',
  ];
  const regels = [...kop];
  for (const { bron, sleutel, citeersleutel, toegevoegd_op: op } of lijst) {
    const tijd = `${op}T00:00:00.000Z`;
    const alt = `${citeersleutel}st`;
    const waarden = [
      sql('start'), sql(sleutel),
      `CASE WHEN EXISTS (SELECT 1 FROM bronnen WHERE citeersleutel = ${sql(citeersleutel)}) THEN ${sql(alt)} ELSE ${sql(citeersleutel)} END`,
      sql(bron.soort), sql(bron.titel), sql(JSON.stringify(bron.auteurs)), sql(bron.organisatie), sql(bron.afkorting), sql(bron.jaar),
      sql(bron.taal), sql(bron.url), sql(bron.doi), sql(JSON.stringify(bron.details)), sql(JSON.stringify(bron.onderwerpen)),
      sql(JSON.stringify(bron.trefwoorden)), sql(bron.samenvatting), sql(JSON.stringify(bron.kernpunten)), sql(bron.betrouwbaarheid),
      sql(bron.betrouwbaarheid_toelichting), sql(tijd), sql(tijd),
    ];
    const insert = `INSERT INTO bronnen (${KOLOMMEN.join(', ')})\nSELECT ${waarden.join(', ')}\n` +
      `WHERE NOT EXISTS (SELECT 1 FROM bronnen WHERE sleutel = ${sql(sleutel)})\n` +
      `  AND NOT EXISTS (SELECT 1 FROM bronnen WHERE citeersleutel = ${sql(alt)});`;
    if (new TextEncoder().encode(insert).length > MAX_STATEMENT) throw new Error(`De bron "${sleutel}" is te groot voor één opdracht (meer dan ${MAX_STATEMENT} bytes).`);
    regels.push(insert);
    if (versie > 1) {
      // Latere versie: startbronnen zijn alleen-lezen, dus de nieuwe inhoud mag de oude vervangen (notities en verbergen blijven).
      regels.push(`UPDATE bronnen SET soort = ${sql(bron.soort)}, titel = ${sql(bron.titel)}, auteurs = ${sql(JSON.stringify(bron.auteurs))}, ` +
        `organisatie = ${sql(bron.organisatie)}, afkorting = ${sql(bron.afkorting)}, jaar = ${sql(bron.jaar)}, taal = ${sql(bron.taal)}, ` +
        `url = ${sql(bron.url)}, doi = ${sql(bron.doi)}, details = ${sql(JSON.stringify(bron.details))}, onderwerpen = ${sql(JSON.stringify(bron.onderwerpen))}, ` +
        `trefwoorden = ${sql(JSON.stringify(bron.trefwoorden))}, samenvatting = ${sql(bron.samenvatting)}, kernpunten = ${sql(JSON.stringify(bron.kernpunten))}, ` +
        `betrouwbaarheid = ${sql(bron.betrouwbaarheid)}, betrouwbaarheid_toelichting = ${sql(bron.betrouwbaarheid_toelichting)}, ` +
        `bijgewerkt_op = ${sql(`${datum}T00:00:00.000Z`)}\nWHERE sleutel = ${sql(sleutel)} AND collectie = 'start';`);
    }
  }
  regels.push(`INSERT INTO instellingen (sleutel, waarde) VALUES ('bibliotheek_versie', '1')\n  ON CONFLICT(sleutel) DO UPDATE SET waarde = CAST(CAST(waarde AS INTEGER) + 1 AS TEXT);`);
  const info = JSON.stringify({ versie, aantal: lijst.length, datum });
  regels.push(`INSERT INTO instellingen (sleutel, waarde) VALUES ('bibliotheek_start', ${sql(info)})\n  ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde;`);
  return `${regels.join('\n')}\n`;
}

function vandaag() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function main(argv) {
  const o = leesOpties(argv);
  const ruw = JSON.parse(readFileSync(resolve(o.invoer), 'utf8'));
  const records = Array.isArray(ruw) ? ruw : Array.isArray(ruw?.bronnen) ? ruw.bronnen : null;
  if (!records) throw new Error('Het invoerbestand moet een lijst met bronnen zijn (of { "bronnen": [...] }).');
  const { bronnen, fouten, ongebruikt } = controleerRecords(records);
  if (fouten.length) {
    console.error(`Niet gemaakt: ${fouten.length} ${fouten.length === 1 ? 'fout' : 'fouten'}. Vraag het onderzoeksteam om deze gegevens; vul niets zelf in.`);
    for (const f of fouten) console.error(`  - ${f}`);
    return 1;
  }
  const uitMap = resolve(o.uit || join(ROOT, 'migrations'));
  const sleutelPad = resolve(o.sleutels || (o.uit ? join(uitMap, 'startcollectie-sleutels.json') : join(ROOT, 'data', 'startcollectie-sleutels.json')));
  const vorigeSleutels = existsSync(sleutelPad) ? JSON.parse(readFileSync(sleutelPad, 'utf8')) : null;
  const datum = o.datum || vorigeSleutels?.samengesteld_op || vandaag();
  const { lijst, sleutelbestand } = wijsSleutelsToe(bronnen, vorigeSleutels, datum);
  if (o.datum) sleutelbestand.samengesteld_op = o.datum;
  const migratie = maakMigratie(lijst, { versie: o.versie, datum });
  const migratiePad = join(uitMap, o.bestand || '0016_bibliotheek_start.sql');
  const sleutelTekst = `${JSON.stringify(sleutelbestand, null, 2)}\n`;
  for (const b of bronnen) for (const m of b.meldingen) console.warn(`Let op: ${m}`);
  if (ongebruikt.size) {
    console.warn(`Niet gebruikt (de bibliotheek heeft er geen veld voor): ${[...ongebruikt].map(([k, n]) => `${k} (${n}×)`).join(', ')}.`);
  }
  if (o.controle) {
    const zelfde = existsSync(migratiePad) && readFileSync(migratiePad, 'utf8') === migratie
      && existsSync(sleutelPad) && readFileSync(sleutelPad, 'utf8') === sleutelTekst;
    console.log(zelfde ? 'De migratie en het sleutelbestand zijn actueel.' : 'De migratie of het sleutelbestand wijkt af van een nieuwe generatie.');
    return zelfde ? 0 : 1;
  }
  mkdirSync(uitMap, { recursive: true });
  mkdirSync(dirname(sleutelPad), { recursive: true });
  writeFileSync(migratiePad, migratie);
  writeFileSync(sleutelPad, sleutelTekst);
  console.log(`${lijst.length} ${lijst.length === 1 ? 'bron' : 'bronnen'} geschreven naar ${migratiePad}`);
  console.log(`Sleutels: ${sleutelPad}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
