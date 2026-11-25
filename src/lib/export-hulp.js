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
 * Zet de eenvoudige opmaak uit de schrijfomgeving om naar leesbare platte tekst
 * (voor .txt-bestanden die in Word of een e-mail worden geplakt).
 */
export function markdownNaarTekst(tekst) {
  return String(tekst || '')
    .split(/\r?\n/)
    .map((regel) => {
      const kop = /^(#{1,3})\s+(.*)$/.exec(regel);
      if (kop) {
        const t = kop[2].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
        return kop[1].length === 1 ? `${t.toUpperCase()}\n${'='.repeat(Math.min(t.length, 60))}`
          : kop[1].length === 2 ? `${t}\n${'-'.repeat(Math.min(t.length, 60))}` : t;
      }
      return regel
        .replace(/^(\s*)[-*+]\s+/, '$1• ')
        .replace(/^>\s?/, '  ')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/(^|[^\\*])\*(?!\s)(.+?)\*/g, '$1$2')
        .replace(/\\\*/g, '*');
    })
    .join('\n');
}
