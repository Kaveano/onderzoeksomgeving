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
import { h, vervang, laden, melding, meld, statusLabel, lokaleDatum, uniekeId, bevestig, beeldmerk } from './ui.js';

const app = document.getElementById('app');
let instellingen = null;
let vertrekHandlers = [];
let weergaveTeller = 0;
let weergaveAfgebroken = false; // laden van een scherm stopte omdat de sessie verlopen was

const TABS = [
  ['dashboard', 'Dashboard'],
  ['analyse', 'Analyse'],
  ['opzet', 'Opzet'],
  ['vragenlijsten', 'Vragenlijsten'],
  ['invoer', 'Eigen invoer'],
  ['stukken', 'Stukken'],
  ['rapport', 'Rapport'],
  ['acties', 'Acties'],
  ['delen', 'Delen'],
  ['afronden', 'Afronden'],
];

const SCHERMEN = {
  start: () => import('./schermen/start.js'),
  nieuw: () => import('./schermen/nieuw.js'),
  sjablonen: () => import('./schermen/sjablonen.js'),
  sjabloon: () => import('./schermen/sjabloon-bewerken.js'),
  analyse: () => import('./schermen/analyse.js'),
  werkbank: () => import('./schermen/werkbank.js'),
  coderen: () => import('./schermen/coderen.js'),
  overzicht: () => import('./schermen/overzicht.js'),
  dashboard: () => import('./schermen/dashboard.js'),
  opzet: () => import('./schermen/opzet.js'),
  vragenlijsten: () => import('./schermen/vragenlijsten.js'),
  vragenlijst: () => import('./schermen/vragenlijst-bewerken.js'),
  invoer: () => import('./schermen/invoer.js'),
  stukken: () => import('./schermen/stukken.js'),
  stuk: () => import('./schermen/stuk-bewerken.js'),
  rapport: () => import('./schermen/rapporten.js'),
  rapportBewerken: () => import('./schermen/rapport-bewerken.js'),
  bronnen: () => import('./schermen/bronnen.js'),
  acties: () => import('./schermen/acties.js'),
  delen: () => import('./schermen/delen.js'),
  afronden: () => import('./schermen/afronden.js'),
  bibliotheek: () => import('./schermen/bibliotheek.js'),
  bron: () => import('./schermen/bron-bewerken.js'),
};

// Pagina's binnen een tabblad (de sub-navigatie): #/onderzoek/<id>/<tabblad>/<deel> → scherm.
// Zonder deel opent het tabblad zijn eerste pagina; Dashboard begint bij het Overzicht.
const TAB_DELEN = {
  dashboard: { '': 'overzicht', resultaten: 'dashboard' },
  analyse: { werkbank: 'werkbank', coderen: 'coderen' },
  rapport: { bronnen: 'bronnen' },
};

function leesAdres() {
  const delen = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (!delen.length) return { scherm: 'start', params: {} };
  if (delen[0] === 'nieuw') return { scherm: 'nieuw', params: {} };
  if (delen[0] === 'sjablonen' && delen[1]) return { scherm: 'sjabloon', params: { sjabloonId: delen[1] } };
  if (delen[0] === 'sjablonen') return { scherm: 'sjablonen', params: {} };
  if (delen[0] === 'bibliotheek') {
    if (!delen[1]) return { scherm: 'bibliotheek', params: {} };
    if ((delen[1] === 'nieuw' || /^\d+$/.test(delen[1])) && !delen[2]) return { scherm: 'bron', params: { bronId: delen[1] } };
    return { scherm: 'onbekend', params: {} };
  }
  if (delen[0] === 'onderzoek' && /^\d+$/.test(delen[1] || '')) {
    const id = delen[1];
    const tab = delen[2] || 'dashboard';
    if (tab === 'vragenlijsten' && /^\d+$/.test(delen[3] || '')) {
      return { scherm: 'vragenlijst', tab, params: { id, vlId: delen[3] } };
    }
    if (tab === 'stukken' && /^\d+$/.test(delen[3] || '')) {
      return { scherm: 'stuk', tab, params: { id, stukId: delen[3] } };
    }
    if (tab === 'rapport' && /^\d+$/.test(delen[3] || '')) {
      return { scherm: 'rapportBewerken', tab, params: { id, rapportId: delen[3] } };
    }
    if (Object.hasOwn(TAB_DELEN, tab)) {
      const deel = delen[3] || '';
      if (Object.hasOwn(TAB_DELEN[tab], deel)) return { scherm: TAB_DELEN[tab][deel], tab, params: { id } };
      if (deel) return { scherm: 'onbekend', params: {} };
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
  // Op een telefoon staat het menu op een eigen regel onder het beeldmerk en "Uitloggen" (zie app.css).
  return h('header', { class: 'kop' },
    h('div', { class: 'kop-binnen kop-beheer' },
      h('a', { class: 'kop-logo', href: '#/' },
        beeldmerk(),
        h('span', { class: 'kop-logo-tekst' }, 'Onderzoeksomgeving')),
      h('nav', { class: 'kop-nav', 'aria-label': 'Hoofdmenu' },
        h('a', { href: '#/', 'aria-current': actief === 'start' ? 'page' : null }, 'Onderzoeken'),
        h('a', { href: '#/sjablonen', 'aria-current': actief === 'sjablonen' ? 'page' : null }, 'Sjablonen'),
        h('a', { href: '#/bibliotheek', 'aria-current': actief === 'bibliotheek' ? 'page' : null }, 'Bibliotheek'),
      ),
      h('button', { type: 'button', class: 'kop-uitloggen', onclick: uitloggen }, 'Uitloggen'),
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
    h('div', { class: 'onderzoek-kop' },
      h('div', { class: 'kruimel' }, h('a', { href: '#/' }, '← Alle onderzoeken')),
      h('div', { class: 'paginakop' },
        h('div', {},
          h('p', { class: 'bovenschrift' }, o.bedrijfsnaam),
          h('h1', {}, o.titel),
        ),
        h('div', { class: 'rij onderzoek-status' }, statusLabel(o.status)),
      ),
    ),
    o.status === 'gearchiveerd'
      ? melding(
        `Dit onderzoek is gearchiveerd op ${lokaleDatum(o.gearchiveerd_op)}. Je kunt alles inzien en exporteren, maar niets meer wijzigen.`,
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
  const kopActief = adres.scherm === 'sjablonen' || adres.scherm === 'sjabloon' ? 'sjablonen'
    : adres.scherm === 'bibliotheek' || adres.scherm === 'bron' ? 'bibliotheek'
      : adres.tab ? null : 'start';
  const overslaan = h('a', {
    href: '#inhoud',
    class: 'sr-only overslaan',
    onclick: (e) => {
      // Niet via het adres (#inhoud), want dat gebruikt de navigatie al.
      e.preventDefault();
      hoofd.focus();
    },
  }, 'Naar de inhoud');
  vervang(app, overslaan, kopbalk(kopActief), hoofd);
  hoofd.append(laden());

  if (adres.scherm === 'onbekend') {
    document.title = 'Pagina niet gevonden – Onderzoeksomgeving';
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
    // Op een telefoon schuift de rij tabbladen: het actieve tabblad in beeld zetten.
    const tabs = hoofd.querySelector('.tabs');
    const actieveTab = tabs && tabs.querySelector('a[aria-current]');
    if (actieveTab && tabs.scrollWidth > tabs.clientWidth) {
      const t = tabs.getBoundingClientRect();
      const a = actieveTab.getBoundingClientRect();
      tabs.scrollLeft += a.left - t.left - (t.width - a.width) / 2;
    }
    container.append(laden());
    const module = await SCHERMEN[adres.scherm]();
    if (mijnBeurt !== weergaveTeller) return;
    vervang(container);
    await module.toon(container, ctx);
    // Alleen naar de inhoud springen als het scherm zelf geen focus heeft gezet.
    const actief = document.activeElement;
    if (!actief || actief === document.body || !hoofd.contains(actief)) hoofd.focus({ preventScroll: true });
  } catch (fout) {
    if (mijnBeurt !== weergaveTeller) return;
    if (fout.status === 401) {
      // De inlogdialoog verschijnt; na inloggen laden we dit scherm alsnog.
      weergaveAfgebroken = true;
      return;
    }
    console.error(fout);
    const uitleg = typeof fout.status === 'number' && fout.status > 0
      ? fout.message
      : 'Laad de pagina opnieuw. Blijft dit gebeuren, controleer dan je internetverbinding.';
    // De kop met tabbladen (als die er al staat) laten staan, zodat je naar een ander onderdeel kunt.
    const kop = hoofd.querySelector('.tabs') ? [...hoofd.children].slice(0, -1) : [];
    vervang(hoofd,
      kop,
      melding([h('strong', {}, 'Dit onderdeel kon niet worden geladen. '), uitleg], 'gevaar'),
      h('div', { class: 'knoppen' },
        h('button', { type: 'button', class: 'knop', onclick: () => location.reload() }, 'Pagina opnieuw laden'),
        h('a', { class: 'knop knop-licht', href: '#/' }, 'Naar het overzicht')),
    );
  }
}

function toonInlog(foutmelding = '') {
  vertrekHandlers = [];
  weergaveAfgebroken = false;
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
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
    h('div', { class: 'inlog-blad' },
      h('div', { class: 'kaart' },
        h('div', { class: 'inlog-merk' }, beeldmerk()),
        h('h1', {}, 'Onderzoeksomgeving'),
        h('p', { class: 'zacht' }, 'Log in met je beheerwachtwoord.'),
        formulier,
      ),
    ),
  ));
  invoer.focus();
}

/**
 * Sessie verlopen terwijl je aan het werk bent: inloggen in een dialoog bovenop het huidige
 * scherm (ook boven een open dialoog), zodat wat je hebt ingevuld blijft staan.
 */
let inlogDialoogOpen = false;
function toonInlogDialoog() {
  if (inlogDialoogOpen || document.getElementById('wachtwoord')) return;
  if (!document.querySelector('main.inhoud')) {
    toonInlog('Je sessie is verlopen. Log opnieuw in.');
    return;
  }
  inlogDialoogOpen = true;
  const invoerId = uniekeId('wachtwoord');
  const titelId = uniekeId('dlg-titel');
  const invoer = h('input', { type: 'password', id: invoerId, autocomplete: 'current-password' });
  const fout = h('div', { class: 'veld-fout', role: 'alert' });
  const knop = h('button', { type: 'submit', class: 'knop knop-primair' }, 'Inloggen');
  const d = h('dialog', { class: 'dialoog', 'aria-labelledby': titelId },
    h('form', { method: 'dialog', novalidate: true },
      h('div', { class: 'dialoog-inhoud' },
        h('h2', { id: titelId }, 'Opnieuw inloggen'),
        h('p', {}, 'Je sessie is verlopen. Log opnieuw in; wat je had ingevuld blijft staan. Probeer daarna je laatste actie nog een keer.'),
        h('div', { class: 'veld' }, h('label', { for: invoerId }, 'Wachtwoord'), invoer),
        fout),
      h('div', { class: 'dialoog-voet' },
        h('button', {
          type: 'button',
          class: 'knop',
          onclick: async () => {
            // Staat er nog een venster met invoer open, dan eerst waarschuwen.
            const anderVenster = [...document.querySelectorAll('dialog[open]')].some((x) => x !== d);
            if (anderVenster && !(await bevestig({
              titel: 'Naar het inlogscherm?',
              tekst: 'Wat je nog niet hebt opgeslagen, gaat dan verloren. Log liever hier opnieuw in.',
              knop: 'Toch naar inlogscherm',
              gevaar: true,
            }))) return;
            d.close();
            toonInlog();
          },
        }, 'Naar inlogscherm'),
        knop)));
  d.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    fout.textContent = '';
    knop.disabled = true;
    try {
      await api.post('/api/inloggen', { wachtwoord: invoer.value });
      d.close();
      // Schermen kunnen hierop reageren (bijv. automatisch opslaan hervatten, melding wissen).
      window.dispatchEvent(new CustomEvent('weer-ingelogd'));
      if (weergaveAfgebroken) {
        weergaveAfgebroken = false;
        meld('Je bent weer ingelogd.', 'succes');
        weergeven();
      } else {
        meld('Je bent weer ingelogd. Probeer je laatste actie opnieuw.', 'succes');
      }
    } catch (err) {
      fout.textContent = err.message;
      knop.disabled = false;
      invoer.select();
    }
  });
  d.addEventListener('cancel', (e) => e.preventDefault());
  d.addEventListener('close', () => {
    inlogDialoogOpen = false;
    setTimeout(() => d.remove(), 0);
  });
  document.body.append(d);
  d.showModal();
  invoer.focus();
}

window.addEventListener('niet-ingelogd', toonInlogDialoog);
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
