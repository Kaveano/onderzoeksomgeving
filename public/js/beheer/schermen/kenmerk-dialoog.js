// Dialoog "Achtergrondvragen toevoegen": standaardvragen over wie de respondent is (afdeling, leeftijd, …).
// Gebruikt in de vragenlijsteditor (de server voegt de vragen toe via POST /vragenlijsten/:id/kenmerkvragen) en in
// de sjablooneditor (daar komen de vragen in de inhoud van het sjabloon).
//
// De vragen komen in het thema Achtergrond, met het kenmerk en "uitsplitsen" aan. Kenmerken die er al in staan,
// zijn niet te kiezen. De dialoog raadt aan zuinig te zijn: elke extra achtergrondvraag maakt iemand makkelijker
// herkenbaar (K S8). Het advies telt de achtergrondvragen die er al in staan mee (grootteAdvies).

import { h, vervang, maakDialoog, melding, uniekeId } from '../ui.js';
import { KENMERKEN, KENMERKVRAGEN, KENMERK_THEMA } from '../kenmerken.js';

const INTRO = `Kies welke achtergrondvragen je wilt stellen. Ze komen in het thema ${KENMERK_THEMA}, aan het eind van de vragenlijst.`;
const PRIVACY = 'Vraag niet meer dan nodig. Hoe meer achtergrondvragen, hoe makkelijker iemand herkenbaar wordt. In een kleine organisatie zijn twee of drie achtergrondvragen meestal genoeg.';
const KLEIN = 'Minder dan 50 medewerkers: kies hooguit twee achtergrondvragen.';
/** Het advies van K S8: bij minder dan KLEIN_GRENS medewerkers hooguit KLEIN_MAX achtergrondvragen in de vragenlijst. */
export const KLEIN_GRENS = 50;
export const KLEIN_MAX = 2;
const AL_ANTWOORDEN = "Respondenten die al hebben ingevuld, hebben deze vragen niet gezien; bij hen telt het antwoord als 'niet ingevuld'.";

/** {bedrijf} in een vraagtekst vervangen door de naam van de organisatie (zoals de server dat doet). */
function metBedrijf(tekst, bedrijf) {
  if (!bedrijf) return tekst;
  return tekst.replaceAll('{bedrijf}.', () => `${bedrijf.replace(/\.+$/, '')}.`).replaceAll('{bedrijf}', () => bedrijf);
}

/**
 * Het groottes-advies bij de keuze, zonder DOM.
 * @param aanwezig     achtergrondvragen die er al in staan (vragen met een kenmerk of om op uit te splitsen)
 * @param gekozen      aantal nu aangevinkte achtergrondvragen
 * @param medewerkers  aantal uitgenodigden (een maat voor de grootte van de organisatie), of null als onbekend
 * @returns {{ al: string|null, waarschuwing: string|null }}
 *   al: "Er staan er al 2 in." (null als er nog geen in staan);
 *   waarschuwing: zodra je er iets bij kiest en het er samen meer dan twee worden, tenzij bekend is dat er
 *   50 of meer mensen zijn uitgenodigd.
 */
export function grootteAdvies({ aanwezig = 0, gekozen = 0, medewerkers = null } = {}) {
  const n = Math.max(0, Number(aanwezig) || 0);
  const k = Math.max(0, Number(gekozen) || 0);
  const m = Number.isFinite(Number(medewerkers)) && Number(medewerkers) > 0 ? Number(medewerkers) : null;
  const al = n === 0 ? null : n === 1 ? 'Er staat er al 1 in.' : `Er staan er al ${n} in.`;
  const totaal = n + k;
  let waarschuwing = null;
  if (k > 0 && totaal > KLEIN_MAX && !(m !== null && m >= KLEIN_GRENS)) {
    const samen = `Met deze keuze zijn het ${totaal} achtergrondvragen${n ? ` (${n} die er al in ${n === 1 ? 'staat' : 'staan'} en ${k} nieuwe)` : ''}.`;
    waarschuwing = m !== null
      ? `${samen} Je hebt ${m.toLocaleString('nl-NL')} mensen uitgenodigd. Bij minder dan ${KLEIN_GRENS} medewerkers zijn twee achtergrondvragen genoeg; met meer is iemand snel herkenbaar.`
      : `${samen} Heeft de organisatie minder dan ${KLEIN_GRENS} medewerkers? Kies er dan hooguit twee; met meer is iemand snel herkenbaar.`;
  }
  return { al, waarschuwing };
}

/**
 * Opent de dialoog. Geeft een Promise met het resultaat van opslaan(keuzes), of null bij Annuleren.
 * @param opties.aanwezig  kenmerken die er al in staan (niet te kiezen)
 * @param opties.aantalAanwezig  aantal achtergrondvragen dat er al in staat (ook zonder vast kenmerk), voor het advies
 * @param opties.medewerkers  aantal uitgenodigden, of null (onbekend; bijvoorbeeld in een sjabloon)
 * @param opties.bedrijf   naam van de organisatie (voor {bedrijf} in de voorbeeldtekst), of null
 * @param opties.metAntwoorden  er zijn al antwoorden: dan een extra uitleg
 * @param opties.ruimte    hoeveel vragen er nog bij kunnen (null = geen grens)
 * @param opties.opslaan   async (keuzes: [{ kenmerk, variant? }]) => resultaat; bij een fout blijft de dialoog open
 */
export function kenmerkDialoog({ aanwezig = [], aantalAanwezig = null, medewerkers = null, bedrijf = null, metAntwoorden = false, ruimte = null, opslaan }) {
  return new Promise((klaar) => {
    const al = new Set(aanwezig);
    const basis = uniekeId('km');
    const foutEl = h('div', { class: 'veld-fout', role: 'alert' });
    const vakjes = new Map();
    let variant = null;
    const alAanwezig = aantalAanwezig ?? al.size;
    const adviesEl = h('div', { class: 'km-advies', role: 'status' });
    const tekenAdvies = () => {
      const gekozen = [...vakjes.values()].filter((v) => v.checked && !v.disabled).length;
      const { waarschuwing } = grootteAdvies({ aanwezig: alAanwezig, gekozen, medewerkers });
      vervang(adviesEl, waarschuwing ? melding(waarschuwing, 'waarschuwing') : null);
    };

    const items = Object.entries(KENMERKVRAGEN).map(([sleutel, v]) => {
      const id = `${basis}-${sleutel}`;
      const bezet = al.has(sleutel);
      const vak = h('input', { type: 'checkbox', id, value: sleutel, disabled: bezet, 'aria-describedby': `${id}-uitleg` });
      vak.addEventListener('change', () => tekenAdvies());
      vakjes.set(sleutel, vak);
      const opties = v.type === 'janee' ? ['Ja', 'Nee'] : (v.opties || []).map((o) => o.label);
      let extra = null;
      if (v.varianten) {
        const naam = `${basis}-variant`;
        const keuze = (waarde, tekst) => {
          const r = h('input', { type: 'radio', name: naam, id: `${naam}-${waarde}`, value: waarde, checked: waarde === v.standaard, disabled: bezet });
          r.addEventListener('change', () => {
            variant = waarde;
            vak.checked = true;
            tekenVoorbeeld();
            tekenAdvies();
          });
          return h('label', { class: 'keuze', for: r.id }, r, h('span', {}, tekst));
        };
        variant = v.standaard;
        extra = h('fieldset', { class: 'km-variant' },
          h('legend', { class: 'sr-only' }, 'Hoeveel leeftijdsgroepen?'),
          keuze('grof', '3 groepen (aangeraden bij minder dan 100 medewerkers)'),
          keuze('fijn', '5 groepen'));
      }
      const optieTekst = h('span', { class: 'km-opties', id: `${id}-opties` });
      const tekenVoorbeeld = () => {
        const lijst = v.varianten ? v.varianten[variant || v.standaard].map((o) => o.label) : opties;
        optieTekst.textContent = lijst.join(' · ');
      };
      tekenVoorbeeld();
      return h('li', { class: `km-item${bezet ? ' km-bezet' : ''}` },
        h('label', { class: 'keuze km-keuze', for: id }, vak,
          h('span', { class: 'km-tekst' },
            h('span', { class: 'km-naam' }, KENMERKEN[sleutel].naam, bezet ? h('span', { class: 'km-al' }, ' – staat er al in') : null),
            h('span', { class: 'km-uitleg', id: `${id}-uitleg` },
              h('span', { class: 'km-vraag' }, metBedrijf(v.tekst, bedrijf)), ' ', optieTekst))),
        extra);
    });

    const ok = h('button', { type: 'button', class: 'knop knop-primair' }, 'Toevoegen');
    const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
    const alTekst = grootteAdvies({ aanwezig: alAanwezig }).al;
    const inhoud = [
      h('p', {}, INTRO),
      melding([h('p', {}, PRIVACY), h('p', {}, h('strong', {}, KLEIN), alTekst ? ` ${alTekst}` : null)], 'waarschuwing'),
      metAntwoorden ? melding(AL_ANTWOORDEN) : null,
      h('fieldset', { class: 'km-lijst-veld' },
        h('legend', {}, 'Achtergrondvragen'),
        h('ul', { class: 'km-lijst' }, items)),
      adviesEl,
      foutEl,
    ];
    const d = maakDialoog('Achtergrondvragen toevoegen', inhoud, [annuleer, ok]);
    d.classList.add('km-dialoog');
    let resultaat = null;

    ok.addEventListener('click', async () => {
      foutEl.textContent = '';
      const keuzes = [...vakjes].filter(([, vak]) => vak.checked && !vak.disabled)
        .map(([kenmerk]) => (KENMERKVRAGEN[kenmerk].varianten ? { kenmerk, variant: variant || KENMERKVRAGEN[kenmerk].standaard } : { kenmerk }));
      if (!keuzes.length) {
        foutEl.textContent = 'Kies minstens één achtergrondvraag.';
        const eerste = [...vakjes.values()].find((v) => !v.disabled);
        if (eerste) eerste.focus();
        return;
      }
      if (ruimte !== null && keuzes.length > ruimte) {
        foutEl.textContent = ruimte > 0
          ? `Er kunnen nog maar ${ruimte} vragen bij. Kies er minder.`
          : 'De vragenlijst is vol. Er kunnen geen vragen meer bij.';
        return;
      }
      ok.disabled = true;
      annuleer.disabled = true;
      try {
        resultaat = await opslaan(keuzes);
        d.close();
      } catch (e) {
        foutEl.textContent = e.message || 'Toevoegen is mislukt.';
        ok.disabled = false;
        annuleer.disabled = false;
      }
    });
    annuleer.addEventListener('click', () => d.close());
    d.addEventListener('close', () => klaar(resultaat));
    d.showModal();
    const eerste = [...vakjes.values()].find((v) => !v.disabled);
    (eerste || annuleer).focus();
  });
}
