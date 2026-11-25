// Hulpfuncties voor exportbestanden.

/** Maakt een veilige bestandsnaam van een tekst. */
export function slug(tekst) {
  return (
    String(tekst || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'onderzoek'
  );
}

/**
 * Eén CSV-cel. Puntkomma als scheidingsteken (Nederlandse Excel), getallen met komma.
 * Tekst die met = + - @ begint krijgt een apostrof, zodat Excel er geen formule van maakt.
 */
export function csvCel(waarde) {
  if (waarde === null || waarde === undefined) return '';
  if (typeof waarde === 'number') return Number.isFinite(waarde) ? String(waarde).replace('.', ',') : '';
  let t = String(waarde);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  if (/[";\r\n]/.test(t)) t = `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** Maakt een CSV-bestand (met BOM zodat Excel UTF-8 herkent). */
export function maakCsv(rijen) {
  return '﻿' + rijen.map((r) => r.map(csvCel).join(';')).join('\r\n') + '\r\n';
}
