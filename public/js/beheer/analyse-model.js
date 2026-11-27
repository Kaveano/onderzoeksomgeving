// Rekenmodel voor de Analyse en de rapporten (zonder DOM, dus ook te testen in Node).
// Zet de export (GET .../export/data) om in vragenlijsten met vragen en antwoorden per respondent,
// en berekent scores per respondent:
// - thema- of meetpuntscore: het gemiddelde van de geldige antwoorden (1 tot 5) op de schaalvragen van
//   dat thema of meetpunt in de vragenlijst, alleen als minstens de helft van die vragen is beantwoord;
// - vraagscore: het antwoord zelf (1 tot 5); bij een ja/nee-vraag telt ja als 1 en nee als 0; bij een cijfervraag het
//   cijfer zelf (0 tot 10 of 1 tot 10, het bereik uit data.lijsten.cijferschalen).
// Een cijfervraag telt nooit mee in een thema- of meetpuntscore (t: en m: zijn alleen schaalvragen).

/** Zet de export om in een handzame opbouw: per vragenlijst de vragen en de antwoorden per respondent. */
export function bouwModel(data) {
  const cijferschalen = data.lijsten?.cijferschalen || {};
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
      schaal_soort: q.schaal_soort || 'eens',
      weet_niet: !!q.weet_niet,
      kenmerk: q.kenmerk || '',
      // Bereik van een cijfervraag; zonder cijferschalen in de export blijft het leeg (dan telt geen enkel cijfer).
      bereik: q.type === 'cijfer' ? cijferschalen[q.schaal_soort] || cijferschalen.rapport || null : null,
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

/** Het cijfer op een cijfervraag (geheel getal binnen het bereik van de vraag), of null. */
export function cijferWaarde(q, a) {
  const b = q.bereik;
  return b && Number.isInteger(a) && a >= b.min && a <= b.max ? a : null;
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
  return lijst.vragen.filter((q) => q.stam === id && (q.type === 'schaal' || q.type === 'janee' || q.type === 'cijfer')).slice(0, 1);
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

/**
 * Scores per respondent (zoals schaalScore) plus het aantal weggevallen respondenten: wie minstens één van
 * deze vragen geldig beantwoordde, maar minder dan de helft, en dus geen score krijgt. Het dashboard telt die
 * antwoorden wel mee. Een getal op basis van deze scores mag alleen naast het dashboard staan als er 0 of
 * minstens 5 respondenten zijn weggevallen; anders zijn hun antwoorden terug te rekenen (BOUWPLAN B7).
 * @returns {{ scores: (number|null)[], weggevallen: number }}
 */
export function schaalScoreTelling(vragen, inz) {
  const scores = [];
  let weggevallen = 0;
  for (const antwoorden of inz) {
    const score = schaalScore(vragen, antwoorden);
    scores.push(score);
    if (score === null && vragen.some((q) => schaalWaarde(antwoorden[q.id]) !== null)) weggevallen++;
  }
  return { scores, weggevallen };
}

/** Eén waarde per respondent van de vragenlijst (null = geen geldige score). null als de variabele hier niet bestaat. */
export function waardenVan(lijst, sleutel) {
  const vragen = vragenVan(lijst, sleutel);
  if (!vragen.length) return null;
  if (vragen[0].type === 'janee') {
    const id = vragen[0].id;
    return lijst.inz.map((a) => (a[id] === 'ja' ? 1 : a[id] === 'nee' ? 0 : null));
  }
  if (vragen[0].type === 'cijfer') {
    const q = vragen[0];
    return lijst.inz.map((a) => cijferWaarde(q, a[q.id]));
  }
  return lijst.inz.map((a) => schaalScore(vragen, a));
}

/**
 * Vragen om groepen mee te vormen en te vergelijken: keuzevragen (ja/nee of meerkeuze met één antwoord) met
 * uitsplitsen aan (BOUWPLAN B11: een kenmerk zonder uitsplitsen, zoals bij vertrekonderzoek, vormt geen groepen).
 * Eerst die met een achtergrondkenmerk, daarna de andere, elk in de volgorde van de vragenlijst.
 */
export function groepeerVragen(lijst) {
  const kandidaten = lijst.vragen.filter((q) => isKeuzevraag(q) && q.uitsplitsen);
  return [...kandidaten.filter((q) => q.kenmerk), ...kandidaten.filter((q) => !q.kenmerk)];
}
