// Alleen-lezen inzage in een onderzoek via een deellink (/d/<code>) met een toegangscode.
// De kijker ziet alleen wat de onderzoeker heeft vrijgegeven en kan niets wijzigen.
// Tekst uit het onderzoek gaat altijd via h()/textContent, nooit via innerHTML.

import { h, vervang, laden, melding, lokaleDatum, beeldmerk } from './beheer/ui.js';

const CODE = (location.pathname.split('/')[2] || '').replace(/[^A-Za-z0-9_-]/g, '');
const API = `/api/kijk/${CODE}`;
const app = document.getElementById('kijk');

let overzicht = null;
let opruimers = [];
let beurt = 0;

class KijkFout extends Error {
  constructor(status, tekst) {
    super(tekst);
    this.status = status;
  }
}

async function vraag(pad, { methode = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(API + pad, {
      method: methode,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new KijkFout(0, 'Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.');
  }
  let data = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  if (!r.ok) throw new KijkFout(r.status, (data && data.fout) || `Er ging iets mis (code ${r.status}).`);
  return data;
}

function ruimOp() {
  for (const f of opruimers) {
    try {
      f();
    } catch { /* opruimen mag niet mislukken */ }
  }
  opruimers = [];
}

function voet() {
  return h('footer', { class: 'kijk-voet' },
    h('p', {}, 'Je bekijkt deze resultaten alleen-lezen. Vragenlijsten zijn anoniem ingevuld: er is geen naam, e-mailadres of IP-adres opgeslagen.'));
}

// ---------- Link werkt niet ----------

function toonWerktNiet(tekst) {
  ruimOp();
  document.title = 'Deze link werkt niet';
  vervang(app, h('main', { class: 'inlog' },
    h('div', { class: 'inlog-blad' }, h('div', { class: 'kaart' },
      h('div', { class: 'inlog-merk' }, beeldmerk()),
      h('h1', {}, 'Deze link werkt niet (meer)'),
      h('p', {}, tekst || 'De link is verlopen, ingetrokken of niet goed overgenomen.'),
      h('p', { class: 'zacht' }, 'Vraag degene van wie je de link kreeg om een nieuwe link.')))));
}

// ---------- Toegangscode invullen ----------

function toonCodeScherm(bericht = '') {
  ruimOp();
  overzicht = null;
  document.title = 'Toegangscode – Onderzoeksresultaten';
  const invoer = h('input', {
    type: 'text',
    id: 'toegangscode',
    name: 'toegangscode',
    class: 'kijk-code',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    inputmode: 'text',
    maxlength: 20,
    required: true,
    'aria-describedby': 'toegangscode-uitleg',
  });
  const fout = h('div', { class: 'veld-fout', role: 'alert' });
  const knop = h('button', { type: 'submit', class: 'knop knop-primair' }, 'Resultaten bekijken');
  const formulier = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      fout.textContent = '';
      knop.disabled = true;
      try {
        await vraag('/toegang', { methode: 'POST', body: { toegangscode: invoer.value } });
        invoer.value = '';
        await start();
      } catch (err) {
        if (err.status === 404) {
          toonWerktNiet();
          return;
        }
        fout.textContent = err.message;
        knop.disabled = false;
        invoer.select();
      }
    },
  },
  h('div', { class: 'veld' },
    h('label', { for: 'toegangscode' }, 'Toegangscode'),
    invoer,
    h('p', { class: 'klein zacht', id: 'toegangscode-uitleg' }, 'Tien tekens, bijvoorbeeld ABCDE-FGHJK. Hoofdletters of kleine letters maakt niet uit.')),
  fout,
  h('div', { class: 'knoppen' }, knop));

  vervang(app, h('main', { class: 'inlog' },
    h('div', { class: 'inlog-blad' }, h('div', { class: 'kaart' },
      h('div', { class: 'inlog-merk' }, beeldmerk()),
      h('h1', {}, 'Resultaten bekijken'),
      bericht ? melding(bericht) : null,
      h('p', { class: 'zacht' }, 'Je hebt een link gekregen om de resultaten van een onderzoek in te zien. Vul de toegangscode in die je daarbij apart hebt ontvangen.'),
      formulier))));
  invoer.focus();
}

function sessieVerlopen() {
  toonCodeScherm('Je inzage is verlopen of afgesloten. Vul de toegangscode opnieuw in.');
}

// ---------- Inzage ----------

const aantalDocumenten = () => overzicht.stukken.length + overzicht.rapporten.length;

function adres() {
  const delen = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const heeftDashboard = overzicht.onderdelen.dashboard;
  const heeftStukken = aantalDocumenten() > 0;
  if (delen[0] === 'rapport' && /^\d+$/.test(delen[1] || '') && overzicht.rapporten.length) return { tab: 'documenten', rapport: Number(delen[1]) };
  if (delen[0] === 'document' && /^\d+$/.test(delen[1] || '') && heeftStukken) return { tab: 'documenten', stuk: Number(delen[1]) };
  if (delen[0] === 'documenten' && heeftStukken) return { tab: 'documenten', stuk: null };
  if (heeftDashboard) return { tab: 'resultaten', stuk: null };
  return { tab: 'documenten', stuk: null };
}

function kopbalk() {
  return h('header', { class: 'kop' },
    h('div', { class: 'kop-binnen' },
      h('span', { class: 'kop-logo' },
        beeldmerk(),
        h('span', { class: 'kop-logo-tekst' }, 'Onderzoeksresultaten')),
      h('nav', { class: 'kop-nav', 'aria-label': 'Inzage' },
        h('span', { class: 'label kijk-label' }, 'Alleen-lezen'),
        h('button', {
          type: 'button',
          onclick: async () => {
            try {
              await vraag('/sluiten', { methode: 'POST', body: {} });
            } catch { /* ook zonder verbinding terug naar het begin */ }
            history.replaceState(null, '', location.pathname);
            toonCodeScherm('Je hebt de inzage afgesloten.');
          },
        }, 'Afsluiten'))));
}

async function toonInzage() {
  const mijnBeurt = ++beurt;
  ruimOp();
  const o = overzicht.onderzoek;
  const waar = adres();
  const heeftDashboard = overzicht.onderdelen.dashboard;
  const heeftStukken = aantalDocumenten() > 0;
  const tabs = heeftDashboard && heeftStukken
    ? h('nav', { class: 'tabs', 'aria-label': 'Onderdelen' },
      h('a', { href: '#/resultaten', 'aria-current': waar.tab === 'resultaten' ? 'page' : null }, 'Resultaten'),
      h('a', { href: '#/documenten', 'aria-current': waar.tab === 'documenten' ? 'page' : null }, `Documenten (${aantalDocumenten()})`))
    : null;
  const container = h('div', { class: 'kijk-inhoud' }, laden());
  const hoofd = h('main', { class: 'inhoud', id: 'inhoud', tabindex: '-1' },
    h('div', { class: 'onderzoek-kop' },
      h('div', { class: 'paginakop' },
        h('div', {},
          h('p', { class: 'bovenschrift' }, o.bedrijfsnaam),
          h('h1', {}, o.titel)),
        o.status === 'gearchiveerd' ? h('div', { class: 'rij onderzoek-status' }, h('span', { class: 'label label-archief' }, 'Afgerond')) : null)),
    o.onderzoeksvraag
      ? h('div', { class: 'kijk-vraag' },
        h('span', { class: 'kijk-vraag-label' }, 'Onderzoeksvraag'),
        h('p', {}, o.onderzoeksvraag))
      : null,
    tabs,
    container);
  vervang(app, kopbalk(), hoofd, voet());

  if (!heeftDashboard && !heeftStukken) {
    vervang(container, melding('Via deze link is op dit moment niets gedeeld.'));
    return;
  }
  try {
    if (waar.tab === 'resultaten') await toonResultaten(container);
    else if (waar.rapport) await toonRapport(container, waar.rapport);
    else if (waar.stuk) await toonDocument(container, waar.stuk);
    else toonDocumenten(container);
  } catch (e) {
    if (mijnBeurt !== beurt) return;
    if (e.status === 401) sessieVerlopen();
    else if (e.status === 404 && !waar.stuk && !waar.rapport) toonWerktNiet();
    else vervang(container, melding([h('strong', {}, 'Dit kon niet worden geladen. '), e.message || ''], 'gevaar'));
  }
}

async function toonResultaten(container) {
  const { toon } = await import('./beheer/schermen/dashboard.js');
  const ctx = {
    params: { id: `kijk-${CODE.slice(0, 8)}` },
    onderzoek: { onderzoek: { titel: overzicht.onderzoek.titel }, themas: overzicht.themas || [] },
    instellingen: { invoersoorten: {}, stuksoorten: {}, drempel: overzicht.drempel },
    alleenLezen: true,
    kijker: true,
    zetTitel: () => {
      document.title = `Resultaten – ${overzicht.onderzoek.titel}`;
    },
    bijVertrek: (f) => opruimers.push(f),
    haalDashboard: async (qs) => {
      try {
        return await vraag(`/dashboard${qs ? `?${qs}` : ''}`);
      } catch (e) {
        if (e.status === 401) sessieVerlopen();
        else if (e.status === 404) toonWerktNiet();
        throw e;
      }
    },
  };
  await toon(container, ctx);
}

const SOORTEN = { notitie: 'Notitie', bevindingen: 'Bevindingen', rapport: 'Rapport', overig: 'Document' };

function toonDocumenten(container) {
  document.title = `Documenten – ${overzicht.onderzoek.titel}`;
  vervang(container, h('section', { class: 'kaart' },
    h('h2', {}, 'Documenten'),
    h('p', { class: 'zacht' }, 'Deze documenten zijn met je gedeeld. Klik op een titel om het document te lezen.'),
    h('ul', { class: 'kijk-documenten' },
      overzicht.rapporten.map((r) => h('li', {},
        h('a', { href: `#/rapport/${r.id}`, class: 'kijk-document-link' },
          h('span', { class: 'kijk-document-titel' }, r.titel || 'Rapport'),
          h('span', { class: 'klein zacht' }, [r.soort === 'tussen' ? 'Tussenrapport' : 'Eindrapport', r.bijgewerkt_op ? `bijgewerkt op ${lokaleDatum(r.bijgewerkt_op)}` : null].filter(Boolean).join(' · '))))),
      overzicht.stukken.map((s) => h('li', {},
      h('a', { href: `#/document/${s.id}`, class: 'kijk-document-link' },
        h('span', { class: 'kijk-document-titel' }, s.titel || 'Zonder titel'),
        h('span', { class: 'klein zacht' }, [SOORTEN[s.soort] || 'Document', s.bijgewerkt_op ? `bijgewerkt op ${lokaleDatum(s.bijgewerkt_op)}` : null].filter(Boolean).join(' · '))))))));
}

async function toonDocument(container, id) {
  const [{ stuk }, { maakVoorbeeld }] = await Promise.all([
    vraag(`/stukken/${id}`),
    import('./beheer/schermen/stuk-bewerken.js'),
  ]);
  document.title = `${stuk.titel || 'Document'} – ${overzicht.onderzoek.titel}`;
  const tekst = (stuk.inhoud || '').trim();
  vervang(container,
    h('div', { class: 'kruimel' }, h('a', { href: '#/documenten' }, '← Alle documenten')),
    h('article', { class: 'kaart kijk-document' },
      h('div', { class: 'kaart-kop' },
        h('h2', {}, stuk.titel || 'Zonder titel'),
        h('button', { type: 'button', class: 'knop knop-klein', onclick: () => window.print() }, 'Afdrukken of opslaan als pdf')),
      h('p', { class: 'klein zacht' }, [SOORTEN[stuk.soort] || 'Document', stuk.bijgewerkt_op ? `bijgewerkt op ${lokaleDatum(stuk.bijgewerkt_op)}` : null].filter(Boolean).join(' · ')),
      tekst
        ? h('div', { class: 'st-voorbeeld kijk-tekst' }, maakVoorbeeld(tekst))
        : h('p', { class: 'zacht' }, 'Dit document is nog leeg.')));
  window.scrollTo(0, 0);
}

async function toonRapport(container, id) {
  const [{ rapport }, feitenModule, weergaveModule] = await Promise.all([
    vraag(`/rapporten/${id}`),
    import('./beheer/rapport-feiten.js'),
    import('./beheer/rapport-weergave.js'),
  ]);
  document.title = `${rapport.titel || 'Rapport'} – ${overzicht.onderzoek.titel}`;
  const blokken = feitenModule.rapportNaarBlokken(rapport, { markeerLeeg: false });
  vervang(container,
    h('div', { class: 'kruimel kijk-rapport-balk' },
      h('a', { href: '#/documenten' }, '← Alle documenten'),
      h('button', { type: 'button', class: 'knop knop-klein', onclick: () => window.print() }, 'Afdrukken of opslaan als pdf')),
    h('article', { class: 'kaart rp-document' }, weergaveModule.toonBlokken(blokken)));
  window.scrollTo(0, 0);
}

// ---------- Begin ----------

async function start() {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(CODE)) {
    toonWerktNiet();
    return;
  }
  vervang(app, h('main', { class: 'inlog' }, laden()));
  try {
    const st = await vraag('');
    if (!st.toegang) {
      toonCodeScherm();
      return;
    }
    overzicht = await vraag('/overzicht');
    if (!Array.isArray(overzicht.rapporten)) overzicht.rapporten = [];
    if (!Array.isArray(overzicht.stukken)) overzicht.stukken = [];
    await toonInzage();
  } catch (e) {
    if (e.status === 404) toonWerktNiet();
    else if (e.status === 401) toonCodeScherm();
    else {
      vervang(app, h('main', { class: 'inlog' }, h('div', { class: 'kaart' },
        h('h1', {}, 'Dat lukte niet'),
        h('p', {}, e.message || 'Er ging iets mis.'),
        h('div', { class: 'knoppen' }, h('button', { type: 'button', class: 'knop knop-primair', onclick: () => start() }, 'Opnieuw proberen')))));
    }
  }
}

window.addEventListener('hashchange', () => {
  if (overzicht) toonInzage();
});

start();
