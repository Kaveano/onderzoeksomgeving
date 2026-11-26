// Scherm: één rapport schrijven (tussenrapport of eindrapport).
//
// Per hoofdstuk staan er drie dingen onder elkaar:
//   1. Feiten uit het onderzoek – automatisch, met vaste regels uit de gegevens (zie rapport-feiten.js);
//   2. Hulpvragen – geen inhoud van het rapport, alleen hulp bij het schrijven;
//   3. Jouw tekst – wat je zelf schrijft. Dit wordt automatisch opgeslagen.
// De feiten zijn vastgelegd op een peildatum en veranderen alleen als je op "Cijfers bijwerken" klikt;
// je eigen tekst blijft daarbij altijd staan.

import { api } from '../api.js';
import { h, vervang, laden, melding, meld, meldFout, bevestig, kopieer, vertraag, uniekeId, datum, vandaag, aantal } from '../ui.js';
import {
  RAPPORTSOORTEN, SECTIESOORTEN, verzamelFeiten, sectieFeiten, rapportNaarBlokken, blokkenVoorWord, blokkenNaarTekst,
  genummerdeSecties, nogInTeVullen, hoofdLijst,
} from '../rapport-feiten.js';
import { toonBlokken } from '../rapport-weergave.js';
import { slug } from '../export.js';

const WACHTTIJD = 1200; // ms stilte na typen voordat we opslaan
const OPNIEUW_NA = 10000;

function telWoorden(tekst) {
  const m = String(tekst || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const rapportId = ctx.params.rapportId;
  const terug = `#/onderzoek/${onderzoekId}/rapport`;
  vervang(container, laden('Het rapport wordt geladen…'));

  let rapport;
  try {
    ({ rapport } = await api.get(`/rapporten/${rapportId}`));
  } catch (e) {
    vervang(container,
      h('div', { class: 'kruimel' }, h('a', { href: terug }, '← Alle rapporten')),
      melding([h('strong', {}, 'Dit rapport kon niet worden geladen. '), e.message || ''], 'gevaar'));
    return;
  }
  if (String(rapport.onderzoek_id) !== String(onderzoekId)) {
    ctx.navigeer(terug);
    return;
  }
  ctx.zetTitel(`${rapport.titel} – ${ctx.onderzoek.onderzoek.titel}`);

  const inhoud = rapport.inhoud;
  if (!Array.isArray(inhoud.secties)) inhoud.secties = [];
  let feiten = rapport.feiten;
  let basis = rapport.bijgewerkt_op;
  let vuil = false;
  let bezig = false;
  let nogEens = false;
  let conflict = false;
  let opnieuwTimer = null;
  let weergave = 'schrijven'; // of 'voorbeeld'

  const statusEl = h('span', { class: 'rp-status klein zacht', role: 'status' }, ctx.alleenLezen ? 'Alleen lezen' : 'Alles is opgeslagen');
  const meldingEl = h('div', {});
  const lichaam = h('div', {});

  // ---------- Opslaan ----------

  async function bewaar({ bijSluiten = false } = {}) {
    if (ctx.alleenLezen || conflict || !vuil) return;
    if (bezig) {
      nogEens = true;
      return;
    }
    bezig = true;
    vuil = false;
    clearTimeout(opnieuwTimer);
    statusEl.textContent = 'Bezig met opslaan…';
    const body = { titel: rapport.titel, inhoud, bijgewerkt_op: basis };
    try {
      const klein = JSON.stringify(body).length < 60_000;
      const r = await api.put(`/rapporten/${rapportId}`, body, { keepalive: bijSluiten && klein });
      basis = r.bijgewerkt_op;
      if (!vuil) statusEl.textContent = 'Alles is opgeslagen';
    } catch (e) {
      vuil = true;
      if (e.status === 409 && e.data && e.data.conflict) {
        conflict = true;
        statusEl.textContent = 'Niet opgeslagen';
        vervang(meldingEl, melding([
          h('p', {}, h('strong', {}, 'Dit rapport is op een andere plek gewijzigd. '), 'Bijvoorbeeld in een ander tabblad of op een ander apparaat. Kies welke versie je wilt houden.'),
          h('div', { class: 'knoppen' },
            h('button', {
              type: 'button',
              class: 'knop',
              onclick: async () => {
                conflict = false;
                try {
                  const r = await api.put(`/rapporten/${rapportId}`, { titel: rapport.titel, inhoud, overschrijven: true });
                  basis = r.bijgewerkt_op;
                  vuil = false;
                  vervang(meldingEl);
                  statusEl.textContent = 'Alles is opgeslagen';
                } catch (fout) {
                  conflict = true;
                  meldFout(fout);
                }
              },
            }, 'Mijn versie hier bewaren'),
            h('button', { type: 'button', class: 'knop', onclick: () => { vuil = false; ctx.navigeer(location.hash); } }, 'De andere versie laden')),
        ], 'waarschuwing'));
      } else if (e.status !== 401) {
        statusEl.textContent = 'Opslaan lukt nu niet; we proberen het zo opnieuw.';
        opnieuwTimer = setTimeout(() => bewaar(), OPNIEUW_NA);
      }
    } finally {
      bezig = false;
      if (nogEens) {
        nogEens = false;
        bewaar();
      }
    }
  }
  const bewaarLater = vertraag(() => bewaar(), WACHTTIJD);
  function gewijzigd({ direct = false } = {}) {
    if (ctx.alleenLezen) return;
    vuil = true;
    statusEl.textContent = 'Wijzigingen worden opgeslagen…';
    if (direct) {
      bewaarLater.annuleer();
      bewaar();
    } else {
      bewaarLater();
    }
  }
  const bijZichtbaarheid = () => {
    if (document.visibilityState === 'hidden') {
      bewaarLater.annuleer();
      bewaar({ bijSluiten: true });
    }
  };
  const bijWeerIngelogd = () => bewaar();
  const bijSluiten = (e) => {
    if (vuil || bezig) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  document.addEventListener('visibilitychange', bijZichtbaarheid);
  window.addEventListener('weer-ingelogd', bijWeerIngelogd);
  window.addEventListener('beforeunload', bijSluiten);
  ctx.bijVertrek(async () => {
    bewaarLater.annuleer();
    clearTimeout(opnieuwTimer);
    document.removeEventListener('visibilitychange', bijZichtbaarheid);
    window.removeEventListener('weer-ingelogd', bijWeerIngelogd);
    window.removeEventListener('beforeunload', bijSluiten);
    await bewaar();
  });

  // ---------- Feiten (cijfers uit het onderzoek) ----------

  async function werkFeitenBij({ stil = false } = {}) {
    const data = await api.get(`/onderzoeken/${onderzoekId}/export/data`);
    const lijsten = data.vragenlijsten || [];
    const dashboards = [];
    if (lijsten.length) {
      for (const l of lijsten) dashboards.push(await api.get(`/onderzoeken/${onderzoekId}/dashboard?vragenlijst=${l.id}`));
    } else {
      dashboards.push(await api.get(`/onderzoeken/${onderzoekId}/dashboard`));
    }
    const nieuw = verzamelFeiten({ data, dashboards, peildatum: vandaag() });
    await api.put(`/rapporten/${rapportId}/feiten`, { feiten: nieuw });
    feiten = nieuw;
    if (!stil) meld('De cijfers zijn bijgewerkt. Je eigen tekst is niet veranderd.', 'succes');
  }

  // ---------- Schrijven ----------

  function veld(label, waarde, bij, { type = 'text', max = 200, hulp = null } = {}) {
    const id = uniekeId('rp-veld');
    const invoer = h('input', { type, id, value: waarde || '', maxlength: type === 'text' ? max : null, readonly: ctx.alleenLezen, autocomplete: 'off' });
    invoer.addEventListener('input', () => {
      bij(invoer.value);
      gewijzigd();
    });
    return h('div', { class: 'veld' }, h('label', { for: id }, label), invoer, hulp ? h('div', { class: 'veld-hulp' }, hulp) : null);
  }

  function voorbladKaart() {
    const lijsten = feiten ? feiten.lijsten : [];
    const gekozen = feiten ? hoofdLijst(feiten, inhoud) : null;
    const lijstId = uniekeId('rp-lijst');
    const kies = h('select', {
      id: lijstId,
      disabled: ctx.alleenLezen,
      onchange: (e) => {
        inhoud.lijst = Number(e.target.value) || null;
        gewijzigd({ direct: true });
        tekenSchrijven();
      },
    },
    h('option', { value: '' }, `Automatisch: de laatste met antwoorden${gekozen && !inhoud.lijst ? ` (nu: ${gekozen.titel})` : ''}`),
    lijsten.map((l) => h('option', { value: l.id, selected: inhoud.lijst === l.id },
      `${l.titel}${l.meetmoment_naam ? ` (${l.meetmoment_naam})` : ''} – ${l.verborgen ? 'te weinig antwoorden' : aantal(l.n, 'antwoord', 'antwoorden')}`)));
    return h('section', { class: 'kaart rp-voorbladkaart', 'aria-labelledby': 'rp-kop-voorblad' },
      h('div', { class: 'kaart-kop' }, h('h2', { id: 'rp-kop-voorblad' }, 'Voorblad en uitgangspunten')),
      h('div', { class: 'rp-velden' },
        veld('Titel van het rapport', rapport.titel, (w) => { rapport.titel = w.trim() || rapport.titel; }),
        veld('Ondertitel', inhoud.ondertitel, (w) => { inhoud.ondertitel = w; }),
        veld('Opdrachtgever', inhoud.opdrachtgever, (w) => { inhoud.opdrachtgever = w; }),
        veld('Opgesteld door', inhoud.opsteller, (w) => { inhoud.opsteller = w; }),
        veld('Datum van het rapport', inhoud.datum, (w) => { inhoud.datum = w; }, { type: 'date' }),
        lijsten.length > 1
          ? h('div', { class: 'veld' },
            h('label', { for: lijstId }, 'Resultaten op basis van vragenlijst'),
            kies,
            h('div', { class: 'veld-hulp' }, 'Het hoofdstuk Resultaten en de bijlagen gaan over deze vragenlijst. De vergelijking tussen meetmomenten gebruikt altijd alle metingen.'))
          : null));
  }

  function feitenKaart() {
    const knop = ctx.alleenLezen ? null : h('button', {
      type: 'button',
      class: 'knop',
      onclick: async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        b.textContent = 'Bezig met ophalen…';
        try {
          await werkFeitenBij();
          tekenSchrijven();
        } catch (fout) {
          meldFout(fout);
          b.disabled = false;
          b.textContent = 'Cijfers bijwerken';
        }
      },
    }, 'Cijfers bijwerken');
    return h('section', { class: 'kaart rp-feitenkaart', 'aria-labelledby': 'rp-kop-cijfers' },
      h('div', { class: 'kaart-kop' }, h('h2', { id: 'rp-kop-cijfers' }, 'Cijfers uit het onderzoek'), knop),
      feiten
        ? h('p', {}, 'De cijfers in dit rapport zijn vastgelegd op ', h('strong', {}, datum(feiten.peildatum)), '. Komen er daarna nog antwoorden binnen, dan verandert het rapport niet vanzelf. ',
          ctx.alleenLezen ? '' : 'Met "Cijfers bijwerken" haal je de actuele stand op; je eigen tekst blijft staan.')
        : h('p', {}, 'Er zijn nog geen cijfers vastgelegd. Klik op "Cijfers bijwerken".'),
      h('p', { class: 'klein zacht' }, `Uitkomsten van minder dan ${feiten ? feiten.drempel : ctx.instellingen.drempel || 5} respondenten komen niet in het rapport, om de anonimiteit te beschermen.`));
  }

  function voortgang() {
    const leeg = nogInTeVullen(inhoud);
    const secties = genummerdeSecties(inhoud);
    return h('nav', { class: 'kaart rp-voortgang', 'aria-label': 'Hoofdstukken' },
      h('h2', {}, 'Hoofdstukken'),
      h('ol', { class: 'rp-inhoudsopgave' }, secties.map(({ sectie, nummer, isBijlage }) => {
        const klaar = isBijlage || String(sectie.tekst || '').trim();
        return h('li', {},
          h('a', { href: `#rp-${sectie.id}`, onclick: (e) => { e.preventDefault(); const el = document.getElementById(`rp-${sectie.id}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
            h('span', { class: 'rp-io-nummer' }, isBijlage ? `Bijlage ${nummer}` : nummer),
            h('span', { class: 'rp-io-titel' }, sectie.titel.replace(/^Bijlage:\s*/i, ''))),
          isBijlage ? null : h('span', { class: `label ${klaar ? 'label-succes' : 'label-waarschuwing'}` }, klaar ? 'geschreven' : 'nog leeg'));
      })),
      leeg.length
        ? h('p', { class: 'klein zacht' }, `${aantal(leeg.length, 'hoofdstuk heeft', 'hoofdstukken hebben')} nog geen eigen tekst.`)
        : h('p', { class: 'klein zacht' }, 'Alle hoofdstukken hebben eigen tekst.'));
  }

  function sectieKaart(sectie, index) {
    const soort = SECTIESOORTEN[sectie.soort] || SECTIESOORTEN.eigen;
    const nrs = genummerdeSecties(inhoud).find((x) => x.sectie === sectie);
    const titelId = uniekeId('rp-titel');
    const tekstId = uniekeId('rp-tekst');
    const titel = h('input', { type: 'text', id: titelId, class: 'rp-sectie-titel', value: sectie.titel, maxlength: 200, readonly: ctx.alleenLezen, 'aria-label': 'Titel van het hoofdstuk' });
    titel.addEventListener('input', () => {
      if (titel.value.trim()) {
        sectie.titel = titel.value.trim();
        gewijzigd();
      }
    });
    titel.addEventListener('change', () => {
      if (!titel.value.trim()) titel.value = sectie.titel;
      vervang(voortgangEl, voortgang());
    });

    const teller = h('span', { class: 'klein zacht' }, aantal(telWoorden(sectie.tekst), 'woord', 'woorden'));
    const tekst = h('textarea', {
      id: tekstId,
      class: 'rp-tekst',
      rows: Math.min(18, Math.max(6, String(sectie.tekst || '').split('\n').length + 2)),
      maxlength: 60000,
      readonly: ctx.alleenLezen,
      placeholder: ctx.alleenLezen ? '' : 'Schrijf hier je eigen tekst…',
    }, sectie.tekst || '');
    let wasLeeg = !String(sectie.tekst || '').trim();
    tekst.addEventListener('input', () => {
      sectie.tekst = tekst.value;
      teller.textContent = aantal(telWoorden(sectie.tekst), 'woord', 'woorden');
      const isLeeg = !sectie.tekst.trim();
      if (isLeeg !== wasLeeg) {
        wasLeeg = isLeeg;
        vervang(voortgangEl, voortgang());
      }
      gewijzigd();
    });

    const schakel = (label, aan, bij, hulp = null) => {
      const id = uniekeId('rp-schakel');
      return h('label', { class: 'keuze rp-schakel', for: id },
        h('input', { type: 'checkbox', id, checked: aan, disabled: ctx.alleenLezen, onchange: (e) => { bij(e.target.checked); gewijzigd({ direct: true }); tekenSchrijven({ behoudScroll: true }); } }),
        h('span', {}, label, hulp ? h('span', { class: 'klein zacht' }, ` ${hulp}`) : null));
    };

    const verplaats = (richting) => {
      const naar = index + richting;
      if (naar < 0 || naar >= inhoud.secties.length) return;
      inhoud.secties.splice(naar, 0, inhoud.secties.splice(index, 1)[0]);
      gewijzigd({ direct: true });
      tekenSchrijven({ behoudScroll: true, focus: `rp-${sectie.id}` });
    };

    const blokken = soort.feiten && feiten ? sectieFeiten(sectie, feiten, inhoud) : [];
    const feitenDeel = soort.feiten
      ? h('details', { class: `rp-deel rp-deel-feiten${sectie.feiten === false ? ' rp-uit' : ''}`, open: sectie.feiten !== false },
        h('summary', {},
          h('span', { class: 'rp-deel-titel' }, 'Feiten uit het onderzoek'),
          h('span', { class: 'label' }, sectie.feiten === false ? 'niet in het rapport' : 'automatisch')),
        h('div', { class: 'rp-deel-inhoud' },
          sectie.soort === 'bijlage-open' && sectie.feiten !== false && sectie.aan !== false
            ? melding('Let op: open antwoorden kunnen herkenbaar zijn voor collega\'s. Neem deze bijlage alleen op als dat is afgesproken, en lees de antwoorden eerst door.', 'waarschuwing')
            : null,
          blokken.length ? h('div', { class: 'rp-feiten' }, toonBlokken(blokken)) : h('p', { class: 'zacht' }, feiten ? 'Bij dit hoofdstuk zijn geen feiten beschikbaar.' : 'Nog geen cijfers vastgelegd.'),
          h('div', { class: 'rp-deel-opties' },
            schakel('Deze feiten opnemen in het rapport', sectie.feiten !== false, (w) => { sectie.feiten = w; }),
            sectie.soort === 'resultaten'
              ? schakel('Beknopt: alleen de thema\'s, zonder de losse vragen', !!sectie.beknopt, (w) => { sectie.beknopt = w; })
              : null)))
      : null;

    return h('section', { class: `kaart rp-sectie${sectie.aan === false ? ' rp-sectie-uit' : ''}`, id: `rp-${sectie.id}`, 'aria-labelledby': titelId, tabindex: '-1' },
      h('div', { class: 'rp-sectie-kop' },
        h('span', { class: 'rp-sectie-nummer' }, nrs ? (nrs.isBijlage ? `Bijlage ${nrs.nummer}` : `Hoofdstuk ${nrs.nummer}`) : 'Niet in het rapport'),
        titel,
        ctx.alleenLezen ? null : h('div', { class: 'rp-sectie-knoppen' },
          h('button', { type: 'button', class: 'knop knop-klein knop-icoon', disabled: index === 0, 'aria-label': `Hoofdstuk "${sectie.titel}" omhoog`, title: 'Omhoog', onclick: () => verplaats(-1) }, '↑'),
          h('button', { type: 'button', class: 'knop knop-klein knop-icoon', disabled: index === inhoud.secties.length - 1, 'aria-label': `Hoofdstuk "${sectie.titel}" omlaag`, title: 'Omlaag', onclick: () => verplaats(1) }, '↓'),
          sectie.soort === 'eigen'
            ? h('button', {
              type: 'button',
              class: 'knop knop-klein knop-licht',
              onclick: async () => {
                if (String(sectie.tekst || '').trim() && !(await bevestig({ titel: 'Hoofdstuk verwijderen?', tekst: `"${sectie.titel}" wordt verwijderd, met de tekst die erin staat.`, knop: 'Verwijderen', gevaar: true }))) return;
                inhoud.secties.splice(index, 1);
                gewijzigd({ direct: true });
                tekenSchrijven({ behoudScroll: true });
              },
            }, 'Verwijderen')
            : null)),
      h('div', { class: 'rp-sectie-opties' },
        schakel('Dit hoofdstuk opnemen in het rapport', sectie.aan !== false, (w) => { sectie.aan = w; })),
      sectie.aan === false ? null : [
        feitenDeel,
        h('details', { class: 'rp-deel rp-deel-hulp' },
          h('summary', {}, h('span', { class: 'rp-deel-titel' }, 'Hulpvragen bij dit hoofdstuk'), h('span', { class: 'label' }, 'komt niet in het rapport')),
          h('div', { class: 'rp-deel-inhoud' }, h('ul', { class: 'rp-hulp' }, soort.hulp.map((v) => h('li', {}, v))))),
        h('div', { class: 'rp-deel rp-deel-eigen' },
          h('div', { class: 'rp-eigen-kop' },
            h('label', { for: tekstId, class: 'rp-deel-titel' }, 'Jouw tekst'),
            teller),
          tekst,
          ctx.alleenLezen ? null : h('p', { class: 'veld-hulp' }, 'Opmaak: ## tussenkop · **vet** · *cursief* · - opsomming · 1. genummerd · > citaat. Een lege regel begint een nieuwe alinea.')),
      ]);
  }

  let voortgangEl = h('div', {});

  function tekenSchrijven({ behoudScroll = false, focus = null } = {}) {
    const y = window.scrollY;
    voortgangEl = h('div', { class: 'rp-voortgang-houder' }, voortgang());
    vervang(lichaam,
      h('div', { class: 'rp-raster' },
        h('div', { class: 'rp-zijkant' }, voortgangEl),
        h('div', { class: 'rp-hoofd' },
          voorbladKaart(),
          feitenKaart(),
          inhoud.secties.map((s, i) => sectieKaart(s, i)),
          ctx.alleenLezen ? null : h('div', { class: 'rp-toevoegen' },
            h('button', {
              type: 'button',
              class: 'knop',
              onclick: () => {
                let n = 1;
                while (inhoud.secties.some((s) => s.id === `eigen-${n}`)) n++;
                const bijlageVanaf = inhoud.secties.findIndex((s) => SECTIESOORTEN[s.soort]?.bijlage);
                const nieuw = { id: `eigen-${n}`, soort: 'eigen', titel: 'Eigen hoofdstuk', tekst: '', aan: true, feiten: false, beknopt: false };
                if (bijlageVanaf === -1) inhoud.secties.push(nieuw);
                else inhoud.secties.splice(bijlageVanaf, 0, nieuw);
                gewijzigd({ direct: true });
                tekenSchrijven({ behoudScroll: true, focus: `rp-${nieuw.id}` });
              },
            }, '+ Eigen hoofdstuk toevoegen'),
            h('span', { class: 'klein zacht' }, 'Een hoofdstuk zonder automatische feiten, bijvoorbeeld een voorwoord of een extra analyse.')))));
    if (behoudScroll) window.scrollTo(0, y);
    if (focus) {
      const el = document.getElementById(focus);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        const t = el.querySelector('.rp-sectie-titel');
        if (t) t.focus();
      }
    }
  }

  // ---------- Voorbeeld, Word en afdrukken ----------

  const alsBlokken = (opties) => rapportNaarBlokken({ titel: rapport.titel, soort: rapport.soort, inhoud, feiten }, opties);

  async function magExporteren() {
    const leeg = nogInTeVullen(inhoud);
    if (!leeg.length) return true;
    return bevestig({
      titel: 'Nog niet alles is geschreven',
      tekst: [
        h('p', {}, `${aantal(leeg.length, 'hoofdstuk heeft', 'hoofdstukken hebben')} nog geen eigen tekst:`),
        h('ul', {}, leeg.map((t) => h('li', {}, t))),
        h('p', {}, 'In het rapport staan daar dan alleen de feiten. Wil je toch doorgaan?'),
      ],
      knop: 'Toch doorgaan',
    });
  }

  async function downloadWord() {
    if (!(await magExporteren())) return;
    try {
      const b = await import('../bestanden.js');
      const bytes = b.maakDocx({
        titel: rapport.titel,
        blokken: blokkenVoorWord(alsBlokken({ markeerLeeg: false })),
        voettekst: `${rapport.titel} – ${ctx.onderzoek.onderzoek.bedrijfsnaam}`,
      });
      b.bewaarBestand(bytes, `${slug(ctx.onderzoek.onderzoek.bedrijfsnaam)}-${slug(rapport.titel)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      meld('Het Word-bestand is gedownload. Je kunt het in Word verder opmaken.', 'succes');
    } catch (e) {
      console.error(e);
      meld('Het Word-bestand kon niet worden gemaakt. Gebruik "Afdrukken of opslaan als pdf", of kopieer de tekst.', 'fout');
    }
  }

  function tekenVoorbeeld() {
    const leeg = nogInTeVullen(inhoud);
    vervang(lichaam,
      leeg.length
        ? melding(`Nog te schrijven: ${leeg.join(', ')}. In dit voorbeeld zie je op die plekken een grijze regel; in Word en bij afdrukken blijft die regel weg.`, 'waarschuwing')
        : null,
      h('article', { class: 'kaart rp-document' }, toonBlokken(alsBlokken({ markeerLeeg: true }))));
    window.scrollTo(0, 0);
  }

  function teken() {
    const isVoorbeeld = weergave === 'voorbeeld';
    const wissel = (naar, label) => h('button', {
      type: 'button',
      class: `knop${weergave === naar ? ' knop-primair' : ''}`,
      'aria-pressed': String(weergave === naar),
      onclick: () => {
        if (weergave === naar) return;
        weergave = naar;
        teken();
      },
    }, label);
    vervang(container,
      h('div', { class: 'kruimel' }, h('a', { href: terug }, '← Alle rapporten')),
      h('div', { class: 'rp-balk' },
        h('div', { class: 'rp-balk-links' },
          h('span', { class: `label ${rapport.soort === 'eind' ? 'label-primair' : ''}` }, RAPPORTSOORTEN[rapport.soort] || 'Rapport'),
          statusEl),
        h('div', { class: 'knoppen rp-balk-knoppen' },
          h('div', { class: 'rp-wissel', role: 'group', 'aria-label': 'Weergave' }, wissel('schrijven', ctx.alleenLezen ? 'Hoofdstukken' : 'Schrijven'), wissel('voorbeeld', 'Voorbeeld')),
          h('button', { type: 'button', class: 'knop', onclick: downloadWord }, 'Download als Word'),
          h('button', {
            type: 'button',
            class: 'knop',
            onclick: async () => {
              if (!(await magExporteren())) return;
              if (weergave !== 'voorbeeld') {
                weergave = 'voorbeeld';
                teken();
              }
              document.body.classList.add('rp-afdrukken');
              const klaar = () => {
                document.body.classList.remove('rp-afdrukken');
                window.removeEventListener('afterprint', klaar);
              };
              window.addEventListener('afterprint', klaar);
              setTimeout(() => window.print(), 50);
            },
          }, 'Afdrukken of pdf'),
          h('button', {
            type: 'button',
            class: 'knop knop-licht',
            onclick: async () => {
              if (await kopieer(blokkenNaarTekst(alsBlokken({ markeerLeeg: false })))) meld('Het rapport is als tekst gekopieerd.', 'succes');
              else meld('Kopiëren is niet gelukt.', 'fout');
            },
          }, 'Kopieer als tekst'))),
      ctx.alleenLezen ? melding('Dit onderzoek is gearchiveerd. Je kunt het rapport lezen, downloaden en afdrukken, maar niet meer wijzigen.') : null,
      meldingEl,
      lichaam);
    if (isVoorbeeld) tekenVoorbeeld();
    else tekenSchrijven();
  }

  // Nieuw rapport: de cijfers meteen ophalen, zodat de hoofdstukken gevuld zijn.
  if (!feiten && !ctx.alleenLezen) {
    vervang(container, laden('De cijfers uit je onderzoek worden opgehaald…'));
    try {
      await werkFeitenBij({ stil: true });
    } catch (e) {
      meldFout(e);
    }
  }
  teken();
}
