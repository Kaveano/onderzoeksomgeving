// Rekenmodel voor de Analyse en de rapporten (zonder DOM, dus ook te testen in Node).
// Zet de export (GET .../export/data) om in vragenlijsten met vragen en antwoorden per respondent,
// en berekent scores per respondent:
// - thema- of meetpuntscore: het gemiddelde van de geldige antwoorden (1 tot 5) op de schaalvragen van
//   dat thema of meetpunt in de vragenlijst, alleen als minstens de helft van die vragen is beantwoord;
// - vraagscore: het antwoord zelf (1 tot 5); bij een ja/nee-vraag telt ja als 1 en nee als 0.

/** Zet de export om in een handzame opbouw: per vragenlijst de vragen en de antwoorden per respondent. */
export function bouwModel(data) {
  const lijsten = new Map();
  for (const l of data.vragenlijsten || []) {
    lijsten.set(l.id, { id: l.id, titel: l.titel, meetmoment_id: l.meetmoment_id || null, vragen: [], inz: [] });
  }
  for (const q of data.vragen || []) {
    const l = lijsten.get(q.vragenlijst_id);
    if (!l) continue;
    let opties = [];
    if (q.type === 'meerkeuze') {
      try {
        opties = typeof q.opties === 'string' ? JSON.parse(q.opties || '[]') : q.opties || [];
      } catch {
        opties = [];
      }
      if (!Array.isArray(opties)) opties = [];
    }
    l.vragen.push({
      id: q.id,
      stam: q.bron_vraag_id || q.id,
      thema_id: q.thema_id,
      meetpunt_id: q.meetpunt_id || null,
      type: q.type,
      tekst: q.tekst,
      opties,
      meerdere: !!q.meerdere_antwoorden,
      uitsplitsen: !!q.uitsplitsen,
    });
  }
  for (const i of data.inzendingen || []) {
    const l = lijsten.get(i.vragenlijst_id);
    if (l && i.antwoorden && typeof i.antwoorden === 'object') l.inz.push(i.antwoorden);
  }
  return {
    themas: (data.themas || []).map((t) => ({ id: t.id, naam: t.naam })),
    // Meetpunten in de volgorde van de thema's (de export geeft ze op hun eigen volgorde).
    meetpunten: (data.themas || []).flatMap((t) => (data.meetpunten || [])
      .filter((m) => m.thema_id === t.id)
      .map((m) => ({ id: m.id, naam: m.naam, thema_id: m.thema_id }))),
    meetmomenten: (data.meetmomenten || []).map((m) => ({ id: m.id, naam: m.naam })),
    lijsten: [...lijsten.values()],
  };
}

export function schaalWaarde(a) {
  return Number.isInteger(a) && a >= 1 && a <= 5 ? a : null;
}

/** Vraag met precies één antwoord uit een vaste lijst: ja/nee of meerkeuze met één antwoord. */
export const isKeuzevraag = (q) => q.type === 'janee' || (q.type === 'meerkeuze' && !q.meerdere);

/**
 * De vragen achter een variabele in één vragenlijst.
 * sleutel: 't:<thema-id>', 'm:<meetpunt-id>' of 'v:<stamvraag-id>'.
 */
export function vragenVan(lijst, sleutel) {
  const [soort, idTekst] = String(sleutel).split(':');
  const id = Number(idTekst);
  if (soort === 't') return lijst.vragen.filter((q) => q.type === 'schaal' && q.thema_id === id);
  if (soort === 'm') return lijst.vragen.filter((q) => q.type === 'schaal' && q.meetpunt_id === id);
  return lijst.vragen.filter((q) => q.stam === id && (q.type === 'schaal' || q.type === 'janee')).slice(0, 1);
}

/** Gemiddelde van de geldige schaalantwoorden, alleen als minstens de helft van de vragen is beantwoord. */
export function schaalScore(vragen, antwoorden) {
  let som = 0;
  let n = 0;
  for (const q of vragen) {
    const x = schaalWaarde(antwoorden[q.id]);
    if (x !== null) {
      som += x;
      n++;
    }
  }
  return n > 0 && n * 2 >= vragen.length ? som / n : null;
}

/** Eén waarde per respondent van de vragenlijst (null = geen geldige score). null als de variabele hier niet bestaat. */
export function waardenVan(lijst, sleutel) {
  const vragen = vragenVan(lijst, sleutel);
  if (!vragen.length) return null;
  if (vragen[0].type === 'janee') {
    const id = vragen[0].id;
    return lijst.inz.map((a) => (a[id] === 'ja' ? 1 : a[id] === 'nee' ? 0 : null));
  }
  return lijst.inz.map((a) => schaalScore(vragen, a));
}
