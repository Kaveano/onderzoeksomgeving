// Rapportgenerator: de rekenkern (zonder DOM, dus ook te testen in Node).
//
// Uitgangspunt: het rapport verzint niets.
// - FEITEN komen rechtstreeks uit de gegevens van het onderzoek en worden met vaste regels omgezet in
//   tabellen en neutrale zinnen ("Het thema X scoort gemiddeld 3,2"). Er zit geen taalmodel of AI achter;
//   dezelfde gegevens geven altijd dezelfde tekst. De feiten worden vastgelegd op een peildatum.
// - DUIDING (wat betekent het, conclusies, aanbevelingen) schrijft de onderzoeker zelf.
//
// Een rapport bestaat uit hoofdstukken (secties). Elk hoofdstuk heeft een soort (bepaalt welke feiten
// erbij horen en welke hulpvragen getoond worden), een titel, eigen tekst en twee schakelaars:
// 'aan' (hoofdstuk opnemen) en 'feiten' (het feitenblok opnemen).
//
// Alles wordt omgezet naar "blokken": { soort: 'kop'|'alinea'|'lijst'|'citaat'|'tabel'|'paginaeinde', ... }.
// Diezelfde blokken gaan naar het scherm, naar de printweergave en naar Word (maakDocx in bestanden.js).

import * as S from './statistiek.js';
import { bouwModel, waardenVan, vragenVan } from './analyse-model.js';

export const RAPPORTSOORTEN = { tussen: 'Tussenrapport', eind: 'Eindrapport' };
const ALFA = 0.05;
const MIN = '−';

// ---------- Opmaak van getallen (Nederlands) ----------

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);

export function nlGetal(x, decimalen = 1) {
  if (!eindig(x)) return '–';
  const t = x.toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
  // Een echt minteken (−) in plaats van een streepje; en geen "−0,0".
  return /^-0(,0+)?$/.test(t) ? t.slice(1) : t.replace(/^-/, MIN);
}

/** Getal met maximaal twee decimalen en de eenheid, zoals op het dashboard: 6,4% · 12 dagen · 0,04 */
function waardeMetEenheid(w, eenheid) {
  const g = eindig(w) ? w.toLocaleString('nl-NL', { maximumFractionDigits: 2 }).replace(/^-/, MIN) : '–';
  if (!eenheid) return g;
  return eenheid === '%' ? `${g}%` : `${g} ${eenheid}`;
}

function nlProcent(x) {
  return eindig(x) ? `${Math.round(x)}%` : '–';
}

function metTeken(x, decimalen = 1) {
  if (!eindig(x)) return '–';
  const afgerond = Number(x.toFixed(decimalen));
  if (afgerond === 0) return nlGetal(0, decimalen);
  return `${afgerond > 0 ? '+' : MIN}${nlGetal(Math.abs(afgerond), decimalen)}`;
}

function pTekst(p) {
  if (!eindig(p)) return 'p onbekend';
  return p < 0.001 ? 'p < 0,001' : `p = ${nlGetal(p, 3)}`;
}

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/** '2026-11-26' wordt '26 november 2026'. */
export function nlDatum(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return `${Number(m[3])} ${MAANDEN[Number(m[2]) - 1] || ''} ${m[1]}`;
}

const aantalTekst = (n, enkel, meer) => `${n.toLocaleString('nl-NL')} ${n === 1 ? enkel : meer}`;

function opsomming(namen) {
  if (namen.length <= 1) return namen.join('');
  return `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`;
}

// ---------- Hoofdstukken ----------

/**
 * Per soort hoofdstuk: standaardtitel, of er een feitenblok bij hoort en de hulpvragen voor de eigen tekst.
 * De hulpvragen zijn geen inhoud van het rapport; ze helpen bij het schrijven.
 */
export const SECTIESOORTEN = {
  samenvatting: {
    titel: 'Samenvatting',
    feiten: false,
    hulp: [
      'Schrijf de samenvatting als laatste, als de rest af is.',
      'Wat was de vraag van de opdrachtgever?',
      'Wat heb je onderzocht en hoe?',
      'Wat zijn de drie belangrijkste uitkomsten?',
      'Wat adviseer je in één of twee zinnen?',
    ],
  },
  aanleiding: {
    titel: 'Aanleiding en onderzoeksvraag',
    feiten: true,
    hulp: [
      'Waarom is dit onderzoek gedaan? Wat speelde er in de organisatie?',
      'Wie is de opdrachtgever en wat wil die met de uitkomsten doen?',
      'Welke deelvragen horen bij de onderzoeksvraag?',
      'Wat valt buiten het onderzoek?',
    ],
  },
  aanpak: {
    titel: 'Aanpak en verantwoording',
    feiten: true,
    hulp: [
      'Waarom heb je voor deze manier van onderzoeken gekozen?',
      'Wie zijn uitgenodigd en hoe zijn ze benaderd?',
      'Is de respons hoog genoeg, en lijkt de groep die antwoordde op de hele organisatie?',
      'Hoe heb je interviews, observaties of documenten gebruikt?',
      'Welke beperkingen heeft het onderzoek? Waar moet de lezer voorzichtig mee zijn?',
    ],
  },
  stand: {
    titel: 'Stand van zaken',
    feiten: true,
    hulp: [
      'Waar staat het onderzoek nu? Wat is gedaan en wat nog niet?',
      'Loopt het volgens de planning? Zo niet, waardoor?',
      'Is de respons tot nu toe voldoende?',
    ],
  },
  resultaten: {
    titel: 'Resultaten',
    feiten: true,
    hulp: [
      'Beschrijf wat opvalt, nog zonder oordeel: dat komt bij de conclusies.',
      'Welke thema\'s scoren hoog en welke laag?',
      'Zijn er grote verschillen tussen vragen binnen één thema?',
      'Wat zeggen de open antwoorden, interviews en observaties bij deze uitkomsten?',
      'Verwijs naar de tabellen, bijvoorbeeld: "Zoals de tabel laat zien..."',
    ],
  },
  verloop: {
    titel: 'Ontwikkeling tussen de meetmomenten',
    feiten: true,
    hulp: [
      'Welke veranderingen zie je tussen de metingen?',
      'Zijn ze statistisch aantoonbaar, en groot genoeg om in de praktijk iets te betekenen?',
      'Welke maatregelen zijn tussen de metingen genomen?',
      'Wat kan de verandering nog meer verklaren (seizoen, reorganisatie, andere respondenten)?',
    ],
  },
  cijfers: {
    titel: 'Cijfers en overige bronnen',
    feiten: true,
    hulp: [
      'Wat laten cijfers als verzuim of verloop zien?',
      'Wat kwam uit interviews, observaties en documenten?',
      'Sluiten deze bronnen aan bij de uitkomsten van de vragenlijst, of spreken ze elkaar tegen?',
    ],
  },
  conclusies: {
    titel: 'Conclusies',
    feiten: false,
    hulp: [
      'Geef antwoord op de onderzoeksvraag.',
      'Elke conclusie moet terug te vinden zijn in een uitkomst uit het hoofdstuk Resultaten.',
      'Wat is de belangrijkste conclusie, en wat volgt daarna?',
      'Wat weet je niet, of niet zeker?',
      'Noem hier nog geen oplossingen; die komen bij de aanbevelingen.',
    ],
  },
  aanbevelingen: {
    titel: 'Aanbevelingen',
    feiten: true,
    hulp: [
      'Wat adviseer je, in volgorde van belang?',
      'Maak elke aanbeveling concreet: wat, wie, wanneer?',
      'Bij welke conclusie hoort elke aanbeveling?',
      'Wat levert het op, wat kost het en wat gebeurt er als de organisatie niets doet?',
      'Hoe en wanneer wordt gemeten of het werkt?',
    ],
  },
  vervolg: {
    titel: 'Vervolg en planning',
    feiten: true,
    hulp: [
      'Wat zijn de volgende stappen en wanneer?',
      'Wat heb je daarvoor nodig van de opdrachtgever?',
      'Wanneer is het eindrapport klaar?',
    ],
  },
  aandachtspunten: {
    titel: 'Aandachtspunten en vragen',
    feiten: false,
    hulp: [
      'Zijn er risico\'s, bijvoorbeeld een lage respons of een krappe planning?',
      'Welke besluiten of informatie heb je van de opdrachtgever nodig?',
    ],
  },
  'bijlage-vragen': {
    titel: 'Bijlage: de vragenlijst',
    feiten: true,
    bijlage: true,
    hulp: ['Eigen tekst is hier meestal niet nodig. Je kunt een korte toelichting geven.'],
  },
  'bijlage-open': {
    titel: 'Bijlage: open antwoorden',
    feiten: true,
    bijlage: true,
    hulp: [
      'Open antwoorden kunnen herkenbaar zijn voor collega\'s. Neem deze bijlage alleen op als dat is afgesproken.',
      'Je kunt hier toelichten hoe je de antwoorden hebt gebruikt.',
    ],
  },
  eigen: {
    titel: 'Eigen hoofdstuk',
    feiten: false,
    hulp: ['Een hoofdstuk zonder automatische feiten: schrijf hier wat je wilt toevoegen.'],
  },
};

const OPBOUW = {
  eind: [
    ['samenvatting'], ['aanleiding'], ['aanpak'], ['resultaten'], ['verloop'], ['cijfers'],
    ['conclusies'], ['aanbevelingen'], ['bijlage-vragen'], ['bijlage-open', { aan: false }],
  ],
  tussen: [
    ['stand'], ['aanleiding', { titel: 'Onderzoeksvraag' }], ['resultaten', { titel: 'Voorlopige resultaten', beknopt: true }],
    ['verloop'], ['vervolg'], ['aandachtspunten'],
  ],
};

/** De standaardinhoud van een nieuw rapport. */
export function standaardInhoud(soort) {
  const opbouw = OPBOUW[soort] || OPBOUW.eind;
  return {
    ondertitel: '',
    opdrachtgever: '',
    opsteller: '',
    datum: '',
    lijst: null, // de vragenlijst waarop het hoofdstuk Resultaten is gebaseerd (null = de laatste met antwoorden)
    secties: opbouw.map(([s, extra = {}], i) => ({
      id: `${s}-${i + 1}`,
      soort: s,
      titel: extra.titel || SECTIESOORTEN[s].titel,
      tekst: '',
      aan: extra.aan !== false,
      feiten: SECTIESOORTEN[s].feiten,
      beknopt: !!extra.beknopt,
    })),
  };
}

// ---------- Feiten verzamelen ----------

function privaat(l, drempel) {
  return l.n > 0 && l.n < drempel;
}

/**
 * Legt de feiten van het onderzoek vast.
 * data: de export (GET .../export/data); dashboards: per vragenlijst het antwoord van GET .../dashboard?vragenlijst=<id>
 * (de server heeft daar al gerekend; zo zijn de cijfers gelijk aan die op het dashboard).
 * Uitkomsten van minder dan `drempel` respondenten worden niet opgenomen.
 */
export function verzamelFeiten({ data, dashboards, peildatum }) {
  const eerste = dashboards[0] || {};
  const drempel = eerste.drempel || 5;

  const lijsten = [];
  for (const d of dashboards) {
    const s = d.selectie;
    if (!s) continue;
    const r = (d.respons || []).find((x) => x.vragenlijst_id === s.vragenlijst_id) || {};
    const verborgen = privaat(s, drempel);
    const dagen = (r.per_dag || []).map((p) => p.datum);
    // Een vraag met minder dan `drempel` scores is niet te tonen. Dan ook het gemiddelde van zijn thema niet,
    // want daaruit en uit de andere vragen is het verborgen gemiddelde terug te rekenen.
    const kleineVraag = (q) => (q.n > 0 && q.n < drempel) || (q.type === 'schaal' && q.n_score > 0 && q.n_score < drempel);
    const themasMetKleineVraag = new Set(s.vragen.filter((q) => q.type === 'schaal' && kleineVraag(q)).map((q) => q.thema_id));
    lijsten.push({
      id: s.vragenlijst_id,
      titel: s.titel,
      status: r.status || '',
      meetmoment_id: r.meetmoment_id || null,
      meetmoment_naam: s.meetmoment_naam || null,
      aantal_vragen: r.aantal_vragen || s.vragen.length,
      n: s.n,
      aantal_uitgenodigd: r.aantal_uitgenodigd || null,
      percentage: eindig(r.percentage) ? r.percentage : null,
      van: dagen[0] || null,
      tot: dagen[dagen.length - 1] || null,
      verborgen,
      themas: verborgen ? [] : s.themas.map((t) => {
        const klein = (t.n > 0 && t.n < drempel) || themasMetKleineVraag.has(t.thema_id);
        return { naam: t.naam, aantal_vragen: t.aantal_vragen, n: klein ? null : t.n, gemiddelde: klein ? null : t.gemiddelde, verborgen: klein };
      }),
      vragen: s.vragen.map((q) => {
        const klein = verborgen || kleineVraag(q);
        const basis = { thema_naam: q.thema_naam || '', type: q.type, tekst: q.tekst, meerdere: !!q.meerdere_antwoorden, opties: (q.verdeling || []).map((v) => v.label) };
        if (klein || q.type === 'open') return { ...basis, n: klein ? null : q.n, verborgen: klein, verdeling: [] };
        return {
          ...basis,
          n: q.n,
          n_score: q.type === 'schaal' && Number.isInteger(q.n_score) ? q.n_score : undefined,
          verborgen: false,
          gemiddelde: eindig(q.gemiddelde) ? q.gemiddelde : null,
          percentage_ja: eindig(q.percentage_ja) ? q.percentage_ja : null,
          verdeling: (q.verdeling || []).map((v) => ({ waarde: v.waarde, label: v.label, aantal: v.aantal, percentage: v.percentage })),
        };
      }),
      open: verborgen ? [] : (s.open || [])
        .filter((o) => o.antwoorden.length >= drempel)
        .map((o) => ({ tekst: o.tekst, thema_naam: o.thema_naam || '', antwoorden: o.antwoorden.slice() })),
    });
  }

  // Verloop per thema over de meetmomenten (zoals op het dashboard), zonder te kleine aantallen.
  const v = eerste.verloop || { meetmomenten: [], themas: [] };
  const verloop = {
    meetmomenten: (v.meetmomenten || []).map((m) => ({ id: m.id, naam: m.naam, datum: m.datum || null })),
    themas: (v.themas || []).map((t) => ({
      thema_id: t.thema_id,
      naam: t.naam,
      // Een punt telt alle vragenlijsten van een meetmoment samen. Draagt daar een vragenlijst of vraag met minder
      // dan `drempel` respondenten aan bij (klein), dan is die uit het totaal terug te rekenen: niet tonen.
      punten: t.punten.map((p) => (eindig(p.gemiddelde) && p.n >= drempel && !p.klein
        ? { meetmoment_id: p.meetmoment_id, naam: p.naam, gemiddelde: p.gemiddelde, n: p.n }
        : { meetmoment_id: p.meetmoment_id, naam: p.naam, gemiddelde: null, n: null })),
    })).filter((t) => t.punten.some((p) => p.gemiddelde !== null)),
  };

  // Toetsen: per thema het eerste tegen het laatste meetmoment met voldoende scores (zoals op het tabblad Analyse).
  const model = bouwModel(data);
  const toetsen = [];
  for (const t of model.themas) {
    const perMoment = [];
    for (const mm of model.meetmomenten) {
      const scores = [];
      let kleineLijst = false;
      for (const l of model.lijsten) {
        if (l.meetmoment_id !== mm.id) continue;
        const w = waardenVan(l, `t:${t.id}`);
        if (!w) continue;
        const geldig = w.filter((x) => x !== null);
        // Ook hier: een kleine vragenlijst of een vraag die door heel weinig mensen is gescoord, zou uit de
        // uitkomst terug te rekenen zijn. Dan dit meetmoment niet toetsen.
        if (geldig.length > 0 && geldig.length < drempel) kleineLijst = true;
        for (const q of vragenVan(l, `t:${t.id}`)) {
          const c = l.inz.filter((a) => Number.isInteger(a[q.id]) && a[q.id] >= 1 && a[q.id] <= 5).length;
          if (c > 0 && c < drempel) kleineLijst = true;
        }
        scores.push(...geldig);
      }
      if (scores.length >= drempel && !kleineLijst) perMoment.push({ naam: mm.naam, scores });
    }
    if (perMoment.length < 2) continue;
    const a = perMoment[0];
    const b = perMoment[perMoment.length - 1];
    const welch = S.welchT(a.scores, b.scores);
    const d = S.cohensD(a.scores, b.scores);
    const A = S.beschrijf(a.scores);
    const B = S.beschrijf(b.scores);
    toetsen.push({
      thema_naam: t.naam,
      van: { naam: a.naam, n: A.n, gemiddelde: A.gemiddelde, sd: A.sd },
      naar: { naam: b.naam, n: B.n, gemiddelde: B.gemiddelde, sd: B.sd },
      verschil: B.gemiddelde - A.gemiddelde,
      p: welch ? welch.p : null,
      t: welch ? welch.t : null,
      df: welch ? welch.df : null,
      g: d ? d.g : null,
      effect: d ? S.effectGrootte(d.g, 'g') : null,
    });
  }

  const cijfers = (eerste.eigen_cijfers || []).map((r) => ({
    naam: r.naam,
    eenheid: r.eenheid || '',
    thema_naam: r.thema_naam || '',
    punten: r.punten.map((p) => ({ datum: p.datum, waarde: p.waarde, meetmoment_naam: p.meetmoment_naam || null })),
  }));

  const invoer = {};
  for (const e of data.eigen_invoer || []) invoer[e.soort] = (invoer[e.soort] || 0) + 1;

  return {
    versie: 1,
    peildatum,
    drempel,
    onderzoek: {
      titel: data.onderzoek?.titel || '',
      bedrijfsnaam: data.onderzoek?.bedrijfsnaam || '',
      onderzoeksvraag: data.onderzoek?.onderzoeksvraag || '',
    },
    themas: (data.themas || []).map((t) => ({ naam: t.naam, omschrijving: t.omschrijving || '' })),
    meetmomenten: (data.meetmomenten || []).map((m) => ({ id: m.id, naam: m.naam, datum: m.datum || null })),
    lijsten,
    verloop,
    toetsen,
    cijfers,
    invoer,
    invoersoorten: data.lijsten?.invoersoorten || {},
    acties: (data.acties || []).map((a) => ({ titel: a.titel, status: a.status, datum: a.datum || null })),
    actiestatussen: data.lijsten?.actiestatussen || {},
  };
}

// ---------- Feiten omzetten in blokken ----------

const alinea = (tekst) => ({ soort: 'alinea', tekst });
const kop = (tekst, niveau = 2) => ({ soort: 'kop', niveau, tekst });
const tabel = (kopRij, rijen, bijschrift = '') => ({ soort: 'tabel', kop: kopRij, rijen, bijschrift });

/** De vragenlijst waarop Resultaten is gebaseerd: de gekozen lijst, anders de laatste met (zichtbare) antwoorden. */
export function hoofdLijst(feiten, inhoud) {
  const lijsten = feiten.lijsten || [];
  const gekozen = lijsten.find((l) => l.id === inhoud.lijst);
  if (gekozen) return gekozen;
  const met = lijsten.filter((l) => l.n > 0 && !l.verborgen);
  return met[met.length - 1] || lijsten[lijsten.length - 1] || null;
}

function lijstNaam(l) {
  return l.meetmoment_naam ? `${l.titel} (${l.meetmoment_naam})` : l.titel;
}

function responsZin(l, drempel) {
  if (!l.n) return `De vragenlijst "${lijstNaam(l)}" is nog niet ingevuld.`;
  if (l.verborgen) {
    return `De vragenlijst "${lijstNaam(l)}" is door minder dan ${drempel} personen ingevuld. Om de anonimiteit te beschermen worden daarvan geen uitkomsten gerapporteerd.`;
  }
  let zin = `De vragenlijst "${lijstNaam(l)}" is ${aantalTekst(l.n, 'keer', 'keer')} ingevuld`;
  if (l.aantal_uitgenodigd && l.n > l.aantal_uitgenodigd) {
    zin += `, terwijl er ${l.aantal_uitgenodigd === 1 ? 'één persoon was' : `${aantalTekst(l.aantal_uitgenodigd, 'persoon', 'personen')} waren`} uitgenodigd. Een responspercentage is daarom niet te geven; controleer het aantal uitgenodigden bij de vragenlijst`;
  } else if (l.aantal_uitgenodigd) {
    zin += `; er ${l.aantal_uitgenodigd === 1 ? 'was één persoon' : `waren ${aantalTekst(l.aantal_uitgenodigd, 'persoon', 'personen')}`} uitgenodigd (respons ${nlProcent(l.percentage)})`;
  }
  zin += '.';
  if (l.van && l.tot) zin += l.van === l.tot ? ` Alle antwoorden zijn van ${nlDatum(l.van)}.` : ` De antwoorden zijn binnengekomen van ${nlDatum(l.van)} tot en met ${nlDatum(l.tot)}.`;
  return zin;
}

function lijstenTabel(f) {
  return tabel(
    ['Vragenlijst', 'Meetmoment', 'Vragen', 'Uitgenodigd', 'Ingevuld', 'Respons'],
    f.lijsten.map((l) => [
      l.titel,
      l.meetmoment_naam || '–',
      l.aantal_vragen,
      l.aantal_uitgenodigd ? l.aantal_uitgenodigd : '–',
      l.verborgen ? `minder dan ${f.drempel}` : l.n,
      l.verborgen || !l.aantal_uitgenodigd || l.n > l.aantal_uitgenodigd ? '–' : nlProcent(l.percentage),
    ]),
    'Vragenlijsten en respons',
  );
}

function feitenAanleiding(f) {
  const uit = [];
  if (f.onderzoek.onderzoeksvraag) {
    uit.push(alinea('De onderzoeksvraag luidt:'), { soort: 'citaat', tekst: f.onderzoek.onderzoeksvraag });
  } else {
    uit.push(alinea('Bij dit onderzoek is nog geen onderzoeksvraag vastgelegd (zie het tabblad Opzet).'));
  }
  if (f.themas.length) {
    uit.push(alinea(`Het onderzoek is opgebouwd rond ${aantalTekst(f.themas.length, 'thema', 'thema\'s')}:`));
    uit.push({ soort: 'lijst', items: f.themas.map((t) => (t.omschrijving ? `**${t.naam}**: ${t.omschrijving}` : t.naam)) });
  }
  return uit;
}

function invoerZin(f) {
  const delen = Object.entries(f.invoer || {})
    .filter(([, n]) => n > 0)
    .map(([soort, n]) => `${n} × ${(f.invoersoorten[soort] || soort).toLowerCase()}`);
  if (!delen.length) return null;
  return `Naast de vragenlijsten is eigen invoer vastgelegd: ${opsomming(delen)}.`;
}

function feitenAanpak(f, { metMethode = true } = {}) {
  const uit = [];
  if (f.meetmomenten.length) {
    uit.push(alinea(f.meetmomenten.length === 1
      ? `Het onderzoek heeft één meetmoment: ${f.meetmomenten[0].naam}${f.meetmomenten[0].datum ? ` (${nlDatum(f.meetmomenten[0].datum)})` : ''}.`
      : `Het onderzoek heeft ${f.meetmomenten.length} meetmomenten: ${opsomming(f.meetmomenten.map((m) => `${m.naam}${m.datum ? ` (${nlDatum(m.datum)})` : ''}`))}.`));
  }
  if (f.lijsten.length) {
    uit.push(lijstenTabel(f));
    for (const l of f.lijsten) if (l.n && !l.verborgen && l.van) uit.push(alinea(responsZin(l, f.drempel)));
  } else {
    uit.push(alinea('Er is in dit onderzoek nog geen vragenlijst.'));
  }
  const iz = invoerZin(f);
  if (iz) uit.push(alinea(iz));
  if (metMethode && f.lijsten.length) {
    uit.push(alinea(`De vragenlijsten zijn anoniem ingevuld via een link; er is geen naam, e-mailadres of IP-adres opgeslagen. Uitkomsten van minder dan ${f.drempel} respondenten worden niet gerapporteerd. Scores zijn gemiddelden op een schaal van 1 (laagst) tot 5 (hoogst); 3 is het midden van de schaal.`));
  }
  return uit;
}

/** Percentages "4 of 5" en "1 of 2", berekend over de scores 1 tot 5 ("weet niet" telt niet mee, net als bij het gemiddelde). */
function eensOneens(q) {
  const v = q.verdeling.filter((x) => x.waarde !== 'weet_niet');
  const scores = v.reduce((t, x) => t + x.aantal, 0);
  if (v.length < 5 || !scores) return [null, null];
  const hoog = v[3].aantal + v[4].aantal;
  const laag = v[0].aantal + v[1].aantal;
  return [(hoog / scores) * 100, (laag / scores) * 100];
}

const weetNietAantal = (q) => (q.verdeling.find((x) => x.waarde === 'weet_niet') || { aantal: 0 }).aantal;
const scoreAantal = (q) => (Number.isInteger(q.n_score) ? q.n_score : q.verdeling.filter((x) => x.waarde !== 'weet_niet').reduce((t, x) => t + x.aantal, 0));

function feitenResultaten(f, inhoud, sectie) {
  const l = hoofdLijst(f, inhoud);
  if (!l) return [alinea('Er is nog geen vragenlijst met antwoorden.')];
  const uit = [alinea(responsZin(l, f.drempel))];
  if (!l.n || l.verborgen) return uit;
  if (l.status === 'open') uit.push(alinea(`De vragenlijst stond op de peildatum (${nlDatum(f.peildatum)}) nog open; de uitkomsten kunnen nog veranderen.`));

  const themas = l.themas.filter((t) => !t.verborgen && eindig(t.gemiddelde));
  if (themas.length) {
    uit.push(tabel(
      ['Thema', 'Gemiddelde (1–5)', 'Vragen', 'Respondenten'],
      l.themas.map((t) => [t.naam, t.verborgen ? 'niet getoond' : nlGetal(t.gemiddelde, 1), t.aantal_vragen, t.verborgen ? `minder dan ${f.drempel}` : t.n]),
      `Gemiddelde score per thema – ${lijstNaam(l)}`,
    ));
    if (themas.length >= 2) {
      // Hoogste en laagste op de afgeronde waarden die in de tabel staan; bij een gelijke stand alle thema's noemen.
      const afgerond = (t) => Number(t.gemiddelde.toFixed(1));
      const max = Math.max(...themas.map(afgerond));
      const min = Math.min(...themas.map(afgerond));
      if (max !== min) {
        const deel = (waarde, woord) => {
          const namen = themas.filter((t) => afgerond(t) === waarde).map((t) => t.naam);
          return namen.length === 1
            ? `${woord} gemiddelde (${nlGetal(waarde, 1)}) heeft het thema ${namen[0]}`
            : `${woord} gemiddelde (${nlGetal(waarde, 1)}) hebben de thema's ${opsomming(namen)}`;
        };
        uit.push(alinea(`${deel(max, 'Het hoogste')}; ${deel(min, 'het laagste')}.`));
      } else {
        uit.push(alinea(`De thema's scoren afgerond gelijk (${nlGetal(max, 1)}).`));
      }
    }
  } else {
    uit.push(alinea('Deze vragenlijst heeft geen schaalvragen (1 tot 5), dus er zijn geen gemiddelde scores per thema.'));
  }
  if (sectie.beknopt) return uit;

  // Per thema de vragen
  const groepen = [];
  for (const q of l.vragen) {
    if (q.type === 'open') continue;
    let g = groepen[groepen.length - 1];
    if (!g || g.naam !== q.thema_naam) {
      g = { naam: q.thema_naam, vragen: [] };
      groepen.push(g);
    }
    g.vragen.push(q);
  }
  for (const g of groepen) {
    uit.push(kop(g.naam || 'Zonder thema', 3));
    const schaal = g.vragen.filter((q) => q.type === 'schaal');
    if (schaal.length) {
      const metWeetNiet = schaal.some((q) => !q.verborgen && weetNietAantal(q) > 0);
      uit.push(tabel(
        ['Stelling of vraag', 'Gemiddelde', 'Score 4 of 5', 'Score 1 of 2', 'Scores (1–5)', ...(metWeetNiet ? ['Weet niet'] : [])],
        schaal.map((q) => {
          if (q.verborgen) return [q.tekst, 'niet getoond', '–', '–', `minder dan ${f.drempel}`, ...(metWeetNiet ? ['–'] : [])];
          const scores = scoreAantal(q);
          const wn = metWeetNiet ? [weetNietAantal(q)] : [];
          if (!scores) return [q.tekst, '–', '–', '–', 0, ...wn];
          const [hoog, laag] = eensOneens(q);
          return [q.tekst, nlGetal(q.gemiddelde, 1), nlProcent(hoog), nlProcent(laag), scores, ...wn];
        }),
        `Schaalvragen – ${g.naam}`,
      ));
      if (metWeetNiet) uit.push(alinea('Het gemiddelde en de percentages zijn berekend over de scores 1 tot 5; "weet niet" telt daarin niet mee.'));
    }
    for (const q of g.vragen.filter((x) => x.type !== 'schaal')) {
      if (q.verborgen) {
        uit.push(alinea(`"${q.tekst}": niet getoond (minder dan ${f.drempel} antwoorden).`));
      } else if (!q.n) {
        uit.push(alinea(`"${q.tekst}": geen antwoorden.`));
      } else {
        uit.push(tabel(
          ['Antwoord', 'Aantal', q.meerdere ? '% van respondenten' : 'Percentage'],
          q.verdeling.map((v) => [v.label, v.aantal, nlProcent(v.percentage)]),
          `"${q.tekst}" – ${q.type === 'janee' ? 'ja/nee-vraag' : 'meerkeuzevraag'}, ${aantalTekst(q.n, 'antwoord', 'antwoorden')}${q.meerdere ? '; meerdere antwoorden mogelijk' : ''}`,
        ));
      }
    }
  }
  return uit;
}

const EFFECT = { verwaarloosbaar: 'verwaarloosbaar klein', klein: 'klein', middelgroot: 'middelgroot', groot: 'groot' };

/**
 * Eén zin per getoetst thema. De gemiddelden zelf staan in de tabel erboven (zoals op het dashboard);
 * de zin noemt alleen de uitkomst van de toets, zodat er nooit twee verschillende gemiddelden naast elkaar staan.
 */
function toetsZin(t) {
  const basis = `Getoetst op de themascores van ${t.van.n} en ${t.naar.n} respondenten.`;
  const wat = `**${t.thema_naam}**: het verschil tussen ${t.van.naam} en ${t.naar.naam}`;
  if (!eindig(t.p)) return `${wat} is niet te toetsen, omdat er te weinig spreiding in de antwoorden is. ${basis}`;
  let zin = t.p < ALFA
    ? `${wat} is statistisch significant (${pTekst(t.p)}): het is onwaarschijnlijk dat het alleen door toeval komt.`
    : `${wat} is niet statistisch significant (${pTekst(t.p)}): het kan door toeval komen.`;
  if (t.effect && eindig(t.g)) zin += ` De grootte van het verschil is ${EFFECT[t.effect] || t.effect} (Hedges' g = ${nlGetal(t.g, 2)}).`;
  return `${zin} ${basis}`;
}

function feitenVerloop(f) {
  const mm = f.verloop.meetmomenten.filter((m) => f.verloop.themas.some((t) => t.punten.some((p) => p.meetmoment_id === m.id && p.gemiddelde !== null)));
  if (mm.length < 2) {
    return [alinea(mm.length === 1
      ? `Er zijn alleen resultaten van het meetmoment ${mm[0].naam}. Een vergelijking tussen meetmomenten is pas mogelijk als een tweede meetmoment minstens ${f.drempel} respondenten heeft.`
      : `Er zijn nog geen meetmomenten met resultaten van minstens ${f.drempel} respondenten. Een vergelijking is nog niet mogelijk.`)];
  }
  const eerste = mm[0];
  const laatste = mm[mm.length - 1];
  const uit = [tabel(
    ['Thema', ...mm.map((m) => m.naam), `Verschil (${laatste.naam} − ${eerste.naam})`],
    f.verloop.themas.map((t) => {
      const w = (m) => t.punten.find((p) => p.meetmoment_id === m.id)?.gemiddelde ?? null;
      const a = w(eerste);
      const b = w(laatste);
      return [t.naam, ...mm.map((m) => (w(m) === null ? '–' : nlGetal(w(m), 1))), a === null || b === null ? '–' : metTeken(Number(b.toFixed(1)) - Number(a.toFixed(1)), 1)];
    }),
    'Gemiddelde score per thema en meetmoment (schaal 1–5)',
  )];
  if (f.toetsen.length) {
    uit.push(alinea('Per thema is getoetst of het verschil tussen het eerste en het laatste meetmoment groter is dan op grond van toeval te verwachten is (t-toets van Welch, tweezijdig, grens 5%). De toets gebruikt per respondent de themascore: het gemiddelde van de schaalvragen van dat thema die iemand beantwoordde, als dat minstens de helft was. De tabel hierboven middelt alle losse antwoorden, zoals het dashboard. Daardoor kunnen de aantallen en de gemiddelden van de toets iets afwijken van de tabel.'));
    uit.push({ soort: 'lijst', items: f.toetsen.map(toetsZin) });
    uit.push(alinea('Bij het lezen: de vragenlijsten zijn anoniem, dus de metingen worden vergeleken als twee groepen en niet per persoon. Een significant verschil zegt niets over de oorzaak, en significant betekent niet automatisch belangrijk.'));
  }
  return uit;
}

function feitenCijfers(f) {
  const uit = [];
  if (f.cijfers.length) {
    uit.push(tabel(
      ['Cijfer', 'Datum', 'Meetmoment', 'Waarde'],
      f.cijfers.flatMap((r) => r.punten.map((p) => [r.naam, nlDatum(p.datum), p.meetmoment_naam || '–', waardeMetEenheid(p.waarde, r.eenheid)])),
      'Eigen cijfers',
    ));
  } else {
    uit.push(alinea('Er zijn in dit onderzoek geen eigen cijfers vastgelegd.'));
  }
  const iz = invoerZin(f);
  if (iz) uit.push(alinea(iz));
  return uit;
}

function actieTabel(f, acties, bijschrift) {
  return tabel(
    ['Actie', 'Status', 'Datum'],
    acties.map((a) => [a.titel, f.actiestatussen[a.status] || a.status, a.datum ? nlDatum(a.datum) : '–']),
    bijschrift,
  );
}

function feitenAanbevelingen(f) {
  if (!f.acties.length) return [alinea('Op de actielijst van dit onderzoek staan nog geen acties.')];
  return [alinea(`Op de actielijst van dit onderzoek ${f.acties.length === 1 ? 'staat één actie' : `staan ${aantalTekst(f.acties.length, 'actie', 'acties')}`}:`), actieTabel(f, f.acties, 'Actielijst')];
}

function feitenVervolg(f) {
  const uit = [];
  const komend = f.meetmomenten.filter((m) => m.datum && m.datum > f.peildatum);
  if (komend.length) uit.push(alinea(`Nog te houden: ${opsomming(komend.map((m) => `${m.naam} (${nlDatum(m.datum)})`))}.`));
  const open = f.lijsten.filter((l) => l.status === 'open');
  if (open.length) uit.push(alinea(`Op de peildatum ${open.length === 1 ? 'stond' : 'stonden'} nog open: ${opsomming(open.map((l) => `"${lijstNaam(l)}"`))}.`));
  const todo = f.acties.filter((a) => a.status !== 'klaar');
  if (todo.length) uit.push(actieTabel(f, todo, 'Openstaande acties'));
  else uit.push(alinea(f.acties.length ? 'Alle acties op de actielijst zijn afgerond.' : 'Op de actielijst staan nog geen acties.'));
  return uit;
}

function feitenBijlageVragen(f, inhoud) {
  const l = hoofdLijst(f, inhoud);
  if (!l) return [alinea('Er is nog geen vragenlijst.')];
  const uit = [alinea(`De vragenlijst "${lijstNaam(l)}" bestaat uit ${aantalTekst(l.vragen.length, 'vraag', 'vragen')}.`)];
  const soortNaam = { schaal: 'schaal 1–5', janee: 'ja/nee', meerkeuze: 'meerkeuze', open: 'open vraag' };
  let thema = null;
  let items = [];
  const sluit = () => {
    if (items.length) uit.push({ soort: 'lijst', genummerd: true, items });
    items = [];
  };
  for (const q of l.vragen) {
    if (q.thema_naam !== thema) {
      sluit();
      thema = q.thema_naam;
      uit.push(kop(thema || 'Zonder thema', 3));
    }
    const opties = q.type === 'meerkeuze' && q.opties.length ? `: ${q.opties.join(' / ')}` : '';
    items.push(`${q.tekst} (${soortNaam[q.type] || q.type}${opties})`);
  }
  sluit();
  return uit;
}

function feitenBijlageOpen(f, inhoud) {
  const l = hoofdLijst(f, inhoud);
  if (!l || !l.open.length) {
    return [alinea(`Er zijn geen open antwoorden om te tonen (open vragen met minder dan ${f.drempel} antwoorden worden niet opgenomen).`)];
  }
  const uit = [alinea('De antwoorden zijn letterlijk overgenomen en staan in willekeurige volgorde.')];
  for (const o of l.open) {
    uit.push(kop(o.tekst, 3));
    uit.push({ soort: 'lijst', items: o.antwoorden.slice() });
  }
  return uit;
}

/** De feitenblokken van één hoofdstuk. Leeg als het hoofdstuk geen feiten heeft. */
export function sectieFeiten(sectie, feiten, inhoud) {
  if (!feiten || !SECTIESOORTEN[sectie.soort]?.feiten) return [];
  switch (sectie.soort) {
    case 'aanleiding': return feitenAanleiding(feiten);
    case 'aanpak': return feitenAanpak(feiten);
    case 'stand': return feitenAanpak(feiten, { metMethode: false });
    case 'resultaten': return feitenResultaten(feiten, inhoud, sectie);
    case 'verloop': return feitenVerloop(feiten);
    case 'cijfers': return feitenCijfers(feiten);
    case 'aanbevelingen': return feitenAanbevelingen(feiten);
    case 'vervolg': return feitenVervolg(feiten);
    case 'bijlage-vragen': return feitenBijlageVragen(feiten, inhoud);
    case 'bijlage-open': return feitenBijlageOpen(feiten, inhoud);
    default: return [];
  }
}

// ---------- Eigen tekst omzetten in blokken ----------

const P_KOP = /^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/;
const P_OPSOMMING = /^[ \t]*[-*+][ \t]+/;
const P_GENUMMERD = /^[ \t]*\d{1,9}[.)][ \t]+/;
const P_GENUMMERD_NR = /^[ \t]*(\d{1,9})[.)]/;
const P_CITAAT = /^[ \t]{0,3}>[ \t]?/;

/**
 * Zet de eigen tekst (met de eenvoudige opmaak van Stukken: ## kop, - opsomming, 1. genummerd, > citaat,
 * **vet**, *cursief*) om in blokken. Koppen in de tekst worden tussenkopjes onder de hoofdstuktitel.
 */
export function tekstNaarBlokken(tekst, kopNiveau = 3) {
  const regels = String(tekst || '').replace(/\r\n?/g, '\n').split('\n');
  const uit = [];
  let i = 0;
  while (i < regels.length) {
    const regel = regels[i];
    if (!regel.trim()) {
      i++;
      continue;
    }
    const m = P_KOP.exec(regel);
    if (m) {
      uit.push(kop(m[2].replace(/[ \t]+#+[ \t]*$/, '').trim(), Math.min(3, kopNiveau)));
      i++;
      continue;
    }
    if (P_CITAAT.test(regel)) {
      const binnen = [];
      while (i < regels.length && P_CITAAT.test(regels[i])) binnen.push(regels[i++].replace(P_CITAAT, ''));
      uit.push({ soort: 'citaat', tekst: binnen.join(' ').trim() });
      continue;
    }
    const isOps = P_OPSOMMING.test(regel);
    if (isOps || P_GENUMMERD.test(regel)) {
      const patroon = isOps ? P_OPSOMMING : P_GENUMMERD;
      const items = [];
      const begin = isOps ? null : parseInt(P_GENUMMERD_NR.exec(regel)[1], 10);
      while (i < regels.length && patroon.test(regels[i])) {
        let item = regels[i++].replace(patroon, '');
        while (i < regels.length && /^[ \t]{2,}\S/.test(regels[i]) && !P_OPSOMMING.test(regels[i]) && !P_GENUMMERD.test(regels[i])) item += ` ${regels[i++].trim()}`;
        items.push(item.trim());
      }
      uit.push(isOps ? { soort: 'lijst', genummerd: false, items } : { soort: 'lijst', genummerd: true, start: begin, items });
      continue;
    }
    const delen = [];
    while (i < regels.length && regels[i].trim() && !P_KOP.test(regels[i]) && !P_CITAAT.test(regels[i]) && !P_OPSOMMING.test(regels[i]) && !P_GENUMMERD.test(regels[i])) {
      delen.push(regels[i++].trim());
    }
    uit.push(alinea(delen.join('\n')));
  }
  return uit;
}

// ---------- Het hele rapport ----------

/** Hoofdstukken die in het rapport komen, met hun nummer (bijlagen krijgen een letter). */
export function genummerdeSecties(inhoud) {
  let nr = 0;
  let bijlage = 0;
  return (inhoud.secties || []).filter((s) => s.aan !== false).map((s) => {
    const isBijlage = !!SECTIESOORTEN[s.soort]?.bijlage;
    const nummer = isBijlage ? String.fromCharCode(65 + bijlage++) : String(++nr);
    return { sectie: s, nummer, isBijlage };
  });
}

/** Welke hoofdstukken hebben nog geen eigen tekst terwijl die er wel hoort? */
export function nogInTeVullen(inhoud) {
  return (inhoud.secties || [])
    .filter((s) => s.aan !== false && !SECTIESOORTEN[s.soort]?.bijlage && !String(s.tekst || '').trim())
    .map((s) => s.titel);
}

/**
 * Het complete rapport als blokken.
 * opties.markeerLeeg: toon "[nog in te vullen]" bij hoofdstukken zonder eigen tekst (voor het voorbeeld);
 * opties.bron: toon bij feitenblokken de regel dat ze automatisch uit de gegevens komen.
 */
export function rapportNaarBlokken({ titel, soort, inhoud, feiten }, { markeerLeeg = false, bron = true } = {}) {
  const uit = [];
  const f = feiten || null;
  uit.push({ soort: 'titel', tekst: titel, ondertitel: inhoud.ondertitel || '', soortNaam: RAPPORTSOORTEN[soort] || 'Rapport' });
  const voorblad = [];
  if (f?.onderzoek?.bedrijfsnaam) voorblad.push(['Organisatie', f.onderzoek.bedrijfsnaam]);
  if (inhoud.opdrachtgever) voorblad.push(['Opdrachtgever', inhoud.opdrachtgever]);
  if (inhoud.opsteller) voorblad.push(['Opgesteld door', inhoud.opsteller]);
  if (inhoud.datum) voorblad.push(['Datum', nlDatum(inhoud.datum)]);
  if (f?.peildatum) voorblad.push(['Peildatum van de cijfers', nlDatum(f.peildatum)]);
  if (voorblad.length) uit.push({ soort: 'gegevens', rijen: voorblad });
  uit.push({ soort: 'paginaeinde' });

  for (const { sectie, nummer, isBijlage } of genummerdeSecties(inhoud)) {
    uit.push(kop(isBijlage ? sectie.titel.replace(/^Bijlage:\s*/i, `Bijlage ${nummer}: `) : `${nummer}. ${sectie.titel}`, 1));
    const eigen = tekstNaarBlokken(sectie.tekst, 2);
    const feitenBlokken = sectie.feiten !== false && f ? sectieFeiten(sectie, f, inhoud) : [];
    const eigenEerst = !['aanleiding', 'aanpak', 'stand', 'resultaten', 'verloop', 'cijfers', 'bijlage-vragen', 'bijlage-open', 'vervolg'].includes(sectie.soort);
    const voegEigen = () => {
      if (eigen.length) uit.push(...eigen);
      else if (markeerLeeg && !isBijlage) uit.push({ soort: 'leeg', tekst: 'Nog in te vullen: hier komt je eigen tekst.' });
    };
    const voegFeiten = () => {
      if (!feitenBlokken.length) return;
      uit.push({ soort: 'feiten', blokken: feitenBlokken, bron: bron ? `Uit de gegevens van het onderzoek, peildatum ${nlDatum(f.peildatum)}` : '' });
    };
    if (eigenEerst) {
      voegEigen();
      voegFeiten();
    } else {
      voegFeiten();
      voegEigen();
    }
  }
  return uit;
}

/** Blokken voor Word: zonder schermspecifieke soorten ('titel', 'gegevens', 'feiten', 'leeg'). */
export function blokkenVoorWord(blokken) {
  const uit = [];
  for (const b of blokken) {
    if (b.soort === 'titel') {
      uit.push({ soort: 'alinea', tekst: b.soortNaam });
      if (b.ondertitel) uit.push({ soort: 'alinea', tekst: `*${b.ondertitel}*` });
    } else if (b.soort === 'gegevens') {
      uit.push({ soort: 'tabel', kop: ['Gegevens', ''], rijen: b.rijen });
    } else if (b.soort === 'feiten') {
      for (const x of b.blokken) {
        if (x.soort === 'tabel') {
          if (x.bijschrift) uit.push({ soort: 'alinea', tekst: `*${x.bijschrift}*` });
          uit.push({ soort: 'tabel', kop: x.kop, rijen: x.rijen });
        } else {
          uit.push(x);
        }
      }
      if (b.bron) uit.push({ soort: 'alinea', tekst: `*${b.bron}.*` });
    } else if (b.soort === 'leeg') {
      uit.push({ soort: 'alinea', tekst: `[${b.tekst}]` });
    } else {
      uit.push(b);
    }
  }
  return uit;
}

/** Het rapport als platte tekst met eenvoudige opmaak (voor kopiëren of opslaan als stuk). */
export function blokkenNaarTekst(blokken) {
  const uit = [];
  const loop = (lijst) => {
    for (const b of lijst) {
      if (b.soort === 'titel') {
        uit.push(`# ${b.tekst}`, '', b.ondertitel ? `${b.soortNaam} – ${b.ondertitel}` : b.soortNaam, '');
      } else if (b.soort === 'gegevens') {
        for (const [k, w] of b.rijen) uit.push(`- ${k}: ${w}`);
        uit.push('');
      } else if (b.soort === 'kop') {
        uit.push(`${'#'.repeat(Math.min(3, b.niveau + 1))} ${b.tekst}`, '');
      } else if (b.soort === 'alinea') {
        uit.push(b.tekst, '');
      } else if (b.soort === 'citaat') {
        uit.push(`> ${b.tekst}`, '');
      } else if (b.soort === 'lijst') {
        b.items.forEach((item, i) => uit.push(b.genummerd ? `${(b.start || 1) + i}. ${item}` : `- ${item}`));
        uit.push('');
      } else if (b.soort === 'tabel') {
        if (b.bijschrift) uit.push(`**${b.bijschrift}**`);
        for (const rij of b.rijen) uit.push(`- ${rij.map((cel, i) => (i === 0 ? cel : `${b.kop[i]}: ${cel}`)).join(' · ')}`);
        uit.push('');
      } else if (b.soort === 'feiten') {
        loop(b.blokken);
      } else if (b.soort === 'leeg') {
        uit.push(`[${b.tekst}]`, '');
      }
    }
  };
  loop(blokken);
  return `${uit.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
