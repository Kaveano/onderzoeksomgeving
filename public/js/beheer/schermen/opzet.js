// Scherm: Opzet – gegevens van het onderzoek, thema's en meetpunten, meetmomenten en sjablonen.
//
// Vier kaarten. Na elke wijziging aan thema's, meetpunten of meetmomenten wordt het onderzoek
// opnieuw opgehaald (ctx.herlaadOnderzoek) en worden alleen die kaarten opnieuw getekend.
// Na het opslaan van de gegevens (titel, bedrijfsnaam) wordt de hele pagina opnieuw opgebouwd,
// zodat de paginakop bovenaan de nieuwe titel toont.

import { api } from '../api.js';
import { h, vervang, leeg, laden, melding, meld, meldFout, bevestig, formulierDialoog, datum, aantal } from '../ui.js';

const sleutel = (s) => String(s ?? '').trim().toLowerCase();

const GEGEVENS_VELDEN = [
  {
    naam: 'bedrijfsnaam',
    label: 'Bedrijfsnaam',
    verplicht: true,
    max: 150,
    hulp: 'De organisatie waar je het onderzoek doet. Deze naam komt in de introductietekst van vragenlijsten die je hierna maakt; bestaande vragenlijsten pas je zelf aan.',
  },
  {
    naam: 'titel',
    label: 'Titel van het onderzoek',
    verplicht: true,
    max: 200,
    hulp: 'Bijvoorbeeld: Medewerkersonderzoek 2026.',
  },
  {
    naam: 'onderzoeksvraag',
    label: 'Onderzoeksvraag',
    type: 'textarea',
    rijen: 3,
    max: 2000,
    hulp: 'De vraag die je met dit onderzoek wilt beantwoorden, bijvoorbeeld: Hoe kunnen we het verzuim omlaag brengen? Respondenten zien dit niet.',
  },
  {
    naam: 'toelichting',
    label: 'Toelichting',
    type: 'textarea',
    rijen: 5,
    max: 5000,
    hulp: 'Aanleiding, afspraken met de opdrachtgever of andere achtergrond. Alleen voor jezelf; respondenten zien dit niet.',
  },
];

export async function toon(container, ctx) {
  const onderzoekId = ctx.params.id;
  const basis = `#/onderzoek/${onderzoekId}`;
  ctx.zetTitel(`Opzet – ${ctx.onderzoek.onderzoek.titel}`);

  const gegevensKaart = h('section', { class: 'kaart opzet-sectie', 'aria-labelledby': 'opzet-kop-gegevens' });
  const themasKaart = h('section', { class: 'kaart opzet-sectie', 'aria-labelledby': 'opzet-kop-themas' });
  const meetmomentenKaart = h('section', { class: 'kaart opzet-sectie', 'aria-labelledby': 'opzet-kop-meetmomenten' });
  const sjablonenKaart = h('section', { class: 'kaart opzet-sectie', 'aria-labelledby': 'opzet-kop-sjablonen' });
  const aankondiging = h('div', { class: 'sr-only', 'aria-live': 'polite' });

  let bezig = false; // voorkomt dubbele verzoeken bij snel achter elkaar verplaatsen

  // ================= Hulpjes =================

  /** Zet de focus op het eerste bestaande, bruikbare element met een van deze data-focus-sleutels. */
  function zetFocus(sleutels) {
    for (const s of sleutels) {
      const el = container.querySelector(`[data-focus="${s}"]`);
      if (el && !el.disabled) {
        el.focus();
        return;
      }
    }
  }

  /** Laat een (verplaatst of nieuw) item even oplichten. */
  function lichtOp(markeer) {
    const el = container.querySelector(`[data-markeer="${markeer}"]`);
    if (!el) return;
    el.classList.remove('opzet-oplichten');
    void el.offsetWidth; // animatie opnieuw starten
    el.classList.add('opzet-oplichten');
  }

  function kondigAan(tekst) {
    aankondiging.textContent = '';
    setTimeout(() => {
      aankondiging.textContent = tekst;
    }, 60);
  }

  /** Haalt het onderzoek opnieuw op en tekent thema's en meetmomenten opnieuw. */
  async function herlaad({ focus = null, markeer = null } = {}) {
    try {
      await ctx.herlaadOnderzoek();
    } catch (e) {
      meldFout(e);
      return false;
    }
    tekenThemas();
    tekenMeetmomenten();
    werkMeetmomentKeuzeBij();
    if (markeer) lichtOp(markeer);
    if (focus) zetFocus(focus);
    return true;
  }

  function kaartKop(id, titel, onderkop, knop = null) {
    return h('div', { class: 'kaart-kop' },
      h('div', {},
        h('h2', { id, tabindex: '-1', 'data-focus': id }, titel),
        onderkop ? h('p', { class: 'opzet-onderkop' }, onderkop) : null,
      ),
      knop,
    );
  }

  function verplaatsKnoppen({ soort, lijst, i, wat, naam, sleutelBasis }) {
    if (lijst.length < 2) return null;
    const knop = (richting, teken, woord) => h('button', {
      type: 'button',
      class: 'knop knop-klein knop-icoon opzet-verplaats-knop',
      'aria-label': `${wat} "${naam}" ${woord} verplaatsen`,
      title: `${woord[0].toUpperCase()}${woord.slice(1)} verplaatsen`,
      disabled: richting < 0 ? i === 0 : i === lijst.length - 1,
      'data-focus': `${sleutelBasis}-${woord}`,
      onclick: () => verplaats({ soort, lijst, i, richting, wat, naam, sleutelBasis }),
    }, h('span', { 'aria-hidden': 'true' }, teken));
    return h('span', { class: 'opzet-verplaats' }, knop(-1, '↑', 'omhoog'), knop(1, '↓', 'omlaag'));
  }

  async function verplaats({ soort, lijst, i, richting, wat, naam, sleutelBasis }) {
    if (bezig) return;
    const j = i + richting;
    if (j < 0 || j >= lijst.length) return;
    const ids = lijst.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    bezig = true;
    try {
      await api.post('/volgorde', { soort, ids });
      const eigen = richting < 0 ? 'omhoog' : 'omlaag';
      const ander = richting < 0 ? 'omlaag' : 'omhoog';
      if (await herlaad({ focus: [`${sleutelBasis}-${eigen}`, `${sleutelBasis}-${ander}`, sleutelBasis], markeer: sleutelBasis })) {
        kondigAan(`${wat} "${naam}" staat nu op plek ${j + 1} van ${lijst.length}.`);
      }
    } catch (e) {
      meldFout(e);
    } finally {
      bezig = false;
    }
  }

  // ================= 1. Gegevens van het onderzoek =================

  const opgeslagen = {};
  for (const v of GEGEVENS_VELDEN) opgeslagen[v.naam] = String(ctx.onderzoek.onderzoek[v.naam] ?? '').trim();
  const gegevensInvoer = {};
  let gegevensStatus = null;

  function leesGegevens() {
    const w = {};
    for (const v of GEGEVENS_VELDEN) w[v.naam] = gegevensInvoer[v.naam] ? gegevensInvoer[v.naam].value.trim() : opgeslagen[v.naam];
    return w;
  }

  function gegevensGewijzigd() {
    if (ctx.alleenLezen || !gegevensInvoer.titel || !gegevensInvoer.titel.isConnected) return false;
    const w = leesGegevens();
    return GEGEVENS_VELDEN.some((v) => w[v.naam] !== opgeslagen[v.naam]);
  }

  function werkGegevensStatusBij() {
    if (!gegevensStatus) return;
    const gewijzigd = gegevensGewijzigd();
    gegevensStatus.textContent = gewijzigd ? 'Je hebt wijzigingen die nog niet zijn opgeslagen.' : '';
    gegevensStatus.classList.toggle('opzet-niet-opgeslagen', gewijzigd);
  }

  function tekenGegevens() {
    const o = ctx.onderzoek.onderzoek;
    if (ctx.alleenLezen) {
      vervang(gegevensKaart,
        kaartKop('opzet-kop-gegevens', 'Gegevens van het onderzoek', 'De basisgegevens van dit onderzoek.'),
        h('dl', { class: 'opzet-gegevens-lijst' },
          GEGEVENS_VELDEN.map((v) => [
            h('dt', {}, v.label),
            h('dd', { class: o[v.naam] ? null : 'zacht' }, o[v.naam] || 'Niet ingevuld'),
          ]),
        ),
      );
      return;
    }

    const foutEl = h('div', { class: 'veld-fout', role: 'alert' });
    gegevensStatus = h('span', { class: 'opzet-opslaanstatus', 'aria-live': 'polite' });
    const knop = h('button', { type: 'submit', class: 'knop knop-primair' }, 'Gegevens opslaan');

    const veld = (v) => {
      const id = `opzet-${v.naam}`;
      const hulpId = `${id}-hulp`;
      const attrs = {
        id,
        name: v.naam,
        maxlength: v.max,
        required: !!v.verplicht,
        'aria-describedby': hulpId,
        oninput: (e) => {
          e.target.removeAttribute('aria-invalid');
          werkGegevensStatusBij();
        },
      };
      const el = v.type === 'textarea'
        ? h('textarea', { ...attrs, rows: v.rijen }, opgeslagen[v.naam])
        : h('input', { ...attrs, type: 'text', value: opgeslagen[v.naam], autocomplete: 'off' });
      gegevensInvoer[v.naam] = el;
      return h('div', { class: 'veld' },
        h('label', { for: id }, v.label, v.verplicht ? h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *') : null),
        el,
        h('div', { class: 'veld-hulp', id: hulpId }, v.hulp),
      );
    };

    async function slaOp(e) {
      e.preventDefault();
      foutEl.textContent = '';
      const w = leesGegevens();
      for (const v of GEGEVENS_VELDEN) {
        if (v.verplicht && !w[v.naam]) {
          foutEl.textContent = `Vul "${v.label}" in.`;
          gegevensInvoer[v.naam].setAttribute('aria-invalid', 'true');
          gegevensInvoer[v.naam].focus();
          return;
        }
      }
      knop.disabled = true;
      try {
        await api.put(`/onderzoeken/${onderzoekId}`, w);
        Object.assign(opgeslagen, w);
        meld('Gegevens van het onderzoek opgeslagen.', 'succes');
        ctx.navigeer(location.hash); // hele pagina opnieuw, zodat de kop de nieuwe titel toont
      } catch (err) {
        foutEl.textContent = err.message || 'Opslaan is mislukt.';
        knop.disabled = false;
      }
    }

    vervang(gegevensKaart,
      kaartKop('opzet-kop-gegevens', 'Gegevens van het onderzoek', 'De basisgegevens van dit onderzoek. Velden met * zijn verplicht.'),
      h('form', { class: 'opzet-gegevens-form', novalidate: true, onsubmit: slaOp },
        h('div', { class: 'formulier-rij' }, veld(GEGEVENS_VELDEN[0]), veld(GEGEVENS_VELDEN[1])),
        veld(GEGEVENS_VELDEN[2]),
        veld(GEGEVENS_VELDEN[3]),
        foutEl,
        h('div', { class: 'opzet-opslaanrij' }, knop, gegevensStatus),
      ),
    );
  }

  // Niet-opgeslagen gegevens: waarschuwen bij sluiten van het tabblad, automatisch bewaren bij naar een ander scherm gaan.
  const waarschuwBijSluiten = (e) => {
    if (gegevensGewijzigd()) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', waarschuwBijSluiten);
  ctx.bijVertrek(async () => {
    window.removeEventListener('beforeunload', waarschuwBijSluiten);
    if (!gegevensGewijzigd()) return;
    const w = leesGegevens();
    if (!w.bedrijfsnaam || !w.titel) {
      meld('Je wijzigingen in de gegevens van het onderzoek zijn niet opgeslagen: bedrijfsnaam en titel mogen niet leeg zijn.', 'fout');
      return;
    }
    try {
      await api.put(`/onderzoeken/${onderzoekId}`, w);
      Object.assign(opgeslagen, w);
      meld('Je wijzigingen in de gegevens van het onderzoek zijn opgeslagen.', 'succes');
    } catch (e) {
      meldFout(e);
    }
  });

  // ================= 2. Thema's en meetpunten =================

  function themaFormulier(t = null) {
    let nieuwId = null;
    const andere = ctx.onderzoek.themas.filter((x) => !t || x.id !== t.id);
    return formulierDialoog({
      titel: t ? 'Thema wijzigen' : 'Nieuw thema',
      knop: t ? 'Opslaan' : 'Toevoegen',
      intro: t ? null : 'Een thema is een onderwerp van je onderzoek, bijvoorbeeld Werkdruk of Leiderschap.',
      velden: [
        {
          naam: 'naam',
          label: 'Naam van het thema',
          verplicht: true,
          max: 150,
          waarde: t?.naam,
          placeholder: 'Bijvoorbeeld: Werkdruk',
          hulp: 'Respondenten zien deze naam als kopje boven de vragen van dit thema.',
        },
        {
          naam: 'omschrijving',
          label: 'Omschrijving',
          type: 'textarea',
          rijen: 3,
          max: 2000,
          waarde: t?.omschrijving,
          hulp: 'Waar gaat dit thema over? Respondenten zien dit niet.',
        },
      ],
      controle: (w) => (andere.some((x) => sleutel(x.naam) === sleutel(w.naam))
        ? `Er is al een thema met de naam "${w.naam}". Kies een andere naam.`
        : null),
      opslaan: async (w) => {
        if (t) await api.put(`/themas/${t.id}`, w);
        else nieuwId = (await api.post(`/onderzoeken/${onderzoekId}/themas`, w)).id;
      },
    }).then((w) => (w ? { ...w, id: t ? t.id : nieuwId } : null));
  }

  async function nieuwThema() {
    const w = await themaFormulier();
    if (!w) return;
    meld(`Thema "${w.naam}" toegevoegd.`, 'succes');
    await herlaad({ focus: [`thema-${w.id}`], markeer: `thema-${w.id}` });
  }

  async function wijzigThema(t) {
    const w = await themaFormulier(t);
    if (!w) return;
    meld('Thema opgeslagen.', 'succes');
    await herlaad({ focus: [`thema-${t.id}-wijzig`], markeer: `thema-${t.id}` });
  }

  async function verwijderThema(t, meldingEl) {
    vervang(meldingEl);
    const n = t.meetpunten.length;
    const tekst = [
      `Het thema "${t.naam}" wordt verwijderd${n ? `, samen met ${n === 1 ? 'het meetpunt' : `de ${n} meetpunten`} van dit thema` : ''}.`,
      'Dit kan alleen als er geen vragen en geen eigen invoer meer aan dit thema gekoppeld zijn.',
    ];
    if (!(await bevestig({ titel: 'Thema verwijderen?', tekst, knop: 'Verwijderen', gevaar: true }))) return;
    try {
      await api.del(`/themas/${t.id}`);
    } catch (e) {
      if (e.status === 409) {
        const m = melding([
          h('p', {}, e.message),
          h('p', {},
            'Je koppelt vragen aan een ander thema bij ',
            h('a', { href: `${basis}/vragenlijsten` }, 'Vragenlijsten'),
            ' en eigen invoer bij ',
            h('a', { href: `${basis}/invoer` }, 'Eigen invoer'),
            '.'),
        ], 'waarschuwing');
        m.setAttribute('role', 'alert');
        vervang(meldingEl, m);
      } else {
        meldFout(e);
      }
      return;
    }
    meld(`Thema "${t.naam}" verwijderd.`, 'succes');
    const lijst = ctx.onderzoek.themas;
    const plek = lijst.findIndex((x) => x.id === t.id);
    const buur = lijst[plek + 1] || lijst[plek - 1];
    await herlaad({ focus: buur ? [`thema-${buur.id}`, 'thema-nieuw'] : ['thema-nieuw'] });
  }

  function meetpuntFormulier(t, m = null) {
    let nieuwId = null;
    const andere = t.meetpunten.filter((x) => !m || x.id !== m.id);
    return formulierDialoog({
      titel: m ? 'Meetpunt wijzigen' : 'Nieuw meetpunt',
      knop: m ? 'Opslaan' : 'Toevoegen',
      intro: `Bij het thema "${t.naam}". Een meetpunt is iets wat je binnen dit thema meet, bijvoorbeeld Verzuimpercentage of Ervaren werkdruk.`,
      velden: [
        {
          naam: 'naam',
          label: 'Naam van het meetpunt',
          verplicht: true,
          max: 150,
          waarde: m?.naam,
          placeholder: 'Bijvoorbeeld: Ervaren werkdruk',
        },
        {
          naam: 'eenheid',
          label: 'Eenheid',
          max: 30,
          waarde: m?.eenheid,
          placeholder: 'Bijvoorbeeld: %, dagen of score 1–5',
          hulp: 'Waarin druk je dit meetpunt uit? Mag leeg blijven.',
        },
        {
          naam: 'omschrijving',
          label: 'Omschrijving',
          type: 'textarea',
          rijen: 3,
          max: 2000,
          waarde: m?.omschrijving,
          hulp: 'Bijvoorbeeld waar het cijfer vandaan komt of hoe je de score leest.',
        },
      ],
      controle: (w) => (andere.some((x) => sleutel(x.naam) === sleutel(w.naam))
        ? `Dit thema heeft al een meetpunt met de naam "${w.naam}". Kies een andere naam.`
        : null),
      opslaan: async (w) => {
        if (m) await api.put(`/meetpunten/${m.id}`, w);
        else nieuwId = (await api.post(`/themas/${t.id}/meetpunten`, w)).id;
      },
    }).then((w) => (w ? { ...w, id: m ? m.id : nieuwId } : null));
  }

  async function nieuwMeetpunt(t) {
    const w = await meetpuntFormulier(t);
    if (!w) return;
    meld(`Meetpunt "${w.naam}" toegevoegd.`, 'succes');
    await herlaad({ focus: [`meetpunt-${w.id}`], markeer: `meetpunt-${w.id}` });
  }

  async function wijzigMeetpunt(t, m) {
    const w = await meetpuntFormulier(t, m);
    if (!w) return;
    meld('Meetpunt opgeslagen.', 'succes');
    await herlaad({ focus: [`meetpunt-${m.id}-wijzig`], markeer: `meetpunt-${m.id}` });
  }

  async function verwijderMeetpunt(t, m) {
    const ok = await bevestig({
      titel: 'Meetpunt verwijderen?',
      tekst: [
        `Het meetpunt "${m.naam}" wordt verwijderd uit het thema "${t.naam}".`,
        'Vragen en eigen invoer die aan dit meetpunt gekoppeld zijn, blijven gewoon bestaan. Alleen de koppeling met dit meetpunt verdwijnt.',
      ],
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    try {
      await api.del(`/meetpunten/${m.id}`);
    } catch (e) {
      meldFout(e);
      return;
    }
    meld(`Meetpunt "${m.naam}" verwijderd.`, 'succes');
    await herlaad({ focus: [`thema-${t.id}-meetpunt-nieuw`, `thema-${t.id}`] });
  }

  function meetpuntItem(t, m, i) {
    return h('li', { class: 'lijst-item opzet-meetpunt', 'data-markeer': `meetpunt-${m.id}` },
      h('div', { class: 'lijst-item-hoofd' },
        h('div', { class: 'lijst-item-titel opzet-meetpunt-titel', tabindex: '-1', 'data-focus': `meetpunt-${m.id}` },
          h('span', {}, m.naam),
          m.eenheid ? h('span', { class: 'label opzet-eenheid' }, h('span', { class: 'sr-only' }, 'eenheid: '), m.eenheid) : null,
        ),
        m.omschrijving ? h('p', { class: 'opzet-omschrijving klein' }, m.omschrijving) : null,
      ),
      ctx.alleenLezen ? null : h('div', { class: 'lijst-item-acties opzet-acties' },
        verplaatsKnoppen({ soort: 'meetpunten', lijst: t.meetpunten, i, wat: 'Meetpunt', naam: m.naam, sleutelBasis: `meetpunt-${m.id}` }),
        h('button', {
          type: 'button',
          class: 'knop knop-klein',
          'aria-label': `Meetpunt "${m.naam}" wijzigen`,
          'data-focus': `meetpunt-${m.id}-wijzig`,
          onclick: () => wijzigMeetpunt(t, m),
        }, 'Wijzigen'),
        h('button', {
          type: 'button',
          class: 'knop knop-klein knop-licht',
          'aria-label': `Meetpunt "${m.naam}" verwijderen`,
          onclick: () => verwijderMeetpunt(t, m),
        }, 'Verwijderen'),
      ),
    );
  }

  function meetpuntenBlok(t) {
    const mps = t.meetpunten;
    return h('div', { class: 'opzet-meetpunten' },
      h('div', { class: 'opzet-meetpunten-kop' },
        h('h4', {}, mps.length ? `Meetpunten (${mps.length})` : 'Meetpunten'),
        ctx.alleenLezen ? null : h('button', {
          type: 'button',
          class: 'knop knop-klein',
          'aria-label': `Meetpunt toevoegen aan thema "${t.naam}"`,
          'data-focus': `thema-${t.id}-meetpunt-nieuw`,
          onclick: () => nieuwMeetpunt(t),
        }, '+ Meetpunt'),
      ),
      mps.length
        ? h('ul', { class: 'lijst opzet-meetpunt-lijst' }, mps.map((m, i) => meetpuntItem(t, m, i)))
        : h('p', { class: 'opzet-leeg-klein' }, ctx.alleenLezen
          ? 'Geen meetpunten bij dit thema.'
          : 'Nog geen meetpunten. Dat hoeft ook niet: je kunt vragen en eigen invoer ook alleen aan het thema koppelen.'),
    );
  }

  function themaItem(t, i, themas) {
    const meldingEl = h('div', { class: 'opzet-thema-melding' });
    const gebruik = `${aantal(t.aantal_vragen, 'vraag', 'vragen')} · eigen invoer: ${t.aantal_invoer.toLocaleString('nl-NL')}`;
    return h('li', { class: 'opzet-thema', 'data-markeer': `thema-${t.id}` },
      h('div', { class: 'opzet-thema-kop' },
        h('div', { class: 'opzet-thema-tekst' },
          h('h3', { tabindex: '-1', 'data-focus': `thema-${t.id}` },
            h('span', { class: 'opzet-nummer', 'aria-hidden': 'true' }, String(i + 1)),
            h('span', { class: 'opzet-thema-naam' }, t.naam),
          ),
          t.omschrijving ? h('p', { class: 'opzet-omschrijving' }, t.omschrijving) : null,
          h('p', { class: 'opzet-meta' }, gebruik),
        ),
        ctx.alleenLezen ? null : h('div', { class: 'opzet-acties' },
          verplaatsKnoppen({ soort: 'themas', lijst: themas, i, wat: 'Thema', naam: t.naam, sleutelBasis: `thema-${t.id}` }),
          h('button', {
            type: 'button',
            class: 'knop knop-klein',
            'aria-label': `Thema "${t.naam}" wijzigen`,
            'data-focus': `thema-${t.id}-wijzig`,
            onclick: () => wijzigThema(t),
          }, 'Wijzigen'),
          h('button', {
            type: 'button',
            class: 'knop knop-klein knop-licht',
            'aria-label': `Thema "${t.naam}" verwijderen`,
            onclick: () => verwijderThema(t, meldingEl),
          }, 'Verwijderen'),
        ),
      ),
      meldingEl,
      meetpuntenBlok(t),
    );
  }

  function tekenThemas() {
    const themas = ctx.onderzoek.themas;
    const aantalMeetpunten = themas.reduce((n, t) => n + t.meetpunten.length, 0);
    const kop = kaartKop('opzet-kop-themas', "Thema's en meetpunten",
      `${aantal(themas.length, 'thema', "thema's")} · ${aantal(aantalMeetpunten, 'meetpunt', 'meetpunten')}`,
      ctx.alleenLezen ? null : h('button', { type: 'button', class: 'knop knop-primair', 'data-focus': 'thema-nieuw', onclick: nieuwThema }, '+ Thema toevoegen'),
    );
    const uitleg = h('div', { class: 'opzet-begrippen' },
      h('dl', {},
        h('div', { class: 'opzet-begrip' },
          h('dt', {}, 'Thema'),
          h('dd', {}, 'Een onderwerp van je onderzoek, bijvoorbeeld Werkdruk.')),
        h('div', { class: 'opzet-begrip' },
          h('dt', {}, 'Meetpunt'),
          h('dd', {}, 'Iets wat je binnen een thema meet, bijvoorbeeld Verzuimpercentage of Ervaren werkdruk.')),
      ),
      h('p', {}, 'Vragen en eigen invoer koppel je aan een thema en eventueel aan een meetpunt. Zo zie je op het dashboard de resultaten per thema en per meetpunt.'),
    );

    let inhoud;
    if (!themas.length) {
      inhoud = ctx.alleenLezen
        ? leeg("Dit onderzoek heeft geen thema's.")
        : leeg("Er zijn nog geen thema's. Voeg je eerste thema toe, of voeg onderaan deze pagina een sjabloon toe met kant-en-klare thema's.",
          h('button', { type: 'button', class: 'knop knop-primair', onclick: nieuwThema }, 'Thema toevoegen'));
    } else {
      inhoud = h('ol', { class: 'opzet-themas' }, themas.map((t, i) => themaItem(t, i, themas)));
    }
    vervang(themasKaart, kop, uitleg, inhoud);
  }

  // ================= 3. Meetmomenten =================

  function meetmomentFormulier(mm = null) {
    let nieuwId = null;
    return formulierDialoog({
      titel: mm ? 'Meetmoment wijzigen' : 'Nieuw meetmoment',
      knop: mm ? 'Opslaan' : 'Toevoegen',
      intro: mm ? null : 'Een meetmoment is een ronde waarin je meet, bijvoorbeeld een nulmeting of een vervolgmeting na een half jaar.',
      velden: [
        {
          naam: 'naam',
          label: 'Naam',
          verplicht: true,
          max: 150,
          waarde: mm?.naam,
          placeholder: 'Bijvoorbeeld: Vervolgmeting',
        },
        {
          naam: 'datum',
          label: 'Datum',
          type: 'date',
          waarde: mm?.datum || '',
          hulp: 'Ongeveer wanneer je meet. Mag leeg blijven; meetmomenten zonder datum komen achteraan.',
        },
        {
          naam: 'omschrijving',
          label: 'Omschrijving',
          type: 'textarea',
          rijen: 3,
          max: 2000,
          waarde: mm?.omschrijving,
        },
      ],
      opslaan: async (w) => {
        if (mm) await api.put(`/meetmomenten/${mm.id}`, w);
        else nieuwId = (await api.post(`/onderzoeken/${onderzoekId}/meetmomenten`, w)).id;
      },
    }).then((w) => (w ? { ...w, id: mm ? mm.id : nieuwId } : null));
  }

  async function nieuwMeetmoment() {
    const w = await meetmomentFormulier();
    if (!w) return;
    meld(`Meetmoment "${w.naam}" toegevoegd.`, 'succes');
    await herlaad({ focus: [`meetmoment-${w.id}`], markeer: `meetmoment-${w.id}` });
  }

  async function wijzigMeetmoment(mm) {
    const w = await meetmomentFormulier(mm);
    if (!w) return;
    meld('Meetmoment opgeslagen.', 'succes');
    await herlaad({ focus: [`meetmoment-${mm.id}-wijzig`], markeer: `meetmoment-${mm.id}` });
  }

  async function verwijderMeetmoment(mm) {
    const n = mm.aantal_vragenlijsten;
    const ok = await bevestig({
      titel: 'Meetmoment verwijderen?',
      tekst: [
        `Het meetmoment "${mm.naam}" wordt verwijderd.`,
        `${n ? `Er ${n === 1 ? 'is' : 'zijn'} ${aantal(n, 'vragenlijst', 'vragenlijsten')} aan dit meetmoment gekoppeld. ` : ''}Vragenlijsten en eigen invoer blijven bestaan, maar zijn daarna niet meer aan dit meetmoment gekoppeld.`,
      ],
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    try {
      await api.del(`/meetmomenten/${mm.id}`);
    } catch (e) {
      meldFout(e);
      return;
    }
    meld(`Meetmoment "${mm.naam}" verwijderd.`, 'succes');
    await herlaad({ focus: ['meetmoment-nieuw', 'opzet-kop-meetmomenten'] });
  }

  function tekenMeetmomenten() {
    const mms = ctx.onderzoek.meetmomenten;
    const kop = kaartKop('opzet-kop-meetmomenten', 'Meetmomenten', aantal(mms.length, 'meetmoment', 'meetmomenten'),
      ctx.alleenLezen ? null : h('button', { type: 'button', class: 'knop knop-primair', 'data-focus': 'meetmoment-nieuw', onclick: nieuwMeetmoment }, '+ Meetmoment toevoegen'),
    );
    const uitleg = h('p', { class: 'opzet-uitleg' },
      'Een meetmoment is een ronde waarin je meet, bijvoorbeeld een nulmeting en later een vervolgmeting. ' +
      'Vragenlijsten en eigen invoer koppel je aan een meetmoment. Zo zie je op het dashboard hoe de resultaten zich in de tijd ontwikkelen.');

    let inhoud;
    if (!mms.length) {
      inhoud = ctx.alleenLezen
        ? leeg('Dit onderzoek heeft geen meetmomenten.')
        : leeg('Er zijn nog geen meetmomenten. Voeg bijvoorbeeld een nulmeting toe.',
          h('button', { type: 'button', class: 'knop knop-primair', onclick: nieuwMeetmoment }, 'Meetmoment toevoegen'));
    } else {
      inhoud = h('ol', { class: 'lijst opzet-tijdlijn' }, mms.map((mm) => h('li', { class: 'lijst-item opzet-meetmoment', 'data-markeer': `meetmoment-${mm.id}` },
        h('div', { class: 'lijst-item-hoofd' },
          h('div', { class: 'lijst-item-titel', tabindex: '-1', 'data-focus': `meetmoment-${mm.id}` }, mm.naam),
          h('div', { class: 'lijst-item-meta rij' },
            h('span', {}, mm.datum ? datum(mm.datum) : 'Nog geen datum'),
            h('span', { class: 'label' }, aantal(mm.aantal_vragenlijsten, 'vragenlijst', 'vragenlijsten')),
          ),
          mm.omschrijving ? h('p', { class: 'opzet-omschrijving klein' }, mm.omschrijving) : null,
        ),
        ctx.alleenLezen ? null : h('div', { class: 'lijst-item-acties opzet-acties' },
          h('button', {
            type: 'button',
            class: 'knop knop-klein',
            'aria-label': `Meetmoment "${mm.naam}" wijzigen`,
            'data-focus': `meetmoment-${mm.id}-wijzig`,
            onclick: () => wijzigMeetmoment(mm),
          }, 'Wijzigen'),
          h('button', {
            type: 'button',
            class: 'knop knop-klein knop-licht',
            'aria-label': `Meetmoment "${mm.naam}" verwijderen`,
            onclick: () => verwijderMeetmoment(mm),
          }, 'Verwijderen'),
        ),
      )));
    }
    vervang(meetmomentenKaart, kop, uitleg, inhoud);
  }

  // ================= 4. Sjablonen =================

  let sjablonen = [];
  let vragenlijsten = [];
  const sjabloonInhoud = new Map(); // cache van GET /sjablonen/<id>
  let sjabloonKeuze = null; // select in "Sjabloon toevoegen"
  let meetmomentKeuze = null; // select in "Sjabloon toevoegen"
  let vragenlijstKeuze = null; // select in "Opslaan als sjabloon"
  let vragenlijstVeld = null;
  let geenVragenlijstTekst = null;

  function samenvattingTekst(s) {
    const z = s.samenvatting || {};
    return [
      aantal(z.themas || 0, 'thema', "thema's"),
      aantal(z.meetpunten || 0, 'meetpunt', 'meetpunten'),
      aantal(z.vragen || 0, 'vraag', 'vragen'),
      aantal(z.acties || 0, 'actie', 'acties'),
    ];
  }

  function werkSjabloonKeuzeBij() {
    if (!sjabloonKeuze) return;
    const vorige = sjabloonKeuze.value;
    const groep = (label, lijst) => (lijst.length
      ? h('optgroup', { label }, lijst.map((s) => h('option', { value: s.id }, s.naam)))
      : null);
    vervang(sjabloonKeuze,
      h('option', { value: '' }, 'Kies een sjabloon…'),
      groep('Standaardsjablonen', sjablonen.filter((s) => s.standaard)),
      groep('Eigen sjablonen', sjablonen.filter((s) => !s.standaard)),
    );
    sjabloonKeuze.value = sjablonen.some((s) => s.id === vorige) ? vorige : '';
  }

  function werkMeetmomentKeuzeBij() {
    if (!meetmomentKeuze) return;
    const hadOpties = meetmomentKeuze.options.length > 0;
    const vorige = meetmomentKeuze.value;
    const mms = ctx.onderzoek.meetmomenten;
    vervang(meetmomentKeuze,
      mms.map((mm) => h('option', { value: String(mm.id) }, mm.datum ? `${mm.naam} (${datum(mm.datum)})` : mm.naam)),
      h('option', { value: '' }, 'Geen meetmoment'),
    );
    if (hadOpties && [...meetmomentKeuze.options].some((o) => o.value === vorige)) meetmomentKeuze.value = vorige;
  }

  function werkVragenlijstKeuzeBij() {
    if (!vragenlijstKeuze) return;
    const vorige = vragenlijstKeuze.value;
    vervang(vragenlijstKeuze, vragenlijsten.map((vl) => h('option', { value: String(vl.id) },
      `${vl.titel}${vl.meetmoment_naam ? ` – ${vl.meetmoment_naam}` : ''} (${aantal(vl.aantal_vragen, 'vraag', 'vragen')})`)));
    if ([...vragenlijstKeuze.options].some((o) => o.value === vorige)) vragenlijstKeuze.value = vorige;
    vragenlijstVeld.classList.toggle('verborgen', !vragenlijsten.length);
    geenVragenlijstTekst.classList.toggle('verborgen', vragenlijsten.length > 0);
  }

  async function haalSjabloonInhoud(id) {
    if (!sjabloonInhoud.has(id)) {
      const r = await api.get(`/sjablonen/${encodeURIComponent(id)}`);
      sjabloonInhoud.set(id, r.inhoud || {});
    }
    return sjabloonInhoud.get(id);
  }

  /** Welke thema's uit het sjabloon staan al in dit onderzoek (en worden dus samengevoegd)? */
  function samenvoegInfo(inhoud) {
    const bedrijf = ctx.onderzoek.onderzoek.bedrijfsnaam;
    const namen = (inhoud.themas || []).map((t) => String(t.naam || '').replaceAll('{bedrijf}', bedrijf));
    if (!namen.length) return "Dit sjabloon bevat geen thema's.";
    const bestaand = new Set(ctx.onderzoek.themas.map((t) => sleutel(t.naam)));
    const al = namen.filter((n) => bestaand.has(sleutel(n)));
    if (!al.length) return `Alle thema's uit dit sjabloon zijn nieuw voor dit onderzoek.`;
    const nieuw = namen.length - al.length;
    return [
      `Al in dit onderzoek, dus samengevoegd: ${al.join(', ')}. `,
      nieuw ? `Er ${nieuw === 1 ? 'komt' : 'komen'} ${aantal(nieuw, 'nieuw thema', "nieuwe thema's")} bij.` : "Er komen geen nieuwe thema's bij.",
    ];
  }

  function toepasBlok() {
    const blok = h('div', { class: 'opzet-blok' }, h('h3', {}, 'Sjabloon toevoegen aan dit onderzoek'));

    const info = h('div', { class: 'opzet-sjabloon-info verborgen', id: 'opzet-sjabloon-info', 'aria-live': 'polite' });
    sjabloonKeuze = h('select', { id: 'opzet-sjabloon-keuze', 'aria-describedby': 'opzet-sjabloon-info' });
    meetmomentKeuze = h('select', { id: 'opzet-sjabloon-meetmoment', 'aria-describedby': 'opzet-sjabloon-meetmoment-hulp' });
    const foutEl = h('div', { class: 'veld-fout', role: 'alert' });
    const resultaat = h('div', { class: 'opzet-resultaat' });
    const knop = h('button', { type: 'submit', class: 'knop knop-primair' }, 'Sjabloon toevoegen');

    async function toonInfo() {
      sjabloonKeuze.removeAttribute('aria-invalid');
      foutEl.textContent = '';
      const id = sjabloonKeuze.value;
      const s = sjablonen.find((x) => x.id === id);
      if (!s) {
        vervang(info);
        info.classList.add('verborgen');
        return;
      }
      const samenvoegEl = h('p', { class: 'klein zacht' }, "Even kijken welke thema's al in dit onderzoek staan…");
      vervang(info,
        s.omschrijving ? h('p', {}, s.omschrijving) : null,
        h('ul', { class: 'opzet-chips', 'aria-label': 'Inhoud van het sjabloon' }, samenvattingTekst(s).map((t) => h('li', { class: 'label' }, t))),
        samenvoegEl,
      );
      info.classList.remove('verborgen');
      try {
        const inhoud = await haalSjabloonInhoud(id);
        if (sjabloonKeuze.value !== id) return;
        vervang(samenvoegEl, samenvoegInfo(inhoud));
      } catch {
        samenvoegEl.remove();
      }
    }
    sjabloonKeuze.addEventListener('change', toonInfo);

    async function voegToe(e) {
      e.preventDefault();
      foutEl.textContent = '';
      const id = sjabloonKeuze.value;
      const s = sjablonen.find((x) => x.id === id);
      if (!s) {
        foutEl.textContent = 'Kies eerst een sjabloon.';
        sjabloonKeuze.setAttribute('aria-invalid', 'true');
        sjabloonKeuze.focus();
        return;
      }
      knop.disabled = true;
      knop.textContent = 'Bezig met toevoegen…';
      vervang(resultaat);
      try {
        const r = await api.post(`/onderzoeken/${onderzoekId}/sjabloon`, {
          sjabloon: id,
          meetmoment_id: meetmomentKeuze.value ? Number(meetmomentKeuze.value) : null,
        });
        meld(`Sjabloon "${s.naam}" toegevoegd.`, 'succes');
        await herlaad();
        try {
          vragenlijsten = (await api.get(`/onderzoeken/${onderzoekId}/vragenlijsten`)).vragenlijsten;
          werkVragenlijstKeuzeBij();
        } catch (e2) {
          meldFout(e2);
        }
        sjabloonKeuze.value = '';
        toonInfo();
        const link = r.vragenlijst_id
          ? h('a', { href: `${basis}/vragenlijsten/${r.vragenlijst_id}` }, 'Bekijk de nieuwe vragenlijst')
          : null;
        const kopTekst = h('strong', { tabindex: '-1' }, `Sjabloon "${s.naam}" is toegevoegd.`);
        vervang(resultaat, melding([
          h('p', {}, kopTekst, ' ', r.vragenlijst_id
            ? "De thema's, meetpunten en acties staan erbij en er is een nieuwe vragenlijst gemaakt. Die staat nog dicht: je opent hem zelf als hij klaar is."
            : "De thema's, meetpunten en acties staan erbij. Dit sjabloon had geen vragen, dus er is geen vragenlijst gemaakt."),
          link ? h('p', {}, link) : null,
        ], 'succes'));
        (link || kopTekst).focus();
      } catch (err) {
        foutEl.textContent = err.message || 'Toevoegen is mislukt.';
      } finally {
        knop.disabled = false;
        knop.textContent = 'Sjabloon toevoegen';
      }
    }

    werkSjabloonKeuzeBij();
    werkMeetmomentKeuzeBij();

    blok.append(
      h('p', { class: 'opzet-uitleg' },
        "Een sjabloon voegt in één keer thema's, meetpunten, één nieuwe vragenlijst en acties toe. " +
        "Thema's en meetpunten met dezelfde naam als hier al staan, worden samengevoegd in plaats van dubbel aangemaakt. " +
        'Acties die al op je lijst staan, worden overgeslagen. Wat er al in dit onderzoek staat, blijft gewoon staan.'),
      h('form', { novalidate: true, onsubmit: voegToe },
        h('div', { class: 'veld' },
          h('label', { for: 'opzet-sjabloon-keuze' }, 'Sjabloon'),
          sjabloonKeuze,
        ),
        info,
        h('div', { class: 'veld' },
          h('label', { for: 'opzet-sjabloon-meetmoment' }, 'Meetmoment voor de nieuwe vragenlijst'),
          meetmomentKeuze,
          h('div', { class: 'veld-hulp', id: 'opzet-sjabloon-meetmoment-hulp' },
            'De nieuwe vragenlijst wordt aan dit meetmoment gekoppeld. Staat het juiste meetmoment er niet tussen? Voeg het dan eerst toe bij Meetmomenten.'),
        ),
        foutEl,
        h('div', { class: 'knoppen' }, knop),
      ),
      resultaat,
    );
    return blok;
  }

  function opslaanBlok() {
    const bedrijf = ctx.onderzoek.onderzoek.bedrijfsnaam;
    const naamInvoer = h('input', {
      type: 'text',
      id: 'opzet-als-naam',
      maxlength: 150,
      autocomplete: 'off',
      required: true,
      placeholder: 'Bijvoorbeeld: Medewerkersonderzoek met verzuimcijfers',
    });
    const omschrijvingInvoer = h('textarea', { id: 'opzet-als-omschrijving', rows: 3, maxlength: 1000, 'aria-describedby': 'opzet-als-omschrijving-hulp' });
    vragenlijstKeuze = h('select', { id: 'opzet-als-vragenlijst', 'aria-describedby': 'opzet-als-vragenlijst-hulp' });
    vragenlijstVeld = h('div', { class: 'veld' },
      h('label', { for: 'opzet-als-vragenlijst' }, 'Welke vragenlijst gaat mee?'),
      vragenlijstKeuze,
      h('div', { class: 'veld-hulp', id: 'opzet-als-vragenlijst-hulp' }, 'De vragen uit deze vragenlijst komen in het sjabloon.'),
    );
    geenVragenlijstTekst = h('p', { class: 'opzet-leeg-klein' },
      "Dit onderzoek heeft nog geen vragenlijst. Het sjabloon bevat dan alleen de thema's, meetpunten en acties.");
    const foutEl = h('div', { class: 'veld-fout', role: 'alert' });
    const resultaat = h('div', { class: 'opzet-resultaat' });
    const knop = h('button', { type: 'submit', class: 'knop knop-primair' }, 'Opslaan als sjabloon');
    naamInvoer.addEventListener('input', () => naamInvoer.removeAttribute('aria-invalid'));

    async function slaOp(e) {
      e.preventDefault();
      foutEl.textContent = '';
      const naam = naamInvoer.value.trim();
      if (!naam) {
        foutEl.textContent = 'Vul "Naam van het sjabloon" in.';
        naamInvoer.setAttribute('aria-invalid', 'true');
        naamInvoer.focus();
        return;
      }
      knop.disabled = true;
      vervang(resultaat);
      try {
        await api.post(`/onderzoeken/${onderzoekId}/als-sjabloon`, {
          naam,
          omschrijving: omschrijvingInvoer.value.trim(),
          vragenlijst_id: vragenlijsten.length && vragenlijstKeuze.value ? Number(vragenlijstKeuze.value) : null,
        });
        meld(`Sjabloon "${naam}" opgeslagen.`, 'succes');
        naamInvoer.value = '';
        omschrijvingInvoer.value = '';
        const kopTekst = h('strong', { tabindex: '-1' }, `Sjabloon "${naam}" is opgeslagen.`);
        vervang(resultaat, melding([
          h('p', {}, kopTekst, ' Je kunt het voortaan kiezen als je een nieuw onderzoek start, of het toevoegen aan een bestaand onderzoek.'),
          h('p', {}, h('a', { href: '#/sjablonen' }, 'Bekijk al je sjablonen')),
        ], 'succes'));
        kopTekst.focus();
        try {
          sjablonen = (await api.get('/sjablonen')).sjablonen;
          werkSjabloonKeuzeBij();
        } catch {
          /* de lijst wordt bij de volgende keer laden bijgewerkt */
        }
      } catch (err) {
        foutEl.textContent = err.message || 'Opslaan is mislukt.';
      } finally {
        knop.disabled = false;
      }
    }

    werkVragenlijstKeuzeBij();

    return h('div', { class: 'opzet-blok' },
      h('h3', {}, 'Opslaan als sjabloon'),
      h('p', { class: 'opzet-uitleg' },
        'Bewaar de opzet van dit onderzoek als eigen sjabloon, zodat je hem bij een volgend bedrijf opnieuw kunt gebruiken. ' +
        "De thema's, meetpunten, acties en de vragen uit één vragenlijst gaan mee. Antwoorden, eigen invoer en stukken gaan niet mee."),
      h('p', { class: 'opzet-uitleg' },
        'Overal waar ', h('strong', {}, bedrijf), ' staat, komt een invulplek voor de bedrijfsnaam. ' +
        'Gebruik je het sjabloon later bij een ander bedrijf, dan staat daar vanzelf de naam van dat bedrijf.'),
      h('form', { novalidate: true, onsubmit: slaOp },
        h('div', { class: 'veld' },
          h('label', { for: 'opzet-als-naam' }, 'Naam van het sjabloon', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
          naamInvoer,
        ),
        h('div', { class: 'veld' },
          h('label', { for: 'opzet-als-omschrijving' }, 'Omschrijving'),
          omschrijvingInvoer,
          h('div', { class: 'veld-hulp', id: 'opzet-als-omschrijving-hulp' }, 'Waarvoor is dit sjabloon handig? Zie je terug bij het kiezen van een sjabloon.'),
        ),
        vragenlijstVeld,
        geenVragenlijstTekst,
        foutEl,
        h('div', { class: 'knoppen' }, knop),
      ),
      resultaat,
    );
  }

  const sjablonenKop = () => kaartKop('opzet-kop-sjablonen', 'Sjablonen',
    ctx.alleenLezen
      ? 'Bewaar de opzet van dit onderzoek voor een volgend onderzoek.'
      : 'Begin snel met een kant-en-klare opzet, of bewaar deze opzet voor een volgend onderzoek.');

  function tekenSjablonen() {
    if (ctx.alleenLezen) {
      // Gearchiveerd: niets meer toevoegen, wel de opzet bewaren voor een volgend onderzoek (wijzigt dit onderzoek niet).
      sjabloonKeuze = null;
      meetmomentKeuze = null;
      const blok = opslaanBlok();
      blok.classList.add('opzet-blok-smal');
      vervang(sjablonenKaart, sjablonenKop(), blok);
      return;
    }
    vervang(sjablonenKaart, sjablonenKop(), h('div', { class: 'raster-2 opzet-sjabloon-raster' }, toepasBlok(), opslaanBlok()));
  }

  // ================= Opbouw van de pagina =================

  const paginaNav = h('nav', { class: 'opzet-paginanav', 'aria-label': 'Onderdelen van de opzet' },
    h('span', { class: 'opzet-paginanav-label' }, 'Ga naar:'),
    [["Thema's en meetpunten", 'opzet-kop-themas'], ['Meetmomenten', 'opzet-kop-meetmomenten'], ['Sjablonen', 'opzet-kop-sjablonen']]
      .map(([tekst, id]) => h('button', {
        type: 'button',
        class: 'knop knop-klein knop-licht',
        onclick: () => {
          const doel = document.getElementById(id);
          if (!doel) return;
          doel.scrollIntoView({ block: 'start' });
          doel.focus({ preventScroll: true });
        },
      }, tekst)),
  );

  vervang(container, h('div', { class: 'opzet' }, paginaNav, gegevensKaart, themasKaart, meetmomentenKaart, sjablonenKaart, aankondiging));
  tekenGegevens();
  tekenThemas();
  tekenMeetmomenten();
  vervang(sjablonenKaart, sjablonenKop(), laden('Sjablonen laden…'));

  try {
    const [s, v] = await Promise.all([
      api.get('/sjablonen'),
      api.get(`/onderzoeken/${onderzoekId}/vragenlijsten`),
    ]);
    sjablonen = s.sjablonen || [];
    vragenlijsten = v.vragenlijsten || [];
    tekenSjablonen();
  } catch (e) {
    vervang(sjablonenKaart, sjablonenKop(), melding(['De sjablonen konden niet worden geladen. ', e.message || ''], 'gevaar'));
  }
}
