// Hulpfuncties voor HTTP-antwoorden, fouten en het inlezen van verzoeken.

/** Fout die als nette JSON-melding naar de browser gaat. */
export class Fout extends Error {
  constructor(status, melding, extra = {}) {
    super(melding);
    this.status = status;
    this.extra = extra;
  }
}

/** Beveiligingskoppen voor alle antwoorden van de Worker. */
export const BEVEILIGINGSKOPPEN = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; " +
    "form-action 'self'; frame-ancestors 'none'",
};

export function metKoppen(response, extra = {}, status = response.status) {
  const koppen = new Headers(response.headers);
  for (const [k, v] of Object.entries(BEVEILIGINGSKOPPEN)) {
    if (!koppen.has(k)) koppen.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) koppen.set(k, v);
  return new Response(response.body, {
    status,
    statusText: status === response.status ? response.statusText : '',
    headers: koppen,
  });
}

export function json(data, status = 200, extraKoppen = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraKoppen,
    },
  });
}

export function foutAntwoord(fout) {
  if (fout instanceof Fout) {
    return json({ fout: fout.message, ...fout.extra }, fout.status);
  }
  // Onverwachte fout: geen details naar buiten.
  console.error('Onverwachte fout:', fout && fout.stack ? fout.stack : fout);
  return json({ fout: 'Er ging iets mis aan de serverkant. Probeer het opnieuw.' }, 500);
}

export function bestand(inhoud, bestandsnaam, contentType) {
  const veilig = bestandsnaam.replace(/[^A-Za-z0-9._-]+/g, '-');
  return new Response(inhoud, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${veilig}"`,
      'Cache-Control': 'no-store',
    },
  });
}

const MAX_BODY = 1_000_000; // 1 MB, ruim genoeg voor een lang conceptrapport

/** Leest een JSON-body in met grootte- en typecontrole. */
export async function leesJson(request, maxBytes = MAX_BODY) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new Fout(415, 'Verzoek moet JSON bevatten.');
  }
  const lengte = Number(request.headers.get('Content-Length') || 0);
  if (lengte > maxBytes) throw new Fout(413, 'Het verzoek is te groot.');
  const tekst = await request.text();
  if (tekst.length > maxBytes) throw new Fout(413, 'Het verzoek is te groot.');
  if (!tekst) return {};
  try {
    const data = JSON.parse(tekst);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('geen object');
    }
    return data;
  } catch {
    throw new Fout(400, 'Het verzoek bevat geen geldige gegevens.');
  }
}

/**
 * Bescherming tegen verzoeken vanaf andere websites (CSRF):
 * wijzigende verzoeken moeten van dezelfde herkomst komen.
 */
export function controleerHerkomst(request) {
  const methode = request.method.toUpperCase();
  if (methode === 'GET' || methode === 'HEAD') return;
  const herkomst = request.headers.get('Origin');
  const eigen = new URL(request.url).origin;
  if (herkomst && herkomst !== eigen) {
    throw new Fout(403, 'Verzoek van een andere website geweigerd.');
  }
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new Fout(403, 'Verzoek van een andere website geweigerd.');
  }
}
