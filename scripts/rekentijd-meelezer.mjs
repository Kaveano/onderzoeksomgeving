// Rekentijd van GET /api/kijk/:code/dashboard in V8 (Node), zoals de Worker het doet: elke inzending JSON.parse,
// dashboardUitRijen, kijkerDashboard en JSON.stringify. Zonder database en zonder netwerk; verzonnen antwoorden.
// Per vorm (vragenlijsten × inzendingen × vragen) de mediaan van 9 warme runs, plus de eerste run.
// Een vorm per proces geeft de koude rekentijd (zoals bij een Worker die net is gestart):
//   node scripts/rekentijd-meelezer.mjs                      (alle standaardvormen in één proces)
//   node scripts/rekentijd-meelezer.mjs '[[1,500,100]]'      (één vorm)
// Zie docs/beheer.md, "Rekentijd voor meelezers". Het echte getal (CPU-tijd bij Cloudflare) meet de beheerder op een proef-Worker.
const { dashboardUitRijen } = await import('../public/js/beheer/dashboard-rekenen.js');
const { kijkerDashboard } = await import('../src/routes/delen.js');
const { SCHALEN } = await import('../src/lib/schalen.js');
let s = 7; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
function maak(lijsten, N, V) {
  const vragen = []; const ruw = []; const vl = [];
  let qid = 1;
  for (let l = 1; l <= lijsten; l++) {
    vl.push({ id: l, titel: `L${l}`, status: 'gesloten', code: `c${l}`, meetmoment_id: l, aantal_uitgenodigd: null });
    const opties = JSON.stringify([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }]);
    const eigen = [];
    const bron = (i) => (l > 1 ? i : null);
    eigen.push({ id: qid++, vragenlijst_id: l, thema_id: 1, meetpunt_id: null, type: 'meerkeuze', tekst: 'Afdeling', opties, schaal_soort: 'eens', meerdere_antwoorden: 0, weet_niet: 0, uitsplitsen: 1, bron_vraag_id: bron(1), volgorde: 0, kenmerk: 'afdeling' });
    eigen.push({ id: qid++, vragenlijst_id: l, thema_id: 1, meetpunt_id: null, type: 'janee', tekst: 'JN', opties: '[]', schaal_soort: 'eens', meerdere_antwoorden: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: bron(2), volgorde: 1, kenmerk: 'leidinggevend' });
    for (let i = 3; i <= V; i++) eigen.push({ id: qid++, vragenlijst_id: l, thema_id: 1 + (i % 8), meetpunt_id: null, type: i > V - 3 ? 'open' : 'schaal', tekst: `V${i}`, opties: '[]', schaal_soort: 'eens', meerdere_antwoorden: 0, weet_niet: 1, uitsplitsen: 0, bron_vraag_id: bron(i), volgorde: i, kenmerk: '' });
    vragen.push(...eigen);
    for (let r = 0; r < N; r++) {
      const a = {};
      for (const q of eigen) {
        if (q.type === 'meerkeuze') a[q.id] = 'abcd'[Math.floor(rnd() * 4)];
        else if (q.type === 'janee') a[q.id] = rnd() < 0.5 ? 'ja' : 'nee';
        else if (q.type === 'open') { if (rnd() < 0.4) a[q.id] = 'Een open antwoord van een respondent over het werk.'; }
        else a[q.id] = rnd() < 0.05 ? 'weet_niet' : 1 + Math.floor(rnd() * 5);
      }
      ruw.push({ vragenlijst_id: l, datum: '2026-10-01', antwoorden: JSON.stringify(a) });
    }
  }
  return { vragen, ruw, vl, eerste: vragen.find((q) => q.vragenlijst_id === lijsten && q.uitsplitsen).id };
}
const mag = { dashboard: true, open_antwoorden: false, tussenstand: false, stukken: [], rapporten: [] };
function verzoek({ vragen, ruw, vl, eerste }, lijsten, uitsplitsen) {
  const inz = ruw.map((r) => { let a = {}; try { a = JSON.parse(r.antwoorden); } catch {} return { vragenlijst_id: r.vragenlijst_id, datum: r.datum, a }; });
  const d = dashboardUitRijen({ onderzoek: { id: 1, bedrijfsnaam: 'B', titel: 'T', status: 'actief' }, schalen: SCHALEN, themas: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, naam: `T${i}` })), meetpunten: [],
    meetmomenten: vl.map((l) => ({ id: l.id, naam: `M${l.id}`, datum: '2026-01-01' })), vragenlijsten: vl, vragen, inzendingen: inz, eigen_invoer: [] },
  { vragenlijst: lijsten, uitsplitsen: uitsplitsen ? eerste : null });
  return JSON.stringify(kijkerDashboard(d, mag)).length;
}
const vormen = process.argv[2] ? JSON.parse(process.argv[2]) : [[1, 300, 100], [1, 500, 100], [1, 800, 100], [1, 1000, 100], [1, 2000, 25], [1, 3000, 10], [3, 300, 60], [1, 3000, 100]];
for (const [lijsten, N, V] of vormen) {
  const g = maak(lijsten, N, V);
  const cellen = lijsten * N * V;
  for (const uit of [false, true]) {
    const t0 = performance.now(); verzoek(g, lijsten, uit); const koud = performance.now() - t0;
    const tijden = [];
    for (let k = 0; k < 9; k++) { const t = performance.now(); verzoek(g, lijsten, uit); tijden.push(performance.now() - t); }
    tijden.sort((a, b) => a - b);
    console.log(`${lijsten} × ${N} × ${V} = ${String(cellen).padStart(6)} cellen ${uit ? 'met    ' : 'zonder '} uitsplitsing: warm ${tijden[4].toFixed(1).padStart(5)} ms (${(tijden[4] / cellen * 10000).toFixed(2)} ms per 10.000 cellen), eerste run ${koud.toFixed(1)} ms`);
  }
}
