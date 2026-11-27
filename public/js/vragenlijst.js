// Openbare vragenlijst voor respondenten (medewerkers, vaak op een telefoon).
// - Geen inlog, geen cookies, geen externe bronnen.
// - Alle tekst (ook die van de vragenlijst zelf) wordt als tekst ingevoegd, nooit als HTML.
// - Antwoorden worden nergens in de browser bewaard. Alleen het feit dat deze vragenlijst
//   op dit apparaat is ingevuld staat in localStorage ('ingevuld:<code>').

const MAX_OPEN = 5000;
const WEET_NIET = 'weet_niet';
const CODE_PATROON = /^\/v\/([A-Za-z0-9_-]{16,40})\/?$/;

const hoofd = document.getElementById('vragenlijst');
const code = (CODE_PATROON.exec(location.pathname) || [])[1] || null;
const rustig = window.matchMedia('(prefers-reduced-motion: reduce)');

// ---------- Kleine hulpmiddelen ----------

/** Maakt een element. Attributen die met "on" beginnen worden event-handlers; tekst wordt altijd als tekst ingevoegd. */
function h(tag, attrs = {}, ...kinderen) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  voegToe(el, kinderen);
  return el;
}

function voegToe(el, kinderen) {
  for (const k of kinderen.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

function vervang(el, ...kinderen) {
  el.replaceChildren();
  voegToe(el, kinderen);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONEN = {
  vinkje: ['M5 12.5l4.5 4.5L19 7.5'],
  slot: ['M7 11V8a5 5 0 0 1 10 0v3', 'M6 11h12v10H6z'],
  vraag: ['M9.2 9a3 3 0 1 1 4.3 2.7c-.9.5-1.5 1.2-1.5 2.3v.5', 'M12 18h.01', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
  letop: ['M12 8v5', 'M12 16.5h.01', 'M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
};

/** Klein lijnicoon (alleen decoratie). */
function icoon(naam) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', '28');
  s.setAttribute('height', '28');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  for (const d of ICONEN[naam] || []) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    s.append(p);
  }
  return h('span', { class: 'vl-bericht-icoon' }, s);
}

/** Tekst naar alinea's: een lege regel = nieuwe alinea, een enkele regelovergang = <br>. */
function alineas(tekst, klasse = null) {
  return String(tekst || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((alinea) => {
      const p = h('p', { class: klasse });
      alinea.split('\n').forEach((regel, i) => {
        if (i) p.append(h('br'));
        p.append(document.createTextNode(regel));
      });
      return p;
    });
}

const getal = (n) => Number(n).toLocaleString('nl-NL');

/** [3, 5, 7] → '3, 5 en 7' */
function opsomming(lijst) {
  if (lijst.length < 2) return lijst.join('');
  return `${lijst.slice(0, -1).join(', ')} en ${lijst[lijst.length - 1]}`;
}

function opslagLezen(sleutel) {
  try {
    return window.localStorage.getItem(sleutel);
  } catch {
    return null;
  }
}

function opslagSchrijven(sleutel, waarde) {
  try {
    window.localStorage.setItem(sleutel, waarde);
  } catch {
    // Privévenster of opslag uitgeschakeld: niet erg.
  }
}

/** Verzoek naar de server. Geeft { status, ok, data } of { netwerkfout: true }. Nooit cookies. */
async function verzoek(methode, body) {
  let r;
  try {
    r = await fetch(`/api/publiek/${encodeURIComponent(code)}`, {
      method: methode,
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    return { netwerkfout: true };
  }
  let data = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  return { status: r.status, ok: r.ok, data };
}

// ---------- Toestanden van de pagina ----------

function toonLaden() {
  vervang(hoofd, h('div', { class: 'laden vl-laden', role: 'status' }, 'De vragenlijst wordt geladen…'));
}

/** Eenvoudige meldingspagina (gesloten, bestaat niet, fout). */
function toonBericht({ soort = '', ikoon = 'vraag', bovenschrift = null, titel, teksten = [], knop = null, focus = false }) {
  document.title = titel;
  const kop = h('h1', { tabindex: '-1' }, titel);
  vervang(hoofd, h('div', { class: `vl-bericht${soort ? ` vl-bericht-${soort}` : ''}` },
    icoon(ikoon),
    bovenschrift ? h('p', { class: 'vl-bovenschrift' }, bovenschrift) : null,
    kop,
    teksten.map((t) => h('p', {}, t)),
    knop,
  ));
  if (focus) kop.focus();
}

function toonBestaatNiet() {
  // De privacytekst onderaan gaat over invullen; die is hier niet van toepassing.
  const voet = document.querySelector('.vl-voet');
  if (voet) voet.hidden = true;
  toonBericht({
    ikoon: 'vraag',
    titel: 'Deze vragenlijst bestaat niet',
    teksten: [
      'Controleer of je de link helemaal goed hebt overgenomen.',
      'Soms valt bij het kopiëren het laatste stukje van de link weg. Heb je de link in een e-mail of bericht gekregen? Probeer dan nog eens op de link zelf te tikken of te klikken.',
    ],
  });
}

function toonGesloten(titel) {
  toonBericht({
    ikoon: 'slot',
    bovenschrift: titel || null,
    titel: 'Deze vragenlijst is gesloten',
    teksten: [
      'Je kunt deze vragenlijst op dit moment niet invullen.',
      'Heb je hier een vraag over? Neem dan contact op met degene die je de link heeft gestuurd.',
    ],
  });
}

function toonLaadFout(netwerk, focus) {
  toonBericht({
    soort: 'fout',
    ikoon: 'letop',
    titel: 'De vragenlijst kan nu niet worden geladen',
    teksten: [
      netwerk
        ? 'Er lijkt geen verbinding met internet te zijn. Controleer je verbinding en probeer het opnieuw.'
        : 'Er ging iets mis aan onze kant. Probeer het over een paar minuten opnieuw.',
    ],
    knop: h('button', { type: 'button', class: 'knop knop-primair', onclick: () => start(true) }, 'Opnieuw proberen'),
    focus,
  });
}

// ---------- Start ----------

async function start(naKnop = false) {
  if (!code) {
    toonBestaatNiet();
    return;
  }
  toonLaden();
  const r = await verzoek('GET');
  if (r.netwerkfout) {
    toonLaadFout(true, naKnop);
    return;
  }
  if (r.status === 404) {
    toonBestaatNiet();
    return;
  }
  if (!r.ok || !r.data) {
    toonLaadFout(false, naKnop);
    return;
  }
  if (r.data.status !== 'open') {
    toonGesloten(r.data.titel);
    return;
  }
  toonFormulier(r.data);
}

// ---------- Het formulier ----------

function toonFormulier(vl) {
  const titel = vl.titel || 'Vragenlijst';
  document.title = titel;

  const vragen = []; // { vraag, nr, veld, invoer: [], tekstvak, fout }
  const perId = new Map();
  let nummer = 0;

  const secties = (Array.isArray(vl.themas) ? vl.themas : [])
    .filter((t) => Array.isArray(t.vragen) && t.vragen.length)
    .map((thema) => h('section', { class: 'vl-thema' },
      h('h2', { tabindex: '-1' }, thema.naam),
      thema.vragen.map((vraag) => {
        nummer += 1;
        const item = maakVraag(vraag, nummer);
        vragen.push(item);
        perId.set(String(vraag.id), item);
        return item.veld;
      }),
    ));

  const kop = h('header', { class: 'vl-kop' },
    h('h1', {}, titel),
    vl.introtekst ? h('div', { class: 'vl-intro' }, alineas(vl.introtekst)) : null,
  );

  if (!vragen.length) {
    vervang(hoofd, kop, h('div', { class: 'melding' },
      h('p', {}, 'Deze vragenlijst bevat nog geen vragen. Probeer het later nog eens, of neem contact op met degene die je de link heeft gestuurd.')));
    return;
  }

  // --- Voortgang ---
  const totaal = vragen.length;
  const voortgangTekst = h('p', { class: 'vl-voortgang-regel', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const vulling = h('span', { class: 'vl-voortgang-vulling' });
  const voortgang = h('div', { class: 'vl-voortgang' },
    voortgangTekst,
    h('span', { class: 'vl-voortgang-balk', 'aria-hidden': 'true' }, vulling),
  );

  function werkVoortgangBij() {
    const n = vragen.filter(beantwoord).length;
    const tekst = `${getal(n)} van ${getal(totaal)} ${totaal === 1 ? 'vraag' : 'vragen'} beantwoord`;
    if (voortgangTekst.textContent !== tekst) voortgangTekst.textContent = tekst;
    vulling.style.width = `${Math.round((n / totaal) * 100)}%`;
  }

  // --- Lokaasveld (voor robots) ---
  const lokaas = h('input', { type: 'text', id: 'vl-website', name: 'website', tabindex: '-1', autocomplete: 'off' });
  const lokaasBlok = h('div', { class: 'vl-lokaas', 'aria-hidden': 'true' },
    h('label', { for: 'vl-website' }, 'Laat dit veld leeg'),
    lokaas,
  );

  // --- Versturen ---
  const samenvatting = h('div', { class: 'vl-samenvatting', 'aria-live': 'polite' });
  const knop = h('button', { type: 'submit', class: 'knop knop-primair vl-knop-verstuur' }, 'Versturen');
  const verstuurBlok = h('div', { class: 'vl-verstuur' },
    h('p', { class: 'vl-verstuur-uitleg' }, 'Klaar? Controleer je antwoorden en verstuur ze. Daarna kun je ze niet meer aanpassen.'),
    samenvatting,
    knop,
  );

  const heeftVerplicht = vragen.some((i) => i.vraag.verplicht);
  const formulier = h('form', { class: 'vl-formulier', novalidate: true, autocomplete: 'off' },
    heeftVerplicht
      ? h('p', { class: 'vl-verplicht-uitleg' }, 'Vragen met ', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, '*'),
        h('span', { class: 'sr-only' }, 'een sterretje'), ' zijn verplicht.')
      : null,
    voortgang,
    secties,
    lokaasBlok,
    verstuurBlok,
  );

  // --- Toestand ---
  let begonnen = false;
  let verstuurd = false;
  let bezig = false;

  function waarschuwBijVerlaten(e) {
    if (begonnen && !verstuurd) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  function zetFout(item, aan) {
    item.veld.classList.toggle('vl-vraag-ongeldig', aan);
    if (aan) item.veld.setAttribute('aria-invalid', 'true');
    else item.veld.removeAttribute('aria-invalid');
    if (item.tekstvak) {
      if (aan) item.tekstvak.setAttribute('aria-invalid', 'true');
      else item.tekstvak.removeAttribute('aria-invalid');
    }
    item.fout.hidden = !aan;
  }

  function markeer(ontbrekend) {
    const set = new Set(ontbrekend);
    for (const item of vragen) zetFout(item, set.has(item));
  }

  function toonSamenvatting(soort, ...inhoud) {
    vervang(samenvatting, h('div', { class: `melding${soort ? ` melding-${soort}` : ''}` }, inhoud));
  }

  function naarVraag(item) {
    const doel = item.tekstvak || item.invoer[0];
    item.veld.scrollIntoView({ block: 'start', behavior: rustig.matches ? 'auto' : 'smooth' });
    if (doel) doel.focus({ preventScroll: true });
  }

  function toonOntbrekend(items, kop) {
    const nrs = items.map((i) => i.nr);
    toonSamenvatting('gevaar',
      h('p', { class: 'vl-samenvatting-kop' }, kop),
      h('p', {}, items.length === 1
        ? `Het gaat om vraag ${nrs[0]}. Die is hierboven rood gemarkeerd.`
        : `Het gaat om de vragen ${opsomming(nrs)}. Ze zijn hierboven rood gemarkeerd.`),
      h('div', { class: 'knoppen' }, items.slice(0, 12).map((i) =>
        h('button', { type: 'button', class: 'knop', onclick: () => naarVraag(i) }, `Naar vraag ${i.nr}`))),
    );
  }

  function opnieuwProberenKnop() {
    return h('div', { class: 'knoppen' },
      h('button', { type: 'button', class: 'knop', onclick: () => verstuur() }, 'Opnieuw proberen'));
  }

  function verzamel() {
    const antwoorden = {};
    for (const item of vragen) {
      const w = waardeVan(item);
      if (w !== undefined) antwoorden[String(item.vraag.id)] = w;
    }
    return antwoorden;
  }

  async function verstuur() {
    if (bezig || verstuurd) return;

    const ontbrekend = vragen.filter((i) => i.vraag.verplicht && !beantwoord(i));
    markeer(ontbrekend);
    if (ontbrekend.length) {
      toonOntbrekend(ontbrekend, 'Je hebt nog niet alle verplichte vragen beantwoord.');
      naarVraag(ontbrekend[0]);
      return;
    }
    const antwoorden = verzamel();
    if (!Object.keys(antwoorden).length) {
      toonSamenvatting('waarschuwing',
        h('p', {}, 'Je hebt nog geen vragen beantwoord. Beantwoord minimaal één vraag voordat je je antwoorden verstuurt.'));
      return;
    }

    bezig = true;
    knop.disabled = true;
    knop.textContent = 'Bezig met versturen…';
    formulier.setAttribute('aria-busy', 'true');
    samenvatting.replaceChildren();

    const r = await verzoek('POST', { antwoorden, website: lokaas.value });

    bezig = false;
    knop.disabled = false;
    knop.textContent = 'Versturen';
    formulier.removeAttribute('aria-busy');

    if (r.netwerkfout) {
      toonSamenvatting('gevaar',
        h('p', { class: 'vl-samenvatting-kop' }, 'Versturen is niet gelukt: er is geen verbinding met internet.'),
        h('p', {}, 'Je antwoorden zijn niet verloren, ze staan nog hierboven. Controleer je verbinding en probeer het opnieuw.'),
        opnieuwProberenKnop());
      return;
    }
    if (r.ok && r.data && r.data.ok) {
      verstuurd = true;
      window.removeEventListener('beforeunload', waarschuwBijVerlaten);
      opslagSchrijven(`ingevuld:${code}`, '1');
      toonBedankt(titel, r.data.bedanktekst);
      return;
    }

    const melding = r.data && typeof r.data.fout === 'string' ? r.data.fout : null;
    if (r.status === 400 && r.data && Array.isArray(r.data.ontbrekend) && r.data.ontbrekend.length) {
      const bekend = r.data.ontbrekend.map((id) => perId.get(String(id))).filter(Boolean);
      if (bekend.length === r.data.ontbrekend.length) {
        markeer(bekend);
        toonOntbrekend(bekend, melding || 'Niet alle verplichte vragen zijn beantwoord.');
        naarVraag(bekend[0]);
        return;
      }
      // De server kent verplichte vragen die op deze pagina nog niet staan: de vragenlijst is intussen aangepast.
      markeer(bekend);
      toonSamenvatting('waarschuwing',
        h('p', { class: 'vl-samenvatting-kop' }, 'De vragenlijst is aangepast nadat je deze pagina opende.'),
        h('p', {}, 'Laad de pagina opnieuw om de nieuwste versie te zien. Let op: je moet je antwoorden dan opnieuw invullen.'),
        h('div', { class: 'knoppen' }, h('button', {
          type: 'button',
          class: 'knop',
          onclick: () => {
            window.removeEventListener('beforeunload', waarschuwBijVerlaten);
            location.reload();
          },
        }, 'Pagina opnieuw laden')));
      return;
    }
    if (r.status === 409) {
      toonSamenvatting('waarschuwing',
        h('p', { class: 'vl-samenvatting-kop' }, melding || 'Deze vragenlijst is gesloten. Je antwoorden zijn niet opgeslagen.'),
        h('p', {}, 'Heb je hier een vraag over? Neem dan contact op met degene die je de link heeft gestuurd.'));
      return;
    }
    if (r.status === 429) {
      toonSamenvatting('waarschuwing',
        h('p', { class: 'vl-samenvatting-kop' }, 'Het is op dit moment erg druk.'),
        h('p', {}, melding || 'Er worden op dit moment erg veel antwoorden verstuurd. Probeer het over een kwartier opnieuw.'),
        h('p', {}, 'Je antwoorden staan nog hierboven. Laat deze pagina dus gewoon openstaan.'),
        opnieuwProberenKnop());
      return;
    }
    if (r.status === 413) {
      toonSamenvatting('gevaar',
        h('p', { class: 'vl-samenvatting-kop' }, 'Je antwoorden zijn samen te lang om te versturen.'),
        h('p', {}, 'Maak je antwoorden op de open vragen wat korter en probeer het opnieuw.'));
      return;
    }
    if (r.status === 404) {
      toonSamenvatting('gevaar',
        h('p', { class: 'vl-samenvatting-kop' }, 'Deze vragenlijst bestaat niet meer. Je antwoorden zijn niet opgeslagen.'),
        h('p', {}, 'Misschien is de link intussen vervangen. Vraag degene die je de link heeft gestuurd om de nieuwe link.'));
      return;
    }
    if (r.status === 400) {
      toonSamenvatting('gevaar',
        h('p', { class: 'vl-samenvatting-kop' }, melding || 'Er klopt iets niet aan je antwoorden.'),
        h('p', {}, 'Controleer je antwoorden en probeer het opnieuw.'));
      return;
    }
    toonSamenvatting('gevaar',
      h('p', { class: 'vl-samenvatting-kop' }, 'Er ging iets mis bij het versturen.'),
      h('p', {}, 'Je antwoorden staan nog hierboven. Probeer het over een paar minuten opnieuw.'),
      opnieuwProberenKnop());
  }

  // --- Gebeurtenissen ---
  function bijWijziging(e) {
    if (e.target === lokaas) return;
    if (!begonnen) {
      begonnen = true;
      window.addEventListener('beforeunload', waarschuwBijVerlaten);
    }
    const veld = e.target.closest('.vl-vraag');
    const item = veld ? perId.get(veld.dataset.vraag) : null;
    if (item && item.veld.classList.contains('vl-vraag-ongeldig') && beantwoord(item)) {
      zetFout(item, false);
      if (!formulier.querySelector('.vl-vraag-ongeldig')) samenvatting.replaceChildren();
    }
    werkVoortgangBij();
  }
  formulier.addEventListener('change', bijWijziging);
  formulier.addEventListener('input', bijWijziging);
  formulier.addEventListener('submit', (e) => {
    e.preventDefault();
    verstuur();
  });

  werkVoortgangBij();

  // --- Al ingevuld op dit apparaat? ---
  const alIngevuld = opslagLezen(`ingevuld:${code}`) !== null;
  let alMelding = null;
  if (alIngevuld) {
    formulier.hidden = true;
    alMelding = h('div', { class: 'melding melding-succes vl-al-ingevuld' },
      h('p', {}, h('strong', {}, 'Je hebt deze vragenlijst op dit apparaat al ingevuld.')),
      h('p', {}, 'Je hoeft niets meer te doen. Vult iemand anders de vragenlijst in op dit apparaat? Kies dan voor ‘Toch opnieuw invullen’.'),
      h('button', {
        type: 'button',
        class: 'knop',
        onclick: () => {
          alMelding.remove();
          formulier.hidden = false;
          const eerste = formulier.querySelector('.vl-thema h2');
          if (eerste) eerste.focus();
        },
      }, 'Toch opnieuw invullen'),
    );
  }

  vervang(hoofd, kop, alMelding, formulier);
}

// ---------- Eén vraag ----------

function maakVraag(vraag, nr) {
  const basis = `v${vraag.id}`;
  const item = { vraag, nr, veld: null, invoer: [], tekstvak: null, fout: null };
  const beschrijving = [];

  const legend = h('legend', { class: 'vl-vraag-tekst' },
    h('span', { class: 'vl-vraag-nr' }, `${nr}.`),
    ' ',
    vraag.tekst,
    vraag.verplicht ? [' ', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, '*'), h('span', { class: 'sr-only' }, ' (verplicht)')] : null,
  );

  let toelichting = null;
  if (vraag.toelichting) {
    toelichting = h('div', { class: 'vl-toelichting', id: `${basis}-toelichting` }, alineas(vraag.toelichting));
    beschrijving.push(toelichting.id);
  }

  let hulp = null;
  if (vraag.type === 'meerkeuze' && vraag.meerdere_antwoorden) {
    hulp = h('p', { class: 'vl-hulp', id: `${basis}-hulp` }, 'Je kunt meerdere antwoorden kiezen.');
    beschrijving.push(hulp.id);
  }

  let foutTekst = 'Deze vraag is verplicht. Kies een antwoord.';
  if (vraag.type === 'open') foutTekst = 'Deze vraag is verplicht. Vul een antwoord in.';
  else if (vraag.type === 'meerkeuze' && vraag.meerdere_antwoorden) foutTekst = 'Deze vraag is verplicht. Kies minimaal één antwoord.';
  item.fout = h('p', { class: 'vl-fout', id: `${basis}-fout`, hidden: true }, foutTekst);
  beschrijving.push(item.fout.id);

  let antwoord;
  switch (vraag.type) {
    case 'schaal':
      antwoord = maakSchaal(item);
      break;
    case 'cijfer':
      antwoord = maakCijfer(item, beschrijving);
      break;
    case 'janee':
      antwoord = h('div', { class: 'vl-opties vl-janee' },
        optie(item, { type: 'radio', waarde: 'ja', inhoud: [teken(false), ' ', h('span', { class: 'vl-optie-tekst' }, 'Ja')] }),
        optie(item, { type: 'radio', waarde: 'nee', inhoud: [teken(false), ' ', h('span', { class: 'vl-optie-tekst' }, 'Nee')] }),
      );
      break;
    case 'meerkeuze': {
      const meer = !!vraag.meerdere_antwoorden;
      antwoord = h('div', { class: 'vl-opties vl-meerkeuze' },
        (vraag.opties || []).map((o) => optie(item, {
          type: meer ? 'checkbox' : 'radio',
          waarde: o.id,
          inhoud: [teken(meer), ' ', h('span', { class: 'vl-optie-tekst' }, o.label)],
        })),
      );
      break;
    }
    case 'open':
    default:
      antwoord = maakOpen(item, beschrijving);
      break;
  }

  item.veld = h('fieldset', {
    class: `vl-vraag vl-vraag-${vraag.type}`,
    id: `vraag-${vraag.id}`,
    'data-vraag': String(vraag.id),
    // Bij een open vraag draagt het tekstvak zelf de beschrijving.
    'aria-describedby': vraag.type === 'open' ? null : beschrijving.join(' '),
  }, legend, toelichting, hulp, item.fout, antwoord);
  return item;
}

/** Rondje of vierkantje voor in een antwoordvlak. */
function teken(vierkant) {
  return h('span', { class: `vl-optie-teken${vierkant ? ' vl-optie-teken-vierkant' : ''}`, 'aria-hidden': 'true' });
}

/** Eén aantikbaar antwoordvlak met een echt (onzichtbaar) keuzerondje of vinkvakje erin. */
function optie(item, { type, waarde, inhoud, klasse = '' }) {
  const invoer = h('input', { type, class: 'vl-optie-invoer', name: `v${item.vraag.id}`, value: waarde });
  item.invoer.push(invoer);
  return h('label', { class: `vl-optie${klasse ? ` ${klasse}` : ''}` }, invoer, h('span', { class: 'vl-optie-vlak' }, inhoud));
}

function maakSchaal(item) {
  const labels = Array.isArray(item.vraag.schaal_labels) && item.vraag.schaal_labels.length === 5
    ? item.vraag.schaal_labels
    : ['1', '2', '3', '4', '5'];
  const rij = h('div', { class: 'vl-opties vl-schaal' },
    labels.map((label, i) => optie(item, {
      type: 'radio',
      waarde: String(i + 1),
      // De spatie tussen cijfer en tekst zorgt dat een schermlezer "1 Helemaal oneens" voorleest.
      inhoud: [h('span', { class: 'vl-optie-nr' }, String(i + 1)), ' ', h('span', { class: 'vl-optie-tekst' }, label)],
    })),
  );
  if (!item.vraag.weet_niet) return rij;
  return [rij, h('div', { class: 'vl-weetniet' },
    optie(item, { type: 'radio', waarde: WEET_NIET, inhoud: [teken(false), ' ', h('span', { class: 'vl-optie-tekst' }, 'Weet niet / n.v.t.')] }),
  )];
}

/**
 * Cijfervraag: 0 tot 10 (aanbevelen) of 1 tot 10 (rapportcijfer), één knop per cijfer. Op een groot scherm in één rij,
 * op een telefoon in twee rijen (0–5 en 6–10, of 1–5 en 6–10). Onder elke rij staat de tekst bij het uiterste
 * ("0 = Zeer onwaarschijnlijk", "10 = Zeer waarschijnlijk"); de vraag en de uiterste knoppen verwijzen ernaar
 * (aria-describedby), zodat een schermlezer ze voorleest.
 */
function maakCijfer(item, beschrijving) {
  const c = item.vraag.cijfer || {};
  const min = Number.isInteger(c.min) ? c.min : 1;
  const max = Number.isInteger(c.max) && c.max > min ? c.max : 10;
  const basis = `v${item.vraag.id}`;
  const laag = h('span', { class: 'vl-cijfer-eind vl-cijfer-laag', id: `${basis}-laag` }, `${min} = ${c.laag || 'laagste cijfer'}`);
  const hoog = h('span', { class: 'vl-cijfer-eind vl-cijfer-hoog', id: `${basis}-hoog` }, `${max} = ${c.hoog || 'hoogste cijfer'}`);
  beschrijving.push(laag.id, hoog.id);
  const knop = (w) => {
    const el = optie(item, { type: 'radio', waarde: String(w), klasse: 'vl-cijfer-optie', inhoud: [h('span', { class: 'vl-cijfer-nr' }, String(w))] });
    const invoer = item.invoer[item.invoer.length - 1];
    if (w === min) invoer.setAttribute('aria-describedby', laag.id);
    if (w === max) invoer.setAttribute('aria-describedby', hoog.id);
    return el;
  };
  // Eerste rij tot en met 5, de tweede vanaf 6.
  const splits = Math.min(max, 5);
  const eerste = [];
  const tweede = [];
  for (let w = min; w <= max; w++) (w <= splits ? eerste : tweede).push(knop(w));
  const aantal = max - min + 1;
  const rij = h('div', { class: `vl-opties vl-cijfer vl-cijfer-${aantal}` },
    h('div', { class: 'vl-cijfer-rij' }, eerste, laag),
    h('div', { class: 'vl-cijfer-rij' }, tweede, hoog),
  );
  if (!item.vraag.weet_niet) return rij;
  return [rij, h('div', { class: 'vl-weetniet' },
    optie(item, { type: 'radio', waarde: WEET_NIET, inhoud: [teken(false), ' ', h('span', { class: 'vl-optie-tekst' }, 'Weet niet / n.v.t.')] }),
  )];
}

function maakOpen(item, beschrijving) {
  const basis = `v${item.vraag.id}`;
  const teller = h('p', { class: 'vl-teller', id: `${basis}-teller` });
  const tekstvak = h('textarea', {
    id: `${basis}-antwoord`,
    name: basis,
    rows: '5',
    maxlength: String(MAX_OPEN),
    autocomplete: 'off',
    'aria-required': item.vraag.verplicht ? 'true' : null,
    'aria-describedby': [...beschrijving, teller.id].join(' '),
  });
  item.tekstvak = tekstvak;

  function werkTellerBij() {
    const n = tekstvak.value.length;
    const vol = n >= MAX_OPEN;
    teller.textContent = vol
      ? `${getal(n)} / ${getal(MAX_OPEN)} tekens – je hebt het maximum bereikt`
      : `${getal(n)} / ${getal(MAX_OPEN)} tekens`;
    teller.classList.toggle('vl-teller-vol', vol);
  }
  tekstvak.addEventListener('input', werkTellerBij);
  werkTellerBij();

  return h('div', { class: 'vl-open' },
    h('label', { for: tekstvak.id, class: 'sr-only' }, `Je antwoord op vraag ${item.nr}`),
    tekstvak,
    teller,
  );
}

/** Het antwoord op een vraag, in de vorm die de server verwacht; undefined = niet beantwoord. */
function waardeVan(item) {
  const { vraag } = item;
  if (vraag.type === 'open') {
    const t = item.tekstvak ? item.tekstvak.value.trim() : '';
    return t ? t : undefined;
  }
  const gekozen = item.invoer.filter((i) => i.checked).map((i) => i.value);
  if (!gekozen.length) return undefined;
  if (vraag.type === 'meerkeuze' && vraag.meerdere_antwoorden) return gekozen;
  const w = gekozen[0];
  if (vraag.type === 'schaal' || vraag.type === 'cijfer') return w === WEET_NIET ? WEET_NIET : Number(w);
  return w;
}

function beantwoord(item) {
  return waardeVan(item) !== undefined;
}

// ---------- Bedankt ----------

function toonBedankt(titel, bedanktekst) {
  document.title = `Verstuurd – ${titel}`;
  const tekst = typeof bedanktekst === 'string' && bedanktekst.trim()
    ? bedanktekst
    : 'Hartelijk dank voor het invullen! Je antwoorden zijn opgeslagen.';
  const kop = h('h1', { tabindex: '-1' }, 'Je antwoorden zijn verstuurd');
  vervang(hoofd, h('div', { class: 'vl-bericht vl-bericht-succes' },
    icoon('vinkje'),
    h('p', { class: 'vl-bovenschrift' }, titel),
    kop,
    h('div', { class: 'vl-bedankt-tekst' }, alineas(tekst)),
  ));
  window.scrollTo({ top: 0, behavior: 'auto' });
  kop.focus({ preventScroll: true });
}

start();
