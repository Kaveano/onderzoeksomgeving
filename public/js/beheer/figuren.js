// Figuren (grafieken) voor het Overzicht, rapporten, de meelezer en Word (BOUWPLAN B27, §3.8).
// Eén afspraak voor alle grafieken: een Figuur (zie hieronder) met alleen afgeschermde cijfers. Daaruit maakt
// figuurPlan een "plan": waar elke staaf, lijn, punt en tekst komt. Het plan is zuiver (geen DOM) en wordt in de
// tests gecontroleerd. Uit hetzelfde plan tekent figuurNaarSvg de figuur op het scherm (SVG via createElementNS,
// kleuren via klassen in figuren.css; geen style-attribuut, CSP) en figuurNaarPng een PNG voor Word (canvas 2D;
// nooit via een <img> met SVG of een blob-adres).
//
// Een verborgen waarde (null) is altijd een leeg vakje met "×", nooit een staaf van 0.
//
// @typedef Figuur
// { soort: 'figuur', id, vorm: 'staaf'|'gestapeld'|'lijn'|'spreiding', titel, bijschrift, alt (hele zin uit de feiten),
//   eenheid: '%'|'gem'|'aantal'|'score', schaal: { min, max } | null,
//   categorieen: string[], reeksen: [{ label, waarden: (number|null)[], kleur? }], legenda?: string[],
//   punten?: [{ label, x, y }]                  alleen bij spreiding (prioriteitenmatrix: thema's, geen personen)
//   kruis?: { x, y }, kwadrantLabels?: string[4], noot?: string,
//   schaalY?: { min, max }, asLabels?: { x, y } } (spreiding)
// kleur (optioneel per reeks): 'gunstig' | 'neutraal' | 'ongunstig' | 'reeks-1' … 'reeks-6'; anders reeks-1, reeks-2, …
// kwadrantLabels: [rechtsboven, linksboven, rechtsonder, linksonder].
// staaf: liggende staven, een rij per categorie (meer reeksen naast elkaar); gestapeld: een 100%-staaf per categorie;
// lijn: de categorieën van links naar rechts (bijvoorbeeld meetmomenten); spreiding: punten met een kruis.

import { nlGetal } from './opmaak.js';

export const VORMEN = ['staaf', 'gestapeld', 'lijn', 'spreiding'];
export const EENHEDEN = ['%', 'gem', 'aantal', 'score'];
export const KLEUREN = ['gunstig', 'neutraal', 'ongunstig', 'reeks-1', 'reeks-2', 'reeks-3', 'reeks-4', 'reeks-5', 'reeks-6'];
/** Teken voor een verborgen waarde (zoals VERBORGEN in privacy.js). */
export const KRUISJE = '×';

const LETTER = 13;
const KLEIN = 11.5;
const REGEL = 16;
// Tekst op deze (lichte) kleuren is donker, op de andere wit (in de PNG en in de lichte weergave; figuren.css).
const LICHT = new Set(['neutraal', 'reeks-2', 'reeks-6']);

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
/** Geschatte breedte van een tekst (zonder te meten: zuiver en overal gelijk). */
export const tekstBreedte = (t, grootte = LETTER) => String(t ?? '').length * grootte * 0.56;

/** Een getal zoals het in de figuur staat: 48% · 3,8 · +20 · 1.250. */
export function waardeTekst(waarde, eenheid) {
  if (!eindig(waarde)) return KRUISJE;
  if (eenheid === '%') return `${Math.round(waarde)}%`;
  if (eenheid === 'gem') return nlGetal(waarde, 1);
  if (eenheid === 'score') {
    const r = Math.round(waarde);
    return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '0';
  }
  return nlGetal(Math.round(waarde), 0);
}

/** Een tekst in regels van hooguit maxBreedte; meer dan maxRegels: de laatste regel eindigt op "…". */
export function afbreken(tekst, maxBreedte, grootte = LETTER, maxRegels = 2) {
  const woorden = String(tekst ?? '').split(/\s+/).filter(Boolean);
  const regels = [];
  let regel = '';
  for (const w of woorden) {
    const proef = regel ? `${regel} ${w}` : w;
    if (tekstBreedte(proef, grootte) <= maxBreedte || !regel) regel = proef;
    else {
      regels.push(regel);
      regel = w;
    }
  }
  if (regel) regels.push(regel);
  if (regels.length > maxRegels) {
    regels.length = maxRegels;
    regels[maxRegels - 1] = `${regels[maxRegels - 1]}…`;
  }
  return regels.map((r) => {
    if (tekstBreedte(r, grootte) <= maxBreedte) return r;
    const max = Math.max(1, Math.floor(maxBreedte / (grootte * 0.56)) - 1);
    return `${r.slice(0, max)}…`;
  });
}

/** "Mooie" verdeelstreepjes tussen min en max (hooguit ongeveer n). */
export function streepjes(min, max, n = 5) {
  if (!(max > min)) return [min];
  const ruw = (max - min) / n;
  const macht = 10 ** Math.floor(Math.log10(ruw));
  const stap = [1, 2, 2.5, 5, 10].map((f) => f * macht).find((s) => s >= ruw) || ruw;
  const uit = [];
  for (let v = Math.ceil(min / stap - 1e-9) * stap; v <= max + 1e-9; v += stap) uit.push(Math.round(v * 1e9) / 1e9 || 0);
  return uit;
}

/** De schaal van de waarde-as: de opgegeven schaal, of een vaste per eenheid, of uit de gegevens. */
function asSchaal(fig, waarden) {
  if (fig.schaal && eindig(fig.schaal.min) && eindig(fig.schaal.max) && fig.schaal.max > fig.schaal.min) return { ...fig.schaal };
  if (fig.eenheid === '%') return { min: 0, max: 100 };
  if (fig.eenheid === 'score') return { min: -100, max: 100 };
  const getallen = waarden.filter(eindig);
  const hoogste = getallen.length ? Math.max(...getallen) : 1;
  const laagste = getallen.length ? Math.min(0, ...getallen) : 0;
  const t = streepjes(laagste, hoogste || 1, 5);
  const stap = t.length > 1 ? t[1] - t[0] : 1;
  return { min: laagste, max: Math.max(t[t.length - 1] < hoogste ? t[t.length - 1] + stap : t[t.length - 1], hoogste || 1) };
}

const kleurVan = (reeks, j) => (KLEUREN.includes(reeks?.kleur) ? reeks.kleur : `reeks-${(j % 6) + 1}`);

/** Plan maken: een lijst elementen plus wat de tests en de schermlezer nodig hebben. */
function nieuwPlan(fig, breedte) {
  return {
    breedte, hoogte: 0, vorm: fig.vorm, titel: String(fig.titel || ''), alt: String(fig.alt || fig.titel || ''),
    elementen: [], balken: [], verborgen: [], labels: [], legenda: [], punten: [], weggelaten: [],
  };
}
const tekst = (plan, x, y, t, klasse = 'fig-tekst', anker = 'start', grootte = LETTER) => {
  const el = { soort: 'tekst', x, y, tekst: String(t), klasse, anker, grootte };
  plan.elementen.push(el);
  return el;
};
const rect = (plan, x, y, b, h, klasse) => plan.elementen.push({ soort: 'rect', x, y, b: Math.max(0, b), h: Math.max(0, h), klasse });
const lijn = (plan, punten, klasse) => plan.elementen.push({ soort: 'lijn', punten, klasse });

/** Legenda bovenaan; geeft de hoogte terug. */
function legendaPlan(plan, items, breedte) {
  if (!items.length) return 0;
  let x = 0;
  let y = 4;
  for (const it of items) {
    const b = 14 + 6 + tekstBreedte(it.label, KLEIN) + 16;
    if (x > 0 && x + b > breedte) {
      x = 0;
      y += REGEL + 2;
    }
    rect(plan, x, y, 12, 12, `fig-vlak fig-${it.kleur}`);
    tekst(plan, x + 18, y + 10.5, it.label, 'fig-tekst fig-klein', 'start', KLEIN);
    plan.legenda.push({ label: it.label, kleur: it.kleur, x, y });
    x += b;
  }
  return y + REGEL + 6;
}

/** Een leeg vakje met een kruisje voor een verborgen waarde. */
function verborgenVak(plan, x, y, b, h, info) {
  plan.elementen.push({ soort: 'rect', x, y, b, h, klasse: 'fig-verborgen' });
  tekst(plan, x + b / 2, y + h / 2 + 4.5, KRUISJE, 'fig-tekst fig-verborgen-tekst', 'middle');
  plan.verborgen.push({ ...info, x, y, b, h });
}

function staafPlan(fig, breedte) {
  const plan = nieuwPlan(fig, breedte);
  const cats = fig.categorieen || [];
  const reeksen = fig.reeksen || [];
  const k = Math.max(1, reeksen.length);
  const items = reeksen.length > 1 ? reeksen.map((r, j) => ({ label: r.label, kleur: kleurVan(r, j) })) : [];
  const top = legendaPlan(plan, items, breedte) + 4;
  const labelB = Math.max(60, Math.min(breedte * 0.38, Math.max(...cats.map((c) => tekstBreedte(c)), 0) + 10));
  const waardeB = 46;
  const x0 = labelB + 8;
  const x1 = breedte - waardeB;
  const schaal = asSchaal(fig, reeksen.flatMap((r) => r.waarden));
  const x = (v) => x0 + ((Math.min(Math.max(v, schaal.min), schaal.max) - schaal.min) / (schaal.max - schaal.min)) * (x1 - x0);
  const nul = x(Math.max(schaal.min, Math.min(0, schaal.max)));
  const staafH = k === 1 ? 20 : 14;
  const tussen = 3;
  const regels = cats.map((c) => afbreken(c, labelB - 4));
  const rijH = cats.map((_, i) => Math.max(k * staafH + (k - 1) * tussen + 12, regels[i].length * REGEL + 8));
  const ticks = streepjes(schaal.min, schaal.max, Math.max(2, Math.min(5, Math.floor((x1 - x0) / 60))));
  const bodem = top + rijH.reduce((t, h) => t + h, 0);
  for (const t of ticks) lijn(plan, [[x(t), top], [x(t), bodem]], 'fig-raster');
  let y = top;
  cats.forEach((c, i) => {
    const blok = k * staafH + (k - 1) * tussen;
    const y0 = y + (rijH[i] - blok) / 2;
    const midden = y + rijH[i] / 2;
    regels[i].forEach((r, l) => {
      const el = tekst(plan, labelB, midden + 4.5 + (l - (regels[i].length - 1) / 2) * REGEL, r, 'fig-tekst', 'end');
      plan.labels.push({ soort: 'categorie', categorie: c, tekst: el.tekst, y: el.y });
    });
    reeksen.forEach((reeks, j) => {
      const v = reeks.waarden?.[i];
      const ys = y0 + j * (staafH + tussen);
      if (!eindig(v)) {
        verborgenVak(plan, nul, ys, 26, staafH, { categorie: c, reeks: reeks.label });
        return;
      }
      const xa = Math.min(nul, x(v));
      const b = Math.abs(x(v) - nul);
      rect(plan, xa, ys, b, staafH, `fig-vlak fig-${kleurVan(reeks, j)}`);
      plan.balken.push({ categorie: c, reeks: reeks.label, waarde: v, x: xa, y: ys, b, h: staafH });
      const wt = waardeTekst(v, fig.eenheid);
      if (v < 0) tekst(plan, xa - 4, ys + staafH / 2 + 4.5, wt, 'fig-tekst fig-waarde', 'end', KLEIN);
      else tekst(plan, xa + b + 4, ys + staafH / 2 + 4.5, wt, 'fig-tekst fig-waarde', 'start', KLEIN);
    });
    y += rijH[i];
  });
  lijn(plan, [[nul, top], [nul, bodem]], 'fig-as');
  for (const t of ticks) tekst(plan, x(t), bodem + 15, waardeTekst(t, fig.eenheid === 'gem' && Number.isInteger(t) ? 'aantal' : fig.eenheid), 'fig-tekst fig-zacht fig-klein', 'middle', KLEIN);
  plan.hoogte = Math.ceil(bodem + 24);
  return plan;
}

function gestapeldPlan(fig, breedte) {
  const plan = nieuwPlan(fig, breedte);
  const cats = fig.categorieen || [];
  const reeksen = fig.reeksen || [];
  const items = reeksen.map((r, j) => ({ label: r.label, kleur: kleurVan(r, j) }));
  const top = legendaPlan(plan, items, breedte) + 4;
  const smal = breedte < 420;
  const labelB = smal ? 0 : Math.max(60, Math.min(breedte * 0.34, Math.max(...cats.map((c) => tekstBreedte(c)), 0) + 10));
  const x0 = smal ? 0 : labelB + 8;
  const x1 = breedte - 4;
  const staafH = 22;
  let y = top;
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i];
    // Op een smal scherm staat de naam boven de staaf.
    let ys;
    if (smal) {
      const regels = afbreken(c, breedte, LETTER, 2);
      regels.forEach((r, l) => {
        const el = tekst(plan, 0, y + 12 + l * REGEL, r, 'fig-tekst', 'start');
        plan.labels.push({ soort: 'categorie', categorie: c, tekst: el.tekst, y: el.y });
      });
      ys = y + regels.length * REGEL + 2;
      y = ys + staafH + 12;
    } else {
      const regels = afbreken(c, labelB - 4);
      const rijH = Math.max(staafH + 12, regels.length * REGEL + 8);
      ys = y + (rijH - staafH) / 2;
      regels.forEach((r, l) => {
        const el = tekst(plan, labelB, y + rijH / 2 + 4.5 + (l - (regels.length - 1) / 2) * REGEL, r, 'fig-tekst', 'end');
        plan.labels.push({ soort: 'categorie', categorie: c, tekst: el.tekst, y: el.y });
      });
      y += rijH;
    }
    const waarden = reeksen.map((r) => r.waarden?.[i]);
    const totaal = waarden.reduce((t, v) => t + (eindig(v) ? v : 0), 0);
    if (waarden.some((v) => !eindig(v)) || !(totaal > 0)) {
      verborgenVak(plan, x0, ys, x1 - x0, staafH, { categorie: c, reeks: null });
      continue;
    }
    let xa = x0;
    waarden.forEach((v, j) => {
      const b = (v / totaal) * (x1 - x0);
      const kleur = kleurVan(reeksen[j], j);
      rect(plan, xa, ys, b, staafH, `fig-vlak fig-${kleur}`);
      plan.balken.push({ categorie: c, reeks: reeksen[j].label, waarde: v, x: xa, y: ys, b, h: staafH });
      const wt = waardeTekst(v, fig.eenheid);
      if (b >= tekstBreedte(wt, KLEIN) + 8) tekst(plan, xa + b / 2, ys + staafH / 2 + 4.5, wt, `fig-klein fig-op fig-op-${kleur}`, 'middle', KLEIN);
      xa += b;
    });
  }
  plan.hoogte = Math.ceil(y + 6);
  return plan;
}

function lijnPlan(fig, breedte) {
  const plan = nieuwPlan(fig, breedte);
  const cats = fig.categorieen || [];
  const reeksen = fig.reeksen || [];
  const items = reeksen.length > 1 ? reeksen.map((r, j) => ({ label: r.label, kleur: kleurVan(r, j) })) : [];
  const top = legendaPlan(plan, items, breedte) + 10;
  const schaal = asSchaal(fig, reeksen.flatMap((r) => r.waarden));
  const ticks = streepjes(schaal.min, schaal.max, 4);
  const linksB = Math.max(...ticks.map((t) => tekstBreedte(waardeTekst(t, fig.eenheid === 'gem' && Number.isInteger(t) ? 'aantal' : fig.eenheid), KLEIN)), 10) + 10;
  const x0 = linksB + 6;
  const x1 = breedte - 18;
  const plotH = Math.max(140, Math.min(260, breedte * 0.45));
  const y1 = top + plotH;
  const y = (v) => y1 - ((Math.min(Math.max(v, schaal.min), schaal.max) - schaal.min) / (schaal.max - schaal.min)) * plotH;
  const n = cats.length;
  const xi = (i) => (n <= 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1));
  for (const t of ticks) {
    lijn(plan, [[x0, y(t)], [x1, y(t)]], 'fig-raster');
    tekst(plan, linksB, y(t) + 4, waardeTekst(t, fig.eenheid === 'gem' && Number.isInteger(t) ? 'aantal' : fig.eenheid), 'fig-tekst fig-zacht fig-klein', 'end', KLEIN);
  }
  lijn(plan, [[x0, y1], [x1, y1]], 'fig-as');
  const metWaarden = n <= 8 && reeksen.length <= 2;
  reeksen.forEach((reeks, j) => {
    const kleur = kleurVan(reeks, j);
    let stuk = [];
    const sluit = () => {
      if (stuk.length > 1) lijn(plan, stuk, `fig-lijn fig-lijn-${kleur}`);
      stuk = [];
    };
    for (let i = 0; i < n; i++) {
      const v = reeks.waarden?.[i];
      if (!eindig(v)) {
        sluit();
        const yv = y1 - 10 - j * 14;
        tekst(plan, xi(i), yv, KRUISJE, 'fig-tekst fig-verborgen-tekst', 'middle');
        plan.verborgen.push({ categorie: cats[i], reeks: reeks.label, x: xi(i), y: yv, b: 0, h: 0 });
        continue;
      }
      stuk.push([xi(i), y(v)]);
      plan.elementen.push({ soort: 'cirkel', x: xi(i), y: y(v), r: 3.5, klasse: `fig-vlak fig-${kleur}` });
      plan.balken.push({ categorie: cats[i], reeks: reeks.label, waarde: v, x: xi(i), y: y(v), b: 0, h: 0 });
      if (metWaarden) tekst(plan, xi(i), y(v) - 8 - j * 0, waardeTekst(v, fig.eenheid), 'fig-tekst fig-waarde fig-klein', 'middle', KLEIN);
    }
    sluit();
  });
  // Namen onder de as; past het niet, dan alleen elke zoveelste.
  const ruimte = n <= 1 ? x1 - x0 : (x1 - x0) / (n - 1);
  const langste = Math.max(...cats.map((c) => Math.min(tekstBreedte(c, KLEIN), 110)), 10);
  const stap = Math.max(1, Math.ceil((langste + 8) / Math.max(ruimte, 1)));
  let maxRegels = 1;
  cats.forEach((c, i) => {
    if (i % stap !== 0 && i !== n - 1) return;
    const regels = afbreken(c, Math.max(ruimte * stap - 6, 50), KLEIN, 2);
    maxRegels = Math.max(maxRegels, regels.length);
    const anker = n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle';
    regels.forEach((r, l) => {
      const el = tekst(plan, anker === 'start' ? xi(i) - 4 : anker === 'end' ? xi(i) + 4 : xi(i), y1 + 15 + l * (REGEL - 2), r, 'fig-tekst fig-zacht fig-klein', anker, KLEIN);
      plan.labels.push({ soort: 'categorie', categorie: c, tekst: el.tekst, y: el.y });
    });
  });
  plan.hoogte = Math.ceil(y1 + 12 + maxRegels * (REGEL - 2) + 6);
  return plan;
}

function spreidingPlan(fig, breedte) {
  const plan = nieuwPlan(fig, breedte);
  const alle = (fig.punten || []).filter((p) => p && p.label !== undefined);
  const punten = alle.filter((p) => eindig(p.x) && eindig(p.y));
  plan.weggelaten = alle.filter((p) => !(eindig(p.x) && eindig(p.y))).map((p) => p.label);
  const rond = (min, max, pad) => ({ min: min - pad, max: max + pad });
  const xs = punten.map((p) => p.x);
  const ys = punten.map((p) => p.y);
  const sx = fig.schaal && fig.schaal.max > fig.schaal.min ? fig.schaal : xs.length ? rond(Math.min(...xs), Math.max(...xs), Math.max(0.2, (Math.max(...xs) - Math.min(...xs)) * 0.15)) : { min: 0, max: 1 };
  const sy = fig.schaalY && fig.schaalY.max > fig.schaalY.min ? fig.schaalY : ys.length ? rond(Math.min(...ys), Math.max(...ys), Math.max(0.05, (Math.max(...ys) - Math.min(...ys)) * 0.15)) : { min: 0, max: 1 };
  const top = 20;
  const x0 = 34;
  const x1 = breedte - 8;
  const plotH = Math.max(200, Math.min(380, breedte * 0.7));
  const y1 = top + plotH;
  const X = (v) => x0 + ((v - sx.min) / (sx.max - sx.min)) * (x1 - x0);
  const Y = (v) => y1 - ((v - sy.min) / (sy.max - sy.min)) * plotH;
  rect(plan, x0, top, x1 - x0, plotH, 'fig-kader');
  for (const t of streepjes(sx.min, sx.max, 4)) tekst(plan, X(t), y1 + 15, nlGetal(t, Number.isInteger(t) ? 0 : 1), 'fig-tekst fig-zacht fig-klein', 'middle', KLEIN);
  for (const t of streepjes(sy.min, sy.max, 4)) tekst(plan, x0 - 4, Y(t) + 4, nlGetal(t, Math.abs(t) < 1 && t !== 0 ? 1 : 0), 'fig-tekst fig-zacht fig-klein', 'end', KLEIN);
  if (fig.asLabels?.y) tekst(plan, x0, top - 7, `↑ ${fig.asLabels.y}`, 'fig-tekst fig-zacht fig-klein', 'start', KLEIN);
  if (fig.asLabels?.x) tekst(plan, x1, y1 + 30, `${fig.asLabels.x} →`, 'fig-tekst fig-zacht fig-klein', 'end', KLEIN);
  if (fig.kruis && eindig(fig.kruis.x) && eindig(fig.kruis.y)) {
    const kx = X(Math.min(Math.max(fig.kruis.x, sx.min), sx.max));
    const ky = Y(Math.min(Math.max(fig.kruis.y, sy.min), sy.max));
    lijn(plan, [[kx, top], [kx, y1]], 'fig-kruis');
    lijn(plan, [[x0, ky], [x1, ky]], 'fig-kruis');
    const kl = fig.kwadrantLabels || [];
    const half = (x1 - x0) / 2 - 8;
    const hoeken = [[x1 - 4, top + 13, 'end'], [x0 + 4, top + 13, 'start'], [x1 - 4, y1 - 8 - REGEL + 2, 'end'], [x0 + 4, y1 - 8 - REGEL + 2, 'start']];
    kl.slice(0, 4).forEach((l, i) => {
      if (!l) return;
      const [hx, hy, anker] = hoeken[i];
      afbreken(l, half, KLEIN, 2).forEach((r, k) => tekst(plan, hx, hy + k * (REGEL - 3), r, 'fig-tekst fig-kwadrant fig-klein', anker, KLEIN));
    });
  }
  // Punten met hun naam. Een naam komt rechts of links van zijn punt, zo nodig een regel hoger of lager, op de eerste
  // plek waar hij niet over een andere naam of een ander punt valt (en binnen het vlak blijft).
  const bollen = punten.map((p) => ({ x: X(p.x), y: Y(p.y), label: p.label }));
  const bezet = [];
  const raakt = (a, b) => !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
  const maxNaam = Math.min(200, (x1 - x0) * 0.45);
  [...punten].sort((a, b) => b.y - a.y || a.x - b.x).forEach((p) => {
    const cx = X(p.x);
    const cy = Y(p.y);
    plan.elementen.push({ soort: 'cirkel', x: cx, y: cy, r: 5, klasse: 'fig-vlak fig-reeks-1 fig-punt' });
    const regel = afbreken(p.label, maxNaam, KLEIN, 1)[0];
    const b = tekstBreedte(regel, KLEIN);
    const vak = (rechts, dy) => {
      const ty = cy + 4 + dy;
      const lx = rechts ? cx + 8 : cx - 8;
      return { rechts, ty, lx, x0: rechts ? lx : lx - b, x1: rechts ? lx + b : lx, y0: ty - 10, y1: ty + 3 };
    };
    const kandidaten = [];
    for (const dy of [0, REGEL - 3, -(REGEL - 3), 2 * (REGEL - 3), -2 * (REGEL - 3), 3 * (REGEL - 3), -3 * (REGEL - 3)]) kandidaten.push(vak(true, dy), vak(false, dy));
    const binnen = kandidaten.filter((k) => k.x0 >= x0 + 2 && k.x1 <= x1 - 2 && k.y0 >= top + 2 && k.y1 <= y1 - 2);
    const vrij = (k) => !bezet.some((o) => raakt(k, o))
      && !bollen.some((o) => (o.x !== cx || o.y !== cy) && raakt(k, { x0: o.x - 6, x1: o.x + 6, y0: o.y - 6, y1: o.y + 6 }));
    const k = binnen.find(vrij) || binnen[0] || kandidaten[0];
    tekst(plan, k.lx, k.ty, regel, 'fig-tekst fig-klein', k.rechts ? 'start' : 'end', KLEIN);
    bezet.push(k);
    plan.punten.push({ label: p.label, x: p.x, y: p.y, cx, cy });
  });
  plan.hoogte = Math.ceil(y1 + (fig.asLabels?.x ? 38 : 24));
  return plan;
}

/**
 * Het plan van een figuur voor een breedte in pixels (1:1 op het scherm): { breedte, hoogte, vorm, titel, alt,
 * elementen: [{ soort: 'rect'|'lijn'|'cirkel'|'tekst', … klasse }], balken: [{ categorie, reeks, waarde, x, y, b, h }],
 * verborgen: [{ categorie, reeks, x, y, b, h }] (elke null-waarde, getekend als vakje met ×), labels, legenda, punten,
 * weggelaten (punten zonder x of y) }. Zuiver: zelfde invoer, zelfde plan.
 */
export function figuurPlan(fig, { breedte = 640 } = {}) {
  if (!fig || !VORMEN.includes(fig.vorm)) throw new Error(`Onbekende vorm van een figuur: ${fig?.vorm}`);
  const b = Math.max(240, Math.round(Number(breedte) || 640));
  if (fig.vorm === 'staaf') return staafPlan(fig, b);
  if (fig.vorm === 'gestapeld') return gestapeldPlan(fig, b);
  if (fig.vorm === 'lijn') return lijnPlan(fig, b);
  return spreidingPlan(fig, b);
}

// ---------- Op het scherm: SVG ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  return el;
}
const r1 = (x) => Math.round(x * 10) / 10;

/**
 * De figuur als SVG-element (role="img" met de alt-tekst; <title> en <desc> voor schermlezers). Kleuren via de
 * klassen in figuren.css (Atelier-variabelen, ook in donkere modus). breedte = de breedte in pixels.
 */
export function figuurNaarSvg(fig, { breedte = 640 } = {}) {
  const plan = figuurPlan(fig, { breedte });
  const svg = svgEl('svg', {
    xmlns: SVG_NS, viewBox: `0 0 ${plan.breedte} ${plan.hoogte}`, width: plan.breedte, height: plan.hoogte,
    class: `figuur fig-${plan.vorm}`, role: 'img', 'aria-label': plan.alt, focusable: 'false',
  });
  const titel = svgEl('title');
  titel.textContent = plan.titel || plan.alt;
  svg.append(titel);
  if (plan.alt && plan.alt !== plan.titel) {
    const desc = svgEl('desc');
    desc.textContent = plan.alt;
    svg.append(desc);
  }
  for (const e of plan.elementen) {
    if (e.soort === 'rect') svg.append(svgEl('rect', { x: r1(e.x), y: r1(e.y), width: r1(e.b), height: r1(e.h), class: e.klasse, rx: e.klasse === 'fig-verborgen' ? 2 : null }));
    else if (e.soort === 'lijn') svg.append(svgEl('polyline', { points: e.punten.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' '), class: e.klasse, fill: 'none' }));
    else if (e.soort === 'cirkel') svg.append(svgEl('circle', { cx: r1(e.x), cy: r1(e.y), r: e.r, class: e.klasse }));
    else if (e.soort === 'tekst') {
      const t = svgEl('text', { x: r1(e.x), y: r1(e.y), 'text-anchor': e.anker, class: e.klasse, 'aria-hidden': 'true' });
      t.textContent = e.tekst;
      svg.append(t);
    }
  }
  return svg;
}

// ---------- Voor Word: PNG ----------

/**
 * Breedte (in plan-eenheden) waarop een figuur voor Word wordt opgezet. Op 16 cm breed is de tekst dan ongeveer 9 punt,
 * goed leesbaar op papier (bij 800 zou het 7 punt zijn).
 */
export const WORD_BREEDTE = 640;

/** Kleuren voor de PNG (de lichte Atelier-kleuren uit app.css; Word kent geen CSS). */
export const PNG_KLEUREN = {
  'reeks-1': '#5b2a53', 'reeks-2': '#b3741b', 'reeks-3': '#1c6e68', 'reeks-4': '#b5452f', 'reeks-5': '#5a7fb8', 'reeks-6': '#8e8a5a',
  gunstig: '#1c6e68', neutraal: '#d6cec0', ongunstig: '#9a4a1c',
  tekst: '#2a1c2c', zacht: '#5f5262', raster: '#d9cfbd', as: '#84776c', vlak: '#f3ede1', wit: '#ffffff',
};

function canvasStijl(klasse) {
  const k = new Set(String(klasse || '').split(/\s+/));
  const kleur = [...k].map((c) => c.replace(/^fig-(lijn-|op-)?/, '')).find((c) => KLEUREN.includes(c));
  return { k, kleur: kleur ? PNG_KLEUREN[kleur] : null, naam: kleur || null };
}

/** Tekent het plan op een 2D-canvas (schaal = pixels per plan-eenheid). */
export function tekenOpCanvas(c, plan, schaal = 1) {
  c.save();
  c.scale(schaal, schaal);
  c.fillStyle = PNG_KLEUREN.wit;
  c.fillRect(0, 0, plan.breedte, plan.hoogte);
  for (const e of plan.elementen) {
    const { k, kleur, naam } = canvasStijl(e.klasse);
    if (e.soort === 'rect') {
      if (k.has('fig-verborgen') || k.has('fig-kader')) {
        c.fillStyle = k.has('fig-verborgen') ? PNG_KLEUREN.vlak : PNG_KLEUREN.wit;
        c.fillRect(e.x, e.y, e.b, e.h);
        c.strokeStyle = PNG_KLEUREN.as;
        c.lineWidth = 1;
        c.setLineDash(k.has('fig-verborgen') ? [3, 3] : []);
        c.strokeRect(e.x + 0.5, e.y + 0.5, Math.max(0, e.b - 1), Math.max(0, e.h - 1));
        c.setLineDash([]);
      } else {
        c.fillStyle = kleur || PNG_KLEUREN['reeks-1'];
        c.fillRect(e.x, e.y, e.b, e.h);
      }
    } else if (e.soort === 'lijn') {
      c.beginPath();
      e.punten.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.setLineDash(k.has('fig-kruis') ? [4, 4] : []);
      c.strokeStyle = k.has('fig-raster') ? PNG_KLEUREN.raster : k.has('fig-as') || k.has('fig-kruis') ? PNG_KLEUREN.as : kleur || PNG_KLEUREN['reeks-1'];
      c.lineWidth = k.has('fig-lijn') ? 2.5 : 1;
      c.stroke();
      c.setLineDash([]);
    } else if (e.soort === 'cirkel') {
      c.beginPath();
      c.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      c.fillStyle = kleur || PNG_KLEUREN['reeks-1'];
      c.fill();
    } else if (e.soort === 'tekst') {
      c.font = `${k.has('fig-waarde') ? '600 ' : ''}${e.grootte}px "Source Sans 3", "Segoe UI", Arial, sans-serif`;
      c.textAlign = e.anker === 'middle' ? 'center' : e.anker === 'end' ? 'right' : 'left';
      c.fillStyle = k.has('fig-op') ? (LICHT.has(naam) ? PNG_KLEUREN.tekst : PNG_KLEUREN.wit) : k.has('fig-zacht') || k.has('fig-kwadrant') || k.has('fig-verborgen-tekst') ? PNG_KLEUREN.zacht : PNG_KLEUREN.tekst;
      c.fillText(e.tekst, e.x, e.y);
    }
  }
  c.restore();
}

/**
 * De figuur als PNG (Uint8Array) voor Word, getekend op een canvas uit hetzelfde plan als de SVG.
 * breedte in pixels (de figuur wordt op WORD_BREEDTE opgezet en geschaald); hoogte volgt uit de inhoud.
 */
export async function figuurNaarPng(fig, { breedte = 1600, hoogte = null } = {}) {
  const plan = figuurPlan(fig, { breedte: WORD_BREEDTE });
  const schaal = breedte / plan.breedte;
  const h = Math.round(hoogte ?? plan.hoogte * schaal);
  const doek = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(breedte, h) : Object.assign(document.createElement('canvas'), { width: breedte, height: h });
  const c = doek.getContext('2d');
  c.fillStyle = PNG_KLEUREN.wit;
  c.fillRect(0, 0, breedte, h);
  const past = Math.min(schaal, h / plan.hoogte);
  c.translate((breedte - plan.breedte * past) / 2, (h - plan.hoogte * past) / 2);
  tekenOpCanvas(c, plan, past);
  const blob = doek.convertToBlob
    ? await doek.convertToBlob({ type: 'image/png' })
    : await new Promise((klaar, fout) => doek.toBlob((b) => (b ? klaar(b) : fout(new Error('De figuur kon niet als afbeelding worden gemaakt.'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** De maten van een figuur in Word (cm) bij een breedte van breedte_cm; de hoogte volgt uit het plan. */
export function figuurMaten(fig, { breedte_cm = 16 } = {}) {
  const plan = figuurPlan(fig, { breedte: WORD_BREEDTE });
  return { breedte_cm, hoogte_cm: Math.round((breedte_cm * plan.hoogte * 100) / plan.breedte) / 100 };
}

/**
 * Een figuur als Word-blok voor maakDocx (bestanden.js): { soort: 'afbeelding', png, breedte_cm, hoogte_cm, alt,
 * bijschrift }. Alleen in de browser (canvas).
 */
export async function figuurVoorWord(fig, { breedte_cm = 16 } = {}) {
  const maten = figuurMaten(fig, { breedte_cm });
  return { soort: 'afbeelding', png: await figuurNaarPng(fig), ...maten, alt: String(fig.alt || fig.titel || ''), bijschrift: fig.bijschrift || '' };
}
