// De bronkiezer: de dialoog "Bron noemen" (D3 §3.3). Je kiest een bron uit de bronnen bij het onderzoek of uit de
// hele bibliotheek, kiest hoe je hem noemt en eventueel een pagina, en krijgt de code voor in de tekst terug,
// bijvoorbeeld [@bakker2017, p. 12]. Met "+ Nieuwe bron" voeg je ter plekke een bron toe (ook via "Plak een
// verwijzing"). Een gekozen bron die nog niet bij het onderzoek hoort, wordt stil gekoppeld.
// Gebruikt door de rapporteditor (pakket P6), door Rapport · Bronnen en voor vergelijkingswaarden (pakket P3).

import { api } from './api.js';
import { h, maakDialoog, uniekeId, meldFout, vertraag, aantal } from './ui.js';
import { BRONSOORTEN, apaInTekst, leesAuteur, legeBron, auteursRegel, zonderSterren } from './bibliotheek-regels.js';
import { zoek } from './bibliotheek-zoeken.js';
import { haalBibliotheek, bibliotheekGewijzigd } from './bibliotheek-data.js';
import { plakVerwijzing, bronMeta } from './bibliotheek-ui.js';

const MAX_TONEN = 30;

/** De code voor in de tekst: [@sleutel], [@sleutel, p. 12], @sleutel of @sleutel [p. 12]. */
export function codeVoor(citeersleutel, { vorm = 'haakjes', pagina = '' } = {}) {
  const p = String(pagina || '').trim().replace(/[\]\n;]/g, '');
  const pTekst = p ? (/^(?:p|pp)\.\s/.test(p) || !/^\d/.test(p) ? p : /[-–]/.test(p) ? `pp. ${p.replace(/\s*[-–]\s*/, '–')}` : `p. ${p}`) : '';
  if (vorm === 'zin') return pTekst ? `@${citeersleutel} [${pTekst}]` : `@${citeersleutel}`;
  return pTekst ? `[@${citeersleutel}, ${pTekst}]` : `[@${citeersleutel}]`;
}

/**
 * Opent de bronkiezer. → Promise<{ code, bron } | null>.
 * onderzoekId: dan is er een tab "Bij dit onderzoek" en wordt de gekozen bron gekoppeld.
 * metPagina, metVorm: de vragen "Pagina (optioneel)" en "Hoe noem je de bron?". knop: tekst op de knop.
 */
export function kiesBron({ onderzoekId = null, metPagina = true, metVorm = true, knop = 'Invoegen', titel = 'Bron noemen' } = {}) {
  return new Promise((klaar) => {
    let resultaat = null;
    let bib = null;
    let gekoppeld = [];
    let tab = onderzoekId ? 'onderzoek' : 'alles';
    let gekozen = null; // bron
    const groepNaam = uniekeId('bk-bron');

    const status = h('p', { class: 'klein zacht', role: 'status' }, 'De bibliotheek wordt geladen…');
    const zoekId = uniekeId('bk-zoek');
    const zoekVeld = h('input', { id: zoekId, type: 'search', autocomplete: 'off', placeholder: 'Bijvoorbeeld: werkdruk, verzuim, Bakker' });
    const lijst = h('div', { class: 'bk-lijst', role: 'radiogroup', 'aria-label': 'Bronnen' });
    const tabKnoppen = {};
    const tabRij = h('div', { class: 'bk-tabs', role: 'tablist', 'aria-label': 'Waar zoek je?' });
    const maakTab = (sleutel, tekst) => {
      const k = h('button', { type: 'button', role: 'tab', class: 'bk-tab', id: uniekeId('bk-tab'), 'aria-selected': 'false', onclick: () => kiesTab(sleutel) }, tekst);
      tabKnoppen[sleutel] = k;
      tabRij.append(k);
    };
    if (onderzoekId) maakTab('onderzoek', 'Bij dit onderzoek');
    maakTab('alles', 'Hele bibliotheek');
    const paneel = h('div', { role: 'tabpanel', class: 'bk-paneel' },
      h('div', { class: 'veld' }, h('label', { for: zoekId }, 'Zoeken'), zoekVeld), status, lijst);

    const vormNaam = uniekeId('bk-vorm');
    const vormHaakjes = h('input', { type: 'radio', name: vormNaam, value: 'haakjes', checked: true });
    const vormZin = h('input', { type: 'radio', name: vormNaam, value: 'zin' });
    const haakjesTekst = h('span', {}, 'Tussen haakjes');
    const zinTekst = h('span', {}, 'In de zin');
    const paginaId = uniekeId('bk-pagina');
    const paginaVeld = h('input', { id: paginaId, type: 'text', maxlength: 40, autocomplete: 'off', inputmode: 'text', placeholder: 'Bijv. 12 of 12-14' });
    const voorbeeld = h('p', { class: 'bk-voorbeeld', 'aria-live': 'polite' });
    const keuzes = h('div', { class: 'bk-keuzes' },
      metVorm ? h('fieldset', { class: 'veld bk-vorm' }, h('legend', {}, 'Hoe noem je de bron?'),
        h('label', { class: 'keuze' }, vormHaakjes, haakjesTekst),
        h('label', { class: 'keuze' }, vormZin, zinTekst)) : null,
      metPagina ? h('div', { class: 'veld' }, h('label', { for: paginaId }, 'Pagina (optioneel)'), paginaVeld) : null,
      voorbeeld);

    const nieuwKnop = h('button', { type: 'button', class: 'knop knop-licht knop-klein', onclick: () => toonNieuw() }, '+ Nieuwe bron');
    const kiesHier = h('div', {}, tabRij, paneel, h('div', { class: 'knoppen' }, nieuwKnop));
    const nieuwHier = h('div', { hidden: true });
    const fout = h('div', { class: 'veld-fout', role: 'alert' });
    const ok = h('button', { type: 'button', class: 'knop knop-primair', disabled: true }, knop);
    const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
    const d = maakDialoog(titel, [kiesHier, nieuwHier, keuzes, fout], [annuleer, ok]);
    d.classList.add('bb-dialoog', 'bk-dialoog');

    function kiesTab(sleutel) {
      tab = sleutel;
      for (const [k, el] of Object.entries(tabKnoppen)) el.setAttribute('aria-selected', String(k === sleutel));
      paneel.setAttribute('aria-labelledby', tabKnoppen[sleutel].id);
      toonLijst();
    }

    function bronnenVanTab() {
      if (!bib) return [];
      if (tab === 'onderzoek') {
        const ids = new Set(gekoppeld.map((b) => b.id));
        return bib.bronnen.filter((b) => ids.has(b.id));
      }
      return bib.bronnen;
    }

    function toonLijst() {
      if (!bib) return;
      const r = zoek(bronnenVanTab(), { tekst: zoekVeld.value, filters: { metVerborgen: tab === 'onderzoek' }, sortering: zoekVeld.value.trim() ? 'relevantie' : 'auteur' });
      lijst.replaceChildren();
      if (!r.totaal) {
        status.textContent = tab === 'onderzoek' && !gekoppeld.length
          ? 'Er zijn nog geen bronnen aan dit onderzoek gekoppeld. Kies "Hele bibliotheek".'
          : 'Geen bronnen gevonden. Probeer een ander woord.';
        return;
      }
      status.textContent = `${aantal(r.totaal, 'bron', 'bronnen')}${r.totaal > MAX_TONEN ? `; de eerste ${MAX_TONEN} staan hieronder. Zoek verder om te verfijnen.` : ''}`;
      for (const { bron } of r.treffers.slice(0, MAX_TONEN)) {
        const radio = h('input', { type: 'radio', name: groepNaam, value: String(bron.id), checked: gekozen?.id === bron.id });
        radio.addEventListener('change', () => kies(bron));
        lijst.append(h('label', { class: 'keuze bk-keuze' }, radio,
          h('span', {}, h('span', { class: 'bk-titel' }, zonderSterren(bron.titel)),
            h('span', { class: 'bk-meta klein zacht' }, [auteursRegel(bron), bronMeta(bron)].filter(Boolean).join(' · ')))));
      }
    }

    function code() {
      return gekozen ? codeVoor(gekozen.citeersleutel, { vorm: vormZin.checked ? 'zin' : 'haakjes', pagina: metPagina ? paginaVeld.value : '' }) : '';
    }

    function werkBij() {
      ok.disabled = !gekozen;
      if (!gekozen) {
        voorbeeld.textContent = 'Kies een bron.';
        haakjesTekst.textContent = 'Tussen haakjes';
        zinTekst.textContent = 'In de zin';
        return;
      }
      haakjesTekst.textContent = `Tussen haakjes: ${apaInTekst([{ bron: gekozen }], { eersteKeer: new Set([gekozen.citeersleutel]) })}`;
      zinTekst.textContent = `In de zin: ${apaInTekst([{ bron: gekozen }], { verhalend: true, eersteKeer: new Set([gekozen.citeersleutel]) })}`;
      const p = metPagina ? paginaVeld.value : '';
      const pagina = p.trim() ? p.trim().replace(/[\]\n;]/g, '') : '';
      const weergave = apaInTekst([{ bron: gekozen, pagina }], { verhalend: vormZin.checked, eersteKeer: new Set([gekozen.citeersleutel]) });
      voorbeeld.textContent = `In je tekst komt: ${code()}. In het rapport wordt dat: ${weergave}.`;
    }

    function kies(bron) {
      gekozen = bron;
      fout.textContent = '';
      werkBij();
    }

    // ---------- Nieuwe bron (kort formulier) ----------

    function toonNieuw() {
      const ids = {};
      const veld = (naam, label, el, hulp = null) => {
        ids[naam] = el;
        el.id = uniekeId(`bk-${naam}`);
        return h('div', { class: 'veld' }, h('label', { for: el.id }, label), el, hulp ? h('div', { class: 'veld-hulp' }, hulp) : null);
      };
      const soort = h('select', {}, Object.entries(BRONSOORTEN).map(([k, l]) => h('option', { value: k, selected: k === 'rapport' }, l)));
      const titelVeld = h('input', { type: 'text', maxlength: 500 });
      const auteurs = h('input', { type: 'text', maxlength: 2000, placeholder: 'Bakker, A. B.; Demerouti, E.' });
      const org = h('input', { type: 'text', maxlength: 300 });
      const jaar = h('input', { type: 'text', inputmode: 'numeric', maxlength: 4 });
      const link = h('input', { type: 'text', maxlength: 1000, placeholder: 'https://… of 10.1037/…' });
      let geplakt = null;
      const plak = plakVerwijzing((r) => {
        geplakt = r.bron;
        soort.value = r.bron.soort;
        titelVeld.value = r.bron.titel;
        auteurs.value = r.bron.auteurs.map((a) => `${a.tussenvoegsel ? `${a.tussenvoegsel} ` : ''}${a.achternaam}, ${a.voorletters}`).join('; ');
        org.value = r.bron.organisatie;
        jaar.value = Number.isInteger(r.bron.jaar) ? String(r.bron.jaar) : '';
        link.value = r.bron.doi || r.bron.url;
      }, { open: true });
      const opslaan = h('button', { type: 'button', class: 'knop knop-primair knop-klein' }, 'Opslaan en kiezen');
      const terug = h('button', { type: 'button', class: 'knop knop-klein' }, 'Terug naar zoeken');
      nieuwHier.replaceChildren(
        h('h3', { class: 'bk-kop' }, 'Nieuwe bron'),
        plak,
        veld('soort', 'Soort bron', soort),
        veld('titel', 'Titel', titelVeld),
        veld('auteurs', 'Auteurs', auteurs, 'Gescheiden door een puntkomma. Is een organisatie de auteur? Laat dit leeg en vul de organisatie in.'),
        veld('org', 'Organisatie of uitgever', org),
        veld('jaar', 'Jaar', jaar, 'Leeg laten als er geen datum is (z.d.).'),
        veld('link', 'Link (URL) of DOI', link),
        h('p', { class: 'klein zacht' }, 'Meer gegevens (samenvatting, onderwerpen) vul je later aan in de bibliotheek.'),
        h('div', { class: 'knoppen' }, terug, opslaan));
      kiesHier.hidden = true;
      keuzes.hidden = true;
      nieuwHier.hidden = false;
      ok.hidden = true;
      titelVeld.focus();
      terug.addEventListener('click', () => {
        nieuwHier.hidden = true;
        kiesHier.hidden = false;
        keuzes.hidden = false;
        ok.hidden = false;
        zoekVeld.focus();
      });
      opslaan.addEventListener('click', async () => {
        fout.textContent = '';
        const bron = { ...legeBron(soort.value), ...(geplakt && geplakt.soort === soort.value ? { details: geplakt.details, taal: geplakt.taal } : {}) };
        bron.titel = titelVeld.value.trim();
        bron.auteurs = auteurs.value.split(';').map(leesAuteur).filter((a) => a && a.achternaam);
        const orgUitAuteurs = auteurs.value.split(';').map(leesAuteur).find((a) => a && a.organisatie);
        bron.organisatie = org.value.trim() || orgUitAuteurs?.organisatie || '';
        bron.jaar = jaar.value.trim() ? Number(jaar.value.trim()) : null;
        const l = link.value.trim();
        if (/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?10\.\d{4,9}\//i.test(l)) bron.doi = l;
        else bron.url = l;
        if (!bron.titel) {
          fout.textContent = 'Vul de titel van de bron in.';
          titelVeld.focus();
          return;
        }
        opslaan.disabled = true;
        try {
          const r = await api.post('/bibliotheek', { bron });
          bibliotheekGewijzigd();
          bib = await haalBibliotheek();
          const nieuw = bib.perId.get(r.id);
          terug.click();
          kiesTab('alles');
          zoekVeld.value = '';
          kies(nieuw);
          toonLijst();
          status.textContent = `Toegevoegd: ${zonderSterren(nieuw.titel)} (code [@${nieuw.citeersleutel}]).`;
        } catch (e) {
          fout.textContent = e.message;
        } finally {
          opslaan.disabled = false;
        }
      });
    }

    // ---------- Gebeurtenissen ----------

    zoekVeld.addEventListener('input', vertraag(toonLijst, 150));
    vormHaakjes.addEventListener('change', werkBij);
    vormZin.addEventListener('change', werkBij);
    paginaVeld.addEventListener('input', werkBij);
    annuleer.addEventListener('click', () => d.close());
    ok.addEventListener('click', async () => {
      if (!gekozen) return;
      ok.disabled = true;
      if (onderzoekId && !gekoppeld.some((b) => b.id === gekozen.id)) {
        try {
          await api.put(`/onderzoeken/${onderzoekId}/bronnen/${gekozen.id}`, {});
          bibliotheekGewijzigd();
        } catch (e) {
          if (e.status !== 409) {
            ok.disabled = false;
            fout.textContent = e.message;
            return;
          }
        }
      }
      resultaat = { code: code(), bron: gekozen };
      d.close();
    });
    d.addEventListener('close', () => klaar(resultaat));
    d.showModal();
    werkBij();
    zoekVeld.focus();

    (async () => {
      try {
        const [b, g] = await Promise.all([
          haalBibliotheek(),
          onderzoekId ? api.get(`/onderzoeken/${onderzoekId}/bronnen`) : Promise.resolve({ bronnen: [] }),
        ]);
        bib = b;
        gekoppeld = g.bronnen;
        if (tabKnoppen.onderzoek) tabKnoppen.onderzoek.textContent = `Bij dit onderzoek (${gekoppeld.length})`;
        kiesTab(onderzoekId && gekoppeld.length ? 'onderzoek' : 'alles');
      } catch (e) {
        status.textContent = '';
        fout.textContent = e.message;
        meldFout(e);
      }
    })();
  });
}
