// "Neem op in stuk": zet een tekst (bijvoorbeeld een uitkomst van de analyse) onderaan een van je
// stukken, of kopieer hem. Te gebruiken vanuit elk scherm dat resultaten toont.
//
//   import { neemOpInStuk } from '../stukdialoog.js';
//   await neemOpInStuk({ onderzoekId, tekst, alleenLezen: ctx.alleenLezen });
//
// - De gebruiker kan de tekst in de dialoog nog aanpassen.
// - Is het onderzoek gearchiveerd (alleenLezen), dan kan de tekst alleen gekopieerd worden.
// - Escape of Annuleren vraagt eerst om bevestiging als de tekst is aangepast.

import { api } from './api.js';
import { h, vervang, laden, melding, meld, bevestig, kopieer, uniekeId } from './ui.js';

const STUKSOORTEN = { notitie: 'Notitie', bevindingen: 'Bevindingen', rapport: 'Rapport', overig: 'Overig' };
const MAX_TEKST = 50000; // zoveel tekens neemt de server per keer aan

// Het laatst gekozen stuk per onderzoek, zodat je niet elke keer opnieuw hoeft te kiezen.
const laatsteStuk = new Map();

/**
 * Opent de dialoog en wacht tot hij weer dicht is.
 * opties: { onderzoekId, tekst, alleenLezen = false, stuksoorten = vaste lijst met namen van soorten }
 * Geeft { stukId, titel } als de tekst aan een stuk is toegevoegd, en anders null.
 */
export async function neemOpInStuk({ onderzoekId, tekst, alleenLezen = false, stuksoorten = null }) {
  const begintekst = String(tekst ?? '');
  const soorten = stuksoorten || STUKSOORTEN;

  return new Promise((klaar) => {
    const tekstId = uniekeId('stuk-tekst');
    const keuzeId = uniekeId('stuk-keuze');
    const titelId = uniekeId('dlg-titel');

    const tekstVeld = h('textarea', { id: tekstId, rows: 9, maxlength: MAX_TEKST }, begintekst);
    const stukVeld = alleenLezen ? null : h('div', { class: 'veld' }, laden('Stukken worden geladen…'));
    const fout = h('div', { class: 'veld-fout', role: 'alert' });
    const status = h('span', { class: 'sr-only', role: 'status' });
    const toevoegen = alleenLezen
      ? null
      : h('button', { type: 'submit', class: 'knop knop-primair', disabled: true }, 'Toevoegen aan stuk');
    const kopieerKnop = h('button', { type: 'button', class: `knop${alleenLezen ? ' knop-primair' : ''}` }, 'Kopiëren');
    const annuleer = h('button', { type: 'button', class: 'knop' }, alleenLezen ? 'Sluiten' : 'Annuleren');

    let keuzeEl = null;
    let stukken = [];
    let resultaat = null;
    // Wat er het laatst is bewaard (toegevoegd of gekopieerd); daarmee vergelijken we bij sluiten.
    let bewaardeTekst = begintekst;

    const formulier = h('form', { method: 'dialog', novalidate: true },
      h('div', { class: 'dialoog-inhoud' },
        h('h2', { id: titelId }, alleenLezen ? 'Tekst kopiëren' : 'Neem op in stuk'),
        h('p', { class: 'zacht' }, alleenLezen
          ? 'Dit onderzoek is gearchiveerd, dus je kunt de tekst niet meer aan een stuk toevoegen. Je kunt hem wel kopiëren en in een ander document plakken.'
          : 'De tekst hieronder komt onderaan het gekozen stuk te staan. Je kunt hem hier eerst nog aanpassen.'),
        stukVeld,
        h('div', { class: 'veld' }, h('label', { for: tekstId }, 'Tekst'), tekstVeld),
        fout,
        status,
      ),
      h('div', { class: 'dialoog-voet' }, annuleer, kopieerKnop, toevoegen),
    );
    const dlg = h('dialog', { class: 'dialoog stukdialoog', 'aria-labelledby': titelId }, formulier);
    document.body.append(dlg);

    let kopieerTimer = null;
    dlg.addEventListener('close', () => {
      clearTimeout(kopieerTimer);
      setTimeout(() => dlg.remove(), 0);
      klaar(resultaat);
    });

    // Niet zomaar sluiten als de tekst is aangepast en nog nergens is bewaard.
    let vraagtAl = false;
    const sluitNaVragen = async () => {
      if (vraagtAl) return;
      if (tekstVeld.value === bewaardeTekst) {
        dlg.close();
        return;
      }
      vraagtAl = true;
      const weg = await bevestig({
        titel: 'Wijzigingen weggooien?',
        tekst: 'Je aanpassingen aan deze tekst worden niet bewaard.',
        knop: 'Weggooien',
        gevaar: true,
      });
      vraagtAl = false;
      if (weg) dlg.close();
      else tekstVeld.focus();
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      sluitNaVragen();
    });
    annuleer.addEventListener('click', () => sluitNaVragen());

    kopieerKnop.addEventListener('click', async () => {
      const waarde = tekstVeld.value;
      const gelukt = await kopieer(waarde);
      if (gelukt) bewaardeTekst = waarde;
      kopieerKnop.textContent = gelukt ? 'Gekopieerd ✓' : 'Kopiëren mislukt';
      status.textContent = gelukt ? 'De tekst is gekopieerd.' : 'Kopiëren is niet gelukt.';
      clearTimeout(kopieerTimer);
      kopieerTimer = setTimeout(() => {
        kopieerKnop.textContent = 'Kopiëren';
      }, 2500);
    });

    formulier.addEventListener('submit', async (e) => {
      e.preventDefault();
      fout.textContent = '';
      if (alleenLezen || !keuzeEl || !stukken.length) return;
      const waarde = tekstVeld.value.trim();
      if (!waarde) {
        fout.textContent = 'Er is geen tekst om toe te voegen.';
        tekstVeld.focus();
        return;
      }
      const stukId = Number(keuzeEl.value);
      const stuk = stukken.find((s) => s.id === stukId);
      toevoegen.disabled = true;
      try {
        await api.post(`/stukken/${stukId}/toevoegen`, { tekst: waarde });
        laatsteStuk.set(String(onderzoekId), stukId);
        resultaat = { stukId, titel: stuk ? stuk.titel : '' };
        dlg.close();
        meld(`Toegevoegd aan "${stuk ? stuk.titel : 'het stuk'}".`, 'succes');
      } catch (err) {
        fout.textContent = err.message || 'Toevoegen is niet gelukt.';
        toevoegen.disabled = false;
      }
    });

    dlg.showModal();
    kopieerKnop.focus();
    if (alleenLezen) return;

    api.get(`/onderzoeken/${onderzoekId}/stukken`).then((r) => {
      if (!dlg.isConnected) return;
      stukken = (r && r.stukken) || [];
      if (!stukken.length) {
        vervang(stukVeld, melding([
          'Er zijn nog geen stukken in dit onderzoek. ',
          h('a', { href: `#/onderzoek/${onderzoekId}/stukken`, onclick: () => dlg.close() }, 'Maak er een aan bij Stukken'),
          ', of kopieer de tekst.',
        ]));
        return;
      }
      const vorige = laatsteStuk.get(String(onderzoekId));
      const standaard = stukken.find((s) => s.id === vorige) || stukken.find((s) => s.soort === 'bevindingen') || stukken[0];
      keuzeEl = h('select', { id: keuzeId }, stukken.map((s) => {
        const soort = soorten[s.soort] || s.soort;
        const label = s.titel.toLowerCase().includes(String(soort).toLowerCase()) ? s.titel : `${s.titel} (${soort})`;
        return h('option', { value: s.id, selected: s.id === standaard.id }, label);
      }));
      vervang(stukVeld, h('label', { for: keuzeId }, 'Aan welk stuk toevoegen?'), keuzeEl);
      toevoegen.disabled = false;
      if (dlg.open && document.activeElement === kopieerKnop) keuzeEl.focus();
    }).catch((err) => {
      if (!dlg.isConnected) return;
      vervang(stukVeld, melding(`De stukken konden niet worden geladen. ${err.message || ''} Je kunt de tekst wel kopiëren.`, 'gevaar'));
    });
  });
}
