// Koppeling met de server. Alle beheerverzoeken gaan via /api/beheer.
// Bij een fout wordt een ApiFout gegooid met een Nederlandse melding (fout.message).

export class ApiFout extends Error {
  constructor(status, melding, data) {
    super(melding);
    this.status = status;
    this.data = data;
  }
}

const BASIS = '/api/beheer';

async function verzoek(methode, pad, body, { keepalive = false } = {}) {
  let r;
  try {
    r = await fetch(pad.startsWith('/api/') ? pad : BASIS + pad, {
      method: methode,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive,
    });
  } catch {
    throw new ApiFout(0, 'Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.');
  }
  let data = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  if (r.status === 401 && !pad.startsWith('/api/inloggen')) {
    window.dispatchEvent(new CustomEvent('niet-ingelogd'));
  }
  if (!r.ok) {
    throw new ApiFout(r.status, (data && data.fout) || `Er ging iets mis (code ${r.status}).`, data);
  }
  return data;
}

export const api = {
  get: (pad) => verzoek('GET', pad),
  post: (pad, body = {}) => verzoek('POST', pad, body),
  // opties.keepalive: true laat het verzoek ook afmaken als het tabblad wordt gesloten (max. 64 kB).
  put: (pad, body = {}, opties) => verzoek('PUT', pad, body, opties),
  del: (pad, body) => verzoek('DELETE', pad, body),
};

/** URL voor een download (export); de browser stuurt de sessiecookie automatisch mee. */
export function downloadUrl(pad) {
  return BASIS + pad;
}
