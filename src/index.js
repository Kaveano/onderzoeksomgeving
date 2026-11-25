// Onderzoeksomgeving – Cloudflare Worker
// Verwerkt /api/* (beheer en openbare vragenlijst) en /v/<code> (openbare vragenlijstpagina).
// Alle andere pagina's (beheeromgeving, opmaak, scripts) zijn statische bestanden uit /public.

import { Fout, json, foutAntwoord, metKoppen, leesJson, controleerHerkomst } from './lib/http.js';
import { inloggen, uitloggen, isIngelogd, vereisInlog } from './lib/auth.js';
import { SCHALEN, SCHAAL_NAMEN, VRAAGTYPEN, INVOERSOORTEN, STUKSOORTEN, ACTIESTATUSSEN, DREMPEL } from './lib/schalen.js';
import * as onderzoeken from './routes/onderzoeken.js';
import * as opzet from './routes/opzet.js';
import * as vragenlijsten from './routes/vragenlijsten.js';
import * as publiek from './routes/publiek.js';
import * as dashboard from './routes/dashboard.js';
import * as invoer from './routes/invoer.js';
import * as stukken from './routes/stukken.js';
import * as acties from './routes/acties.js';
import * as exporteren from './routes/export.js';

const B = '/api/beheer';

// [methode, pad, handler]. :naam = variabel deel van het pad.
const BEHEER_ROUTES = [
  ['GET', `${B}/instellingen`, instellingen],

  ['GET', `${B}/onderzoeken`, onderzoeken.lijst],
  ['POST', `${B}/onderzoeken`, onderzoeken.nieuw],
  ['GET', `${B}/onderzoeken/:id`, onderzoeken.detail],
  ['PUT', `${B}/onderzoeken/:id`, onderzoeken.wijzig],
  ['DELETE', `${B}/onderzoeken/:id`, onderzoeken.verwijderen],
  ['POST', `${B}/onderzoeken/:id/archiveren`, onderzoeken.archiveren],
  ['POST', `${B}/onderzoeken/:id/sjabloon`, onderzoeken.sjabloonToepassen],
  ['POST', `${B}/onderzoeken/:id/als-sjabloon`, onderzoeken.alsSjabloon],

  ['GET', `${B}/sjablonen`, onderzoeken.sjablonenLijst],
  ['GET', `${B}/sjablonen/:sjabloon`, onderzoeken.sjabloonDetail],
  ['PUT', `${B}/sjablonen/:sjabloon`, onderzoeken.sjabloonWijzig],
  ['DELETE', `${B}/sjablonen/:sjabloon`, onderzoeken.sjabloonVerwijder],

  ['POST', `${B}/onderzoeken/:id/themas`, opzet.themaNieuw],
  ['PUT', `${B}/themas/:id`, opzet.themaWijzig],
  ['DELETE', `${B}/themas/:id`, opzet.themaVerwijder],
  ['POST', `${B}/themas/:id/meetpunten`, opzet.meetpuntNieuw],
  ['PUT', `${B}/meetpunten/:id`, opzet.meetpuntWijzig],
  ['DELETE', `${B}/meetpunten/:id`, opzet.meetpuntVerwijder],
  ['POST', `${B}/onderzoeken/:id/meetmomenten`, opzet.meetmomentNieuw],
  ['PUT', `${B}/meetmomenten/:id`, opzet.meetmomentWijzig],
  ['DELETE', `${B}/meetmomenten/:id`, opzet.meetmomentVerwijder],
  ['POST', `${B}/volgorde`, opzet.volgorde],

  ['GET', `${B}/onderzoeken/:id/vragenlijsten`, vragenlijsten.lijst],
  ['POST', `${B}/onderzoeken/:id/vragenlijsten`, vragenlijsten.nieuw],
  ['GET', `${B}/vragenlijsten/:id`, vragenlijsten.detail],
  ['PUT', `${B}/vragenlijsten/:id`, vragenlijsten.wijzig],
  ['DELETE', `${B}/vragenlijsten/:id`, vragenlijsten.verwijder],
  ['POST', `${B}/vragenlijsten/:id/status`, vragenlijsten.status],
  ['POST', `${B}/vragenlijsten/:id/kopie`, vragenlijsten.kopie],
  ['POST', `${B}/vragenlijsten/:id/nieuwe-code`, vragenlijsten.nieuweCode],
  ['DELETE', `${B}/vragenlijsten/:id/inzendingen`, vragenlijsten.wisInzendingen],
  ['POST', `${B}/vragenlijsten/:id/vragen`, vragenlijsten.vraagNieuw],
  ['PUT', `${B}/vragen/:id`, vragenlijsten.vraagWijzig],
  ['DELETE', `${B}/vragen/:id`, vragenlijsten.vraagVerwijder],

  ['GET', `${B}/onderzoeken/:id/dashboard`, dashboard.dashboard],

  ['GET', `${B}/onderzoeken/:id/invoer`, invoer.lijst],
  ['POST', `${B}/onderzoeken/:id/invoer`, invoer.nieuw],
  ['PUT', `${B}/invoer/:id`, invoer.wijzig],
  ['DELETE', `${B}/invoer/:id`, invoer.verwijder],

  ['GET', `${B}/onderzoeken/:id/stukken`, stukken.lijst],
  ['POST', `${B}/onderzoeken/:id/stukken`, stukken.nieuw],
  ['GET', `${B}/stukken/:id`, stukken.detail],
  ['PUT', `${B}/stukken/:id`, stukken.wijzig],
  ['DELETE', `${B}/stukken/:id`, stukken.verwijder],
  ['POST', `${B}/stukken/:id/toevoegen`, stukken.toevoegen],
  ['GET', `${B}/stukken/:id/download`, stukken.download],

  ['GET', `${B}/onderzoeken/:id/acties`, acties.lijst],
  ['POST', `${B}/onderzoeken/:id/acties`, acties.nieuw],
  ['PUT', `${B}/acties/:id`, acties.wijzig],
  ['DELETE', `${B}/acties/:id`, acties.verwijder],

  ['GET', `${B}/onderzoeken/:id/export/data`, exporteren.data],
  ['GET', `${B}/onderzoeken/:id/export/stukken.txt`, exporteren.stukkenTxt],
];

const PUBLIEKE_ROUTES = [
  ['POST', '/api/inloggen', async ({ request, env }) => inloggen(request, env, await leesJson(request, 10_000))],
  ['POST', '/api/uitloggen', ({ request, env }) => uitloggen(request, env)],
  ['GET', '/api/sessie', async ({ request, env }) => json({ ingelogd: await isIngelogd(request, env) })],
  ['GET', '/api/publiek/:code', publiek.ophalen],
  ['POST', '/api/publiek/:code', publiek.insturen],
];

function instellingen() {
  return json({
    schalen: SCHALEN,
    schaal_namen: SCHAAL_NAMEN,
    vraagtypen: VRAAGTYPEN,
    invoersoorten: INVOERSOORTEN,
    stuksoorten: STUKSOORTEN,
    actiestatussen: ACTIESTATUSSEN,
    drempel: DREMPEL,
  });
}

function compileer(routes) {
  return routes.map(([methode, pad, handler]) => {
    const namen = [];
    const patroon = pad.replace(/[.]/g, '\\.').replace(/:([a-z]+)/g, (_, naam) => {
      namen.push(naam);
      return '([^/]+)';
    });
    return { methode, regex: new RegExp(`^${patroon}$`), namen, handler };
  });
}

const BEHEER = compileer(BEHEER_ROUTES);
const PUBLIEK = compileer(PUBLIEKE_ROUTES);

function zoek(routes, methode, pad) {
  let padBestaat = false;
  for (const r of routes) {
    const m = r.regex.exec(pad);
    if (!m) continue;
    padBestaat = true;
    if (r.methode !== methode) continue;
    const params = {};
    try {
      r.namen.forEach((naam, i) => {
        params[naam] = decodeURIComponent(m[i + 1]);
      });
    } catch {
      throw new Fout(404, 'Onbekend adres.');
    }
    return { handler: r.handler, params };
  }
  if (padBestaat) throw new Fout(405, 'Deze actie is hier niet toegestaan.');
  return null;
}

async function api(request, env, url) {
  const methode = request.method.toUpperCase();
  controleerHerkomst(request);

  if (url.pathname.startsWith(`${B}/`)) {
    const gevonden = zoek(BEHEER, methode, url.pathname);
    if (!gevonden) throw new Fout(404, 'Onbekend adres.');
    await vereisInlog(request, env);
    return gevonden.handler({ request, env, url, params: gevonden.params });
  }
  const gevonden = zoek(PUBLIEK, methode, url.pathname);
  if (!gevonden) throw new Fout(404, 'Onbekend adres.');
  return gevonden.handler({ request, env, url, params: gevonden.params });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) {
        return metKoppen(await api(request, env, url));
      }
      if (url.pathname.startsWith('/v/')) {
        // De openbare vragenlijstpagina: altijd dezelfde statische pagina, het script haalt de vragen op.
        if (!/^\/v\/[A-Za-z0-9_-]{16,40}\/?$/.test(url.pathname)) {
          return metKoppen(await env.ASSETS.fetch(new Request(new URL('/__bestaat-niet', url), { method: 'GET' })), {}, 404);
        }
        const pagina = await env.ASSETS.fetch(new Request(new URL('/vragenlijst', url), { method: 'GET' }));
        return metKoppen(pagina, { 'Cache-Control': 'no-store' });
      }
      return metKoppen(await env.ASSETS.fetch(request));
    } catch (fout) {
      return metKoppen(foutAntwoord(fout));
    }
  },
};
