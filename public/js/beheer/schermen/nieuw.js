// Scherm: Nieuw onderzoek – in vier stappen:
//   1. Gegevens            bedrijfsnaam, titel, onderzoeksvraag, toelichting
//   2. Sjablonen kiezen    een of meer sjablonen, of zonder sjabloon beginnen
//   3. Inhoud aanpassen    de samengevoegde inhoud vrij aanpassen (gedeelde sjablooneditor)
//   4. Aanmaken            overzicht en aanmaken
// Er wordt pas iets opgeslagen bij "Onderzoek aanmaken" in stap 4.

import { api } from '../api.js';
import { h, vervang, laden, melding, meld, bevestig, maakDialoog, aantal, vertraag } from '../ui.js';
import { maakSjabloonEditor, kladblok, telInhoud, legeInhoud } from '../sjabloon-editor.js';
import { samenvattingTekst, inhoudSchakelaar, neemVoorkeuze, sjabloonLabels } from './sjablonen.js';

const MAX_SJABLONEN = 10; // de server voegt er maximaal 10 samen
const STAPPEN = ['Gegevens', 'Sjablonen kiezen', 'Inhoud aanpassen', 'Aanmaken'];

// Welk veld hoort bij een foutmelding van de server ("Titel is verplicht." e.d.)?
const VELD_BIJ_MELDING = [
  ['Bedrijfsnaam', 'bedrijfsnaam'],
  ['Titel', 'titel'],
  ['Onderzoeksvraag', 'onderzoeksvraag'],
  ['Toelichting', 'toelichting'],
];

export async function toon(container, ctx) {
  ctx.zetTitel('Nieuw onderzoek');

  // Was je al bezig en ging je per ongeluk weg? Dan staat je werk nog in het kladblok.
  const klad = kladblok('nieuw-onderzoek');
  const voorkeuze = neemVoorkeuze(); // sjabloon gekozen via "Gebruiken voor nieuw onderzoek"
  const concept = voorkeuze ? null : klad.lees();
  if (voorkeuze) klad.wis(); // bewust opnieuw begonnen met een gekozen sjabloon

  let stap = 1;
  let bezig = false;
  let klaar = false; // onderzoek aangemaakt: niets meer bewaken
  let sjablonen = [];
  let vakjes = [];
  let editor = null;
  let editorVoor = null; // de keuze (ids) waarmee de inhoud van stap 3 is opgebouwd
  let inhoudAangepast = !!concept?.aangepast;
  let geladen = false; // pas daarna wordt het kladblok bijgehouden

  // ---------- Stap 1: gegevens ----------

  const velden = {};
  function veld(naam, label, invoer, { verplicht = false, hulp = null } = {}) {
    const id = `nieuw-${naam}`;
    const hulpId = hulp ? `${id}-hulp` : null;
    const foutId = `${id}-fout`;
    invoer.id = id;
    invoer.name = naam;
    invoer.setAttribute('aria-describedby', [hulpId, foutId].filter(Boolean).join(' '));
    if (verplicht) invoer.setAttribute('aria-required', 'true');
    const fout = h('div', { class: 'veld-fout', id: foutId });
    invoer.addEventListener('input', () => {
      if (invoer.getAttribute('aria-invalid')) {
        invoer.removeAttribute('aria-invalid');
        fout.textContent = '';
      }
    });
    if (concept?.velden && typeof concept.velden[naam] === 'string') invoer.value = concept.velden[naam];
    velden[naam] = { invoer, fout };
    return h('div', { class: 'veld' },
      h('label', { for: id }, label, verplicht ? h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *') : null),
      invoer,
      hulp ? h('div', { class: 'veld-hulp', id: hulpId }, hulp) : null,
      fout,
    );
  }

  function zetVeldFout(naam, tekst) {
    const v = velden[naam];
    v.invoer.setAttribute('aria-invalid', 'true');
    v.fout.textContent = tekst;
    return v.invoer;
  }

  const waarden = () => Object.fromEntries(Object.entries(velden).map(([naam, v]) => [naam, v.invoer.value.trim()]));

  const voorkeuzeInfo = h('div', {});
  const stap1 = h('section', { class: 'kaart nieuw-stap', 'aria-labelledby': 'nieuw-kop-1' },
    h('h2', { id: 'nieuw-kop-1', tabindex: '-1' }, 'Gegevens van het onderzoek'),
    h('p', { class: 'klein zacht' }, 'Velden met een ', h('span', { class: 'verplicht-teken' }, '*'), ' zijn verplicht. Je kunt alles later nog aanpassen.'),
    voorkeuzeInfo,
    h('form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); gaNaar(2); } },
      h('div', { class: 'nieuw-rij' },
        veld('bedrijfsnaam', 'Bedrijfsnaam',
          h('input', { type: 'text', maxlength: 150, autocomplete: 'off', placeholder: 'Bijv. Voorbeeld BV' }),
          { verplicht: true, hulp: 'De organisatie waar je het onderzoek doet. In de teksten van een sjabloon komt deze naam op de plek van {bedrijf}.' }),
        veld('titel', 'Titel van het onderzoek',
          h('input', { type: 'text', maxlength: 200, autocomplete: 'off', placeholder: 'Bijv. Medewerkersonderzoek 2026' }),
          { verplicht: true }),
      ),
      veld('onderzoeksvraag', 'Onderzoeksvraag',
        h('textarea', { rows: 3, maxlength: 2000, placeholder: 'Bijv. Hoe ervaren medewerkers hun werkdruk, en wat kan er beter?' }),
        { hulp: 'Wat wil de opdrachtgever weten? Respondenten zien dit niet.' }),
      veld('toelichting', 'Toelichting (optioneel)',
        h('textarea', { rows: 3, maxlength: 5000 }),
        { hulp: 'Bijvoorbeeld de aanleiding, afspraken met de opdrachtgever of de planning. Respondenten zien dit niet.' }),
      // Onzichtbare verzendknop: Enter in een tekstveld gaat naar de volgende stap.
      h('button', { type: 'submit', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' }, 'Volgende'),
    ),
  );

  // ---------- Stap 2: sjablonen kiezen ----------

  const sjabloonLijst = h('div', {}, laden('Sjablonen worden geladen…'));
  const keuzeSamenvatting = h('p', { class: 'nieuw-keuze', 'aria-live': 'polite' });
  const herbouwInfo = h('div', {});

  const gekozenIds = () => vakjes.filter((v) => v.checked).map((v) => v.value);
  const naamVan = (id) => sjablonen.find((s) => String(s.id) === String(id))?.naam || '';
  const lijstTekst = (namen) => (namen.length <= 1 ? namen.join('') : `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`);

  function werkKeuzeBij() {
    const gekozen = gekozenIds();
    for (const v of vakjes) v.closest('.nieuw-sjabloon').classList.toggle('is-gekozen', v.checked);
    if (!gekozen.length) {
      vervang(keuzeSamenvatting, 'Geen sjabloon gekozen: je begint met een lege opzet, die je in de volgende stap zelf kunt vullen.');
    } else {
      vervang(keuzeSamenvatting, `Gekozen: ${lijstTekst(gekozen.map(naamVan))}.`,
        gekozen.length > 1 ? ' De sjablonen worden samengevoegd tot één opzet.' : '');
    }
    const anders = editor && inhoudAangepastNu() && gekozen.join(',') !== editorVoor;
    vervang(herbouwInfo, anders
      ? melding('Let op: je hebt de inhoud in stap 3 al aangepast. Met deze andere keuze wordt de inhoud opnieuw opgebouwd en gaan die aanpassingen verloren.', 'waarschuwing')
      : null);
  }

  function tekenSjablonen() {
    vakjes = [];
    if (!sjablonen.length) {
      vervang(sjabloonLijst, h('p', { class: 'zacht' }, 'Er zijn geen sjablonen. Je begint met een lege opzet, die je in de volgende stap zelf kunt vullen.'));
      werkKeuzeBij();
      return;
    }
    const vooraf = new Set(concept?.gekozen ? concept.gekozen.map(String) : voorkeuze ? [voorkeuze] : []);
    const items = sjablonen.map((s, i) => {
      const id = `nieuw-sj-${i}`;
      const vakje = h('input', {
        type: 'checkbox',
        id,
        value: String(s.id),
        checked: vooraf.has(String(s.id)),
        'aria-labelledby': `${id}-naam`,
        'aria-describedby': `${id}-oms ${id}-tal`,
        onchange: werkKeuzeBij,
      });
      vakjes.push(vakje);
      const { knop, paneel } = inhoudSchakelaar(s, { instellingen: ctx.instellingen, niveau: 3 });
      return h('li', { class: 'nieuw-sjabloon' },
        h('label', { class: 'keuze nieuw-sjabloon-keuze', for: id },
          vakje,
          h('span', { class: 'nieuw-sjabloon-tekst' },
            h('span', { class: 'nieuw-sjabloon-naam', id: `${id}-naam` }, s.naam, ' ', sjabloonLabels(s)),
            h('span', { class: 'nieuw-sjabloon-oms', id: `${id}-oms` }, s.omschrijving || ''),
            h('span', { class: 'nieuw-sjabloon-tal', id: `${id}-tal` }, samenvattingTekst(s.samenvatting)),
          ),
        ),
        h('div', { class: 'nieuw-sjabloon-voorbeeld' }, knop, paneel),
      );
    });
    vervang(sjabloonLijst, h('ul', { class: 'nieuw-sjablonen' }, items));
    werkKeuzeBij();
  }

  async function laadSjablonen() {
    try {
      sjablonen = (await api.get('/sjablonen')).sjablonen || [];
      tekenSjablonen();
      if (voorkeuze && naamVan(voorkeuze)) {
        vervang(voorkeuzeInfo, melding(['Je begint met het sjabloon ', h('strong', {}, naamVan(voorkeuze)),
          '. In stap 2 kun je er nog sjablonen bij kiezen, en in stap 3 pas je de inhoud aan.']));
      }
    } catch (e) {
      if (e.status === 401) throw e;
      sjablonen = [];
      vakjes = [];
      vervang(sjabloonLijst, melding([
        h('p', {}, `De sjablonen konden niet worden geladen. ${e.message || ''}`),
        h('p', {}, 'Je kunt ook zonder sjabloon verdergaan.'),
        h('button', { type: 'button', class: 'knop knop-klein', onclick: () => { vervang(sjabloonLijst, laden()); laadSjablonen().catch(() => {}); } }, 'Opnieuw proberen'),
      ], 'waarschuwing'));
      werkKeuzeBij();
    }
  }

  const stap2 = h('section', { class: 'kaart nieuw-stap', 'aria-labelledby': 'nieuw-kop-2' },
    h('h2', { id: 'nieuw-kop-2', tabindex: '-1' }, 'Sjablonen kiezen'),
    h('p', {}, 'Met een sjabloon begin je niet leeg: je krijgt thema\'s met meetpunten, een vragenlijst en een actielijst. In de volgende stap pas je alles aan.'),
    h('ul', { class: 'nieuw-uitleg klein' },
      h('li', {}, 'Je kunt meerdere sjablonen combineren. Thema\'s met dezelfde naam worden samengevoegd; dubbele vragen en acties komen er maar één keer in.'),
      h('li', {}, 'Alle vragen komen samen in één vragenlijst voor het meetmoment "Nulmeting". Die staat nog dicht tot je hem zelf openzet.'),
    ),
    herbouwInfo,
    h('fieldset', { class: 'nieuw-sjablonen-veld' },
      h('legend', {}, 'Kies een of meer sjablonen'),
      sjabloonLijst,
    ),
    h('div', { class: 'nieuw-zonder' },
      h('span', {}, 'Liever alles zelf opbouwen?'),
      h('button', {
        type: 'button',
        class: 'knop knop-klein',
        onclick: () => {
          for (const v of vakjes) v.checked = false;
          werkKeuzeBij();
          gaNaar(3);
        },
      }, 'Zonder sjabloon beginnen'),
    ),
    keuzeSamenvatting,
  );

  // ---------- Stap 3: inhoud aanpassen ----------

  const editorHouder = h('div', {});
  const stap3Intro = h('p', { class: 'nieuw-stap-intro' });
  const bewaarVakje = h('input', { type: 'checkbox', id: 'nieuw-bewaar', checked: !!concept?.bewaar });
  const sjabloonNaam = h('input', {
    type: 'text', id: 'nieuw-sjabloon-naam', maxlength: 150, autocomplete: 'off', 'aria-required': 'true', 'aria-describedby': 'nieuw-sjabloon-naam-fout',
    placeholder: 'Bijvoorbeeld: Medewerkersonderzoek met verzuimcijfers',
  });
  const sjabloonNaamFout = h('div', { class: 'veld-fout', id: 'nieuw-sjabloon-naam-fout' });
  const sjabloonOms = h('textarea', { id: 'nieuw-sjabloon-oms', rows: 2, maxlength: 1000 });
  sjabloonNaam.value = String(concept?.sjabloonNaam ?? '');
  sjabloonOms.value = String(concept?.sjabloonOms ?? '');
  const bewaarVelden = h('div', { class: 'nieuw-bewaar-velden' },
    h('div', { class: 'veld' },
      h('label', { for: 'nieuw-sjabloon-naam' }, 'Naam van het nieuwe sjabloon', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
      sjabloonNaam,
      sjabloonNaamFout),
    h('div', { class: 'veld' },
      h('label', { for: 'nieuw-sjabloon-oms' }, 'Omschrijving'),
      sjabloonOms,
      h('div', { class: 'veld-hulp' }, 'Waar is dit sjabloon voor bedoeld? Je ziet dit bij het kiezen van een sjabloon.')),
  );
  const werkBewaarBij = () => bewaarVelden.classList.toggle('verborgen', !bewaarVakje.checked);
  bewaarVakje.addEventListener('change', () => {
    werkBewaarBij();
    if (bewaarVakje.checked) sjabloonNaam.focus();
  });
  sjabloonNaam.addEventListener('input', () => {
    sjabloonNaam.removeAttribute('aria-invalid');
    sjabloonNaamFout.textContent = '';
  });
  werkBewaarBij();

  const stap3 = h('div', { class: 'nieuw-stap' },
    h('section', { class: 'kaart', 'aria-labelledby': 'nieuw-kop-3' },
      h('h2', { id: 'nieuw-kop-3', tabindex: '-1' }, 'Inhoud aanpassen'),
      stap3Intro,
      h('p', { class: 'klein zacht nieuw-laatste' }, 'Er wordt nog niets opgeslagen: het onderzoek wordt pas aangemaakt in stap 4. Ook daarna kun je in het onderzoek alles nog wijzigen.'),
    ),
    editorHouder,
    h('section', { class: 'kaart nieuw-bewaar', 'aria-labelledby': 'nieuw-kop-bewaar' },
      h('h3', { id: 'nieuw-kop-bewaar' }, 'Vaker gebruiken?'),
      h('div', { class: 'veld' },
        h('label', { class: 'keuze', for: 'nieuw-bewaar' }, bewaarVakje, h('span', {}, 'Bewaar dit ook als nieuw sjabloon')),
        h('div', { class: 'veld-hulp' }, 'De inhoud hierboven wordt dan ook als eigen sjabloon bewaard, zodat je hem bij een volgend onderzoek opnieuw kunt kiezen. De sjablonen die je hebt gekozen veranderen niet.')),
      bewaarVelden,
    ),
  );

  const inhoudAangepastNu = () => inhoudAangepast || (!!editor && editor.isGewijzigd());

  function maakEditor(inhoud, voor) {
    if (editor) editor.sluit();
    editor = maakSjabloonEditor({
      inhoud,
      instellingen: ctx.instellingen,
      bedrijf: velden.bedrijfsnaam.invoer.value,
      kopNiveau: 3,
      opWijziging: kladLater,
    });
    editorVoor = voor;
    vervang(editorHouder, editor.element);
  }

  /** Zorgt dat de inhoud van stap 3 past bij de keuze in stap 2. Geeft false als je in stap 2 blijft. */
  async function bereidInhoudVoor() {
    const ids = gekozenIds();
    if (ids.length > MAX_SJABLONEN) {
      toonFout(`Je kunt maximaal ${MAX_SJABLONEN} sjablonen tegelijk kiezen (nu ${ids.length}).`);
      return false;
    }
    const voor = ids.join(',');
    if (editor && editorVoor === voor) return true;
    if (editor && inhoudAangepastNu()) {
      const ok = await bevestig({
        titel: 'Inhoud opnieuw opbouwen?',
        tekst: 'Je hebt een andere keuze gemaakt dan waarmee de inhoud van stap 3 is opgebouwd. De inhoud wordt opnieuw opgebouwd; wat je in stap 3 had aangepast, gaat verloren.',
        knop: 'Opnieuw opbouwen',
        gevaar: true,
      });
      if (!ok) return false;
    }
    let inhoud = legeInhoud();
    if (ids.length) {
      try {
        ({ inhoud } = await api.post('/sjablonen/samenvoegen', { ids: ids.map(Number) }));
      } catch (e) {
        if (e.status !== 401) toonFout(`De inhoud van de gekozen sjablonen kon niet worden opgehaald. ${e.message || ''}`);
        return false;
      }
    }
    inhoudAangepast = false;
    maakEditor(inhoud, voor);
    return true;
  }

  function tekenStap3Intro() {
    const ids = editorVoor ? editorVoor.split(',') : [];
    const namen = ids.map(naamVan).filter(Boolean);
    stap3Intro.textContent = ids.length
      ? `Dit is de inhoud van ${namen.length ? lijstTekst(namen.map((n) => `"${n}"`)) : 'de gekozen sjablonen'}${ids.length > 1 ? ', samengevoegd' : ''}. Pas aan wat je wilt: je kunt teksten, thema's, meetpunten, vragen en acties wijzigen, toevoegen, verwijderen en in een andere volgorde zetten.`
      : "Je begint zonder sjabloon. Voeg hier alvast thema's, vragen en acties toe, of ga verder en doe dat later in het onderzoek.";
  }

  // ---------- Stap 4: aanmaken ----------

  const overzichtEl = h('div', {});
  const stap4 = h('section', { class: 'kaart nieuw-stap', 'aria-labelledby': 'nieuw-kop-4' },
    h('h2', { id: 'nieuw-kop-4', tabindex: '-1' }, 'Controleren en aanmaken'),
    overzichtEl,
  );

  function tekenOverzicht() {
    const w = waarden();
    const inhoud = editor ? editor.waarde() : legeInhoud();
    const t = telInhoud(inhoud);
    const regel = (term, ...tekst) => [h('dt', {}, term), h('dd', {}, tekst)];
    vervang(overzichtEl,
      h('p', {}, 'Klopt dit? Dan maak je het onderzoek aan. Je komt daarna op het tabblad Opzet.'),
      h('dl', { class: 'nieuw-overzicht' },
        regel('Bedrijf', w.bedrijfsnaam),
        regel('Titel', w.titel),
        w.onderzoeksvraag ? regel('Onderzoeksvraag', w.onderzoeksvraag) : null,
        regel("Thema's", t.themas
          ? `${aantal(t.themas, 'thema', "thema's")} met ${aantal(t.meetpunten, 'meetpunt', 'meetpunten')}`
          : "Nog geen thema's (die voeg je later toe bij Opzet)"),
        regel('Vragenlijst', t.vragen
          ? `Eén vragenlijst met ${aantal(t.vragen, 'vraag', 'vragen')}${inhoud.vragenlijst.titel ? ` ("${inhoud.vragenlijst.titel}")` : ''}, gekoppeld aan het meetmoment "Nulmeting". Hij staat dicht tot je hem zelf openzet.`
          : 'Nog geen vragenlijst (die maak je later bij Vragenlijsten)'),
        regel('Acties', t.acties ? aantal(t.acties, 'actie', 'acties') : 'Nog geen acties'),
        regel('Verder', 'Het meetmoment "Nulmeting" en drie lege stukken: Notities, Bevindingen en Conceptrapport.'),
        bewaarVakje.checked ? regel('Nieuw sjabloon', `De inhoud wordt ook bewaard als sjabloon "${sjabloonNaam.value.trim()}".`) : null,
      ),
    );
  }

  // ---------- Stappen wisselen ----------

  const stappenEl = h('ol', { class: 'nieuw-stappen', 'aria-label': 'Stappen' });
  const foutEl = h('div', { class: 'nieuw-algemene-fout' });
  const vorigeKnop = h('button', { type: 'button', class: 'knop', onclick: () => gaNaar(stap - 1) }, '← Vorige');
  const volgendeKnop = h('button', { type: 'button', class: 'knop knop-primair', onclick: () => (stap < 4 ? gaNaar(stap + 1) : maakAan()) });
  const panelen = [stap1, stap2, stap3, stap4];

  function toonFout(tekst) {
    vervang(foutEl, tekst ? melding(tekst, 'gevaar') : null);
    if (tekst) foutEl.scrollIntoView({ block: 'nearest' });
  }

  function wisFouten() {
    toonFout('');
    for (const v of Object.values(velden)) {
      v.invoer.removeAttribute('aria-invalid');
      v.fout.textContent = '';
    }
  }

  function tekenStap({ focus = true } = {}) {
    vervang(stappenEl, STAPPEN.map((naam, i) => {
      const nr = i + 1;
      const toestand = nr === stap ? 'is-nu' : nr < stap ? 'is-klaar' : '';
      return h('li', { class: `nieuw-stapknop-item ${toestand}` },
        h('button', {
          type: 'button',
          class: 'nieuw-stapknop',
          'aria-current': nr === stap ? 'step' : null,
          'aria-label': `Stap ${nr} van ${STAPPEN.length}: ${naam}${nr < stap ? ' (ingevuld)' : ''}`,
          onclick: () => gaNaar(nr),
        },
        h('span', { class: 'nieuw-stapknop-nr', 'aria-hidden': 'true' }, nr < stap ? '✓' : String(nr)),
        h('span', { class: 'nieuw-stapknop-naam' }, naam)),
      );
    }));
    panelen.forEach((el, i) => {
      el.hidden = i + 1 !== stap;
    });
    vorigeKnop.classList.toggle('verborgen', stap === 1);
    // Op een telefoon is er alleen ruimte voor de korte tekst.
    const [lang, kortTekst] = [
      ['Volgende: sjablonen kiezen →', 'Volgende →'],
      ['Volgende: inhoud aanpassen →', 'Volgende →'],
      ['Volgende: controleren →', 'Volgende →'],
      ['Onderzoek aanmaken', 'Aanmaken'],
    ][stap - 1];
    vervang(volgendeKnop, h('span', { class: 'nieuw-knop-lang' }, lang), h('span', { class: 'nieuw-knop-kort' }, kortTekst));
    if (stap === 2) werkKeuzeBij();
    if (stap === 3) {
      tekenStap3Intro();
      if (editor) editor.zetBedrijf(velden.bedrijfsnaam.invoer.value);
    }
    if (stap === 4) tekenOverzicht();
    if (geladen && isBegonnen()) bewaarKlad(); // zo overleeft je werk ook het opnieuw laden van de pagina
    if (focus) {
      const kop = panelen[stap - 1].querySelector('h2');
      stappenEl.scrollIntoView({ block: 'start' });
      if (kop) kop.focus({ preventScroll: true });
    }
  }

  /** Controleert de huidige stap; geeft true als je verder mag. */
  async function rondAf(nr) {
    if (nr === 1) {
      const w = waarden();
      const ontbreekt = [];
      if (!w.bedrijfsnaam) ontbreekt.push(zetVeldFout('bedrijfsnaam', 'Vul de naam van het bedrijf in.'));
      if (!w.titel) ontbreekt.push(zetVeldFout('titel', 'Geef het onderzoek een titel.'));
      if (ontbreekt.length) {
        ontbreekt[0].focus();
        return false;
      }
      return true;
    }
    if (nr === 2) return bereidInhoudVoor();
    if (nr === 3) {
      const fout = editor ? editor.valideer() : null;
      if (fout) {
        toonFout(['De inhoud klopt nog niet. ', fout]);
        editor.naarFout();
        return false;
      }
      if (bewaarVakje.checked && !sjabloonNaam.value.trim()) {
        sjabloonNaam.setAttribute('aria-invalid', 'true');
        sjabloonNaamFout.textContent = 'Geef het nieuwe sjabloon een naam, of zet het vinkje uit.';
        sjabloonNaam.scrollIntoView({ block: 'center' });
        sjabloonNaam.focus({ preventScroll: true });
        return false;
      }
      return true;
    }
    return true;
  }

  async function gaNaar(doel) {
    if (bezig || doel < 1 || doel > 4 || doel === stap) return;
    wisFouten();
    if (doel < stap) {
      stap = doel;
      tekenStap();
      return;
    }
    bezig = true;
    volgendeKnop.disabled = true;
    let gelukt = true;
    try {
      while (stap < doel) {
        // Sla je stappen over (via de stappen bovenaan), dan elke tussenstap eerst tonen: een fout wijst dan naar de juiste plek.
        if (panelen[stap - 1].hidden) tekenStap({ focus: false });
        if (!(await rondAf(stap))) {
          gelukt = false;
          break;
        }
        stap += 1;
      }
    } finally {
      bezig = false;
      volgendeKnop.disabled = false;
    }
    if (gelukt) tekenStap();
  }

  // ---------- Aanmaken ----------

  async function maakAan() {
    if (bezig) return;
    wisFouten();
    // Alles nog één keer nalopen (je kunt via de stappen bovenaan heen en weer zijn gegaan).
    for (const nr of [1, 2, 3]) {
      const hier = stap;
      stap = nr;
      if (!(await rondAf(nr))) {
        tekenStap({ focus: false }); // de stap met de fout tonen en de fout daar aanwijzen
        await rondAf(nr);
        return;
      }
      stap = hier;
    }
    const body = { ...waarden(), inhoud: editor.waarde() };
    if (bewaarVakje.checked) body.opslaan_als_sjabloon = { naam: sjabloonNaam.value.trim(), omschrijving: sjabloonOms.value.trim() };

    bezig = true;
    volgendeKnop.disabled = true;
    volgendeKnop.textContent = 'Bezig met aanmaken…';
    try {
      const r = await api.post('/onderzoeken', body);
      klaar = true;
      kladLater.annuleer();
      klad.wis();
      meld(r.sjabloon_id ? 'Onderzoek aangemaakt en sjabloon bewaard.' : 'Onderzoek aangemaakt.', 'succes');
      ctx.navigeer(`#/onderzoek/${r.id}/opzet`);
    } catch (err) {
      bezig = false;
      volgendeKnop.disabled = false;
      if (err.status === 401) { // inlogvenster verschijnt vanzelf; daarna opnieuw proberen
        tekenStap({ focus: false });
        return;
      }
      const tekst = err.message || 'Er ging iets mis.';
      const gevonden = err.status === 400 ? VELD_BIJ_MELDING.find(([begin]) => tekst.startsWith(begin)) : null;
      if (gevonden) {
        stap = 1;
        tekenStap({ focus: false });
        zetVeldFout(gevonden[1], tekst).focus();
      } else if (tekst.startsWith('Naam van het sjabloon')) {
        stap = 3;
        tekenStap({ focus: false });
        sjabloonNaam.setAttribute('aria-invalid', 'true');
        sjabloonNaamFout.textContent = tekst;
        sjabloonNaam.focus();
      } else {
        if (/^(Vraag|Thema|Actie|Vragenlijst|Een sjabloon|Het sjabloon|De lijst|Dit sjabloon)\b/.test(tekst)) stap = 3;
        tekenStap({ focus: false });
        toonFout([h('strong', {}, 'Het onderzoek is niet aangemaakt. '), tekst]);
      }
    }
  }

  // ---------- Bewaken: niet zomaar weg met ingevuld werk ----------

  const isBegonnen = () => !klaar && (stap > 1 || Object.values(velden).some((v) => v.invoer.value.trim()));

  // Tijdens het aanpassen van de inhoud het kladblok af en toe bijwerken.
  const kladLater = vertraag(() => {
    if (geladen && isBegonnen()) bewaarKlad();
  }, 1500);

  function bewaarKlad() {
    return klad.bewaar({
      stap,
      velden: Object.fromEntries(Object.entries(velden).map(([naam, v]) => [naam, v.invoer.value])),
      gekozen: gekozenIds(),
      inhoud: editor ? editor.waarde() : null,
      editorVoor,
      aangepast: inhoudAangepastNu(),
      bewaar: bewaarVakje.checked,
      sjabloonNaam: sjabloonNaam.value,
      sjabloonOms: sjabloonOms.value,
    });
  }

  const bijSluiten = (e) => {
    if (!isBegonnen()) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', bijSluiten);

  function vraagBijVertrek() {
    return new Promise((klaarMet) => {
      let stoppen = false;
      const verder = h('button', { type: 'button', class: 'knop knop-primair', onclick: () => d.close() }, 'Verder met invullen');
      const stop = h('button', {
        type: 'button',
        class: 'knop knop-gevaar',
        onclick: () => {
          stoppen = true;
          d.close();
        },
      }, 'Stoppen');
      const d = maakDialoog('Stoppen met het nieuwe onderzoek?',
        h('p', {}, 'Het onderzoek is nog niet aangemaakt. Als je nu stopt, gaat wat je hebt ingevuld verloren.'),
        [stop, verder]);
      d.addEventListener('close', () => klaarMet(stoppen)); // Escape = verder met invullen
      d.showModal();
      verder.focus();
    });
  }

  ctx.bijVertrek(async () => {
    window.removeEventListener('beforeunload', bijSluiten);
    kladLater.annuleer();
    if (editor) editor.sluit();
    if (!isBegonnen()) return;
    if (await vraagBijVertrek()) {
      klad.wis(); // gestopt: niets bewaren
      return;
    }
    if (!bewaarKlad()) {
      meld('Wat je had ingevuld kon niet worden vastgehouden.', 'fout');
      return;
    }
    // Terug naar dit scherm: het adres herstellen en het scherm opnieuw opbouwen (met het kladblok).
    history.replaceState(null, '', '#/nieuw');
    ctx.navigeer('#/nieuw');
  });

  // ---------- Opbouw ----------

  vervang(container,
    h('div', { class: 'nieuw' },
      h('div', { class: 'kruimel nieuw-kruimel' }, h('a', { href: '#/' }, '← Alle onderzoeken')),
      h('div', { class: 'paginakop' },
        h('div', {},
          h('h1', {}, 'Nieuw onderzoek'),
          h('p', { class: 'ondertitel' }, 'In vier stappen: gegevens invullen, sjablonen kiezen, de inhoud aanpassen en aanmaken.'),
        ),
      ),
      stappenEl,
      concept ? melding([
        'Je was al bezig met een nieuw onderzoek. Wat je had ingevuld staat er nog. ',
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          onclick: async () => {
            if (!(await bevestig({
              titel: 'Opnieuw beginnen?',
              tekst: 'Alles wat je voor dit nieuwe onderzoek had ingevuld, wordt gewist.',
              knop: 'Opnieuw beginnen',
              gevaar: true,
            }))) return;
            klaar = true; // niet nog eens vragen bij het verlaten
            kladLater.annuleer();
            klad.wis();
            ctx.navigeer('#/nieuw');
          },
        }, 'Opnieuw beginnen'),
      ], 'succes') : null,
      panelen,
      h('div', { class: 'nieuw-voet' },
        foutEl,
        h('div', { class: 'nieuw-voet-knoppen' },
          h('a', { class: 'knop knop-licht', href: '#/' }, 'Annuleren'),
          h('div', { class: 'knoppen' }, vorigeKnop, volgendeKnop),
        ),
      ),
    ),
  );

  tekenStap({ focus: false });
  await laadSjablonen();

  // Verder waar je was (na "Verder met invullen" of het opnieuw laden van de pagina).
  if (concept) {
    if (concept.inhoud && typeof concept.editorVoor === 'string') maakEditor(concept.inhoud, concept.editorVoor);
    stap = Math.min(Math.max(Number(concept.stap) || 1, 1), editor ? 4 : 2);
  }
  geladen = true;
  if (concept) tekenStap({ focus: false });
  else velden.bedrijfsnaam.invoer.focus();
}
