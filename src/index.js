// Onderzoeksomgeving – Cloudflare Worker
// Verwerkt /api/* (beheer en openbare vragenlijst), /v/<code> (openbare vragenlijstpagina)
// en serveert de pagina's, opmaak en scripts uit /public (gebundeld bij het bouwen).

import { Fout, json, foutAntwoord, metKoppen, leesJson, controleerHerkomst } from './lib/http.js';
import { inloggen, uitloggen, isIngelogd, vereisInlog } from './lib/auth.js';
import { serveer } from './lib/statisch.js';
import {
  SCHALEN, SCHAAL_NAMEN, VRAAGTYPEN, INVOERSOORTEN, STUKSOORTEN, ACTIESTATUSSEN, DREMPEL, CIJFERSCHALEN,
} from './lib/schalen.js';
import { KENMERKEN, KENMERKVRAGEN } from '../public/js/beheer/kenmerken.js';
import * as onderzoeken from './routes/onderzoeken.js';
import * as opzet from './routes/opzet.js';
import * as vragenlijsten from './routes/vragenlijsten.js';
import * as publiek from './routes/publiek.js';
import * as dashboard from './routes/dashboard.js';
import * as invoer from './routes/invoer.js';
import * as stukken from './routes/stukken.js';
import * as acties from './routes/acties.js';
import * as exporteren from './routes/export.js';
import * as delen from './routes/delen.js';
import * as rapporten from './routes/rapporten.js';
import * as inlezen from './routes/inlezen.js';
// Uitbreidingen: elk pakket voegt zijn imports alleen direct onder zijn eigen regel toe.
// [P2] Vraagmodel (cijfervraag, achtergrondkenmerken)
// [P3] HR-analytics (instellingen, personeelscijfers)
import * as hr from './routes/hr.js';
// [P4] Werkbank (definities, analyses)
import * as werkbank from './routes/werkbank.js';
// [P5] Bibliotheek, bronnen bij een onderzoek en coderen
import * as bibliotheek from './routes/bibliotheek.js';
import * as codering from './routes/codering.js';
// [P6] Rapporten v2

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
  ['POST', `${B}/sjablonen`, onderzoeken.sjabloonNieuw],
  ['POST', `${B}/sjablonen/herstellen`, onderzoeken.sjablonenHerstellen],
  ['POST', `${B}/sjablonen/samenvoegen`, onderzoeken.sjablonenSamenvoegen],
  ['GET', `${B}/sjablonen/:sjabloon`, onderzoeken.sjabloonDetail],
  ['PUT', `${B}/sjablonen/:sjabloon`, onderzoeken.sjabloonWijzig],
  ['DELETE', `${B}/sjablonen/:sjabloon`, onderzoeken.sjabloonVerwijder],
  ['POST', `${B}/sjablonen/:sjabloon/origineel`, onderzoeken.sjabloonOrigineel],

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
  ['PUT', `${B}/vragenlijsten/:id/uitnodiging`, vragenlijsten.uitnodiging],
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

  // export/data?zonder_inzendingen=1 geeft alleen de kop; de antwoorden komen dan in delen via export/inzendingen.
  ['GET', `${B}/onderzoeken/:id/export/data`, exporteren.data],
  ['GET', `${B}/onderzoeken/:id/export/inzendingen`, exporteren.inzendingen],
  ['GET', `${B}/onderzoeken/:id/export/stukken.txt`, exporteren.stukkenTxt],

  ['GET', `${B}/onderzoeken/:id/rapporten`, rapporten.lijst],
  ['POST', `${B}/onderzoeken/:id/rapporten`, rapporten.nieuw],
  ['GET', `${B}/rapporten/:id`, rapporten.detail],
  ['PUT', `${B}/rapporten/:id`, rapporten.wijzig],
  ['PUT', `${B}/rapporten/:id/feiten`, rapporten.feiten],
  ['DELETE', `${B}/rapporten/:id`, rapporten.verwijder],

  // Inlezen uit Excel of CSV (het bestand zelf wordt in de browser gelezen; hier komen alleen de gegevens)
  ['POST', `${B}/onderzoeken/:id/invoer/reeks`, inlezen.cijfers],
  ['POST', `${B}/vragenlijsten/:id/vragen/reeks`, inlezen.vragen],
  ['POST', `${B}/vragenlijsten/:id/inzendingen/reeks`, inlezen.antwoorden],
  ['GET', `${B}/onderzoeken/:id/datasets`, inlezen.datasetLijst],
  ['POST', `${B}/onderzoeken/:id/datasets`, inlezen.datasetNieuw],
  ['GET', `${B}/datasets/:id`, inlezen.datasetDetail],
  ['DELETE', `${B}/datasets/:id`, inlezen.datasetVerwijder],

  ['GET', `${B}/onderzoeken/:id/deellinks`, delen.lijst],
  ['POST', `${B}/onderzoeken/:id/deellinks`, delen.nieuw],
  ['PUT', `${B}/deellinks/:id`, delen.wijzig],
  ['DELETE', `${B}/deellinks/:id`, delen.verwijder],
  ['POST', `${B}/deellinks/:id/nieuwe-toegangscode`, delen.nieuweCode],

  // Uitbreidingen: elk pakket voegt zijn routes alleen direct onder zijn eigen regel toe.
  // [P2] Vraagmodel: kenmerkvragen en kenmerk per vraag
  ['POST', `${B}/vragenlijsten/:id/kenmerkvragen`, vragenlijsten.kenmerkVragen],
  ['PUT', `${B}/vragen/:id/kenmerk`, vragenlijsten.vraagKenmerk],
  // [P3] HR-analytics: instellingen en personeelscijfers
  ['GET', `${B}/onderzoeken/:id/hr`, hr.lees],
  ['PUT', `${B}/onderzoeken/:id/hr`, hr.wijzig],
  ['GET', `${B}/onderzoeken/:id/personeelscijfers`, hr.personeelLijst],
  ['POST', `${B}/onderzoeken/:id/personeelscijfers`, hr.personeelNieuw],
  ['GET', `${B}/personeelscijfers/:id`, hr.personeelDetail],
  ['PUT', `${B}/personeelscijfers/:id`, hr.personeelWijzig],
  ['DELETE', `${B}/personeelscijfers/:id`, hr.personeelVerwijder],
  // [P4] Werkbank: definities en analyses
  ['GET', `${B}/onderzoeken/:id/werkbank`, werkbank.overzicht],
  ['POST', `${B}/onderzoeken/:id/werkbank/definities`, werkbank.definitieNieuw],
  ['PUT', `${B}/werkbank/definities/:id`, werkbank.definitieWijzig],
  ['DELETE', `${B}/werkbank/definities/:id`, werkbank.definitieVerwijder],
  ['POST', `${B}/onderzoeken/:id/werkbank/analyses`, werkbank.analyseNieuw],
  ['PUT', `${B}/werkbank/analyses/:id`, werkbank.analyseWijzig],
  ['DELETE', `${B}/werkbank/analyses/:id`, werkbank.analyseVerwijder],
  // [P5] Bibliotheek, bronnen bij een onderzoek en coderen
  // (vaste paden voor :id, zoals bij de sjablonen)
  ['GET', `${B}/bibliotheek`, bibliotheek.lijst],
  ['POST', `${B}/bibliotheek`, bibliotheek.nieuw],
  ['POST', `${B}/bibliotheek/reeks`, bibliotheek.reeks],
  ['POST', `${B}/bibliotheek/herstellen`, bibliotheek.herstellen],
  ['GET', `${B}/bibliotheek/:id`, bibliotheek.detail],
  ['PUT', `${B}/bibliotheek/:id`, bibliotheek.wijzig],
  ['DELETE', `${B}/bibliotheek/:id`, bibliotheek.verwijder],
  ['POST', `${B}/bibliotheek/:id/kopie`, bibliotheek.kopie],
  ['PUT', `${B}/bibliotheek/:id/verbergen`, bibliotheek.verbergen],
  ['GET', `${B}/onderzoeken/:id/bronnen`, bibliotheek.onderzoekBronnen],
  ['PUT', `${B}/onderzoeken/:id/bronnen/:bron`, bibliotheek.koppel],
  ['DELETE', `${B}/onderzoeken/:id/bronnen/:bron`, bibliotheek.ontkoppel],
  ['GET', `${B}/onderzoeken/:id/codering`, codering.overzicht],
  ['POST', `${B}/onderzoeken/:id/codes`, codering.codeNieuw],
  ['PUT', `${B}/codes/:id`, codering.codeWijzig],
  ['DELETE', `${B}/codes/:id`, codering.codeVerwijder],
  ['PUT', `${B}/onderzoeken/:id/coderingen`, codering.coderingen],
  ['POST', `${B}/onderzoeken/:id/citaten`, codering.citaatNieuw],
  ['PUT', `${B}/citaten/:id`, codering.citaatWijzig],
  ['DELETE', `${B}/citaten/:id`, codering.citaatVerwijder],
  // [P6] Rapporten v2
];

const PUBLIEKE_ROUTES = [
  ['POST', '/api/inloggen', async ({ request, env }) => inloggen(request, env, await leesJson(request, 10_000))],
  ['POST', '/api/uitloggen', ({ request, env }) => uitloggen(request, env)],
  ['GET', '/api/sessie', async ({ request, env }) => json({ ingelogd: await isIngelogd(request, env) })],
  ['GET', '/api/publiek/:code', publiek.ophalen],
  ['POST', '/api/publiek/:code', publiek.insturen],
  // Alleen-lezen inzage via een deellink met toegangscode
  ['GET', '/api/kijk/:code', delen.status],
  ['POST', '/api/kijk/:code/toegang', delen.toegang],
  ['POST', '/api/kijk/:code/sluiten', delen.sluiten],
  ['GET', '/api/kijk/:code/overzicht', delen.overzicht],
  ['GET', '/api/kijk/:code/dashboard', delen.dashboard],
  ['GET', '/api/kijk/:code/stukken/:id', delen.stuk],
  ['GET', '/api/kijk/:code/rapporten/:id', delen.rapport],
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
    cijferschalen: CIJFERSCHALEN,
    kenmerken: KENMERKEN,
    kenmerkvragen: KENMERKVRAGEN,
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
      if (url.pathname.startsWith('/d/')) {
        // Alleen-lezen inzage: altijd dezelfde pagina, het script vraagt om de toegangscode.
        if (!/^\/d\/[A-Za-z0-9_-]{16,40}\/?$/.test(url.pathname)) {
          return metKoppen(serveer(request, '/__bestaat-niet'));
        }
        return metKoppen(serveer(request, '/kijk.html'));
      }
      if (url.pathname.startsWith('/v/')) {
        // De openbare vragenlijstpagina: altijd dezelfde pagina, het script haalt de vragen op.
        if (!/^\/v\/[A-Za-z0-9_-]{16,40}\/?$/.test(url.pathname)) {
          return metKoppen(serveer(request, '/__bestaat-niet'));
        }
        return metKoppen(serveer(request, '/vragenlijst.html'));
      }
      return metKoppen(serveer(request, url.pathname));
    } catch (fout) {
      return metKoppen(foutAntwoord(fout));
    }
  },
};
