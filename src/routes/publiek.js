// Openbare vragenlijst: ophalen en insturen. Geen account nodig.
// Er wordt GEEN naam, e-mail, IP-adres, browserinformatie of tijdstip opgeslagen; alleen de datum.
// Inzendingen krijgen een willekeurig id, zodat de volgorde van invullen niet te herleiden is.

import { Fout, json, leesJson } from '../lib/http.js';
import { alle, een, vandaagNL } from '../lib/db.js';
import { SCHALEN, WEET_NIET } from '../lib/schalen.js';

// Limieten tegen misbruik, per link.
export const LIMIET_PER_10_MIN = 100;
export const LIMIET_PER_DAG = 1000;
const MAX_OPEN_ANTWOORD = 5000;
const MAX_BODY = 200_000;

const CODE_PATROON = /^[A-Za-z0-9_-]{16,40}$/;

async function haalVragenlijst(env, code) {
  if (!CODE_PATROON.test(code)) throw new Fout(404, 'Deze vragenlijst bestaat niet. Controleer de link.');
  const vl = await een(
    env,
    `SELECT vl.*, o.status AS onderzoek_status, o.bedrijfsnaam
     FROM vragenlijsten vl JOIN onderzoeken o ON o.id = vl.onderzoek_id
     WHERE vl.code = ?`,
    code,
  );
  if (!vl) throw new Fout(404, 'Deze vragenlijst bestaat niet. Controleer de link.');
  return vl;
}

function isOpen(vl) {
  return vl.status === 'open' && vl.onderzoek_status === 'actief';
}

async function haalVragen(env, vragenlijstId) {
  return alle(
    env,
    `SELECT q.*, t.naam AS thema_naam, t.id AS t_id FROM vragen q JOIN themas t ON t.id = q.thema_id
     WHERE q.vragenlijst_id = ? ORDER BY t.volgorde, t.id, q.volgorde, q.id`,
    vragenlijstId,
  );
}

export async function ophalen({ env, params }) {
  const vl = await haalVragenlijst(env, params.code);
  if (!isOpen(vl)) {
    return json({ status: 'gesloten', titel: vl.titel });
  }
  const vragen = await haalVragen(env, vl.id);
  const themas = [];
  for (const q of vragen) {
    let t = themas[themas.length - 1];
    if (!t || t.id !== q.t_id) {
      t = { id: q.t_id, naam: q.thema_naam, vragen: [] };
      themas.push(t);
    }
    t.vragen.push({
      id: q.id,
      type: q.type,
      tekst: q.tekst,
      toelichting: q.toelichting,
      opties: q.type === 'meerkeuze' ? JSON.parse(q.opties || '[]') : undefined,
      meerdere_antwoorden: q.type === 'meerkeuze' ? !!q.meerdere_antwoorden : undefined,
      schaal_labels: q.type === 'schaal' ? SCHALEN[q.schaal_soort] || SCHALEN.eens : undefined,
      weet_niet: q.type === 'schaal' ? !!q.weet_niet : undefined,
      verplicht: !!q.verplicht,
    });
  }
  return json({
    status: 'open',
    titel: vl.titel,
    introtekst: vl.introtekst,
    themas: themas.map(({ naam, vragen: vr }) => ({ naam, vragen: vr })),
  });
}

/** Controleert één antwoord; geeft de schone waarde of undefined (= niet beantwoord). */
function controleerAntwoord(vraag, waarde) {
  if (waarde === undefined || waarde === null || waarde === '') return undefined;
  switch (vraag.type) {
    case 'schaal': {
      if (waarde === WEET_NIET) {
        if (!vraag.weet_niet) throw new Fout(400, 'Ongeldig antwoord.');
        return WEET_NIET;
      }
      const n = typeof waarde === 'string' ? Number(waarde) : waarde;
      if (!Number.isInteger(n) || n < 1 || n > 5) throw new Fout(400, 'Ongeldig antwoord op een schaalvraag.');
      return n;
    }
    case 'janee':
      if (waarde !== 'ja' && waarde !== 'nee') throw new Fout(400, 'Ongeldig antwoord op een ja/nee-vraag.');
      return waarde;
    case 'meerkeuze': {
      const geldig = new Set(JSON.parse(vraag.opties || '[]').map((o) => o.id));
      if (vraag.meerdere_antwoorden) {
        if (!Array.isArray(waarde)) throw new Fout(400, 'Ongeldig antwoord op een meerkeuzevraag.');
        const keuzes = [...new Set(waarde)];
        if (keuzes.length > geldig.size || keuzes.some((k) => typeof k !== 'string' || !geldig.has(k))) {
          throw new Fout(400, 'Ongeldig antwoord op een meerkeuzevraag.');
        }
        return keuzes.length ? keuzes : undefined;
      }
      if (typeof waarde !== 'string' || !geldig.has(waarde)) throw new Fout(400, 'Ongeldig antwoord op een meerkeuzevraag.');
      return waarde;
    }
    case 'open': {
      if (typeof waarde !== 'string') throw new Fout(400, 'Ongeldig antwoord op een open vraag.');
      const t = waarde.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
      if (t.length > MAX_OPEN_ANTWOORD) {
        throw new Fout(400, `Een antwoord mag maximaal ${MAX_OPEN_ANTWOORD} tekens lang zijn.`);
      }
      return t || undefined;
    }
    default:
      return undefined;
  }
}

/** Willekeurig positief geheel getal (max. 2^53) als id, zodat ids niets zeggen over de volgorde. */
function willekeurigId() {
  const [a, b] = crypto.getRandomValues(new Uint32Array(2));
  return (a & 0x1fffff) * 0x100000000 + b + 1;
}

function tijdvak(nu = new Date()) {
  // '2026-11-25T14:3' = tijdvak van 10 minuten (UTC)
  return nu.toISOString().slice(0, 15);
}

export async function insturen({ request, env, params }) {
  const vl = await haalVragenlijst(env, params.code);
  if (!isOpen(vl)) throw new Fout(409, 'Deze vragenlijst is gesloten. Je antwoorden zijn niet opgeslagen.');

  const body = await leesJson(request, MAX_BODY);

  // Lokaas-veld: mensen zien het niet, robots vullen het vaak wel in.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ ok: true, bedanktekst: vl.bedanktekst });
  }

  const ruw = body.antwoorden;
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) throw new Fout(400, 'Er zijn geen antwoorden ontvangen.');

  const vragen = await haalVragen(env, vl.id);
  const antwoorden = {};
  const ontbrekend = [];
  for (const q of vragen) {
    const waarde = controleerAntwoord(q, ruw[String(q.id)]);
    if (waarde === undefined) {
      if (q.verplicht) ontbrekend.push(q.id);
    } else {
      antwoorden[String(q.id)] = waarde;
    }
  }
  if (ontbrekend.length) {
    throw new Fout(400, 'Niet alle verplichte vragen zijn beantwoord.', { ontbrekend });
  }
  if (!Object.keys(antwoorden).length) {
    throw new Fout(400, 'Je hebt nog geen vragen beantwoord.');
  }

  // Opslaan en limieten controleren in één ondeelbare batch (een D1-batch is één transactie):
  // eerst de teller ophogen, dan de inzending alleen toevoegen als alle limieten nog niet bereikt zijn.
  // Het id van een inzending is willekeurig, zodat de volgorde van invullen niet te herleiden is.
  const vak = tijdvak();
  const dag = vak.slice(0, 10);
  const gisteren = tijdvak(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const resultaat = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO inzendteller (vragenlijst_id, tijdvak, aantal) VALUES (?, ?, 1)
       ON CONFLICT (vragenlijst_id, tijdvak) DO UPDATE SET aantal = aantal + 1`,
    ).bind(vl.id, vak),
    env.DB.prepare(
      `INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden)
       SELECT ?, ?, ?, ?
       WHERE (SELECT aantal FROM inzendteller WHERE vragenlijst_id = ? AND tijdvak = ?) <= ?
         AND (SELECT COALESCE(SUM(aantal), 0) FROM inzendteller WHERE vragenlijst_id = ? AND tijdvak >= ? AND tijdvak < ?) <= ?
         AND (? IS NULL OR (SELECT COUNT(*) FROM inzendingen WHERE vragenlijst_id = ?) < ?)`,
    ).bind(
      willekeurigId(), vl.id, vandaagNL(), JSON.stringify(antwoorden),
      vl.id, vak, LIMIET_PER_10_MIN,
      vl.id, dag, `${dag}U`, LIMIET_PER_DAG,
      vl.max_inzendingen, vl.id, vl.max_inzendingen,
    ),
    // Tellers van eerdere dagen zijn niet meer nodig.
    env.DB.prepare('DELETE FROM inzendteller WHERE tijdvak < ?').bind(gisteren),
  ]);

  if (!resultaat[1].meta.changes) {
    if (vl.max_inzendingen) {
      const totaal = await een(env, 'SELECT COUNT(*) AS n FROM inzendingen WHERE vragenlijst_id = ?', vl.id);
      if (totaal.n >= vl.max_inzendingen) {
        throw new Fout(409, 'Het maximale aantal deelnemers voor deze vragenlijst is bereikt. Je antwoorden zijn niet opgeslagen.');
      }
    }
    throw new Fout(429, 'Er worden op dit moment erg veel antwoorden verstuurd. Probeer het over een kwartier opnieuw.');
  }

  return json({ ok: true, bedanktekst: vl.bedanktekst });
}
