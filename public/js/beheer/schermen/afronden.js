// Scherm: Afronden – exporteren, archiveren en (na archiveren) definitief verwijderen.

import { api, downloadUrl } from '../api.js';
import { h, vervang, laden, melding, meld, meldFout, bevestig, download, aantal, datum } from '../ui.js';
import * as exp from '../export.js';
import { haalGegevens, voortgangTekst } from '../gegevens.js';

// Waarschuwing bij ruwe exports (BOUWPLAN B30, K S10): deze bestanden bevatten alle losse antwoorden.
export const RUW_WAARSCHUWING = 'Dit bestand bevat alle losse antwoorden en is niet anoniem genoeg om te delen met de opdrachtgever.';

/** Vraagt vóór een ruwe export of je weet dat het bestand niet om te delen is. */
export function bevestigRuweExport() {
  return bevestig({
    titel: 'Dit bestand is niet om te delen',
    tekst: [
      RUW_WAARSCHUWING,
      'Bewaar het op een veilige plek. Wil je resultaten delen? Gebruik dan een rapport of een deellink: daarin worden kleine groepen niet getoond.',
    ],
    knop: 'Downloaden',
  });
}

export async function toon(container, ctx) {
  const o = ctx.onderzoek.onderzoek;
  const onderzoekId = o.id;
  ctx.zetTitel(`Afronden – ${o.titel}`);

  /**
   * Knop die een exportbestand maakt; toont "Bezig…" en meldt het resultaat.
   * Bij elke download de actuele gegevens (gegevens.js haalt alleen op wat er sinds de vorige keer veranderd is).
   * ruw: het bestand bevat alle losse antwoorden; dan eerst de waarschuwing.
   */
  function exportKnop(label, maak, { ruw = false } = {}) {
    const knop = h('button', {
      type: 'button',
      class: 'knop',
      onclick: async () => {
        if (ruw && !(await bevestigRuweExport())) return;
        const oud = knop.textContent;
        knop.disabled = true;
        knop.textContent = 'Bezig met maken…';
        try {
          const d = await haalGegevens(onderzoekId, { voortgang: (geladen, totaal) => { knop.textContent = voortgangTekst(geladen, totaal); } });
          knop.textContent = 'Bezig met maken…';
          const [inhoud, naam, type] = await maak(d);
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
  // De bestanden voor Excel, Word, SPSS en de agenda worden pas geladen als je erom vraagt.
  const metBestanden = (maak) => async (d) => maak(await import('../export-bestanden.js'), d);

  const groep = (titel, uitleg, regels) => h('div', { class: 'af-groep' },
    h('h3', {}, titel),
    uitleg ? h('p', { class: 'klein zacht' }, uitleg) : null,
    h('ul', { class: 'lijst' }, regels));

  const kantoor = groep('Excel en Word', null, [
    exportRegel('Excel-werkboek (.xlsx)',
      'Alles in één Excel-bestand met tabbladen: de antwoorden per vragenlijst, scores per thema, het codeboek, eigen invoer, acties en meetmomenten.',
      exportKnop('Downloaden', metBestanden((b, d) => [b.excelWerkboek(d), exp.bestandsnaam(d, 'werkboek', 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']), { ruw: true })),
    exportRegel('Stukken als Word-bestanden (.zip)',
      'Elk stuk (notities, bevindingen, rapport) als los Word-bestand, samen in één zip-bestand. Een rapport uit het tabblad Rapport download je daar als Word.',
      exportKnop('Downloaden', metBestanden((b, d) => {
        if (!d.stukken.length) throw new Error('Dit onderzoek heeft geen stukken.');
        const z = b.stukkenAlsZip(d);
        return [z.inhoud, z.naam, 'application/zip'];
      }))),
  ]);

  const spss = groep('SPSS', 'Voor wie zelf verder wil rekenen in SPSS (of het gratis PSPP).', [
    exportRegel('SPSS-pakket (.zip)',
      'Het gegevensbestand met alle respondenten, een syntaxbestand dat de gegevens inleest en alle labels instelt, en een korte uitleg. Meetmomenten staan onder elkaar, zodat je ze kunt vergelijken.',
      exportKnop('Downloaden', metBestanden((b, d) => {
        if (!d.inzendingen.length) throw new Error('Er zijn nog geen antwoorden om naar SPSS te exporteren.');
        const z = b.spssPakket(d);
        return [z.inhoud, z.naam, 'application/zip'];
      }), { ruw: true })),
  ]);

  const agenda = groep('Agenda (Outlook)', null, [
    exportRegel('Meetmomenten en acties in je agenda (.ics)',
      'Een agendabestand met de meetmomenten en de openstaande acties die een datum hebben. Open het bestand en Outlook (of een andere agenda) vraagt of je de afspraken wilt toevoegen.',
      exportKnop('Downloaden', metBestanden((b, d) => {
        if (!b.agendaAfspraken(d).length) throw new Error('Er zijn geen meetmomenten of openstaande acties met een datum.');
        return [b.agendaBestand(d, new Date()), exp.bestandsnaam(d, 'agenda', 'ics'), 'text/calendar;charset=utf-8'];
      }))),
  ]);

  const overig = groep('Losse bestanden (CSV, tekst en JSON)', 'CSV-bestanden openen in Excel en in bijna elk ander programma.', [
    exportRegel('Alle antwoorden (CSV)',
      'Alle vragenlijsten samen, één regel per antwoord. Handig voor een draaitabel in Excel.',
      exportKnop('Downloaden', (d) => [exp.alleAntwoordenCsv(d), exp.bestandsnaam(d, 'alle-antwoorden', 'csv'), csv], { ruw: true })),
    ...vragenlijsten.map((l) => exportRegel(
      `Antwoorden: ${l.titel} (CSV)`,
      `${l.meetmoment_naam ? `${l.meetmoment_naam} · ` : ''}${aantal(l.aantal_inzendingen, 'respondent', 'respondenten')}, één regel per respondent.`,
      exportKnop('Downloaden', (d) => [exp.antwoordenVragenlijstCsv(d, l.id), exp.bestandsnaam(d, `antwoorden-${l.titel}`, 'csv'), csv], { ruw: true }),
    )),
    exportRegel('Eigen invoer (CSV)',
      'Interviews, observaties en cijfers die je zelf hebt ingevoerd.',
      exportKnop('Downloaden', (d) => [exp.eigenInvoerCsv(d), exp.bestandsnaam(d, 'eigen-invoer', 'csv'), csv])),
    exportRegel('Stukken (tekstbestand)',
      'Notities, bevindingen en rapport, plus de actielijst, in één tekstbestand.',
      h('button', { type: 'button', class: 'knop', onclick: () => download(downloadUrl(`/onderzoeken/${onderzoekId}/export/stukken.txt`)) }, 'Downloaden')),
    exportRegel('Alles samen (JSON)',
      'Volledige kopie van dit onderzoek, voor je eigen archief. Bevat alles: opzet, vragen, antwoorden, eigen invoer, stukken, rapporten, acties, eigen datasets, de werkbank (eigen variabelen, selecties en bewaarde analyses), codes en citaten bij open antwoorden, HR-instellingen, personeelscijfers (alleen groepscijfers) en de gekoppelde bronnen.',
      exportKnop('Downloaden', async (d) => {
        // Eigen datasets en de gekoppelde bronnen staan apart opgeslagen; voor de volledige kopie halen we ze erbij.
        const { datasets } = await api.get(`/onderzoeken/${onderzoekId}/datasets`);
        d.datasets = [];
        for (const ds of datasets) d.datasets.push((await api.get(`/datasets/${ds.id}`)).dataset);
        const { bronnen } = await api.get(`/onderzoeken/${onderzoekId}/bronnen`);
        return [exp.volledigeJson(d, { bronnen }), exp.bestandsnaam(d, 'volledig', 'json'), 'application/json;charset=utf-8'];
      }, { ruw: true })),
  ]);

  const exportKaart = h('section', { class: 'kaart' },
    h('h2', {}, 'Exporteren'),
    h('p', {}, 'Download de resultaten en je stukken om ze te bewaren of in een ander programma verder te gebruiken.'),
    h('p', { class: 'klein zacht' },
      'Let op: exportbestanden bevatten alle losse antwoorden, ook van kleine groepen. Bewaar ze op een veilige plek en deel ze niet zomaar.'),
    h('p', { class: 'klein zacht' },
      'Wil je iets delen met de opdrachtgever? Een rapport uit het tabblad Rapport (als Word of pdf) is ',
      h('span', { class: 'label label-succes' }, 'geschikt om te delen'),
      ': daarin staan geen uitkomsten van minder dan 5 respondenten.'),
    kantoor, spss, agenda, overig,
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
            'Na archiveren kun je alles nog inzien en exporteren, maar niets meer wijzigen. Open vragenlijsten worden gesloten; respondenten kunnen dan niet meer invullen. Deellinks blijven werken tot hun einddatum; trek ze in bij Delen als dat niet meer nodig is.',
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
            `Alles van "${o.titel}" (${o.bedrijfsnaam}) wordt definitief verwijderd: vragenlijsten, antwoorden, eigen invoer, stukken, rapporten, eigen datasets, acties, deellinks, de werkbank (eigen variabelen en analyses), codes en citaten, HR-instellingen en personeelscijfers. De bronnen in de bibliotheek blijven staan; alleen de koppeling met dit onderzoek gaat weg. Dit kan niet ongedaan worden gemaakt.`,
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
