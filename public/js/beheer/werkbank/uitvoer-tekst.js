// Werkbank: tekst bij de uitvoer (D2 §8, BOUWPLAN B19). Zuivere module, geen DOM.
// - opmaakCel: één cel als tekst (decimalen per soort, komma, echt minteken, × voor verborgen);
// - schrijfwijze: getallen in een zin, in de schrijfwijze Rapport (p = 0,036) of APA (p = ,036);
// - vaste meldingen (P_…) en zinnen voor "Wat betekent dit?";
// - uitvoerNaarBlokken: de uitvoer als blokken voor Word, stukken en rapporten (alleen kop, alinea, lijst,
//   tabel en feiten), met de methoden, het aantal toetsen en het kleinste getoonde aantal (BOUWPLAN §3.7).
// Opmaak komt uit opmaak.js (nooit uit rapport-feiten.js: dat voorkomt kringverwijzingen).

import { nlGetal, nlDatum } from '../opmaak.js';
import { VERBORGEN, VERBORGEN_UITLEG, LABEL_OVERIG, DREMPEL } from '../privacy.js';

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
const MIN = '−';

// ---------- Vaste meldingen (D2 §11.4) ----------

export const P_CEL = VERBORGEN_UITLEG;
export const P_GEEN_TOETS = 'De toets is niet berekend, omdat niet elke combinatie minstens 5 respondenten heeft. Uit de toets zou een klein aantal terug te rekenen zijn. Voeg groepen samen (Indelen in groepen) en probeer het opnieuw.';
export const P_TE_WEINIG = (min) => `Te weinig respondenten voor deze analyse: er zijn er minstens ${min} nodig.`;
export const P_GROEP_KLEIN = (namen) => `Niet meegenomen (minder dan 5 respondenten): ${opsomming(namen)}.`;
export const P_OOK_NIET = (namen) => `Ook niet meegenomen: ${opsomming(namen)}. Anders zijn de uitkomsten van een kleine groep terug te rekenen uit het totaal.`;
/**
 * Eén vaste uitleg, zoals op het dashboard: hij zegt niet welke groep klein is en welke alleen ter bescherming
 * meegaat (PR-08). metLeeg: bij een achtergrondvraag tellen ook wie de vraag niet invulde mee.
 */
export const P_SAMENGEVOEGD = (namen, metLeeg = false) => `${opsomming(namen)} ${namen.length === 1 ? 'is' : 'zijn'} samengevoegd tot “${LABEL_OVERIG}”. Zo is geen groep van minder dan 5 respondenten te zien of terug te rekenen.${metLeeg ? ' Ook wie deze vraag niet invulde, telt hier mee.' : ''}`;
export const P_FILTER_REST = 'Buiten deze selectie vallen minder dan 5 mensen. Hun antwoorden zouden dan terug te rekenen zijn uit het verschil met de uitkomst zonder selectie. Kies een andere selectie.';
export const P_LIJST_BUUR = 'Deze uitkomst verschilt maar een paar mensen (minder dan 5) van dezelfde uitkomst bij één vragenlijst. Dan zijn hun antwoorden terug te rekenen uit het verschil. Kies één vragenlijst als gegevens, of andere variabelen.';
export const P_SELECTIE_LIJST = 'Deze selectie verschilt maar een paar mensen (minder dan 5) van dezelfde selectie bij één vragenlijst. Dan zijn hun antwoorden terug te rekenen. Kies één vragenlijst als gegevens, of een ruimere selectie.';
export const pFilterBuur = (voorwaarde) => `Deze selectie verschilt maar een paar mensen (minder dan 5) van dezelfde selectie zonder ${voorwaarde}. Dan zijn hun antwoorden terug te rekenen. Laat die voorwaarde weg of maak hem ruimer.`;
export const pOverlap = (andere, waar) => `Deze indeling lijkt te veel op “${andere}”: ${waar} zitten minder dan 5 mensen. Uit het verschil tussen de twee zouden hun antwoorden terug te rekenen zijn. Kies een andere grens of gebruik de bestaande indeling.`;
export const P_LOGIT_CEL = (voorspeller, uitkomst) => `Bij “${voorspeller}” heeft niet elke groep minstens 5 mensen met en 5 mensen zonder “${uitkomst}”. Dan zou de uitkomst iets over een kleine groep verraden. Voeg groepen samen of laat deze voorspeller weg.`;
export const P_ORDINAAL = 'Je gebruikt losse vragen (ordinaal) als getal. Bij een schaal van 1 tot 5 is dat gebruikelijk; kijk ook naar de toets met rangnummers.';
/** Dezelfde zin als TOETS_WEGGEVALLEN in rapport-feiten.js (BOUWPLAN B7). */
export const P_WEGGEVALLEN = 'niet getoond: te weinig volledig ingevulde antwoorden om dit veilig naast het dashboard te tonen';
export const P_OPEN = (titel) => `Vragenlijst “${titel}” staat nog open: de uitkomst kan nog veranderen.`;
export const P_TE_VEEL_WAARDEN = 'Deze variabele heeft te veel verschillende waarden. Deel hem eerst in groepen in (Indelen in groepen).';
export const P_INDELING_ALS_GETAL = (label) => `“${label}” is een indeling (zoals afdeling of leeftijd) met een groep van minder dan 5 mensen. Als getal gebruikt zou die groep terug te rekenen zijn. Gebruik hem als groep, of voeg eerst groepen samen (Indelen in groepen).`;
export const P_TWEE_WAARDEN = (label) => `“${label}” heeft maar twee waarden; een gemiddelde is dan een percentage. Groepen die niet van beide waarden minstens 5 mensen hebben, zijn daarom niet getoond.`;
/** P2: groepen die het dashboard bij deze vraag of dit thema verbergt (onderdrukAlles), ook als ze zelf groot genoeg zijn. */
export const P_DASHBOARD_VERBORGEN = (namen) => `Niet meegenomen: ${opsomming(namen)}. Op het dashboard ${namen.length === 1 ? 'staat deze groep' : 'staan deze groepen'} hier niet, omdat anders een kleine groep bij deze vraag of bij een andere vraag van hetzelfde thema terug te rekenen is.`;
/** P1: een selectie die groepen uit elkaar haalt die bij deze variabele samen verborgen blijven. */
export const P_SELECTIE_GROEPEN = (variabele, indeling, namen) => `“${variabele}”: deze selectie op “${indeling}” haalt groepen uit elkaar die hier samen verborgen blijven (zoals bij Gemiddelden per groep en op het dashboard). Dan is een kleine groep terug te rekenen. Kies een selectie met ${opsomming(namen)} ${namen.length === 2 ? 'allebei' : 'allemaal'} erin of ${namen.length === 2 ? 'allebei' : 'allemaal'} eruit.`;
/**
 * P3: van een vraag met vaste waarden (schaal of cijfer) staan gemiddelde en spreiding per groep op het dashboard en in
 * de werkbank. Een verdeling per groep of per selectie met verborgen of samengevoegde cellen is daaruit terug te
 * rekenen, dus die tonen we niet.
 */
export const P_VERDELING_PER_GROEP = (label) => `“${label}”: per groep of selectie tonen we deze verdeling niet, omdat er cellen verborgen of samengevoegd zouden worden. Die zijn terug te rekenen uit het gemiddelde en de spreiding per groep (op het dashboard en bij Gemiddelden per groep). Deel “${label}” eerst in groepen in (Indelen in groepen), bijvoorbeeld ‘oneens’, ‘neutraal’ en ‘eens’; met die indeling kan het wel.`;
/** P3: een indeling (zoals leeftijd) als getal per groep: een gemiddelde per groep verraadt dan de verdeling in die groep. */
export const P_INDELING_PER_GROEP = (label) => `“${label}” is een indeling met vaste waarden. Een gemiddelde per groep verraadt dan hoeveel mensen in die groep elke waarde hebben. Groepen waarin een waarde bij minder dan 5 mensen voorkomt (of bij niemand), zijn daarom niet getoond.`;
export const P_GEEN_DATA = 'Ruwe gegevens per respondent zie je hier niet, om de anonimiteit te beschermen. Wil je ermee werken in SPSS of Excel, gebruik dan de export bij Afronden.';
export const MINMAX_NOOT = `* Minimum en maximum: de ${DREMPEL}e laagste en de ${DREMPEL}e hoogste waarde. Zo hoort geen getal bij één persoon.`;

// Zinnen uit de begeleide analyse (analyse.js), ongewijzigd overgenomen (D2 §8.3).
export const ZIN_SIG_VERSCHIL = 'Dit verschil is statistisch significant: het is onwaarschijnlijk dat het alleen door toeval komt.';
export const ZIN_GEEN_SIG_VERSCHIL = 'Niet significant: het verschil kan goed door toeval komen.';
export const ZIN_SIG_GROEPEN = 'De groepen verschillen statistisch significant van elkaar: het is onwaarschijnlijk dat de verschillen alleen door toeval komen.';
export const ZIN_GEEN_SIG_GROEPEN = 'Niet significant: de verschillen tussen de groepen kunnen goed door toeval komen.';
export const ZIN_SIG_VERBAND = 'Dit verband is statistisch significant: het is onwaarschijnlijk dat het alleen door toeval komt.';
export const ZIN_GEEN_SIG_VERBAND = 'Niet significant: het verband kan goed door toeval komen.';
export const LET_OP_VERSCHIL = 'Let op: significant betekent niet automatisch belangrijk. Kijk ook naar de grootte van het verschil en of het in de praktijk iets uitmaakt.';
export const LET_OP_VERBAND = 'Let op: samenhang is geen oorzaak. Dat twee dingen samengaan, betekent niet dat het een het ander veroorzaakt. En significant betekent niet automatisch belangrijk.';
export const ALFA_UITLEG = [
  ['onvoldoende', 'lager dan 0,6', 'de vragen meten niet duidelijk hetzelfde. Kijk liever naar de losse vragen dan naar de themascore.'],
  ['matig', '0,6 tot 0,7', 'de themascore is bruikbaar als grove aanwijzing.'],
  ['voldoende', '0,7 tot 0,8', 'de vragen vormen samen een bruikbare score.'],
  ['goed', '0,8 tot 0,9', 'de vragen meten duidelijk hetzelfde onderwerp.'],
  ['zeer goed', '0,9 of hoger', 'de vragen hangen heel sterk samen. Mogelijk overlappen ze zo veel dat er een vraag weg kan.'],
];

export const UITLEG_FREQUENTIES = 'Deze tabel laat zien hoe vaak elk antwoord is gegeven. ‘Procent’ is het deel van iedereen in de selectie; ‘Geldig procent’ telt alleen wie een antwoord gaf (zonder ‘weet niet’ en lege antwoorden). Meestal is het geldig procent het handigst.';
export const UITLEG_LEVENE = 'De toets van Levene kijkt of de spreiding in de groepen gelijk is. Is p kleiner dan 0,05, gebruik dan de regel ‘Gelijke spreiding niet aangenomen’. Wij raden die regel (Welch) altijd aan.';
export const UITLEG_POSTHOC = 'Deze tabel laat zien wélke groepen van elkaar verschillen. De p-waarden zijn al gecorrigeerd voor het aantal vergelijkingen.';
export const UITLEG_RESIDUEN = 'Een aangepast residu groter dan 2 of kleiner dan −2 wijst op een combinatie die vaker of minder vaak voorkomt dan je zonder verband zou verwachten.';

// Voorspellen, gepaard vergelijken en factoranalyse (fase 5 en 6, D2 §5.2, §6.3 en §8.3).
export const P_AFHANKELIJK = (label) => `“${label}” is weggelaten: deze voorspeller is volledig te voorspellen uit de andere.`;
export const P_WEINIG_RESPONDENTEN_MODEL = 'Weinig respondenten voor zoveel voorspellers; de uitkomsten zijn onzeker.';
export const P_VIF = (namen) => `Deze voorspellers hangen sterk met elkaar samen (VIF groter dan 5): ${opsomming(namen)}. Hun afzonderlijke B en β zijn daardoor onzeker; laat er eventueel een weg of maak er één score van.`;
export const P_SCHEIDING = 'Er is (bijna) volledige scheiding: een voorspeller voorspelt de uitkomst (bijna) perfect. Dan zijn de odds ratio’s niet te schatten. Voeg groepen samen of laat deze voorspeller weg.';
export const P_WEINIG_PER_VOORSPELLER = 'Weinig respondenten in de kleinste groep van de uitkomst voor zoveel voorspellers (minder dan 10 per voorspeller); de uitkomsten zijn onzeker.';
export const P_GEPAARD = 'Dit kan alleen binnen één vragenlijst: antwoorden van verschillende meetmomenten zijn anoniem en niet per persoon te koppelen.';
export const P_NIET_PD = 'De vragen hangen zo sterk samen dat de berekening niet kan (bijvoorbeeld twee keer dezelfde vraag).';
export const P_HEYWOOD = (namen) => `Bij ${opsomming(namen)} is de communaliteit 1 of meer geworden (een Heywood-geval). De oplossing is dan niet betrouwbaar. Kies minder factoren of laat deze vraag weg.`;
export const P_WEINIG_FACTOR = 'Weinig respondenten voor een factoranalyse (minder dan 100, of minder dan 5 per vraag). De uitkomst is onzeker; kijk vooral naar het patroon, niet naar de precieze getallen.';
export const uitlegRegressie = (y, pct) => `R² is het deel van de verschillen in “${y}” dat de voorspellers samen verklaren (hier ${pct}%). B zegt hoeveel “${y}” gemiddeld verandert als een voorspeller 1 punt hoger is en de andere gelijk blijven. β maakt de voorspellers onderling vergelijkbaar.`;
export const uitlegLogistisch = (uitkomst) => `Exp(B) is de odds ratio: hoeveel keer groter de kans-verhouding op “${uitkomst}” is als een voorspeller 1 punt hoger is. Boven 1: meer kans; onder 1: minder kans.`;
export const UITLEG_FACTOR = 'KMO boven 0,6 en een significante toets van Bartlett betekenen dat de vragen genoeg samenhangen voor een factoranalyse. Een lading laat zien hoe sterk een vraag bij een factor hoort; vanaf 0,40 telt hij duidelijk mee.';
export const UITLEG_GEPAARD = 'De gepaarde t-toets kijkt of mensen gemiddeld anders scoren op de ene vraag dan op de andere. De toets van Wilcoxon doet hetzelfde met rangnummers; die is handig bij losse vragen van 1 tot 5.';

/** Opsomming in een zin: “A”, “B” en “C” */
export function opsomming(namen, woord = 'en') {
  const q = namen.map((n) => `“${n}”`);
  if (q.length <= 1) return q.join('');
  return `${q.slice(0, -1).join(', ')} ${woord} ${q[q.length - 1]}`;
}

// ---------- Getallen ----------

/** Getal met vaste decimalen en echt minteken; '–' als er geen getal is. */
export function g(x, dec = 2) {
  if (!eindig(x)) return '–';
  return nlGetal(x, dec);
}

/** p-waarde in een tabel: 0,036 · < 0,001 (vlak bij 0,05 meer decimalen, zoals bij Analyse). */
export function pWaarde(p, { apa = false } = {}) {
  if (!eindig(p)) return '–';
  if (p < 0.001) return apa ? '< ,001' : '< 0,001';
  let dec = 3;
  while (dec < 7 && Number(p.toFixed(dec)) === 0.05) dec++;
  const t = nlGetal(p, dec);
  return apa ? t.replace(/^0,/, ',') : t;
}

/** Vrijheidsgraden: geheel getal zonder decimalen, anders één decimaal. */
export function dfTekst(df) {
  if (!eindig(df)) return '–';
  return Math.abs(df - Math.round(df)) < 1e-9 ? String(Math.round(df)) : nlGetal(df, 1);
}

const DECIMALEN = { aantal: 0, procent: 1, gem: 2, stat: 2, p: 3, r: 2, df: 1, coef: 3, verwacht: 1, or: 2 };

/**
 * Eén cel als tekst. doel 'excel' geeft r-achtige maten met 3 decimalen (D2 §8.1).
 */
export function opmaakCel(c, { doel = 'scherm' } = {}) {
  if (!c) return '';
  if (c.verborgen) return VERBORGEN;
  if (c.soort === 'tekst') return c.t ?? '';
  if (!eindig(c.w)) return c.t ?? '–';
  let t;
  if (c.soort === 'p') t = pWaarde(c.w);
  else if (c.soort === 'df') t = dfTekst(c.w);
  else if (c.soort === 'aantal') t = Math.round(c.w).toLocaleString('nl-NL');
  else if (c.soort === 'procent') t = `${nlGetal(c.w, 1)}%`;
  else t = nlGetal(c.w, doel === 'excel' && c.soort === 'r' ? 3 : DECIMALEN[c.soort] ?? 2);
  return c.ster ? `${t}${c.ster}` : t;
}

/** Het getal zoals het in Excel komt: afgerond op de decimalen van het scherm, of tekst ('×', '–', '< 0,001'). */
export function excelWaarde(c) {
  if (!c) return null;
  if (c.verborgen) return VERBORGEN;
  if (c.soort === 'tekst') return c.t ?? '';
  if (!eindig(c.w)) return c.t ?? '–';
  if (c.soort === 'p' && c.w < 0.001) return '< 0,001';
  if (c.soort === 'procent') return Math.round(c.w * 10) / 10; // procenten als getal (42,5), zoals op het scherm
  const dec = c.soort === 'r' ? 3 : c.soort === 'p' ? 3 : c.soort === 'df' ? (Number.isInteger(c.w) ? 0 : 1) : DECIMALEN[c.soort] ?? 2;
  const f = 10 ** dec;
  return Math.round(c.w * f) / f;
}

/**
 * Getallen in een APA-zin. notatie 'rapport': p = 0,036 (zoals in rapporten, B19); 'apa': p = ,036 (zonder nul voor
 * maten die niet groter dan 1 kunnen zijn: p, r, ρ, β, R², α, V, φ, η², ω², ε²). Decimaalkomma; tussen
 * statistieken een puntkomma.
 */
export function schrijfwijze(notatie = 'rapport') {
  const apa = notatie === 'apa';
  const begrensd = (x, dec = 2) => {
    if (!eindig(x)) return '–';
    const t = nlGetal(x, dec);
    return apa ? t.replace(/^(−?)0,/, '$1,') : t;
  };
  return {
    apa,
    g: (x, dec = 2) => g(x, dec),
    begrensd,
    p: (p) => {
      if (!eindig(p)) return '*p* onbekend';
      if (p < 0.001) return apa ? '*p* < ,001' : '*p* < 0,001';
      return `*p* = ${pWaarde(p, { apa })}`;
    },
    df: dfTekst,
    n: (n) => Math.round(n).toLocaleString('nl-NL'),
  };
}

/** Beide schrijfwijzen van een zin: maak(f) bouwt de zin met de getallen uit f. */
export function apaZinnen(maak) {
  const rapport = maak(schrijfwijze('rapport'));
  const apa = maak(schrijfwijze('apa'));
  return rapport || apa ? { rapport: rapport || '', apa: apa || '' } : null;
}

/** Effectgrootte in woorden (verwaarloosbaar → "verwaarloosbaar klein", zoals bij Analyse). */
export const effectWoord = (e) => (e === 'verwaarloosbaar' ? 'verwaarloosbaar klein' : e);

// ---------- Naar blokken (Word, stukken, rapporten) ----------

/** Metaregel: Gegevens · Selectie · n · datum. */
export function metaTekst(u) {
  const delen = [];
  if (u.gegevens.bron) delen.push(`Gegevens: ${u.gegevens.bron}`);
  delen.push(`Selectie: ${u.gegevens.selectie || 'iedereen'}`);
  if (eindig(u.gegevens.n)) delen.push(`n = ${Math.round(u.gegevens.n).toLocaleString('nl-NL')}`);
  if (u.gegevens.datum) delen.push(nlDatum(u.gegevens.datum));
  return delen.join(' · ');
}

const MAX_KOLOMMEN = 20;
const MAX_RIJEN = 200;

function tabelBlok(o) {
  if (o.kop.length > MAX_KOLOMMEN && Array.isArray(o.paren)) {
    // Een grote correlatiematrix past niet als tabel in een rapport: dan een lijst met de sterkste paren.
    const paren = o.paren.filter((p) => !p.verborgen && eindig(p.r)).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    const rijen = paren.slice(0, MAX_RIJEN).map((p) => [`${p.a} – ${p.b}`, opmaakCel({ w: p.r, soort: 'r', ster: p.ster }), pWaarde(p.p), Math.round(p.n).toLocaleString('nl-NL')]);
    const titel = paren.length > MAX_RIJEN ? `${o.titel} (de ${MAX_RIJEN} sterkste paren)` : o.titel;
    return { soort: 'tabel', kop: ['Paar', o.maat || 'r', 'p', 'n'], rijen, bijschrift: titel };
  }
  return {
    soort: 'tabel',
    kop: o.kop.map((k) => k.tekst),
    // Een korte rij (een tekst die de rest van de rij beslaat) wordt aangevuld met lege cellen.
    rijen: o.rijen.slice(0, MAX_RIJEN).map((rij) => [...rij.map((c) => opmaakCel(c)), ...Array.from({ length: Math.max(0, o.kop.length - rij.length) }, () => '')]),
    bijschrift: o.titel,
  };
}

/**
 * De uitvoer als blokken. notatie: 'rapport' (standaard, B19) of 'apa'. metUitleg: ook "Wat betekent dit?"
 * (wel bij Word en stukken, niet in rapporten: daar staat je eigen tekst).
 * @returns {{ blokken, methoden, toetsen, kleinste_n }}
 */
export function uitvoerNaarBlokken(u, { notatie = 'rapport', metUitleg = false, metTitel = true } = {}) {
  const blokken = [];
  if (metTitel) blokken.push({ soort: 'kop', niveau: 3, tekst: u.titel });
  blokken.push({ soort: 'alinea', tekst: `*${metaTekst(u)}*` });
  let verborgen = false;
  for (const o of u.onderdelen) {
    if (o.soort === 'tabel') {
      if (o.rijen.some((rij) => rij.some((c) => c && c.verborgen))) verborgen = true;
      blokken.push(tabelBlok(o));
      for (const v of o.voetnoten || []) blokken.push({ soort: 'alinea', tekst: `*${v}*` });
    } else if (o.soort === 'melding') {
      blokken.push({ soort: 'alinea', tekst: o.tekst });
    }
  }
  if (verborgen) blokken.push({ soort: 'alinea', tekst: `*${VERBORGEN_UITLEG}*` });
  if (metUitleg && u.duiding?.zinnen?.length) {
    blokken.push({ soort: 'alinea', tekst: '**Wat betekent dit?**' });
    blokken.push({ soort: 'alinea', tekst: u.duiding.zinnen.join(' ') });
  }
  const zin = u.apa ? u.apa[notatie === 'apa' ? 'apa' : 'rapport'] : '';
  if (zin) blokken.push({ soort: 'alinea', tekst: zin });
  return { blokken, methoden: [...u.methoden], toetsen: u.toetsen || 0, kleinste_n: u.kleinste_n };
}

/** De uitvoer als platte tekst met eenvoudige opmaak (voor "Neem op in stuk"). Tabellen worden opsommingen. */
export function uitvoerNaarTekst(u, { notatie = 'rapport' } = {}) {
  const { blokken } = uitvoerNaarBlokken(u, { notatie, metUitleg: true });
  const uit = [];
  for (const b of blokken) {
    if (b.soort === 'kop') uit.push(`### ${b.tekst}`, '');
    else if (b.soort === 'alinea') uit.push(b.tekst, '');
    else if (b.soort === 'lijst') { for (const i of b.items) uit.push(`- ${i}`); uit.push(''); }
    else if (b.soort === 'tabel') {
      if (b.bijschrift) uit.push(`**${b.bijschrift}**`);
      for (const rij of b.rijen) uit.push(`- ${rij.map((c, i) => (i === 0 ? c : `${b.kop[i]}: ${c}`)).join(' · ')}`);
      uit.push('');
    }
  }
  return `${uit.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export { MIN };
