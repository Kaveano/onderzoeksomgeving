// Statistiek voor de beheeromgeving: beschrijvende maten, toetsen en effectgroottes.
// Zuivere rekenfuncties zonder DOM en zonder afhankelijkheden, zodat ze ook in Node te testen zijn.
// De uitkomsten zijn gecontroleerd met SciPy (zie test/statistiek.test.mjs).
//
// Afspraken:
// - Kan een berekening niet (te weinig waarden, geen spreiding, maar één groep), dan is het
//   antwoord null. Er komt nooit NaN of Infinity uit.
// - Alleen eindige getallen tellen mee. null, undefined, NaN en tekst (zoals 'weet_niet') worden
//   overgeslagen; bij paren (pearson, spearman) vervalt dan het hele paar.
// - Bij twee groepen (a, b) betekent een positieve uitkomst: b ligt hoger dan a.
// - Alle toetsen zijn tweezijdig, alle betrouwbaarheidsintervallen zijn 95%.
// - Deze functies kennen de privacyregel niet. Het scherm dat de uitkomsten toont, moet zelf
//   zorgen dat groepen met minder dan 5 respondenten niet worden getoond.

const Z975 = 1.959963984540054; // 97,5e percentiel van de standaardnormale verdeling
const EPS = 1e-15; // gewenste relatieve nauwkeurigheid van reeksen en kettingbreuken
const KLEINST = 1e-300; // voorkomt delen door nul in de kettingbreuken
const MAX_STAPPEN = 100000;

// ---------- Hulpjes ----------

function eindig(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function isLijst(xs) {
  return !!xs && typeof xs !== 'string' && typeof xs[Symbol.iterator] === 'function';
}

/** Alleen de eindige getallen uit een lijst. */
function schoon(xs) {
  const uit = [];
  if (!isLijst(xs)) return uit;
  for (const x of xs) if (eindig(x)) uit.push(x);
  return uit;
}

/** Groepen zonder ongeldige waarden; lege groepen vervallen. */
function schoneGroepen(groepen) {
  if (!isLijst(groepen)) return [];
  const uit = [];
  for (const g of groepen) {
    const v = schoon(g);
    if (v.length) uit.push(v);
  }
  return uit;
}

/** Paren (x[i], y[i]) waarvan beide waarden geldig zijn. Ongelijke lengte: null. */
function schoneParen(x, y) {
  if (!isLijst(x) || !isLijst(y)) return null;
  const xa = Array.from(x);
  const ya = Array.from(y);
  if (xa.length !== ya.length) return null;
  const xs = [];
  const ys = [];
  for (let i = 0; i < xa.length; i++) {
    if (eindig(xa[i]) && eindig(ya[i])) {
      xs.push(xa[i]);
      ys.push(ya[i]);
    }
  }
  return { xs, ys };
}

function begrens(x, laag, hoog) {
  return x < laag ? laag : x > hoog ? hoog : x;
}

/** Geeft het resultaat terug, of null als er ergens NaN of Infinity in staat. */
function klaar(uit) {
  for (const waarde of Object.values(uit)) {
    if (waarde !== null && !Number.isFinite(waarde)) return null;
  }
  return uit;
}

/**
 * Aantal, gemiddelde en kwadratensom (som van de gekwadrateerde afwijkingen van het gemiddelde).
 * Zijn alle waarden gelijk, dan is de kwadratensom precies 0 (zonder afrondingsruis).
 */
export function momenten(v) {
  const n = v.length;
  if (n === 0) return { n: 0, m: null, ss: 0, min: null, max: null };
  let som = 0;
  let min = v[0];
  let max = v[0];
  for (const x of v) {
    som += x;
    if (x < min) min = x;
    if (x > max) max = x;
  }
  if (min === max) return { n, m: min, ss: 0, min, max };
  const m = som / n;
  let ss = 0;
  let rest = 0; // som van de afwijkingen: wiskundig 0, in de praktijk een klein afrondingsrestje
  for (const x of v) {
    const afwijking = x - m;
    ss += afwijking * afwijking;
    rest += afwijking;
  }
  return { n, m, ss: Math.max(0, ss - (rest * rest) / n), min, max };
}

/**
 * Rangnummers (1 = laagste); gelijke waarden krijgen het gemiddelde van hun rangnummers.
 * knopen = som van (t³ − t) over alle groepjes van t gelijke waarden (voor de correctie voor gelijken).
 */
export function rangnummers(v) {
  const n = v.length;
  const volgorde = Array.from({ length: n }, (_, i) => i).sort((p, q) => v[p] - v[q]);
  const rangen = new Array(n);
  let knopen = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && v[volgorde[j + 1]] === v[volgorde[i]]) j++;
    const rang = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) rangen[volgorde[k]] = rang;
    const t = j - i + 1;
    knopen += t * t * t - t;
    i = j + 1;
  }
  return { rangen, knopen };
}

/** Correlatiecoëfficiënt van twee even lange lijsten, of null als een van beide geen spreiding heeft. */
function correlatie(xs, ys) {
  const X = momenten(xs);
  const Y = momenten(ys);
  if (!(X.ss > 0) || !(Y.ss > 0)) return null;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) sxy += (xs[i] - X.m) * (ys[i] - Y.m);
  const r = sxy / Math.sqrt(X.ss * Y.ss);
  return Number.isFinite(r) ? begrens(r, -1, 1) : null;
}

// ---------- Kansverdelingen ----------

const LANCZOS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];
const HALVE_LN_2PI = 0.9189385332046727; // ln(2π) / 2

/** Natuurlijke logaritme van |Γ(x)| (Lanczos-benadering). null bij ongeldige x of een pool (0, −1, −2, …). */
export function logGamma(x) {
  if (!eindig(x)) return null;
  if (x <= 0 && Number.isInteger(x)) return null;
  if (x < 0.5) {
    // Spiegelformule: Γ(x) · Γ(1 − x) = π / sin(πx)
    const uit = Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
    return Number.isFinite(uit) ? uit : null;
  }
  const y = x - 1;
  let som = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) som += LANCZOS[i] / (y + i);
  const t = y + 7.5;
  const uit = HALVE_LN_2PI + (y + 0.5) * Math.log(t) - t + Math.log(som);
  return Number.isFinite(uit) ? uit : null;
}

/** Reeks voor de onvolledige gammafunctie P(a, x); convergeert snel als x < a + 1. */
function gammaReeks(a, x) {
  let ap = a;
  let term = 1 / a;
  let som = term;
  for (let n = 0; n < MAX_STAPPEN; n++) {
    ap += 1;
    term *= x / ap;
    som += term;
    if (Math.abs(term) < Math.abs(som) * EPS) break;
  }
  return som * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/** Kettingbreuk (Lentz) voor Q(a, x) = 1 − P(a, x); convergeert snel als x >= a + 1. */
function gammaKettingbreuk(a, x) {
  let b = x + 1 - a;
  let c = 1 / KLEINST;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_STAPPEN; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < KLEINST) d = KLEINST;
    c = b + an / c;
    if (Math.abs(c) < KLEINST) c = KLEINST;
    d = 1 / d;
    const factor = d * c;
    h *= factor;
    if (Math.abs(factor - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Bovenstaart Q(a, x) van de geregulariseerde onvolledige gammafunctie (a > 0, x willekeurig). */
function gammaQ(a, x) {
  if (!(x > 0)) return 1;
  if (x === Infinity) return 0;
  const q = x < a + 1 ? 1 - gammaReeks(a, x) : gammaKettingbreuk(a, x);
  return begrens(q, 0, 1);
}

/** Geregulariseerde onvolledige gammafunctie P(a, x) (onderstaart), voor a > 0 en x >= 0. */
export function incGammaP(a, x) {
  if (!eindig(a) || !eindig(x) || a <= 0 || x < 0) return null;
  if (x === 0) return 0;
  const p = x < a + 1 ? gammaReeks(a, x) : 1 - gammaKettingbreuk(a, x);
  return Number.isFinite(p) ? begrens(p, 0, 1) : null;
}

/** Kettingbreuk (Lentz) voor de onvolledige bètafunctie. */
function betaKettingbreuk(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < KLEINST) d = KLEINST;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_STAPPEN; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < KLEINST) d = KLEINST;
    c = 1 + aa / c;
    if (Math.abs(c) < KLEINST) c = KLEINST;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < KLEINST) d = KLEINST;
    c = 1 + aa / c;
    if (Math.abs(c) < KLEINST) c = KLEINST;
    d = 1 / d;
    const factor = d * c;
    h *= factor;
    if (Math.abs(factor - 1) < EPS) break;
  }
  return h;
}

/**
 * Geregulariseerde onvolledige bètafunctie I_x(a, b), met y = 1 − x apart meegegeven.
 * Zo blijft de uitkomst nauwkeurig als x heel dicht bij 0 of 1 ligt.
 */
function betaGeregulariseerd(a, b, x, y) {
  if (!(x > 0)) return 0;
  if (!(y > 0)) return 1;
  const lnX = x > 0.5 ? Math.log1p(-y) : Math.log(x);
  const lnY = y > 0.5 ? Math.log1p(-x) : Math.log(y);
  const voor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * lnX + b * lnY);
  const uit = x < (a + 1) / (a + b + 2)
    ? (voor * betaKettingbreuk(a, b, x)) / a
    : 1 - (voor * betaKettingbreuk(b, a, y)) / b;
  return begrens(uit, 0, 1);
}

/** Geregulariseerde onvolledige bètafunctie I_x(a, b), voor a > 0, b > 0 en 0 <= x <= 1. */
export function incBeta(a, b, x) {
  if (!eindig(a) || !eindig(b) || !eindig(x) || a <= 0 || b <= 0 || x < 0 || x > 1) return null;
  const uit = betaGeregulariseerd(a, b, x, 1 - x);
  return Number.isFinite(uit) ? uit : null;
}

/** Kans dat een standaardnormale waarde in absolute zin minstens |z| is (tweezijdig). */
function normaalTweezijdig(z) {
  return gammaQ(0.5, 0.5 * z * z);
}

/** Tweezijdige overschrijdingskans van |t| bij df vrijheidsgraden. */
function tTweezijdig(t, df) {
  const t2 = t * t;
  const noemer = df + t2;
  if (!Number.isFinite(noemer)) return 0;
  return betaGeregulariseerd(df / 2, 0.5, df / noemer, t2 / noemer);
}

/** Standaardnormale verdeling: kans op een waarde kleiner dan of gelijk aan z. */
export function normaalCdf(z) {
  if (!eindig(z)) return null;
  const staart = 0.5 * normaalTweezijdig(z);
  return z > 0 ? 1 - staart : staart;
}

/** t-verdeling met df vrijheidsgraden: kans op een waarde kleiner dan of gelijk aan t. */
export function tCdf(t, df) {
  if (!eindig(t) || !eindig(df) || df <= 0) return null;
  const staart = 0.5 * tTweezijdig(t, df);
  if (!Number.isFinite(staart)) return null;
  return t > 0 ? 1 - staart : staart;
}

/**
 * Omgekeerde van tCdf: de t-waarde waar een kans p onder ligt (bijv. p = 0,975 voor een 95%-interval).
 * Opgelost met de methode van Newton op de staartkans; die komt hier altijd van één kant bij de oplossing uit.
 */
export function tKwantiel(p, df) {
  if (!eindig(p) || !eindig(df) || p <= 0 || p >= 1 || df <= 0) return null;
  if (p === 0.5) return 0;
  const staart = p < 0.5 ? p : 1 - p;
  const lnC = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  let t = 1;
  for (let i = 0; i < 2000; i++) {
    const dichtheid = Math.exp(lnC - ((df + 1) / 2) * Math.log1p((t * t) / df));
    const stap = (0.5 * tTweezijdig(t, df) - staart) / dichtheid;
    if (!Number.isFinite(stap)) return null;
    t = Math.max(0, t + stap);
    if (Math.abs(stap) <= 1e-13 * Math.max(1, t)) return p < 0.5 ? -t : t;
  }
  return null;
}

/** F-verdeling: kans op een waarde groter dan f (bovenstaart). */
export function fSf(f, df1, df2) {
  if (!eindig(f) || !eindig(df1) || !eindig(df2) || df1 <= 0 || df2 <= 0) return null;
  if (f <= 0) return 1;
  const noemer = df2 + df1 * f;
  if (!Number.isFinite(noemer)) return 0;
  const uit = betaGeregulariseerd(df2 / 2, df1 / 2, df2 / noemer, (df1 * f) / noemer);
  return Number.isFinite(uit) ? uit : null;
}

/** Chi-kwadraatverdeling: kans op een waarde groter dan x (bovenstaart). */
export function chi2Sf(x, df) {
  if (!eindig(x) || !eindig(df) || df <= 0) return null;
  const uit = gammaQ(df / 2, x / 2);
  return Number.isFinite(uit) ? uit : null;
}

// ---------- Beschrijven ----------

/**
 * Beschrijvende maten van een lijst getallen.
 * sd = standaarddeviatie van een steekproef (delen door n − 1); null als er maar één waarde is.
 */
export function beschrijf(xs) {
  const v = schoon(xs);
  const { n, m, ss, min, max } = momenten(v);
  if (n === 0) return null;
  const gesorteerd = v.slice().sort((p, q) => p - q);
  const midden = n >> 1;
  const mediaan = n % 2 ? gesorteerd[midden] : (gesorteerd[midden - 1] + gesorteerd[midden]) / 2;
  return klaar({ n, gemiddelde: m, sd: n < 2 ? null : Math.sqrt(ss / (n - 1)), mediaan, min, max });
}

// ---------- Twee groepen vergelijken ----------

/**
 * t-toets van Welch voor twee onafhankelijke groepen (ongelijke spreiding toegestaan).
 * verschil = gemiddelde van b min gemiddelde van a; t heeft hetzelfde teken.
 * ciLaag en ciHoog: 95%-betrouwbaarheidsinterval van dat verschil. df volgens Welch–Satterthwaite.
 * Nodig: in elke groep minstens 2 waarden en in minstens één groep spreiding.
 */
export function welchT(a, b) {
  const A = momenten(schoon(a));
  const B = momenten(schoon(b));
  if (A.n < 2 || B.n < 2) return null;
  const va = A.ss / (A.n - 1) / A.n;
  const vb = B.ss / (B.n - 1) / B.n;
  const se2 = va + vb;
  if (!(se2 > 0)) return null;
  const se = Math.sqrt(se2);
  const verschil = B.m - A.m;
  const t = verschil / se;
  const df = (se2 * se2) / ((va * va) / (A.n - 1) + (vb * vb) / (B.n - 1));
  if (!(df > 0) || !Number.isFinite(df)) return null;
  const kritiek = tKwantiel(0.975, df);
  if (kritiek === null) return null;
  return klaar({
    t,
    df,
    p: tTweezijdig(t, df),
    verschil,
    ciLaag: verschil - kritiek * se,
    ciHoog: verschil + kritiek * se,
  });
}

/**
 * Effectgrootte bij twee groepen.
 * d = Cohens d: (gemiddelde b − gemiddelde a) / gezamenlijke standaarddeviatie.
 * g = Hedges' g: d met de correctie voor kleine groepen, factor 1 − 3 / (4·(n1 + n2) − 9).
 * ciLaag en ciHoog: 95%-betrouwbaarheidsinterval van g (normale benadering, Borenstein e.a. 2009).
 * Nodig: in elke groep minstens 2 waarden en in minstens één groep spreiding.
 */
export function cohensD(a, b) {
  const A = momenten(schoon(a));
  const B = momenten(schoon(b));
  if (A.n < 2 || B.n < 2) return null;
  const df = A.n + B.n - 2;
  const variantie = (A.ss + B.ss) / df;
  if (!(variantie > 0)) return null;
  const d = (B.m - A.m) / Math.sqrt(variantie);
  const correctie = 1 - 3 / (4 * df - 1);
  const g = correctie * d;
  const n = A.n + B.n;
  const se = correctie * Math.sqrt(n / (A.n * B.n) + (d * d) / (2 * n));
  return klaar({ d, g, ciLaag: g - Z975 * se, ciHoog: g + Z975 * se });
}

/**
 * Toets van Mann–Whitney (rangsomtoets van Wilcoxon) voor twee onafhankelijke groepen.
 * Normale benadering met correctie voor gelijke waarden en continuïteitscorrectie.
 * u = U van groep b: het aantal paren waarin b hoger is dan a (gelijken tellen half).
 *     De U van groep a is n1·n2 − u. (Gelijk aan scipy.stats.mannwhitneyu(b, a).)
 * z = positief als b hoger ligt dan a; r = |z| / √(n1 + n2) als effectgrootte.
 * Nodig: in elke groep minstens 1 waarde en niet alle waarden gelijk.
 */
export function mannWhitney(a, b) {
  const A = schoon(a);
  const B = schoon(b);
  const n1 = A.length;
  const n2 = B.length;
  if (n1 < 1 || n2 < 1) return null;
  const n = n1 + n2;
  const { rangen, knopen } = rangnummers(A.concat(B));
  let rangsomB = 0;
  for (let i = n1; i < n; i++) rangsomB += rangen[i];
  const u = rangsomB - (n2 * (n2 + 1)) / 2;
  const variantie = ((n1 * n2) / 12) * (n + 1 - knopen / (n * (n - 1)));
  if (!(variantie > 0)) return null;
  const afstand = u - (n1 * n2) / 2;
  const z = (Math.sign(afstand) * Math.max(0, Math.abs(afstand) - 0.5)) / Math.sqrt(variantie);
  return klaar({ u, z, p: normaalTweezijdig(z), r: Math.abs(z) / Math.sqrt(n) });
}

// ---------- Meer dan twee groepen vergelijken ----------

/**
 * Klassieke variantieanalyse (one-way ANOVA). groepen = lijst van lijsten met waarden.
 * etaKwadraat = deel van de spreiding dat samenhangt met de groepsindeling (0 tot 1).
 * Lege groepen tellen niet mee. Nodig: minstens 2 groepen, meer waarden dan groepen,
 * en spreiding binnen minstens één groep.
 */
export function anova(groepen) {
  const gs = schoneGroepen(groepen).map(momenten);
  const k = gs.length;
  if (k < 2) return null;
  let n = 0;
  let som = 0;
  let binnen = 0;
  for (const g of gs) {
    n += g.n;
    som += g.n * g.m;
    binnen += g.ss;
  }
  const df1 = k - 1;
  const df2 = n - k;
  if (df2 < 1 || !(binnen > 0)) return null;
  const totaalGemiddelde = som / n;
  let tussen = 0;
  for (const g of gs) tussen += g.n * (g.m - totaalGemiddelde) * (g.m - totaalGemiddelde);
  const f = tussen / df1 / (binnen / df2);
  return klaar({ f, df1, df2, p: fSf(f, df1, df2), etaKwadraat: tussen / (tussen + binnen) });
}

/**
 * Variantieanalyse van Welch: als de groepen een ongelijke spreiding of grootte hebben.
 * Lege groepen tellen niet mee. Nodig: minstens 2 groepen, elk met minstens 2 waarden en spreiding.
 */
export function welchAnova(groepen) {
  const gs = schoneGroepen(groepen).map(momenten);
  const k = gs.length;
  if (k < 2) return null;
  const gewichten = [];
  let gewichtTotaal = 0;
  let gewogenSom = 0;
  for (const g of gs) {
    if (g.n < 2 || !(g.ss > 0)) return null;
    const w = g.n / (g.ss / (g.n - 1));
    gewichten.push(w);
    gewichtTotaal += w;
    gewogenSom += w * g.m;
  }
  const gewogenGemiddelde = gewogenSom / gewichtTotaal;
  let tussen = 0;
  let lambda = 0;
  gs.forEach((g, i) => {
    const w = gewichten[i];
    tussen += w * (g.m - gewogenGemiddelde) * (g.m - gewogenGemiddelde);
    const rest = 1 - w / gewichtTotaal;
    lambda += (rest * rest) / (g.n - 1);
  });
  if (!(lambda > 0)) return null;
  const df1 = k - 1;
  const df2 = (k * k - 1) / (3 * lambda);
  const f = tussen / df1 / (1 + (2 * (k - 2) * lambda) / (k * k - 1));
  return klaar({ f, df1, df2, p: fSf(f, df1, df2) });
}

/**
 * Toets van Kruskal–Wallis: vergelijkt groepen op rangnummers, met correctie voor gelijke waarden.
 * epsilonKwadraat = H / (N − 1) als effectgrootte (0 tot 1).
 * Lege groepen tellen niet mee. Nodig: minstens 2 groepen en niet alle waarden gelijk.
 */
export function kruskalWallis(groepen) {
  const gs = schoneGroepen(groepen);
  const k = gs.length;
  if (k < 2) return null;
  const alles = [];
  for (const g of gs) for (const x of g) alles.push(x);
  const n = alles.length;
  const { rangen, knopen } = rangnummers(alles);
  const correctie = 1 - knopen / (n * n * n - n);
  if (!(correctie > 0)) return null;
  // H = 12 / (N(N+1)) · Σ n_i · (gemiddelde rang van groep i − (N+1)/2)²
  let som = 0;
  let start = 0;
  for (const g of gs) {
    let rangsom = 0;
    for (let i = start; i < start + g.length; i++) rangsom += rangen[i];
    const afwijking = rangsom / g.length - (n + 1) / 2;
    som += g.length * afwijking * afwijking;
    start += g.length;
  }
  const h = ((12 / (n * (n + 1))) * som) / correctie;
  const df = k - 1;
  return klaar({ h, df, p: chi2Sf(h, df), epsilonKwadraat: h / (n - 1) });
}

// ---------- Samenhang ----------

/**
 * Correlatie van Pearson tussen x en y (twee even lange lijsten; x[i] hoort bij y[i]).
 * ciLaag en ciHoog: 95%-betrouwbaarheidsinterval via de z-transformatie van Fisher
 * (null bij precies 3 paren, want dan bestaat het niet).
 * Bij een volmaakte samenhang (r = 1 of −1) is t null en p 0.
 * Nodig: minstens 3 geldige paren en spreiding in zowel x als y.
 */
export function pearson(x, y) {
  const paren = schoneParen(x, y);
  if (!paren) return null;
  const n = paren.xs.length;
  if (n < 3) return null;
  const r = correlatie(paren.xs, paren.ys);
  if (r === null) return null;
  const df = n - 2;
  const volmaakt = Math.abs(r) === 1;
  const t = volmaakt ? null : r * Math.sqrt(df / ((1 - r) * (1 + r)));
  let ciLaag = null;
  let ciHoog = null;
  if (n > 3) {
    if (volmaakt) {
      ciLaag = r;
      ciHoog = r;
    } else {
      const z = Math.atanh(r);
      const marge = Z975 / Math.sqrt(n - 3);
      ciLaag = Math.tanh(z - marge);
      ciHoog = Math.tanh(z + marge);
    }
  }
  return klaar({ r, n, t, df, p: volmaakt ? 0 : tTweezijdig(t, df), ciLaag, ciHoog });
}

/**
 * Rangcorrelatie van Spearman: de correlatie van Pearson op de rangnummers
 * (gelijke waarden krijgen een gemiddeld rangnummer). p via de t-benadering.
 * Nodig: minstens 3 geldige paren en spreiding in zowel x als y.
 */
export function spearman(x, y) {
  const paren = schoneParen(x, y);
  if (!paren) return null;
  const n = paren.xs.length;
  if (n < 3) return null;
  const rho = correlatie(rangnummers(paren.xs).rangen, rangnummers(paren.ys).rangen);
  if (rho === null) return null;
  const df = n - 2;
  const p = Math.abs(rho) === 1 ? 0 : tTweezijdig(rho * Math.sqrt(df / ((1 - rho) * (1 + rho))), df);
  return klaar({ rho, n, p });
}

/**
 * Cronbachs alfa: hoe goed een aantal vragen (items) samen één schaal vormt.
 * rijen = één rij per respondent met één waarde per item. Alleen respondenten die alle items
 * hebben ingevuld tellen mee. k = aantal items (de langste rij), n = aantal volledige respondenten.
 * Alfa kan negatief uitvallen als items tegen elkaar in gaan, bijvoorbeeld bij een omgekeerd
 * gestelde vraag die nog niet is omgescoord.
 * Nodig: minstens 2 items, minstens 2 volledige respondenten en spreiding in de somscores.
 */
export function cronbachAlpha(rijen) {
  if (!Array.isArray(rijen)) return null;
  let k = 0;
  for (const rij of rijen) if (Array.isArray(rij) && rij.length > k) k = rij.length;
  if (k < 2) return null;
  const volledig = rijen.filter((rij) => Array.isArray(rij) && rij.length === k && rij.every(eindig));
  const n = volledig.length;
  if (n < 2) return null;
  let itemSpreiding = 0;
  for (let j = 0; j < k; j++) itemSpreiding += momenten(volledig.map((rij) => rij[j])).ss;
  const totaalSpreiding = momenten(volledig.map((rij) => rij.reduce((som, x) => som + x, 0))).ss;
  if (!(totaalSpreiding > 0)) return null;
  return klaar({ alpha: (k / (k - 1)) * (1 - itemSpreiding / totaalSpreiding), k, n });
}

/**
 * Chi-kwadraattoets op samenhang in een kruistabel (zonder continuïteitscorrectie).
 * tabel = rijen × kolommen met aantallen. Rijen en kolommen met totaal 0 tellen niet mee.
 * cramersV = effectgrootte (0 tot 1).
 * Nodig: een rechthoekige tabel met alleen aantallen van 0 of hoger, waarvan minstens
 * 2 rijen en 2 kolommen gevuld zijn.
 */
export function chiKwadraat(tabel) {
  if (!Array.isArray(tabel) || tabel.length < 2 || !Array.isArray(tabel[0])) return null;
  const breedte = tabel[0].length;
  const rijTotalen = [];
  const kolomTotalen = new Array(breedte).fill(0);
  let n = 0;
  for (const rij of tabel) {
    if (!Array.isArray(rij) || rij.length !== breedte) return null;
    let totaal = 0;
    for (let j = 0; j < breedte; j++) {
      const cel = rij[j];
      if (!eindig(cel) || cel < 0) return null;
      totaal += cel;
      kolomTotalen[j] += cel;
    }
    rijTotalen.push(totaal);
    n += totaal;
  }
  const rijen = rijTotalen.map((_, i) => i).filter((i) => rijTotalen[i] > 0);
  const kolommen = kolomTotalen.map((_, j) => j).filter((j) => kolomTotalen[j] > 0);
  if (rijen.length < 2 || kolommen.length < 2) return null;
  let chi2 = 0;
  for (const i of rijen) {
    for (const j of kolommen) {
      const verwacht = (rijTotalen[i] * kolomTotalen[j]) / n;
      const afwijking = tabel[i][j] - verwacht;
      chi2 += (afwijking * afwijking) / verwacht;
    }
  }
  const df = (rijen.length - 1) * (kolommen.length - 1);
  const cramersV = Math.min(1, Math.sqrt(chi2 / (n * Math.min(rijen.length - 1, kolommen.length - 1))));
  return klaar({ chi2, df, p: chi2Sf(chi2, df), cramersV });
}

/**
 * Chi-kwadraattoets op aanpassing: wijkt een verdeling af van een verwachte verdeling?
 * Bijvoorbeeld de respons per afdeling tegen het aantal medewerkers per afdeling.
 * waargenomen = aantallen per groep (respondenten); populatie = per groep het aantal in de populatie
 * (of een andere verwachte verhouding), in dezelfde volgorde. Verwacht per groep: n · P / ΣP.
 * Groepen met 0 respondenten én 0 in de populatie tellen niet mee (verwacht 0, niet in chi² en df).
 * verwacht staat in dezelfde volgorde als de invoer.
 * Gebruik alleen de getoonde (al samengevoegde) groepen: nooit verborgen cellen, anders zijn die
 * uit de uitkomst terug te rekenen.
 * Uitkomst: { chi2, df, p, n, verwacht, kleinste_verwacht }, of { reden } als toetsen niet verantwoord is:
 * - 'te_weinig_groepen': minder dan 2 groepen;
 * - 'klein': een verwacht aantal is kleiner dan 5 (vuistregel van Cochran).
 * null bij ongeldige invoer (geen lijsten van gelijke lengte met aantallen van 0 of meer).
 */
export function aanpassingsToets(waargenomen, populatie) {
  if (!Array.isArray(waargenomen) || !Array.isArray(populatie) || waargenomen.length !== populatie.length) return null;
  for (let i = 0; i < waargenomen.length; i++) {
    if (!eindig(waargenomen[i]) || waargenomen[i] < 0 || !eindig(populatie[i]) || populatie[i] < 0) return null;
  }
  const mee = waargenomen.map((o, i) => o > 0 || populatie[i] > 0);
  const k = mee.filter(Boolean).length;
  if (k < 2) return { reden: 'te_weinig_groepen' };
  let n = 0;
  let totaal = 0;
  for (let i = 0; i < waargenomen.length; i++) {
    n += waargenomen[i];
    totaal += populatie[i];
  }
  if (!(n > 0) || !(totaal > 0)) return { reden: 'klein' };
  const verwacht = populatie.map((p) => (n * p) / totaal);
  let kleinsteVerwacht = Infinity;
  let chi2 = 0;
  for (let i = 0; i < verwacht.length; i++) {
    if (!mee[i]) continue;
    if (verwacht[i] < kleinsteVerwacht) kleinsteVerwacht = verwacht[i];
    const afwijking = waargenomen[i] - verwacht[i];
    chi2 += verwacht[i] > 0 ? (afwijking * afwijking) / verwacht[i] : Infinity;
  }
  if (!(kleinsteVerwacht >= 5)) return { reden: 'klein' };
  const df = k - 1;
  const p = chi2Sf(chi2, df);
  if (!eindig(chi2) || p === null) return null;
  return { chi2, df, p, n, verwacht, kleinste_verwacht: kleinsteVerwacht };
}

/**
 * Foutmarge (95%) van een percentage in procentpunten, voor n respondenten uit een populatie van N,
 * in het ongunstigste geval (een percentage van 50%) en met correctie voor een eindige populatie:
 * 1,96 · √(0,25 / n) · √((N − n) / (N − 1)) · 100.
 * null als N onbekend is, of als n niet tussen 1 en N − 1 ligt (bij n = N is er geen steekproef).
 */
export function foutmarge(n, N) {
  if (!Number.isInteger(n) || !Number.isInteger(N) || n < 1 || N < 2 || n >= N) return null;
  const marge = Z975 * Math.sqrt(0.25 / n) * Math.sqrt((N - n) / (N - 1)) * 100;
  return Number.isFinite(marge) ? marge : null;
}

// ---------- Effectgrootte in woorden ----------

export const EFFECT_GRENZEN = new Map([
  ['d', [0.2, 0.5, 0.8]],
  ['g', [0.2, 0.5, 0.8]],
  ['r', [0.1, 0.3, 0.5]],
  ['rho', [0.1, 0.3, 0.5]],
  ['eta2', [0.01, 0.06, 0.14]],
  ['epsilon2', [0.01, 0.06, 0.14]],
  ['v', [0.1, 0.3, 0.5]],
]);
const EFFECT_WOORDEN = ['verwaarloosbaar', 'klein', 'middelgroot', 'groot'];

/**
 * Zet een effectgrootte om in een woord, volgens de gangbare vuistregels van Cohen.
 * soort: 'd' (Cohens d of Hedges' g; ook 'g'), 'r' (correlatie of r bij Mann–Whitney; ook 'rho'),
 *        'eta2', 'epsilon2', 'v' (Cramérs V). Het teken van de waarde maakt niet uit.
 * Een waarde precies op de grens hoort bij de hogere klasse (d = 0,5 is 'middelgroot').
 * Grenzen: d 0,2 / 0,5 / 0,8; r en V 0,1 / 0,3 / 0,5; eta² en epsilon² 0,01 / 0,06 / 0,14.
 * Voor Cramérs V horen deze grenzen bij tabellen met 2 rijen of 2 kolommen; bij grotere tabellen
 * is de indeling aan de voorzichtige kant.
 */
export function effectGrootte(waarde, soort) {
  const grenzen = EFFECT_GRENZEN.get(soort);
  if (!grenzen || !eindig(waarde)) return null;
  const x = Math.abs(waarde);
  let klasse = 0;
  while (klasse < grenzen.length && x >= grenzen[klasse]) klasse++;
  return EFFECT_WOORDEN[klasse];
}
