// Zet de bestanden uit public/ (pagina's, opmaak, scripts) in één module die de Worker zelf
// serveert. Wrangler voert dit automatisch uit vóór `wrangler dev` en `wrangler deploy`
// (zie "build" in wrangler.jsonc). Het resultaat (gen/statisch.js) staat niet in git.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
// Binaire bestanden (lettertypen, afbeeldingen) gaan als base64 mee.
const BINAIR = {
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

function bestanden(map) {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? bestanden(pad) : [pad];
  });
}

const uit = {};
for (const pad of bestanden(PUBLIC).sort()) {
  const ext = extname(pad);
  const type = TYPEN[ext] || BINAIR[ext];
  if (!type) continue; // alleen bekende bestandstypen
  const binair = !!BINAIR[ext];
  const ruw = readFileSync(pad);
  const etag = `"${createHash('sha256').update(ruw).digest('hex').slice(0, 20)}"`;
  const item = { type, etag, inhoud: binair ? ruw.toString('base64') : ruw.toString('utf8') };
  if (binair) item.b64 = true;
  uit[`/${relative(PUBLIC, pad).split('\\').join('/')}`] = item;
}

mkdirSync(join(ROOT, 'gen'), { recursive: true });
writeFileSync(
  join(ROOT, 'gen', 'statisch.js'),
  `// Automatisch gemaakt door scripts/bundel-statisch.mjs – niet met de hand wijzigen.\nexport const BESTANDEN = ${JSON.stringify(uit)};\n`,
);
console.log(`Statische bestanden gebundeld: ${Object.keys(uit).length}`);
