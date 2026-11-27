// Gedeelde hulpmiddelen voor de schermen van de beheeromgeving.
// Belangrijk: bouw HTML altijd met h() (veilig, geen innerHTML met gebruikersinvoer).

/**
 * Maakt een element. h('button', { class: 'knop', onclick: fn }, 'Tekst')
 * - attributen die met "on" beginnen worden event-handlers
 * - waarde true = leeg attribuut, false/null/undefined = weglaten
 * - kinderen: tekst, getallen, elementen, arrays (null/false worden overgeslagen)
 */
export function h(tag, attrs = {}, ...kinderen) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'class') {
      el.className = v;
    } else if (k === 'dataset') {
      Object.assign(el.dataset, v);
    } else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
      el.value = v;
    } else if (k === 'checked' || k === 'selected' || k === 'disabled') {
      el[k] = !!v;
      if (v) el.setAttribute(k, '');
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  voegToe(el, kinderen);
  return el;
}

function voegToe(el, kinderen) {
  for (const k of kinderen.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** Leegt een element en vult het met nieuwe inhoud. */
export function vervang(el, ...kinderen) {
  el.replaceChildren();
  voegToe(el, kinderen);
  return el;
}

/**
 * Sub-navigatie binnen een tabblad, zoals Dashboard: Overzicht · Alle resultaten.
 * items: [{ sleutel, label, href }]; actief = de sleutel van de pagina waarop je bent.
 */
export function subnav(items, actief, label = 'Onderdelen van dit tabblad') {
  return h('nav', { class: 'subnav', 'aria-label': label },
    items.map((item) => h('a', { href: item.href, 'aria-current': item.sleutel === actief ? 'page' : null }, item.label)));
}

// Sub-navigatie per tabblad van een onderzoek: [deel van het adres na het tabblad, tekst]. '' = de hoofdpagina.
const TAB_SUBNAVS = {
  dashboard: { label: 'Onderdelen van het dashboard', items: [['', 'Overzicht'], ['resultaten', 'Alle resultaten']] },
  analyse: { label: 'Soort analyse', items: [['', 'Stap voor stap'], ['werkbank', 'Werkbank'], ['coderen', 'Open antwoorden']] },
  rapport: { label: 'Rapporten en bronnen', items: [['', 'Rapporten'], ['bronnen', 'Bronnen']] },
};

/** De sub-navigatie van een tabblad (dashboard, analyse of rapport) van onderzoek onderzoekId. */
export function tabSubnav(tab, onderzoekId, actief = '') {
  const s = TAB_SUBNAVS[tab];
  const basis = `#/onderzoek/${onderzoekId}/${tab}`;
  return subnav(s.items.map(([sleutel, label]) => ({ sleutel, label, href: sleutel ? `${basis}/${sleutel}` : basis })), actief, s.label);
}

/** Element met "Bezig met laden…". */
export function laden(tekst = 'Bezig met laden…') {
  return h('div', { class: 'laden', role: 'status' }, tekst);
}

/** Lege toestand met uitleg en eventueel een knop. */
export function leeg(tekst, knop = null) {
  return h('div', { class: 'leeg' }, h('p', {}, tekst), knop);
}

/** Meldingblok. soort: '', 'waarschuwing', 'gevaar', 'succes'. */
export function melding(inhoud, soort = '') {
  return h('div', { class: `melding${soort ? ` melding-${soort}` : ''}`, role: soort === 'gevaar' ? 'alert' : null }, inhoud);
}

// ---------- Toasts (korte meldingen onderin). soort: '', 'succes', 'fout', 'waarschuwing' ----------

let toastHouder;
export function meld(tekst, soort = '') {
  if (!toastHouder) {
    toastHouder = h('div', { class: 'toasts', 'aria-live': 'polite', role: 'status' });
    document.body.append(toastHouder);
  }
  // Niet dezelfde melding twee keer, en hooguit drie tegelijk (anders bedekken ze op een telefoon het scherm).
  for (const oud of toastHouder.children) if (oud.textContent === tekst) oud.remove();
  while (toastHouder.children.length >= 3) toastHouder.firstElementChild.remove();
  const t = h('div', { class: `toast${soort ? ` toast-${soort}` : ''}` }, tekst);
  toastHouder.append(t);
  setTimeout(() => t.remove(), soort === 'fout' ? 7000 : soort === 'waarschuwing' ? 5500 : 3500);
}

/** Toont een fout van de server (of een netwerkfout) als toast. */
export function meldFout(fout) {
  meld(fout && fout.message ? fout.message : 'Er ging iets mis.', 'fout');
}

// ---------- Dialogen ----------

let dialoogTeller = 0;

/** Unieke id voor elementen in dialogen (er kunnen er twee tegelijk open zijn). */
export function uniekeId(voorvoegsel = 'id') {
  dialoogTeller += 1;
  return `${voorvoegsel}-${dialoogTeller}`;
}

/** Basis van een dialoog (ook bruikbaar voor schermen met een eigen dialoog). */
export function maakDialoog(titel, inhoud, knoppen) {
  const titelId = uniekeId('dlg-titel');
  const d = h('dialog', { class: 'dialoog', 'aria-labelledby': titelId },
    h('form', { method: 'dialog', novalidate: true },
      h('div', { class: 'dialoog-inhoud' }, h('h2', { id: titelId }, titel), inhoud),
      h('div', { class: 'dialoog-voet' }, knoppen),
    ),
  );
  document.body.append(d);
  d.addEventListener('close', () => setTimeout(() => d.remove(), 0));
  return d;
}

/**
 * Vraagt om bevestiging. Geeft een Promise<boolean>.
 * opties: { titel, tekst, knop = 'Doorgaan', gevaar = false, typTekst } —
 * met typTekst moet de gebruiker die tekst overtypen (voor onomkeerbare acties).
 */
export function bevestig({ titel, tekst, knop = 'Doorgaan', gevaar = false, typTekst = null }) {
  return new Promise((klaar) => {
    let invoer = null;
    const ok = h('button', { type: 'button', class: `knop ${gevaar ? 'knop-gevaar' : 'knop-primair'}` }, knop);
    const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
    const inhoud = [
      ...(Array.isArray(tekst) ? tekst : [tekst]).map((t) => (t instanceof Node ? t : h('p', {}, t))),
    ];
    if (typTekst) {
      const invoerId = uniekeId('bevestiging');
      invoer = h('input', { type: 'text', id: invoerId, autocomplete: 'off', spellcheck: 'false' });
      inhoud.push(h('div', { class: 'veld' }, h('label', { for: invoerId }, `Typ "${typTekst}" om te bevestigen`), invoer));
      ok.disabled = true;
      invoer.addEventListener('input', () => {
        ok.disabled = invoer.value.trim() !== typTekst.trim();
      });
    }
    const d = maakDialoog(titel, inhoud, [annuleer, ok]);
    let antwoord = false;
    ok.addEventListener('click', () => {
      antwoord = true;
      d.close();
    });
    annuleer.addEventListener('click', () => d.close());
    d.addEventListener('close', () => klaar(antwoord));
    d.showModal();
    (invoer || ok).focus();
  });
}

/**
 * Formulier in een dialoog. Geeft Promise<object|null> met de ingevulde waarden.
 * velden: [{ naam, label, type: 'text'|'textarea'|'date'|'number'|'select'|'checkbox', waarde, opties: [{waarde, label}],
 *            verplicht, hulp, max, placeholder }]
 * controle(waarden) mag een foutmelding (tekst) teruggeven om opslaan te blokkeren.
 * opslaan(waarden) (optioneel, async): wordt aangeroepen voordat de dialoog sluit; bij een fout blijft hij open.
 */
export function formulierDialoog({ titel, velden, knop = 'Opslaan', intro = null, controle = null, opslaan = null }) {
  return new Promise((klaar) => {
    const invoer = {};
    const foutEl = h('div', { class: 'veld-fout', role: 'alert' });
    const inhoud = [intro ? h('p', { class: 'zacht' }, intro) : null];
    const basisId = uniekeId('dlg-veld');
    velden.forEach((v, i) => {
      const id = `${basisId}-${i}`;
      let el;
      if (v.type === 'textarea') {
        el = h('textarea', { id, rows: v.rijen || 4, maxlength: v.max || null, placeholder: v.placeholder || null }, v.waarde ?? '');
      } else if (v.type === 'select') {
        el = h('select', { id }, (v.opties || []).map((o) =>
          h('option', { value: o.waarde ?? '', selected: String(o.waarde ?? '') === String(v.waarde ?? '') }, o.label)));
      } else if (v.type === 'checkbox') {
        el = h('input', { id, type: 'checkbox', checked: !!v.waarde });
        invoer[v.naam] = el;
        inhoud.push(h('div', { class: 'veld' }, h('label', { class: 'keuze', for: id }, el, h('span', {}, v.label)),
          v.hulp ? h('div', { class: 'veld-hulp' }, v.hulp) : null));
        return;
      } else {
        el = h('input', {
          id,
          type: v.type || 'text',
          value: v.waarde ?? '',
          maxlength: v.max || null,
          placeholder: v.placeholder || null,
          inputmode: v.inputmode || null,
          autocomplete: 'off',
        });
      }
      if (v.verplicht) el.required = true;
      invoer[v.naam] = el;
      inhoud.push(h('div', { class: 'veld' },
        h('label', { for: id }, v.label, v.verplicht ? h('span', { class: 'verplicht-teken', 'aria-hidden': 'true' }, ' *') : null),
        el,
        v.hulp ? h('div', { class: 'veld-hulp' }, v.hulp) : null,
      ));
    });
    inhoud.push(foutEl);
    const ok = h('button', { type: 'submit', class: 'knop knop-primair' }, knop);
    const annuleer = h('button', { type: 'button', class: 'knop' }, 'Annuleren');
    const d = maakDialoog(titel, inhoud, [annuleer, ok]);
    let resultaat = null;
    const formulier = d.querySelector('form');
    formulier.addEventListener('submit', async (e) => {
      e.preventDefault();
      const waarden = {};
      for (const v of velden) {
        const el = invoer[v.naam];
        waarden[v.naam] = v.type === 'checkbox' ? el.checked : el.value.trim();
        if (v.verplicht && !waarden[v.naam]) {
          foutEl.textContent = `Vul "${v.label}" in.`;
          el.focus();
          return;
        }
      }
      const fout = controle ? controle(waarden) : null;
      if (fout) {
        foutEl.textContent = fout;
        return;
      }
      if (opslaan) {
        ok.disabled = true;
        try {
          await opslaan(waarden);
        } catch (err) {
          foutEl.textContent = err.message || 'Opslaan is mislukt.';
          ok.disabled = false;
          return;
        }
      }
      resultaat = waarden;
      d.close();
    });
    const beginwaarden = JSON.stringify(velden.map((v) => (v.type === 'checkbox' ? invoer[v.naam].checked : invoer[v.naam].value)));
    const gewijzigd = () =>
      JSON.stringify(velden.map((v) => (v.type === 'checkbox' ? invoer[v.naam].checked : invoer[v.naam].value))) !== beginwaarden;
    const sluitNaVragen = async () => {
      if (!gewijzigd() || (await bevestig({ titel: 'Wijzigingen weggooien?', tekst: 'Wat je hier hebt ingevuld, wordt niet opgeslagen.', knop: 'Weggooien', gevaar: true }))) {
        d.close();
      }
    };
    // Escape (en het terug-gebaar op Android) sluit niet zomaar als er iets is ingevuld.
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      sluitNaVragen();
    });
    annuleer.addEventListener('click', () => sluitNaVragen());
    d.addEventListener('close', () => klaar(resultaat));
    d.showModal();
    const eerste = velden.length ? invoer[velden[0].naam] : ok;
    if (eerste) eerste.focus();
  });
}

// ---------- Opmaak van getallen en datums (Nederlands) ----------

export function getal(x, decimalen = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '–';
  return Number(x).toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
}

export function procent(x, decimalen = 0) {
  if (x === null || x === undefined) return '–';
  return `${getal(x, decimalen)}%`;
}

const MAANDEN = ['jan.', 'feb.', 'mrt.', 'apr.', 'mei', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];

/** '2026-11-25' → '25 nov. 2026' */
export function datum(iso) {
  if (!iso) return '';
  const [j, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!j || !m || !d) return '';
  return `${d} ${MAANDEN[m - 1]} ${j}`;
}

/** ISO-tijdstip → datum in lokale tijd, bijv. '25 nov. 2026' */
export function lokaleDatum(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return `${t.getDate()} ${MAANDEN[t.getMonth()]} ${t.getFullYear()}`;
}

/** ISO-tijdstip → '25 nov. 2026, 14:32' (lokale tijd) */
export function tijdstip(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return `${t.getDate()} ${MAANDEN[t.getMonth()]} ${t.getFullYear()}, ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/** Vandaag als JJJJ-MM-DD (lokale tijd). */
export function vandaag() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/** Enkelvoud/meervoud: aantal(3, 'vraag', 'vragen') → '3 vragen' */
export function aantal(n, enkel, meer) {
  return `${n.toLocaleString('nl-NL')} ${n === 1 ? enkel : meer}`;
}

// ---------- Overig ----------

/** Kopieert tekst naar het klembord (met terugval voor oudere browsers). */
export async function kopieer(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch {
    const t = h('textarea', { 'aria-hidden': 'true' }, tekst);
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.append(t);
    t.select();
    let gelukt = false;
    try {
      gelukt = document.execCommand('copy');
    } catch {
      gelukt = false;
    }
    t.remove();
    return gelukt;
  }
}

/** Start een download (de server stuurt het bestand als bijlage). */
export function download(url) {
  const a = h('a', { href: url, download: '' });
  document.body.append(a);
  a.click();
  a.remove();
}

export function vertraag(fn, ms) {
  let timer;
  const uit = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  uit.annuleer = () => clearTimeout(timer);
  return uit;
}

/** Statuslabel voor vragenlijsten/onderzoeken. */
export function statusLabel(status) {
  const map = {
    open: ['Open', 'label-open'],
    gesloten: ['Gesloten', 'label-gesloten'],
    actief: ['Actief', 'label-primair'],
    gearchiveerd: ['Gearchiveerd', 'label-archief'],
  };
  const [tekst, klasse] = map[status] || [status, ''];
  return h('span', { class: `label ${klasse}` }, tekst);
}

/** Volledige openbare link van een vragenlijst. */
export function vragenlijstLink(code) {
  return `${location.origin}/v/${code}`;
}

/** Het beeldmerk: een ring (de O) met één uitgelicht part, als inline SVG (kleuren via CSS). */
export function beeldmerk() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'merk');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [klasse, d] of [
    ['merk-ring', 'M26.47 16.73A10.5 10.5 0 1 1 15.27 5.53'],
    ['merk-part', 'M17.82 5.66a10.5 10.5 0 0 1 8.52 8.52'],
  ]) {
    const pad = document.createElementNS(NS, 'path');
    pad.setAttribute('class', klasse);
    pad.setAttribute('d', d);
    svg.append(pad);
  }
  return svg;
}
