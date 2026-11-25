// Scherm: Afronden – exporteren, archiveren en (na archiveren) definitief verwijderen.

import { api, downloadUrl } from '../api.js';
import { h, vervang, laden, melding, meld, meldFout, bevestig, download, aantal, datum } from '../ui.js';
import * as exp from '../export.js';

export async function toon(container, ctx) {
  const o = ctx.onderzoek.onderzoek;
  const onderzoekId = o.id;
  ctx.zetTitel(`Afronden – ${o.titel}`);

  let gegevens = null; // export-gegevens, één keer ophalen
  async function haalGegevens() {
    if (!gegevens) gegevens = await api.get(`/onderzoeken/${onderzoekId}/export/data`);
    return gegevens;
  }

  /** Knop die een exportbestand maakt; toont "Bezig…" en meldt het resultaat. */
  function exportKnop(label, maak) {
    const knop = h('button', {
      type: 'button',
      class: 'knop',
      onclick: async () => {
        const oud = knop.textContent;
        knop.disabled = true;
        knop.textContent = 'Bezig met maken…';
        try {
          const d = await haalGegevens();
          const [inhoud, naam, type] = maak(d);
          exp.bewaar(inhoud, naam, type);
          meld(`${naam} is gedownload.`, 'succes');
        } catch (e) {
          meldFout(e);
        } finally {
          knop.disabled = false;
          knop.textContent = oud;
        }
      },
    }, label);
    return knop;
  }

  function exportRegel(titel, uitleg, knop) {
    return h('li', { class: 'lijst-item' },
      h('div', { class: 'lijst-item-hoofd' },
        h('div', { class: 'lijst-item-titel' }, titel),
        h('div', { class: 'lijst-item-meta' }, uitleg)),
      h('div', { class: 'lijst-item-acties' }, knop));
  }

  container.append(laden());
  let vragenlijsten = [];
  let openActies = 0;
  try {
    const [vl, ac] = await Promise.all([
      api.get(`/onderzoeken/${onderzoekId}/vragenlijsten`),
      api.get(`/onderzoeken/${onderzoekId}/acties`),
    ]);
    vragenlijsten = vl.vragenlijsten;
    openActies = ac.acties.filter((a) => a.status !== 'klaar').length;
  } catch (e) {
    vervang(container, melding(e.message, 'gevaar'));
    return;
  }

  // ---------- 1. Exporteren ----------
  const csv = 'text/csv;charset=utf-8';
  const regels = [
    exportRegel('Alle antwoorden (CSV)',
      'Alle vragenlijsten samen, één regel per antwoord. Handig voor een draaitabel in Excel.',
      exportKnop('Downloaden', (d) => [exp.alleAntwoordenCsv(d), exp.bestandsnaam(d, 'alle-antwoorden', 'csv'), csv])),
    ...vragenlijsten.map((l) => exportRegel(
      `Antwoorden: ${l.titel} (CSV)`,
      `${l.meetmoment_naam ? `${l.meetmoment_naam} · ` : ''}${aantal(l.aantal_inzendingen, 'respondent', 'respondenten')}, één regel per respondent.`,
      exportKnop('Downloaden', (d) => [exp.antwoordenVragenlijstCsv(d, l.id), exp.bestandsnaam(d, `antwoorden-${l.titel}`, 'csv'), csv]),
    )),
    exportRegel('Eigen invoer (CSV)',
      'Interviews, observaties en cijfers die je zelf hebt ingevoerd.',
      exportKnop('Downloaden', (d) => [exp.eigenInvoerCsv(d), exp.bestandsnaam(d, 'eigen-invoer', 'csv'), csv])),
    exportRegel('Stukken (tekstbestand)',
      'Notities, bevindingen en rapport, plus de actielijst, in één tekstbestand.',
      h('button', { type: 'button', class: 'knop', onclick: () => download(downloadUrl(`/onderzoeken/${onderzoekId}/export/stukken.txt`)) }, 'Downloaden')),
    exportRegel('Alles samen (JSON)',
      'Volledige kopie van dit onderzoek, voor je eigen archief. Bevat alles: opzet, vragen, antwoorden, eigen invoer, stukken en acties.',
      exportKnop('Downloaden', (d) => [exp.volledigeJson(d), exp.bestandsnaam(d, 'volledig', 'json'), 'application/json;charset=utf-8'])),
  ];

  const exportKaart = h('section', { class: 'kaart' },
    h('h2', {}, 'Exporteren'),
    h('p', {}, 'Download de resultaten en je stukken. CSV-bestanden openen in Excel; het tekstbestand opent in Kladblok of Word.'),
    h('p', { class: 'klein zacht' },
      'Let op: exportbestanden bevatten alle losse antwoorden, ook van kleine groepen. Bewaar ze op een veilige plek en deel ze niet zomaar.'),
    h('ul', { class: 'lijst' }, regels),
  );

  // ---------- 2. Archiveren of 3. Verwijderen ----------
  let tweedeKaart;
  if (!ctx.alleenLezen) {
    const open = vragenlijsten.filter((l) => l.status === 'open');
    const knop = h('button', {
      type: 'button',
      class: 'knop knop-primair',
      onclick: async () => {
        const ok = await bevestig({
          titel: 'Onderzoek archiveren?',
          tekst: [
            'Na archiveren kun je alles nog inzien en exporteren, maar niets meer wijzigen. Open vragenlijsten worden gesloten; respondenten kunnen dan niet meer invullen.',
            'Heb je alle bestanden gedownload die je nodig hebt?',
          ],
          knop: 'Archiveren',
        });
        if (!ok) return;
        knop.disabled = true;
        try {
          await api.post(`/onderzoeken/${onderzoekId}/archiveren`, {});
          meld('Het onderzoek is gearchiveerd.', 'succes');
          ctx.navigeer(location.hash);
        } catch (e) {
          meldFout(e);
          knop.disabled = false;
        }
      },
    }, 'Onderzoek archiveren');

    tweedeKaart = h('section', { class: 'kaart' },
      h('h2', {}, 'Archiveren'),
      h('p', {}, 'Ben je klaar met dit onderzoek? Exporteer eerst wat je nodig hebt en archiveer het daarna. Een gearchiveerd onderzoek kun je inzien en exporteren, maar niet meer wijzigen.'),
      open.length || openActies
        ? melding([
          open.length ? h('p', {}, `Er ${open.length === 1 ? 'staat nog 1 vragenlijst' : `staan nog ${open.length} vragenlijsten`} open. Bij archiveren ${open.length === 1 ? 'wordt die' : 'worden die'} gesloten.`) : null,
          openActies ? h('p', {}, `Er ${openActies === 1 ? 'staat nog 1 actie' : `staan nog ${openActies} acties`} open op de actielijst.`) : null,
        ], 'waarschuwing')
        : null,
      h('div', { class: 'knoppen' }, knop),
      h('p', { class: 'klein zacht' }, 'Na het archiveren kun je meteen een nieuw onderzoek starten via ',
        h('a', { href: '#/nieuw' }, 'Nieuw onderzoek'), '.'),
    );
  } else {
    const verwijder = h('button', {
      type: 'button',
      class: 'knop knop-gevaar',
      onclick: async () => {
        const ok = await bevestig({
          titel: 'Onderzoek definitief verwijderen?',
          tekst: [
            `Alles van "${o.titel}" (${o.bedrijfsnaam}) wordt definitief verwijderd: vragenlijsten, antwoorden, eigen invoer, stukken en acties. Dit kan niet ongedaan worden gemaakt.`,
            'Download eerst een volledige kopie (JSON) als je die wilt bewaren.',
          ],
          knop: 'Definitief verwijderen',
          gevaar: true,
          typTekst: o.bedrijfsnaam,
        });
        if (!ok) return;
        verwijder.disabled = true;
        try {
          await api.del(`/onderzoeken/${onderzoekId}`, { bevestiging: o.bedrijfsnaam });
          meld('Het onderzoek is definitief verwijderd.', 'succes');
          ctx.navigeer('#/');
        } catch (e) {
          meldFout(e);
          verwijder.disabled = false;
        }
      },
    }, 'Definitief verwijderen');

    tweedeKaart = [
      h('section', { class: 'kaart' },
        h('h2', {}, 'Gearchiveerd'),
        h('p', {}, `Dit onderzoek is gearchiveerd${o.gearchiveerd_op ? ` op ${datum(new Date(o.gearchiveerd_op).toLocaleDateString('en-CA'))}` : ''}. Je kunt alles nog inzien en exporteren.`),
        h('div', { class: 'knoppen' }, h('a', { class: 'knop knop-primair', href: '#/nieuw' }, 'Nieuw onderzoek starten')),
      ),
      h('section', { class: 'kaart' },
        h('h2', {}, 'Definitief verwijderen'),
        h('p', {}, 'Bewaar onderzoeksgegevens niet langer dan nodig (AVG). Heb je dit onderzoek niet meer nodig, download dan eerst wat je wilt bewaren en verwijder het daarna definitief.'),
        h('div', { class: 'knoppen' }, verwijder),
      ),
    ];
  }

  vervang(container, exportKaart, tweedeKaart);
}
