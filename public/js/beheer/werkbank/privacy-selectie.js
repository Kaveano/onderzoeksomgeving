// Werkbank: privacyregels die bovenop privacy.js komen (BOUWPLAN B1, D2 §7). Zuivere module, geen DOM.
// privacy.js blijft de enige plek met de basisregels (verbergen van kleine aantallen, groepen, kruistabellen);
// hier staat wat alleen de werkbank nodig heeft:
// - regel A  beschermIndeling: de beschermde groepen van een indeling (dezelfde samenvoeging als het dashboard);
// - regel B  verbergMet: één reeks aantallen verbergen, ook met cellen die vooraf verborgen moeten worden en met
//            verschillen ten opzichte van buurselecties;
// - regel D  burenVan / selectieFout / groepBuren / buurTabellen: een selectie en haar buren. Wat je met en zonder
//            een voorwaarde ziet, mag nooit 1 tot 4 mensen verschillen;
// - regel E  controleerOverlap: twee indelingen van dezelfde variabele mogen samen geen groepje van 1 tot 4 mensen
//            afbakenen (zoals "jonger dan 40" naast "jonger dan 41");
// - orde-statistieken (PR-10), de regel voor variabelen met twee waarden (B6) en weggevallen respondenten (B7).

import { DREMPEL, LABEL_OVERIG, verdeelInGroepen, maskeer, weggevallenVeilig } from '../privacy.js';

const som = (lijst) => lijst.reduce((t, x) => t + x, 0);
/** Een verschil van 0 of minstens d is veilig; 1 tot d − 1 niet. */
export const verschilVeilig = (a, b, d = DREMPEL) => a - b === 0 || a - b >= d || b - a >= d;

// ---------- Regel A: beschermde groepen ----------

/** Naam van de groep respondenten die een achtergrondvraag oversloegen (zoals op het dashboard). */
export const LABEL_NIET_INGEVULD = 'Niet ingevuld';

/**
 * De beschermde groepen van een indeling (regel A, D2 §7.2), met de samenvoeging van het dashboard
 * (privacy.js verdeelInGroepen, strategie 'samenvoegen'): kleine groepen samen als "Overige groepen samen",
 * zo nodig met de kleinste grote groep erbij.
 * aantallen: per categorie (in de vaste volgorde) het aantal; labels: de namen.
 * nietIngevuld: bij een achtergrondvraag het aantal respondenten dat hem oversloeg. Dat is dan een eigen groep
 * (PR-05), net als op het dashboard; anders zouden de groepen van de werkbank afwijken van die van het dashboard
 * en is een kleine groep terug te rekenen uit het verschil. Komt "Niet ingevuld" in de samengevoegde groep, dan
 * horen die respondenten ook in de werkbank bij die groep (leegGroep). Staat "Niet ingevuld" apart (minstens d
 * mensen), dan doet die groep in de werkbank niet mee (leegApart); weglaten van d of meer mensen is veilig.
 * @returns {{ groepVan: Int32Array /* categorie → groep, −1 = geen groep *\/,
 *             groepen: { label, categorieen: number[], labels: string[], samengevoegd: boolean, n, metLeeg }[],
 *             leegGroep: number /* groep van wie de vraag oversloeg, −1 = geen *\/, leegApart: boolean,
 *             bruikbaar: boolean /* minstens twee groepen met respondenten *\/ }}
 */
export function beschermIndeling(aantallen, labels, d = DREMPEL, { nietIngevuld = 0, achtergrond = false } = {}) {
  const LEEG = aantallen.length;
  const invoer = aantallen.map((n, i) => ({ sleutel: i, label: labels[i], n }));
  if (nietIngevuld > 0) invoer.push({ sleutel: LEEG, label: LABEL_NIET_INGEVULD, n: nietIngevuld });
  const r = verdeelInGroepen(invoer, { d, strategie: 'samenvoegen' });
  const groepVan = new Int32Array(aantallen.length).fill(-1);
  const groepen = [];
  let leegGroep = -1;
  let leegApart = false;
  for (const z of r.zichtbaar) {
    if (z.sleutel === LEEG) {
      leegApart = true;
      continue;
    }
    groepVan[z.sleutel] = groepen.length;
    groepen.push({ label: z.label, categorieen: [z.sleutel], labels: [z.label], samengevoegd: false, n: z.n, metLeeg: false });
  }
  if (r.samengevoegd) {
    const nr = groepen.length;
    const echte = r.samengevoegd.sleutels.filter((s) => s !== LEEG);
    for (const s of echte) groepVan[s] = nr;
    if (r.samengevoegd.sleutels.includes(LEEG)) leegGroep = nr;
    // metLeeg: de vaste zin "Ook wie deze vraag niet invulde, telt hier mee." (zoals het dashboard: altijd bij een
    // achtergrondvraag, tenzij "Niet ingevuld" apart staat; zo verraadt de zin niet of iemand de vraag oversloeg).
    groepen.push({
      label: LABEL_OVERIG, categorieen: echte, labels: echte.map((s) => labels[s]), samengevoegd: true, n: r.samengevoegd.n,
      metLeeg: achtergrond && !leegApart,
    });
  }
  return { groepVan, groepen, leegGroep, leegApart, bruikbaar: groepen.filter((g) => g.n > 0).length >= 2 };
}

// ---------- Regel B: één reeks aantallen ----------

/**
 * Verbergt aantallen van één reeks (true = verborgen), zoals verbergReeks in privacy.js, maar met:
 * - vooraf: cellen die hoe dan ook verborgen worden (bijvoorbeeld omdat ze 1 tot 4 verschillen van een buurselectie);
 * - verschillen: reeksen met het verschil per cel tussen een buurselectie en deze selectie. Ook de verborgen
 *   cellen samen mogen niet 1 tot 4 verschillen, anders zijn ze uit de totalen terug te rekenen.
 * Is er iets verborgen, dan gaan de nullen mee en daarna de kleinste zichtbare cellen, tot de verborgen cellen
 * samen minstens d tellen en elk verschil samen 0 of minstens d is. Zonder vooraf en verschillen is de uitkomst
 * gelijk aan verbergReeks.
 */
export function verbergMet(aantallen, d = DREMPEL, { vooraf = null, verschillen = [] } = {}) {
  const verborgen = aantallen.map((n, i) => vooraf?.[i] === true || (n > 0 && n < d));
  if (!verborgen.some(Boolean)) return verborgen;
  aantallen.forEach((n, i) => { if (n === 0) verborgen[i] = true; });
  const somVerborgen = (reeks) => reeks.reduce((t, x, i) => t + (verborgen[i] ? x : 0), 0);
  const onveilig = () => somVerborgen(aantallen) < d || verschillen.some((v) => {
    const s = somVerborgen(v);
    return s > 0 && s < d;
  });
  const rest = aantallen.map((_, i) => i).filter((i) => !verborgen[i]).sort((a, b) => aantallen[a] - aantallen[b] || a - b);
  while (onveilig() && rest.length) verborgen[rest.shift()] = true;
  return verborgen;
}

// ---------- Regel D: selecties en hun buren ----------

/** Een selectie: F = de rijen die erin vallen; buren = selecties die één voorwaarde (of één groep) minder hebben. */
function maskerAnd(lengte, maskers) {
  const uit = new Uint8Array(lengte).fill(1);
  for (const m of maskers) if (m) for (let r = 0; r < lengte; r++) if (!m[r]) uit[r] = 0;
  return uit;
}

/**
 * Maakt de selectie en haar buren uit voorwaarden die al naar rijen zijn vertaald.
 * voorwaarden: [{ masker: Uint8Array, tekst, eenheden?: [{ masker /* voorwaarde zonder deze groep *\/, tekst }] }].
 * Buren (D2 §7.5): N0 = iedereen; Ni = zonder voorwaarde i; Ni,w = voorwaarde i zonder één van de gekozen groepen.
 * @returns {{ F: Uint8Array, buren: { masker: Uint8Array|null, soort: 'iedereen'|'zonder'|'zonderGroep', tekst }[] }}
 */
export function burenVan(lengte, voorwaarden) {
  const F = maskerAnd(lengte, voorwaarden.map((v) => v.masker));
  const buren = [{ masker: null, soort: 'iedereen', tekst: '' }];
  if (voorwaarden.length > 1) {
    voorwaarden.forEach((v, i) => {
      buren.push({ masker: maskerAnd(lengte, voorwaarden.filter((_, j) => j !== i).map((x) => x.masker)), soort: 'zonder', tekst: v.tekst });
    });
  }
  voorwaarden.forEach((v, i) => {
    for (const e of v.eenheden || []) {
      buren.push({ masker: maskerAnd(lengte, [...voorwaarden.filter((_, j) => j !== i).map((x) => x.masker), e.masker]), soort: 'zonderGroep', tekst: e.tekst });
    }
  });
  return { F, buren };
}

/**
 * Een gestapelde bron (alle vragenlijsten onder elkaar) tegenover één vragenlijst (regel D tussen bronnen,
 * D2 §7.9 "een selectie min een buur"): "alleen vragenlijst k" en (bij drie of meer) "zonder vragenlijst k" zijn
 * buren van de gestapelde bron. Wat je in de gestapelde bron ziet, mag dus nooit 1 tot 4 mensen verschillen van
 * hetzelfde bij één vragenlijst (die je in de werkbank of op het dashboard ook ziet).
 * rijLijst: per rij het nummer van de vragenlijst; lijsten: [{ naam }]; selectie: de gekozen selectie of null.
 * Zonder eigen selectie komt er een selectie met iedereen en impliciet: true (de regels voor meningsvragen zonder
 * selectie, B26, blijven dan gelden).
 */
export function metLijstBuren(selectie, rijLijst, lijsten) {
  const n = rijLijst.length;
  const F = selectie ? selectie.F : new Uint8Array(n).fill(1);
  const buren = [...(selectie?.buren || [])];
  lijsten.forEach((l, k) => {
    const alleen = new Uint8Array(n);
    const zonder = new Uint8Array(n);
    for (let r = 0; r < n; r++) {
      if (!F[r]) continue;
      if (rijLijst[r] === k) alleen[r] = 1;
      else zonder[r] = 1;
    }
    buren.push({ masker: alleen, soort: 'lijst', tekst: `alleen “${l.naam}”` });
    if (lijsten.length >= 3) buren.push({ masker: zonder, soort: 'lijst', tekst: `zonder “${l.naam}”` });
  });
  if (selectie) return { ...selectie, buren };
  return { F, buren, tekst: null, impliciet: true, voorwaarden: [], n };
}

/** Aantal rijen in basis ∩ masker (masker null = iedereen). */
export function telIn(basis, masker) {
  let n = 0;
  for (let r = 0; r < basis.length; r++) if (basis[r] && (!masker || masker[r])) n++;
  return n;
}

/**
 * Regel D voor het geheel: met basis U (de rijen die in de analyse mee kunnen doen, los van de selectie) moet elk
 * verschil |U ∩ N| − |U ∩ F| 0 of minstens d zijn. Geeft null (in orde) of { soort: 'rest'|'buur', tekst }.
 */
export function selectieFout(selectie, basis, d = DREMPEL) {
  if (!selectie) return null;
  const inF = telIn(basis, selectie.F);
  for (const b of selectie.buren) {
    const inN = telIn(basis, b.masker);
    if (!verschilVeilig(inN, inF, d)) return { soort: b.soort === 'iedereen' ? 'rest' : b.soort === 'lijst' ? 'lijst' : 'buur', tekst: b.tekst };
  }
  return null;
}

/**
 * Regel D per groep: groep[r] = groepsnummer van rij r (−1 = geen). Geeft per groep true als die groep met een
 * buurselectie 1 tot 4 mensen verschilt (dan mag hij niet getoond worden). Zonder selectie: niets.
 */
export function groepBuren(selectie, basis, groep, aantalGroepen, d = DREMPEL) {
  const fout = new Array(aantalGroepen).fill(false);
  if (!selectie) return fout;
  const tel = (masker) => {
    const t = new Array(aantalGroepen).fill(0);
    for (let r = 0; r < basis.length; r++) if (basis[r] && groep[r] >= 0 && (!masker || masker[r])) t[groep[r]]++;
    return t;
  };
  const inF = tel(selectie.F);
  for (const b of selectie.buren) {
    const inN = tel(b.masker);
    for (let g = 0; g < aantalGroepen; g++) if (!verschilVeilig(inN[g], inF[g], d)) fout[g] = true;
  }
  return fout;
}

/** Kruistabel (aantallen) van rijgroep × kolomgroep binnen basis ∩ masker. */
export function telTabel(basis, masker, rij, kolom, nr, nk) {
  const t = Array.from({ length: nr }, () => new Array(nk).fill(0));
  for (let r = 0; r < basis.length; r++) {
    if (!basis[r] || (masker && !masker[r]) || rij[r] < 0 || kolom[r] < 0) continue;
    t[rij[r]][kolom[r]]++;
  }
  return t;
}

/**
 * Regel D voor tabellen: de verschiltabellen |buur − selectie| voor maskeer(), en de cellen die vooraf
 * verborgen moeten worden (verschil 1 tot 4). Zonder selectie: geen verschiltabellen en niets vooraf.
 */
export function buurTabellen(selectie, basis, rij, kolom, nr, nk, d = DREMPEL) {
  if (!selectie) return { verschillen: [], vooraf: null };
  const tF = telTabel(basis, selectie.F, rij, kolom, nr, nk);
  const verschillen = [];
  const vooraf = tF.map((r) => r.map(() => false));
  for (const b of selectie.buren) {
    const tN = telTabel(basis, b.masker, rij, kolom, nr, nk);
    // Een buur is ruimer (zonder een voorwaarde) of krapper (zonder een gekozen groep): het verschil is per cel
    // steeds van één teken, dus de absolute waarde is het aantal mensen dat tussen de twee verschilt.
    const v = tN.map((r, i) => r.map((x, j) => Math.abs(x - tF[i][j])));
    v.forEach((r, i) => r.forEach((x, j) => { if (x > 0 && x < d) vooraf[i][j] = true; }));
    verschillen.push(v);
  }
  return { verschillen, vooraf };
}

/** Verbergpatroon van een kruistabel met regel D: maskeer() met de verschiltabellen. */
export function maskeerMetBuren(tabel, d = DREMPEL, { verschillen = [], vooraf = null } = {}) {
  return maskeer([tabel, ...verschillen], d, vooraf);
}

// ---------- Regel E: twee indelingen van dezelfde variabele ----------

/**
 * Controleert of indelingen van dezelfde (wortel)variabele samen een groepje van 1 tot 4 mensen afbakenen.
 * indelingen: [{ naam, groep: Int32Array /* per rij het groepsnummer, −1 = geen *\/, groepen: [{ dekking }] }]
 * (alle rijen met een geldige waarde van de wortelvariabele; rijen met −1 tellen alleen niet in een groep).
 * Voor elk paar indelingen (P, Q) en elk paar groepen (g in P, h in Q) met c = |g ∩ h| > 0 moet |g| − c en
 * |h| − c 0 of minstens d zijn. Alleen paren waarin `nieuw` (index) zit worden getoetst als nieuw is gegeven.
 * @returns [{ indeling: naam, andere: naam, g, h, rest: 'g'|'h' }] — de overtredingen (zonder aantallen).
 */
export function controleerOverlap(indelingen, d = DREMPEL, { nieuw = null } = {}) {
  const uit = [];
  for (let a = 0; a < indelingen.length; a++) {
    for (let b = a + 1; b < indelingen.length; b++) {
      if (nieuw !== null && a !== nieuw && b !== nieuw) continue;
      const P = indelingen[a];
      const Q = indelingen[b];
      const np = P.groepen.length;
      const nq = Q.groepen.length;
      const grootteP = new Array(np).fill(0);
      const grootteQ = new Array(nq).fill(0);
      const samen = new Map();
      const n = P.groep.length;
      for (let r = 0; r < n; r++) {
        const g = P.groep[r];
        const h = Q.groep[r];
        if (g >= 0) grootteP[g]++;
        if (h >= 0) grootteQ[h]++;
        if (g >= 0 && h >= 0) samen.set(g * nq + h, (samen.get(g * nq + h) || 0) + 1);
      }
      for (const [sleutel, c] of samen) {
        const g = Math.floor(sleutel / nq);
        const h = sleutel % nq;
        if (!verschilVeilig(grootteP[g], c, d)) uit.push({ indeling: P.naam, andere: Q.naam, g, h, rest: 'g', P, Q });
        else if (!verschilVeilig(grootteQ[h], c, d)) uit.push({ indeling: P.naam, andere: Q.naam, g, h, rest: 'h', P, Q });
      }
    }
  }
  return uit;
}

// ---------- Orde-statistieken (PR-10), twee waarden (B6) en weggevallen respondenten (B7) ----------

/**
 * Wat er van de gesorteerde waarden getoond mag worden: minimum en maximum zijn de d-de laagste en hoogste waarde
 * (alleen bij n ≥ 2d − 1), de mediaan alleen bij n ≥ 2d − 1, een kwartiel (SPSS, positie (n + 1)p) alleen als
 * er links en rechts minstens d waarden liggen.
 */
export function ordeStatistieken(gesorteerd, d = DREMPEL) {
  const n = gesorteerd.length;
  const genoeg = n >= 2 * d - 1;
  const kwantiel = (p) => {
    const pos = (n + 1) * p;
    const laag = Math.floor(pos);
    const hoog = Math.ceil(pos);
    if (laag < d || n - hoog + 1 < d) return null;
    const a = gesorteerd[laag - 1];
    const b = gesorteerd[hoog - 1];
    return a + (pos - laag) * (b - a);
  };
  let mediaan = null;
  if (genoeg) {
    const m = n >> 1;
    mediaan = n % 2 ? gesorteerd[m] : (gesorteerd[m - 1] + gesorteerd[m]) / 2;
  }
  return {
    minimum: genoeg ? gesorteerd[d - 1] : null,
    maximum: genoeg ? gesorteerd[n - d] : null,
    mediaan,
    q1: n ? kwantiel(0.25) : null,
    q3: n ? kwantiel(0.75) : null,
  };
}

/**
 * B6: heeft een variabele in de steekproef hooguit twee verschillende waarden, dan is een gemiddelde per groep een
 * aandeel. Dan geldt de regel voor kruistabellen (nullen tellen als klein). Geeft per groep true als de groep
 * niet getoond mag worden, of null als de variabele meer dan twee waarden heeft.
 * waarden: per rij de waarde; basis: rijen die meedoen; groep: per rij het groepsnummer (−1 = geen; zonder groep
 * telt alles als één groep).
 */
export function tweeWaardenRegel(waarden, basis, groep, aantalGroepen, d = DREMPEL, buren = null) {
  const verschillend = [];
  for (let r = 0; r < basis.length; r++) {
    if (!basis[r]) continue;
    const x = waarden[r];
    if (!verschillend.includes(x)) {
      verschillend.push(x);
      if (verschillend.length > 2) return null;
    }
  }
  verschillend.sort((a, b) => a - b);
  // Met één waarde is de andere kolom helemaal 0: dan is alles een "aandeel van 100%".
  const kolommen = verschillend.length === 1 ? 2 : verschillend.length;
  const kolomVan = new Int32Array(basis.length).fill(-1);
  const rijVan = new Int32Array(basis.length).fill(-1);
  for (let r = 0; r < basis.length; r++) {
    if (!basis[r]) continue;
    kolomVan[r] = verschillend.indexOf(waarden[r]);
    rijVan[r] = groep ? groep[r] : 0;
  }
  const ng = groep ? aantalGroepen : 1;
  const tabel = telTabel(basis, null, rijVan, kolomVan, ng, kolommen);
  const { verschillen, vooraf } = buren ? buurTabellen(buren, basis, rijVan, kolomVan, ng, kolommen, d) : { verschillen: [], vooraf: null };
  // Lege groepen doen niet mee (die worden elders al niet getoond).
  const mee = tabel.map((rij) => som(rij) > 0);
  const deel = tabel.filter((_, i) => mee[i]);
  if (!deel.length) return new Array(ng).fill(true);
  const verborgen = maskeer([deel, ...verschillen.map((v) => v.filter((_, i) => mee[i]))], d, vooraf ? vooraf.filter((_, i) => mee[i]) : null);
  const uit = new Array(ng).fill(true);
  let k = 0;
  for (let i = 0; i < ng; i++) {
    if (!mee[i]) continue;
    uit[i] = verborgen[k].some(Boolean);
    k++;
  }
  return uit;
}

/**
 * B7: telt per groep de rijen waarvan de score wegviel omdat te weinig vragen beantwoord waren (reden 5).
 * Geeft per groep true als dat aantal 1 tot 4 is (dan mag die groep niet getoond worden). groep null = één geheel.
 */
export function weggevallenRegel(reden, basis, groep, aantalGroepen, d = DREMPEL) {
  const ng = groep ? aantalGroepen : 1;
  const t = new Array(ng).fill(0);
  for (let r = 0; r < basis.length; r++) {
    if (!basis[r] || reden[r] !== 5) continue;
    const g = groep ? groep[r] : 0;
    if (g >= 0) t[g]++;
  }
  return t.map((w) => !weggevallenVeilig(w, d));
}
