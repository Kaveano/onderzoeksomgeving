// Werkbank: frequenties, beschrijvende statistiek en gemiddelden per groep (D2 §5.2). Zuivere module, geen DOM.

import { REDEN, REDEN_LABELS, isVerdeling, isIndeling, isAchtergrond, isGetal } from '../dataset.js';
import { verbergMet, ordeStatistieken, tweeWaardenRegel, weggevallenRegel, groepBuren, selectieFout } from '../privacy-selectie.js';
import { tKwantiel, momenten } from '../../statistiek.js';
import { tabel, cel, tekstCel, verborgenCel, aantalCel, voeg, melding, sluitAf } from '../uitvoer.js';
import {
  P_TE_VEEL_WAARDEN, P_GROEP_KLEIN, P_OOK_NIET, P_SAMENGEVOEGD, P_WEGGEVALLEN, P_TWEE_WAARDEN, MINMAX_NOOT, UITLEG_FREQUENTIES, g, apaZinnen,
  P_DASHBOARD_VERBORGEN, P_INDELING_PER_GROEP, P_VERDELING_PER_GROEP, P_SELECTIE_GROEPEN,
} from '../uitvoer-tekst.js';
import {
  geldigMasker, inSelectie, iedereen, tel, groepVanRijen, kiesGroepen, selectieControle, selectieMelding, indelingAlsGetalFout,
  getalFout, begin, weiger, overlapFout, ordinaalMelding, waardenIn, variabelenUit, buurReden, verborgenDoorDashboard, isVastGetal,
} from './basis.js';

const MAX_WAARDEN = 50;
const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
const pct = (a, b) => (b > 0 ? (a / b) * 100 : null);

// ---------- Frequenties ----------

/**
 * Wordt de verdeling van v zonder selectie getoond zoals op het dashboard (B26)? Alleen bij een meningsvraag uit een
 * vragenlijst. Achtergrondvragen en andere indelingen, scores (thema, meetpunt, eigen score) en kolommen van een eigen
 * dataset staan niet zo op het dashboard: daar gaan aantallen van 1 tot 4 altijd weg (PR-12, B5, B7).
 */
export const isMeningsvraag = (v) => v.bron === 'vraag' && !v.groepering && !v.score;

/**
 * De rijen (categorieën en ontbrekende redenen) van een frequentietabel, met per rij een masker-functie en de reeks
 * waarin hij verborgen wordt (regel B):
 * - bij een achtergrondvraag is "Geen antwoord" een groep, zoals "Niet ingevuld" op het dashboard (maskeerVerdeling):
 *   antwoorden en ontbrekende redenen vormen één reeks (reeks 0);
 * - anders is het aantal geldige antwoorden elders te zien (n bij beschrijvende statistiek en andere analyses): de
 *   antwoorden (reeks 0) en de ontbrekende redenen (reeks 1) worden elk apart beschermd;
 * - "Niet gevraagd" (de vraag stond niet in die vragenlijst) volgt uit de grootte van de vragenlijsten: reeks 2.
 */
function verdelingRijen(ds, v) {
  const rijen = [];
  const achtergrond = isAchtergrond(v);
  if (v.labels.length) {
    for (const l of v.labels) rijen.push({ label: l.label, geldig: true, reeks: 0, past: (r) => v.reden[r] === REDEN.GELDIG && v.waarden[r] === l.code });
  } else {
    const waarden = [...new Set([...v.waarden].filter((x, r) => v.reden[r] === REDEN.GELDIG))].sort((a, b) => a - b);
    if (waarden.length > MAX_WAARDEN) return null;
    for (const w of waarden) rijen.push({ label: g(w, Number.isInteger(w) ? 0 : 2), geldig: true, reeks: 0, past: (r) => v.reden[r] === REDEN.GELDIG && v.waarden[r] === w });
  }
  // Ontbrekende redenen die in de hele bron voorkomen (zo hangt de lijst met rijen niet af van de selectie).
  for (let reden = 1; reden < REDEN_LABELS.length; reden++) {
    if (v.telling.perReden[reden] > 0) {
      const reeks = reden === REDEN.NIET_GEVRAAGD ? 2 : achtergrond ? 0 : 1;
      rijen.push({ label: REDEN_LABELS[reden], geldig: false, reeks, past: (r) => v.reden[r] === reden });
    }
  }
  return rijen;
}

/** Verbergt per reeks (zie verdelingRijen) met regel B en D; vooraf en verschillen gelden voor alle rijen. */
function verbergPerReeks(rijen, aantallen, d, { vooraf, verschillen }) {
  const verborgen = aantallen.map(() => false);
  for (const reeks of [0, 1, 2]) {
    const idx = rijen.map((x, i) => (x.reeks === reeks ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const weg = verbergMet(idx.map((i) => aantallen[i]), d, {
      vooraf: idx.map((i) => vooraf[i]),
      verschillen: verschillen.map((vs) => idx.map((i) => vs[i])),
    });
    idx.forEach((i, k) => { verborgen[i] = weg[k]; });
  }
  return verborgen;
}

/** Een meningsvraag zonder selectie (B26): niet bij minder dan d antwoorden (PR-03), en in een gestapelde bron niet
 *  als één vragenlijst 1 tot 4 antwoorden geeft (dan volgen die uit het verschil met de andere). Geeft null of de tekst. */
function meningsvraagFout(ds, v, ctx, geldig) {
  const n = tel(geldig);
  if (n > 0 && n < ctx.d) return `“${v.label}”: minder dan ${ctx.d} antwoorden. Die tonen we niet.`;
  const f = ctx.selectie ? selectieFout(ctx.selectie, geldig, ctx.d) : null;
  return f ? `“${v.label}”: ${selectieMelding(f)}` : null;
}

function telRijen(ds, rijen, masker) {
  const t = new Array(rijen.length).fill(0);
  const index = rijen.map((x) => x.past);
  for (let r = 0; r < ds.n; r++) {
    if (masker && !masker[r]) continue;
    for (let i = 0; i < index.length; i++) if (index[i](r)) { t[i]++; break; }
  }
  return t;
}

function frequentieTabel(ds, v, ctx, u) {
  const rijen = verdelingRijen(ds, v);
  if (!rijen) return [melding('waarschuwing', `“${v.label}”: ${P_TE_VEEL_WAARDEN}`)];
  const F = ctx.selectie ? ctx.selectie.F : null;
  const aantallen = telRijen(ds, rijen, F);
  const totaal = aantallen.reduce((a, b) => a + b, 0);
  if (ctx.selectie) {
    const fout = selectieFout(ctx.selectie, iedereen(ds), ctx.d);
    if (fout) return [melding('privacy', `“${v.label}”: ${selectieMelding(fout)}`)];
  }
  // B7: een score waarbij 1 tot 4 respondenten wegvielen (te weinig vragen beantwoord), toont niets.
  if (v.score && weggevallenRegel(v.reden, F || iedereen(ds), null, 1, ctx.d)[0]) return [melding('privacy', `“${v.label}”: ${P_WEGGEVALLEN}.`)];
  // B26: zonder selectie zie je bij een meningsvraag de hele verdeling (zoals op het dashboard); bij een indeling,
  // een score, een kolom van een eigen dataset, met een selectie of bij het vastleggen in een rapport gaan
  // aantallen van 1 tot 4 weg (regel B en D). De buren van een gestapelde bron (één vragenlijst) tellen mee.
  const beschermen = (!!ctx.selectie && !ctx.selectie.impliciet) || ctx.streng || !isMeningsvraag(v);
  let verborgen = aantallen.map(() => false);
  if (beschermen) {
    const verschillen = [];
    const vooraf = aantallen.map(() => false);
    for (const b of ctx.selectie?.buren || []) {
      const tN = telRijen(ds, rijen, b.masker);
      const verschil = tN.map((x, i) => Math.abs(x - aantallen[i])); // een buur kan ruimer of krapper zijn
      verschil.forEach((x, i) => { if (x > 0 && x < ctx.d) vooraf[i] = true; });
      verschillen.push(verschil);
    }
    verborgen = verbergPerReeks(rijen, aantallen, ctx.d, { vooraf, verschillen });
    // P3: binnen een selectie zijn verborgen antwoorden van een schaal- of cijfervraag terug te rekenen uit gemiddelde,
    // spreiding, scheefheid en kurtosis van die selectie (Beschrijvende statistiek). Dan geen verdeling.
    if (ctx.selectie && !ctx.selectie.impliciet && isVastGetal(v) && rijen.some((x, i) => x.geldig && verborgen[i])) {
      return [melding('privacy', P_VERDELING_PER_GROEP(v.label))];
    }
  } else {
    const fout = meningsvraagFout(ds, v, ctx, geldigMasker(ds, [v]));
    if (fout) return [melding('privacy', fout)];
  }
  const ietsWeg = verborgen.some(Boolean);
  const ontbrekendWeg = rijen.some((x, i) => !x.geldig && verborgen[i]);
  const geldigTotaal = rijen.reduce((t, x, i) => t + (x.geldig ? aantallen[i] : 0), 0);
  const metGeldigPct = !ontbrekendWeg;
  let cumulatief = 0;
  const tabelRijen = [];
  rijen.forEach((x, i) => {
    if (!x.geldig) return;
    cumulatief += aantallen[i];
    tabelRijen.push([
      tekstCel(x.label),
      aantalCel(aantallen[i], verborgen[i]),
      verborgen[i] ? verborgenCel('procent') : cel(pct(aantallen[i], totaal), 'procent'),
      ...(metGeldigPct ? [verborgen[i] ? verborgenCel('procent') : cel(pct(aantallen[i], geldigTotaal), 'procent')] : []),
      ...(ietsWeg ? [] : [cel(pct(cumulatief, geldigTotaal), 'procent')]),
    ]);
  });
  const leeg = () => (metGeldigPct ? [tekstCel('')] : []);
  tabelRijen.push([
    tekstCel('Totaal geldig', { nadruk: true }),
    ontbrekendWeg ? verborgenCel('aantal') : cel(geldigTotaal, 'aantal'),
    ontbrekendWeg ? verborgenCel('procent') : cel(pct(geldigTotaal, totaal), 'procent'),
    ...(metGeldigPct ? [cel(geldigTotaal ? 100 : null, 'procent')] : []),
    ...(ietsWeg ? [] : [tekstCel('')]),
  ]);
  rijen.forEach((x, i) => {
    if (x.geldig) return;
    tabelRijen.push([
      tekstCel(x.label),
      aantalCel(aantallen[i], verborgen[i]),
      verborgen[i] ? verborgenCel('procent') : cel(pct(aantallen[i], totaal), 'procent'),
      ...leeg(),
      ...(ietsWeg ? [] : [tekstCel('')]),
    ]);
  });
  tabelRijen.push([tekstCel('Totaal', { nadruk: true }), cel(totaal, 'aantal'), cel(totaal ? 100 : null, 'procent'), ...leeg(), ...(ietsWeg ? [] : [tekstCel('')])]);
  const kolommen = ['Waarde', 'Aantal', 'Procent', ...(metGeldigPct ? ['Geldig procent'] : []), ...(ietsWeg ? [] : ['Cumulatief procent'])];
  const voetnoten = [];
  if (ietsWeg) voetnoten.push('De kolom met het cumulatieve percentage staat er niet bij, omdat er cellen verborgen zijn.');
  if (ontbrekendWeg) voetnoten.push('Het geldig procent staat er niet bij, omdat er een verborgen ontbrekende waarde is.');
  if (!v.labels.length && rijen.some((x, i) => x.geldig && verborgen[i])) voetnoten.push('Waarden die bij minder dan 5 mensen voorkomen, zijn verborgen. Wil je meer zien, deel de variabele dan eerst in groepen in (Indelen in groepen).');
  // Het vaakst gekozen (alleen als er niets verborgen is).
  if (!ietsWeg && geldigTotaal > 0) {
    let beste = -1;
    rijen.forEach((x, i) => { if (x.geldig && (beste < 0 || aantallen[i] > aantallen[beste])) beste = i; });
    if (beste >= 0 && rijen.filter((x, i) => x.geldig && aantallen[i] === aantallen[beste]).length === 1) {
      u.duiding.zinnen.push(`Bij “${v.label}” is het vaakst gekozen: “${rijen[beste].label}” (${Math.round(pct(aantallen[beste], geldigTotaal))}%).`);
    }
  }
  const stat = { label: v.label, geldig: ontbrekendWeg ? null : geldigTotaal, ontbrekend: ontbrekendWeg ? null : totaal - geldigTotaal };
  return [
    tabel(`freq-${v.id}`, `Verdeling van “${v.label}”`, kolommen, tabelRijen, { voetnoten }),
    rijen.some((x) => x.geldig) ? { soort: 'grafiek', vorm: 'staaf', titel: `Verdeling van “${v.label}”`, reeksen: rijen.filter((x) => x.geldig).map((x) => {
      const i = rijen.indexOf(x);
      return { label: x.label, waarde: verborgen[i] ? null : pct(aantallen[i], ontbrekendWeg ? totaal : geldigTotaal) };
    }) } : null,
    { stat, totaal },
  ];
}

/**
 * Meerdere antwoorden: per antwoordmogelijkheid hoe vaak die gekozen is. Elke mogelijkheid is een aandeel van wie de
 * vraag beantwoordde (n staat erbij), dus met bescherming geldt de regel voor kruistabellen (B6, PR-07): gekozen
 * én niet gekozen moeten elk minstens d zijn (0 telt als klein), ook ten opzichte van elke buur (regel D).
 */
function setTabel(ds, v, ctx) {
  const leden = v.leden.map((id) => ds.perId.get(id)).filter(Boolean);
  const geldig = geldigMasker(ds, [v]);
  const basis = inSelectie(geldig, ctx.selectie);
  const n = tel(basis);
  if (ctx.selectie) {
    const fout = selectieFout(ctx.selectie, geldig, ctx.d);
    if (fout) return [melding('privacy', `“${v.label}”: ${selectieMelding(fout)}`)];
  }
  const gekozen = (m) => leden.map((l) => {
    let c = 0;
    for (let r = 0; r < ds.n; r++) if (m[r] && l.reden[r] === REDEN.GELDIG && l.waarden[r] === 1) c++;
    return c;
  });
  const aantallen = gekozen(basis);
  const beschermen = (!!ctx.selectie && !ctx.selectie.impliciet) || ctx.streng || !isMeningsvraag(v);
  const verborgen = aantallen.map(() => false);
  if (beschermen) {
    if (n > 0 && n < ctx.d) return [melding('privacy', `“${v.label}”: minder dan ${ctx.d} antwoorden. Die tonen we niet.`)];
    aantallen.forEach((c, i) => { if (c < ctx.d || n - c < ctx.d) verborgen[i] = true; });
    for (const b of ctx.selectie?.buren || []) {
      const m = b.masker ? inSelectie(geldig, { F: b.masker }) : geldig;
      const nN = tel(m);
      gekozen(m).forEach((x, i) => {
        const wel = Math.abs(x - aantallen[i]);
        const niet = Math.abs((nN - x) - (n - aantallen[i]));
        if ((wel > 0 && wel < ctx.d) || (niet > 0 && niet < ctx.d)) verborgen[i] = true;
      });
    }
  } else {
    const fout = meningsvraagFout(ds, v, ctx, geldig);
    if (fout) return [melding('privacy', fout)];
  }
  const som = aantallen.reduce((a, b) => a + b, 0);
  const ietsWeg = verborgen.some(Boolean);
  const rijen = leden.map((l, i) => [
    tekstCel(l.optie?.label || l.label),
    aantalCel(aantallen[i], verborgen[i]),
    verborgen[i] ? verborgenCel('procent') : cel(pct(aantallen[i], n), 'procent'),
    ...(ietsWeg ? [] : [cel(pct(aantallen[i], som), 'procent')]),
  ]);
  rijen.push([tekstCel('Respondenten die de vraag beantwoordden', { nadruk: true }), cel(n, 'aantal'), tekstCel(''), ...(ietsWeg ? [] : [tekstCel('')])]);
  return [
    tabel(`set-${v.id}`, `Meerdere antwoorden: “${v.label}”`, ['Antwoord', 'Aantal keer gekozen', '% van de respondenten', ...(ietsWeg ? [] : ['% van de antwoorden'])], rijen,
      { voetnoten: ietsWeg ? ['Het percentage van de antwoorden staat er niet bij, omdat er cellen verborgen zijn. × staat ook bij een antwoord dat bijna iedereen of bijna niemand koos: anders zou te zien zijn wat een paar mensen deden.'] : [] }),
    null,
    { stat: { label: v.label, geldig: n, ontbrekend: null }, totaal: n },
  ];
}

export function frequenties(ds, spec, ctx) {
  const titel = 'Frequenties';
  const variabelen = variabelenUit(ds, spec, 'variabelen');
  const u = begin(ds, spec, ctx, titel, `Variabelen: ${variabelen.map((x) => x.v?.label || x.id).join(', ')}`);
  const stats = [];
  let nMax = 0;
  const tabellen = [];
  for (const { v } of variabelen) {
    if (!isVerdeling(v)) {
      tabellen.push(melding('waarschuwing', `“${v.label}” is niet te gebruiken in een frequentietabel.`));
      continue;
    }
    const overlap = v.groepering ? overlapFout(ds, ctx, [v]) : null;
    if (overlap) {
      tabellen.push(melding('privacy', overlap));
      continue;
    }
    const [t, grafiek, info] = v.soort === 'set' ? setTabel(ds, v, ctx) : frequentieTabel(ds, v, ctx, u);
    tabellen.push(t, grafiek);
    if (info) {
      stats.push(info.stat);
      nMax = Math.max(nMax, info.totaal);
    }
  }
  if (!stats.length) return weiger(ds, spec, ctx, titel, tabellen.find((t) => t?.soort === 'melding')?.niveau || 'fout', tabellen.find((t) => t?.soort === 'melding')?.tekst || 'Er is niets te tonen.');
  u.gegevens.n = nMax;
  voeg(u, tabel('statistieken', 'Statistieken', ['Variabele', 'N geldig', 'N ontbrekend'],
    stats.map((s) => [tekstCel(s.label), s.geldig === null ? verborgenCel('aantal') : cel(s.geldig, 'aantal'), s.ontbrekend === null ? verborgenCel('aantal') : cel(s.ontbrekend, 'aantal')])));
  voeg(u, tabellen);
  u.duiding.zinnen.unshift(UITLEG_FREQUENTIES);
  return sluitAf(u);
}

// ---------- Beschrijvende statistiek ----------

/** Scheefheid en kurtosis zoals SPSS (G1, G2) met hun standaardfout. */
export function vorm(ruw) {
  const xs = Array.isArray(ruw) || ArrayBuffer.isView(ruw) ? Array.from(ruw).filter(eindig) : [];
  const n = xs.length;
  if (!n) return { scheef: null, seScheef: null, kurtosis: null, seKurtosis: null };
  const { m } = momenten(xs);
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of xs) {
    const d = x - m;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const uit = { scheef: null, seScheef: null, kurtosis: null, seKurtosis: null };
  if (n >= 3 && m2 > 0) {
    const g1 = m3 / m2 ** 1.5;
    uit.scheef = (g1 * Math.sqrt(n * (n - 1))) / (n - 2);
    uit.seScheef = Math.sqrt((6 * n * (n - 1)) / ((n - 2) * (n + 1) * (n + 3)));
  }
  if (n >= 4 && m2 > 0) {
    const g2 = m4 / (m2 * m2) - 3;
    uit.kurtosis = (((n + 1) * g2 + 6) * (n - 1)) / ((n - 2) * (n - 3));
    uit.seKurtosis = 2 * Math.sqrt((6 * n * (n - 1)) / ((n - 2) * (n + 1) * (n + 3))) * Math.sqrt((n * n - 1) / ((n - 3) * (n + 5)));
  }
  for (const k of Object.keys(uit)) if (!eindig(uit[k])) uit[k] = null;
  return uit;
}

/** Gemiddelde, sd, se en 95%-interval van een lijst getallen. */
export function beschrijving(ruw) {
  const xs = Array.isArray(ruw) || ArrayBuffer.isView(ruw) ? Array.from(ruw).filter(eindig) : [];
  const { n, m, ss } = momenten(xs);
  if (!n) return null;
  const sd = n > 1 ? Math.sqrt(ss / (n - 1)) : null;
  const se = sd !== null ? sd / Math.sqrt(n) : null;
  const t = n > 1 ? tKwantiel(0.975, n - 1) : null;
  return { n, gemiddelde: m, sd, se, ciLaag: se !== null && t !== null ? m - t * se : null, ciHoog: se !== null && t !== null ? m + t * se : null };
}

export function beschrijvend(ds, spec, ctx) {
  const titel = 'Beschrijvende statistiek';
  const variabelen = variabelenUit(ds, spec, 'variabelen');
  const u = begin(ds, spec, ctx, titel, `Variabelen: ${variabelen.map((x) => x.v?.label || x.id).join(', ')}`);
  const rijen = [];
  const meldingen = [];
  let nMax = 0;
  let metMinMax = false;
  for (const { v } of variabelen) {
    const fout = getalFout(v);
    if (fout) { meldingen.push(melding('waarschuwing', fout)); continue; }
    const geldig = geldigMasker(ds, [v]);
    const basis = inSelectie(geldig, ctx.selectie);
    // Een rij zonder getallen: de tekst beslaat de rest van de rij (breed).
    const teWeinig = (tekst) => rijen.push([tekstCel(v.label), tekstCel(tekst, { breed: true })]);
    const sel = selectieControle(ctx, geldig);
    if (sel) { teWeinig('niet getoond (selectie)'); meldingen.push(melding('privacy', `“${v.label}”: ${sel}`)); continue; }
    // B7: wie een score kreeg en wie wegviel omdat te weinig vragen beantwoord waren.
    if (v.score && weggevallenRegel(v.reden, ctx.selectie ? ctx.selectie.F : iedereen(ds), null, 1, ctx.d)[0]) {
      teWeinig(P_WEGGEVALLEN);
      meldingen.push(melding('privacy', `“${v.label}”: ${P_WEGGEVALLEN}.`));
      continue;
    }
    const xs = waardenIn(v, basis);
    if (xs.length < ctx.d) { teWeinig(`Te weinig (minder dan ${ctx.d})`); continue; }
    const alsGetal = indelingAlsGetalFout(v, basis, ctx.d, ctx.selectie?.F);
    if (alsGetal) { teWeinig('niet getoond'); meldingen.push(melding('privacy', alsGetal)); continue; }
    if (tweeWaardenRegel(v.waarden, basis, null, 1, ctx.d, ctx.selectie)?.[0]) { teWeinig('niet getoond'); meldingen.push(melding('privacy', P_TWEE_WAARDEN(v.label))); continue; }
    const b = beschrijving(xs);
    const o = ordeStatistieken(xs.slice().sort((p, q) => p - q), ctx.d);
    const f = vorm(xs);
    if (o.minimum !== null) metMinMax = true;
    nMax = Math.max(nMax, b.n);
    rijen.push([
      tekstCel(v.label), cel(b.n, 'aantal'), cel(b.gemiddelde, 'gem'), cel(b.sd, 'gem'), cel(b.se, 'gem'),
      tekstCel(eindig(b.ciLaag) ? `${g(b.ciLaag)} tot ${g(b.ciHoog)}` : '–'),
      cel(o.mediaan, 'gem'), cel(o.minimum, 'gem'), cel(o.maximum, 'gem'),
      tekstCel(f.scheef === null ? '–' : `${g(f.scheef)} (${g(f.seScheef)})`),
      tekstCel(f.kurtosis === null ? '–' : `${g(f.kurtosis)} (${g(f.seKurtosis)})`),
    ]);
    if (f.scheef !== null && Math.abs(f.scheef) > 1) {
      u.duiding.zinnen.push(`De scores van “${v.label}” zijn duidelijk scheef verdeeld${Math.abs(f.scheef / f.seScheef) > 2 ? ', meer dan je door toeval zou verwachten' : ''}.`);
    } else if (f.scheef !== null && Math.abs(f.scheef / f.seScheef) > 2) {
      u.duiding.zinnen.push(`De scores van “${v.label}” zijn iets scheef verdeeld, meer dan je door toeval zou verwachten.`);
    }
    u._eerste = u._eerste || { v, b };
  }
  if (!rijen.some((r) => r.length > 2)) {
    const m = meldingen[0];
    return weiger(ds, spec, ctx, titel, m?.niveau || 'fout', m?.tekst || (rijen.length ? `Te weinig respondenten: er zijn er per variabele minstens ${ctx.d} nodig.` : 'Er is niets te tonen.'));
  }
  u.gegevens.n = nMax;
  voeg(u, tabel('beschrijvend', 'Beschrijvende statistiek',
    ['Variabele', 'N', 'Gemiddelde', 'SD', 'SE gemiddelde', '95%-BI gemiddelde', 'Mediaan', 'Minimum*', 'Maximum*', 'Scheefheid (SE)', 'Kurtosis (SE)'],
    rijen,
    { voetnoten: [MINMAX_NOOT, metMinMax ? null : `Minimum, maximum en mediaan staan er alleen bij vanaf ${2 * ctx.d - 1} respondenten.`] }));
  voeg(u, meldingen, ordinaalMelding(variabelen.map((x) => x.v).filter(Boolean)));
  u.duiding.zinnen.unshift('Het gemiddelde is de gewone gemiddelde score; de SD (standaarddeviatie) laat zien hoe ver de scores uit elkaar liggen. Het 95%-interval geeft aan waar het echte gemiddelde waarschijnlijk ligt. Scheefheid zegt of de scores naar één kant overhellen; kurtosis of ze erg in het midden of juist in de staarten zitten.');
  if (u._eerste) {
    const { v, b } = u._eerste;
    u.apa = apaZinnen((f) => `“${v.label}” had een gemiddelde van *M* = ${f.g(b.gemiddelde)} (*SD* = ${f.g(b.sd)}; *n* = ${f.n(b.n)}).`);
  }
  delete u._eerste;
  return sluitAf(u);
}

// ---------- Gemiddelden per groep ----------

/**
 * Welke groepen van indeling w bij variabele v meedoen (pergroep, t-toets, ANOVA, regressie en de controle van een
 * selectie), met de regels 'weglaten' (kleine groepen), D (selectie), B6 (twee waarden; bij een indeling die als getal
 * meedoet: alle waarden, P3), B7 (weggevallen respondenten) en het verbergpatroon van het dashboard (P2).
 * @returns {{ groep, ng, geldig, basisAlles, basis, aantallen, zonderGroep, keuze, redenen } | { fout, niveau }}
 */
export function groepKeuze(ds, ctx, v, w) {
  const groep = groepVanRijen(ds, w);
  const ng = w.beschermd.groepen.length;
  const geldig = geldigMasker(ds, [v]);
  const basisAlles = new Uint8Array(ds.n);
  for (let r = 0; r < ds.n; r++) basisAlles[r] = geldig[r] && groep[r] >= 0 ? 1 : 0;
  const basis = inSelectie(basisAlles, ctx.selectie);
  const aantallen = new Array(ng).fill(0);
  let zonderGroep = 0;
  for (let r = 0; r < ds.n; r++) {
    if (!geldig[r] || (ctx.selectie && !ctx.selectie.F[r])) continue;
    if (groep[r] >= 0) aantallen[groep[r]]++;
    else zonderGroep++;
  }
  const sel = selectieControle(ctx, geldig);
  if (sel) return { fout: sel, niveau: 'privacy' };
  const uitgesloten = new Array(ng).fill(false);
  const redenen = { selectie: [], tweeWaarden: [], weggevallen: [], dashboard: [] };
  groepBuren(ctx.selectie, basisAlles, groep, ng, ctx.d).forEach((x, i) => { if (x) { uitgesloten[i] = true; redenen.selectie.push(i); } });
  // B6: twee waarden; een indeling als getal (P3): elke rij van de kruistabel waarde × groep zonder verborgen cel.
  const twee = tweeWaardenRegel(v.waarden, basis, groep, ng, ctx.d, ctx.selectie, v.groepering ? Infinity : 2);
  if (twee) twee.forEach((x, i) => { if (x && aantallen[i] > 0 && !uitgesloten[i]) { uitgesloten[i] = true; redenen.tweeWaarden.push(i); } });
  if (v.score) {
    const inGroep = new Uint8Array(ds.n);
    for (let r = 0; r < ds.n; r++) inGroep[r] = groep[r] >= 0 && (!ctx.selectie || ctx.selectie.F[r]) ? 1 : 0;
    weggevallenRegel(v.reden, inGroep, groep, ng, ctx.d).forEach((x, i) => { if (x && aantallen[i] > 0 && !uitgesloten[i]) { uitgesloten[i] = true; redenen.weggevallen.push(i); } });
  }
  // P2: wat het dashboard bij deze vraag of dit thema (of de vragen waaruit een score bestaat) in een groep verbergt,
  // verbergt de werkbank ook. Kleine groepen houden hun eigen reden ("minder dan 5").
  const dash = verborgenDoorDashboard(ds, ctx, v, w);
  if (dash) dash.forEach((x, i) => { if (x && aantallen[i] >= ctx.d && !uitgesloten[i]) { uitgesloten[i] = true; redenen.dashboard.push(i); } });
  const keuze = kiesGroepen(aantallen, { extraVerborgen: zonderGroep, uitgesloten, d: ctx.d });
  return { groep, ng, geldig, basisAlles, basis, aantallen, zonderGroep, keuze, redenen };
}

/**
 * Groepen voor een getal-variabele v en indeling w (pergroep, t-toets, ANOVA): wie meedoet (groepKeuze), met de
 * meldingen waarom groepen niet meedoen.
 * @returns {{ basis, groep, ng, mee, meldingen, waarden: number[][] } | { fout, niveau }}
 */
export function groepenVoor(ds, ctx, v, w) {
  const k = groepKeuze(ds, ctx, v, w);
  if (k.fout) return k;
  const { groep, ng, basis, keuze, redenen } = k;
  const naam = (i) => w.beschermd.groepen[i].label;
  const meldingen = [];
  const samengevoegd = w.beschermd.groepen.filter((gr) => gr.samengevoegd);
  if (samengevoegd.length) meldingen.push(melding('privacy', P_SAMENGEVOEGD(samengevoegd[0].labels, samengevoegd[0].metLeeg)));
  if (keuze.klein.length) meldingen.push(melding('privacy', P_GROEP_KLEIN(keuze.klein.map(naam))));
  if (redenen.weggevallen.length) meldingen.push(melding('privacy', `${redenen.weggevallen.map((i) => `“${naam(i)}”`).join(', ')}: ${P_WEGGEVALLEN}.`));
  if (redenen.tweeWaarden.length) meldingen.push(melding('privacy', v.groepering && !twee2(v, basis) ? P_INDELING_PER_GROEP(v.label) : P_TWEE_WAARDEN(v.label)));
  if (redenen.dashboard.length) meldingen.push(melding('privacy', P_DASHBOARD_VERBORGEN(redenen.dashboard.map(naam))));
  if (redenen.selectie.length) meldingen.push(melding('privacy', `Niet meegenomen, omdat ze ${buurReden(ctx)} maar een paar mensen verschillen: ${redenen.selectie.map((i) => `“${naam(i)}”`).join(', ')}.`));
  if (keuze.ookNiet.length) meldingen.push(melding('privacy', P_OOK_NIET(keuze.ookNiet.map(naam))));
  const waarden = Array.from({ length: ng }, () => []);
  for (let r = 0; r < ds.n; r++) if (basis[r]) waarden[groep[r]].push(v.waarden[r]);
  // B6 en B7 ook voor het totaal van de getoonde groepen.
  if (v.score && keuze.mee.length) {
    const mee = new Set(keuze.mee);
    const inMee = new Uint8Array(ds.n);
    for (let r = 0; r < ds.n; r++) inMee[r] = mee.has(groep[r]) && (!ctx.selectie || ctx.selectie.F[r]) ? 1 : 0;
    if (weggevallenRegel(v.reden, inMee, null, 1, ctx.d)[0]) return { fout: `“${v.label}”: ${P_WEGGEVALLEN}.`, niveau: 'privacy' };
  }
  const alsGetal = indelingAlsGetalFout(v, basis, ctx.d, ctx.selectie?.F);
  if (alsGetal) return { fout: alsGetal, niveau: 'privacy' };
  return { basis, groep, ng, mee: keuze.mee, meldingen, waarden, naam };
}

/**
 * P1: een selectie op een indeling w mag de groepen die bij variabele v samen verborgen blijven (klein, ter aanvulling,
 * of door het dashboard verborgen; groepKeuze zonder de selectie) niet uit elkaar halen. Bevat de selectie rijen uit
 * die verborgen groepen, maar niet allemaal, dan zou een verborgen groep (of een deel ervan) met de selectie toch te
 * zien zijn: met het totaal en de getoonde groepen is dan een kleine groep terug te rekenen.
 * ctxZonder: dezelfde context zonder de eigen selectie (bij een gestapelde bron met de buren per vragenlijst).
 * ids: de variabelen van de analyse. Geeft null (in orde) of de melding.
 */
export function selectieGroepenFout(ds, ctxZonder, selectie, ids) {
  if (!selectie || selectie.impliciet || !selectie.voorwaarden?.length) return null;
  const indelingen = [...new Set(selectie.voorwaarden.map((vw) => vw.variabele).filter(Boolean))]
    .map((id) => ds.perId.get(id)).filter((w) => isIndeling(w));
  for (const id of ids) {
    const v = ds.perId.get(id);
    if (!v || !v.analyseerbaar || v.soort === 'set') continue;
    for (const w of indelingen) {
      if (w.id === v.id) continue;
      const k = groepKeuze(ds, ctxZonder, v, w);
      if (k.fout) continue;
      const mee = new Set(k.keuze.mee);
      const verborgen = k.aantallen.map((n, i) => n > 0 && !mee.has(i));
      if (!verborgen.some(Boolean)) continue;
      let inM = 0;
      let inF = 0;
      for (let r = 0; r < ds.n; r++) {
        if (!k.geldig[r] || k.groep[r] < 0 || !verborgen[k.groep[r]]) continue;
        inM++;
        if (selectie.F[r]) inF++;
      }
      if (inF > 0 && inF < inM) {
        return P_SELECTIE_GROEPEN(v.label, w.label, w.beschermd.groepen.filter((_, i) => verborgen[i]).map((gr) => gr.label));
      }
    }
  }
  return null;
}

/** Heeft v in de basis hooguit twee waarden? (Dan gaat het om een percentage, B6.) */
function twee2(v, basis) {
  const gezien = new Set();
  for (let r = 0; r < basis.length; r++) {
    if (!basis[r]) continue;
    gezien.add(v.waarden[r]);
    if (gezien.size > 2) return false;
  }
  return true;
}

export function pergroep(ds, spec, ctx) {
  const titel = 'Gemiddelden per groep';
  const deps = variabelenUit(ds, spec, 'afhankelijk');
  const [{ v: w } = {}] = variabelenUit(ds, spec, 'groep');
  const u = begin(ds, spec, ctx, titel, `Scores: ${deps.map((x) => x.v?.label || x.id).join(', ')}; groepen: ${w?.label || ''}`);
  if (!isIndeling(w)) return weiger(ds, spec, ctx, titel, 'fout', `“${w?.label || 'De groepsvariabele'}” is geen indeling met vaste groepen.`);
  if (!w.beschermd.bruikbaar) return weiger(ds, spec, ctx, titel, 'privacy', `“${w.label}” heeft niet genoeg groepen van minstens ${ctx.d} mensen.`);
  const overlap = overlapFout(ds, ctx, [w]);
  if (overlap) return weiger(ds, spec, ctx, titel, 'privacy', overlap);
  let nMax = 0;
  let iets = false;
  const percentielen = spec.opties?.percentielen === true;
  for (const { v } of deps) {
    const fout = getalFout(v);
    if (fout) { voeg(u, melding('waarschuwing', fout)); continue; }
    const gr = groepenVoor(ds, ctx, v, w);
    if (gr.fout) { voeg(u, melding(gr.niveau, gr.fout)); continue; }
    if (!gr.mee.length) { voeg(u, gr.meldingen, melding('privacy', `“${v.label}”: geen enkele groep heeft genoeg respondenten.`)); continue; }
    const rij = (label, xs, nadruk = false) => {
      const b = beschrijving(xs);
      const o = ordeStatistieken(xs.slice().sort((p, q) => p - q), ctx.d);
      return [tekstCel(label, { nadruk }), cel(b.n, 'aantal'), cel(b.gemiddelde, 'gem'), cel(b.sd, 'gem'), cel(b.se, 'gem'), cel(o.mediaan, 'gem'),
        ...(percentielen ? [cel(o.q1, 'gem'), cel(o.q3, 'gem')] : [])];
    };
    const rijen = gr.mee.map((i) => rij(gr.naam(i), gr.waarden[i]));
    const alle = gr.mee.flatMap((i) => gr.waarden[i]);
    rijen.push(rij('Totaal', alle, true));
    nMax = Math.max(nMax, alle.length);
    iets = true;
    voeg(u, tabel(`pergroep-${v.id}`, `“${v.label}” per “${w.label}”`, ['Groep', 'N', 'Gemiddelde', 'SD', 'SE', 'Mediaan', ...(percentielen ? ['25e percentiel', '75e percentiel'] : [])], rijen,
      { voetnoten: [`De mediaan${percentielen ? ' en de percentielen staan' : ' staat'} er alleen bij als er aan beide kanten minstens ${ctx.d} respondenten zijn.`] }), gr.meldingen);
    if (gr.mee.length >= 2) {
      const gem = gr.mee.map((i) => ({ naam: gr.naam(i), m: beschrijving(gr.waarden[i]).gemiddelde })).sort((a, b) => b.m - a.m);
      u.duiding.zinnen.push(`Bij “${v.label}” scoort “${gem[0].naam}” het hoogst (gemiddeld ${g(gem[0].m)}) en “${gem[gem.length - 1].naam}” het laagst (gemiddeld ${g(gem[gem.length - 1].m)}).`);
    }
  }
  if (!iets) {
    const m = u.onderdelen.find((o) => o.soort === 'melding' && o.niveau !== 'info');
    return weiger(ds, spec, ctx, titel, m?.niveau || 'fout', m?.tekst || 'Er is niets te tonen.');
  }
  u.gegevens.n = nMax;
  voeg(u, ordinaalMelding(deps.map((x) => x.v).filter(Boolean)));
  u.duiding.zinnen.push('Deze tabel toetst niet of de verschillen echt zijn. Gebruik daarvoor de t-toets (twee groepen) of de variantieanalyse (drie of meer groepen).');
  return sluitAf(u);
}
