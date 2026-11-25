// Beheeromgeving: inloggen, navigatie (via #-adressen) en de opbouw van elke pagina.
//
// Elk scherm is een module in ./schermen/ met een functie:
//   export async function toon(container, ctx) { ... }
// ctx bevat:
//   params        – delen uit het adres, bijv. { id: '3', vlId: '7' }
//   onderzoek     – (bij onderzoeksschermen) { onderzoek, themas: [..met meetpunten], meetmomenten }
//   alleenLezen   – true als het onderzoek gearchiveerd is (dan niets laten wijzigen)
//   instellingen  – vaste lijsten: schalen, vraagtypen, invoersoorten, stuksoorten, actiestatussen, drempel
//   herlaadOnderzoek() – haalt het onderzoek opnieuw op (na wijzigen van thema's e.d.), geeft nieuwe data
//   navigeer(hash)     – ga naar een ander scherm, bijv. navigeer('#/onderzoek/3/stukken')
//   bijVertrek(fn)     – fn (mag async) wordt aangeroepen vóór het verlaten van het scherm (bijv. opslaan)
//   zetTitel(tekst)    – titel van het browsertabblad

import { api } from './api.js';
import { h, vervang, laden, melding, meld, statusLabel, datum } from './ui.js';

const app = document.getElementById('app');
let instellingen = null;
let vertrekHandlers = [];
let weergaveTeller = 0;

const TABS = [
  ['dashboard', 'Dashboard'],
  ['opzet', 'Opzet'],
  ['vragenlijsten', 'Vragenlijsten'],
  ['invoer', 'Eigen invoer'],
  ['stukken', 'Stukken'],
  ['acties', 'Acties'],
  ['afronden', 'Afronden'],
];

const SCHERMEN = {
  start: () => import('./schermen/start.js'),
  nieuw: () => import('./schermen/nieuw.js'),
  sjablonen: () => import('./schermen/sjablonen.js'),
  dashboard: () => import('./schermen/dashboard.js'),
  opzet: () => import('./schermen/opzet.js'),
  vragenlijsten: () => import('./schermen/vragenlijsten.js'),
  vragenlijst: () => import('./schermen/vragenlijst-bewerken.js'),
  invoer: () => import('./schermen/invoer.js'),
  stukken: () => import('./schermen/stukken.js'),
  stuk: () => import('./schermen/stuk-bewerken.js'),
  acties: () => import('./schermen/acties.js'),
  afronden: () => import('./schermen/afronden.js'),
};

function leesAdres() {
  const delen = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (!delen.length) return { scherm: 'start', params: {} };
  if (delen[0] === 'nieuw') return { scherm: 'nieuw', params: {} };
  if (delen[0] === 'sjablonen') return { scherm: 'sjablonen', params: {} };
  if (delen[0] === 'onderzoek' && /^\d+$/.test(delen[1] || '')) {
    const id = delen[1];
    const tab = delen[2] || 'dashboard';
    if (tab === 'vragenlijsten' && /^\d+$/.test(delen[3] || '')) {
      return { scherm: 'vragenlijst', tab, params: { id, vlId: delen[3] } };
    }
    if (tab === 'stukken' && /^\d+$/.test(delen[3] || '')) {
      return { scherm: 'stuk', tab, params: { id, stukId: delen[3] } };
    }
    if (TABS.some(([t]) => t === tab)) return { scherm: tab, tab, params: { id } };
  }
  return { scherm: 'onbekend', params: {} };
}

export function navigeer(hash) {
  if (location.hash === hash) weergeven();
  else location.hash = hash;
}

async function verlaatScherm() {
  const handlers = vertrekHandlers;
  vertrekHandlers = [];
  for (const fn of handlers) {
    try {
      await fn();
    } catch (e) {
      console.error(e);
    }
  }
}

function kopbalk(actief) {
  return h('header', { class: 'kop' },
    h('div', { class: 'kop-binnen' },
      h('a', { class: 'kop-logo', href: '#/' },
        h('span', { class: 'kop-logo-merk', 'aria-hidden': 'true' }, 'O'),
        h('span', { class: 'kop-logo-tekst' }, 'Onderzoeksomgeving')),
      h('nav', { class: 'kop-nav', 'aria-label': 'Hoofdmenu' },
        h('a', { href: '#/', 'aria-current': actief === 'start' ? 'page' : null }, 'Onderzoeken'),
        h('a', { href: '#/sjablonen', 'aria-current': actief === 'sjablonen' ? 'page' : null }, 'Sjablonen'),
        h('button', { type: 'button', onclick: uitloggen }, 'Uitloggen'),
      ),
    ),
  );
}

async function uitloggen() {
  await verlaatScherm();
  try {
    await api.post('/api/uitloggen', {});
  } catch {
    /* toch uitloggen */
  }
  toonInlog();
}

function onderzoekKop(detail, tab) {
  const o = detail.onderzoek;
  const basis = `#/onderzoek/${o.id}`;
  return [
    h('div', { class: 'kruimel' }, h('a', { href: '#/' }, '← Alle onderzoeken')),
    h('div', { class: 'paginakop' },
      h('div', {},
        h('h1', {}, o.titel),
        h('p', { class: 'ondertitel' }, o.bedrijfsnaam),
      ),
      h('div', { class: 'rij' }, statusLabel(o.status)),
    ),
    o.status === 'gearchiveerd'
      ? melding(
        `Dit onderzoek is gearchiveerd op ${datum(o.gearchiveerd_op)}. Je kunt alles inzien en exporteren, maar niets meer wijzigen.`,
        'waarschuwing',
      )
      : null,
    h('nav', { class: 'tabs', 'aria-label': 'Onderdelen van dit onderzoek' },
      TABS.map(([t, label]) => h('a', { href: `${basis}/${t}`, 'aria-current': t === tab ? 'page' : null }, label)),
    ),
  ];
}

async function weergeven() {
  const mijnBeurt = ++weergaveTeller;
  await verlaatScherm();
  if (mijnBeurt !== weergaveTeller) return;

  const adres = leesAdres();
  const hoofd = h('main', { class: 'inhoud', id: 'inhoud', tabindex: '-1' });
  const kopActief = adres.scherm === 'sjablonen' ? 'sjablonen' : adres.tab ? null : 'start';
  vervang(app, h('a', { href: '#inhoud', class: 'sr-only' }, 'Naar de inhoud'), kopbalk(kopActief), hoofd);
  hoofd.append(laden());

  if (adres.scherm === 'onbekend') {
    vervang(hoofd, melding(['Deze pagina bestaat niet. ', h('a', { href: '#/' }, 'Naar het overzicht')], 'waarschuwing'));
    return;
  }

  try {
    if (!instellingen) instellingen = await api.get('/instellingen');
    let detail = null;
    if (adres.params.id) detail = await api.get(`/onderzoeken/${adres.params.id}`);
    if (mijnBeurt !== weergaveTeller) return;

    const container = h('div', {});
    const ctx = {
      params: adres.params,
      onderzoek: detail,
      alleenLezen: !!detail && detail.onderzoek.status === 'gearchiveerd',
      instellingen,
      navigeer,
      bijVertrek: (fn) => vertrekHandlers.push(fn),
      zetTitel: (t) => {
        document.title = `${t} – Onderzoeksomgeving`;
      },
      herlaadOnderzoek: async () => {
        const nieuw = await api.get(`/onderzoeken/${adres.params.id}`);
        ctx.onderzoek = nieuw;
        ctx.alleenLezen = nieuw.onderzoek.status === 'gearchiveerd';
        return nieuw;
      },
    };
    document.title = detail ? `${detail.onderzoek.titel} – Onderzoeksomgeving` : 'Onderzoeksomgeving';
    vervang(hoofd, detail ? onderzoekKop(detail, adres.tab) : null, container);
    container.append(laden());
    const module = await SCHERMEN[adres.scherm]();
    if (mijnBeurt !== weergaveTeller) return;
    vervang(container);
    await module.toon(container, ctx);
    hoofd.focus({ preventScroll: true });
  } catch (fout) {
    if (mijnBeurt !== weergaveTeller) return;
    if (fout.status === 401) return; // inlogscherm wordt al getoond
    console.error(fout);
    vervang(hoofd,
      melding([h('strong', {}, 'Dit scherm kon niet worden geladen. '), fout.message || ''], 'gevaar'),
      h('p', {}, h('a', { href: '#/' }, 'Terug naar het overzicht')),
    );
  }
}

function toonInlog(foutmelding = '') {
  vertrekHandlers = [];
  const invoer = h('input', { type: 'password', id: 'wachtwoord', autocomplete: 'current-password', required: true });
  const fout = h('div', { class: 'veld-fout', role: 'alert' }, foutmelding);
  const knop = h('button', { type: 'submit', class: 'knop knop-primair' }, 'Inloggen');
  const formulier = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      fout.textContent = '';
      knop.disabled = true;
      try {
        await api.post('/api/inloggen', { wachtwoord: invoer.value });
        invoer.value = '';
        weergeven();
      } catch (err) {
        fout.textContent = err.message;
        knop.disabled = false;
        invoer.select();
      }
    },
  },
  h('div', { class: 'veld' }, h('label', { for: 'wachtwoord' }, 'Wachtwoord'), invoer),
  fout,
  h('div', { class: 'knoppen' }, knop),
  );
  document.title = 'Inloggen – Onderzoeksomgeving';
  vervang(app, h('main', { class: 'inlog' },
    h('div', { class: 'kaart' },
      h('h1', {}, 'Onderzoeksomgeving'),
      h('p', { class: 'zacht' }, 'Log in met je beheerwachtwoord.'),
      formulier,
    ),
  ));
  invoer.focus();
}

window.addEventListener('niet-ingelogd', () => {
  if (!document.getElementById('wachtwoord')) {
    toonInlog('Je sessie is verlopen. Log opnieuw in.');
    meld('Je bent uitgelogd. Log opnieuw in om verder te gaan.', 'fout');
  }
});
window.addEventListener('hashchange', weergeven);

(async function start() {
  try {
    const s = await api.get('/api/sessie');
    if (s.ingelogd) weergeven();
    else toonInlog();
  } catch (e) {
    vervang(app, h('main', { class: 'inhoud' }, melding(e.message, 'gevaar')));
  }
})();
