// Scherm: één sjabloon bewerken (#/sjablonen/<id>) of een nieuw sjabloon maken (#/sjablonen/nieuw).
// Naam, omschrijving en de volledige inhoud (via de gedeelde editor). Er wordt pas iets bewaard
// als je op Opslaan klikt. Verlaat je het scherm met wijzigingen, dan vraagt de app wat je wilt.

import { api } from '../api.js';
import { h, vervang, melding, meld, meldFout, bevestig, maakDialoog } from '../ui.js';
import { maakSjabloonEditor, legeInhoud, kladblok } from '../sjabloon-editor.js';
import { sjabloonLabels, zetVoorkeuze, neemVoorkeuze } from './sjablonen.js';

export async function toon(container, ctx) {
  const isNieuw = ctx.params.sjabloonId === 'nieuw';
  const kruimel = h('div', { class: 'kruimel' }, h('a', { href: '#/sjablonen' }, '← Alle sjablonen'));
  ctx.zetTitel(isNieuw ? 'Nieuw sjabloon' : 'Sjabloon bewerken');

  let sjabloon;
  if (isNieuw) {
    sjabloon = { id: null, naam: '', omschrijving: '', standaard: false, gewijzigd: false, herstelbaar: false, inhoud: legeInhoud() };
  } else {
    try {
      sjabloon = await api.get(`/sjablonen/${encodeURIComponent(ctx.params.sjabloonId)}`);
    } catch (e) {
      if (e.status === 401) throw e;
      vervang(container, kruimel, melding([
        h('strong', {}, 'Dit sjabloon kon niet worden geladen. '), e.message || '',
      ], 'gevaar'));
      return;
    }
  }

  // Werk dat je bij het verlaten van dit scherm niet had opgeslagen, staat nog even in het kladblok.
  // Het kladblok wordt pas gewist als je opslaat of de wijzigingen weggooit.
  const kladVan = () => kladblok(`sjabloon-${sjabloon.id === null ? 'nieuw' : sjabloon.id}`);
  const concept = kladVan().lees();
  let hersteld = !!(concept && concept.inhoud);
  let opgeslagen = { naam: sjabloon.naam, omschrijving: sjabloon.omschrijving };
  let bezig = false;
  let weg = false; // verwijderd of teruggezet: niets meer bewaken

  ctx.zetTitel(isNieuw ? 'Nieuw sjabloon' : `${sjabloon.naam} – Sjablonen`);

  // ---------- Onderdelen ----------

  const kopEl = h('div', { class: 'paginakop sjb-kop' });
  const bannerEl = h('div', {});
  const naamVeld = h('input', {
    type: 'text', id: 'sjb-naam', maxlength: 150, autocomplete: 'off', 'aria-required': 'true', 'aria-describedby': 'sjb-naam-fout',
    placeholder: 'Bijvoorbeeld: Medewerkersonderzoek met verzuimcijfers',
  });
  const naamFout = h('div', { class: 'veld-fout', id: 'sjb-naam-fout' });
  const omsVeld = h('textarea', { id: 'sjb-oms', rows: 2, maxlength: 1000, 'aria-describedby': 'sjb-oms-hulp' });
  naamVeld.value = hersteld ? String(concept.naam ?? sjabloon.naam) : sjabloon.naam;
  omsVeld.value = hersteld ? String(concept.omschrijving ?? sjabloon.omschrijving) : sjabloon.omschrijving;

  const statusEl = h('p', { class: 'sjb-status', role: 'status' });
  const foutEl = h('div', { class: 'sjb-fout' });
  const opslaanKnop = h('button', { type: 'button', class: 'knop knop-primair', onclick: () => slaOp() }, 'Opslaan');

  const editor = maakSjabloonEditor({
    inhoud: hersteld ? concept.inhoud : sjabloon.inhoud,
    instellingen: ctx.instellingen,
    opWijziging: werkStatusBij,
    kopNiveau: 2,
  });

  const isVuil = () => !weg && (hersteld || editor.isGewijzigd()
    || naamVeld.value.trim() !== opgeslagen.naam || omsVeld.value.trim() !== opgeslagen.omschrijving);

  function werkStatusBij() {
    const vuil = isVuil();
    statusEl.textContent = vuil
      ? 'Je hebt wijzigingen die nog niet zijn opgeslagen.'
      : sjabloon.id === null ? 'Nog niets ingevuld.' : 'Alles is opgeslagen.';
    statusEl.classList.toggle('sjb-status-vuil', vuil);
    opslaanKnop.disabled = bezig || (!vuil && sjabloon.id !== null);
  }

  function toonFout(tekst) {
    vervang(foutEl, tekst ? melding([h('strong', {}, 'Nog niet opgeslagen. '), tekst], 'gevaar') : null);
  }

  for (const el of [naamVeld, omsVeld]) {
    el.addEventListener('input', () => {
      if (el === naamVeld) {
        naamVeld.removeAttribute('aria-invalid');
        naamFout.textContent = '';
      }
      werkStatusBij();
    });
  }

  function tekenKop() {
    const acties = [];
    if (sjabloon.id !== null) {
      acties.push(h('button', { type: 'button', class: 'knop', onclick: gebruik }, 'Gebruiken voor nieuw onderzoek'));
      if (sjabloon.herstelbaar && sjabloon.gewijzigd) {
        acties.push(h('button', { type: 'button', class: 'knop', onclick: herstelOrigineel }, 'Herstel origineel'));
      }
      acties.push(h('button', { type: 'button', class: 'knop knop-licht sjb-knop-gevaar', onclick: verwijder }, 'Verwijderen'));
    }
    vervang(kopEl,
      h('div', { class: 'sjb-kop-hoofd' },
        h('h1', {}, sjabloon.id === null ? 'Nieuw sjabloon' : (opgeslagen.naam || 'Sjabloon')),
        h('div', { class: 'rij sjb-kop-labels' },
          sjabloon.id === null ? h('span', { class: 'label' }, 'Nog niet opgeslagen') : sjabloonLabels(sjabloon)),
      ),
      acties.length ? h('div', { class: 'knoppen sjb-kop-acties' }, acties) : null,
    );
  }

  function tekenBanner() {
    const blokken = [];
    if (hersteld) {
      blokken.push(melding([
        h('p', {}, h('strong', {}, 'Je wijzigingen van zojuist staan er nog. '),
          concept.fout
            ? `Ze zijn nog niet opgeslagen: ${concept.fout}`
            : 'Ze zijn nog niet opgeslagen. Klik op Opslaan om ze te bewaren.'),
        h('p', {}, h('button', {
          type: 'button',
          class: 'knop knop-klein',
          onclick: async () => {
            if (!(await bevestig({
              titel: 'Wijzigingen weggooien?',
              tekst: 'Alles wat je sinds de laatste keer opslaan hebt veranderd, gaat verloren.',
              knop: 'Weggooien',
              gevaar: true,
            }))) return;
            weg = true;
            kladVan().wis();
            ctx.navigeer(location.hash);
          },
        }, 'Wijzigingen weggooien')),
      ], 'waarschuwing'));
    } else if (sjabloon.id === null) {
      blokken.push(melding('Geef het sjabloon een naam en vul de inhoud. Het sjabloon wordt pas bewaard als je op Opslaan klikt.'));
    } else if (sjabloon.standaard) {
      blokken.push(melding(sjabloon.gewijzigd
        ? 'Dit is een standaardsjabloon dat je hebt aangepast. Met "Herstel origineel" zet je de oorspronkelijke versie terug.'
        : 'Dit is een standaardsjabloon. Je kunt het vrij aanpassen; de oorspronkelijke versie kun je altijd terugzetten.'));
    }
    vervang(bannerEl, blokken);
  }

  // ---------- Acties ----------

  /**
   * Bewaart het sjabloon. Geeft null als het gelukt is, anders de foutmelding.
   * stil = bij het verlaten van het scherm: geen meldingen in beeld en het adres niet aanpassen.
   */
  async function slaOp({ stil = false } = {}) {
    if (bezig) return 'Het opslaan is al bezig.';
    toonFout('');
    const naam = naamVeld.value.trim();
    if (!naam) {
      const tekst = 'Geef het sjabloon een naam.';
      naamVeld.setAttribute('aria-invalid', 'true');
      naamFout.textContent = tekst;
      if (!stil) {
        naamVeld.scrollIntoView({ block: 'center' });
        naamVeld.focus({ preventScroll: true });
      }
      return tekst;
    }
    const fout = editor.valideer();
    if (fout) {
      if (!stil) {
        toonFout(fout);
        editor.naarFout();
      }
      return fout;
    }
    const body = { naam, omschrijving: omsVeld.value.trim(), inhoud: editor.waarde() };
    bezig = true;
    opslaanKnop.disabled = true;
    opslaanKnop.textContent = 'Bezig met opslaan…';
    try {
      if (sjabloon.id === null) {
        const r = await api.post('/sjablonen', body);
        kladVan().wis(); // het kladblok van "nieuw sjabloon"
        sjabloon.id = r.id;
        // Het adres bijwerken zonder het scherm opnieuw op te bouwen.
        if (!stil) history.replaceState(null, '', `#/sjablonen/${r.id}`);
      } else {
        const r = await api.put(`/sjablonen/${sjabloon.id}`, body);
        Object.assign(sjabloon, { standaard: !!r.standaard, gewijzigd: !!r.gewijzigd, herstelbaar: !!r.herstelbaar });
      }
      opgeslagen = { naam: body.naam, omschrijving: body.omschrijving };
      kladVan().wis();
      hersteld = false;
      editor.markeerOpgeslagen();
      ctx.zetTitel(`${body.naam} – Sjablonen`);
      tekenKop();
      tekenBanner();
      if (!stil) meld('Sjabloon opgeslagen.', 'succes');
      return null;
    } catch (e) {
      const tekst = e.message || 'Opslaan is mislukt.';
      if (!stil && e.status !== 401) toonFout(tekst);
      return tekst;
    } finally {
      bezig = false;
      opslaanKnop.textContent = 'Opslaan';
      werkStatusBij();
    }
  }

  function gebruik() {
    zetVoorkeuze(sjabloon.id);
    ctx.navigeer('#/nieuw'); // bij niet-opgeslagen wijzigingen vraagt het scherm eerst wat je wilt
  }

  async function herstelOrigineel() {
    const ok = await bevestig({
      titel: 'Origineel herstellen?',
      tekst: [
        'Dit sjabloon wordt teruggezet naar de oorspronkelijke versie. Alles wat je eraan hebt veranderd, gaat verloren (ook wat je nu nog niet hebt opgeslagen).',
        'Wil je jouw versie bewaren? Maak dan eerst een kopie in het overzicht.',
      ],
      knop: 'Origineel herstellen',
      gevaar: true,
    });
    if (!ok) return;
    try {
      await api.post(`/sjablonen/${sjabloon.id}/origineel`, {});
      weg = true;
      kladVan().wis();
      meld('Het originele sjabloon is teruggezet.', 'succes');
      ctx.navigeer(`#/sjablonen/${sjabloon.id}`);
    } catch (e) {
      meldFout(e);
    }
  }

  async function verwijder() {
    const ok = await bevestig({
      titel: 'Sjabloon verwijderen?',
      tekst: [
        `"${opgeslagen.naam}" wordt verwijderd.`,
        sjabloon.herstelbaar
          ? 'Dit is een standaardsjabloon. Je kunt het later terugzetten met "Standaardsjablonen terugzetten"; je eigen aanpassingen zijn dan wel weg.'
          : 'Dit kun je niet ongedaan maken.',
        'Onderzoeken die je al met dit sjabloon hebt gemaakt, blijven gewoon bestaan.',
      ],
      knop: 'Verwijderen',
      gevaar: true,
    });
    if (!ok) return;
    try {
      await api.del(`/sjablonen/${sjabloon.id}`);
      weg = true;
      kladVan().wis();
      meld('Sjabloon verwijderd.');
      ctx.navigeer('#/sjablonen');
    } catch (e) {
      meldFout(e);
    }
  }

  // ---------- Bewaken van niet-opgeslagen wijzigingen ----------

  const bijSluiten = (e) => {
    if (!isVuil()) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', bijSluiten);

  /** Vraagt wat er met de wijzigingen moet gebeuren: 'opslaan', 'weggooien' of 'terug'. */
  function vraagBijVertrek() {
    return new Promise((klaar) => {
      let keuze = 'terug';
      const knop = (tekst, waarde, klasse = '') => h('button', {
        type: 'button',
        class: `knop ${klasse}`,
        onclick: () => {
          keuze = waarde;
          d.close();
        },
      }, tekst);
      const opslaan = knop('Opslaan', 'opslaan', 'knop-primair');
      const d = maakDialoog('Wijzigingen opslaan?',
        h('p', {}, `Je hebt wijzigingen in ${sjabloon.id === null ? 'dit nieuwe sjabloon' : `het sjabloon "${opgeslagen.naam}"`} die nog niet zijn opgeslagen.`),
        [knop('Verder bewerken', 'terug'), knop('Niet opslaan', 'weggooien', 'sjb-knop-gevaar'), opslaan]);
      d.addEventListener('close', () => klaar(keuze)); // Escape = verder bewerken
      d.showModal();
      opslaan.focus();
    });
  }

  ctx.bijVertrek(async () => {
    window.removeEventListener('beforeunload', bijSluiten);
    editor.sluit();
    if (!isVuil()) return;
    let keuze = await vraagBijVertrek();
    let fout = null;
    if (keuze === 'opslaan') {
      fout = await slaOp({ stil: true });
      if (!fout) {
        meld('Sjabloon opgeslagen.', 'succes');
        return;
      }
      keuze = 'terug'; // opslaan lukte niet: terug naar het sjabloon, met de wijzigingen erbij
    }
    if (keuze !== 'terug') {
      kladVan().wis(); // niet opslaan: de wijzigingen zijn weg
      return;
    }
    neemVoorkeuze(); // je blijft hier: een keuze voor "Gebruiken voor nieuw onderzoek" vervalt
    const terug = `#/sjablonen/${sjabloon.id === null ? 'nieuw' : sjabloon.id}`;
    const bewaard = kladVan().bewaar({
      naam: naamVeld.value,
      omschrijving: omsVeld.value,
      inhoud: editor.waarde(),
      fout,
    });
    if (!bewaard) {
      meld('Je wijzigingen konden niet worden vastgehouden en zijn niet opgeslagen.', 'fout');
      return;
    }
    if (fout) meld('Opslaan is niet gelukt. Je bent terug bij het sjabloon; je wijzigingen staan er nog.', 'fout');
    // Terug naar dit scherm: het adres herstellen en het scherm opnieuw opbouwen (met het kladblok).
    history.replaceState(null, '', terug);
    ctx.navigeer(terug);
  });

  // ---------- Opbouw ----------

  tekenKop();
  tekenBanner();
  werkStatusBij();

  vervang(container,
    h('div', { class: 'sjb' },
      kruimel,
      kopEl,
      bannerEl,
      h('section', { class: 'kaart', 'aria-labelledby': 'sjb-kop-gegevens' },
        h('h2', { id: 'sjb-kop-gegevens' }, 'Naam en omschrijving'),
        h('div', { class: 'veld' },
          h('label', { for: 'sjb-naam' }, 'Naam van het sjabloon', h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *')),
          naamVeld,
          naamFout),
        h('div', { class: 'veld sjb-laatste-veld' },
          h('label', { for: 'sjb-oms' }, 'Omschrijving'),
          omsVeld,
          h('div', { class: 'veld-hulp', id: 'sjb-oms-hulp' }, 'Waar is dit sjabloon voor bedoeld? Je ziet dit bij het kiezen van een sjabloon.')),
      ),
      editor.element,
      h('div', { class: 'sjb-opslaanbalk' },
        foutEl,
        h('div', { class: 'sjb-opslaanbalk-rij' },
          statusEl,
          h('div', { class: 'knoppen' },
            h('a', { class: 'knop', href: '#/sjablonen' }, 'Terug naar overzicht'),
            opslaanKnop),
        ),
      ),
    ),
  );
  if (isNieuw && !hersteld) naamVeld.focus();
}
