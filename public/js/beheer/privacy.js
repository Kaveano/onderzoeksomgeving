// Privacy: de enige plek waar de regels voor het verbergen van kleine aantallen staan.
// Zuivere module (geen DOM, geen fetch): de Worker, de schermen en de tests gebruiken dezelfde code.
//
// De grens van 5 respondenten staat alleen hier. src/lib/schalen.js geeft hem door aan de server;
// geen instelling kan hem verlagen (drempelVan).
//
// Wat hier staat (BOUWPLAN §3.1):
// - verbergReeks / onderdrukKolom / onderdrukAlles: cellen van één reeks of kolom verbergen, met aanvullend
//   verbergen zodat een klein aantal niet uit het totaal is terug te rekenen;
// - verdeelInGroepen: groepen van één indeling (bijv. afdeling). Twee manieren:
//   'samenvoegen' (dashboard: kleine groepen samen als "Overige groepen samen", met aantal) en
//   'weglaten' (Analyse: kleine groepen worden genoemd, zonder getallen). Op dezelfde indeling verbergen
//   beide precies dezelfde groepen;
// - maskeerKruistabel / maskeer: cellen van een kruistabel;
// - maskeerVerdeling: de verdeling van een achtergrondvraag (kenmerk of uitsplitsvraag);
// - veiligAandeel, weggevallenVeilig, verzuimToonbaar: losse controles.

/** Minimaal aantal respondenten achter elk getal dat we laten zien. */
export const DREMPEL = 5;

/** Teken voor een verborgen cel in nieuwe uitvoer (Overzicht, werkbank, nieuwe rapporthoofdstukken). */
export const VERBORGEN = '×';

export const VERBORGEN_UITLEG = '× = niet getoond: minder dan 5 respondenten, of verborgen zodat een klein aantal niet terug te rekenen is.';

/** Naam van de samengevoegde groep kleine groepen. */
export const LABEL_OVERIG = 'Overige groepen samen';

/** De grens die echt geldt: een instelling mag hem verhogen, nooit verlagen. */
export const drempelVan = (instellingen) => Math.max(DREMPEL, Number(instellingen?.drempel) || DREMPEL);

const som = (lijst, f = (x) => x) => lijst.reduce((t, x) => t + f(x), 0);

// ---------- Eén reeks of kolom ----------

/**
 * Welke aantallen van één reeks niet getoond worden (true = verborgen). Dezelfde regel als onderdrukKolom:
 * - aantallen van 1 tot d−1 zijn verborgen;
 * - is er iets verborgen, dan gaan de nullen mee (anders verraadt een "0" waar de paar respondenten zitten);
 * - daarna de kleinste zichtbare aantallen erbij, tot de verborgen aantallen samen minstens d tellen.
 * Bij gelijke aantallen gaat het eerste (in de oorspronkelijke volgorde) eerst.
 */
export function verbergReeks(aantallen, d = DREMPEL) {
  const verborgen = aantallen.map((n) => n < d);
  if (!aantallen.some((n, i) => verborgen[i] && n > 0)) return aantallen.map(() => false);
  let samen = som(aantallen.filter((_, i) => verborgen[i]));
  const rest = aantallen.map((_, i) => i).filter((i) => !verborgen[i]).sort((a, b) => aantallen[a] - aantallen[b] || a - b);
  while (samen < d && rest.length) {
    const i = rest.shift();
    verborgen[i] = true;
    samen += aantallen[i];
  }
  return verborgen;
}

/**
 * Verbergt in één kolom (thema of vraag) de cellen met te weinig respondenten, en zo nodig
 * de kleinste andere cellen erbij, zodat de verborgen cellen samen minstens DREMPEL respondenten
 * tellen en niet uit het totaal ("Iedereen") zijn terug te rekenen.
 * Cellen zonder antwoorden (n = 0) gaan mee als er iets verborgen wordt; anders zou een "–"
 * verraden in welke groep de paar respondenten zitten. Geeft true als er iets veranderde.
 * (Ongewijzigd overgenomen uit src/routes/dashboard.js; cellen: { n, verborgen? }.)
 */
export function onderdrukKolom(cellen, d = DREMPEL) {
  const klein = cellen.filter((c) => c.verborgen || c.n < d);
  if (!klein.some((c) => c.verborgen || c.n > 0)) return false;
  let veranderd = false;
  for (const c of klein) {
    if (!c.verborgen) {
      c.verborgen = true;
      veranderd = true;
    }
  }
  let samen = klein.reduce((t, c) => t + c.n, 0);
  const rest = cellen.filter((c) => !c.verborgen).sort((a, b) => a.n - b.n);
  while (samen < d && rest.length) {
    const extra = rest.shift();
    extra.verborgen = true;
    veranderd = true;
    samen += extra.n;
  }
  return veranderd;
}

/**
 * Onderdrukt alle cellen van de uitsplitsing, ook over thema- en vraagkolommen heen:
 * is in een groep een vraag verborgen, dan ook het thema van die vraag (het themagemiddelde bevat
 * die vraag), en is een thema verborgen, dan ook de vragen van dat thema (anders is het thema
 * uit de vragen terug te rekenen). Herhaalt tot er niets meer verandert.
 * (Ongewijzigd overgenomen uit src/routes/dashboard.js.)
 */
export function onderdrukAlles(groepen, themaIds, schaalVragen, d = DREMPEL) {
  let veranderd = true;
  while (veranderd) {
    veranderd = false;
    schaalVragen.forEach((_, i) => {
      if (onderdrukKolom(groepen.map((g) => g.vragen[i]), d)) veranderd = true;
    });
    for (const g of groepen) {
      themaIds.forEach((tid, t) => {
        const verborgenVraag = schaalVragen.some((q, i) => q.thema_id === tid && g.vragen[i].verborgen);
        if (verborgenVraag && !g.themas[t].verborgen) {
          g.themas[t].verborgen = true;
          veranderd = true;
        }
      });
    }
    themaIds.forEach((_, t) => {
      if (onderdrukKolom(groepen.map((g) => g.themas[t]), d)) veranderd = true;
    });
    for (const g of groepen) {
      themaIds.forEach((tid, t) => {
        if (!g.themas[t].verborgen) return;
        schaalVragen.forEach((q, i) => {
          if (q.thema_id === tid && !g.vragen[i].verborgen) {
            g.vragen[i].verborgen = true;
            veranderd = true;
          }
        });
      });
    }
  }
}

// ---------- Groepen van één indeling ----------

const groepUit = (g) => ({ sleutel: g.sleutel, label: g.label, n: g.n });

/**
 * Verdeelt de respondenten van één indeling (bijv. afdeling) in groepen die getoond mogen worden.
 * groepen: { sleutel, label, n }[] in de volgorde van de antwoordmogelijkheden; "Niet ingevuld" is een gewone
 * groep (sleutel null) als n > 0.
 *
 * strategie 'samenvoegen' (dashboard, uitsplitsing):
 * - een groep met minstens d respondenten wordt apart getoond, een groep zonder respondenten niet;
 * - tellen de kleine groepen samen minder dan d, dan gaat ook de kleinste getoonde groep erbij (anders is de
 *   kleine groep uit het totaal min de getoonde groepen terug te rekenen);
 * - tellen ze samen minstens d en blijft er een groep over, dan worden ze één groep "Overige groepen samen" met n;
 *   anders blijven ze verborgen, zonder aantal;
 * - de labels noemen ALLE groepen die niet apart getoond worden, ook die zonder respondenten. Anders verraadt
 *   de lijst welke antwoordmogelijkheden wel respondenten hebben.
 * strategie 'weglaten' (Analyse, stap voor stap): groepen onder d doen niet mee en worden alleen genoemd
 * (reden 'klein', ook groepen zonder respondenten); is wat verborgen blijft samen meer dan 0 maar minder dan d,
 * dan doet ook de kleinste meedoende groep niet mee (reden 'terugrekenen'). extraVerborgen = respondenten die
 * wel meetellen in het totaal maar in geen groep zitten (bijv. de indelingsvraag oversloegen).
 *
 * Op dezelfde groepen verbergen beide strategieën precies dezelfde groepen.
 * @returns {{ zichtbaar: {sleutel,label,n}[],
 *             samengevoegd: {label, n, labels: string[], sleutels: any[]} | null,
 *             verborgen: {labels: string[], sleutels: any[]} | null,
 *             weggelaten: {sleutel, label, reden: 'klein'|'terugrekenen'}[] }}
 */
export function verdeelInGroepen(groepen, { d = DREMPEL, strategie = 'samenvoegen', extraVerborgen = 0 } = {}) {
  if (strategie === 'weglaten') {
    const mee = groepen.filter((g) => g.n >= d);
    const klein = groepen.filter((g) => g.n < d);
    let verborgen = extraVerborgen + som(klein, (g) => g.n);
    const ookNiet = [];
    while (verborgen > 0 && verborgen < d && mee.length) {
      let k = 0;
      mee.forEach((g, i) => {
        if (g.n < mee[k].n) k = i;
      });
      const [g] = mee.splice(k, 1);
      ookNiet.push(g);
      verborgen += g.n;
    }
    return {
      zichtbaar: mee.map(groepUit),
      samengevoegd: null,
      verborgen: null,
      weggelaten: [
        ...klein.map((g) => ({ sleutel: g.sleutel, label: g.label, reden: 'klein' })),
        ...ookNiet.map((g) => ({ sleutel: g.sleutel, label: g.label, reden: 'terugrekenen' })),
      ],
    };
  }
  if (strategie !== 'samenvoegen') throw new Error(`Onbekende strategie: ${strategie}`);

  const metAntwoorden = groepen.filter((g) => g.n > 0);
  const klein = metAntwoorden.filter((g) => g.n < d);
  let groot = metAntwoorden.filter((g) => g.n >= d);
  if (klein.length && som(klein, (g) => g.n) < d && groot.length) {
    // De kleinste getoonde groep (bij gelijke aantallen de eerste) gaat er ook in op.
    const ook = groot.reduce((a, b) => (b.n < a.n ? b : a));
    groot = groot.filter((g) => g !== ook);
  }
  const uit = { zichtbaar: groot.map(groepUit), samengevoegd: null, verborgen: null, weggelaten: [] };
  if (!klein.length) return uit;
  const nietApart = groepen.filter((g) => !groot.includes(g));
  const samen = som(nietApart, (g) => g.n);
  const labels = nietApart.map((g) => g.label);
  const sleutels = nietApart.map((g) => g.sleutel);
  if (samen >= d && groot.length) uit.samengevoegd = { label: LABEL_OVERIG, n: samen, labels, sleutels };
  else uit.verborgen = { labels, sleutels };
  return uit;
}

// ---------- Kruistabellen ----------

/**
 * Bepaalt welke cellen van een kruistabel niet getoond worden (true = verborgen).
 * - Elke cel met minder dan `drempel` respondenten is verborgen, ook een lege cel.
 * - In elke rij en kolom met een verborgen cel moeten er minstens twee verborgen zijn, die samen
 *   minstens `drempel` tellen. Anders is een kleine cel terug te rekenen uit de rij- en kolomtotalen
 *   (die staan op het dashboard). Zo nodig verdwijnt daarom ook de kleinste cel die nog zichtbaar is.
 * Het scherm toont alle verborgen cellen op dezelfde manier: wie kan zien welke cellen klein zijn en
 * welke alleen ter bescherming zijn verborgen, kan soms alsnog terugrekenen.
 * (Ongewijzigd overgenomen uit schermen/analyse.js.)
 */
export function maskeerKruistabel(tabel, drempel = DREMPEL) {
  const verborgen = tabel.map((rij) => rij.map((c) => c < drempel));
  const lijnen = [];
  tabel.forEach((rij, i) => lijnen.push(rij.map((_, j) => [i, j])));
  tabel[0].forEach((_, j) => lijnen.push(tabel.map((__, i) => [i, j])));
  let veranderd = true;
  while (veranderd) {
    veranderd = false;
    for (const lijn of lijnen) {
      const weg = lijn.filter(([i, j]) => verborgen[i][j]);
      if (!weg.length) continue;
      const som = weg.reduce((t, [i, j]) => t + tabel[i][j], 0);
      if (weg.length >= 2 && som >= drempel) continue;
      const zichtbaar = lijn.filter(([i, j]) => !verborgen[i][j]).sort((p, q) => tabel[p[0]][p[1]] - tabel[q[0]][q[1]]);
      if (!zichtbaar.length) continue;
      verborgen[zichtbaar[0][0]][zichtbaar[0][1]] = true;
      veranderd = true;
    }
  }
  return verborgen;
}

/**
 * Algemene vorm van maskeerKruistabel (D2 §7.3): één verbergpatroon voor een of meer tabellen van dezelfde vorm.
 * tabellen[0] is de hoofdtabel; de andere zijn verschiltabellen met een buurselectie (regel D). vooraf: cellen die
 * hoe dan ook verborgen zijn (true). In elke rij en kolom met een verborgen cel geldt:
 * - hoofdtabel: minstens twee verborgen cellen die samen minstens d tellen;
 * - verschiltabel: de verborgen cellen tellen samen 0 of minstens d.
 * Anders gaat de zichtbare cel met het kleinste aantal in de hoofdtabel er ook bij. Met één tabel en zonder
 * vooraf is de uitkomst gelijk aan maskeerKruistabel.
 */
export function maskeer(tabellen, d = DREMPEL, vooraf = null) {
  const hoofd = tabellen[0];
  const verborgen = hoofd.map((rij, i) => rij.map((c, j) => vooraf?.[i]?.[j] === true || c < d));
  const lijnen = [];
  hoofd.forEach((rij, i) => lijnen.push(rij.map((_, j) => [i, j])));
  (hoofd[0] || []).forEach((_, j) => lijnen.push(hoofd.map((__, i) => [i, j])));
  let veranderd = true;
  while (veranderd) {
    veranderd = false;
    for (const lijn of lijnen) {
      const weg = lijn.filter(([i, j]) => verborgen[i][j]);
      if (!weg.length) continue;
      const fout = tabellen.some((t, k) => {
        const s = weg.reduce((tot, [i, j]) => tot + t[i][j], 0);
        return k === 0 ? !(weg.length >= 2 && s >= d) : !(s === 0 || s >= d);
      });
      if (!fout) continue;
      const zichtbaar = lijn.filter(([i, j]) => !verborgen[i][j]).sort((p, q) => hoofd[p[0]][p[1]] - hoofd[q[0]][q[1]]);
      if (!zichtbaar.length) continue;
      verborgen[zichtbaar[0][0]][zichtbaar[0][1]] = true;
      veranderd = true;
    }
  }
  return verborgen;
}

// ---------- Achtergrondvragen ----------

const pctVan = (deel, geheel) => (geheel ? (deel / geheel) * 100 : null);

/**
 * De verdeling van een achtergrondvraag (kenmerk of uitsplitsvraag) over ALLE respondenten van de vragenlijst
 * (K M2, PR-04). De aantallen per antwoord plus "Niet ingevuld" gaan door verbergReeks.
 * verdeling: { waarde, label, aantal }[] (alleen de antwoordmogelijkheden); lijstN: respondenten van de lijst.
 * - percentages zijn van lijstN (dus inclusief "Niet ingevuld");
 * - verborgen aantallen en percentages zijn null;
 * - n_beantwoord is null zodra er iets verborgen is (anders volgt "Niet ingevuld" uit lijstN − n_beantwoord).
 */
export function maskeerVerdeling(verdeling, lijstN, d = DREMPEL) {
  const beantwoord = som(verdeling, (v) => v.aantal);
  const rijen = [...verdeling.map((v) => ({ waarde: v.waarde, label: v.label, aantal: v.aantal })),
    { waarde: 'niet_ingevuld', label: 'Niet ingevuld', aantal: Math.max(0, lijstN - beantwoord) }];
  const verborgen = verbergReeks(rijen.map((r) => r.aantal), d);
  const iets = verborgen.some(Boolean);
  return {
    verdeling: rijen.map((r, i) => ({
      waarde: r.waarde,
      label: r.label,
      aantal: verborgen[i] ? null : r.aantal,
      percentage: verborgen[i] ? null : pctVan(r.aantal, lijstN),
      verborgen: verborgen[i],
    })),
    n_beantwoord: iets ? null : beantwoord,
    iets_verborgen: iets,
  };
}

// ---------- Losse controles ----------

/** Mag het aandeel a van b getoond worden? Beide delen (a en b − a) moeten minstens d zijn; 0 telt als klein. */
export function veiligAandeel(a, b, d = DREMPEL) {
  return a >= d && b - a >= d;
}

/** B7: een score die gedeeltelijk ingevulde respondenten weglaat, mag alleen bij 0 of minstens d weggevallen. */
export function weggevallenVeilig(weggevallen, d = DREMPEL) {
  return weggevallen === 0 || weggevallen >= d;
}

/**
 * Verzuimcijfers van één groep (B4): alleen bij minstens minN medewerkers (standaard 10, nooit minder dan d) en
 * als niemand meer dan de helft van de verzuimdagen heeft (anders bepaalt één langdurig zieke het cijfer).
 * @returns {{ toonbaar: boolean, reden: null|'klein'|'dominant' }}
 */
export function verzuimToonbaar({ n, dagenPerPersoon = [] }, { minN = 10, d = DREMPEL } = {}) {
  const grens = Math.max(Number(minN) || 0, d);
  if (!(n >= grens)) return { toonbaar: false, reden: 'klein' };
  const dagen = dagenPerPersoon.filter((x) => Number.isFinite(x) && x > 0);
  const totaal = som(dagen);
  if (totaal > 0 && Math.max(...dagen) / totaal > 0.5) return { toonbaar: false, reden: 'dominant' };
  return { toonbaar: true, reden: null };
}
