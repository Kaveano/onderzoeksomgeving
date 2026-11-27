// Scherm: Stukken – overzicht van notities, bevindingen en (concept)rapporten van een onderzoek.
// Het schrijven zelf gebeurt in stuk-bewerken.js.

import { api, downloadUrl } from '../api.js';
import { h, vervang, leeg, laden, melding, meld, meldFout, bevestig, formulierDialoog, tijdstip, aantal, download } from '../ui.js';

const SOORT_KLASSE = { notitie: '', bevindingen: 'label-primair', rapport: 'label-succes', overig: '' };

function tweeCijfers(n) {
  return String(n).padStart(2, '0');
}

/** ISO-tijdstip → 'vandaag om 14:32', 'gisteren om 09:05' of '25 nov. 2026, 14:32'. */
export function wanneer(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const nu = new Date();
  const uur = `${tweeCijfers(t.getHours())}:${tweeCijfers(t.getMinutes())}`;
  if (t.toDateString() === nu.toDateString()) return `vandaag om ${uur}`;
  const gisteren = new Date(nu);
  gisteren.setDate(nu.getDate() - 1);
  if (t.toDateString() === gisteren.toDateString()) return `gisteren om ${uur}`;
  return tijdstip(iso);
}

/** Globale omvang op basis van het aantal tekens (een Nederlands woord is gemiddeld zo'n 6 tekens incl. spatie). */
function omvang(lengte) {
  const n = Number(lengte) || 0;
  if (n === 0) return 'nog leeg';
  const woorden = n / 6.2;
  if (woorden < 10) return 'een paar woorden';
  const stap = woorden < 100 ? 10 : woorden < 1000 ? 50 : 100;
  return `ca. ${(Math.round(woorden / stap) * stap).toLocaleString('nl-NL')} woorden`;
}

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const basis = `#/onderzoek/${onderzoekId}`;
  const soorten = ctx.instellingen.stuksoorten || {}; // { notitie: 'Notitie', ... }
  ctx.zetTitel(`Stukken – ${ctx.onderzoek.onderzoek.titel}`);

  const lijstEl = h('div', {}, laden('De stukken worden geladen…'));
  const tellerEl = h('p', { class: 'zacht klein' });
  const alleDownloaden = h('button', {
    type: 'button',
    class: 'knop verborgen',
    onclick: () => download(downloadUrl(`/onderzoeken/${onderzoekId}/export/stukken.txt`)),
  }, 'Alle stukken downloaden');

  async function laad() {
    try {
      const { stukken } = await api.get(`/onderzoeken/${onderzoekId}/stukken`);
      teken(stukken || []);
    } catch (e) {
      vervang(lijstEl, melding([
        h('strong', {}, 'De stukken konden niet worden geladen. '),
        e.message || '',
        ' ',
        h('button', { type: 'button', class: 'knop knop-klein', onclick: () => { vervang(lijstEl, laden()); laad(); } }, 'Opnieuw proberen'),
      ], 'gevaar'));
    }
  }

  async function verwijder(s) {
    const ok = await bevestig({
      titel: 'Stuk verwijderen?',
      tekst: [
        `"${s.titel}" wordt definitief verwijderd. Dit kun je niet ongedaan maken.`,
        'Wil je de tekst bewaren? Download het stuk dan eerst.',
      ],
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    try {
      await api.del(`/stukken/${s.id}`);
      meld('Stuk verwijderd.');
      laad();
    } catch (e) {
      meldFout(e);
    }
  }

  function teken(stukken) {
    tellerEl.textContent = stukken.length
      ? aantal(stukken.length, 'stuk', 'stukken')
      : 'Nog geen stukken';
    alleDownloaden.classList.toggle('verborgen', !stukken.length);

    if (!stukken.length) {
      vervang(lijstEl, leeg(
        ctx.alleenLezen
          ? 'Er zijn in dit onderzoek geen stukken geschreven.'
          : 'Er zijn nog geen stukken. Begin bijvoorbeeld met een notitie van je eerste gesprek of met je bevindingen.',
        ctx.alleenLezen ? null : h('button', { type: 'button', class: 'knop knop-primair', onclick: nieuw }, 'Eerste stuk maken'),
      ));
      return;
    }

    const items = stukken.map((s) => {
      const adres = `${basis}/stukken/${s.id}`;
      return h('li', { class: 'lijst-item st-item' },
        h('div', { class: 'lijst-item-hoofd' },
          h('a', { class: 'lijst-item-titel st-item-titel', href: adres }, s.titel),
          h('div', { class: 'lijst-item-meta rij st-item-meta' },
            h('span', { class: `label ${SOORT_KLASSE[s.soort] || ''}` }, soorten[s.soort] || s.soort),
            h('span', {}, `bijgewerkt ${wanneer(s.bijgewerkt_op)} · ${omvang(s.lengte)}`),
          ),
        ),
        h('div', { class: 'lijst-item-acties' },
          h('a', { class: 'knop knop-klein', href: adres, 'aria-label': `${ctx.alleenLezen ? 'Bekijk' : 'Open'} "${s.titel}"` },
            ctx.alleenLezen ? 'Bekijken' : 'Openen'),
          h('button', {
            type: 'button',
            class: 'knop knop-klein',
            'aria-label': `Download "${s.titel}" als tekstbestand`,
            onclick: () => download(downloadUrl(`/stukken/${s.id}/download`)),
          }, 'Downloaden'),
          ctx.alleenLezen ? null : h('button', {
            type: 'button',
            class: 'knop knop-klein knop-licht st-knop-gevaar',
            'aria-label': `Verwijder "${s.titel}"`,
            onclick: () => verwijder(s),
          }, 'Verwijderen'),
        ),
      );
    });
    vervang(lijstEl, h('ul', { class: 'lijst' }, items));
  }

  async function nieuw() {
    let nieuwId = null;
    const w = await formulierDialoog({
      titel: 'Nieuw stuk',
      knop: 'Maken en openen',
      intro: 'Geef je stuk een titel. Je kunt de titel en de soort later altijd nog aanpassen.',
      velden: [
        { naam: 'titel', label: 'Titel', verplicht: true, max: 200, placeholder: 'Bijvoorbeeld: Gesprek met de teamleiders' },
        {
          naam: 'soort',
          label: 'Soort',
          type: 'select',
          waarde: 'notitie',
          opties: Object.entries(soorten).map(([waarde, label]) => ({ waarde, label })),
          hulp: 'Alleen om je stukken te ordenen.',
        },
      ],
      opslaan: async (waarden) => {
        const r = await api.post(`/onderzoeken/${onderzoekId}/stukken`, { titel: waarden.titel, soort: waarden.soort });
        nieuwId = r.id;
      },
    });
    if (!w || !nieuwId) return;
    meld('Stuk aangemaakt.', 'succes');
    ctx.navigeer(`${basis}/stukken/${nieuwId}`);
  }

  vervang(container,
    h('section', { class: 'kaart st-scherm' },
      h('div', { class: 'kaart-kop' },
        h('div', {}, h('h2', {}, 'Stukken'), tellerEl),
        h('div', { class: 'knoppen' },
          alleDownloaden,
          ctx.alleenLezen ? null : h('button', { type: 'button', class: 'knop knop-primair', onclick: nieuw }, '+ Nieuw stuk'),
        ),
      ),
      h('p', { class: 'zacht st-uitleg' },
        ctx.alleenLezen
          ? 'Hier staan de notities, bevindingen en rapporten van dit onderzoek. Je kunt ze lezen en downloaden.'
          : 'Hier schrijf je je notities, bevindingen en het (concept)rapport. Alles wordt vanzelf opgeslagen terwijl je typt.'),
      lijstEl,
    ),
    ctx.alleenLezen ? null : h('p', { class: 'st-tip klein zacht' },
      h('strong', {}, 'Tip: '),
      'cijfers uit het dashboard zet je met de knop “Neem op in stuk” direct onderaan een stuk. ',
      h('a', { href: `${basis}/dashboard/resultaten` }, 'Naar het dashboard'),
    ),
  );
  await laad();
}
