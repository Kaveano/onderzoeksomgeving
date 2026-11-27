// Werkbank: uitvoer naar Excel en Word (D2 §8.5). Zuivere module (geen DOM): de bestanden worden in het scherm
// bewaard met bewaarBestand. De uitvoer is al beschermd; verborgen cellen worden "×".

import { maakXlsx, maakDocx } from '../bestanden.js';
import { slug } from '../export.js';
import { excelWaarde, metaTekst, uitvoerNaarBlokken } from './uitvoer-tekst.js';
import { VERBORGEN_UITLEG } from '../privacy.js';

/** Unieke, korte tabbladnaam (Excel: hooguit 31 tekens, zonder : \ / ? * [ ]). */
function bladNaam(titel, gebruikt) {
  const basis = String(titel || 'Uitvoer').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Uitvoer';
  let naam = basis;
  for (let i = 2; gebruikt.has(naam.toLowerCase()); i++) naam = `${basis.slice(0, 26)} ${i}`;
  gebruikt.add(naam.toLowerCase());
  return naam;
}

/** Eén tabblad per uitvoer: de tabellen onder elkaar, met een titelregel, voetnoten en een lege regel ertussen. */
export function uitvoerNaarBladen(uitvoeren, { notatie = 'rapport' } = {}) {
  const gebruikt = new Set();
  return uitvoeren.map((u) => {
    const rijen = [[u.titel], [metaTekst(u)], [null]];
    let verborgen = false;
    let breedte = 1;
    for (const o of u.onderdelen) {
      if (o.soort === 'melding') {
        rijen.push([o.tekst], [null]);
        continue;
      }
      if (o.soort !== 'tabel') continue;
      rijen.push([o.titel]);
      rijen.push(o.kop.map((k) => k.tekst));
      breedte = Math.max(breedte, o.kop.length);
      for (const r of o.rijen) {
        if (r.some((c) => c && c.verborgen)) verborgen = true;
        rijen.push([...r.map(excelWaarde), ...Array.from({ length: Math.max(0, o.kop.length - r.length) }, () => null)]);
      }
      for (const v of o.voetnoten || []) rijen.push([v]);
      rijen.push([null]);
    }
    if (verborgen) rijen.push([VERBORGEN_UITLEG]);
    const zin = u.apa?.[notatie === 'apa' ? 'apa' : 'rapport'];
    if (zin) rijen.push([zin.replace(/\*/g, '')]);
    return { naam: bladNaam(u.titel, gebruikt), kolombreedtes: [44, ...Array.from({ length: breedte - 1 }, () => 16)], rijen };
  });
}

/** Bestandsnaam: <bedrijf>-werkbank-<datum>.<ext> */
export function bestandsnaam(onderzoek, datum, extensie) {
  return `${slug(onderzoek?.bedrijfsnaam || onderzoek?.titel || 'onderzoek')}-werkbank-${datum}.${extensie}`;
}

export function uitvoerNaarXlsx(uitvoeren, opties = {}) {
  return maakXlsx(uitvoerNaarBladen(uitvoeren, opties));
}

/** Word: per uitvoer de blokken (met "Wat betekent dit?"), onder elkaar. */
export function uitvoerNaarDocx(uitvoeren, { titel = 'Werkbank', voettekst = '', notatie = 'rapport' } = {}) {
  const blokken = [];
  for (const u of uitvoeren) {
    for (const b of uitvoerNaarBlokken(u, { notatie, metUitleg: true }).blokken) {
      if (b.soort === 'tabel') {
        if (b.bijschrift) blokken.push({ soort: 'alinea', tekst: `**${b.bijschrift}**` });
        blokken.push({ soort: 'tabel', kop: b.kop, rijen: b.rijen });
      } else {
        blokken.push(b);
      }
    }
  }
  return maakDocx({ titel, blokken, voettekst });
}
