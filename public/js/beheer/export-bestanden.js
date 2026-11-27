// Exporteren naar andere programma's: Excel-werkboek, SPSS-pakket, Word en agenda (Outlook).
// De gegevens komen van GET /api/beheer/onderzoeken/<id>/export/data. Geen DOM: ook te testen in Node.

import { maakXlsx, maakZip, maakSpssSyntax, maakIcs, maakDocx, spssNaam } from './bestanden.js';
import { bouwModel, schaalScore } from './analyse-model.js';
import { slug } from './export.js';

const WEET_NIET = 'weet_niet';
const SPSS_WEET_NIET = 99;

function optiesVan(q) {
  try {
    const o = typeof q.opties === 'string' ? JSON.parse(q.opties || '[]') : q.opties || [];
    return Array.isArray(o) ? o : [];
  } catch {
    return [];
  }
}

const schaalLabels = (data, q) => data.lijsten?.schalen?.[q.schaal_soort] || data.lijsten?.schalen?.eens || ['1', '2', '3', '4', '5'];
/** Bereik van een cijfervraag ({ min, max, laag, hoog }) uit de export; null als het ontbreekt. */
const cijferschaal = (data, q) => data.lijsten?.cijferschalen?.[q.schaal_soort] || data.lijsten?.cijferschalen?.rapport || null;
const isCijfer = (b, a) => !!b && Number.isInteger(a) && a >= b.min && a <= b.max;
/** eNPS-groep van een cijfer 0 tot 10: 1 = criticaster (0–6), 2 = passief (7–8), 3 = promotor (9–10). */
const enpsGroep = (w) => (w >= 9 ? 3 : w >= 7 ? 2 : 1);

/** Leesbaar antwoord voor Excel: schaal als getal, keuzes als tekst. */
function antwoordVoorExcel(q, a) {
  if (a === undefined || a === null) return null;
  if (q.type === 'schaal' || q.type === 'cijfer') return a === WEET_NIET ? 'weet niet / n.v.t.' : Number.isInteger(a) ? a : null;
  if (q.type === 'meerkeuze') {
    const labels = new Map(optiesVan(q).map((o) => [o.id, o.label]));
    return (Array.isArray(a) ? a : [a]).map((k) => labels.get(k) || '(verwijderde optie)').join(' | ');
  }
  return String(a);
}

// ---------- Excel ----------

/**
 * De tabbladen van het Excel-werkboek: overzicht, per vragenlijst de antwoorden (één rij per respondent),
 * scores per thema, het codeboek, eigen invoer, acties en meetmomenten.
 */
export function excelBladen(data) {
  const themaNaam = new Map(data.themas.map((t) => [t.id, t.naam]));
  const meetpuntNaam = new Map(data.meetpunten.map((m) => [m.id, m.naam]));
  const mmNaam = new Map(data.meetmomenten.map((m) => [m.id, m.naam]));
  const o = data.onderzoek;
  const bladen = [];

  const antwoordBladen = data.vragenlijsten.map((vl, i) => ({ vl, naam: `Antwoorden ${i + 1}` }));

  bladen.push({
    naam: 'Overzicht',
    kolombreedtes: [28, 90],
    rijen: [
      ['Onderdeel', 'Inhoud'],
      ['Onderzoek', o.titel],
      ['Organisatie', o.bedrijfsnaam],
      ['Onderzoeksvraag', o.onderzoeksvraag || ''],
      ['Status', o.status === 'gearchiveerd' ? 'Gearchiveerd' : 'Actief'],
      ['Geëxporteerd op', data.export?.datum || ''],
      [null, null],
      ['Tabblad', 'Wat staat erin'],
      ...antwoordBladen.map(({ vl, naam }) => [naam, `Antwoorden op "${vl.titel}"${mmNaam.get(vl.meetmoment_id) ? ` (${mmNaam.get(vl.meetmoment_id)})` : ''}: één rij per respondent, één kolom per vraag.`]),
      ['Scores per thema', 'Gemiddelde score (1–5) per thema en vragenlijst, zoals op het dashboard.'],
      ['Codeboek', 'Alle vragen met hun nummer, thema, soort en antwoordmogelijkheden.'],
      ['Eigen invoer', 'Interviews, observaties, cijfers en documenten die je zelf hebt vastgelegd.'],
      ['Acties', 'De actielijst.'],
      ['Meetmomenten', 'De meetmomenten van het onderzoek.'],
      [null, null],
      ['Let op', 'Dit bestand bevat losse antwoorden, ook van kleine groepen. Bewaar het op een veilige plek en deel het niet zomaar.'],
    ],
  });

  for (const { vl, naam } of antwoordBladen) {
    const vragen = data.vragen.filter((q) => q.vragenlijst_id === vl.id);
    const inz = data.inzendingen.filter((i) => i.vragenlijst_id === vl.id);
    bladen.push({
      naam,
      kolombreedtes: [12, 12, ...vragen.map((q) => (q.type === 'open' ? 50 : 22))],
      rijen: [
        ['Respondent', 'Datum', ...vragen.map((q, i) => `V${i + 1}. ${q.tekst}`)],
        ...inz.map((i, n) => [n + 1, i.datum, ...vragen.map((q) => antwoordVoorExcel(q, i.antwoorden?.[q.id]))]),
      ],
    });
  }

  // Scores per thema: alle geldige schaalantwoorden van het thema samen (zoals op het dashboard).
  const scoreRijen = [['Vragenlijst', 'Meetmoment', 'Thema', 'Schaalvragen', 'Gemiddelde (1–5)', 'Respondenten']];
  for (const vl of data.vragenlijsten) {
    const inz = data.inzendingen.filter((i) => i.vragenlijst_id === vl.id);
    for (const t of data.themas) {
      const vragen = data.vragen.filter((q) => q.vragenlijst_id === vl.id && q.thema_id === t.id && q.type === 'schaal');
      if (!vragen.length) continue;
      let som = 0;
      let aantal = 0;
      let respondenten = 0;
      for (const i of inz) {
        let heeft = false;
        for (const q of vragen) {
          const a = i.antwoorden?.[q.id];
          if (Number.isInteger(a) && a >= 1 && a <= 5) {
            som += a;
            aantal++;
            heeft = true;
          }
        }
        if (heeft) respondenten++;
      }
      scoreRijen.push([vl.titel, mmNaam.get(vl.meetmoment_id) || '', t.naam, vragen.length, aantal ? Math.round((som / aantal) * 100) / 100 : null, respondenten]);
    }
  }
  bladen.push({ naam: 'Scores per thema', kolombreedtes: [34, 18, 34, 14, 18, 14], rijen: scoreRijen });

  // De laatste kolom zegt welk achtergrondkenmerk een vraag meet (afdeling, leeftijd …), leeg bij een gewone vraag.
  const codeboek = [['Vragenlijst', 'Tabblad', 'Nr', 'Thema', 'Meetpunt', 'Vraag', 'Soort', 'Antwoordmogelijkheden', 'Verplicht', 'Kenmerk']];
  for (const { vl, naam } of antwoordBladen) {
    data.vragen.filter((q) => q.vragenlijst_id === vl.id).forEach((q, i) => {
      let mogelijkheden = '';
      if (q.type === 'schaal') mogelijkheden = `${schaalLabels(data, q).map((l, k) => `${k + 1} = ${l}`).join('; ')}${q.weet_niet ? '; weet niet / n.v.t.' : ''}`;
      else if (q.type === 'cijfer') {
        const c = cijferschaal(data, q);
        mogelijkheden = c ? `${c.min} = ${c.laag} … ${c.max} = ${c.hoog}${q.weet_niet ? '; weet niet / n.v.t.' : ''}` : '';
      } else if (q.type === 'janee') mogelijkheden = 'ja; nee';
      else if (q.type === 'meerkeuze') mogelijkheden = `${optiesVan(q).map((x) => x.label).join('; ')}${q.meerdere_antwoorden ? ' (meerdere antwoorden mogelijk)' : ''}`;
      const kenmerk = q.kenmerk ? data.lijsten?.kenmerken?.[q.kenmerk]?.naam || q.kenmerk : '';
      codeboek.push([vl.titel, naam, `V${i + 1}`, themaNaam.get(q.thema_id) || '', meetpuntNaam.get(q.meetpunt_id) || '', q.tekst, data.lijsten?.vraagtypen?.[q.type] || q.type, mogelijkheden, q.verplicht ? 'ja' : 'nee', kenmerk]);
    });
  }
  bladen.push({ naam: 'Codeboek', kolombreedtes: [30, 16, 6, 28, 24, 60, 16, 60, 10, 18], rijen: codeboek });

  bladen.push({
    naam: 'Eigen invoer',
    kolombreedtes: [12, 18, 28, 24, 18, 36, 10, 10, 70],
    rijen: [
      ['Datum', 'Soort', 'Thema', 'Meetpunt', 'Meetmoment', 'Titel', 'Waarde', 'Eenheid', 'Tekst'],
      ...data.eigen_invoer.map((e) => [e.datum, data.lijsten?.invoersoorten?.[e.soort] || e.soort, themaNaam.get(e.thema_id) || '', meetpuntNaam.get(e.meetpunt_id) || '', mmNaam.get(e.meetmoment_id) || '', e.titel, e.waarde, e.eenheid, e.tekst ?? e.inhoud ?? '']),
    ],
  });
  bladen.push({
    naam: 'Acties',
    kolombreedtes: [60, 14, 14, 60],
    rijen: [['Actie', 'Status', 'Datum', 'Notitie'], ...data.acties.map((a) => [a.titel, data.lijsten?.actiestatussen?.[a.status] || a.status, a.datum || '', a.notitie || ''])],
  });
  bladen.push({
    naam: 'Meetmomenten',
    kolombreedtes: [30, 14, 70],
    rijen: [['Meetmoment', 'Datum', 'Omschrijving'], ...data.meetmomenten.map((m) => [m.naam, m.datum || '', m.omschrijving || ''])],
  });
  return bladen;
}

export function excelWerkboek(data) {
  return maakXlsx(excelBladen(data));
}

// ---------- SPSS ----------

function spssCel(w) {
  if (w === null || w === undefined) return '';
  if (typeof w === 'number') return Number.isFinite(w) ? String(w) : '';
  const t = String(w).replace(/\s*[\r\n]+\s*/g, ' ');
  return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * Stamvragen in de volgorde van de eerste vragenlijst waarin ze voorkomen, met per meerkeuzevraag de
 * antwoordmogelijkheden over alle vragenlijsten heen, en de SPSS-namen van alle variabelen.
 */
function spssIndeling(data, model) {
  const gebruikt = new Set();
  // De namen worden in deze vaste volgorde uitgedeeld (spssNaam maakt ze uniek): eerst de vaste variabelen,
  // dan de vragen, dan de themascores. Een andere volgorde geeft bij een botsing andere namen.
  const systeem = {
    respondent: spssNaam('respondent', gebruikt),
    vragenlijst: spssNaam('vragenlijst', gebruikt),
    meetmoment: data.meetmomenten.length ? spssNaam('meetmoment', gebruikt) : null,
    datum: spssNaam('datum', gebruikt),
  };
  const vraag = new Map();
  const optie = new Map();
  const thema = new Map();
  const enps = new Map();

  const stammen = [];
  const gezien = new Map();
  for (const l of model.lijsten) {
    for (const q of l.vragen) {
      if (!gezien.has(q.stam)) {
        const s = { stam: q.stam, eerste: q, perLijst: new Map() };
        gezien.set(q.stam, s);
        stammen.push(s);
      }
      const s = gezien.get(q.stam);
      if (!s.perLijst.has(l.id)) s.perLijst.set(l.id, q);
    }
  }
  stammen.forEach((s, i) => {
    const q = s.eerste;
    const basis = `v${String(i + 1).padStart(2, '0')}`;
    // Een achtergrondvraag krijgt een leesbare naam (afdeling, leeftijd …; BOUWPLAN B14); 'Ander kenmerk' niet.
    const kenmerk = [...s.perLijst.values()].map((v) => v.kenmerk).find(Boolean) || '';
    if (q.type === 'meerkeuze') {
      // Antwoordmogelijkheden herkennen aan hun id: een kopie voor een volgend meetmoment houdt dezelfde id's,
      // ook als een mogelijkheid daarna is hernoemd. Heeft een mogelijkheid een ander id maar dezelfde tekst
      // (en staat die tekst nog niet in deze vragenlijst), dan hoort hij er ook bij. Het label is dat van de
      // eerste vragenlijst, met de nieuwe naam erbij als die later is veranderd.
      const mogelijk = []; // { ids: Set, labels: [] }
      const gelijkeTekst = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
      for (const l of model.lijsten) {
        const v = s.perLijst.get(l.id);
        if (!v) continue;
        const idsHier = new Set(v.opties.map((o) => o.id));
        for (const o of v.opties) {
          let m = mogelijk.find((x) => x.ids.has(o.id));
          if (!m) m = mogelijk.find((x) => x.labels.some((t) => gelijkeTekst(t, o.label)) && ![...x.ids].some((id) => idsHier.has(id)));
          if (!m) {
            mogelijk.push({ ids: new Set([o.id]), labels: [o.label] });
            continue;
          }
          m.ids.add(o.id);
          if (!m.labels.some((t) => gelijkeTekst(t, o.label))) m.labels.push(o.label);
        }
      }
      for (const m of mogelijk) m.label = m.labels.join(' / ');
      s.mogelijk = mogelijk;
      if (q.meerdere) {
        mogelijk.forEach((m, k) => {
          m.naam = spssNaam(`${basis}_${k + 1}`, gebruikt);
          for (const id of m.ids) optie.set(`${s.stam}:${id}`, m.naam);
        });
        return;
      }
    }
    vraag.set(s.stam, spssNaam(kenmerk && kenmerk !== 'overig' ? kenmerk : basis, gebruikt));
    // Aanbevelen (0 tot 10): ook de eNPS-groep als eigen variabele, vNN_enps.
    if (q.type === 'cijfer' && q.schaal_soort === 'nps') enps.set(s.stam, spssNaam(`${basis}_enps`, gebruikt));
  });
  model.themas.forEach((t, i) => {
    if (!model.lijsten.some((l) => l.vragen.some((q) => q.type === 'schaal' && q.thema_id === t.id))) return;
    thema.set(t.id, spssNaam(`thema${String(i + 1).padStart(2, '0')}`, gebruikt));
  });
  return { namen: { vraag, optie, thema, meetpunt: new Map(), enps, systeem, gebruikt }, stammen };
}

/**
 * De SPSS-namen van alle variabelen, precies zoals spssGegevens ze gebruikt (BOUWPLAN §3.3, B14). Ook voor de
 * werkbank, zodat een variabele overal dezelfde naam heeft.
 * - vraag: stamvraag → naam (schaal, ja/nee, meerkeuze met één antwoord, open); een meerkeuzevraag met meerdere
 *   antwoorden heeft geen eigen naam, alleen een naam per antwoordmogelijkheid in optie (`${stam}:${optieId}`);
 * - een achtergrondvraag (kenmerk) heet naar het kenmerk (afdeling, leeftijd …), behalve 'Ander kenmerk';
 * - enps: stamvraag → naam van de eNPS-groep (vNN_enps) bij een cijfervraag van 0 tot 10;
 * - thema: thema-id → naam van de themascore; meetpunt is (nog) leeg;
 * - systeem: de vaste variabelen (meetmoment is null zonder meetmomenten); gebruikt: alle uitgedeelde namen.
 */
export function spssVariabeleNamen(data) {
  return spssIndeling(data, bouwModel(data)).namen;
}

/**
 * Eén gegevensbestand voor SPSS met alle respondenten van alle vragenlijsten onder elkaar, zodat je
 * meetmomenten en groepen kunt vergelijken. Dezelfde vraag op verschillende meetmomenten (een gekopieerde
 * vragenlijst) komt in dezelfde kolom. Geeft { variabelen, rijen }.
 * - schaalvraag: 1 tot 5, 99 = weet niet (ingesteld als ontbrekende waarde);
 * - ja/nee: 1 = ja, 0 = nee;  meerkeuze met één antwoord: 1, 2, 3 … met labels;
 * - meerkeuze met meerdere antwoorden: per antwoordmogelijkheid een kolom met 1 (gekozen) of 0;
 * - cijfervraag: het cijfer (SCALE), 99 = weet niet; bij 0 tot 10 ook vNN_enps (1 = criticaster, 2 = passief,
 *   3 = promotor; ORDINAL);
 * - open vraag: tekst;  themascore: gemiddelde van de schaalvragen van het thema (zoals bij Analyse).
 * De namen komen uit spssVariabeleNamen.
 */
export function spssGegevens(data) {
  const model = bouwModel(data);
  const { namen, stammen } = spssIndeling(data, model);
  const themaNaam = new Map(data.themas.map((t) => [t.id, t.naam]));
  const ruweVraag = new Map(data.vragen.map((q) => [q.id, q]));
  const variabelen = [];
  const kolommen = []; // per variabele: (lijst, antwoorden) → waarde

  const voeg = (variabele, waarde) => {
    variabelen.push(variabele);
    kolommen.push(waarde);
  };

  voeg({ naam: namen.systeem.respondent, soort: 'getal', decimalen: 0, label: 'Volgnummer van de respondent (binnen de vragenlijst)', meetniveau: 'NOMINAL' }, (l, a, n) => n + 1);
  voeg({
    naam: namen.systeem.vragenlijst,
    soort: 'getal',
    decimalen: 0,
    label: 'Vragenlijst',
    waardelabels: Object.fromEntries(model.lijsten.map((l, i) => [i + 1, l.titel])),
    meetniveau: 'NOMINAL',
  }, (l) => model.lijsten.indexOf(l) + 1);
  if (namen.systeem.meetmoment) {
    voeg({
      naam: namen.systeem.meetmoment,
      soort: 'getal',
      decimalen: 0,
      label: 'Meetmoment',
      waardelabels: Object.fromEntries(data.meetmomenten.map((m, i) => [i + 1, m.naam])),
      meetniveau: 'ORDINAL',
    }, (l) => {
      const i = data.meetmomenten.findIndex((m) => m.id === l.meetmoment_id);
      return i === -1 ? null : i + 1;
    });
  }
  voeg({ naam: namen.systeem.datum, soort: 'tekst', breedte: 10, label: 'Datum van invullen (JJJJ-MM-DD)' }, (l, a, n, inz) => inz.datum || '');

  for (const s of stammen) {
    const q = s.eerste;
    const ruw = ruweVraag.get(q.id) || {};
    const label = `${themaNaam.get(q.thema_id) ? `${themaNaam.get(q.thema_id)}: ` : ''}${q.tekst}`;
    const vraagIn = (l) => s.perLijst.get(l.id);
    const naam = namen.vraag.get(s.stam);
    if (q.type === 'schaal') {
      const labels = schaalLabels(data, ruw);
      voeg({
        naam,
        soort: 'getal',
        decimalen: 0,
        label,
        waardelabels: { ...Object.fromEntries(labels.map((t, k) => [k + 1, t])), [SPSS_WEET_NIET]: 'Weet niet / n.v.t.' },
        ontbrekend: [SPSS_WEET_NIET],
        meetniveau: 'ORDINAL',
      }, (l, a) => {
        const v = vraagIn(l);
        if (!v) return null;
        const w = a[v.id];
        return w === WEET_NIET ? SPSS_WEET_NIET : Number.isInteger(w) && w >= 1 && w <= 5 ? w : null;
      });
    } else if (q.type === 'cijfer') {
      const c = cijferschaal(data, ruw);
      const cijfer = (l, a) => {
        const v = vraagIn(l);
        if (!v) return null;
        const w = a[v.id];
        if (w === WEET_NIET) return SPSS_WEET_NIET;
        const cv = cijferschaal(data, ruweVraag.get(v.id) || ruw);
        return isCijfer(cv, w) ? w : null;
      };
      voeg({
        naam,
        soort: 'getal',
        decimalen: 0,
        label,
        waardelabels: { ...(c ? { [c.min]: c.laag, [c.max]: c.hoog } : {}), [SPSS_WEET_NIET]: 'Weet niet / n.v.t.' },
        ontbrekend: [SPSS_WEET_NIET],
        meetniveau: 'SCALE',
      }, cijfer);
      if (namen.enps.has(s.stam)) {
        voeg({
          naam: namen.enps.get(s.stam),
          soort: 'getal',
          decimalen: 0,
          label: `eNPS-groep: ${q.tekst}`,
          waardelabels: { 1: 'Criticaster (0–6)', 2: 'Passief (7–8)', 3: 'Promotor (9–10)' },
          meetniveau: 'ORDINAL',
        }, (l, a) => {
          const w = cijfer(l, a);
          return w === null || w === SPSS_WEET_NIET ? null : enpsGroep(w);
        });
      }
    } else if (q.type === 'janee') {
      voeg({ naam, soort: 'getal', decimalen: 0, label, waardelabels: { 1: 'Ja', 0: 'Nee' }, meetniveau: 'NOMINAL' }, (l, a) => {
        const v = vraagIn(l);
        const w = v ? a[v.id] : null;
        return w === 'ja' ? 1 : w === 'nee' ? 0 : null;
      });
    } else if (q.type === 'meerkeuze') {
      const mogelijk = s.mogelijk;
      const bestaatIn = (l, m) => {
        const v = vraagIn(l);
        return !!v && v.opties.some((o) => m.ids.has(o.id));
      };
      const gekozen = (l, a) => {
        const v = vraagIn(l);
        if (!v) return null;
        const w = a[v.id];
        if (w === undefined || w === null) return null;
        return (Array.isArray(w) ? w : [w]).filter((id) => v.opties.some((o) => o.id === id));
      };
      if (q.meerdere) {
        for (const m of mogelijk) {
          // 1 = gekozen, 0 = niet gekozen; leeg als deze mogelijkheid niet in de vragenlijst van die respondent stond.
          voeg({ naam: m.naam, soort: 'getal', decimalen: 0, label: `${label} – ${m.label}`, waardelabels: { 1: 'Gekozen', 0: 'Niet gekozen' }, meetniveau: 'NOMINAL' }, (l, a) => {
            const g = gekozen(l, a);
            if (g === null || !bestaatIn(l, m)) return null;
            return g.some((id) => m.ids.has(id)) ? 1 : 0;
          });
        }
      } else {
        voeg({ naam, soort: 'getal', decimalen: 0, label, waardelabels: Object.fromEntries(mogelijk.map((m, k) => [k + 1, m.label])), meetniveau: 'NOMINAL' }, (l, a) => {
          const g = gekozen(l, a);
          if (!g || g.length !== 1) return null;
          return mogelijk.findIndex((m) => m.ids.has(g[0])) + 1 || null;
        });
      }
    } else {
      voeg({ naam, soort: 'tekst', breedte: 1, label }, (l, a) => {
        const v = vraagIn(l);
        const w = v ? a[v.id] : null;
        return typeof w === 'string' ? w : '';
      });
    }
  }

  // Themascores per respondent (dezelfde regel als op het tabblad Analyse).
  for (const t of model.themas) {
    if (!namen.thema.has(t.id)) continue;
    voeg({ naam: namen.thema.get(t.id), soort: 'getal', decimalen: 2, label: `Themascore ${t.naam} (gemiddelde van de schaalvragen, 1–5)`, meetniveau: 'SCALE' }, (l, a) => {
      const vragen = l.vragen.filter((q) => q.type === 'schaal' && q.thema_id === t.id);
      if (!vragen.length) return null;
      const s = schaalScore(vragen, a);
      return s === null ? null : Math.round(s * 100) / 100;
    });
  }

  const rijen = [];
  for (const l of model.lijsten) {
    const inz = data.inzendingen.filter((i) => i.vragenlijst_id === l.id);
    inz.forEach((i, n) => {
      const a = i.antwoorden && typeof i.antwoorden === 'object' ? i.antwoorden : {};
      rijen.push(kolommen.map((f) => f(l, a, n, i)));
    });
  }
  // Breedte van tekstkolommen: het langste antwoord.
  variabelen.forEach((v, k) => {
    if (v.soort === 'tekst') v.breedte = Math.max(v.breedte || 1, ...rijen.map((r) => String(r[k] ?? '').length));
  });
  return { variabelen, rijen };
}

/** Zip-bestand met het gegevensbestand (.csv), de SPSS-syntax (.sps) en een leesmij. */
export function spssPakket(data) {
  const { variabelen, rijen } = spssGegevens(data);
  const basis = `${slug(data.onderzoek.bedrijfsnaam)}-${data.export?.datum || 'gegevens'}`;
  const csvNaam = `${basis}-gegevens.csv`;
  const csv = `${[variabelen.map((v) => v.naam), ...rijen].map((r) => r.map(spssCel).join(';')).join('\r\n')}\r\n`;
  const syntax = maakSpssSyntax({ databestand: csvNaam, variabelen, titel: `${data.onderzoek.titel} – ${data.onderzoek.bedrijfsnaam}` });
  const leesmij = [
    `SPSS-pakket van het onderzoek "${data.onderzoek.titel}" (${data.onderzoek.bedrijfsnaam})`,
    `Gemaakt op ${data.export?.datum || ''} met de Onderzoeksomgeving.`,
    '',
    'Wat zit erin?',
    `- ${csvNaam}: de gegevens, één rij per respondent (${rijen.length} rijen, ${variabelen.length} variabelen).`,
    `- ${basis}-syntax.sps: opdrachten voor SPSS (of het gratis PSPP) die de gegevens inlezen en alle labels instellen.`,
    '',
    'Zo gebruik je het:',
    '1. Pak dit zip-bestand uit, zodat beide bestanden in dezelfde map staan.',
    '2. Open het bestand dat eindigt op -syntax.sps in SPSS.',
    '3. Kies Run > All (Uitvoeren > Alles). De gegevens verschijnen met namen en labels.',
    '4. Bewaar ze als SPSS-bestand (.sav) via File > Save As.',
    '',
    'Goed om te weten:',
    '- Alle vragenlijsten staan onder elkaar; de variabelen "vragenlijst" en "meetmoment" geven aan bij welke meting een rij hoort.',
    '- Dezelfde vraag op verschillende meetmomenten staat in dezelfde kolom. Een vraag die in een vragenlijst niet voorkomt, is daar leeg.',
    '- Bij meerkeuzevragen blijft een antwoordmogelijkheid in dezelfde kolom, ook als die later is hernoemd (het label noemt dan beide namen). Kwam een mogelijkheid in een vragenlijst niet voor, dan is die kolom daar leeg.',
    '- De vragenlijsten zijn anoniem: je kunt meetmomenten vergelijken als groepen, maar niet per persoon koppelen.',
    '- Bij schaalvragen en cijfervragen is 99 "weet niet / n.v.t."; die waarde telt SPSS niet mee in gemiddelden.',
    '- Achtergrondvragen heten naar hun kenmerk (bijvoorbeeld afdeling of leeftijd). Bij een cijfervraag van 0 tot 10 (aanbevelen) staat de eNPS-groep in een eigen variabele die eindigt op _enps: 1 = criticaster (0–6), 2 = passief (7–8), 3 = promotor (9–10).',
    '- Een cijfervraag telt niet mee in de themascores.',
    '- De variabelen thema01, thema02 … zijn de gemiddelde score per thema per respondent (alleen als minstens de helft van de vragen is beantwoord).',
    '- Dit bestand bevat losse antwoorden, ook van kleine groepen. Bewaar het veilig en deel het niet zomaar.',
    '',
  ].join('\r\n');
  return {
    naam: `${basis}-spss.zip`,
    inhoud: maakZip([
      { naam: 'LEESMIJ.txt', inhoud: new TextEncoder().encode(`﻿${leesmij}`) },
      { naam: csvNaam, inhoud: new TextEncoder().encode(csv) },
      { naam: `${basis}-syntax.sps`, inhoud: new TextEncoder().encode(syntax) },
    ]),
  };
}

// ---------- Word ----------

/** Eén stuk als Word-bestand. */
export function stukAlsDocx(stuk, onderzoek) {
  return maakDocx({ titel: stuk.titel || 'Zonder titel', markdown: stuk.inhoud || '', voettekst: `${onderzoek.titel} – ${onderzoek.bedrijfsnaam}` });
}

/** Alle stukken als Word-bestanden in één zip. */
export function stukkenAlsZip(data) {
  const gebruikt = new Set();
  const bestanden = data.stukken.map((s, i) => {
    let naam = `${String(i + 1).padStart(2, '0')}-${slug(s.titel || 'stuk')}.docx`;
    while (gebruikt.has(naam)) naam = naam.replace(/\.docx$/, '-2.docx');
    gebruikt.add(naam);
    return { naam, inhoud: stukAlsDocx(s, data.onderzoek) };
  });
  return { naam: `${slug(data.onderzoek.bedrijfsnaam)}-stukken-word.zip`, inhoud: maakZip(bestanden) };
}

// ---------- Agenda ----------

/** Afspraken voor de agenda: meetmomenten met een datum en acties met een datum die nog niet klaar zijn. */
export function agendaAfspraken(data) {
  const o = data.onderzoek;
  const uit = [];
  for (const m of data.meetmomenten) {
    if (m.datum) uit.push({ titel: `Meetmoment ${m.naam} – ${o.titel}`, datum: m.datum, omschrijving: [m.omschrijving, `Onderzoek: ${o.titel} (${o.bedrijfsnaam})`].filter(Boolean).join('\n'), uid: `meetmoment-${m.id}-onderzoek-${o.id}@onderzoeksomgeving` });
  }
  for (const a of data.acties) {
    if (a.datum && a.status !== 'klaar') uit.push({ titel: `${a.titel} – ${o.titel}`, datum: a.datum, omschrijving: [a.notitie, `Actie uit het onderzoek: ${o.titel} (${o.bedrijfsnaam})`].filter(Boolean).join('\n'), uid: `actie-${a.id}-onderzoek-${o.id}@onderzoeksomgeving` });
  }
  return uit;
}

export function agendaBestand(data, tijdstempel) {
  return maakIcs(agendaAfspraken(data), { naam: `${data.onderzoek.titel} – ${data.onderzoek.bedrijfsnaam}`, tijdstempel });
}
