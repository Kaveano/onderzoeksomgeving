// Gedeelde editor voor de inhoud van een sjabloon: de teksten van de vragenlijst, thema's met
// meetpunten, vragen (per thema) en acties. Gebruikt door de schermen "Sjabloon bewerken" en
// "Nieuw onderzoek" (stap 3: inhoud aanpassen).
//
//   const editor = maakSjabloonEditor({ inhoud, instellingen, opWijziging });
//   container.append(editor.element);
//   editor.waarde()       → de inhoud in dezelfde vorm als de server verwacht
//   editor.isGewijzigd()  → true als er iets is veranderd sinds het begin (of sinds markeerOpgeslagen())
//   editor.valideer()     → Nederlandse foutmelding, of null als alles klopt
//   editor.naarFout()     → springt naar het onderdeel van de laatste foutmelding
//
// De editor slaat zelf niets op: het scherm eromheen bewaart editor.waarde().
// Binnen de editor verwijzen vragen naar hun thema en meetpunt via een intern nummer; daardoor
// blijven vragen gekoppeld als je een thema of meetpunt een andere naam geeft.

import { h, vervang, leeg, melding, bevestig, formulierDialoog, uniekeId, aantal } from './ui.js';

export const MAX_THEMAS = 40;
export const MAX_MEETPUNTEN = 30; // per thema
export const MAX_VRAGEN = 100;
export const MAX_ACTIES = 100;
export const MAX_OPTIES = 30;

const PLEK = '{bedrijf}';

// Terugval als de vaste lijsten van de server (ctx.instellingen) ontbreken.
const VRAAGTYPEN = { schaal: 'Schaal 1 tot 5', meerkeuze: 'Meerkeuze', janee: 'Ja / nee', open: 'Open tekst' };
const SCHALEN = {
  eens: ['Helemaal oneens', 'Oneens', 'Neutraal', 'Eens', 'Helemaal eens'],
  tevreden: ['Zeer ontevreden', 'Ontevreden', 'Neutraal', 'Tevreden', 'Zeer tevreden'],
  frequentie: ['Nooit', 'Zelden', 'Soms', 'Vaak', 'Altijd'],
  kwaliteit: ['Zeer slecht', 'Slecht', 'Voldoende', 'Goed', 'Zeer goed'],
};
const SCHAAL_NAMEN = {
  eens: 'Eens – oneens',
  tevreden: 'Tevreden – ontevreden',
  frequentie: 'Nooit – altijd',
  kwaliteit: 'Zeer slecht – zeer goed',
};
const TYPE_UITLEG = {
  schaal: 'Vijf antwoorden van laag naar hoog, bijvoorbeeld van "helemaal oneens" tot "helemaal eens".',
  meerkeuze: 'Respondenten kiezen uit antwoorden die jij opgeeft, bijvoorbeeld hun afdeling.',
  janee: 'Respondenten antwoorden met ja of nee.',
  open: 'Respondenten schrijven zelf een antwoord.',
};

const sleutel = (s) => String(s ?? '').trim().toLowerCase();
const tekstVan = (x) => (x === null || x === undefined ? '' : String(x));
const lijst = (x) => (Array.isArray(x) ? x : []);

function kort(tekst, max = 90) {
  const t = tekstVan(tekst);
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Tekst met {bedrijf} zichtbaar gemarkeerd. */
function metPlek(tekst) {
  const delen = tekstVan(tekst).split(PLEK);
  const uit = [];
  delen.forEach((deel, i) => {
    if (i > 0) uit.push(h('span', { class: 'sjabloon-plek' }, PLEK));
    if (deel) uit.push(deel);
  });
  return uit;
}

/** Telt wat er in een inhoud zit: { themas, meetpunten, vragen, acties }. */
export function telInhoud(inhoud) {
  const themas = lijst(inhoud?.themas);
  return {
    themas: themas.length,
    meetpunten: themas.reduce((n, t) => n + lijst(t?.meetpunten).length, 0),
    vragen: lijst(inhoud?.vragen).length,
    acties: lijst(inhoud?.acties).length,
  };
}

/** Lege inhoud (zelfde vorm als een sjabloon). */
export function legeInhoud() {
  return { vragenlijst: { titel: '', introtekst: '', bedanktekst: '' }, themas: [], vragen: [], acties: [] };
}

/**
 * Klein kladblok in de browser (alleen dit tabblad, verdwijnt bij sluiten) om werk dat nog niet
 * is opgeslagen even vast te houden, bijvoorbeeld als je per ongeluk naar een ander scherm gaat.
 */
export function kladblok(naam) {
  const sleutelNaam = `onderzoek-klad-${naam}`;
  return {
    lees() {
      try {
        const ruw = sessionStorage.getItem(sleutelNaam);
        return ruw ? JSON.parse(ruw) : null;
      } catch {
        return null;
      }
    },
    bewaar(waarde) {
      try {
        sessionStorage.setItem(sleutelNaam, JSON.stringify(waarde));
        return true;
      } catch {
        return false;
      }
    },
    wis() {
      try {
        sessionStorage.removeItem(sleutelNaam);
      } catch {
        /* geen opslag beschikbaar */
      }
    },
  };
}

/**
 * Maakt de editor.
 * - inhoud:        beginwaarde ({ vragenlijst, themas, vragen, acties }); mag leeg zijn
 * - instellingen:  ctx.instellingen (vraagtypen, schalen, schaal_namen, drempel)
 * - opWijziging:   wordt aangeroepen na elke wijziging
 * - bedrijf:       (optioneel) bedrijfsnaam, voor de uitleg over {bedrijf}
 * - kopNiveau:     kopniveau van de onderdelen (2 = <h2>, 3 = <h3>)
 * - titelLeeg:     (optioneel) uitleg bij een lege titel van de vragenlijst
 */
export function maakSjabloonEditor({
  inhoud = null, instellingen = null, opWijziging = null, bedrijf = '', kopNiveau = 2, titelLeeg = '',
} = {}) {
  const inst = instellingen || {};
  const vraagtypen = inst.vraagtypen || VRAAGTYPEN;
  const schalen = inst.schalen || SCHALEN;
  const schaalNamen = inst.schaal_namen || SCHAAL_NAMEN;
  const drempel = inst.drempel || 5;
  const niveau = Math.min(Math.max(Number(kopNiveau) || 2, 2), 5);
  const KOP = `h${niveau}`;
  const SUBKOP = `h${niveau + 1}`;
  const p = uniekeId('sje');
  let uidTeller = 0;
  const nieuwUid = () => `${p}-u${++uidTeller}`;

  // ---------- Het model ----------

  function leesInhoud(ruw) {
    const bron = ruw && typeof ruw === 'object' ? ruw : {};
    const vl = bron.vragenlijst && typeof bron.vragenlijst === 'object' ? bron.vragenlijst : {};
    const m = {
      vragenlijst: { titel: tekstVan(vl.titel), introtekst: tekstVan(vl.introtekst), bedanktekst: tekstVan(vl.bedanktekst) },
      themas: [],
      vragen: [],
      acties: [],
    };
    for (const t of lijst(bron.themas)) {
      if (!t || typeof t !== 'object') continue;
      m.themas.push({
        uid: nieuwUid(),
        naam: tekstVan(t.naam).trim(),
        omschrijving: tekstVan(t.omschrijving).trim(),
        meetpunten: lijst(t.meetpunten).filter((x) => x && typeof x === 'object').map((x) => ({
          uid: nieuwUid(),
          naam: tekstVan(x.naam).trim(),
          omschrijving: tekstVan(x.omschrijving).trim(),
          eenheid: tekstVan(x.eenheid).trim(),
        })),
      });
    }
    for (const v of lijst(bron.vragen)) {
      if (!v || typeof v !== 'object') continue;
      // Een vraag met een thema dat niet in de lijst staat, krijgt dat thema erbij (er gaat niets verloren).
      let thema = m.themas.find((t) => sleutel(t.naam) === sleutel(v.thema));
      if (!thema) {
        thema = { uid: nieuwUid(), naam: tekstVan(v.thema).trim() || 'Zonder thema', omschrijving: '', meetpunten: [] };
        m.themas.push(thema);
      }
      const meetpunt = v.meetpunt ? thema.meetpunten.find((x) => sleutel(x.naam) === sleutel(v.meetpunt)) : null;
      const type = Object.hasOwn(vraagtypen, v.type) ? v.type : 'schaal';
      const meerdere = type === 'meerkeuze' && !!v.meerdere_antwoorden;
      m.vragen.push({
        uid: nieuwUid(),
        themaUid: thema.uid,
        meetpuntUid: meetpunt ? meetpunt.uid : null,
        type,
        tekst: tekstVan(v.tekst).trim(),
        toelichting: tekstVan(v.toelichting).trim(),
        opties: type === 'meerkeuze'
          ? lijst(v.opties).map((o) => tekstVan(typeof o === 'string' ? o : o?.label).trim()).filter(Boolean)
          : [],
        schaal_soort: type === 'schaal' && Object.hasOwn(schalen, v.schaal_soort) ? v.schaal_soort : 'eens',
        meerdere_antwoorden: meerdere,
        verplicht: !!v.verplicht,
        weet_niet: type === 'schaal' && !!v.weet_niet,
        uitsplitsen: !!v.uitsplitsen && ((type === 'meerkeuze' && !meerdere) || type === 'janee'),
      });
    }
    for (const a of lijst(bron.acties)) {
      const t = tekstVan(typeof a === 'string' ? a : a?.titel).trim();
      if (t) m.acties.push({ uid: nieuwUid(), tekst: t });
    }
    return m;
  }

  const model = leesInhoud(inhoud);

  const themaVan = (uid) => model.themas.find((t) => t.uid === uid) || null;
  const vragenVan = (thema) => model.vragen.filter((v) => v.themaUid === thema.uid);
  /** Alle vragen in de volgorde waarin ze worden getoond en opgeslagen: per thema. */
  const vragenOpVolgorde = () => model.themas.flatMap((t) => vragenVan(t));

  function waarde() {
    return {
      vragenlijst: {
        titel: model.vragenlijst.titel.trim(),
        introtekst: model.vragenlijst.introtekst.trim(),
        bedanktekst: model.vragenlijst.bedanktekst.trim(),
      },
      themas: model.themas.map((t) => ({
        naam: t.naam,
        omschrijving: t.omschrijving,
        meetpunten: t.meetpunten.map((m) => ({ naam: m.naam, omschrijving: m.omschrijving, eenheid: m.eenheid })),
      })),
      vragen: model.themas.flatMap((t) => vragenVan(t).map((v) => ({
        thema: t.naam,
        meetpunt: t.meetpunten.find((m) => m.uid === v.meetpuntUid)?.naam ?? null,
        type: v.type,
        tekst: v.tekst,
        toelichting: v.toelichting,
        opties: v.type === 'meerkeuze' ? [...v.opties] : [],
        schaal_soort: v.type === 'schaal' ? v.schaal_soort : 'eens',
        meerdere_antwoorden: v.type === 'meerkeuze' && v.meerdere_antwoorden,
        verplicht: v.verplicht,
        weet_niet: v.type === 'schaal' && v.weet_niet,
        uitsplitsen: v.uitsplitsen && ((v.type === 'meerkeuze' && !v.meerdere_antwoorden) || v.type === 'janee'),
      }))),
      acties: model.acties.map((a) => a.tekst.trim()).filter(Boolean),
    };
  }

  let beginstand = JSON.stringify(waarde());
  const isGewijzigd = () => JSON.stringify(waarde()) !== beginstand;
  const markeerOpgeslagen = () => {
    beginstand = JSON.stringify(waarde());
  };

  // ---------- Opbouw ----------

  const tellersEl = h('span', { class: 'sje-tellers' });
  const vlKaart = h('section', { class: 'kaart sje-sectie', 'aria-labelledby': `${p}-kop-vl` });
  const themaKaart = h('section', { class: 'kaart sje-sectie', 'aria-labelledby': `${p}-kop-themas` });
  const vragenKaart = h('section', { class: 'kaart sje-sectie', 'aria-labelledby': `${p}-kop-vragen` });
  const actieKaart = h('section', { class: 'kaart sje-sectie', 'aria-labelledby': `${p}-kop-acties` });
  const aankondiging = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  let openDialoog = null;

  function kondigAan(tekst) {
    aankondiging.textContent = '';
    setTimeout(() => {
      aankondiging.textContent = tekst;
    }, 60);
  }

  function gewijzigd() {
    tekenTellers();
    if (opWijziging) opWijziging();
  }

  function zetFocus(...sleutels) {
    for (const s of sleutels) {
      const el = element.querySelector(`[data-focus="${s}"]`);
      if (el && !el.disabled) {
        el.focus();
        return true;
      }
    }
    return false;
  }

  function lichtOp(uid) {
    const el = element.querySelector(`[data-uid="${uid}"]`);
    if (!el) return;
    el.classList.remove('sje-oplichten');
    void el.offsetWidth; // animatie opnieuw starten
    el.classList.add('sje-oplichten');
    el.scrollIntoView({ block: 'nearest' });
  }

  function naarSectie(id) {
    const el = element.querySelector(`#${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  }

  function sectieKop(id, titel, uitleg = null, knop = null) {
    return h('div', { class: 'kaart-kop sje-sectie-kop' },
      h('div', { class: 'sje-sectie-titelblok' },
        h(KOP, { id, class: 'sje-sectie-titel', tabindex: '-1' }, titel),
        uitleg ? h('p', { class: 'sje-onderkop' }, uitleg) : null),
      knop ? h('div', { class: 'knoppen' }, knop) : null,
    );
  }

  function pijlen(naam, i, totaal, focusBasis, verplaats) {
    const pijl = (richting, teken, woord) => h('button', {
      type: 'button',
      class: 'knop knop-klein knop-icoon',
      'aria-label': `${naam} ${woord} verplaatsen`,
      title: `${woord[0].toUpperCase()}${woord.slice(1)} verplaatsen`,
      disabled: richting < 0 ? i === 0 : i === totaal - 1,
      'data-focus': `${focusBasis}-${woord}`,
      onclick: () => verplaats(richting),
    }, h('span', { 'aria-hidden': 'true' }, teken));
    return h('span', { class: 'sje-pijlen' }, pijl(-1, '↑', 'omhoog'), pijl(1, '↓', 'omlaag'));
  }

  function tekenTellers() {
    const t = telInhoud(waarde());
    tellersEl.textContent = [
      aantal(t.themas, 'thema', "thema's"),
      aantal(t.meetpunten, 'meetpunt', 'meetpunten'),
      aantal(t.vragen, 'vraag', 'vragen'),
      aantal(t.acties, 'actie', 'acties'),
    ].join(' · ');
  }

  // ---------- 1. Vragenlijst ----------

  const vlVelden = {};
  const bedrijfTip = h('span', {});
  let bedrijfsnaam = tekstVan(bedrijf).trim();
  function tekenBedrijfTip() {
    vervang(bedrijfTip, bedrijfsnaam
      ? ['In dit onderzoek wordt dat ', h('strong', {}, bedrijfsnaam), '.']
      : 'Bij een nieuw onderzoek komt daar vanzelf de bedrijfsnaam te staan.');
  }
  tekenBedrijfTip();

  function tekenVragenlijst() {
    const veld = (naam, label, el, hulp) => {
      el.id = `${p}-vl-${naam}`;
      el.setAttribute('aria-describedby', `${el.id}-hulp`);
      el.value = model.vragenlijst[naam];
      el.addEventListener('input', () => {
        model.vragenlijst[naam] = el.value;
        el.removeAttribute('aria-invalid');
        gewijzigd();
      });
      vlVelden[naam] = el;
      return h('div', { class: 'veld' },
        h('label', { for: el.id }, label),
        el,
        h('div', { class: 'veld-hulp', id: `${el.id}-hulp` }, hulp));
    };
    vervang(vlKaart,
      sectieKop(`${p}-kop-vl`, 'Vragenlijst',
        'De teksten die respondenten zien. Er wordt alleen een vragenlijst gemaakt als er hieronder vragen staan.'),
      melding([
        h('strong', {}, 'Tip: '),
        'typ ', h('span', { class: 'sjabloon-plek' }, PLEK), ' op de plek waar de naam van het bedrijf moet komen. ',
        bedrijfTip,
        ' Dat werkt in alle teksten: ook in thema\'s, vragen en acties.',
      ]),
      veld('titel', 'Titel van de vragenlijst',
        h('input', { type: 'text', maxlength: 200, autocomplete: 'off' }),
        titelLeeg || 'Deze titel zien respondenten bovenaan. Laat je dit leeg, dan krijgt de vragenlijst de titel van het onderzoek.'),
      veld('introtekst', 'Uitleg voor respondenten',
        h('textarea', { rows: 8, maxlength: 5000 }),
        'Staat bovenaan de vragenlijst en legt het doel en de anonimiteit uit. Laat je dit leeg, dan komt er een standaardtekst die klopt met wat de app bewaart.'),
      veld('bedanktekst', 'Bedanktekst',
        h('textarea', { rows: 3, maxlength: 2000 }),
        'Dit zien respondenten na het versturen. Laat je dit leeg, dan komt er een standaardtekst.'),
    );
  }

  // ---------- 2. Thema's en meetpunten ----------

  function themaFormulier(thema = null) {
    return formulierDialoog({
      titel: thema ? 'Thema wijzigen' : 'Nieuw thema',
      knop: thema ? 'Opslaan' : 'Toevoegen',
      intro: thema
        ? 'De vragen van dit thema blijven eraan gekoppeld, ook als je de naam verandert.'
        : 'Een thema is een onderwerp van het onderzoek, bijvoorbeeld Werkdruk of Leiderschap.',
      velden: [
        {
          naam: 'naam',
          label: 'Naam van het thema',
          verplicht: true,
          max: 150,
          waarde: thema?.naam,
          placeholder: 'Bijvoorbeeld: Werkdruk',
          hulp: 'Respondenten zien deze naam als kopje boven de vragen van dit thema.',
        },
        {
          naam: 'omschrijving',
          label: 'Omschrijving',
          type: 'textarea',
          rijen: 3,
          max: 2000,
          waarde: thema?.omschrijving,
          hulp: 'Optioneel. Alleen voor jezelf: wat valt er onder dit thema?',
        },
      ],
      controle: (w) => (model.themas.some((t) => t !== thema && sleutel(t.naam) === sleutel(w.naam))
        ? `Er is al een thema met de naam "${w.naam}". Geef elk thema een eigen naam.`
        : null),
    });
  }

  function meetpuntFormulier(thema, meetpunt = null) {
    return formulierDialoog({
      titel: meetpunt ? 'Meetpunt wijzigen' : `Nieuw meetpunt bij "${kort(thema.naam, 50)}"`,
      knop: meetpunt ? 'Opslaan' : 'Toevoegen',
      intro: meetpunt
        ? 'Vragen die aan dit meetpunt zijn gekoppeld, blijven gekoppeld.'
        : 'Een meetpunt is iets wat je binnen een thema meet, bijvoorbeeld Ervaren werkdruk of Verzuimpercentage.',
      velden: [
        { naam: 'naam', label: 'Naam van het meetpunt', verplicht: true, max: 150, waarde: meetpunt?.naam, placeholder: 'Bijvoorbeeld: Ervaren werkdruk' },
        {
          naam: 'eenheid',
          label: 'Eenheid',
          max: 30,
          waarde: meetpunt?.eenheid,
          placeholder: 'Bijvoorbeeld: score 1–5, % of dagen',
          hulp: 'Optioneel. Waarin druk je dit meetpunt uit?',
        },
        {
          naam: 'omschrijving',
          label: 'Omschrijving',
          type: 'textarea',
          rijen: 2,
          max: 2000,
          waarde: meetpunt?.omschrijving,
          hulp: 'Optioneel. Bijvoorbeeld waar het cijfer vandaan komt.',
        },
      ],
      controle: (w) => (thema.meetpunten.some((m) => m !== meetpunt && sleutel(m.naam) === sleutel(w.naam))
        ? `Dit thema heeft al een meetpunt met de naam "${w.naam}".`
        : null),
    });
  }

  async function nieuwThema() {
    const w = await themaFormulier();
    if (!w) return;
    const thema = { uid: nieuwUid(), naam: w.naam, omschrijving: w.omschrijving, meetpunten: [] };
    model.themas.push(thema);
    tekenThemas();
    tekenVragen();
    gewijzigd();
    lichtOp(thema.uid);
    zetFocus(`thema-${thema.uid}-wijzig`);
  }

  async function wijzigThema(thema) {
    const w = await themaFormulier(thema);
    if (!w) return;
    thema.naam = w.naam;
    thema.omschrijving = w.omschrijving;
    tekenThemas();
    tekenVragen();
    gewijzigd();
    lichtOp(thema.uid);
    zetFocus(`thema-${thema.uid}-wijzig`);
  }

  async function verwijderThema(thema) {
    const n = vragenVan(thema).length;
    const ok = await bevestig({
      titel: 'Thema verwijderen?',
      tekst: [
        `Het thema "${kort(thema.naam)}" wordt verwijderd${thema.meetpunten.length ? `, met ${aantal(thema.meetpunten.length, 'meetpunt', 'meetpunten')}` : ''}.`,
        n ? h('p', {}, h('strong', {}, `Ook de ${n === 1 ? 'vraag' : `${n} vragen`} van dit thema ${n === 1 ? 'wordt' : 'worden'} verwijderd.`),
          ' Wil je de vragen houden? Zet ze dan eerst bij een ander thema.') : null,
      ].filter(Boolean),
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    model.vragen = model.vragen.filter((v) => v.themaUid !== thema.uid);
    model.themas = model.themas.filter((t) => t !== thema);
    tekenThemas();
    tekenVragen();
    gewijzigd();
    zetFocus('thema-toevoegen');
  }

  function verplaatsThema(i, richting) {
    const j = i + richting;
    if (j < 0 || j >= model.themas.length) return;
    const thema = model.themas[i];
    [model.themas[i], model.themas[j]] = [model.themas[j], model.themas[i]];
    tekenThemas();
    tekenVragen();
    gewijzigd();
    lichtOp(thema.uid);
    const eigen = richting < 0 ? 'omhoog' : 'omlaag';
    const tegen = richting < 0 ? 'omlaag' : 'omhoog';
    zetFocus(`thema-${thema.uid}-${eigen}`, `thema-${thema.uid}-${tegen}`);
    kondigAan(`Het thema "${thema.naam}" staat nu op plek ${j + 1} van ${model.themas.length}.`);
  }

  async function nieuwMeetpunt(thema) {
    const w = await meetpuntFormulier(thema);
    if (!w) return;
    const meetpunt = { uid: nieuwUid(), naam: w.naam, omschrijving: w.omschrijving, eenheid: w.eenheid };
    thema.meetpunten.push(meetpunt);
    tekenThemas();
    gewijzigd();
    lichtOp(meetpunt.uid);
    zetFocus(`mp-${meetpunt.uid}-wijzig`);
  }

  async function wijzigMeetpunt(thema, meetpunt) {
    const w = await meetpuntFormulier(thema, meetpunt);
    if (!w) return;
    Object.assign(meetpunt, { naam: w.naam, omschrijving: w.omschrijving, eenheid: w.eenheid });
    tekenThemas();
    tekenVragen();
    gewijzigd();
    lichtOp(meetpunt.uid);
    zetFocus(`mp-${meetpunt.uid}-wijzig`);
  }

  async function verwijderMeetpunt(thema, meetpunt) {
    const n = model.vragen.filter((v) => v.meetpuntUid === meetpunt.uid).length;
    const ok = await bevestig({
      titel: 'Meetpunt verwijderen?',
      tekst: [
        `Het meetpunt "${kort(meetpunt.naam)}" wordt verwijderd uit het thema "${kort(thema.naam)}".`,
        n ? `${n === 1 ? 'Er is 1 vraag' : `Er zijn ${n} vragen`} aan dit meetpunt gekoppeld. Die ${n === 1 ? 'blijft' : 'blijven'} bestaan, maar zonder meetpunt.` : null,
      ].filter(Boolean),
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    for (const v of model.vragen) if (v.meetpuntUid === meetpunt.uid) v.meetpuntUid = null;
    thema.meetpunten = thema.meetpunten.filter((m) => m !== meetpunt);
    tekenThemas();
    tekenVragen();
    gewijzigd();
    zetFocus(`thema-${thema.uid}-mp-toevoegen`);
  }

  function verplaatsMeetpunt(thema, i, richting) {
    const j = i + richting;
    if (j < 0 || j >= thema.meetpunten.length) return;
    const meetpunt = thema.meetpunten[i];
    [thema.meetpunten[i], thema.meetpunten[j]] = [thema.meetpunten[j], thema.meetpunten[i]];
    tekenThemas();
    gewijzigd();
    const eigen = richting < 0 ? 'omhoog' : 'omlaag';
    const tegen = richting < 0 ? 'omlaag' : 'omhoog';
    zetFocus(`mp-${meetpunt.uid}-${eigen}`, `mp-${meetpunt.uid}-${tegen}`);
    kondigAan(`Het meetpunt "${meetpunt.naam}" staat nu op plek ${j + 1} van ${thema.meetpunten.length}.`);
  }

  function meetpuntItem(thema, m, j) {
    const gekoppeld = model.vragen.filter((v) => v.meetpuntUid === m.uid).length;
    return h('li', { class: 'sje-meetpunt', 'data-uid': m.uid },
      h('div', { class: 'sje-meetpunt-hoofd' },
        h('span', { class: 'sje-meetpunt-naam' }, metPlek(m.naam)),
        m.eenheid ? h('span', { class: 'label' }, m.eenheid) : null,
        gekoppeld ? h('span', { class: 'sje-meetpunt-vragen' }, aantal(gekoppeld, 'vraag', 'vragen')) : null,
        m.omschrijving ? h('span', { class: 'sje-meetpunt-oms' }, metPlek(m.omschrijving)) : null,
      ),
      h('div', { class: 'sje-acties' },
        thema.meetpunten.length > 1
          ? pijlen(`Meetpunt "${kort(m.naam, 40)}"`, j, thema.meetpunten.length, `mp-${m.uid}`, (r) => verplaatsMeetpunt(thema, j, r))
          : null,
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          'data-focus': `mp-${m.uid}-wijzig`,
          'aria-label': `Meetpunt wijzigen: ${m.naam}`,
          onclick: () => wijzigMeetpunt(thema, m),
        }, 'Wijzigen'),
        h('button', {
          type: 'button',
          class: 'knop knop-klein knop-licht sje-knop-gevaar',
          'aria-label': `Meetpunt verwijderen: ${m.naam}`,
          onclick: () => verwijderMeetpunt(thema, m),
        }, 'Verwijderen'),
      ),
    );
  }

  function themaItem(thema, i) {
    const n = vragenVan(thema).length;
    const volMp = thema.meetpunten.length >= MAX_MEETPUNTEN;
    return h('li', { class: 'sje-thema', 'data-uid': thema.uid },
      h('div', { class: 'sje-thema-kop' },
        h('div', { class: 'sje-thema-hoofd' },
          h(SUBKOP, { class: 'sje-thema-naam' }, metPlek(thema.naam)),
          thema.omschrijving ? h('p', { class: 'sje-thema-oms' }, metPlek(thema.omschrijving)) : null,
          h('p', { class: 'sje-thema-meta' }, n ? aantal(n, 'vraag', 'vragen') : 'Nog geen vragen'),
        ),
        h('div', { class: 'sje-acties' },
          model.themas.length > 1
            ? pijlen(`Thema "${kort(thema.naam, 40)}"`, i, model.themas.length, `thema-${thema.uid}`, (r) => verplaatsThema(i, r))
            : null,
          h('button', {
            type: 'button',
            class: 'knop knop-klein',
            'data-focus': `thema-${thema.uid}-wijzig`,
            'aria-label': `Thema wijzigen: ${thema.naam}`,
            onclick: () => wijzigThema(thema),
          }, 'Wijzigen'),
          h('button', {
            type: 'button',
            class: 'knop knop-klein knop-licht sje-knop-gevaar',
            'aria-label': `Thema verwijderen: ${thema.naam}`,
            onclick: () => verwijderThema(thema),
          }, 'Verwijderen'),
        ),
      ),
      h('div', { class: 'sje-meetpunten' },
        h('span', { class: 'sje-sublabel' }, 'Meetpunten'),
        thema.meetpunten.length
          ? h('ul', { class: 'sje-meetpunt-lijst' }, thema.meetpunten.map((m, j) => meetpuntItem(thema, m, j)))
          : h('p', { class: 'klein zacht sje-geen' }, 'Nog geen meetpunten bij dit thema.'),
        h('button', {
          type: 'button',
          class: 'knop knop-klein knop-licht sje-toevoegen',
          'data-focus': `thema-${thema.uid}-mp-toevoegen`,
          'aria-label': `Meetpunt toevoegen aan thema "${thema.naam}"`,
          disabled: volMp,
          title: volMp ? `Een thema kan maximaal ${MAX_MEETPUNTEN} meetpunten hebben.` : null,
          onclick: () => nieuwMeetpunt(thema),
        }, '+ Meetpunt toevoegen'),
      ),
    );
  }

  function tekenThemas() {
    const vol = model.themas.length >= MAX_THEMAS;
    const knop = h('button', {
      type: 'button',
      class: 'knop knop-primair',
      'data-focus': 'thema-toevoegen',
      disabled: vol,
      onclick: nieuwThema,
    }, '+ Thema toevoegen');
    vervang(themaKaart,
      sectieKop(`${p}-kop-themas`, "Thema's en meetpunten",
        "Thema's zijn de onderwerpen van het onderzoek. Een meetpunt is iets wat je binnen een thema meet, met een vraag of met een eigen cijfer.",
        knop),
      vol ? melding(`Je hebt het maximum van ${MAX_THEMAS} thema's bereikt.`, 'waarschuwing') : null,
      model.themas.length
        ? h('ol', { class: 'sje-themas' }, model.themas.map(themaItem))
        : leeg("Er zijn nog geen thema's. Begin met een thema; daarna kun je er meetpunten en vragen bij zetten.",
          h('button', { type: 'button', class: 'knop knop-primair', onclick: nieuwThema }, 'Eerste thema toevoegen')),
    );
  }

  // ---------- 3. Vragen ----------

  let laatsteThemaUid = null;

  function vraagTags(v) {
    const thema = themaVan(v.themaUid);
    const meetpunt = thema?.meetpunten.find((m) => m.uid === v.meetpuntUid);
    const tags = [];
    if (v.verplicht) tags.push(h('span', { class: 'label label-primair' }, 'Verplicht'));
    if (v.uitsplitsen) tags.push(h('span', { class: 'label label-succes', title: 'Resultaten zijn per groep te bekijken' }, 'Uitsplitsing'));
    if (meetpunt) tags.push(h('span', { class: 'label' }, `Meetpunt: ${meetpunt.naam}`));
    if (v.type === 'schaal') tags.push(h('span', { class: 'label' }, `Schaal: ${schaalNamen[v.schaal_soort] || v.schaal_soort}`));
    if (v.type === 'schaal' && v.weet_niet) tags.push(h('span', { class: 'label' }, '"Weet niet" mogelijk'));
    if (v.type === 'meerkeuze' && v.meerdere_antwoorden) tags.push(h('span', { class: 'label' }, 'Meerdere antwoorden mogelijk'));
    return tags.length ? h('div', { class: 'sje-vraag-tags' }, tags) : null;
  }

  function verplaatsVraag(thema, i, richting) {
    const groep = vragenVan(thema);
    const j = i + richting;
    if (j < 0 || j >= groep.length) return;
    const a = model.vragen.indexOf(groep[i]);
    const b = model.vragen.indexOf(groep[j]);
    [model.vragen[a], model.vragen[b]] = [model.vragen[b], model.vragen[a]];
    const v = groep[i];
    tekenVragen();
    gewijzigd();
    lichtOp(v.uid);
    const eigen = richting < 0 ? 'omhoog' : 'omlaag';
    const tegen = richting < 0 ? 'omlaag' : 'omhoog';
    zetFocus(`vraag-${v.uid}-${eigen}`, `vraag-${v.uid}-${tegen}`, `vraag-${v.uid}-wijzig`);
    kondigAan(`De vraag staat nu op plek ${j + 1} van ${groep.length} binnen het thema "${thema.naam}".`);
  }

  async function verwijderVraag(v) {
    const ok = await bevestig({
      titel: 'Vraag verwijderen?',
      tekst: `"${kort(v.tekst)}" wordt verwijderd.`,
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    const thema = themaVan(v.themaUid);
    model.vragen = model.vragen.filter((x) => x !== v);
    tekenVragen();
    tekenThemas();
    gewijzigd();
    zetFocus(`vragen-thema-${thema?.uid}`, 'vragen-toevoegen');
  }

  async function nieuweVraag(voorkeur = {}) {
    const r = await vraagDialoog(null, voorkeur);
    if (!r) return;
    const v = { uid: nieuwUid(), ...r.vraag };
    model.vragen.push(v);
    laatsteThemaUid = v.themaUid;
    tekenVragen();
    tekenThemas();
    gewijzigd();
    lichtOp(v.uid);
    if (r.nogEen && model.vragen.length < MAX_VRAGEN) nieuweVraag({ themaUid: v.themaUid, type: v.type });
    else zetFocus(`vraag-${v.uid}-wijzig`);
  }

  async function wijzigVraag(v) {
    const r = await vraagDialoog(v);
    if (!r) return;
    Object.assign(v, r.vraag);
    tekenVragen();
    tekenThemas();
    gewijzigd();
    lichtOp(v.uid);
    zetFocus(`vraag-${v.uid}-wijzig`);
  }

  function vraagItem(v, nr, thema, i, totaal) {
    return h('li', { class: 'sje-vraag', 'data-uid': v.uid },
      h('div', { class: 'sje-vraag-nr', 'aria-hidden': 'true' }, String(nr)),
      h('div', { class: 'sje-vraag-hoofd' },
        h('p', { class: 'sje-vraag-type' }, vraagtypen[v.type] || v.type),
        h('p', { class: 'sje-vraag-tekst' }, h('span', { class: 'sr-only' }, `Vraag ${nr}: `), metPlek(v.tekst)),
        v.toelichting ? h('p', { class: 'sje-vraag-toelichting' }, metPlek(v.toelichting)) : null,
        v.type === 'meerkeuze' && v.opties.length
          ? h('ul', { class: 'sje-opties-lijst', 'aria-label': 'Antwoordmogelijkheden' }, v.opties.map((o) => h('li', {}, metPlek(o))))
          : null,
        vraagTags(v),
      ),
      h('div', { class: 'sje-acties' },
        totaal > 1 ? pijlen(`Vraag ${nr}`, i, totaal, `vraag-${v.uid}`, (r) => verplaatsVraag(thema, i, r)) : null,
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          'data-focus': `vraag-${v.uid}-wijzig`,
          'aria-label': `Vraag ${nr} wijzigen`,
          onclick: () => wijzigVraag(v),
        }, 'Wijzigen'),
        h('button', {
          type: 'button',
          class: 'knop knop-klein knop-licht sje-knop-gevaar',
          'aria-label': `Vraag ${nr} verwijderen`,
          onclick: () => verwijderVraag(v),
        }, 'Verwijderen'),
      ),
    );
  }

  function tekenVragen() {
    const totaal = model.vragen.length;
    const vol = totaal >= MAX_VRAGEN;
    const metVragen = model.themas.filter((t) => vragenVan(t).length);
    const zonder = model.themas.filter((t) => !vragenVan(t).length);
    const knop = model.themas.length ? h('button', {
      type: 'button',
      class: 'knop knop-primair',
      'data-focus': 'vragen-toevoegen',
      disabled: vol,
      onclick: () => nieuweVraag(),
    }, '+ Vraag toevoegen') : null;

    const uitleg = totaal
      ? `${aantal(totaal, 'vraag', 'vragen')} in ${aantal(metVragen.length, 'thema', "thema's")}. Respondenten zien de vragen in deze volgorde, per thema.`
      : 'Elke vraag hoort bij een thema, zodat je de resultaten per thema kunt bekijken.';

    const blokken = [];
    if (totaal > MAX_VRAGEN) {
      blokken.push(melding([
        h('strong', {}, `Er staan ${totaal} vragen in. `),
        `Een vragenlijst kan maximaal ${MAX_VRAGEN} vragen hebben: verwijder er nog ${totaal - MAX_VRAGEN}.`,
      ], 'gevaar'));
    } else if (vol) {
      blokken.push(melding(`Je hebt het maximum van ${MAX_VRAGEN} vragen bereikt.`, 'waarschuwing'));
    }

    if (!model.themas.length) {
      blokken.push(leeg("Er zijn nog geen thema's. Maak hierboven eerst een thema; daarna kun je vragen toevoegen."));
    } else if (!totaal) {
      blokken.push(leeg('Er zijn nog geen vragen. Zonder vragen wordt er geen vragenlijst gemaakt.',
        h('button', { type: 'button', class: 'knop knop-primair', onclick: () => nieuweVraag() }, 'Eerste vraag toevoegen')));
    } else {
      let nr = 0;
      for (const thema of metVragen) {
        const groep = vragenVan(thema);
        const kopId = `${p}-vt-${thema.uid}`;
        blokken.push(h('section', { class: 'sje-vraaggroep', 'aria-labelledby': kopId },
          h(SUBKOP, { class: 'sje-vraaggroep-kop', id: kopId },
            h('span', {}, metPlek(thema.naam)),
            h('span', { class: 'sje-vraaggroep-aantal' }, aantal(groep.length, 'vraag', 'vragen'))),
          h('ol', { class: 'sje-vragen' }, groep.map((v, i) => vraagItem(v, ++nr, thema, i, groep.length))),
          vol ? null : h('button', {
            type: 'button',
            class: 'knop knop-klein knop-licht sje-toevoegen',
            'data-focus': `vragen-thema-${thema.uid}`,
            'aria-label': `Vraag toevoegen aan thema "${thema.naam}"`,
            onclick: () => nieuweVraag({ themaUid: thema.uid }),
          }, '+ Vraag toevoegen aan dit thema'),
        ));
      }
      if (zonder.length && !vol) {
        blokken.push(h('div', { class: 'sje-andere-themas' },
          h('p', { class: 'klein zacht' }, "Thema's zonder vragen:"),
          h('div', { class: 'knoppen' }, zonder.map((t) => h('button', {
            type: 'button',
            class: 'knop knop-klein',
            'data-focus': `vragen-thema-${t.uid}`,
            'aria-label': `Vraag toevoegen aan thema "${t.naam}"`,
            onclick: () => nieuweVraag({ themaUid: t.uid }),
          }, `+ ${t.naam}`))),
        ));
      }
    }
    vervang(vragenKaart, sectieKop(`${p}-kop-vragen`, 'Vragen', uitleg, knop), blokken);
  }

  // ---------- Vraagdialoog (eigen dialoog: de velden veranderen mee met het vraagtype) ----------

  function vraagDialoog(vraag = null, voorkeur = {}) {
    return new Promise((klaar) => {
      const d0 = `${uniekeId('sjev')}-`;
      const bewerken = !!vraag;
      const startThema = vraag?.themaUid
        ?? (themaVan(voorkeur.themaUid) ? voorkeur.themaUid : null)
        ?? (themaVan(laatsteThemaUid) ? laatsteThemaUid : null)
        ?? model.themas[0]?.uid;
      const startType = vraag?.type ?? voorkeur.type ?? 'schaal';
      let resultaat = null;
      let nogEen = false;

      const foutEl = h('div', { class: 'veld-fout', role: 'alert' });

      // Thema en meetpunt
      const themaKeuze = h('select', { id: `${d0}thema`, required: true },
        model.themas.map((t) => h('option', { value: t.uid, selected: t.uid === startThema }, t.naam)));
      const mpKeuze = h('select', { id: `${d0}mp`, 'aria-describedby': `${d0}mp-hulp` });
      const mpHulp = h('div', { class: 'veld-hulp', id: `${d0}mp-hulp` });
      function vulMeetpunten(behoud) {
        const mps = themaVan(themaKeuze.value)?.meetpunten || [];
        vervang(mpKeuze,
          h('option', { value: '' }, mps.length ? 'Geen meetpunt' : 'Geen meetpunten bij dit thema'),
          mps.map((m) => h('option', { value: m.uid, selected: m.uid === behoud }, m.naam)));
        mpKeuze.disabled = !mps.length;
        mpHulp.textContent = mps.length
          ? 'Optioneel. Koppel de vraag aan een meetpunt als de antwoorden iets over dat meetpunt zeggen; dan zie je ze daar terug op het dashboard.'
          : "Dit thema heeft geen meetpunten. Die kun je toevoegen bij Thema's en meetpunten.";
      }
      vulMeetpunten(vraag?.meetpuntUid);
      themaKeuze.addEventListener('change', () => vulMeetpunten(null));

      // Vraagtype
      const typeRadios = {};
      const typeKeuzes = Object.entries(vraagtypen).map(([type, label]) => {
        const r = h('input', {
          type: 'radio',
          name: `${d0}type`,
          value: type,
          id: `${d0}type-${type}`,
          checked: type === startType,
          'aria-describedby': `${d0}type-${type}-uitleg`,
        });
        r.addEventListener('change', werkTypeBij);
        typeRadios[type] = r;
        return h('label', { class: 'sje-typekeuze', for: r.id },
          r,
          h('span', { class: 'sje-typekeuze-tekst' },
            h('span', { class: 'sje-typekeuze-naam' }, label),
            h('span', { class: 'sje-typekeuze-uitleg', id: `${d0}type-${type}-uitleg` }, TYPE_UITLEG[type] || '')),
        );
      });
      const gekozenType = () => Object.keys(typeRadios).find((k) => typeRadios[k].checked) || 'schaal';

      // Tekst en toelichting
      const tekstVeld = h('textarea', { id: `${d0}tekst`, rows: 3, maxlength: 1000, required: true }, vraag?.tekst || '');
      const toelVeld = h('textarea', {
        id: `${d0}toel`, rows: 2, maxlength: 1000, 'aria-describedby': `${d0}toel-hulp`,
      }, vraag?.toelichting || '');

      // Schaal
      const schaalKeuze = h('select', { id: `${d0}schaal`, 'aria-describedby': `${d0}schaal-vb` },
        Object.keys(schalen).map((k) => h('option', {
          value: k,
          selected: k === (vraag?.type === 'schaal' ? vraag.schaal_soort : 'eens'),
        }, schaalNamen[k] || k)));
      const schaalVoorbeeld = h('ol', { class: 'sje-schaal-vb', id: `${d0}schaal-vb`, 'aria-label': 'De vijf antwoorden op deze schaal' });
      function tekenSchaal() {
        vervang(schaalVoorbeeld, (schalen[schaalKeuze.value] || []).map((l, i) =>
          h('li', {}, h('span', { class: 'sje-schaal-nr' }, String(i + 1)), h('span', { class: 'sje-schaal-label' }, l))));
      }
      tekenSchaal();
      schaalKeuze.addEventListener('change', tekenSchaal);
      const weetNiet = h('input', { type: 'checkbox', id: `${d0}wn`, checked: !!vraag?.weet_niet, 'aria-describedby': `${d0}wn-hulp` });

      const schaalBlok = h('div', { class: 'sje-typeblok' },
        h('div', { class: 'veld' },
          h('label', { for: schaalKeuze.id }, 'Soort schaal'),
          schaalKeuze,
          schaalVoorbeeld),
        h('div', { class: 'veld' },
          h('label', { class: 'keuze', for: weetNiet.id }, weetNiet, h('span', {}, 'Antwoord "weet niet / n.v.t." toestaan')),
          h('div', { class: 'veld-hulp', id: `${d0}wn-hulp` }, 'Voor respondenten die de vraag niet kunnen beantwoorden. Dit antwoord telt niet mee in het gemiddelde.')),
      );

      // Meerkeuze: antwoordmogelijkheden
      const rijen = vraag?.type === 'meerkeuze' ? vraag.opties.map((label) => ({ label })) : [];
      while (rijen.length < 2) rijen.push({ label: '' });
      const optieLijst = h('ol', { class: 'sje-regels' });
      const voegOptieToe = h('button', {
        type: 'button',
        class: 'knop knop-klein',
        onclick: () => {
          if (rijen.length >= MAX_OPTIES) return;
          rijen.push({ label: '' });
          tekenOpties(`${d0}optie-${rijen.length - 1}`);
        },
      }, '+ Antwoordmogelijkheid');

      function tekenOpties(focusId = null) {
        vervang(optieLijst, rijen.map((r, i) => {
          const invoer = h('input', {
            type: 'text',
            id: `${d0}optie-${i}`,
            maxlength: 200,
            autocomplete: 'off',
            value: r.label,
            'aria-label': `Antwoordmogelijkheid ${i + 1}`,
          });
          invoer.addEventListener('input', () => {
            r.label = invoer.value;
          });
          invoer.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (rijen.length >= MAX_OPTIES) return;
            rijen.splice(i + 1, 0, { label: '' });
            tekenOpties(`${d0}optie-${i + 1}`);
          });
          const knop = (teken, label, uit, soort, fn) => h('button', {
            type: 'button',
            class: 'knop knop-klein knop-icoon',
            id: `${d0}optie-${i}-${soort}`,
            'aria-label': label,
            title: label,
            disabled: uit,
            onclick: fn,
          }, h('span', { 'aria-hidden': 'true' }, teken));
          const wissel = (j, soort) => {
            [rijen[i], rijen[j]] = [rijen[j], rijen[i]];
            tekenOpties(j === 0 || j === rijen.length - 1 ? `${d0}optie-${j}` : `${d0}optie-${j}-${soort}`);
          };
          return h('li', { class: 'sje-regel' },
            h('span', { class: 'sje-regel-nr', 'aria-hidden': 'true' }, `${i + 1}.`),
            invoer,
            h('span', { class: 'sje-regel-knoppen' },
              knop('↑', `Antwoordmogelijkheid ${i + 1} omhoog`, i === 0, 'op', () => wissel(i - 1, 'op')),
              knop('↓', `Antwoordmogelijkheid ${i + 1} omlaag`, i === rijen.length - 1, 'neer', () => wissel(i + 1, 'neer')),
              knop('✕', `Antwoordmogelijkheid ${i + 1} verwijderen`, rijen.length <= 2, 'weg', () => {
                rijen.splice(i, 1);
                tekenOpties(`${d0}optie-${Math.min(i, rijen.length - 1)}`);
              }),
            ),
          );
        }));
        voegOptieToe.disabled = rijen.length >= MAX_OPTIES;
        if (focusId) {
          const el = optieLijst.querySelector(`#${focusId}`) || optieLijst.querySelector(`#${d0}optie-0`);
          if (el) el.focus();
        }
      }
      tekenOpties();

      const meerdere = h('input', {
        type: 'checkbox', id: `${d0}meer`, checked: !!vraag?.meerdere_antwoorden, 'aria-describedby': `${d0}meer-hulp`,
      });
      meerdere.addEventListener('change', werkTypeBij);

      const meerkeuzeBlok = h('div', { class: 'sje-typeblok' },
        h('fieldset', { class: 'sje-regels-veld' },
          h('legend', {}, 'Antwoordmogelijkheden', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
          h('p', { class: 'veld-hulp sje-regels-uitleg' }, `Minimaal 2, maximaal ${MAX_OPTIES}. Tip: druk op Enter om direct een volgende toe te voegen.`),
          optieLijst,
          voegOptieToe,
        ),
        h('div', { class: 'veld' },
          h('label', { class: 'keuze', for: meerdere.id }, meerdere, h('span', {}, 'Meerdere antwoorden mogelijk')),
          h('div', { class: 'veld-hulp', id: `${d0}meer-hulp` }, 'Respondenten mogen dan meer dan één antwoord aankruisen.')),
      );

      const openBlok = h('div', { class: 'sje-typeblok' },
        h('p', { class: 'veld-hulp sje-open-uitleg' }, 'Respondenten typen zelf een antwoord. Let op: in open antwoorden kunnen mensen dingen schrijven waardoor ze herkenbaar zijn.'),
      );

      // Uitsplitsing (alleen meerkeuze met één antwoord en ja/nee)
      const uitsplitsen = h('input', { type: 'checkbox', id: `${d0}uit`, checked: !!vraag?.uitsplitsen, 'aria-describedby': `${d0}uit-hulp` });
      const uitsplitsBlok = h('div', { class: 'veld' },
        h('label', { class: 'keuze', for: uitsplitsen.id }, uitsplitsen,
          h('span', {}, 'Gebruiken om resultaten per groep te bekijken (uitsplitsing)')),
        h('div', { class: 'veld-hulp', id: `${d0}uit-hulp` },
          `Bijvoorbeeld per afdeling of leeftijdsgroep. Groepen met minder dan ${drempel} respondenten worden nooit getoond, zodat niemand herkenbaar is.`),
      );

      const verplicht = h('input', { type: 'checkbox', id: `${d0}verplicht`, checked: !!vraag?.verplicht, 'aria-describedby': `${d0}verplicht-hulp` });
      const verplichtBlok = h('div', { class: 'veld' },
        h('label', { class: 'keuze', for: verplicht.id }, verplicht, h('span', {}, 'Verplicht')),
        h('div', { class: 'veld-hulp', id: `${d0}verplicht-hulp` }, 'Respondenten kunnen de vragenlijst pas versturen als ze deze vraag hebben beantwoord. Gebruik dit spaarzaam.'),
      );

      function uitsplitsMogelijk() {
        const t = gekozenType();
        return (t === 'meerkeuze' && !meerdere.checked) || t === 'janee';
      }

      function werkTypeBij() {
        const t = gekozenType();
        schaalBlok.classList.toggle('verborgen', t !== 'schaal');
        meerkeuzeBlok.classList.toggle('verborgen', t !== 'meerkeuze');
        openBlok.classList.toggle('verborgen', t !== 'open');
        uitsplitsBlok.classList.toggle('verborgen', !uitsplitsMogelijk());
      }

      const okKnop = h('button', { type: 'submit', class: 'knop knop-primair' }, bewerken ? 'Opslaan' : 'Toevoegen');
      const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
      const nogEenKnop = bewerken ? null : h('button', { type: 'button', class: 'knop sje-nog-een' }, 'Toevoegen en nog een');

      function toonFout(tekst, el = null) {
        foutEl.textContent = tekst;
        if (el) {
          el.setAttribute('aria-invalid', 'true');
          el.focus();
        }
      }

      function verstuur() {
        foutEl.textContent = '';
        for (const el of d.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
        const type = gekozenType();
        const tekst = tekstVeld.value.trim();
        const thema = themaVan(themaKeuze.value);
        if (!thema) return toonFout('Kies een thema.', themaKeuze);
        if (!tekst) return toonFout('Vul de vraag in.', tekstVeld);
        const dubbel = model.vragen.find((x) => x !== vraag && sleutel(x.tekst) === sleutel(tekst));
        if (dubbel) {
          return toonFout(`Deze vraag staat er al in, bij het thema "${themaVan(dubbel.themaUid)?.naam || ''}". Elke vraag mag één keer voorkomen.`, tekstVeld);
        }
        let opties = [];
        if (type === 'meerkeuze') {
          opties = rijen.map((r) => r.label.trim()).filter(Boolean);
          if (opties.length < 2) {
            const leegVeld = [...optieLijst.querySelectorAll('input')].find((x) => !x.value.trim());
            return toonFout('Geef minimaal twee antwoordmogelijkheden op.', leegVeld || null);
          }
          const gezien = new Set();
          for (const o of opties) {
            if (gezien.has(o.toLowerCase())) return toonFout(`De antwoordmogelijkheid "${o}" staat er dubbel in.`);
            gezien.add(o.toLowerCase());
          }
        }
        const meerdereAan = type === 'meerkeuze' && meerdere.checked;
        resultaat = {
          nogEen,
          vraag: {
            themaUid: thema.uid,
            meetpuntUid: mpKeuze.value || null,
            type,
            tekst,
            toelichting: toelVeld.value.trim(),
            opties,
            schaal_soort: type === 'schaal' ? schaalKeuze.value : 'eens',
            meerdere_antwoorden: meerdereAan,
            verplicht: verplicht.checked,
            weet_niet: type === 'schaal' && weetNiet.checked,
            uitsplitsen: uitsplitsMogelijk() && uitsplitsen.checked,
          },
        };
        d.close();
        return undefined;
      }

      const d = h('dialog', { class: 'dialoog sje-dialoog', 'aria-labelledby': `${d0}titel` },
        h('form', {
          method: 'dialog',
          novalidate: true,
          onsubmit: (e) => {
            e.preventDefault();
            nogEen = false;
            verstuur();
          },
        },
        h('div', { class: 'dialoog-inhoud' },
          h('h2', { id: `${d0}titel` }, bewerken ? 'Vraag wijzigen' : 'Vraag toevoegen'),
          h('div', { class: 'formulier-rij' },
            h('div', { class: 'veld' },
              h('label', { for: themaKeuze.id }, 'Thema', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
              themaKeuze),
            h('div', { class: 'veld' },
              h('label', { for: mpKeuze.id }, 'Meetpunt'),
              mpKeuze,
              mpHulp),
          ),
          h('fieldset', {},
            h('legend', {}, 'Vraagtype', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
            h('div', { class: 'sje-typekeuzes' }, typeKeuzes),
          ),
          h('div', { class: 'veld' },
            h('label', { for: tekstVeld.id }, 'Vraag', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
            tekstVeld),
          h('div', { class: 'veld' },
            h('label', { for: toelVeld.id }, 'Toelichting voor respondent'),
            toelVeld,
            h('div', { class: 'veld-hulp', id: `${d0}toel-hulp` }, 'Optioneel. Bijvoorbeeld uitleg van een begrip. Staat klein onder de vraag.')),
          schaalBlok,
          meerkeuzeBlok,
          openBlok,
          uitsplitsBlok,
          verplichtBlok,
          foutEl,
        ),
        h('div', { class: 'dialoog-voet' }, annuleer, nogEenKnop, okKnop),
        ),
      );
      werkTypeBij();
      // Een foutmelding verdwijnt zodra je verder invult.
      d.addEventListener('input', () => {
        foutEl.textContent = '';
      });

      // Escape, terug-gebaar of Annuleren: niet zomaar sluiten als er iets is ingevuld of gewijzigd.
      const momentopname = () => [...d.querySelectorAll('input, select, textarea')]
        .map((el) => (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)).join('\u0001');
      let begin = null;
      const sluitNaVragen = async () => {
        if (momentopname() === begin || (await bevestig({
          titel: 'Wijzigingen weggooien?',
          tekst: 'Wat je in deze vraag hebt ingevuld, wordt niet bewaard.',
          knop: 'Weggooien',
          gevaar: true,
        }))) d.close();
      };
      d.addEventListener('cancel', (e) => {
        e.preventDefault();
        sluitNaVragen();
      });
      annuleer.addEventListener('click', () => sluitNaVragen());
      if (nogEenKnop) {
        nogEenKnop.addEventListener('click', () => {
          nogEen = true;
          verstuur();
        });
      }
      d.addEventListener('close', () => {
        openDialoog = null;
        setTimeout(() => d.remove(), 0);
        klaar(resultaat);
      });
      document.body.append(d);
      openDialoog = d;
      d.showModal();
      begin = momentopname();
      (voorkeur.themaUid || bewerken ? tekstVeld : themaKeuze).focus();
    });
  }

  // ---------- 4. Acties ----------

  const actieLijst = h('ol', { class: 'sje-regels sje-actieregels' });
  const actieLeeg = h('p', { class: 'klein zacht sje-geen' }, 'Er staan nog geen acties in.');
  const actieKnop = h('button', {
    type: 'button',
    class: 'knop knop-primair',
    'data-focus': 'actie-toevoegen',
    onclick: () => voegActieToe(model.acties.length),
  }, '+ Actie toevoegen');
  const actieVol = h('div', {});

  function voegActieToe(plek) {
    if (model.acties.length >= MAX_ACTIES) return;
    const actie = { uid: nieuwUid(), tekst: '' };
    model.acties.splice(plek, 0, actie);
    tekenActieRegels(`${p}-actie-${actie.uid}`);
    gewijzigd();
  }

  function tekenActieRegels(focusId = null) {
    const n = model.acties.length;
    vervang(actieLijst, model.acties.map((a, i) => {
      const invoer = h('input', {
        type: 'text',
        id: `${p}-actie-${a.uid}`,
        maxlength: 300,
        autocomplete: 'off',
        value: a.tekst,
        placeholder: 'Wat moet er gebeuren?',
        'aria-label': `Actie ${i + 1}`,
      });
      invoer.addEventListener('input', () => {
        a.tekst = invoer.value;
        invoer.removeAttribute('aria-invalid');
        gewijzigd();
      });
      invoer.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        voegActieToe(i + 1);
      });
      const knop = (teken, label, uit, soort, fn) => h('button', {
        type: 'button',
        class: 'knop knop-klein knop-icoon',
        id: `${p}-actie-${a.uid}-${soort}`,
        'aria-label': label,
        title: label,
        disabled: uit,
        onclick: fn,
      }, h('span', { 'aria-hidden': 'true' }, teken));
      const wissel = (j, soort) => {
        [model.acties[i], model.acties[j]] = [model.acties[j], model.acties[i]];
        tekenActieRegels(j === 0 || j === n - 1 ? `${p}-actie-${a.uid}` : `${p}-actie-${a.uid}-${soort}`);
        gewijzigd();
      };
      return h('li', { class: 'sje-regel', 'data-uid': a.uid },
        h('span', { class: 'sje-regel-nr', 'aria-hidden': 'true' }, `${i + 1}.`),
        invoer,
        h('span', { class: 'sje-regel-knoppen' },
          knop('↑', `Actie ${i + 1} omhoog`, i === 0, 'op', () => wissel(i - 1, 'op')),
          knop('↓', `Actie ${i + 1} omlaag`, i === n - 1, 'neer', () => wissel(i + 1, 'neer')),
          knop('✕', `Actie ${i + 1} verwijderen`, false, 'weg', () => {
            model.acties.splice(i, 1);
            const volgende = model.acties[Math.min(i, model.acties.length - 1)];
            tekenActieRegels(volgende ? `${p}-actie-${volgende.uid}` : null);
            if (!volgende) actieKnop.focus();
            gewijzigd();
          }),
        ),
      );
    }));
    actieLijst.classList.toggle('verborgen', !n);
    actieLeeg.classList.toggle('verborgen', n > 0);
    actieKnop.disabled = n >= MAX_ACTIES;
    vervang(actieVol, n >= MAX_ACTIES ? melding(`Je hebt het maximum van ${MAX_ACTIES} acties bereikt.`, 'waarschuwing') : null);
    if (focusId) {
      const el = actieLijst.querySelector(`#${focusId}`);
      if (el) el.focus();
    }
  }

  function tekenActies() {
    vervang(actieKaart,
      sectieKop(`${p}-kop-acties`, 'Acties',
        'De actielijst waarmee het onderzoek begint: wat moet er gebeuren? Status en datum vul je later in het onderzoek in.',
        actieKnop),
      actieVol,
      actieLeeg,
      actieLijst,
      h('p', { class: 'veld-hulp sje-regels-uitleg' }, 'Tip: druk op Enter om direct een volgende actie toe te voegen. Lege regels worden niet bewaard.'),
    );
    tekenActieRegels();
  }

  // ---------- Controle ----------

  let foutDoel = null; // functie die naar het onderdeel van de laatste fout springt

  const naarUid = (uid, sectieId) => () => {
    const el = element.querySelector(`[data-uid="${uid}"]`);
    if (!el) {
      naarSectie(sectieId);
      return;
    }
    lichtOp(uid);
    el.scrollIntoView({ block: 'center' });
    const knop = el.querySelector('input, button:not([disabled])');
    if (knop) knop.focus({ preventScroll: true });
  };

  function valideer() {
    foutDoel = null;
    const meld = (tekst, doel) => {
      foutDoel = doel;
      return tekst;
    };
    const naarVeld = (naam) => () => {
      vlVelden[naam].setAttribute('aria-invalid', 'true');
      vlVelden[naam].scrollIntoView({ block: 'center' });
      vlVelden[naam].focus({ preventScroll: true });
    };
    const vl = model.vragenlijst;
    if (vl.titel.trim().length > 200) return meld('Vragenlijst: de titel is te lang (maximaal 200 tekens).', naarVeld('titel'));
    if (vl.introtekst.trim().length > 5000) return meld('Vragenlijst: de uitleg voor respondenten is te lang (maximaal 5000 tekens).', naarVeld('introtekst'));
    if (vl.bedanktekst.trim().length > 2000) return meld('Vragenlijst: de bedanktekst is te lang (maximaal 2000 tekens).', naarVeld('bedanktekst'));

    const naarThemas = () => naarSectie(`${p}-kop-themas`);
    if (model.themas.length > MAX_THEMAS) {
      return meld(`Er staan ${model.themas.length} thema's in; het maximum is ${MAX_THEMAS}. Verwijder er ${model.themas.length - MAX_THEMAS}.`, naarThemas);
    }
    const themaNamen = new Set();
    for (const [i, t] of model.themas.entries()) {
      const doel = naarUid(t.uid, `${p}-kop-themas`);
      if (!t.naam) return meld(`Thema ${i + 1} heeft nog geen naam.`, doel);
      if (t.naam.length > 150) return meld(`Thema "${kort(t.naam, 50)}": de naam is te lang (maximaal 150 tekens).`, doel);
      if (t.omschrijving.length > 2000) return meld(`Thema "${kort(t.naam, 50)}": de omschrijving is te lang (maximaal 2000 tekens).`, doel);
      if (themaNamen.has(sleutel(t.naam))) return meld(`Het thema "${kort(t.naam, 50)}" staat er twee keer in. Geef elk thema een eigen naam, of verwijder er één.`, doel);
      themaNamen.add(sleutel(t.naam));
      if (t.meetpunten.length > MAX_MEETPUNTEN) {
        return meld(`Thema "${kort(t.naam, 50)}" heeft ${t.meetpunten.length} meetpunten; het maximum is ${MAX_MEETPUNTEN} per thema.`, doel);
      }
      const mpNamen = new Set();
      for (const m of t.meetpunten) {
        const mDoel = naarUid(m.uid, `${p}-kop-themas`);
        if (!m.naam) return meld(`Thema "${kort(t.naam, 50)}": een meetpunt heeft nog geen naam.`, mDoel);
        if (m.naam.length > 150) return meld(`Meetpunt "${kort(m.naam, 50)}": de naam is te lang (maximaal 150 tekens).`, mDoel);
        if (m.eenheid.length > 30) return meld(`Meetpunt "${kort(m.naam, 50)}": de eenheid is te lang (maximaal 30 tekens).`, mDoel);
        if (m.omschrijving.length > 2000) return meld(`Meetpunt "${kort(m.naam, 50)}": de omschrijving is te lang (maximaal 2000 tekens).`, mDoel);
        if (mpNamen.has(sleutel(m.naam))) return meld(`Thema "${kort(t.naam, 50)}": het meetpunt "${kort(m.naam, 50)}" staat er twee keer in.`, mDoel);
        mpNamen.add(sleutel(m.naam));
      }
    }

    const vragen = vragenOpVolgorde();
    if (vragen.length > MAX_VRAGEN) {
      return meld(`Er staan ${vragen.length} vragen in; een vragenlijst kan er maximaal ${MAX_VRAGEN} hebben. Verwijder er nog ${vragen.length - MAX_VRAGEN}.`,
        () => naarSectie(`${p}-kop-vragen`));
    }
    const teksten = new Map();
    for (const [i, v] of vragen.entries()) {
      const nr = i + 1;
      const doel = naarUid(v.uid, `${p}-kop-vragen`);
      if (!v.tekst) return meld(`Vraag ${nr} heeft nog geen tekst.`, doel);
      if (v.tekst.length > 1000) return meld(`Vraag ${nr}: de vraag is te lang (maximaal 1000 tekens).`, doel);
      if (v.toelichting.length > 1000) return meld(`Vraag ${nr}: de toelichting is te lang (maximaal 1000 tekens).`, doel);
      if (teksten.has(sleutel(v.tekst))) {
        return meld(`Vraag ${nr} staat er twee keer in (ook als vraag ${teksten.get(sleutel(v.tekst))}): "${kort(v.tekst, 60)}". Verwijder er één of pas de tekst aan.`, doel);
      }
      teksten.set(sleutel(v.tekst), nr);
      if (v.type === 'meerkeuze') {
        if (v.opties.length < 2) return meld(`Vraag ${nr}: geef minimaal twee antwoordmogelijkheden op.`, doel);
        if (v.opties.length > MAX_OPTIES) return meld(`Vraag ${nr}: maximaal ${MAX_OPTIES} antwoordmogelijkheden.`, doel);
        const gezien = new Set();
        for (const o of v.opties) {
          if (o.length > 200) return meld(`Vraag ${nr}: een antwoordmogelijkheid is te lang (maximaal 200 tekens).`, doel);
          if (gezien.has(sleutel(o))) return meld(`Vraag ${nr}: de antwoordmogelijkheid "${kort(o, 50)}" staat er dubbel in.`, doel);
          gezien.add(sleutel(o));
        }
      }
    }

    const acties = model.acties.filter((a) => a.tekst.trim());
    if (acties.length > MAX_ACTIES) {
      return meld(`Er staan ${acties.length} acties in; het maximum is ${MAX_ACTIES}.`, () => naarSectie(`${p}-kop-acties`));
    }
    const actieTeksten = new Set();
    for (const a of acties) {
      const doel = () => {
        const el = element.querySelector(`#${p}-actie-${a.uid}`);
        if (!el) return;
        el.setAttribute('aria-invalid', 'true');
        el.scrollIntoView({ block: 'center' });
        el.focus({ preventScroll: true });
      };
      if (a.tekst.trim().length > 300) return meld(`De actie "${kort(a.tekst, 50)}" is te lang (maximaal 300 tekens).`, doel);
      if (actieTeksten.has(sleutel(a.tekst))) return meld(`De actie "${kort(a.tekst, 60)}" staat er twee keer in. Verwijder er één.`, doel);
      actieTeksten.add(sleutel(a.tekst));
    }
    return null;
  }

  function naarFout() {
    if (foutDoel) foutDoel();
  }

  // ---------- Alles tekenen ----------

  const snelNaar = h('nav', { class: 'sje-snelnaar', 'aria-label': 'Onderdelen van de inhoud' },
    h('span', { class: 'sje-snelnaar-label' }, 'Ga naar:'),
    [['vl', 'Vragenlijst'], ['themas', "Thema's en meetpunten"], ['vragen', 'Vragen'], ['acties', 'Acties']]
      .map(([deel, label]) => h('button', {
        type: 'button', class: 'knop knop-klein knop-licht', onclick: () => naarSectie(`${p}-kop-${deel}`),
      }, label)),
  );

  const element = h('div', { class: 'sje' },
    h('div', { class: 'sje-overzicht' }, tellersEl, snelNaar),
    vlKaart,
    themaKaart,
    vragenKaart,
    actieKaart,
    aankondiging,
  );

  tekenVragenlijst();
  tekenThemas();
  tekenVragen();
  tekenActies();
  tekenTellers();

  return {
    element,
    waarde,
    isGewijzigd,
    valideer,
    naarFout,
    markeerOpgeslagen,
    /** Past de bedrijfsnaam in de uitleg over {bedrijf} aan. */
    zetBedrijf(naam) {
      bedrijfsnaam = tekstVan(naam).trim();
      tekenBedrijfTip();
    },
    /** Sluit een open vraagdialoog (bij het verlaten van het scherm). */
    sluit() {
      if (openDialoog && openDialoog.open) openDialoog.close();
    },
  };
}
