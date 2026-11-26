// Serveert de pagina's, opmaak en scripts uit public/ (gebundeld door scripts/bundel-statisch.mjs).
import { BESTANDEN } from '../../gen/statisch.js';

function zoek(pad) {
  if (pad === '/' || pad === '') return BESTANDEN['/index.html'];
  return BESTANDEN[pad] || BESTANDEN[`${pad}.html`] || BESTANDEN[`${pad.replace(/\/$/, '')}/index.html`] || null;
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
    'Cache-Control': 'no-cache',
  };
  if (status === 200 && request.headers.get('If-None-Match') === bestand.etag) {
    return new Response(null, { status: 304, headers: koppen });
  }
  return new Response(methode === 'HEAD' ? null : bestand.inhoud, { status, headers: koppen });
}
