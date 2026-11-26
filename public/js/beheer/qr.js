// QR-code maken (zonder externe dienst of bibliotheek).
// Ondersteunt tekst tot ongeveer 210 tekens (versie 1 t/m 10, foutcorrectie M, byte-modus).
// maakQr(tekst) geeft een vierkante matrix terug: matrix[rij][kolom] === true is een donker blokje.

// Per versie (foutcorrectie M): [foutcorrectie-codewoorden per blok, [aantal blokken, datacodewoorden per blok], ...]
const BLOKKEN = [
  null,
  [10, [1, 16]],
  [16, [1, 28]],
  [26, [1, 44]],
  [18, [2, 32]],
  [24, [2, 43]],
  [16, [4, 27]],
  [18, [4, 31]],
  [22, [2, 38], [2, 39]],
  [22, [3, 36], [2, 37]],
  [26, [4, 43], [1, 44]],
];
const UITLIJNING = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// Rekenen in GF(256) met polynoom x^8 + x^4 + x^3 + x^2 + 1.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const maal = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function generator(graad) {
  let g = [1];
  for (let i = 0; i < graad; i++) {
    const volgende = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      volgende[j] ^= g[j];
      volgende[j + 1] ^= maal(g[j], EXP[i]);
    }
    g = volgende;
  }
  return g;
}

function foutcorrectie(data, aantal) {
  const g = generator(aantal);
  const rest = new Array(aantal).fill(0);
  for (const b of data) {
    const factor = b ^ rest.shift();
    rest.push(0);
    for (let i = 0; i < aantal; i++) rest[i] ^= maal(g[i + 1], factor);
  }
  return rest;
}

function capaciteit(versie) {
  const [, ...groepen] = BLOKKEN[versie];
  return groepen.reduce((som, [n, d]) => som + n * d, 0);
}

function codewoorden(bytes, versie) {
  const totaal = capaciteit(versie);
  const bits = [];
  const zet = (waarde, lengte) => {
    for (let i = lengte - 1; i >= 0; i--) bits.push((waarde >>> i) & 1);
  };
  zet(0b0100, 4);
  zet(bytes.length, versie <= 9 ? 8 : 16);
  for (const b of bytes) zet(b, 8);
  zet(0, Math.min(4, totaal * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  for (let i = 0; data.length < totaal; i++) data.push(i % 2 ? 0x11 : 0xec);

  // Verdelen over blokken, foutcorrectie per blok, daarna om en om samenvoegen.
  const [ec, ...groepen] = BLOKKEN[versie];
  const dataBlokken = [];
  const ecBlokken = [];
  let p = 0;
  for (const [n, lengte] of groepen) {
    for (let i = 0; i < n; i++) {
      const blok = data.slice(p, p + lengte);
      p += lengte;
      dataBlokken.push(blok);
      ecBlokken.push(foutcorrectie(blok, ec));
    }
  }
  const uit = [];
  const langste = Math.max(...dataBlokken.map((b) => b.length));
  for (let i = 0; i < langste; i++) for (const b of dataBlokken) if (i < b.length) uit.push(b[i]);
  for (let i = 0; i < ec; i++) for (const b of ecBlokken) uit.push(b[i]);
  return uit;
}

function bch(waarde, generatorPoly, graad) {
  let rest = waarde << graad;
  const top = 1 << graad;
  for (let i = Math.floor(Math.log2(rest || 1)); i >= graad; i--) {
    if (rest & (1 << i)) rest ^= generatorPoly << (i - graad);
  }
  return (waarde << graad) | (rest & (top - 1));
}

const MASKERS = [
  (r, k) => (r + k) % 2 === 0,
  (r) => r % 2 === 0,
  (r, k) => k % 3 === 0,
  (r, k) => (r + k) % 3 === 0,
  (r, k) => (Math.floor(r / 2) + Math.floor(k / 3)) % 2 === 0,
  (r, k) => ((r * k) % 2) + ((r * k) % 3) === 0,
  (r, k) => (((r * k) % 2) + ((r * k) % 3)) % 2 === 0,
  (r, k) => (((r + k) % 2) + ((r * k) % 3)) % 2 === 0,
];

function basis(versie) {
  const n = 17 + 4 * versie;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const vast = Array.from({ length: n }, () => new Array(n).fill(false));
  const zet = (r, k, donker) => {
    if (r < 0 || k < 0 || r >= n || k >= n) return;
    m[r][k] = donker;
    vast[r][k] = true;
  };
  // Zoekpatronen met witte rand
  for (const [r0, k0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = -1; r <= 7; r++) {
      for (let k = -1; k <= 7; k++) {
        const rand = r === -1 || r === 7 || k === -1 || k === 7;
        const ring = r === 0 || r === 6 || k === 0 || k === 6;
        const kern = r >= 2 && r <= 4 && k >= 2 && k <= 4;
        zet(r0 + r, k0 + k, !rand && (ring || kern));
      }
    }
  }
  // Uitlijnpatronen
  const pos = UITLIJNING[versie];
  for (const r0 of pos) {
    for (const k0 of pos) {
      if (vast[r0][k0]) continue;
      for (let r = -2; r <= 2; r++) for (let k = -2; k <= 2; k++) zet(r0 + r, k0 + k, Math.max(Math.abs(r), Math.abs(k)) !== 1);
    }
  }
  // Timingpatronen
  for (let i = 8; i < n - 8; i++) {
    if (!vast[6][i]) zet(6, i, i % 2 === 0);
    if (!vast[i][6]) zet(i, 6, i % 2 === 0);
  }
  // Donker blokje en ruimte voor de formaatinformatie
  zet(n - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!vast[8][i]) zet(8, i, false);
    if (!vast[i][8]) zet(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!vast[8][n - 1 - i]) zet(8, n - 1 - i, false);
    if (!vast[n - 1 - i][8]) zet(n - 1 - i, 8, false);
  }
  // Versie-informatie (vanaf versie 7)
  if (versie >= 7) {
    const info = bch(versie, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const bit = ((info >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = n - 11 + (i % 3);
      zet(a, b, bit);
      zet(b, a, bit);
    }
  }
  return { n, m, vast };
}

function plaatsData(n, m, vast, woorden) {
  let i = 0;
  let omhoog = true;
  for (let kolom = n - 1; kolom > 0; kolom -= 2) {
    if (kolom === 6) kolom -= 1;
    for (let stap = 0; stap < n; stap++) {
      const r = omhoog ? n - 1 - stap : stap;
      for (const k of [kolom, kolom - 1]) {
        if (vast[r][k]) continue;
        const bit = i < woorden.length * 8 ? (woorden[i >> 3] >> (7 - (i & 7))) & 1 : 0;
        m[r][k] = bit === 1;
        i++;
      }
    }
    omhoog = !omhoog;
  }
}

function zetFormaat(n, m, masker) {
  // Foutcorrectie M = 00, daarna het maskernummer.
  const info = bch((0b00 << 3) | masker, 0x537, 10) ^ 0x5412;
  const bit = (i) => ((info >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[8][i] = bit(14 - i);
  m[8][7] = bit(8);
  m[8][8] = bit(7);
  m[7][8] = bit(6);
  for (let i = 0; i <= 5; i++) m[5 - i][8] = bit(5 - i);
  for (let i = 0; i <= 6; i++) m[n - 1 - i][8] = bit(14 - i);
  for (let i = 0; i <= 7; i++) m[8][n - 8 + i] = bit(7 - i);
}

function strafpunten(n, m) {
  let straf = 0;
  // 1. Rijen en kolommen met 5 of meer dezelfde blokjes achter elkaar
  for (let a = 0; a < n; a++) {
    for (const langs of [0, 1]) {
      let reeks = 1;
      for (let b = 1; b < n; b++) {
        const nu = langs ? m[b][a] : m[a][b];
        const vorige = langs ? m[b - 1][a] : m[a][b - 1];
        if (nu === vorige) {
          reeks++;
          if (reeks === 5) straf += 3;
          else if (reeks > 5) straf += 1;
        } else {
          reeks = 1;
        }
      }
    }
  }
  // 2. Blokken van 2 bij 2
  for (let r = 0; r < n - 1; r++) {
    for (let k = 0; k < n - 1; k++) {
      const x = m[r][k];
      if (x === m[r][k + 1] && x === m[r + 1][k] && x === m[r + 1][k + 1]) straf += 3;
    }
  }
  // 3. Patronen die op een zoekpatroon lijken
  const patroon = [true, false, true, true, true, false, true, false, false, false, false];
  const omgekeerd = [...patroon].reverse();
  for (let a = 0; a < n; a++) {
    for (let b = 0; b <= n - 11; b++) {
      for (const langs of [0, 1]) {
        let gelijk1 = true;
        let gelijk2 = true;
        for (let i = 0; i < 11 && (gelijk1 || gelijk2); i++) {
          const x = langs ? m[b + i][a] : m[a][b + i];
          if (x !== patroon[i]) gelijk1 = false;
          if (x !== omgekeerd[i]) gelijk2 = false;
        }
        if (gelijk1) straf += 40;
        if (gelijk2) straf += 40;
      }
    }
  }
  // 4. Verhouding donker/licht
  let donker = 0;
  for (const rij of m) for (const x of rij) if (x) donker++;
  straf += Math.floor(Math.abs((donker * 100) / (n * n) - 50) / 5) * 10;
  return straf;
}

/** Maakt de QR-matrix voor een tekst (bijvoorbeeld een link). Gooit een fout als de tekst te lang is. */
export function maakQr(tekst) {
  const bytes = [...new TextEncoder().encode(String(tekst))];
  let versie = 0;
  for (let v = 1; v <= 10; v++) {
    const ruimte = capaciteit(v) * 8 - 4 - (v <= 9 ? 8 : 16);
    if (bytes.length * 8 <= ruimte) {
      versie = v;
      break;
    }
  }
  if (!versie) throw new Error('Deze tekst is te lang voor een QR-code.');
  const woorden = codewoorden(bytes, versie);
  let beste = null;
  for (let masker = 0; masker < 8; masker++) {
    const { n, m, vast } = basis(versie);
    plaatsData(n, m, vast, woorden);
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (!vast[r][k] && MASKERS[masker](r, k)) m[r][k] = !m[r][k];
    zetFormaat(n, m, masker);
    const straf = strafpunten(n, m);
    if (!beste || straf < beste.straf) beste = { straf, m };
  }
  return beste.m;
}

/** QR-code als SVG-tekst (zwart op wit, met de verplichte witte rand van 4 blokjes). */
export function qrAlsSvg(matrix, { blokje = 8 } = {}) {
  const n = matrix.length;
  const rand = 4;
  const maat = (n + rand * 2) * blokje;
  let pad = '';
  for (let r = 0; r < n; r++) {
    for (let k = 0; k < n; k++) {
      if (!matrix[r][k]) continue;
      let lengte = 1;
      while (k + lengte < n && matrix[r][k + lengte]) lengte++;
      pad += `M${(k + rand) * blokje} ${(r + rand) * blokje}h${lengte * blokje}v${blokje}h-${lengte * blokje}z`;
      k += lengte - 1;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maat} ${maat}" width="${maat}" height="${maat}" shape-rendering="crispEdges"><rect width="${maat}" height="${maat}" fill="#ffffff"/><path d="${pad}" fill="#000000"/></svg>\n`;
}

/** Tekent de QR-code op een canvas (voor tonen op het scherm en downloaden als afbeelding). */
export function tekenQr(canvas, matrix, { blokje = 8 } = {}) {
  const n = matrix.length;
  const rand = 4;
  const maat = (n + rand * 2) * blokje;
  canvas.width = maat;
  canvas.height = maat;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, maat, maat);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (matrix[r][k]) ctx.fillRect((k + rand) * blokje, (r + rand) * blokje, blokje, blokje);
  return canvas;
}
