// Werkbank: kansverdelingen die statistiek.js niet heeft (D2 §6.2). Zuivere module, geen DOM.
// - Phi: de standaardnormale verdeling volgens W. J. Cody (snel en tot op ~1e-16 nauwkeurig);
// - ptukey / ptukeyBoven / qtukey: de verdeling van het gestudentiseerde bereik (Tukey HSD, Games-Howell),
//   met een dubbele Gauss–Legendre-integratie;
// - fisherExact2x2, holm, bonferroni.
// Afspraak zoals in statistiek.js: nooit NaN of Infinity; null als iets niet te berekenen is.
// Gecontroleerd met SciPy (test/werkbank-statistiek.test.mjs, test/fixtures/werkbank-referentie.json).

import { logGamma } from '../statistiek.js';

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);

// ---------- Standaardnormaal (Cody, zoals pnorm in R) ----------

const A = [2.2352520354606839287, 161.02823106855587881, 1067.6894854603709582, 18154.981253343561249, 0.065682337918207449113];
const B = [47.20258190468824187, 976.09855173777669322, 10260.932208618978205, 45507.789335026729956];
const C = [0.39894151208813466764, 8.8831497943883759412, 93.506656132177855979, 597.27027639480026226, 2494.5375852903726711,
  6848.1904505362823326, 11602.651437647350124, 9842.7148383839780218, 1.0765576773720192317e-8];
const D = [22.266688044328115691, 235.38790178262499861, 1519.377599407554805, 6485.558298266760755, 18615.571640885098091,
  34900.952721145977266, 38912.003286093271411, 19685.429676859990727];
const P = [0.21589853405795699, 0.1274011611602473639, 0.022235277870649807, 0.001421619193227893466, 2.9112874951168792e-5, 0.02307344176494017303];
const Q = [1.28426009614491121, 0.468238212480865118, 0.0659881378689285515, 0.00378239633202758244, 7.29751555083966205e-5];
const EEN_DOOR_WORTEL_2PI = 0.398942280401432677939946059934;
const WORTEL_32 = 5.656854249492380195206754896838;

/** Φ(x): kans dat een standaardnormale waarde kleiner is dan x. Werkt voor elke eindige x (ook ver in de staart). */
export function Phi(x) {
  if (!eindig(x)) return x === Infinity ? 1 : x === -Infinity ? 0 : null;
  const y = Math.abs(x);
  let onder;
  let boven;
  if (y <= 0.67448975) {
    let num = 0;
    let den = 0;
    if (y > 1.1e-16) {
      const xsq = x * x;
      num = A[4] * xsq;
      den = xsq;
      for (let i = 0; i < 3; i++) {
        num = (num + A[i]) * xsq;
        den = (den + B[i]) * xsq;
      }
    }
    const t = (x * (num + A[3])) / (den + B[3]);
    return 0.5 + t;
  }
  let t;
  if (y <= WORTEL_32) {
    let num = C[8] * y;
    let den = y;
    for (let i = 0; i < 7; i++) {
      num = (num + C[i]) * y;
      den = (den + D[i]) * y;
    }
    t = (num + C[7]) / (den + D[7]);
  } else {
    const xsq = 1 / (x * x);
    let num = P[5] * xsq;
    let den = xsq;
    for (let i = 0; i < 4; i++) {
      num = (num + P[i]) * xsq;
      den = (den + Q[i]) * xsq;
    }
    t = (xsq * (num + P[4])) / (den + Q[4]);
    t = (EEN_DOOR_WORTEL_2PI - t) / y;
  }
  const xsq = Math.trunc(y * 16) / 16;
  const del = (y - xsq) * (y + xsq);
  boven = Math.exp(-xsq * xsq * 0.5) * Math.exp(-del * 0.5) * t; // kans op een waarde groter dan |x|
  onder = 1 - boven;
  return x > 0 ? onder : boven;
}

/** Tweezijdige overschrijdingskans van een standaardnormale z. */
export function normaalTweezijdig(z) {
  if (!eindig(z)) return null;
  return Math.min(1, 2 * Phi(-Math.abs(z)));
}

// ---------- Gauss–Legendre (16 punten), eenmalig uitgerekend ----------

function gaussLegendre(n) {
  const x = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = z;
      for (let j = 2; j <= n; j++) {
        const p2 = ((2 * j - 1) * z * p1 - (j - 1) * p0) / j;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const stap = p1 / dp;
      z -= stap;
      if (Math.abs(stap) < 1e-16) break;
    }
    x[i] = z;
    w[i] = 2 / ((1 - z * z) * dp * dp);
  }
  return { x, w };
}
const GL = gaussLegendre(16);

// Binnenste integraal: vaste knooppunten op [−8, 8] (16 vakken van breedte 1), met φ(z), Φ(z) en het gewicht.
const BINNEN = (() => {
  const z = [];
  const gewicht = [];
  for (let vak = -8; vak < 8; vak++) {
    for (let i = 0; i < 16; i++) {
      const t = vak + 0.5 + 0.5 * GL.x[i];
      z.push(t);
      gewicht.push(0.5 * GL.w[i] * Math.exp(-0.5 * t * t) * EEN_DOOR_WORTEL_2PI);
    }
  }
  return { z: Float64Array.from(z), gewicht: Float64Array.from(gewicht), Phi: Float64Array.from(z.map(Phi)) };
})();

/** P(bereik < w) voor k onafhankelijke standaardnormale waarden: k ∫ φ(z) [Φ(z) − Φ(z − w)]^(k−1) dz. */
function bereikKans(w, k) {
  if (!(w > 0)) return 0;
  const { z, gewicht, Phi: F } = BINNEN;
  let som = 0;
  for (let i = 0; i < z.length; i++) {
    const zw = z[i] - w;
    const verschil = F[i] - (zw < -8.5 ? 0 : Phi(zw));
    if (verschil <= 0) continue;
    som += gewicht[i] * (k === 2 ? verschil : verschil ** (k - 1));
  }
  return Math.min(1, k * som);
}

/**
 * P(Q < q) voor het gestudentiseerde bereik met k groepen en nu vrijheidsgraden.
 * Buitenste integraal over s = √(χ²/ν): ∫ W(q·s; k) f_ν(s) ds, in vakken van 16-punts Gauss–Legendre die vanaf de
 * top van f_ν naar links en rechts lopen tot een vak niets meer bijdraagt. Bij ν > 100.000: W(q; k).
 */
export function ptukey(q, k, nu) {
  if (!eindig(q) || !Number.isInteger(k) || k < 2 || !(nu > 0) || Number.isNaN(nu)) return null;
  if (q <= 0) return 0;
  if (!Number.isFinite(nu) || nu > 1e5) return Math.min(1, Math.max(0, bereikKans(q, k)));
  const lnC = (nu / 2) * Math.log(nu) - logGamma(nu / 2) - (nu / 2 - 1) * Math.LN2;
  const dichtheid = (s) => (s <= 0 ? 0 : Math.exp(lnC + (nu - 1) * Math.log(s) - (nu * s * s) / 2));
  const top = Math.sqrt(Math.max(nu - 1, 0.5) / nu);
  const breed = 4 / Math.sqrt(2 * nu);
  const vak = (a, b) => {
    let s = 0;
    const m = (a + b) / 2;
    const h = (b - a) / 2;
    for (let i = 0; i < 16; i++) {
      const t = m + h * GL.x[i];
      const f = dichtheid(t);
      if (f > 0) s += GL.w[i] * f * bereikKans(q * t, k);
    }
    return s * h;
  };
  let totaal = 0;
  // Naar rechts.
  let a = top;
  let h = nu >= 10 ? 1.5 / Math.sqrt(2 * nu) : 0.25;
  for (let i = 0; i < 400; i++) {
    const b = a + h;
    const bijdrage = vak(a, b);
    totaal += bijdrage;
    a = b;
    if (nu < 10) h *= 1.3;
    if (bijdrage < 1e-14 * Math.max(totaal, 1e-300) && a - top > breed) break;
  }
  // Naar links (tot 0).
  let b = top;
  h = nu >= 10 ? 1.5 / Math.sqrt(2 * nu) : 0.25;
  for (let i = 0; i < 400 && b > 0; i++) {
    const a2 = Math.max(0, b - h);
    const bijdrage = vak(a2, b);
    totaal += bijdrage;
    b = a2;
    if (bijdrage < 1e-14 * Math.max(totaal, 1e-300) && top - b > breed) break;
  }
  return Math.min(1, Math.max(0, totaal));
}

/** P(Q ≥ q): de overschrijdingskans (de p-waarde van Tukey en Games-Howell). */
export function ptukeyBoven(q, k, nu) {
  const p = ptukey(q, k, nu);
  return p === null ? null : Math.min(1, Math.max(0, 1 - p));
}

const qtukeyGeheugen = new Map();

/**
 * Het kwantiel: de q waarvoor ptukey(q, k, ν) = p (bijv. p = 0,95 voor een 95%-interval). Insluiten (de bovengrens
 * verdubbelt) en dan Illinois (regula falsi) tot |Δp| < 1e-10. begin: een schatting (bijv. van het vorige paar).
 */
export function qtukey(p, k, nu, { begin = null } = {}) {
  if (!eindig(p) || p <= 0 || p >= 1 || !Number.isInteger(k) || k < 2 || !(nu > 0)) return null;
  const sleutel = `${p}|${k}|${Number.isFinite(nu) ? Math.round(nu * 1e6) / 1e6 : 'inf'}`;
  if (qtukeyGeheugen.has(sleutel)) return qtukeyGeheugen.get(sleutel);
  const f = (q) => ptukey(q, k, nu) - p;
  let a;
  let b;
  let fa;
  let fb;
  if (eindig(begin) && begin > 0) {
    a = begin * 0.97;
    b = begin * 1.03;
    fa = f(a);
    fb = f(b);
    while (fa > 0 && a > 1e-6) { b = a; fb = fa; a /= 1.5; fa = f(a); }
    while (fb < 0 && b < 1e4) { a = b; fa = fb; b *= 1.5; fb = f(b); }
  } else {
    a = 0;
    fa = -p;
    b = 1;
    fb = f(b);
    while (fb < 0 && b < 1e4) {
      a = b;
      fa = fb;
      b *= 2;
      fb = f(b);
    }
  }
  if (!(fa <= 0 && fb >= 0)) return null;
  let q = b;
  let kant = 0;
  for (let i = 0; i < 60; i++) {
    q = (a * fb - b * fa) / (fb - fa);
    const fq = f(q);
    if (Math.abs(fq) < 1e-10 || b - a < 1e-12 * q) break;
    if (fq < 0) {
      a = q;
      fa = fq;
      if (kant === -1) fb /= 2;
      kant = -1;
    } else {
      b = q;
      fb = fq;
      if (kant === 1) fa /= 2;
      kant = 1;
    }
  }
  if (!eindig(q)) return null;
  if (qtukeyGeheugen.size > 2000) qtukeyGeheugen.clear();
  qtukeyGeheugen.set(sleutel, q);
  return q;
}

// ---------- Exacte toets van Fisher (2 × 2) ----------

const lnC = (n, k) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

/**
 * Tweezijdige exacte toets van Fisher voor [[a, b], [c, d]]: de som van alle tabellen met dezelfde randtotalen
 * die hooguit even waarschijnlijk zijn als de waargenomen tabel (relatieve marge 1e-7, zoals R en SciPy).
 * @returns {{ p, oddsratio: number|null }} | null
 */
export function fisherExact2x2(tabel) {
  if (!Array.isArray(tabel) || tabel.length !== 2) return null;
  const [[a, b], [c, d]] = tabel;
  if (![a, b, c, d].every((x) => Number.isInteger(x) && x >= 0)) return null;
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  if (n === 0) return null;
  const laag = Math.max(0, c1 - r2);
  const hoog = Math.min(r1, c1);
  const lnTot = lnC(n, c1);
  const lnP = (x) => lnC(r1, x) + lnC(r2, c1 - x) - lnTot;
  const waargenomen = lnP(a);
  let p = 0;
  for (let x = laag; x <= hoog; x++) {
    const l = lnP(x);
    if (l <= waargenomen + Math.log1p(1e-7)) p += Math.exp(l);
  }
  const oddsratio = b * c === 0 ? null : (a * d) / (b * c);
  return { p: Math.min(1, Math.max(0, p)), oddsratio };
}

// ---------- Correctie voor meerdere toetsen ----------

/** Holm: p-waarden gesorteerd, p'(i) = max over j ≤ i van min(1, (m − j + 1) · p(j)). null-waarden blijven null. */
export function holm(ps) {
  const idx = ps.map((p, i) => i).filter((i) => eindig(ps[i]));
  const m = idx.length;
  const uit = ps.map(() => null);
  idx.sort((i, j) => ps[i] - ps[j]);
  let max = 0;
  idx.forEach((i, rang) => {
    max = Math.max(max, Math.min(1, (m - rang) * ps[i]));
    uit[i] = max;
  });
  return uit;
}

/** Bonferroni: p · m (hooguit 1); m = het aantal vergelijkingen (standaard het aantal geldige p-waarden). */
export function bonferroni(ps, m = ps.filter(eindig).length) {
  return ps.map((p) => (eindig(p) ? Math.min(1, p * m) : null));
}
