// Scherm: Delen – mensen uitnodigen.
// 1. Uitnodigen om een vragenlijst in te vullen: link, tekst voor uitnodiging en herinnering,
//    openen in je eigen e-mailprogramma (bijvoorbeeld Outlook) en een QR-code.
//    De onderzoeksomgeving verstuurt zelf geen e-mail en bewaart geen e-mailadressen.
// 2. Laten meekijken: een deellink met toegangscode waarmee iemand de resultaten alleen kan lezen.

import { api } from '../api.js';
import {
  h, vervang, leeg, laden, melding, meld, meldFout, bevestig, formulierDialoog, maakDialoog,
  datum, lokaleDatum, aantal, kopieer, statusLabel, vragenlijstLink, vertraag, uniekeId,
} from '../ui.js';
import { maakQr, qrAlsSvg, tekenQr } from '../qr.js';
import { bewaar, slug } from '../export.js';

const MAX_MAILTO = 1800; // langere teksten passen niet betrouwbaar in een e-maillink

// ---------- Teksten ----------

export function standaardUitnodiging() {
  return {
    onderwerp: 'Uitnodiging: {titel}',
    tekst: [
      'Beste collega,',
      '',
      'Graag nodig ik je uit voor de vragenlijst "{titel}" van {bedrijf}. Jouw mening helpt om te zien wat goed gaat en wat beter kan.',
      '',
      'Invullen duurt een paar minuten en kan op je laptop of telefoon:',
      '{link}',
      '',
      'De vragenlijst is anoniem. Er wordt geen naam, e-mailadres of IP-adres opgeslagen, en resultaten worden alleen getoond voor groepen van minstens 5 personen.',
      '',
      'Alvast bedankt voor je medewerking!',
      '',
      'Met vriendelijke groet,',
      '',
    ].join('\n'),
    herinnering_onderwerp: 'Herinnering: {titel}',
    herinnering_tekst: [
      'Beste collega,',
      '',
      'Onlangs heb je een uitnodiging gekregen voor de vragenlijst "{titel}". Heb je hem al ingevuld? Dan hartelijk dank en hoef je niets meer te doen.',
      '',
      'Omdat de vragenlijst anoniem is, weten we niet wie hem al heeft ingevuld. Daarom krijgt iedereen deze herinnering.',
      '',
      'Nog niet ingevuld? Het kan nog via deze link:',
      '{link}',
      '',
      'Met vriendelijke groet,',
      '',
    ].join('\n'),
  };
}

/** Vervangt {link}, {titel} en {bedrijf} in een tekst. */
export function vulIn(tekst, waarden) {
  return String(tekst || '').replace(/\{(link|titel|bedrijf)\}/g, (_, naam) => waarden[naam] ?? '');
}

export function mailLink(onderwerp, tekst) {
  return `mailto:?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(tekst.replace(/\r?\n/g, '\r\n'))}`;
}

function openMail(onderwerp, tekst) {
  const a = h('a', { href: mailLink(onderwerp, tekst) });
  document.body.append(a);
  a.click();
  a.remove();
}

function deelLink(code) {
  return `${location.origin}/d/${code}`;
}

function plusDagen(dagen) {
  const d = new Date(Date.now() + dagen * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Veld met een link om te kopiëren. */
function linkVeld(link, label) {
  const id = uniekeId('dl-link');
  const veld = h('input', { type: 'text', id, class: 'dl-linkveld', readonly: true, value: link, onfocus: (e) => e.target.select() });
  return h('div', { class: 'dl-linkrij' },
    h('label', { class: 'sr-only', for: id }, label),
    veld,
    h('button', {
      type: 'button',
      class: 'knop knop-klein',
      onclick: async () => {
        if (await kopieer(link)) meld('Link gekopieerd.', 'succes');
        else {
          veld.focus();
          meld('Kopiëren lukte niet. Selecteer de link en kopieer hem zelf.', 'waarschuwing');
        }
      },
    }, 'Kopieer link'));
}

// ---------- Het scherm ----------

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const o = ctx.onderzoek.onderzoek;
  ctx.zetTitel(`Delen – ${o.titel}`);

  const vlEl = h('div', {}, laden());
  const linksEl = h('div', {}, laden());
  let stukken = [];
  let rapporten = [];

  // ===== 1. Uitnodigen voor een vragenlijst =====

  function uitnodigingDialoog(vl, begin = 'uitnodiging') {
    const standaard = standaardUitnodiging();
    const tekst = { ...standaard, ...Object.fromEntries(Object.entries(vl.uitnodiging || {}).filter(([, w]) => typeof w === 'string' && w.trim())) };
    const waarden = { link: vragenlijstLink(vl.code), titel: vl.titel, bedrijf: o.bedrijfsnaam };
    let soort = begin;
    const sleutels = () => (soort === 'herinnering' ? ['herinnering_onderwerp', 'herinnering_tekst'] : ['onderwerp', 'tekst']);

    const onderwerpId = uniekeId('dl-onderwerp');
    const tekstId = uniekeId('dl-tekst');
    const onderwerp = h('input', { type: 'text', id: onderwerpId, maxlength: 200, readonly: ctx.alleenLezen });
    const veld = h('textarea', { id: tekstId, rows: 13, maxlength: 5000, class: 'dl-tekst', readonly: ctx.alleenLezen });
    const waarschuwing = h('div', { class: 'veld-fout', role: 'status' });
    const status = h('span', { class: 'klein zacht dl-status', role: 'status' });

    const bewaarNu = async () => {
      if (ctx.alleenLezen) return;
      try {
        await api.put(`/vragenlijsten/${vl.id}/uitnodiging`, tekst);
        vl.uitnodiging = { ...tekst };
        status.textContent = 'Opgeslagen';
      } catch (e) {
        status.textContent = `Niet opgeslagen: ${e.message}`;
      }
    };
    const bewaarLater = vertraag(bewaarNu, 900);

    const controleer = () => {
      const zonderLink = !veld.value.includes('{link}');
      waarschuwing.textContent = zonderLink
        ? 'Let op: de link staat niet in de tekst. Zet {link} op de plek waar de link naar de vragenlijst moet komen.'
        : '';
    };
    const toonSoort = () => {
      const [ko, kt] = sleutels();
      onderwerp.value = tekst[ko];
      veld.value = tekst[kt];
      controleer();
    };
    const lees = () => {
      const [ko, kt] = sleutels();
      tekst[ko] = onderwerp.value;
      tekst[kt] = veld.value;
    };
    const gewijzigd = () => {
      lees();
      controleer();
      status.textContent = ctx.alleenLezen ? '' : 'Wijzigingen worden opgeslagen…';
      bewaarLater();
    };
    onderwerp.addEventListener('input', gewijzigd);
    veld.addEventListener('input', gewijzigd);

    const kiesNaam = uniekeId('dl-soort');
    const keuze = (waarde, label) => h('label', { class: 'keuze dl-soort' },
      h('input', {
        type: 'radio',
        name: kiesNaam,
        value: waarde,
        checked: soort === waarde,
        onchange: () => {
          lees();
          soort = waarde;
          toonSoort();
        },
      }),
      h('span', {}, label));

    const klaar = () => ({
      onderwerp: vulIn(onderwerp.value, waarden),
      tekst: vulIn(veld.value, waarden),
    });

    const mailKnop = h('button', {
      type: 'button',
      class: 'knop knop-primair',
      onclick: () => {
        const k = klaar();
        if (mailLink(k.onderwerp, k.tekst).length > MAX_MAILTO + 200) {
          meld('Deze tekst is te lang om automatisch in een e-mail te zetten. Gebruik "Kopieer tekst" en plak hem in je e-mail.', 'waarschuwing');
          return;
        }
        openMail(k.onderwerp, k.tekst);
      },
    }, 'Open in e-mailprogramma');
    const kopieerKnop = h('button', {
      type: 'button',
      class: 'knop',
      onclick: async () => {
        if (await kopieer(klaar().tekst)) meld('Tekst gekopieerd. Plak hem in je e-mail of bericht.', 'succes');
        else meld('Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.', 'waarschuwing');
      },
    }, 'Kopieer tekst');
    const herstelKnop = ctx.alleenLezen ? null : h('button', {
      type: 'button',
      class: 'knop knop-licht',
      onclick: async () => {
        if (!(await bevestig({ titel: 'Standaardtekst terugzetten?', tekst: 'Je eigen tekst voor deze soort bericht wordt vervangen door de standaardtekst.', knop: 'Terugzetten' }))) return;
        const [ko, kt] = sleutels();
        tekst[ko] = standaard[ko];
        tekst[kt] = standaard[kt];
        toonSoort();
        status.textContent = 'Wijzigingen worden opgeslagen…';
        bewaarLater();
      },
    }, 'Standaardtekst terugzetten');
    const sluit = h('button', { type: 'button', class: 'knop' }, 'Sluiten');

    const d = maakDialoog(`Uitnodigen: ${vl.titel}`, [
      vl.status !== 'open'
        ? melding('Deze vragenlijst staat nog gesloten. Zet hem open bij Vragenlijsten voordat je de uitnodiging verstuurt; anders zien respondenten de melding "gesloten".', 'waarschuwing')
        : null,
      h('p', { class: 'zacht' }, 'Pas de tekst aan zoals jij hem wilt versturen. Met de knop hieronder opent de tekst als nieuw bericht in je eigen e-mailprogramma (bijvoorbeeld Outlook). Daar kies je zelf de ontvangers.'),
      h('fieldset', { class: 'dl-soorten' },
        h('legend', { class: 'sr-only' }, 'Soort bericht'),
        keuze('uitnodiging', 'Uitnodiging'),
        keuze('herinnering', 'Herinnering')),
      h('div', { class: 'veld' }, h('label', { for: onderwerpId }, 'Onderwerp'), onderwerp),
      h('div', { class: 'veld' },
        h('label', { for: tekstId }, 'Tekst'),
        veld,
        h('div', { class: 'veld-hulp' }, 'Op de plek van {link} komt de link naar de vragenlijst, {titel} wordt de titel en {bedrijf} de bedrijfsnaam.')),
      waarschuwing,
      h('div', { class: 'knoppen dl-verstuur' }, mailKnop, kopieerKnop, herstelKnop),
      h('ul', { class: 'klein zacht dl-tips' },
        h('li', {}, 'Zet de ontvangers in het veld BCC. Dan zien ze elkaars e-mailadres niet.'),
        h('li', {}, 'De onderzoeksomgeving verstuurt zelf geen e-mail en bewaart geen e-mailadressen. Zo blijft de vragenlijst anoniem.'),
        h('li', {}, 'Gebeurt er niets als je op de knop klikt? Dan is er op dit apparaat geen e-mailprogramma ingesteld. Gebruik dan "Kopieer tekst".')),
    ], [status, sluit]);
    d.classList.add('dl-dialoog');
    const dicht = async () => {
      bewaarLater.annuleer();
      lees();
      const anders = JSON.stringify(tekst) !== JSON.stringify({ ...standaard, ...(vl.uitnodiging || {}) });
      if (anders) await bewaarNu();
      d.close();
    };
    sluit.addEventListener('click', dicht);
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      dicht();
    });
    toonSoort();
    d.showModal();
    veld.focus();
    veld.setSelectionRange(0, 0);
    veld.scrollTop = 0;
  }

  function qrDialoog(vl) {
    const link = vragenlijstLink(vl.code);
    let matrix;
    try {
      matrix = maakQr(link);
    } catch (e) {
      meldFout(e);
      return;
    }
    const canvas = tekenQr(h('canvas', { class: 'dl-qr', role: 'img', 'aria-label': `QR-code voor de vragenlijst ${vl.titel}` }), matrix, { blokje: 10 });
    const naam = `qr-${slug(vl.titel)}`;
    const sluit = h('button', { type: 'button', class: 'knop' }, 'Sluiten');
    const d = maakDialoog(`QR-code: ${vl.titel}`, [
      h('p', { class: 'zacht' }, 'Zet de QR-code op een poster, in een presentatie of op het intranet. Mensen richten de camera van hun telefoon erop en komen direct bij de vragenlijst.'),
      h('div', { class: 'dl-qr-kader' }, canvas),
      h('p', { class: 'klein zacht dl-qr-link' }, link),
      vl.status !== 'open' ? melding('Deze vragenlijst staat nog gesloten. De QR-code werkt pas voor respondenten als je de vragenlijst openzet.', 'waarschuwing') : null,
      h('div', { class: 'knoppen' },
        h('button', {
          type: 'button',
          class: 'knop knop-primair',
          onclick: () => canvas.toBlob((blob) => {
            if (blob) bewaar(blob, `${naam}.png`, 'image/png');
            else meld('De afbeelding kon niet worden gemaakt.', 'fout');
          }, 'image/png'),
        }, 'Download als afbeelding (png)'),
        h('button', {
          type: 'button',
          class: 'knop',
          onclick: () => bewaar(qrAlsSvg(matrix, { blokje: 10 }), `${naam}.svg`, 'image/svg+xml'),
        }, 'Download voor drukwerk (svg)')),
      h('p', { class: 'klein zacht' }, 'Maak je een nieuwe link voor de vragenlijst, dan werkt deze QR-code niet meer. Download dan een nieuwe.'),
    ], [sluit]);
    sluit.addEventListener('click', () => d.close());
    d.showModal();
    sluit.focus();
  }

  function tekenVragenlijsten(lijsten) {
    if (!lijsten.length) {
      vervang(vlEl, leeg('Dit onderzoek heeft nog geen vragenlijst.',
        ctx.alleenLezen ? null : h('a', { class: 'knop knop-primair', href: `#/onderzoek/${onderzoekId}/vragenlijsten` }, 'Naar Vragenlijsten')));
      return;
    }
    vervang(vlEl, h('ul', { class: 'lijst' }, lijsten.map((vl) => h('li', { class: 'lijst-item dl-item' },
      h('div', { class: 'lijst-item-hoofd' },
        h('div', { class: 'lijst-item-titel' }, vl.titel),
        h('div', { class: 'lijst-item-meta rij' },
          statusLabel(vl.status),
          vl.meetmoment_naam ? h('span', { class: 'label' }, vl.meetmoment_naam) : null,
          h('span', {}, `${aantal(vl.aantal_inzendingen, 'keer', 'keer')} ingevuld${vl.aantal_uitgenodigd ? ` van ${vl.aantal_uitgenodigd.toLocaleString('nl-NL')} uitgenodigd` : ''}`)),
        vl.status !== 'open'
          ? h('p', { class: 'klein dl-let-op' }, ctx.alleenLezen
            ? 'Deze vragenlijst is gesloten; er kunnen geen antwoorden meer bij.'
            : ['Deze vragenlijst staat gesloten. Zet hem eerst open bij ', h('a', { href: `#/onderzoek/${onderzoekId}/vragenlijsten` }, 'Vragenlijsten'), '.'])
          : null,
        linkVeld(vragenlijstLink(vl.code), `Link naar de vragenlijst ${vl.titel}`)),
      h('div', { class: 'lijst-item-acties' },
        h('button', { type: 'button', class: 'knop knop-klein knop-primair', 'aria-haspopup': 'dialog', onclick: () => uitnodigingDialoog(vl) },
          'Uitnodiging', h('span', { class: 'sr-only' }, ` voor ${vl.titel}`)),
        h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: () => uitnodigingDialoog(vl, 'herinnering') },
          'Herinnering', h('span', { class: 'sr-only' }, ` voor ${vl.titel}`)),
        h('button', { type: 'button', class: 'knop knop-klein', 'aria-haspopup': 'dialog', onclick: () => qrDialoog(vl) },
          'QR-code', h('span', { class: 'sr-only' }, ` voor ${vl.titel}`)))))));
  }

  // ===== 2. Laten meekijken (deellinks) =====

  function watGedeeld(l) {
    const delen = [];
    if (l.onderdelen.dashboard) {
      delen.push(`resultaten ${l.onderdelen.open_antwoorden ? 'met' : 'zonder'} open antwoorden`);
    }
    const nr = (l.onderdelen.rapporten || []).filter((id) => rapporten.some((r) => r.id === id)).length;
    if (nr) delen.push(aantal(nr, 'rapport', 'rapporten'));
    const n = l.onderdelen.stukken.filter((id) => stukken.some((s) => s.id === id)).length;
    if (n) delen.push(aantal(n, 'stuk', 'stukken'));
    if (!delen.length) return 'niets (de gedeelde documenten bestaan niet meer)';
    const tekst = delen.length > 1 ? `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}` : delen[0];
    // De tussenstand geldt voor de resultaten en voor rapporten, niet voor stukken.
    return l.onderdelen.tussenstand && (l.onderdelen.dashboard || nr) ? `${tekst}, ook de tussenstand van open vragenlijsten` : tekst;
  }

  /** Onderdelen zonder stukken of rapporten die intussen zijn verwijderd (de server weigert die). */
  function geldigeOnderdelen(l) {
    const od = {
      dashboard: l.onderdelen.dashboard,
      open_antwoorden: l.onderdelen.open_antwoorden,
      tussenstand: l.onderdelen.tussenstand,
      stukken: l.onderdelen.stukken.filter((id) => stukken.some((s) => s.id === id)),
      rapporten: (l.onderdelen.rapporten || []).filter((id) => rapporten.some((r) => r.id === id)),
    };
    return od;
  }

  function linkStatus(l) {
    if (l.ingetrokken) return h('span', { class: 'label label-gesloten' }, 'Ingetrokken');
    if (l.verlopen) return h('span', { class: 'label label-waarschuwing' }, 'Verlopen');
    return h('span', { class: 'label label-open' }, 'Actief');
  }

  function linkFormulier(l = null) {
    const onderdelen = l ? { rapporten: [], ...l.onderdelen } : { dashboard: true, open_antwoorden: false, stukken: [], rapporten: [] };
    return formulierDialoog({
      titel: l ? 'Deellink wijzigen' : 'Nieuwe deellink',
      knop: l ? 'Opslaan' : 'Deellink maken',
      intro: l
        ? 'Wijzigingen gelden direct, ook voor iemand die de link al heeft.'
        : 'Met een deellink kan iemand de resultaten bekijken, maar niets wijzigen. Diegene heeft de link én een toegangscode nodig; die krijg je in de volgende stap te zien.',
      velden: [
        { naam: 'naam', label: 'Voor wie is deze link?', verplicht: true, max: 150, waarde: l?.naam, hulp: 'Bijvoorbeeld "Directie" of "Ondernemingsraad". Alleen jij ziet deze naam.' },
        { naam: 'dashboard', type: 'checkbox', label: 'Resultaten (het dashboard): respons, scores per thema, antwoorden per vraag, verloop en cijfers', waarde: onderdelen.dashboard },
        {
          naam: 'open_antwoorden',
          type: 'checkbox',
          label: 'Ook de open antwoorden laten zien',
          waarde: onderdelen.open_antwoorden,
          hulp: 'Open antwoorden kunnen herkenbaar zijn voor collega\'s. Deel ze alleen als dat zo is afgesproken.',
        },
        ...rapporten.map((r) => ({
          naam: `rapport_${r.id}`,
          type: 'checkbox',
          label: `Rapport: ${r.titel}${r.heeft_open ? ' (een vragenlijst stond nog open)' : ''}`,
          waarde: onderdelen.rapporten.includes(r.id),
          hulp: r.heeft_open ? 'Die uitkomsten ziet de meelezer alleen als je hieronder ook de tussenstand deelt.' : undefined,
        })),
        ...stukken.map((s) => ({
          naam: `stuk_${s.id}`,
          type: 'checkbox',
          label: `Stuk: ${s.titel || 'Zonder titel'}`,
          waarde: onderdelen.stukken.includes(s.id),
        })),
        {
          // Los van de resultaten: de tussenstand geldt ook voor rapporten (BOUWPLAN B8).
          naam: 'tussenstand',
          type: 'checkbox',
          label: 'Ook de tussenstand van vragenlijsten die nog openstaan (in de resultaten en in rapporten)',
          waarde: onderdelen.tussenstand,
          hulp: 'Liever niet. Wie tijdens het invullen twee keer kijkt, kan aan het verschil zien wat één nieuwe respondent heeft geantwoord. Zonder dit vinkje ziet de meelezer de uitkomsten van een vragenlijst pas als je hem hebt gesloten (het aantal ingevulde lijsten wel). In een rapport werk je daarna ook de cijfers bij.',
        },
        {
          naam: 'verloopt_op',
          type: 'date',
          label: 'Geldig tot en met',
          waarde: l ? (l.verloopt_op || '') : plusDagen(30),
          hulp: 'Na deze dag werkt de link niet meer. Laat leeg als de link geen einddatum heeft.',
        },
      ],
      controle: (w) => {
        const gekozenStukken = stukken.filter((s) => w[`stuk_${s.id}`]);
        const gekozenRapporten = rapporten.filter((r) => w[`rapport_${r.id}`]);
        if (!w.dashboard && !gekozenStukken.length && !gekozenRapporten.length) return 'Kies minstens één onderdeel dat de kijker mag zien.';
        if (w.open_antwoorden && !w.dashboard) return 'Open antwoorden horen bij de resultaten. Vink ook "Resultaten" aan, of zet de open antwoorden uit.';
        return null;
      },
      opslaan: async (w) => {
        const body = {
          naam: w.naam,
          verloopt_op: w.verloopt_op || null,
          onderdelen: {
            dashboard: w.dashboard,
            open_antwoorden: w.dashboard && w.open_antwoorden,
            tussenstand: w.tussenstand,
            stukken: stukken.filter((s) => w[`stuk_${s.id}`]).map((s) => s.id),
            rapporten: rapporten.filter((r) => w[`rapport_${r.id}`]).map((r) => r.id),
          },
        };
        if (l) {
          await api.put(`/deellinks/${l.id}`, { ...body, ingetrokken: l.ingetrokken });
        } else {
          const r = await api.post(`/onderzoeken/${onderzoekId}/deellinks`, body);
          w.resultaat = r;
        }
      },
    });
  }

  function mailVoorKijker(l) {
    const regels = [
      'Beste,',
      '',
      `Via onderstaande link kun je de resultaten van het onderzoek "${o.titel}" bij ${o.bedrijfsnaam} bekijken. Je kunt meelezen, maar niets wijzigen.`,
      '',
      deelLink(l.code),
      '',
      'Om de resultaten te openen heb je een toegangscode nodig. Die ontvang je apart van mij.',
    ];
    if (l.verloopt_op) regels.push('', `De link is geldig tot en met ${datum(l.verloopt_op)}.`);
    regels.push('', 'Met vriendelijke groet,', '');
    openMail(`Inzage in de resultaten: ${o.titel}`, regels.join('\n'));
  }

  /** Toont de toegangscode: die is alleen nu te zien. */
  function codeDialoog(l, toegangscode, { nieuw = true } = {}) {
    const sluit = h('button', { type: 'button', class: 'knop knop-primair' }, 'Ik heb de code genoteerd');
    const d = maakDialoog(nieuw ? `Deellink voor "${l.naam}" is klaar` : `Nieuwe toegangscode voor "${l.naam}"`, [
      h('ol', { class: 'dl-stappen' },
        h('li', {},
          h('strong', {}, 'De link'),
          linkVeld(deelLink(l.code), 'Deellink')),
        h('li', {},
          h('strong', {}, 'De toegangscode'),
          h('div', { class: 'dl-linkrij' },
            h('code', { class: 'dl-code' }, toegangscode),
            h('button', {
              type: 'button',
              class: 'knop knop-klein',
              onclick: async () => {
                if (await kopieer(toegangscode)) meld('Toegangscode gekopieerd.', 'succes');
                else meld('Kopiëren lukte niet. Neem de code zelf over.', 'waarschuwing');
              },
            }, 'Kopieer code')))),
      melding([
        h('strong', {}, 'Noteer of verstuur de toegangscode nu. '),
        'Voor de veiligheid bewaren we hem niet leesbaar: na het sluiten van dit venster kun je hem niet meer opvragen. Kwijt? Dan maak je met één klik een nieuwe code.',
      ], 'waarschuwing'),
      h('p', { class: 'klein zacht' }, 'Tip: stuur de link en de toegangscode apart van elkaar, bijvoorbeeld de link per e-mail en de code per sms of telefoon. Wie alleen de link heeft, kan dan nog niets zien.'),
      h('div', { class: 'knoppen' },
        h('button', { type: 'button', class: 'knop', onclick: () => mailVoorKijker(l) }, 'Open e-mail met de link')),
    ], [sluit]);
    d.classList.add('dl-dialoog');
    sluit.addEventListener('click', () => d.close());
    // Niet per ongeluk wegklikken met Escape: de code is hierna niet meer te zien.
    d.addEventListener('cancel', (e) => e.preventDefault());
    d.showModal();
    sluit.focus();
  }

  async function laadLinks() {
    try {
      const [{ deellinks }, st, rp] = await Promise.all([
        api.get(`/onderzoeken/${onderzoekId}/deellinks`),
        api.get(`/onderzoeken/${onderzoekId}/stukken`),
        api.get(`/onderzoeken/${onderzoekId}/rapporten`),
      ]);
      stukken = st.stukken || [];
      rapporten = rp.rapporten || [];
      tekenLinks(deellinks);
    } catch (e) {
      vervang(linksEl, melding([h('strong', {}, 'De deellinks konden niet worden geladen. '), e.message || ''], 'gevaar'));
    }
  }

  async function nieuweLink() {
    const w = await linkFormulier();
    if (!w || !w.resultaat) return;
    await laadLinks();
    codeDialoog(w.resultaat.deellink, w.resultaat.toegangscode);
  }

  function tekenLinks(links) {
    if (!links.length) {
      vervang(linksEl, leeg('Er kijkt nog niemand mee. Maak een deellink om bijvoorbeeld de opdrachtgever de resultaten te laten zien.',
        h('button', { type: 'button', class: 'knop knop-primair', onclick: nieuweLink }, 'Deellink maken')));
      return;
    }
    vervang(linksEl, h('ul', { class: 'lijst' }, links.map((l) => {
      const zetIngetrokken = async (ingetrokken) => {
        try {
          await api.put(`/deellinks/${l.id}`, { naam: l.naam, verloopt_op: l.verloopt_op, onderdelen: geldigeOnderdelen(l), ingetrokken });
          meld(ingetrokken ? 'De link is ingetrokken en werkt niet meer.' : 'De link werkt weer.', 'succes');
          laadLinks();
        } catch (e) {
          meldFout(e);
        }
      };
      return h('li', { class: 'lijst-item dl-item' },
        h('div', { class: 'lijst-item-hoofd' },
          h('div', { class: 'lijst-item-titel' }, l.naam),
          h('div', { class: 'lijst-item-meta rij' },
            linkStatus(l),
            h('span', {}, `Deelt ${watGedeeld(l)}`)),
          h('p', { class: 'klein zacht dl-meta' },
            l.verloopt_op ? `Geldig tot en met ${datum(l.verloopt_op)}` : 'Geen einddatum',
            ' · ',
            l.laatst_bekeken ? `laatst bekeken op ${datum(l.laatst_bekeken)}` : 'nog niet bekeken',
            ' · ',
            `gemaakt op ${lokaleDatum(l.aangemaakt_op)}`),
          l.actief ? linkVeld(deelLink(l.code), `Deellink voor ${l.naam}`) : null),
        h('div', { class: 'lijst-item-acties' },
          l.actief ? h('button', { type: 'button', class: 'knop knop-klein', onclick: () => mailVoorKijker(l) }, 'E-mail met link', h('span', { class: 'sr-only' }, ` voor ${l.naam}`)) : null,
          h('button', {
            type: 'button',
            class: 'knop knop-klein',
            onclick: async () => {
              if (await linkFormulier(l)) {
                meld('Deellink gewijzigd.', 'succes');
                laadLinks();
              }
            },
          }, 'Wijzigen', h('span', { class: 'sr-only' }, `: ${l.naam}`)),
          h('button', {
            type: 'button',
            class: 'knop knop-klein',
            onclick: async () => {
              if (!(await bevestig({
                titel: 'Nieuwe toegangscode maken?',
                tekst: `De oude toegangscode van "${l.naam}" werkt daarna niet meer, en wie nu meekijkt moet de nieuwe code invullen. De link zelf blijft hetzelfde.`,
                knop: 'Nieuwe code maken',
              }))) return;
              try {
                const r = await api.post(`/deellinks/${l.id}/nieuwe-toegangscode`, {});
                codeDialoog(l, r.toegangscode, { nieuw: false });
              } catch (e) {
                meldFout(e);
              }
            },
          }, 'Nieuwe code', h('span', { class: 'sr-only' }, ` voor ${l.naam}`)),
          l.ingetrokken
            ? h('button', { type: 'button', class: 'knop knop-klein', onclick: () => zetIngetrokken(false) }, 'Weer laten werken', h('span', { class: 'sr-only' }, `: ${l.naam}`))
            : h('button', {
              type: 'button',
              class: 'knop knop-klein',
              onclick: async () => {
                if (await bevestig({ titel: 'Deellink intrekken?', tekst: `"${l.naam}" kan de resultaten daarna niet meer bekijken, ook niet als het venster nog openstaat. Je kunt de link later weer laten werken.`, knop: 'Intrekken', gevaar: true })) zetIngetrokken(true);
              },
            }, 'Intrekken', h('span', { class: 'sr-only' }, `: ${l.naam}`)),
          h('button', {
            type: 'button',
            class: 'knop knop-klein knop-licht',
            onclick: async () => {
              if (!(await bevestig({ titel: 'Deellink verwijderen?', tekst: `De link voor "${l.naam}" wordt verwijderd en werkt niet meer.`, knop: 'Verwijderen', gevaar: true }))) return;
              try {
                await api.del(`/deellinks/${l.id}`);
                meld('Deellink verwijderd.');
                laadLinks();
              } catch (e) {
                meldFout(e);
              }
            },
          }, 'Verwijderen', h('span', { class: 'sr-only' }, `: ${l.naam}`))));
    })));
  }

  vervang(container,
    h('section', { class: 'kaart', 'aria-labelledby': 'dl-kop-invullen' },
      h('div', { class: 'kaart-kop' }, h('h2', { id: 'dl-kop-invullen' }, 'Uitnodigen om een vragenlijst in te vullen')),
      h('p', { class: 'dl-uitleg' }, 'Iedereen met de link kan de vragenlijst invullen, zonder account. Stuur de link zelf rond: met een kant-en-klare uitnodiging in je eigen e-mailprogramma, of met een QR-code.'),
      vlEl),
    h('section', { class: 'kaart', 'aria-labelledby': 'dl-kop-meekijken' },
      h('div', { class: 'kaart-kop' },
        h('h2', { id: 'dl-kop-meekijken' }, 'Laten meekijken met de resultaten'),
        h('div', { class: 'knoppen' }, h('button', { type: 'button', class: 'knop knop-primair', onclick: nieuweLink }, '+ Deellink maken'))),
      h('p', { class: 'dl-uitleg' }, 'Geef bijvoorbeeld de opdrachtgever of de ondernemingsraad inzage. Zij krijgen een link en een toegangscode, kunnen alleen lezen en zien alleen wat jij aanvinkt. Uitkomsten van minder dan ',
        String(ctx.instellingen.drempel || 5), ' respondenten blijven voor hen altijd verborgen.'),
      linksEl),
  );

  try {
    const { vragenlijsten } = await api.get(`/onderzoeken/${onderzoekId}/vragenlijsten`);
    tekenVragenlijsten(vragenlijsten);
  } catch (e) {
    vervang(vlEl, melding([h('strong', {}, 'De vragenlijsten konden niet worden geladen. '), e.message || ''], 'gevaar'));
  }
  await laadLinks();
}
