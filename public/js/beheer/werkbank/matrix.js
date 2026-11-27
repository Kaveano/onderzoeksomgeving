// Werkbank: lineaire algebra voor de procedures (D2 §6.1). Zuivere module, geen DOM, geen afhankelijkheden.
// Matrices zijn arrays van rijen (Float64Array), tenzij anders vermeld. Elke functie geeft null (of een object met
// de reden) als het niet kan; er komt nooit NaN of Infinity uit.
// - cholesky / inverseSpd / logDeterminant: voor symmetrische, positief definiete matrices (correlatiematrices,
//   XᵀWX bij logistische regressie);
// - kleinsteKwadraten: Householder-QR met schaling en een controle op afhankelijke kolommen (lineaire regressie);
// - jacobiEigen: eigenwaarden en -vectoren van een symmetrische matrix (factoranalyse).
// Fase 5 en 6 (regressie, logistisch, factoranalyse) bouwen hierop; betrouwbaarheid gebruikt inverseSpd (SMC).

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);

/** Kopie als array van Float64Array-rijen; null bij een ongeldige (niet vierkante of niet eindige) matrix. */
export function alsMatrix(A, vierkant = true) {
  if (!Array.isArray(A) || !A.length) return null;
  const p = A[0].length;
  if (vierkant && A.length !== p) return null;
  const uit = A.map((rij) => Float64Array.from(rij));
  if (uit.some((rij) => rij.length !== p || rij.some((x) => !eindig(x)))) return null;
  return uit;
}

/**
 * Cholesky: A = L·Lᵀ (L benedendriehoek). null als A niet positief definiet is (een spil ≤ 1e-12 × de
 * oorspronkelijke diagonaal).
 */
export function cholesky(A) {
  const M = alsMatrix(A);
  if (!M) return null;
  const p = M.length;
  const L = Array.from({ length: p }, () => new Float64Array(p));
  for (let j = 0; j < p; j++) {
    let s = M[j][j];
    for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
    if (!(s > 1e-12 * Math.abs(M[j][j])) || !(s > 0)) return null;
    const d = Math.sqrt(s);
    L[j][j] = d;
    for (let i = j + 1; i < p; i++) {
      let t = M[i][j];
      for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k];
      L[i][j] = t / d;
    }
  }
  return L;
}

/** ln |A| uit de Cholesky-factor: 2 Σ ln L_ii. */
export function logDeterminant(L) {
  let s = 0;
  for (let i = 0; i < L.length; i++) s += Math.log(L[i][i]);
  return 2 * s;
}

/** Inverse van een symmetrische, positief definiete matrix (via Cholesky); null als dat niet kan. */
export function inverseSpd(A) {
  const L = cholesky(A);
  if (!L) return null;
  const p = L.length;
  // L⁻¹ (benedendriehoek)
  const Li = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++) {
    Li[i][i] = 1 / L[i][i];
    for (let j = 0; j < i; j++) {
      let s = 0;
      for (let k = j; k < i; k++) s -= L[i][k] * Li[k][j];
      Li[i][j] = s / L[i][i];
    }
  }
  // A⁻¹ = L⁻ᵀ L⁻¹
  const uit = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = i; k < p; k++) s += Li[k][i] * Li[k][j];
      uit[i][j] = s;
      uit[j][i] = s;
    }
  }
  return uit.every((r) => r.every(eindig)) ? uit : null;
}

/**
 * Kleinste kwadraten met Householder-QR (zoals LAPACK dgeqr2). X: n rijen × p kolommen (array van rijen), y: n.
 * Elke kolom wordt eerst op lengte 1 geschaald. Is |R_jj| < 1e-9 (geschaald), dan is kolom j (bijna) volledig te
 * voorspellen uit de vorige: { afhankelijk: j }. Anders { beta, inverseXtX, rss, rang }.
 */
export function kleinsteKwadraten(X, y) {
  const n = X.length;
  if (!n || !Array.isArray(y) && !(y instanceof Float64Array)) return null;
  const p = X[0].length;
  if (n < p || y.length !== n) return null;
  // Kolomgewijs kopiëren en schalen.
  const kol = Array.from({ length: p }, (_, j) => Float64Array.from(X, (rij) => rij[j]));
  const schaal = new Float64Array(p);
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += kol[j][i] * kol[j][i];
    s = Math.sqrt(s);
    if (!(s > 0) || !eindig(s)) return { afhankelijk: j };
    schaal[j] = s;
    for (let i = 0; i < n; i++) kol[j][i] /= s;
  }
  const qty = Float64Array.from(y);
  const R = Array.from({ length: p }, () => new Float64Array(p));
  for (let j = 0; j < p; j++) {
    const x = kol[j];
    let norm = 0;
    for (let i = j; i < n; i++) norm += x[i] * x[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-9) return { afhankelijk: j };
    const alfa = x[j] > 0 ? -norm : norm;
    const v = new Float64Array(n);
    v[j] = x[j] - alfa;
    for (let i = j + 1; i < n; i++) v[i] = x[i];
    let vtv = 0;
    for (let i = j; i < n; i++) vtv += v[i] * v[i];
    if (vtv > 0) {
      const beta = 2 / vtv;
      for (let c = j; c < p; c++) {
        let s = 0;
        for (let i = j; i < n; i++) s += v[i] * kol[c][i];
        s *= beta;
        for (let i = j; i < n; i++) kol[c][i] -= s * v[i];
      }
      let s = 0;
      for (let i = j; i < n; i++) s += v[i] * qty[i];
      s *= beta;
      for (let i = j; i < n; i++) qty[i] -= s * v[i];
    }
    for (let c = j; c < p; c++) R[j][c] = kol[c][j];
    if (Math.abs(R[j][j]) < 1e-9) return { afhankelijk: j };
  }
  // β (geschaald) = R⁻¹ Qᵀy
  const b = new Float64Array(p);
  for (let i = p - 1; i >= 0; i--) {
    let s = qty[i];
    for (let c = i + 1; c < p; c++) s -= R[i][c] * b[c];
    b[i] = s / R[i][i];
  }
  let rss = 0;
  for (let i = p; i < n; i++) rss += qty[i] * qty[i];
  // R⁻¹ en (XᵀX)⁻¹ = R⁻¹ R⁻ᵀ, daarna terugschalen.
  const Ri = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = p - 1; i >= 0; i--) {
    Ri[i][i] = 1 / R[i][i];
    for (let c = i + 1; c < p; c++) {
      let s = 0;
      for (let k = i + 1; k <= c; k++) s += R[i][k] * Ri[k][c];
      Ri[i][c] = -s / R[i][i];
    }
  }
  const inv = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let s = 0;
      for (let k = j; k < p; k++) s += Ri[i][k] * Ri[j][k];
      const w = s / (schaal[i] * schaal[j]);
      inv[i][j] = w;
      inv[j][i] = w;
    }
  }
  const beta = Array.from(b, (x, j) => x / schaal[j]);
  if (!beta.every(eindig) || !eindig(rss)) return null;
  return { beta, inverseXtX: inv, rss: Math.max(0, rss), rang: p };
}

/**
 * Eigenwaarden en -vectoren van een symmetrische matrix met de cyclische methode van Jacobi (drempelvariant van
 * Rutishauser). Gesorteerd van groot naar klein; elke vector heeft zijn grootste element (in absolute waarde)
 * positief. vectoren[j] is de eigenvector bij waarden[j].
 */
export function jacobiEigen(A) {
  const M = alsMatrix(A);
  if (!M) return null;
  const p = M.length;
  const V = Array.from({ length: p }, (_, i) => { const r = new Float64Array(p); r[i] = 1; return r; });
  let frob = 0;
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) frob += M[i][j] * M[i][j];
  for (let ronde = 0; ronde < 60; ronde++) {
    let buiten = 0;
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) buiten += M[i][j] * M[i][j];
    if (buiten < 1e-24 * frob || buiten === 0) break;
    const drempel = ronde < 3 ? (0.2 * Math.sqrt(buiten)) / (p * p) : 0;
    for (let a = 0; a < p - 1; a++) {
      for (let b = a + 1; b < p; b++) {
        const apq = M[a][b];
        if (Math.abs(apq) <= drempel || apq === 0) continue;
        const theta = (M[b][b] - M[a][a]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < p; k++) {
          const mka = M[k][a];
          const mkb = M[k][b];
          M[k][a] = c * mka - s * mkb;
          M[k][b] = s * mka + c * mkb;
        }
        for (let k = 0; k < p; k++) {
          const mak = M[a][k];
          const mbk = M[b][k];
          M[a][k] = c * mak - s * mbk;
          M[b][k] = s * mak + c * mbk;
        }
        for (let k = 0; k < p; k++) {
          const vka = V[k][a];
          const vkb = V[k][b];
          V[k][a] = c * vka - s * vkb;
          V[k][b] = s * vka + c * vkb;
        }
      }
    }
  }
  const volgorde = Array.from({ length: p }, (_, i) => i).sort((i, j) => M[j][j] - M[i][i]);
  const waarden = volgorde.map((i) => M[i][i]);
  const vectoren = volgorde.map((j) => {
    const v = Float64Array.from(V, (rij) => rij[j]);
    let groot = 0;
    for (let i = 1; i < p; i++) if (Math.abs(v[i]) > Math.abs(v[groot])) groot = i;
    if (v[groot] < 0) for (let i = 0; i < p; i++) v[i] = -v[i];
    return v;
  });
  if (!waarden.every(eindig)) return null;
  return { waarden, vectoren };
}

/** Correlatiematrix van volledige rijen (array van rijen met k waarden); null zonder spreiding. */
export function correlatieMatrix(rijen) {
  const n = rijen.length;
  if (n < 2) return null;
  const k = rijen[0].length;
  const m = new Float64Array(k);
  for (const r of rijen) for (let j = 0; j < k; j++) m[j] += r[j];
  for (let j = 0; j < k; j++) m[j] /= n;
  const S = Array.from({ length: k }, () => new Float64Array(k));
  for (const r of rijen) {
    for (let i = 0; i < k; i++) {
      const di = r[i] - m[i];
      for (let j = i; j < k; j++) S[i][j] += di * (r[j] - m[j]);
    }
  }
  for (let i = 0; i < k; i++) if (!(S[i][i] > 0)) return null;
  const R = Array.from({ length: k }, () => new Float64Array(k));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      const r = i === j ? 1 : Math.max(-1, Math.min(1, S[i][j] / Math.sqrt(S[i][i] * S[j][j])));
      R[i][j] = r;
      R[j][i] = r;
    }
  }
  return R;
}
