// Serveert de pagina's, opmaak en scripts uit public/ (gebundeld door scripts/bundel-statisch.mjs).
import { BESTANDEN } from '../../gen/statisch.js';

function zoek(pad) {
  if (pad === '/' || pad === '') return BESTANDEN['/index.html'];
  return BESTANDEN[pad] || BESTANDEN[`${pad}.html`] || BESTANDEN[`${pad.replace(/\/$/, '')}/index.html`] || null;
}

/** Tekst als tekst; binaire bestanden (base64 in de bundel) één keer omzetten naar bytes. */
function inhoudVan(bestand) {
  if (!bestand.b64) return bestand.inhoud;
  if (!bestand.bytes) {
    const ruw = atob(bestand.inhoud);
    const bytes = new Uint8Array(ruw.length);
    for (let i = 0; i < ruw.length; i++) bytes[i] = ruw.charCodeAt(i);
    bestand.bytes = bytes;
  }
  return bestand.bytes;
}

/** Geeft het bestand voor een pad, of de 404-pagina (status 404). */
export function serveer(request, pad) {
  const methode = request.method.toUpperCase();
  if (methode !== 'GET' && methode !== 'HEAD') {
    return new Response('Niet toegestaan', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  let bestand = zoek(pad);
  let status = 200;
  if (!bestand) {
    bestand = BESTANDEN['/404.html'];
    status = 404;
  }
  const koppen = {
    'Content-Type': bestand.type,
    ETag: bestand.etag,
    // Altijd even controleren of er een nieuwe versie is (goedkoop dankzij ETag).
    // Lettertypen en afbeeldingen veranderen zelden: die mag de browser een dag bewaren.
    'Cache-Control': bestand.b64 ? 'public, max-age=86400' : 'no-cache',
  };
  if (status === 200 && request.headers.get('If-None-Match') === bestand.etag) {
    return new Response(null, { status: 304, headers: koppen });
  }
  return new Response(methode === 'HEAD' ? null : inhoudVan(bestand), { status, headers: koppen });
}
