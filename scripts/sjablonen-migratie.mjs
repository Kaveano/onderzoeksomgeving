// Maakt de migratie die de standaardsjablonen in de database bijwerkt naar de versie uit de code
// (BOUWPLAN §2.7). Alleen voor ontwikkelaars; dit script komt niet in de Worker.
//
// Gebruik:
//   node scripts/sjablonen-migratie.mjs <oude-commit> [--uit migrations/0017_sjablonen_kenmerken.sql]
//
// <oude-commit> is de versie van de code waarmee de sjablonen nu in de database staan (de laatste versie die live
// staat). Het script haalt de bestanden van die versie uit git (git archive, in een tijdelijke map), laat beide
// versies van controleerSjabloonInhoud() de standaardsjablonen in hun vaste vorm zetten en schrijft per
// gewijzigd sjabloon één opdracht:
//   UPDATE sjablonen SET naam = '<nieuw>', omschrijving = '<nieuw>', inhoud = '<nieuw>'
//   WHERE bron = '<id>' AND naam = '<oud>' AND omschrijving = '<oud>' AND inhoud = '<oud>';
// Zo worden alleen sjablonen bijgewerkt die nog precies gelijk zijn aan de oude versie: een sjabloon dat de
// onderzoeker zelf heeft aangepast, blijft zoals het is.
//
// Deze migratie moet altijd de hoogste zijn: elke latere wijziging aan de sjablonen maakt hem verouderd. Maak hem
// dan opnieuw (met dezelfde oude commit) en controleer met de test (test/vraagmodel-api.test.mjs) dat elke nieuwe
// inhoud gelijk is aan de code.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const commit = args.find((a) => !a.startsWith('--'));
const uitIndex = args.indexOf('--uit');
const uit = uitIndex >= 0 ? resolve(args[uitIndex + 1]) : null;
if (!commit || (uitIndex >= 0 && !args[uitIndex + 1])) {
  console.error('Gebruik: node scripts/sjablonen-migratie.mjs <oude-commit> [--uit <bestand.sql>]');
  process.exit(2);
}

const MAX_OPDRACHT = 100_000; // tekens per opdracht (D1: hooguit 100 KB per SQL-opdracht)
const q = (t) => `'${String(t).replace(/'/g, "''")}'`;

/** De vaste vorm van de standaardsjablonen volgens één versie van de code. */
async function standaard(map) {
  const beheer = await import(pathToFileURL(join(map, 'src', 'lib', 'sjablonen-beheer.js')).href);
  const uitkomst = new Map();
  for (const s of beheer.INGEBOUWD) {
    uitkomst.set(s.id, {
      naam: String(s.naam || s.id).trim().slice(0, 150),
      omschrijving: String(s.omschrijving || '').trim().slice(0, 1000),
      inhoud: JSON.stringify(beheer.controleerSjabloonInhoud(s.inhoud)),
    });
  }
  return uitkomst;
}

const tmp = mkdtempSync(join(tmpdir(), 'sjablonen-oud-'));
try {
  const volledig = execFileSync('git', ['rev-parse', '--verify', `${commit}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim();
  // De oude bestanden uitpakken (src en de zuivere modules uit public/js/beheer waar src naar verwijst).
  const archief = join(tmp, 'oud.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', archief, volledig, 'src', 'public/js/beheer'], { cwd: ROOT });
  execFileSync('tar', ['-xf', archief, '-C', tmp]);
  writeFileSync(join(tmp, 'package.json'), '{"type":"module"}\n');

  const oud = await standaard(tmp);
  const nieuw = await standaard(ROOT);
  const regels = [
    '-- Standaardsjablonen bijwerken (BOUWPLAN B16): achtergrondvragen krijgen hun kenmerk (afdeling, diensttijd,',
    '-- leidinggevend), de ja/nee-vraag over aanbevelen wordt een cijfervraag van 0 tot 10 (eNPS) en medewerkerstevredenheid',
    '-- krijgt een rapportcijfer. Alleen sjablonen die nog precies gelijk zijn aan de vorige versie worden bijgewerkt:',
    '-- eigen aanpassingen blijven staan.',
    `-- Gemaakt met: node scripts/sjablonen-migratie.mjs ${volledig.slice(0, 12)} (niet met de hand wijzigen).`,
  ];
  let aantal = 0;
  for (const [id, n] of nieuw) {
    const o = oud.get(id);
    if (!o) continue; // een nieuw standaardsjabloon wordt vanzelf geplaatst
    if (o.naam === n.naam && o.omschrijving === n.omschrijving && o.inhoud === n.inhoud) continue;
    const opdracht = `UPDATE sjablonen SET naam = ${q(n.naam)}, omschrijving = ${q(n.omschrijving)}, inhoud = ${q(n.inhoud)} `
      + `WHERE bron = ${q(id)} AND naam = ${q(o.naam)} AND omschrijving = ${q(o.omschrijving)} AND inhoud = ${q(o.inhoud)};`;
    if (opdracht.length > MAX_OPDRACHT) throw new Error(`De opdracht voor ${id} is te lang (${opdracht.length} tekens).`);
    regels.push(opdracht);
    aantal++;
  }
  const tekst = `${regels.join('\n')}\n`;
  if (uit) writeFileSync(uit, tekst);
  else process.stdout.write(tekst);
  console.error(`${aantal} sjablonen in de migratie${uit ? ` (${uit})` : ''}.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
