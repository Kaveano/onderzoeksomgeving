// Scherm: één vragenlijst bewerken.
// Onderdelen: 1. Delen en status  2. Instellingen  3. Vragen (per thema)  4. Voorbeeld.
// De vraagdialoog is een eigen <dialog> (zelfde opbouw als in ui.js), omdat de velden
// meeveranderen met het gekozen vraagtype.

import { api } from '../api.js';
import {
  h, vervang, leeg, melding, meld, meldFout, bevestig, datum, aantal, procent, statusLabel, vragenlijstLink,
} from '../ui.js';
import { kopieerLink } from './vragenlijsten.js';
import { magOpenzetten } from '../verschilwacht.js';
import { vergeetGegevens } from '../gegevens.js';
import { KENMERKEN } from '../kenmerken.js';
import { kenmerkDialoog } from './kenmerk-dialoog.js';

const MAX_VRAGEN = 100;
const MAX_OPTIES = 30;

const TYPE_UITLEG = {
  schaal: 'Vijf antwoorden van laag naar hoog, bijvoorbeeld van "helemaal oneens" tot "helemaal eens".',
  meerkeuze: 'Respondenten kiezen uit antwoorden die jij opgeeft, bijvoorbeeld hun afdeling.',
  janee: 'Respondenten antwoorden met ja of nee.',
  cijfer: 'Een cijfer, bijvoorbeeld "Hoe waarschijnlijk is het dat je … aanbeveelt?" (0 tot 10) of een rapportcijfer (1 tot 10). Telt niet mee in de themascores.',
  open: 'Respondenten schrijven zelf een antwoord.',
};

/** Label bij een cijfervraag in de lijst met vragen. */
const CIJFER_LABEL = { nps: 'Cijfer 0–10', rapport: 'Rapportcijfer 1–10' };
const KENMERK_HULP = 'Kies dit als de vraag gaat over wie de respondent is, zoals afdeling of leeftijd. Dan zie je bij HR-analytics wie er hebben meegedaan en kun je groepen vergelijken. Groepen met minder dan 5 respondenten worden nooit getoond.';
// Een kenmerk of uitsplitsing beschermt de verdeling van de vraag (isBeschermd in dashboard-rekenen.js); zonder beide niet meer.
const KENMERK_WEG = 'Let op: zonder kenmerk en zonder uitsplitsing worden kleine aantallen bij deze vraag niet meer verborgen, ook niet voor meelezers.';

function meetmomentNaam(mm) {
  return mm.datum ? `${mm.naam} (${datum(mm.datum)})` : mm.naam;
}

/** Kort een lange tekst in voor gebruik in een bevestigingsvraag. */
function kort(tekst, max = 90) {
  const t = String(tekst || '');
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

let dialoogTeller = 0;

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const vlId = ctx.params.vlId;
  const basis = `#/onderzoek/${onderzoekId}`;
  const terugLink = `${basis}/vragenlijsten`;
  const inst = ctx.instellingen;
  const ro = ctx.alleenLezen;
  const meetmomenten = ctx.onderzoek.meetmomenten || [];
  let themas = ctx.onderzoek.themas || []; // opnieuw opgehaald als er een thema bij komt (Achtergrondvragen toevoegen)
  const drempel = inst.drempel || 5;

  const kruimel = h('div', { class: 'kruimel' }, h('a', { href: terugLink }, '← Alle vragenlijsten'));

  let data;
  try {
    data = await api.get(`/vragenlijsten/${vlId}`);
  } catch (e) {
    vervang(container, kruimel, melding([h('strong', {}, 'Deze vragenlijst kon niet worden geladen. '), e.message || ''], 'gevaar'));
    return;
  }
  if (String(data.vragenlijst.onderzoek_id) !== String(onderzoekId)) {
    vervang(container, kruimel, melding('Deze vragenlijst hoort bij een ander onderzoek.', 'waarschuwing'));
    return;
  }

  const vl = { ...data.vragenlijst };
  let vragen = data.vragen;
  let inzendingen = data.aantal_inzendingen || 0;
  let bezig = false;
  let laatsteThema = null;
  let meerOpen = false;
  let openDialoog = null;

  const meetpuntNamen = new Map();
  for (const t of themas) for (const m of t.meetpunten || []) meetpuntNamen.set(m.id, m.naam);

  ctx.zetTitel(`${vl.titel} – Vragenlijsten`);

  // ---------- Opbouw van de pagina ----------

  const kopEl = h('div', { class: 'vl-kop' });
  const bannerEl = h('div', {});
  const delenKaart = h('section', { class: 'kaart vl-sectie', 'aria-labelledby': 'vl-kop-delen' });
  const instKaart = h('section', { class: 'kaart vl-sectie', 'aria-labelledby': 'vl-kop-inst' });
  const vragenKaart = h('section', { class: 'kaart vl-sectie', 'aria-labelledby': 'vl-kop-vragen' });
  const voorbeeldKaart = h('section', { class: 'kaart vl-sectie', 'aria-labelledby': 'vl-kop-voorbeeld' });
  const aankondiging = h('div', { class: 'sr-only', 'aria-live': 'polite' });

  function kondigAan(tekst) {
    aankondiging.textContent = '';
    setTimeout(() => {
      aankondiging.textContent = tekst;
    }, 60);
  }

  function zetFocus(sleutels) {
    for (const s of sleutels) {
      const el = container.querySelector(`[data-focus="${s}"]`);
      if (el && !el.disabled && el.offsetParent !== null) {
        el.focus();
        return true;
      }
    }
    return false;
  }

  function lichtOp(vraagId) {
    const el = container.querySelector(`[data-vraag="${vraagId}"]`);
    if (!el) return;
    el.classList.remove('vl-oplichten');
    void el.offsetWidth; // animatie opnieuw starten
    el.classList.add('vl-oplichten');
    el.scrollIntoView({ block: 'nearest' });
  }

  function sectieKop(id, titel, onderkop = null, rechts = null) {
    return h('div', { class: 'kaart-kop' },
      h('div', {},
        h('h3', { id, class: 'vl-sectie-titel', tabindex: '-1' }, titel),
        onderkop ? h('p', { class: 'vl-onderkop' }, onderkop) : null),
      rechts,
    );
  }

  function naarSectie(id) {
    const el = container.querySelector(`#${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  }

  /** Haalt de vragenlijst opnieuw op en tekent alles behalve het instellingenformulier. */
  async function herlaad({ focus = null, markeer = null } = {}) {
    try {
      data = await api.get(`/vragenlijsten/${vlId}`);
    } catch (e) {
      meldFout(e);
      return false;
    }
    vragen = data.vragen;
    inzendingen = data.aantal_inzendingen || 0;
    vl.status = data.vragenlijst.status;
    vl.code = data.vragenlijst.code;
    tekenKop();
    tekenBanner();
    tekenDelen();
    tekenVragen();
    if (markeer) lichtOp(markeer);
    if (focus) zetFocus(focus);
    return true;
  }

  // ---------- Kop ----------

  function tekenKop() {
    const mm = meetmomenten.find((m) => m.id === vl.meetmoment_id);
    vervang(kopEl,
      h('div', { class: 'vl-kop-tekst' },
        h('p', { class: 'vl-kop-soort' }, 'Vragenlijst'),
        h('h2', { class: 'vl-kop-titel' }, vl.titel),
        h('div', { class: 'rij vl-kop-meta' },
          statusLabel(vl.status),
          h('span', { class: 'label' }, mm ? `Meetmoment: ${meetmomentNaam(mm)}` : 'Geen meetmoment'),
          h('span', { class: 'zacht klein' },
            `${aantal(vragen.length, 'vraag', 'vragen')} · ${inzendingen.toLocaleString('nl-NL')} keer ingevuld`),
        ),
      ),
      h('div', { class: 'knoppen' },
        h('button', { type: 'button', class: 'knop', onclick: toonVoorbeeld }, 'Voorbeeld bekijken')),
    );
  }

  function tekenBanner() {
    if (!inzendingen || ro) {
      vervang(bannerEl);
      return;
    }
    vervang(bannerEl, melding([
      h('p', {}, h('strong', {}, `Deze vragenlijst is al ${aantal(inzendingen, 'keer', 'keer')} ingevuld.`),
        ' Wijzigingen aan de vragen gelden ook voor de antwoorden die al binnen zijn. Verander de betekenis van een vraag daarom niet, anders zijn de antwoorden niet meer goed te vergelijken. Het vraagtype en de keuze tussen één of meerdere antwoorden liggen nu vast.'),
      h('p', { class: 'klein' }, 'Waren dit alleen testantwoorden? Wis ze dan bij "Delen en status" voordat je de echte link verstuurt.'),
    ], 'waarschuwing'));
  }

  // ---------- 1. Delen en status ----------

  async function wisselStatus() {
    if (bezig) return;
    const naar = vl.status === 'open' ? 'gesloten' : 'open';
    if (naar === 'open' && !vragen.length) {
      meld('Voeg eerst minimaal één vraag toe voordat je de vragenlijst openzet.', 'fout');
      return;
    }
    if (naar === 'gesloten') {
      const ok = await bevestig({
        titel: 'Vragenlijst sluiten?',
        tekst: [
          'Respondenten kunnen de vragenlijst daarna niet meer invullen; ze zien dan de melding dat hij gesloten is.',
          'Antwoorden die al binnen zijn, blijven bewaard. Je kunt de vragenlijst later weer openzetten.',
        ],
        knop: 'Sluiten',
      });
      if (!ok) return;
    } else if (!(await magOpenzetten(onderzoekId, { id: vl.id, status: vl.status, aantal_inzendingen: inzendingen }))) {
      // Gedeeld via een deellink: eerst de waarschuwing over een paar nieuwe respondenten (BOUWPLAN B9).
      return;
    }
    // Niet-opgeslagen instellingen (bijv. de uitleg) eerst bewaren, zodat respondenten de juiste tekst zien.
    if (naar === 'open' && instellingenGewijzigd() && !(await slaInstellingenOp())) return;
    bezig = true;
    try {
      await api.post(`/vragenlijsten/${vlId}/status`, { status: naar });
      vl.status = naar;
      meld(naar === 'open'
        ? 'De vragenlijst staat open. Respondenten kunnen hem nu invullen via de link.'
        : 'De vragenlijst is gesloten.', 'succes');
      tekenKop();
      tekenDelen();
      zetFocus(['status']);
    } catch (e) {
      meldFout(e);
    } finally {
      bezig = false;
    }
  }

  async function nieuweLink() {
    const ok = await bevestig({
      titel: 'Nieuwe link maken?',
      tekst: [
        'De vragenlijst krijgt een nieuwe link. De oude link werkt daarna niet meer: wie die nog gebruikt, krijgt de melding dat de vragenlijst niet bestaat.',
        'Doe dit bijvoorbeeld als de link bij de verkeerde mensen terecht is gekomen. Antwoorden die al binnen zijn, blijven bewaard. Vergeet niet de nieuwe link te delen.',
      ],
      knop: 'Nieuwe link maken',
      gevaar: true,
    });
    if (!ok) return;
    try {
      const r = await api.post(`/vragenlijsten/${vlId}/nieuwe-code`, {});
      vl.code = r.code;
      meld('Nieuwe link gemaakt. De oude link werkt niet meer.', 'succes');
      tekenDelen();
      const veld = container.querySelector('#vl-link');
      if (veld) veld.focus();
    } catch (e) {
      meldFout(e);
    }
  }

  async function wisAntwoorden() {
    // Vlak voor het wissen opnieuw tellen: codes en citaten kunnen intussen op het scherm Coderen zijn gegeven (R10).
    let telling = { inzendingen, coderingen: data.aantal_coderingen || 0, citaten: data.aantal_citaten || 0 };
    try {
      const vers = await api.get(`/vragenlijsten/${vlId}`);
      telling = { inzendingen: vers.aantal_inzendingen || 0, coderingen: vers.aantal_coderingen || 0, citaten: vers.aantal_citaten || 0 };
    } catch { /* dan de telling van het laden */ }
    const ok = await bevestig({
      titel: 'Alle antwoorden wissen?',
      tekst: [
        h('p', {}, h('strong', {}, `Alle ${aantal(telling.inzendingen, 'ingevulde vragenlijst', 'ingevulde vragenlijsten')} worden definitief gewist.`)),
        codeerwerkTekst(telling),
        'Gebruik dit alleen om testantwoorden weg te halen voordat het echte onderzoek begint. De vragen en de link blijven zoals ze zijn. Dit kun je niet ongedaan maken.',
      ].filter(Boolean),
      knop: 'Antwoorden wissen',
      gevaar: true,
      typTekst: 'WISSEN',
    });
    if (!ok) return;
    try {
      const r = await api.del(`/vragenlijsten/${vlId}/inzendingen`);
      vergeetGegevens(onderzoekId);
      const werk = r.coderingen || r.citaten ? ` ${codeerwerkGewist(r)}` : '';
      meld(`${aantal(r.verwijderd ?? telling.inzendingen, 'ingevulde vragenlijst', 'ingevulde vragenlijsten')} gewist.${werk}`, 'succes');
      await herlaad({ focus: ['link'] });
    } catch (e) {
      meldFout(e);
    }
  }

  function tekenDelen() {
    const open = vl.status === 'open';
    const link = vragenlijstLink(vl.code);
    const linkVeld = h('input', {
      type: 'text',
      id: 'vl-link',
      class: 'vl-link-veld',
      readonly: true,
      value: link,
      'data-focus': 'link',
      'aria-describedby': 'vl-link-hulp',
    });
    linkVeld.addEventListener('focus', () => linkVeld.select());

    const respons = vl.aantal_uitgenodigd ? (inzendingen / vl.aantal_uitgenodigd) * 100 : null;
    const maxBereikt = vl.max_inzendingen && inzendingen >= vl.max_inzendingen;

    let statusUitleg;
    if (ro) statusUitleg = 'Dit onderzoek is gearchiveerd. De vragenlijst kan niet meer worden ingevuld.';
    else if (open) statusUitleg = 'Respondenten kunnen de vragenlijst nu invullen via de link.';
    else if (!vragen.length) {
      statusUitleg = [
        'Voeg eerst ',
        h('button', {
          type: 'button',
          class: 'vl-tekstknop',
          onclick: () => (themas.length ? nieuweVraag() : naarSectie('vl-kop-vragen')),
        }, 'vragen toe'),
        '. Daarna kun je de vragenlijst openzetten.',
      ];
    }
    else statusUitleg = 'Respondenten kunnen de vragenlijst nu niet invullen. Zet hem open als hij klaar is.';

    const statusBlok = h('div', { class: `vl-status ${open ? 'vl-status-open' : 'vl-status-gesloten'}` },
      h('div', { class: 'vl-status-hoofd' },
        h('span', { class: 'vl-status-stip', 'aria-hidden': 'true' }),
        h('div', {},
          h('p', { class: 'vl-status-woord' }, h('span', { class: 'sr-only' }, 'Status: '), open ? 'Open' : 'Gesloten'),
          h('p', { class: 'vl-status-uitleg' }, statusUitleg),
        ),
      ),
      ro ? null : h('button', {
        type: 'button',
        class: `knop ${open || !vragen.length ? '' : 'knop-primair'} vl-status-knop`,
        'data-focus': 'status',
        onclick: wisselStatus,
      }, open ? 'Vragenlijst sluiten' : 'Vragenlijst openzetten'),
    );

    const tellingBlok = h('div', { class: 'vl-telling' },
      h('p', { class: 'vl-telling-getal' }, inzendingen.toLocaleString('nl-NL')),
      h('p', { class: 'vl-telling-label' }, 'keer ingevuld'),
      respons !== null
        ? h('p', { class: 'klein' }, h('strong', {}, `${procent(respons)} respons`),
          ` van ${vl.aantal_uitgenodigd.toLocaleString('nl-NL')} uitgenodigd`)
        : (ro ? null : h('p', { class: 'klein zacht' }, 'Vul bij Instellingen het aantal uitgenodigden in om het responspercentage te zien.')),
      vl.max_inzendingen
        ? h('p', { class: `klein${maxBereikt ? ' vl-tekst-waarschuwing' : ' zacht'}` },
          maxBereikt
            ? `Het maximum van ${vl.max_inzendingen.toLocaleString('nl-NL')} is bereikt: nieuwe antwoorden worden geweigerd.`
            : `Maximum: ${vl.max_inzendingen.toLocaleString('nl-NL')}`)
        : null,
    );

    let linkHulp;
    if (ro) {
      linkHulp = ['Via deze link is de vragenlijst niet meer in te vullen. Met "Voorbeeld bekijken" zie je de vragen zoals respondenten ze zagen.'];
    } else if (open) {
      linkHulp = ['Deel deze link per e-mail of bericht. Iedereen met de link kan de vragenlijst invullen; inloggen is niet nodig.'];
    } else {
      linkHulp = [
        'Zolang de vragenlijst gesloten is, ziet iedereen die deze link opent alleen de melding dat hij gesloten is. Wil je de vragen alvast zien zoals respondenten ze zien? ',
        h('button', { type: 'button', class: 'vl-tekstknop', onclick: toonVoorbeeld }, 'Bekijk het voorbeeld'),
        '.',
      ];
    }

    const linkBlok = h('div', { class: 'veld vl-link' },
      h('label', { for: 'vl-link' }, 'Link voor respondenten'),
      h('div', { class: 'vl-link-rij' },
        linkVeld,
        h('div', { class: 'vl-link-knoppen' },
          h('button', { type: 'button', class: 'knop', onclick: () => kopieerLink(vl) }, 'Link kopiëren'),
          h('a', {
            class: 'knop',
            href: `/v/${encodeURIComponent(vl.code)}`,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, 'Bekijk als respondent', h('span', { class: 'sr-only' }, ' (opent in een nieuw tabblad)'),
          h('span', { 'aria-hidden': 'true' }, ' ↗')),
        ),
      ),
      h('div', { class: 'veld-hulp', id: 'vl-link-hulp' }, linkHulp),
    );

    let meer = null;
    if (!ro) {
      meer = h('details', { class: 'vl-meer', open: meerOpen },
        h('summary', {}, 'Link vervangen of testantwoorden wissen'),
        h('div', { class: 'vl-meer-inhoud' },
          h('div', { class: 'vl-meer-item' },
            h('div', {},
              h('p', { class: 'vl-meer-titel' }, 'Nieuwe link maken'),
              h('p', { class: 'klein zacht' }, 'Is de link bij de verkeerde mensen terechtgekomen? Maak dan een nieuwe link. De oude link werkt daarna niet meer.'),
            ),
            h('button', { type: 'button', class: 'knop knop-klein', onclick: nieuweLink }, 'Nieuwe link maken'),
          ),
          h('div', { class: 'vl-meer-item' },
            h('div', {},
              h('p', { class: 'vl-meer-titel' }, 'Antwoorden wissen'),
              h('p', { class: 'klein zacht' }, inzendingen
                ? 'Heb je de vragenlijst getest? Wis dan de testantwoorden voordat het echte onderzoek begint, zodat ze niet meetellen. Alle antwoorden worden gewist.'
                : 'Er zijn nog geen antwoorden. Heb je de vragenlijst straks getest, dan kun je hier de testantwoorden wissen.'),
            ),
            h('button', {
              type: 'button',
              class: 'knop knop-klein vl-knop-gevaar',
              disabled: !inzendingen,
              onclick: wisAntwoorden,
            }, 'Antwoorden wissen'),
          ),
        ),
      );
      meer.addEventListener('toggle', () => {
        meerOpen = meer.open;
      });
    }

    vervang(delenKaart,
      sectieKop('vl-kop-delen', 'Delen en status'),
      h('div', { class: 'vl-delen-boven' }, statusBlok, tellingBlok),
      linkBlok,
      meer,
    );
  }

  // ---------- 2. Instellingen ----------

  const instVelden = {};
  const instFout = h('div', { class: 'veld-fout', role: 'alert' });
  const instStatus = h('span', { class: 'vl-opslaanstatus', 'aria-live': 'polite' });
  let instBasis = null;

  function instWaarden() {
    return {
      titel: instVelden.titel.value.trim(),
      meetmoment_id: instVelden.meetmoment_id.value,
      aantal_uitgenodigd: instVelden.aantal_uitgenodigd.value.trim(),
      max_inzendingen: instVelden.max_inzendingen.value.trim(),
      introtekst: instVelden.introtekst.value.trim(),
      bedanktekst: instVelden.bedanktekst.value.trim(),
    };
  }

  function instellingenGewijzigd() {
    if (ro || !instBasis) return false;
    const w = instWaarden();
    return Object.keys(w).some((k) => w[k] !== instBasis[k]);
  }

  function werkInstStatusBij() {
    const gewijzigd = instellingenGewijzigd();
    instStatus.textContent = gewijzigd ? 'Je hebt wijzigingen die nog niet zijn opgeslagen.' : '';
    instStatus.classList.toggle('vl-niet-opgeslagen', gewijzigd);
  }

  function controleerGetal(el, naam) {
    const ruw = el.value.trim();
    if (el.validity && el.validity.badInput) return `Vul bij "${naam}" een heel getal in, of laat het veld leeg.`;
    if (!ruw) return null;
    const n = Number(ruw);
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) return `Vul bij "${naam}" een heel getal in van 1 tot 1.000.000, of laat het veld leeg.`;
    return null;
  }

  /** Slaat de instellingen op. Geeft true bij succes. stil = bij vertrek van het scherm. */
  async function slaInstellingenOp({ stil = false } = {}) {
    for (const el of Object.values(instVelden)) el.removeAttribute('aria-invalid');
    instFout.textContent = '';
    const w = instWaarden();
    let fout = null;
    let foutVeld = null;
    if (!w.titel) {
      fout = 'Vul een titel in.';
      foutVeld = instVelden.titel;
    } else if ((fout = controleerGetal(instVelden.aantal_uitgenodigd, 'Aantal uitgenodigden'))) {
      foutVeld = instVelden.aantal_uitgenodigd;
    } else if ((fout = controleerGetal(instVelden.max_inzendingen, 'Maximum aantal inzendingen'))) {
      foutVeld = instVelden.max_inzendingen;
    }
    if (fout) {
      if (stil) {
        meld(`De instellingen van de vragenlijst zijn niet opgeslagen: ${fout}`, 'fout');
      } else {
        instFout.textContent = fout;
        foutVeld.setAttribute('aria-invalid', 'true');
        foutVeld.focus();
      }
      return false;
    }
    const body = {
      titel: w.titel,
      meetmoment_id: w.meetmoment_id ? Number(w.meetmoment_id) : null,
      introtekst: w.introtekst,
      bedanktekst: w.bedanktekst,
      aantal_uitgenodigd: w.aantal_uitgenodigd ? Number(w.aantal_uitgenodigd) : null,
      max_inzendingen: w.max_inzendingen ? Number(w.max_inzendingen) : null,
      status: vl.status,
    };
    try {
      await api.put(`/vragenlijsten/${vlId}`, body);
    } catch (e) {
      if (stil) meldFout(e);
      else instFout.textContent = e.message || 'Opslaan is mislukt.';
      return false;
    }
    Object.assign(vl, body);
    instBasis = w;
    werkInstStatusBij();
    if (!stil) {
      ctx.zetTitel(`${vl.titel} – Vragenlijsten`);
      tekenKop();
      tekenDelen();
    }
    meld('Instellingen van de vragenlijst opgeslagen.', 'succes');
    return true;
  }

  function veld(id, label, el, { hulp = null, verplicht = false } = {}) {
    el.id = id;
    if (hulp) el.setAttribute('aria-describedby', `${id}-hulp`);
    return h('div', { class: 'veld' },
      h('label', { for: id }, label, verplicht ? h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *') : null),
      el,
      hulp ? h('div', { class: 'veld-hulp', id: `${id}-hulp` }, hulp) : null,
    );
  }

  function tekenInstellingen() {
    if (ro) {
      const mm = meetmomenten.find((m) => m.id === vl.meetmoment_id);
      const rij = (term, waarde) => [h('dt', {}, term), h('dd', {}, waarde || h('span', { class: 'zacht' }, '–'))];
      vervang(instKaart,
        sectieKop('vl-kop-inst', 'Instellingen'),
        h('dl', { class: 'vl-gegevens' },
          rij('Titel', vl.titel),
          rij('Meetmoment', mm ? meetmomentNaam(mm) : 'Geen meetmoment'),
          rij('Aantal uitgenodigden', vl.aantal_uitgenodigd ? vl.aantal_uitgenodigd.toLocaleString('nl-NL') : ''),
          rij('Maximum aantal inzendingen', vl.max_inzendingen ? vl.max_inzendingen.toLocaleString('nl-NL') : 'Geen maximum'),
          rij('Uitleg voor respondenten', vl.introtekst),
          rij('Bedanktekst', vl.bedanktekst),
        ),
      );
      return;
    }

    instVelden.titel = h('input', { type: 'text', maxlength: 200, required: true, autocomplete: 'off', value: vl.titel });
    instVelden.meetmoment_id = h('select', {},
      h('option', { value: '' }, 'Geen meetmoment'),
      meetmomenten.map((mm) => h('option', { value: String(mm.id), selected: mm.id === vl.meetmoment_id }, meetmomentNaam(mm))));
    instVelden.aantal_uitgenodigd = h('input', {
      type: 'number', min: 1, max: 1000000, step: 1, inputmode: 'numeric', autocomplete: 'off', value: vl.aantal_uitgenodigd ?? '',
    });
    instVelden.max_inzendingen = h('input', {
      type: 'number', min: 1, max: 1000000, step: 1, inputmode: 'numeric', autocomplete: 'off', value: vl.max_inzendingen ?? '',
    });
    instVelden.introtekst = h('textarea', { rows: 7, maxlength: 5000 }, vl.introtekst || '');
    instVelden.bedanktekst = h('textarea', { rows: 3, maxlength: 2000 }, vl.bedanktekst || '');

    const form = h('form', {
      class: 'vl-inst-form',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        opslaanKnop.disabled = true;
        await slaInstellingenOp();
        opslaanKnop.disabled = false;
      },
      oninput: werkInstStatusBij,
      onchange: werkInstStatusBij,
    },
    h('div', { class: 'formulier-rij vl-inst-rij' },
      veld('vl-in-titel', 'Titel', instVelden.titel, { verplicht: true, hulp: 'Respondenten zien deze titel bovenaan de vragenlijst.' }),
      veld('vl-in-mm', 'Meetmoment', instVelden.meetmoment_id, {
        hulp: meetmomenten.length
          ? 'Bij welke meting hoort deze vragenlijst? Zo kun je metingen op het dashboard vergelijken.'
          : 'Dit onderzoek heeft nog geen meetmomenten. Die maak je bij Opzet.',
      }),
    ),
    h('div', { class: 'formulier-rij vl-inst-rij' },
      veld('vl-in-uitgenodigd', 'Aantal uitgenodigden', instVelden.aantal_uitgenodigd, {
        hulp: 'Optioneel. Hoeveel mensen nodig je uit? Dan zie je het responspercentage.',
      }),
      veld('vl-in-max', 'Maximum aantal inzendingen', instVelden.max_inzendingen, {
        hulp: 'Optioneel. Bescherming tegen misbruik van de link: daarna worden nieuwe antwoorden geweigerd. Laat leeg voor geen maximum.',
      }),
    ),
    veld('vl-in-intro', 'Uitleg voor respondenten', instVelden.introtekst, {
      hulp: 'Staat bovenaan de vragenlijst. Vertel waarom je dit onderzoek doet, hoe lang het invullen duurt en dat de antwoorden anoniem zijn.',
    }),
    veld('vl-in-bedankt', 'Bedanktekst', instVelden.bedanktekst, {
      hulp: 'Dit zien respondenten nadat ze hun antwoorden hebben verstuurd.',
    }),
    instFout,
    h('div', { class: 'vl-opslaanrij' }, opslaanKnop, instStatus),
    );
    instBasis = instWaarden();
    vervang(instKaart,
      sectieKop('vl-kop-inst', 'Instellingen', 'Titel, meetmoment en de teksten die respondenten zien.'),
      form,
    );
  }
  const opslaanKnop = h('button', { type: 'submit', class: 'knop knop-primair' }, 'Instellingen opslaan');

  // ---------- 3. Vragen ----------

  function groepeer() {
    const perThema = new Map();
    for (const q of vragen) {
      if (!perThema.has(q.thema_id)) perThema.set(q.thema_id, []);
      perThema.get(q.thema_id).push(q);
    }
    const groepen = [];
    for (const t of themas) {
      if (perThema.has(t.id)) {
        groepen.push({ thema: t, items: perThema.get(t.id) });
        perThema.delete(t.id);
      }
    }
    for (const [tid, items] of perThema) groepen.push({ thema: { id: tid, naam: 'Onbekend thema', meetpunten: [] }, items });
    return groepen;
  }

  async function verplaats(groep, i, richting) {
    if (bezig) return;
    const j = i + richting;
    if (j < 0 || j >= groep.items.length) return;
    const q = groep.items[i];
    const ander = groep.items[j];
    const ids = groepeer().flatMap((g) => g.items.map((x) => x.id));
    const a = ids.indexOf(q.id);
    const b = ids.indexOf(ander.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    bezig = true;
    try {
      await api.post('/volgorde', { soort: 'vragen', ids });
      const eigen = richting < 0 ? 'omhoog' : 'omlaag';
      const tegen = richting < 0 ? 'omlaag' : 'omhoog';
      if (await herlaad({ markeer: q.id, focus: [`vraag-${q.id}-${eigen}`, `vraag-${q.id}-${tegen}`, `vraag-${q.id}-wijzig`] })) {
        kondigAan(`De vraag staat nu op plek ${j + 1} van ${groep.items.length} binnen het thema "${groep.thema.naam}".`);
      }
    } catch (e) {
      meldFout(e);
    } finally {
      bezig = false;
    }
  }

  async function verwijderVraag(q) {
    const laatste = vragen.length === 1;
    const ok = await bevestig({
      titel: 'Vraag verwijderen?',
      tekst: [
        `"${kort(q.tekst)}" wordt uit deze vragenlijst verwijderd.`,
        inzendingen
          ? h('p', {}, h('strong', {}, `Deze vragenlijst is al ${aantal(inzendingen, 'keer', 'keer')} ingevuld.`),
            ' De antwoorden die al op deze vraag zijn gegeven, worden daarna niet meer getoond in de resultaten.')
          : null,
        laatste && vl.status === 'open'
          ? 'Dit is de laatste vraag. De vragenlijst wordt daarna gesloten, want een vragenlijst zonder vragen kan niet openstaan.'
          : null,
      ].filter(Boolean),
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    try {
      await api.del(`/vragen/${q.id}`);
      if (laatste && vl.status === 'open') {
        await api.post(`/vragenlijsten/${vlId}/status`, { status: 'gesloten' });
        meld('Vraag verwijderd. De vragenlijst is gesloten omdat er geen vragen meer in staan.');
      } else {
        meld('Vraag verwijderd.');
      }
    } catch (e) {
      meldFout(e);
    }
    await herlaad({ focus: ['vragen-toevoegen'] });
  }

  async function nieuweVraag(voorkeur = {}) {
    const r = await vraagDialoog(null, voorkeur);
    if (!r) return;
    laatsteThema = r.thema_id;
    meld('Vraag toegevoegd.', 'succes');
    await herlaad({ markeer: r.id, focus: r.nogEen ? null : [`vraag-${r.id}-wijzig`] });
    if (r.nogEen) nieuweVraag({ thema_id: r.thema_id, type: r.type });
  }

  /** "Achtergrondvragen toevoegen": standaardvragen in het thema Achtergrond (zie kenmerk-dialoog.js). */
  async function achtergrondToevoegen() {
    const r = await kenmerkDialoog({
      aanwezig: vragen.map((q) => q.kenmerk).filter((k) => k && !KENMERKEN[k]?.meerdere),
      // Voor het advies: elke vraag over wie de respondent is (kenmerk of uitsplitsen) telt mee.
      aantalAanwezig: vragen.filter((q) => q.kenmerk || q.uitsplitsen).length,
      medewerkers: vl.aantal_uitgenodigd || null,
      bedrijf: ctx.onderzoek.onderzoek?.bedrijfsnaam || null,
      metAntwoorden: inzendingen > 0,
      ruimte: MAX_VRAGEN - vragen.length,
      opslaan: (keuzes) => api.post(`/vragenlijsten/${vlId}/kenmerkvragen`, { kenmerken: keuzes }),
    });
    if (!r) return;
    meld(r.aantal === 1 ? 'Achtergrondvraag toegevoegd.' : `${r.aantal} achtergrondvragen toegevoegd.`, 'succes');
    // Een nieuw thema Achtergrond staat nog niet in de gegevens van het onderzoek: die opnieuw ophalen.
    if (!themas.some((t) => t.id === r.thema_id) && typeof ctx.herlaadOnderzoek === 'function') {
      try {
        themas = (await ctx.herlaadOnderzoek()).themas || themas;
        for (const t of themas) for (const m of t.meetpunten || []) meetpuntNamen.set(m.id, m.naam);
      } catch (e) {
        meldFout(e);
      }
    }
    await herlaad({ focus: ['kenmerken-toevoegen'] });
  }

  async function wijzigVraag(q) {
    const r = await vraagDialoog(q);
    if (!r) return;
    meld('Vraag opgeslagen.', 'succes');
    await herlaad({ markeer: q.id, focus: [`vraag-${q.id}-wijzig`] });
  }

  function vraagTags(q) {
    const tags = [];
    if (q.verplicht) tags.push(h('span', { class: 'label label-primair' }, 'Verplicht'));
    if (q.uitsplitsen) tags.push(h('span', { class: 'label label-succes', title: 'Resultaten zijn per groep te bekijken' }, 'Uitsplitsing'));
    if (q.meetpunt_id && meetpuntNamen.has(q.meetpunt_id)) tags.push(h('span', { class: 'label' }, `Meetpunt: ${meetpuntNamen.get(q.meetpunt_id)}`));
    if (q.type === 'schaal') tags.push(h('span', { class: 'label' }, `Schaal: ${inst.schaal_namen[q.schaal_soort] || q.schaal_soort}`));
    if (q.type === 'cijfer') tags.push(h('span', { class: 'label' }, CIJFER_LABEL[q.schaal_soort] || CIJFER_LABEL.rapport));
    if ((q.type === 'schaal' || q.type === 'cijfer') && q.weet_niet) tags.push(h('span', { class: 'label' }, '"Weet niet" mogelijk'));
    if (q.kenmerk && KENMERKEN[q.kenmerk]) tags.push(h('span', { class: 'label label-primair', title: 'Achtergrondkenmerk' }, `Kenmerk: ${KENMERKEN[q.kenmerk].naam}`));
    if (q.type === 'meerkeuze' && q.meerdere_antwoorden) tags.push(h('span', { class: 'label' }, 'Meerdere antwoorden mogelijk'));
    return tags.length ? h('div', { class: 'vl-vraag-tags' }, tags) : null;
  }

  function vraagItem(q, nr, groep, i) {
    const pijl = (richting, teken, woord) => h('button', {
      type: 'button',
      class: 'knop knop-klein knop-icoon',
      'aria-label': `Vraag ${nr} ${woord} verplaatsen`,
      title: `${woord[0].toUpperCase()}${woord.slice(1)} verplaatsen`,
      disabled: richting < 0 ? i === 0 : i === groep.items.length - 1,
      'data-focus': `vraag-${q.id}-${woord}`,
      onclick: () => verplaats(groep, i, richting),
    }, h('span', { 'aria-hidden': 'true' }, teken));

    return h('li', { class: 'vl-vraag', 'data-vraag': String(q.id) },
      h('div', { class: 'vl-vraag-nr', 'aria-hidden': 'true' }, String(nr)),
      h('div', { class: 'vl-vraag-hoofd' },
        h('p', { class: 'vl-vraag-type' }, inst.vraagtypen[q.type] || q.type),
        h('p', { class: 'vl-vraag-tekst' }, h('span', { class: 'sr-only' }, `Vraag ${nr}: `), q.tekst),
        q.toelichting ? h('p', { class: 'vl-vraag-toelichting' }, q.toelichting) : null,
        q.type === 'meerkeuze' && q.opties.length
          ? h('ul', { class: 'vl-opties-lijst', 'aria-label': 'Antwoordmogelijkheden' }, q.opties.map((o) => h('li', {}, o.label)))
          : null,
        vraagTags(q),
      ),
      ro ? null : h('div', { class: 'vl-vraag-acties' },
        groep.items.length > 1 ? h('span', { class: 'vl-pijlen' }, pijl(-1, '↑', 'omhoog'), pijl(1, '↓', 'omlaag')) : null,
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          'data-focus': `vraag-${q.id}-wijzig`,
          'aria-label': `Vraag ${nr} wijzigen`,
          onclick: () => wijzigVraag(q),
        }, 'Wijzigen'),
        h('button', {
          type: 'button',
          class: 'knop knop-klein knop-licht vl-knop-gevaar',
          'aria-label': `Vraag ${nr} verwijderen`,
          onclick: () => verwijderVraag(q),
        }, 'Verwijderen'),
      ),
    );
  }

  function tekenVragen() {
    const groepen = groepeer();
    const vol = vragen.length >= MAX_VRAGEN;
    const toevoegKnop = ro || !themas.length ? null : h('button', {
      type: 'button',
      class: 'knop knop-primair',
      'data-focus': 'vragen-toevoegen',
      disabled: vol,
      onclick: () => nieuweVraag(),
    }, '+ Vraag toevoegen');
    const kenmerkKnop = ro || !themas.length ? null : h('button', {
      type: 'button',
      class: 'knop',
      'data-focus': 'kenmerken-toevoegen',
      'aria-haspopup': 'dialog',
      disabled: vol,
      onclick: () => achtergrondToevoegen(),
    }, 'Achtergrondvragen toevoegen');

    let onderkop;
    if (!vragen.length) onderkop = 'Elke vraag hoort bij een thema, zodat je de resultaten per thema kunt bekijken.';
    else onderkop = `${aantal(vragen.length, 'vraag', 'vragen')} in ${aantal(groepen.length, 'thema', "thema's")}. Respondenten zien de vragen in deze volgorde, per thema.`;

    const inhoud = [];
    if (vol && !ro) inhoud.push(melding(`Deze vragenlijst heeft het maximum van ${MAX_VRAGEN} vragen bereikt.`, 'waarschuwing'));

    if (!themas.length) {
      inhoud.push(melding([
        h('p', {}, h('strong', {}, "Dit onderzoek heeft nog geen thema's. "),
          'Elke vraag hoort bij een thema (bijvoorbeeld "Werkdruk" of "Leiderschap"), zodat je de resultaten per thema kunt bekijken.'),
        ro ? null : h('p', {}, h('a', { href: `${basis}/opzet`, class: 'knop knop-klein' }, "Thema's maken bij Opzet")),
      ], 'waarschuwing'));
    } else if (!vragen.length) {
      inhoud.push(leeg(
        ro ? 'Deze vragenlijst heeft geen vragen.' : 'Deze vragenlijst heeft nog geen vragen. Voeg je eerste vraag toe.',
        ro ? null : h('button', { type: 'button', class: 'knop knop-primair', onclick: () => nieuweVraag() }, 'Eerste vraag toevoegen'),
      ));
    } else {
      let nr = 0;
      inhoud.push(...groepen.map((g) => h('section', { class: 'vl-thema', 'aria-labelledby': `vl-thema-${g.thema.id}` },
        h('h4', { class: 'vl-thema-kop', id: `vl-thema-${g.thema.id}` },
          h('span', {}, g.thema.naam),
          h('span', { class: 'vl-thema-aantal' }, aantal(g.items.length, 'vraag', 'vragen'))),
        h('ol', { class: 'vl-vragen' }, g.items.map((q, i) => vraagItem(q, ++nr, g, i))),
        ro || vol ? null : h('button', {
          type: 'button',
          class: 'knop knop-klein knop-licht vl-thema-toevoegen',
          'aria-label': `Vraag toevoegen aan thema "${g.thema.naam}"`,
          onclick: () => nieuweVraag({ thema_id: g.thema.id }),
        }, '+ Vraag toevoegen aan dit thema'),
      )));
      const zonder = themas.filter((t) => !groepen.some((g) => g.thema.id === t.id));
      if (zonder.length && !ro && !vol) {
        inhoud.push(h('div', { class: 'vl-andere-themas' },
          h('p', { class: 'klein zacht' }, "Thema's zonder vragen in deze vragenlijst:"),
          h('div', { class: 'knoppen' }, zonder.map((t) => h('button', {
            type: 'button',
            class: 'knop knop-klein',
            'aria-label': `Vraag toevoegen aan thema "${t.naam}"`,
            onclick: () => nieuweVraag({ thema_id: t.id }),
          }, `+ ${t.naam}`))),
        ));
      }
    }

    vervang(vragenKaart,
      sectieKop('vl-kop-vragen', 'Vragen', onderkop, toevoegKnop ? h('div', { class: 'knoppen' }, kenmerkKnop, toevoegKnop) : null),
      inhoud,
    );
  }

  // ---------- Vraagdialoog ----------

  function vraagDialoog(vraag = null, voorkeur = {}) {
    return new Promise((klaar) => {
      const p = `vq${++dialoogTeller}-`;
      const bewerken = !!vraag;
      const vergrendeld = bewerken && inzendingen > 0;
      const startThema = vraag?.thema_id ?? voorkeur.thema_id ?? laatsteThema ?? themas[0]?.id;
      const startType = vraag?.type ?? voorkeur.type ?? 'schaal';
      let resultaat = null;
      let nogEen = false;

      const foutEl = h('div', { class: 'veld-fout', role: 'alert' });

      // Thema en meetpunt
      const themaKeuze = h('select', { id: `${p}thema`, required: true },
        themas.map((t) => h('option', { value: String(t.id), selected: t.id === startThema }, t.naam)));
      const mpKeuze = h('select', { id: `${p}mp`, 'aria-describedby': `${p}mp-hulp` });
      const mpHulp = h('div', { class: 'veld-hulp', id: `${p}mp-hulp` });
      function vulMeetpunten(behoud) {
        const t = themas.find((x) => String(x.id) === themaKeuze.value);
        const mps = (t && t.meetpunten) || [];
        vervang(mpKeuze,
          h('option', { value: '' }, mps.length ? 'Geen meetpunt' : 'Geen meetpunten bij dit thema'),
          mps.map((m) => h('option', { value: String(m.id), selected: String(m.id) === String(behoud ?? '') }, m.naam)));
        mpKeuze.disabled = !mps.length;
        mpHulp.textContent = mps.length
          ? 'Optioneel. Koppel de vraag aan een meetpunt als de antwoorden iets over dat meetpunt zeggen; dan zie je ze daar terug op het dashboard.'
          : 'Dit thema heeft geen meetpunten. Die kun je toevoegen bij Opzet.';
      }
      vulMeetpunten(vraag?.meetpunt_id);
      themaKeuze.addEventListener('change', () => vulMeetpunten(mpKeuze.value));

      // Vraagtype
      const typeRadios = {};
      const typeKeuzes = Object.entries(inst.vraagtypen).map(([waarde, label]) => {
        const r = h('input', {
          type: 'radio',
          name: `${p}type`,
          value: waarde,
          id: `${p}type-${waarde}`,
          checked: waarde === startType,
          disabled: vergrendeld && waarde !== startType,
          'aria-describedby': `${p}type-${waarde}-uitleg`,
        });
        r.addEventListener('change', werkTypeBij);
        typeRadios[waarde] = r;
        return h('label', { class: 'vl-typekeuze', for: r.id },
          r,
          h('span', { class: 'vl-typekeuze-tekst' },
            h('span', { class: 'vl-typekeuze-naam' }, label),
            h('span', { class: 'vl-typekeuze-uitleg', id: `${p}type-${waarde}-uitleg` }, TYPE_UITLEG[waarde] || '')),
        );
      });
      const gekozenType = () => Object.keys(typeRadios).find((k) => typeRadios[k].checked) || 'schaal';

      // Tekst en toelichting
      const tekstVeld = h('textarea', { id: `${p}tekst`, rows: 3, maxlength: 1000, required: true }, vraag?.tekst || '');
      const toelVeld = h('textarea', {
        id: `${p}toel`, rows: 2, maxlength: 1000, 'aria-describedby': `${p}toel-hulp`,
      }, vraag?.toelichting || '');

      // Schaal
      const schaalKeuze = h('select', { id: `${p}schaal`, 'aria-describedby': `${p}schaal-vb` },
        Object.keys(inst.schalen).map((k) => h('option', {
          value: k,
          selected: k === (vraag?.type === 'schaal' ? vraag.schaal_soort : 'eens'),
        }, inst.schaal_namen[k] || k)));
      const schaalVoorbeeld = h('ol', { class: 'vl-schaal-vb', id: `${p}schaal-vb`, 'aria-label': 'De vijf antwoorden op deze schaal' });
      function tekenSchaal() {
        vervang(schaalVoorbeeld, (inst.schalen[schaalKeuze.value] || []).map((l, i) =>
          h('li', {}, h('span', { class: 'vl-schaal-nr' }, String(i + 1)), h('span', { class: 'vl-schaal-label' }, l))));
      }
      tekenSchaal();
      schaalKeuze.addEventListener('change', tekenSchaal);
      const weetNiet = h('input', { type: 'checkbox', id: `${p}wn`, checked: !!vraag?.weet_niet, 'aria-describedby': `${p}wn-hulp` });

      const schaalBlok = h('div', { class: 'vl-typeblok' },
        h('div', { class: 'veld' },
          h('label', { for: schaalKeuze.id }, 'Soort schaal'),
          schaalKeuze,
          schaalVoorbeeld),
        h('div', { class: 'veld' },
          h('label', { class: 'keuze', for: weetNiet.id }, weetNiet, h('span', {}, 'Antwoord "weet niet / n.v.t." toestaan')),
          h('div', { class: 'veld-hulp', id: `${p}wn-hulp` }, 'Voor respondenten die de vraag niet kunnen beantwoorden. Dit antwoord telt niet mee in het gemiddelde.')),
      );

      // Cijfer: 0 tot 10 (aanbevelen) of 1 tot 10 (rapportcijfer)
      const cijferschalen = inst.cijferschalen || {};
      const cijferVast = vergrendeld && vraag?.type === 'cijfer';
      const cijferKeuze = h('select', { id: `${p}cijfer`, disabled: cijferVast, 'aria-describedby': `${p}cijfer-vb ${p}cijfer-hulp` },
        Object.entries(cijferschalen).map(([k, c]) => h('option', {
          value: k,
          selected: k === (vraag?.type === 'cijfer' ? vraag.schaal_soort : 'rapport'),
        }, c.naam || k)));
      const cijferVoorbeeld = h('div', { id: `${p}cijfer-vb` });
      function tekenCijfer() {
        const c = cijferschalen[cijferKeuze.value];
        if (!c) {
          vervang(cijferVoorbeeld);
          return;
        }
        const waarden = [];
        for (let w = c.min; w <= c.max; w++) waarden.push(w);
        vervang(cijferVoorbeeld,
          h('ol', { class: `vl-cijfer-vb vl-cijfer-vb-${waarden.length}`, 'aria-label': `De cijfers van ${c.min} tot ${c.max}` },
            waarden.map((w) => h('li', {}, String(w)))),
          h('p', { class: 'vl-cijfer-vb-eind' }, h('span', {}, `${c.min} = ${c.laag}`), h('span', {}, `${c.max} = ${c.hoog}`)));
      }
      tekenCijfer();
      cijferKeuze.addEventListener('change', tekenCijfer);
      const weetNietCijfer = h('input', { type: 'checkbox', id: `${p}cwn`, checked: vraag?.type === 'cijfer' && !!vraag.weet_niet, 'aria-describedby': `${p}cwn-hulp` });
      const cijferBlok = h('div', { class: 'vl-typeblok' },
        h('div', { class: 'veld' },
          h('label', { for: cijferKeuze.id }, 'Soort cijfer'),
          cijferKeuze,
          cijferVoorbeeld,
          h('div', { class: 'veld-hulp', id: `${p}cijfer-hulp` }, cijferVast
            ? 'Deze vragenlijst heeft al antwoorden. De cijferschaal kan daarom niet meer veranderen.'
            : 'Bij 0 tot 10 zie je op het dashboard ook de eNPS: het percentage promotors (9 en 10) min het percentage criticasters (0 tot en met 6). Een cijfervraag telt nooit mee in de themascores.')),
        h('div', { class: 'veld' },
          h('label', { class: 'keuze', for: weetNietCijfer.id }, weetNietCijfer, h('span', {}, 'Antwoord "weet niet / n.v.t." toestaan')),
          h('div', { class: 'veld-hulp', id: `${p}cwn-hulp` }, 'Bijvoorbeeld bij een rapportcijfer voor iets waar niet iedereen mee te maken heeft. Dit antwoord telt niet mee in het gemiddelde.')),
      );

      // Meerkeuze: antwoordmogelijkheden (bestaande id's blijven behouden)
      let rijen = vraag?.type === 'meerkeuze' ? vraag.opties.map((o) => ({ id: o.id, label: o.label })) : [];
      while (rijen.length < 2) rijen.push({ label: '' });
      const optieLijst = h('ol', { class: 'vl-opties-editor' });
      const voegOptieToe = h('button', {
        type: 'button',
        class: 'knop knop-klein',
        onclick: () => {
          if (rijen.length >= MAX_OPTIES) return;
          rijen.push({ label: '' });
          tekenOpties(`${p}optie-${rijen.length - 1}`);
        },
      }, '+ Antwoordmogelijkheid');

      function tekenOpties(focusId = null) {
        vervang(optieLijst, rijen.map((r, i) => {
          const invoer = h('input', {
            type: 'text',
            id: `${p}optie-${i}`,
            maxlength: 200,
            autocomplete: 'off',
            value: r.label,
            'aria-label': `Antwoordmogelijkheid ${i + 1}`,
          });
          invoer.addEventListener('input', () => {
            r.label = invoer.value;
          });
          invoer.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (rijen.length >= MAX_OPTIES) return;
            rijen.splice(i + 1, 0, { label: '' });
            tekenOpties(`${p}optie-${i + 1}`);
          });
          const knop = (teken, label, uit, sleutel, fn) => h('button', {
            type: 'button',
            class: 'knop knop-klein knop-icoon',
            id: `${p}optie-${i}-${sleutel}`,
            'aria-label': label,
            title: label,
            disabled: uit,
            onclick: fn,
          }, h('span', { 'aria-hidden': 'true' }, teken));
          const wissel = (j, sleutel) => {
            [rijen[i], rijen[j]] = [rijen[j], rijen[i]];
            const naar = j === 0 || j === rijen.length - 1 ? `${p}optie-${j}` : `${p}optie-${j}-${sleutel}`;
            tekenOpties(naar);
          };
          return h('li', { class: 'vl-optie' },
            h('span', { class: 'vl-optie-nr', 'aria-hidden': 'true' }, `${i + 1}.`),
            invoer,
            h('span', { class: 'vl-optie-knoppen' },
              knop('↑', `Antwoordmogelijkheid ${i + 1} omhoog`, i === 0, 'op', () => wissel(i - 1, 'op')),
              knop('↓', `Antwoordmogelijkheid ${i + 1} omlaag`, i === rijen.length - 1, 'neer', () => wissel(i + 1, 'neer')),
              knop('✕', `Antwoordmogelijkheid ${i + 1} verwijderen`, rijen.length <= 2, 'weg', () => {
                rijen.splice(i, 1);
                tekenOpties(`${p}optie-${Math.min(i, rijen.length - 1)}`);
              }),
            ),
          );
        }));
        voegOptieToe.disabled = rijen.length >= MAX_OPTIES;
        if (focusId) {
          const el = optieLijst.querySelector(`#${focusId}`) || optieLijst.querySelector(`#${p}optie-0`);
          if (el) el.focus();
        }
      }
      tekenOpties();

      const meerdere = h('input', {
        type: 'checkbox',
        id: `${p}meer`,
        checked: !!vraag?.meerdere_antwoorden,
        disabled: vergrendeld,
        'aria-describedby': `${p}meer-hulp`,
      });
      meerdere.addEventListener('change', werkTypeBij);

      const meerkeuzeBlok = h('div', { class: 'vl-typeblok' },
        h('fieldset', { class: 'vl-opties-veld' },
          h('legend', {}, 'Antwoordmogelijkheden', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
          h('p', { class: 'veld-hulp vl-opties-uitleg' }, `Minimaal 2, maximaal ${MAX_OPTIES}. Tip: druk op Enter om direct een volgende toe te voegen.`),
          vergrendeld
            ? h('p', { class: 'veld-hulp vl-tekst-waarschuwing' }, 'Er zijn al antwoorden. Pas de tekst van een antwoordmogelijkheid alleen aan als de betekenis gelijk blijft. Verwijder je er een, dan tellen de antwoorden daarop niet meer mee.')
            : null,
          optieLijst,
          voegOptieToe,
        ),
        h('div', { class: 'veld' },
          h('label', { class: 'keuze', for: meerdere.id }, meerdere, h('span', {}, 'Meerdere antwoorden mogelijk')),
          h('div', { class: 'veld-hulp', id: `${p}meer-hulp` }, vergrendeld
            ? 'Deze vragenlijst is al ingevuld. Daarom kun je niet meer wisselen tussen één of meerdere antwoorden.'
            : 'Respondenten mogen dan meer dan één antwoord aankruisen.')),
      );

      const openBlok = h('div', { class: 'vl-typeblok' },
        h('p', { class: 'veld-hulp vl-open-uitleg' }, 'Respondenten typen zelf een antwoord. Let op: in open antwoorden kunnen mensen dingen schrijven waardoor ze herkenbaar zijn. Lees de antwoorden daarom zorgvuldig voordat je ze deelt.'),
      );

      // Uitsplitsing (alleen meerkeuze met één antwoord en ja/nee)
      const uitsplitsen = h('input', { type: 'checkbox', id: `${p}uit`, checked: !!vraag?.uitsplitsen, 'aria-describedby': `${p}uit-hulp` });
      const uitsplitsBlok = h('div', { class: 'veld' },
        h('label', { class: 'keuze', for: uitsplitsen.id }, uitsplitsen,
          h('span', {}, 'Gebruiken om resultaten per groep te bekijken (uitsplitsing)')),
        h('div', { class: 'veld-hulp', id: `${p}uit-hulp` },
          `Bijvoorbeeld per afdeling of leeftijdsgroep. Groepen met minder dan ${drempel} respondenten worden nooit getoond, zodat niemand herkenbaar is.`),
      );

      // Achtergrondkenmerk (alleen meerkeuze met één antwoord en ja/nee); per vragenlijst één keer, behalve "Ander kenmerk".
      const elders = new Set(vragen.filter((q) => q.id !== vraag?.id && q.kenmerk).map((q) => q.kenmerk));
      const kenmerkKeuze = h('select', { id: `${p}kenmerk`, 'aria-describedby': `${p}kenmerk-hulp ${p}kenmerk-weg` },
        h('option', { value: '' }, 'Geen (gewone vraag)'),
        Object.entries(KENMERKEN).map(([k, km]) => {
          const bezet = !km.meerdere && elders.has(k);
          return h('option', { value: k, selected: k === (vraag?.kenmerk || ''), disabled: bezet }, bezet ? `${km.naam} (staat er al in)` : km.naam);
        }));
      // Had de vraag een kenmerk en gaat dat weg terwijl uitsplitsing uit staat, dan zegt de editor wat dat betekent.
      const kenmerkWeg = h('p', { class: 'veld-hulp vl-tekst-waarschuwing verborgen', id: `${p}kenmerk-weg`, 'aria-live': 'polite' });
      const werkKenmerkWegBij = () => {
        const weg = !!vraag?.kenmerk && !kenmerkKeuze.value && !uitsplitsen.checked;
        kenmerkWeg.textContent = weg ? KENMERK_WEG : '';
        kenmerkWeg.classList.toggle('verborgen', !weg);
      };
      kenmerkKeuze.addEventListener('change', () => {
        // Een achtergrondkenmerk wil je meestal ook gebruiken om groepen te vergelijken (je kunt het weer uitzetten).
        if (kenmerkKeuze.value) uitsplitsen.checked = true;
        werkKenmerkWegBij();
      });
      uitsplitsen.addEventListener('change', werkKenmerkWegBij);
      const kenmerkBlok = h('div', { class: 'veld vl-kenmerk-blok' },
        h('label', { for: kenmerkKeuze.id }, 'Achtergrondkenmerk'),
        kenmerkKeuze,
        h('div', { class: 'veld-hulp', id: `${p}kenmerk-hulp` }, KENMERK_HULP),
        kenmerkWeg);

      const verplicht = h('input', { type: 'checkbox', id: `${p}verplicht`, checked: !!vraag?.verplicht, 'aria-describedby': `${p}verplicht-hulp` });
      const verplichtBlok = h('div', { class: 'veld' },
        h('label', { class: 'keuze', for: verplicht.id }, verplicht, h('span', {}, 'Verplicht')),
        h('div', { class: 'veld-hulp', id: `${p}verplicht-hulp` }, 'Respondenten kunnen de vragenlijst pas versturen als ze deze vraag hebben beantwoord. Gebruik dit spaarzaam.'),
      );

      function uitsplitsMogelijk() {
        const t = gekozenType();
        return (t === 'meerkeuze' && !meerdere.checked) || t === 'janee';
      }

      function werkTypeBij() {
        const t = gekozenType();
        schaalBlok.classList.toggle('verborgen', t !== 'schaal');
        cijferBlok.classList.toggle('verborgen', t !== 'cijfer');
        meerkeuzeBlok.classList.toggle('verborgen', t !== 'meerkeuze');
        openBlok.classList.toggle('verborgen', t !== 'open');
        uitsplitsBlok.classList.toggle('verborgen', !uitsplitsMogelijk());
        kenmerkBlok.classList.toggle('verborgen', !uitsplitsMogelijk());
      }

      // Opslaan
      const titel = bewerken ? 'Vraag wijzigen' : 'Vraag toevoegen';
      const okKnop = h('button', { type: 'submit', class: 'knop knop-primair' }, bewerken ? 'Opslaan' : 'Toevoegen');
      const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
      const nogEenKnop = bewerken ? null : h('button', { type: 'button', class: 'knop vl-nog-een' }, 'Toevoegen en nog een');

      function toonFout(tekst, el = null) {
        foutEl.textContent = tekst;
        if (el) {
          el.setAttribute('aria-invalid', 'true');
          el.focus();
        }
      }

      async function verstuur() {
        foutEl.textContent = '';
        for (const el of d.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
        const type = gekozenType();
        const tekst = tekstVeld.value.trim();
        if (!themaKeuze.value) return toonFout('Kies een thema.', themaKeuze);
        if (!tekst) return toonFout('Vul de vraag in.', tekstVeld);
        let opties = [];
        if (type === 'meerkeuze') {
          const gevuld = rijen.map((r) => ({ ...r, label: r.label.trim() })).filter((r) => r.label);
          if (gevuld.length < 2) {
            const leegVeld = [...optieLijst.querySelectorAll('input')].find((x) => !x.value.trim());
            return toonFout('Geef minimaal twee antwoordmogelijkheden op.', leegVeld || null);
          }
          const gezien = new Set();
          for (const r of gevuld) {
            const s = r.label.toLowerCase();
            if (gezien.has(s)) return toonFout(`De antwoordmogelijkheid "${r.label}" staat er dubbel in.`);
            gezien.add(s);
          }
          opties = gevuld.map((r) => (r.id ? { id: r.id, label: r.label } : { label: r.label }));
        }
        const body = {
          thema_id: Number(themaKeuze.value),
          meetpunt_id: mpKeuze.value ? Number(mpKeuze.value) : null,
          type,
          tekst,
          toelichting: toelVeld.value.trim(),
          opties,
          schaal_soort: type === 'schaal' ? schaalKeuze.value : type === 'cijfer' ? cijferKeuze.value : 'eens',
          meerdere_antwoorden: type === 'meerkeuze' && meerdere.checked,
          verplicht: verplicht.checked,
          weet_niet: (type === 'schaal' && weetNiet.checked) || (type === 'cijfer' && weetNietCijfer.checked),
          uitsplitsen: uitsplitsMogelijk() && uitsplitsen.checked,
          kenmerk: uitsplitsMogelijk() ? kenmerkKeuze.value : '',
        };
        const knoppen = [okKnop, nogEenKnop].filter(Boolean);
        knoppen.forEach((k) => { k.disabled = true; });
        let id = vraag?.id;
        try {
          if (bewerken) await api.put(`/vragen/${vraag.id}`, body);
          else id = (await api.post(`/vragenlijsten/${vlId}/vragen`, body)).id;
        } catch (err) {
          toonFout(err.message || 'Opslaan is mislukt.');
          knoppen.forEach((k) => { k.disabled = false; });
          return undefined;
        }
        resultaat = { id, nogEen, thema_id: body.thema_id, type };
        d.close();
        return undefined;
      }

      const d = h('dialog', { class: 'dialoog vl-dialoog vl-vraagdialoog', 'aria-labelledby': `${p}titel` },
        h('form', {
          method: 'dialog',
          novalidate: true,
          onsubmit: (e) => {
            e.preventDefault();
            nogEen = false;
            verstuur();
          },
        },
        h('div', { class: 'dialoog-inhoud' },
          h('h2', { id: `${p}titel` }, titel),
          vergrendeld
            ? melding('Deze vragenlijst is al ingevuld. Het vraagtype en de keuze tussen één of meerdere antwoorden kun je daarom niet meer veranderen. Pas de vraag alleen aan als de betekenis gelijk blijft, anders zijn de antwoorden niet meer goed te vergelijken.', 'waarschuwing')
            : null,
          h('div', { class: 'formulier-rij' },
            h('div', { class: 'veld' },
              h('label', { for: themaKeuze.id }, 'Thema', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
              themaKeuze),
            h('div', { class: 'veld' },
              h('label', { for: mpKeuze.id }, 'Meetpunt'),
              mpKeuze,
              mpHulp),
          ),
          h('fieldset', {},
            h('legend', {}, 'Vraagtype', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
            h('div', { class: 'vl-typekeuzes' }, typeKeuzes),
            vergrendeld ? h('p', { class: 'veld-hulp' }, 'Het vraagtype ligt vast omdat er al antwoorden zijn. Wil je een ander type? Voeg dan een nieuwe vraag toe.') : null,
          ),
          h('div', { class: 'veld' },
            h('label', { for: tekstVeld.id }, 'Vraag', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
            tekstVeld),
          h('div', { class: 'veld' },
            h('label', { for: toelVeld.id }, 'Toelichting voor respondent'),
            toelVeld,
            h('div', { class: 'veld-hulp', id: `${p}toel-hulp` }, 'Optioneel. Bijvoorbeeld uitleg van een begrip. Staat klein onder de vraag.')),
          schaalBlok,
          cijferBlok,
          meerkeuzeBlok,
          openBlok,
          kenmerkBlok,
          uitsplitsBlok,
          verplichtBlok,
          foutEl,
        ),
        h('div', { class: 'dialoog-voet' }, annuleer, nogEenKnop, okKnop),
        ),
      );
      werkTypeBij();

      // Escape, terug-gebaar of Annuleren: niet zomaar sluiten als er iets is ingevuld of gewijzigd.
      const momentopname = () => [...d.querySelectorAll('input, select, textarea')]
        .map((el) => (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)).join('\u0001');
      let begin = null;
      const sluitNaVragen = async () => {
        if (momentopname() === begin || (await bevestig({
          titel: 'Wijzigingen weggooien?',
          tekst: 'Wat je in deze vraag hebt ingevuld, wordt niet opgeslagen.',
          knop: 'Weggooien',
          gevaar: true,
        }))) d.close();
      };
      d.addEventListener('cancel', (e) => {
        e.preventDefault();
        sluitNaVragen();
      });
      annuleer.addEventListener('click', () => sluitNaVragen());
      if (nogEenKnop) {
        nogEenKnop.addEventListener('click', () => {
          nogEen = true;
          verstuur();
        });
      }
      d.addEventListener('close', () => {
        openDialoog = null;
        setTimeout(() => d.remove(), 0);
        klaar(resultaat);
      });
      document.body.append(d);
      openDialoog = d;
      d.showModal();
      begin = momentopname();
      (voorkeur.thema_id || bewerken ? tekstVeld : themaKeuze).focus();
    });
  }

  // ---------- 4. Voorbeeld ----------

  function voorbeeldVraag(q, nr) {
    const naam = `vb-${q.id}`;
    const uid = `vb-${dialoogTeller}-${q.id}`;
    let antwoord = null;
    if (q.type === 'schaal') {
      const labels = inst.schalen[q.schaal_soort] || inst.schalen.eens;
      antwoord = h('div', { class: 'vl-vb-schaal' },
        labels.map((l, i) => h('label', { class: 'vl-vb-schaalknop' },
          h('input', { type: 'radio', name: naam, value: String(i + 1) }),
          h('span', { class: 'vl-vb-schaalnr' }, String(i + 1)),
          h('span', { class: 'vl-vb-schaaltekst' }, l))),
        q.weet_niet ? h('label', { class: 'vl-vb-schaalknop vl-vb-weetniet' },
          h('input', { type: 'radio', name: naam, value: 'weet_niet' }),
          h('span', { class: 'vl-vb-schaaltekst' }, 'Weet niet / n.v.t.')) : null,
      );
    } else if (q.type === 'cijfer') {
      const c = (inst.cijferschalen || {})[q.schaal_soort] || { min: 1, max: 10, laag: '', hoog: '' };
      const waarden = [];
      for (let w = c.min; w <= c.max; w++) waarden.push(w);
      antwoord = [
        h('div', { class: `vl-vb-cijfer vl-vb-cijfer-${waarden.length}` },
          waarden.map((w) => h('label', { class: 'vl-vb-schaalknop' },
            h('input', { type: 'radio', name: naam, value: String(w) }),
            h('span', { class: 'vl-vb-schaalnr' }, String(w)))),
          q.weet_niet ? h('label', { class: 'vl-vb-schaalknop vl-vb-weetniet' },
            h('input', { type: 'radio', name: naam, value: 'weet_niet' }),
            h('span', { class: 'vl-vb-schaaltekst' }, 'Weet niet / n.v.t.')) : null),
        h('p', { class: 'vl-cijfer-vb-eind' }, h('span', {}, `${c.min} = ${c.laag}`), h('span', {}, `${c.max} = ${c.hoog}`)),
      ];
    } else if (q.type === 'meerkeuze') {
      antwoord = h('div', { class: 'vl-vb-keuzes' },
        q.meerdere_antwoorden ? h('p', { class: 'klein zacht' }, 'Je kunt meerdere antwoorden kiezen.') : null,
        q.opties.map((o) => h('label', { class: 'keuze' },
          h('input', { type: q.meerdere_antwoorden ? 'checkbox' : 'radio', name: naam, value: o.id }),
          h('span', {}, o.label))));
    } else if (q.type === 'janee') {
      antwoord = h('div', { class: 'vl-vb-keuzes vl-vb-janee' },
        h('label', { class: 'keuze' }, h('input', { type: 'radio', name: naam, value: 'ja' }), h('span', {}, 'Ja')),
        h('label', { class: 'keuze' }, h('input', { type: 'radio', name: naam, value: 'nee' }), h('span', {}, 'Nee')));
    } else {
      antwoord = h('textarea', { rows: 3, 'aria-labelledby': `${uid}-tekst`, maxlength: 5000 });
    }
    return h('fieldset', { class: 'vl-vb-vraag' },
      h('legend', { id: `${uid}-tekst` },
        h('span', { class: 'vl-vb-nr' }, `${nr}.`), ' ', q.tekst,
        q.verplicht ? h('span', { class: 'verplicht-teken' }, ' *', h('span', { class: 'sr-only' }, ' (verplicht)')) : null),
      q.toelichting ? h('p', { class: 'vl-vb-toelichting' }, q.toelichting) : null,
      antwoord,
    );
  }

  function toonVoorbeeld() {
    dialoogTeller += 1;
    const w = !ro && instBasis ? instWaarden() : { titel: vl.titel, introtekst: vl.introtekst, bedanktekst: vl.bedanktekst };
    const gewijzigd = instellingenGewijzigd();
    const groepen = groepeer();
    let nr = 0;
    const heeftVerplicht = vragen.some((q) => q.verplicht);

    const sluit = h('button', { type: 'button', class: 'knop knop-primair' }, 'Sluiten');
    const titelId = `vb-titel-${dialoogTeller}`;
    const d = h('dialog', { class: 'dialoog vl-dialoog vl-voorbeelddialoog', 'aria-labelledby': titelId },
      h('form', { method: 'dialog', onsubmit: (e) => e.preventDefault() },
        h('div', { class: 'dialoog-inhoud' },
          h('h2', { id: titelId }, 'Voorbeeld voor respondenten'),
          melding([
            'Zo ziet de vragenlijst er ongeveer uit voor respondenten. Je kunt antwoorden aanklikken om het uit te proberen; er wordt niets opgeslagen.',
            gewijzigd ? ' Je ziet hier ook je wijzigingen in de instellingen die nog niet zijn opgeslagen.' : '',
          ]),
          h('div', { class: 'vl-vb-pagina' },
            h('h3', { class: 'vl-vb-titel' }, w.titel || vl.titel),
            w.introtekst ? h('p', { class: 'vl-vb-intro' }, w.introtekst) : null,
            heeftVerplicht ? h('p', { class: 'klein zacht' }, 'Vragen met een * zijn verplicht.') : null,
            vragen.length
              ? groepen.map((g) => h('section', { class: 'vl-vb-thema' },
                h('h4', { class: 'vl-vb-themanaam' }, g.thema.naam),
                g.items.map((q) => voorbeeldVraag(q, ++nr))))
              : h('p', { class: 'zacht' }, 'Er staan nog geen vragen in deze vragenlijst.'),
            h('div', { class: 'vl-vb-verstuur' },
              h('button', { type: 'button', class: 'knop knop-primair', disabled: true }, 'Versturen'),
              h('span', { class: 'klein zacht' }, 'Versturen kan niet in het voorbeeld.')),
            h('div', { class: 'vl-vb-bedankt' },
              h('p', { class: 'vl-vb-bedankt-kop' }, 'Na het versturen zien respondenten:'),
              h('p', { class: 'vl-vb-intro' }, w.bedanktekst || 'Bedankt voor het invullen.')),
          ),
        ),
        h('div', { class: 'dialoog-voet' }, sluit),
      ),
    );
    sluit.addEventListener('click', () => d.close());
    d.addEventListener('close', () => {
      openDialoog = null;
      setTimeout(() => d.remove(), 0);
    });
    document.body.append(d);
    openDialoog = d;
    d.showModal();
    sluit.focus();
    d.querySelector('.dialoog-inhoud').scrollTop = 0;
  }

  function tekenVoorbeeldKaart() {
    vervang(voorbeeldKaart,
      sectieKop('vl-kop-voorbeeld', 'Voorbeeld'),
      h('p', { class: 'vl-uitleg' }, 'Bekijk hoe respondenten de vragenlijst zien: de uitleg, de vragen per thema en de antwoordmogelijkheden. Handig om alles na te lopen zolang de vragenlijst nog gesloten is.'),
      h('button', { type: 'button', class: 'knop', onclick: toonVoorbeeld }, 'Voorbeeld bekijken'),
    );
  }

  // ---------- Vertrek: niet-opgeslagen instellingen bewaren ----------

  function bijSluitenTabblad(e) {
    if (!instellingenGewijzigd()) return;
    e.preventDefault();
    e.returnValue = '';
  }
  window.addEventListener('beforeunload', bijSluitenTabblad);
  ctx.bijVertrek(async () => {
    window.removeEventListener('beforeunload', bijSluitenTabblad);
    if (openDialoog && openDialoog.open) openDialoog.close();
    if (instellingenGewijzigd()) await slaInstellingenOp({ stil: true });
  });

  // ---------- Alles tekenen ----------

  const snelNaar = h('nav', { class: 'vl-snelnaar', 'aria-label': 'Onderdelen van deze vragenlijst' },
    h('span', { class: 'vl-snelnaar-label' }, 'Ga naar:'),
    [['vl-kop-delen', 'Delen en status'], ['vl-kop-inst', 'Instellingen'], ['vl-kop-vragen', 'Vragen'], ['vl-kop-voorbeeld', 'Voorbeeld']]
      .map(([id, label]) => h('button', { type: 'button', class: 'knop knop-klein knop-licht', onclick: () => naarSectie(id) }, label)),
  );

  tekenKop();
  tekenBanner();
  tekenDelen();
  tekenInstellingen();
  tekenVragen();
  tekenVoorbeeldKaart();

  vervang(container,
    h('div', { class: 'vl-scherm vl-bewerken' },
      kruimel,
      kopEl,
      snelNaar,
      bannerEl,
      delenKaart,
      instKaart,
      vragenKaart,
      voorbeeldKaart,
      aankondiging,
    ),
  );
}

/** Wat er bij "Antwoorden wissen" ook verdwijnt: de codes die je aan de antwoorden gaf en de citaten eruit (R10). */
export function codeerwerkTekst({ coderingen = 0, citaten = 0 } = {}) {
  if (!coderingen && !citaten) return null;
  const delen = [
    coderingen ? `${coderingen === 1 ? 'de code' : `de ${aantal(coderingen, 'code', 'codes')}`} die je aan deze antwoorden gaf` : null,
    citaten ? `${citaten === 1 ? 'het citaat' : `de ${aantal(citaten, 'citaat', 'citaten')}`} eruit` : null,
  ].filter(Boolean);
  return `Ook ${delen.join(' en ')} ${coderingen + citaten === 1 ? 'wordt' : 'worden'} gewist. Het codeboek zelf blijft staan.`;
}

/** De melding na het wissen: hoeveel codes en citaten meegingen. */
export function codeerwerkGewist({ coderingen = 0, citaten = 0 } = {}) {
  const delen = [coderingen ? aantal(coderingen, 'gegeven code', 'gegeven codes') : null, citaten ? aantal(citaten, 'citaat', 'citaten') : null].filter(Boolean);
  return delen.length ? `Ook ${delen.join(' en ')} ${coderingen + citaten === 1 ? 'is' : 'zijn'} gewist.` : '';
}
