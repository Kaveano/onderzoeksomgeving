// Exportbestanden maken in de browser (CSV voor Excel en een volledige JSON-kopie).
// De gegevens komen van GET /api/beheer/onderzoeken/<id>/export/data, of (in de schermen) van gegevens.js, dat
// dezelfde inhoud geeft plus het id van elke inzending.
// De functies hieronder gebruiken geen DOM (behalve bewaar()), zodat ze ook te testen zijn.

const WEET_NIET = 'weet_niet';

/** Veilige bestandsnaam. */
export function slug(tekst) {
  return (
    String(tekst || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'onderzoek'
  );
}

/**
 * Eén CSV-cel. Puntkomma als scheidingsteken (Nederlandse Excel), getallen met komma.
 * Tekst die met = + - @ begint krijgt een apostrof, zodat Excel er geen formule van maakt.
 */
export function csvCel(waarde) {
  if (waarde === null || waarde === undefined) return '';
  if (typeof waarde === 'number') return Number.isFinite(waarde) ? String(waarde).replace('.', ',') : '';
  let t = String(waarde);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  if (/[";\r\n]/.test(t)) t = `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** CSV-bestand met BOM, zodat Excel de tekens (é, ë) goed toont. */
export function maakCsv(rijen) {
  return '﻿' + rijen.map((r) => r.map(csvCel).join(';')).join('\r\n') + '\r\n';
}

function opties(q) {
  try {
    return typeof q.opties === 'string' ? JSON.parse(q.opties || '[]') : q.opties || [];
  } catch {
    return [];
  }
}

/** Leesbaar antwoord. Schaal: getal (breed formaat) of label (lang formaat). */
function antwoordTekst(q, a, data, { schaalAlsLabel = false } = {}) {
  if (a === undefined || a === null) return '';
  if (q.type === 'schaal') {
    if (a === WEET_NIET) return 'weet niet / n.v.t.';
    if (schaalAlsLabel) {
      const labels = data.lijsten.schalen[q.schaal_soort] || data.lijsten.schalen.eens;
      return labels[a - 1] || String(a);
    }
    return a;
  }
  if (q.type === 'cijfer') return a === WEET_NIET ? 'weet niet / n.v.t.' : a;
  if (q.type === 'meerkeuze') {
    const labels = new Map(opties(q).map((o) => [o.id, o.label]));
    return (Array.isArray(a) ? a : [a]).map((k) => labels.get(k) || '(verwijderde optie)').join(' | ');
  }
  return String(a);
}

export function bestandsnaam(data, deel, extensie) {
  return `${slug(data.onderzoek.bedrijfsnaam)}-${slug(deel)}-${data.export.datum}.${extensie}`;
}

/** Antwoorden van één vragenlijst: één regel per respondent. */
export function antwoordenVragenlijstCsv(data, vragenlijstId) {
  const themaNaam = new Map(data.themas.map((t) => [t.id, t.naam]));
  const vragen = data.vragen.filter((q) => q.vragenlijst_id === vragenlijstId);
  const inz = data.inzendingen.filter((i) => i.vragenlijst_id === vragenlijstId);
  const kop = ['Respondent', 'Datum', ...vragen.map((q) => `${themaNaam.get(q.thema_id)} – ${q.tekst}`)];
  const rijen = inz.map((i, n) => [n + 1, i.datum, ...vragen.map((q) => antwoordTekst(q, i.antwoorden[q.id], data))]);
  return maakCsv([kop, ...rijen]);
}

/** Alle antwoorden van alle vragenlijsten onder elkaar: één regel per antwoord (handig voor draaitabellen). */
export function alleAntwoordenCsv(data) {
  const themaNaam = new Map(data.themas.map((t) => [t.id, t.naam]));
  const meetpuntNaam = new Map(data.meetpunten.map((m) => [m.id, m.naam]));
  const mmNaam = new Map(data.meetmomenten.map((m) => [m.id, m.naam]));
  // De laatste kolom is het cijfer bij een cijfervraag (0 tot 10 of 1 tot 10); dat telt niet mee in Score (1-5).
  const kop = ['Vragenlijst', 'Meetmoment', 'Respondent', 'Datum', 'Thema', 'Meetpunt', 'Vraag', 'Vraagtype', 'Antwoord', 'Score (1-5)', 'Cijfer (0-10)'];
  const rijen = [];
  for (const vl of data.vragenlijsten) {
    const vragen = data.vragen.filter((q) => q.vragenlijst_id === vl.id);
    const inz = data.inzendingen.filter((i) => i.vragenlijst_id === vl.id);
    inz.forEach((i, n) => {
      for (const q of vragen) {
        const a = i.antwoorden[q.id];
        if (a === undefined) continue;
        rijen.push([
          vl.titel,
          mmNaam.get(vl.meetmoment_id) || '',
          n + 1,
          i.datum,
          themaNaam.get(q.thema_id),
          meetpuntNaam.get(q.meetpunt_id) || '',
          q.tekst,
          data.lijsten.vraagtypen[q.type] || q.type,
          antwoordTekst(q, a, data, { schaalAlsLabel: true }),
          q.type === 'schaal' && Number.isInteger(a) ? a : null,
          q.type === 'cijfer' && Number.isInteger(a) ? a : null,
        ]);
      }
    });
  }
  return maakCsv([kop, ...rijen]);
}

export function eigenInvoerCsv(data) {
  const themaNaam = new Map(data.themas.map((t) => [t.id, t.naam]));
  const meetpuntNaam = new Map(data.meetpunten.map((m) => [m.id, m.naam]));
  const mmNaam = new Map(data.meetmomenten.map((m) => [m.id, m.naam]));
  const kop = ['Datum', 'Soort', 'Thema', 'Meetpunt', 'Meetmoment', 'Titel', 'Waarde', 'Eenheid', 'Tekst'];
  const rijen = data.eigen_invoer.map((e) => [
    e.datum,
    data.lijsten.invoersoorten[e.soort] || e.soort,
    themaNaam.get(e.thema_id),
    meetpuntNaam.get(e.meetpunt_id) || '',
    mmNaam.get(e.meetmoment_id) || '',
    e.titel,
    e.waarde,
    e.eenheid,
    e.tekst,
  ]);
  return maakCsv([kop, ...rijen]);
}

/** JSON-tekst uit de database als object; anders de tekst zelf (zoals bij rapporten). */
function alsObject(tekst) {
  if (typeof tekst !== 'string') return tekst;
  try {
    return JSON.parse(tekst);
  } catch {
    return tekst;
  }
}

/**
 * Coderingen en citaten verwijzen naar een inzending via het willekeurige id. In de volledige kopie staat in plaats
 * daarvan de vragenlijst en het respondentnummer (zoals bij de inzendingen hieronder), zodat het bestand op zichzelf
 * te lezen is. Zonder id's in de gegevens (oude export) blijven die velden leeg.
 */
function respondentVerwijzing(data) {
  const per = new Map();
  const teller = new Map();
  for (const i of data.inzendingen || []) {
    const n = (teller.get(i.vragenlijst_id) || 0) + 1;
    teller.set(i.vragenlijst_id, n);
    if (i.id !== undefined) per.set(i.id, { vragenlijst_id: i.vragenlijst_id, respondent: n });
  }
  return ({ inzending_id: id, ...rest }) => {
    if (id === null || id === undefined) return { ...rest, vragenlijst_id: null, respondent: null };
    const v = per.get(id) || { vragenlijst_id: null, respondent: null };
    return { ...rest, vragenlijst_id: v.vragenlijst_id, respondent: v.respondent };
  };
}

/** Volledige, overzichtelijk geordende kopie van het onderzoek (JSON-tekst). */
export function volledigeJson(data) {
  const vlag = (x) => !!x;
  const verwijs = respondentVerwijzing(data);
  const uit = {
    export: {
      ...data.export,
      toelichting:
        'Volledige export van één onderzoek. Antwoorden zijn anoniem; schaalantwoorden zijn 1 t/m 5 of "weet_niet". ' +
        'Meerkeuze-antwoorden verwijzen naar de id van een antwoordmogelijkheid (zie "opties" bij de vraag).',
    },
    schalen: data.lijsten.schalen,
    onderzoek: data.onderzoek,
    themas: data.themas.map((t) => ({ ...t, meetpunten: data.meetpunten.filter((m) => m.thema_id === t.id) })),
    meetmomenten: data.meetmomenten,
    vragenlijsten: data.vragenlijsten.map((l) => ({
      ...l,
      vragen: data.vragen.filter((q) => q.vragenlijst_id === l.id).map((q) => ({
        ...q,
        opties: opties(q),
        meerdere_antwoorden: vlag(q.meerdere_antwoorden),
        verplicht: vlag(q.verplicht),
        weet_niet: vlag(q.weet_niet),
        uitsplitsen: vlag(q.uitsplitsen),
      })),
      inzendingen: data.inzendingen
        .filter((i) => i.vragenlijst_id === l.id)
        .map((i, n) => ({ respondent: n + 1, datum: i.datum, antwoorden: i.antwoorden })),
    })),
    eigen_invoer: data.eigen_invoer,
    stukken: data.stukken,
    rapporten: (data.rapporten || []).map((r) => {
      let inhoud = r.inhoud;
      try {
        inhoud = typeof r.inhoud === 'string' ? JSON.parse(r.inhoud) : r.inhoud;
      } catch { /* laat de tekst staan zoals hij is */ }
      return { ...r, inhoud };
    }),
    acties: data.acties,
    datasets: data.datasets || [],
    // Uitbreidingen (BOUWPLAN §3.2); leeg zolang die onderdelen niet gebruikt zijn.
    hr_instellingen: data.hr_instellingen || {},
    personeelscijfers: data.personeelscijfers || [],
    werkbank: {
      definities: (data.werkbank_definities || []).map((d) => ({ ...d, definitie: alsObject(d.definitie) })),
      analyses: (data.werkbank_analyses || []).map((a) => ({ ...a, spec: alsObject(a.spec) })),
    },
    codering: {
      codes: data.codes || [],
      coderingen: (data.coderingen || []).map(verwijs),
      citaten: (data.citaten || []).map(verwijs),
    },
    bronnen_gekoppeld: data.bronnen_gekoppeld || [],
  };
  return JSON.stringify(uit, null, 2);
}

/** Laat de browser een bestand opslaan. */
export function bewaar(inhoud, naam, type) {
  const blob = new Blob([inhoud], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = naam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
