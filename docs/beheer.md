# Beheer en techniek

Dit document is voor onderhoud: waar staat wat, hoe zet je een nieuwe versie online, en wat zijn de grenzen van de gratis laag.

## Waar staat wat

| Onderdeel | Waar | Toelichting |
|---|---|---|
| App (Worker) | Cloudflare › Workers & Pages › **onderzoek** | Adres: https://onderzoek.af-partners.workers.dev |
| Database | Cloudflare › Storage & Databases › D1 › **onderzoeksomgeving** | Jurisdictie **eu**: draait en bewaart gegevens alleen in de EU |
| Wachtwoord | Geheim **BEHEER_WACHTWOORD** bij de Worker (Settings › Variables and Secrets) | Staat nergens in de code |
| Tweede toegang | Geheim **BEHEER_WACHTWOORD_2** bij de Worker (optioneel) | Extra beheerwachtwoord voor ondersteuning; verwijder het geheim om die toegang in te trekken |
| Sjablonen | In de database (tabel `sjablonen`) | De code bevat alleen de originelen van de meegeleverde sjablonen |
| Achtergrondkenmerken | `public/js/beheer/kenmerken.js` | Zuiver (Worker en browser): de kenmerken, de standaard achtergrondvragen, `kenmerkVoorTekst`, `klasseVan` (klassegrenzen zoals "35 tot 55 jaar") en `isLieverNiet` |
| Cijfervraag | `src/lib/schalen.js` (`CIJFERSCHALEN`, `ENPS`) | Vraagtype `cijfer`; de soort staat in `vragen.schaal_soort`: `nps` (0 tot 10) of `rapport` (1 tot 10) |
| Dialoog "Achtergrondvragen toevoegen" | `public/js/beheer/schermen/kenmerk-dialoog.js` | Gebruikt door de vragenlijsteditor (route `POST /vragenlijsten/:id/kenmerkvragen`) en de sjablooneditor |
| Sjabloonmigratie maken | `scripts/sjablonen-migratie.mjs` | Maakt de migratie die ongewijzigde standaardsjablonen bijwerkt (zie "Standaardsjablonen bijwerken") |
| Rapporten, deellinks, eigen datasets | In de database (tabellen `rapporten`, `deellinks`, `datasets`) | Gaan mee bij **Alles samen (JSON)**; worden verwijderd met het onderzoek |
| Code | GitHub-repository `onderzoeksomgeving` | |
| Gegevens in de browser | `public/js/beheer/gegevens.js` | De enige manier waarop schermen aan de antwoorden komen: één kopie per onderzoek per sessie, daarna alleen veranderde vragenlijsten (zie "Grote onderzoeken") |
| Verschilwacht | `public/js/beheer/verschilwacht.js` | Waarschuwt als een meelezer twee uitkomsten kan vergelijken die 1 tot 4 respondenten verschillen |
| Belastingtest | `scripts/belasting.mjs` | Meet hoe groot een onderzoek kan worden op de gratis laag (zie "Belastingtest") |
| Werkbank (rekenen) | `public/js/beheer/werkbank/` | Zuivere modules: `dataset.js` (variabelen, namen als in SPSS), `transformaties.js` (eigen variabelen, selecties), `privacy-selectie.js` (regels A–E bovenop `privacy.js`), `verdelingen.js`, `matrix.js` (QR, Cholesky, Jacobi met warme start), `procedures/` (de analyses; `procedures/index.js` is de lijst; `regressie.js` en `logistisch.js` voor voorspellen, `groepen.js` ook voor gepaard, `schalen.js` ook voor de factoranalyse), `uitvoer.js`, `uitvoer-tekst.js`, `uitvoer-export.js`, `rekenkern.js` (hoofdthread met pauzes en stoppen), `rapport.js` (`analysesVoorRapport` voor het rapport), `definities.js` (vorm van definities en specs; ook de server gebruikt die) |
| Werkbank (scherm en server) | `public/js/beheer/schermen/werkbank*.js`, `werkbank/uitvoer-weergave.js`, `src/routes/werkbank.js` | De server bewaart alleen definities (`werkbank_definities`) en bewaarde analyses (`werkbank_analyses`) |
| Bibliotheek | Tabellen `bronnen` en `bron_koppelingen`; `src/routes/bibliotheek.js`, `src/lib/bibliotheek.js` (controle, citeersleutels) | Eén bibliotheek voor alle onderzoeken. Elke wijziging verhoogt `instellingen.bibliotheek_versie`; de browser (`public/js/beheer/bibliotheek-data.js`) haalt de lijst alleen opnieuw op als die versie veranderd is |
| APA, zoeken en bestanden van de bibliotheek | `public/js/beheer/bibliotheek-regels.js` (APA 7 met de Nederlandse afspraken in `OPMAAK`, "Plak een verwijzing", namen en citeersleutels), `bibliotheek-zoeken.js` (zoeken zonder index), `bibliotheek-bestanden.js` (RIS, Excel, Word) | Zuiver (geen DOM): de Worker, de schermen en de tests gebruiken dezelfde code. `sorteerLiteratuur` geeft per bron `suffix` (a, b … bij dezelfde mensen in hetzelfde jaar) en `voorletters` (twee mensen met dezelfde naam in de tekst, APA 7 §8.20); geef die allebei door aan `apaInTekst`, dan kloppen tekst en lijst. Tussen haakjes staan bronnen in de volgorde van de lijst (letter voor letter, op de hoofdnaam) |
| Schermen van de bibliotheek | `schermen/bibliotheek.js`, `bron-bewerken.js`, `bronnen.js` (Rapport · Bronnen), `bronkiezer.js` (dialoog "Bron noemen"), `bibliotheek-ui.js` (Citeer, Koppel, Plak een verwijzing, exports) | CSS: `public/css/scherm-bibliotheek.css` |
| Coderen van open antwoorden | Tabellen `codes`, `coderingen`, `citaten`; `src/routes/codering.js`; `public/js/beheer/codering-regels.js` (tellen en `coderingFeiten`, zuiver); scherm `schermen/coderen.js` (Analyse · Open antwoorden) | CSS: `public/css/scherm-coderen.css`. Coderingen en citaten verdwijnen met hun inzending of eigen invoer (`ON DELETE CASCADE`) |
| Startcollectie | `scripts/startcollectie.mjs`, `data/startcollectie.json`, `data/startcollectie-sleutels.json`, migratie `0016_bibliotheek_start.sql` | Zie "De startcollectie van de bibliotheek" |

Je andere projecten (AF Partners-site, InterimRadar) staan los hiervan en worden niet geraakt.

## Wachtwoord instellen of wijzigen

Het wachtwoord moet als **geheim** (type *Secret*) bij de Worker staan, niet als gewone variabele.

**Manier 1: vanaf een computer met Node.js (betrouwbaarst).** Voer dit uit in de map met de code:

```bash
npx wrangler secret put BEHEER_WACHTWOORD
```

Wrangler vraagt om het wachtwoord. Het wordt niet getoond terwijl je typt en wordt direct als geheim opgeslagen.

**Manier 2: in het Cloudflare-dashboard**
1. Ga naar **Workers & Pages** › **onderzoek** › **Settings** › **Runtime variables and secrets**.
2. Verwijder de oude regel `BEHEER_WACHTWOORD` met het prullenbakje.
3. Klik op **+ Add variable** en vul in:
   - **Production** aangevinkt
   - **Key** `BEHEER_WACHTWOORD`
   - **Value**: het nieuwe wachtwoord, minimaal 12 tekens
4. Vink **Secret** aan.
5. Klik op **Add 1 variable and deploy**.
6. **Controleer daarna de kolom Type.** Daar moet *Secret* staan. Staat er *Variable*, dan is het als leesbare tekst opgeslagen: verwijder het en gebruik manier 1.
7. De oranje melding "Update your Wrangler configuration…" kun je negeren. Zet het wachtwoord nooit in `wrangler.jsonc`.

Wijzig je het wachtwoord, dan worden alle bestaande inlogsessies direct ongeldig. Instellingen die je in het dashboard doet, blijven staan als er een nieuwe versie online wordt gezet (`keep_vars` in `wrangler.jsonc`).

## Kosten en grenzen (gratis laag)

Er wordt niets in rekening gebracht. Bij een daglimiet weigert Cloudflare verzoeken tot 01:00 uur Nederlandse tijd (00:00 UTC); er komt geen rekening.

| Grens (gratis) | Waarde | Gebruik van deze app |
|---|---|---|
| Verzoeken aan de Worker | 100.000 per dag | Eén paginabezoek is ongeveer 10 tot 20 verzoeken; ruim voldoende |
| Rekentijd | 10 ms per verzoek | Exportbestanden worden in je browser gemaakt; het dashboard rekent alles in één keer uit |
| D1: geschreven rijen | 100.000 per dag | Eén ingevulde vragenlijst is één rij |
| D1: gelezen rijen | 5 miljoen per dag | Ruim voldoende |
| D1: opslag | 500 MB per database | Tekst; ruim voldoende voor vele onderzoeken |

Grenzen die de app zelf stelt, zodat één verzoek altijd binnen de gratis rekentijd blijft: 300 regels per keer bij inlezen (de app verdeelt grotere bestanden zelf in delen), 100 vragen per vragenlijst, 20 rapporten en 20 deellinks per onderzoek, 10 eigen datasets per onderzoek van maximaal 2.000 rijen en 40 kolommen.

**Werkbank.** Per onderzoek hooguit 300 definities (eigen variabelen, selecties, eigenschappen) en 200 bewaarde analyses; een definitie, spec of notitie is hooguit 20.000 tekens. Elke route van `src/routes/werkbank.js` doet één batch om te lezen en één schrijfopdracht; bij het ophalen worden de JSON-kolommen niet ingelezen maar doorgeplakt (`test/werkbank-api.test.mjs` telt dat). Alle analyses rekenen in de browser, op de hoofdthread met korte pauzes (geen Web Worker). Gemeten in Node (`test/werkbank-prestaties.test.mjs`, grenzen tussen haakjes): 5.000 respondenten × 150 vragen opbouwen ongeveer 0,15 s (1,5 s), een correlatiematrix van 40 variabelen 0,3 s (1 s), ANOVA met Games-Howell over 10 groepen ongeveer 1,8 s (3 s), lineaire regressie met 20 voorspellers 0,04 s (0,3 s), logistische regressie met 20 voorspellers 0,04 s (0,5 s), principale assen met varimax op 40 vragen 0,2 s (1,5 s). De principale-assenmethode start elke stap van Jacobi vanuit de eigenvectoren van de vorige stap; zo is één ronde meestal genoeg. Games-Howell is het traagst (een `qtukey` per paar); op een trage telefoon kan een ANOVA met veel groepen enkele seconden duren, met *Bezig met rekenen… (post-hoc 12 van 45)* en **Stoppen**.

### Grote onderzoeken

Het zware werk zit in het doorgeven en uitrekenen van alle antwoorden. Daarom:
- **Antwoorden in delen.** De schermen halen de antwoorden op via `GET …/export/inzendingen?vragenlijst=<id>&na=<id>&max=1000`: per vragenlijst, in delen van hooguit 1.000 inzendingen of ongeveer 1,5 miljoen tekens (de database telt dat, zodat de Worker niet meer binnenkrijgt). Eén batch per deel; de database leest via de index alleen de rijen van dat deel. De kop (alles behalve de antwoorden) komt van `GET …/export/data?zonder_inzendingen=1`, met per vragenlijst het aantal inzendingen en een controlegetal (`inzendingen_stand`). `GET …/export/data` zonder die parameter werkt zoals altijd.
- **Eén kopie in de browser.** `gegevens.js` bewaart de antwoorden in het geheugen van het tabblad (hooguit 3 onderzoeken; weg bij vernieuwen). Een volgend scherm haalt alleen de kop opnieuw op en daarna alleen de vragenlijsten waarvan het aantal of het controlegetal veranderd is.
- **Rapporten rekenen in de browser.** *Cijfers bijwerken* rekent de dashboards per vragenlijst zelf uit met `dashboardUitRijen`, dus zonder een verzoek per vragenlijst.
- **Alle resultaten** rekent boven 1.500 inzendingen (`GROOT_ONDERZOEK` in `gegevens.js`) in de browser, met dezelfde code als de server. Daaronder rekent de server, zoals altijd.
- **Meelezers** krijgen boven `KIJK_MAX_CELLEN` antwoordcellen (standaard 60.000: per vragenlijst inzendingen × vragen, opgeteld) of boven `KIJK_MAX_INZENDINGEN` inzendingen (standaard 3.000) geen live dashboard; zie "Rekentijd voor meelezers" en "Deellinks".

### Belastingtest

`scripts/belasting.mjs` maakt een onderzoek "Belastingtest" met verzonnen antwoorden (één vragenlijst: een afdelingsvraag om op uit te splitsen, een ja/nee-vraag, 3 open vragen en verder schaalvragen) en meet de zware verzoeken. Gebruik het **nooit** op de echte omgeving.

```bash
node scripts/belasting.mjs --doel http://127.0.0.1:8790 --respondenten 3000 --vragen 100 --wachtwoord <wachtwoord> --opruimen
```

Gemeten op 27 november 2026 met een lokale testserver (`npx wrangler dev`, laptop), 100 vragen. Dit zijn doorlooptijden van verzoek tot laatste byte, geen CPU-tijd; ze geven aan hoe de verzoeken zich tot elkaar verhouden.

| Verzoek | 1.000 respondenten | 3.000 respondenten | 5.000 respondenten |
|---|---:|---:|---:|
| `export/data` in één keer (de oude manier) | 60 ms, 0,98 MB | 154 ms, 2,87 MB | 206 ms, 4,76 MB |
| `export/data?zonder_inzendingen=1` (kop) | 18 ms, 0,03 MB | 16 ms, 0,03 MB | 13 ms, 0,03 MB |
| `export/inzendingen`, alle delen samen | 57 ms (1 deel) | 128 ms (3 delen, langste 44 ms) | 211 ms (5 delen, langste 46 ms) |
| `dashboard` (alle resultaten) | 49 ms | 75 ms | 78 ms |
| `dashboard` met uitsplitsing | 37 ms | 51 ms | 78 ms |
| meelezer: `dashboard` | 37 ms¹ | 45 ms¹ | geweigerd (boven 3.000) |
| browser: `dashboardUitRijen` (gemeten in Node) | 24 ms | 33 ms | 34 ms |

¹ Gemeten met de oude grens (alleen 3.000 inzendingen). Met de grens op antwoordcellen (60.000) weigert de server de meelezer bij 100 vragen al boven 600 inzendingen; zie hieronder.

Wat dit zegt: één deel van de antwoorden kost ongeveer evenveel als een export van 1.000 respondenten, ongeacht de grootte van het onderzoek. De oude export en het dashboard groeien mee met het aantal respondenten; boven 1.500 inzendingen rekent *Alle resultaten* daarom in de browser. Getest tot 5.000 respondenten × 100 vragen (lokaal).

**Meten op een proef-Worker (voor de beheerder).** De echte rekentijd (CPU-tijd, grens 10 ms per verzoek) is alleen bij Cloudflare te zien. Doe dit één keer, en opnieuw na grote wijzigingen:

1. Maak een aparte database in de EU: `npx wrangler d1 create onderzoeksomgeving-proef --jurisdiction eu`.
2. Kopieer `wrangler.jsonc` naar `wrangler.proef.jsonc` (niet in GitHub zetten). Zet daarin `"name": "onderzoek-proef"` en de `database_id` van de nieuwe database.
3. `npx wrangler d1 migrations apply DB --remote --config wrangler.proef.jsonc`
4. `npx wrangler secret put BEHEER_WACHTWOORD --config wrangler.proef.jsonc` (een ander wachtwoord dan het echte).
5. `npx wrangler deploy --config wrangler.proef.jsonc`
6. `node scripts/belasting.mjs --doel https://onderzoek-proef.<account>.workers.dev --respondenten 3000 --vragen 100 --wachtwoord <proefwachtwoord> --opruimen`, en daarna ook met 1000 en 5000.
7. Lees in Cloudflare › Workers & Pages › **onderzoek-proef** › **Metrics** de CPU-tijd af (mediaan en hoogste waarden). Zet de uitkomst in de tabel hierboven ("getest tot … respondenten × … vragen") en pas zo nodig `GROOT_ONDERZOEK` (`gegevens.js`) en `KIJK_MAX_INZENDINGEN` aan.
8. Ruim op: `npx wrangler delete --config wrangler.proef.jsonc` en `npx wrangler d1 delete onderzoeksomgeving-proef`.

Die meting op Cloudflare is nog niet gedaan; tot dan geldt de lokale meting hierboven als indicatie.

### Rekentijd voor meelezers

De doorlooptijden hierboven zeggen niets over de CPU-tijd. Die groeit met het aantal **antwoordcellen**: per vragenlijst het aantal inzendingen × het aantal vragen, opgeteld over alle vragenlijsten van het onderzoek (het dashboard rekent ze allemaal, ook als de meelezer er één bekijkt). `scripts/rekentijd-meelezer.mjs` meet in Node (dezelfde V8 als de Worker) wat de server per verzoek doet: elke inzending inlezen, `dashboardUitRijen`, `kijkerDashboard` en het antwoord als JSON. Gemeten op 27 november 2026 (Node 22, laptop), elke vorm in een eigen proces; het 2e en 3e verzoek:

| Vorm (lijsten × inzendingen × vragen) | Cellen | Zonder uitsplitsing | Met uitsplitsing |
|---|---:|---:|---:|
| 1 × 300 × 100 | 30.000 | 3 ms | 5 ms |
| 1 × 400 × 100 | 40.000 | 4 ms | 5 ms |
| 1 × 500 × 100 | 50.000 | 4–11 ms | 7–8 ms |
| 3 × 300 × 60 | 54.000 | 3 ms | 7–8 ms |
| 1 × 800 × 100 | 80.000 | 7–12 ms | 7 ms |
| 1 × 1.000 × 100 | 100.000 | 9–17 ms | 9 ms |

Het eerste verzoek in een vers proces kost 12 tot 30 ms, bij elke grootte vanaf 30.000 cellen: V8 vertaalt de code dan nog. Daar helpt geen grens tegen; het geldt ook voor het gewone dashboard. Het inlezen van de databaserijen komt er in de Worker nog bij. Daarom staat `KIJK_MAX_CELLEN` op **60.000** (ruim binnen 10 ms als de Worker warm is). Bij 100 vragen per vragenlijst is dat 600 inzendingen; bij 30 vragen 2.000. `KIJK_MAX_INZENDINGEN` (3.000) blijft als extra grens. Pas beide aan na de meting op de proef-Worker (stap 7 hierboven; zet ze als variabelen bij de Worker).


## Privacy en beveiliging (technisch)

**Respondenten**
- Er wordt geen naam, e-mailadres, IP-adres, browserinformatie of tijdstip opgeslagen; alleen de datum en de antwoorden.
- Elke inzending krijgt een willekeurig id, zodat de volgorde van invullen niet te herleiden is.
- Limieten per link: 100 inzendingen per 10 minuten, 1.000 per dag en optioneel een maximum in totaal. Die worden ondeelbaar gecontroleerd.
- Er is een lokaas-veld tegen robots.

**Dashboard**
- Er worden geen groepen of getallen getoond die op minder dan 5 respondenten berusten.
- Waar nodig worden ook andere groepen of getallen verborgen, zodat niets uit het totaal terug te rekenen is.
- Alle regels voor het verbergen staan op één plek: `public/js/beheer/privacy.js` (zuiver; de Worker, de schermen en de tests gebruiken dezelfde code). De grens van 5 staat alleen daar; `drempelVan()` zorgt dat geen instelling hem kan verlagen.
- Het rekenwerk van het dashboard staat in `public/js/beheer/dashboard-rekenen.js` (`dashboardUitRijen`). `src/routes/dashboard.js` haalt alleen de rijen op (één batch). De browser kan precies hetzelfde uitrekenen uit de export (`rijenUitExport`); `test/dashboard-rekenen.test.mjs` controleert dat het resultaat gelijk is aan `GET /dashboard`.
- Achtergrondvragen (`uitsplitsen = 1` of een `kenmerk`, met één antwoord) zijn **beschermd**: hun verdeling gaat door `maskeerVerdeling` (met "Niet ingevuld", percentages van de hele lijst, `n` = null zodra er iets verborgen is). Dat geldt voor de beheerder, de meelezer, de rapportfeiten (`vragen[].beschermd`) en bij het tonen van oude rapporten (ja/nee-vragen en meerkeuzevragen met één antwoord worden dan voor de zekerheid gemaskeerd, want in oude feiten staat niet welke vraag een achtergrondvraag is). Het verloop van een ja/nee-achtergrondvraag per meetmoment wordt verborgen zodra in één bijdragende vragenlijst iets verborgen is; anders is dat getal terug te rekenen uit het meetmoment min de andere vragenlijsten.
- Uitsplitsing: wat een lezer ziet, mag niet afhangen van hoe de respondenten over de niet-getoonde groepen verdeeld zijn (`test/privacy.test.mjs`, invariantie). Daarom staan de namen bij "Overige groepen samen" in de volgorde van de antwoordmogelijkheden (vóór P1: eerst de kleine groepen, de erbij genomen grotere groep als laatste; dat verraadde welke groep groot was), wordt "Niet ingevuld" nooit genoemd (een vaste zin zegt dat wie de vraag niet invulde meetelt) en is de uitleg één vaste zin.

**Deellinks (meelezers)**
- Een meelezer heeft de link (`/d/<code>`, niet te raden) én een toegangscode van 10 tekens nodig. Van de toegangscode staat alleen een hash met zout in de database.
- Na 5 verkeerde codes per afzender per link volgt 15 minuten wachttijd; voor alle afzenders samen geldt maximaal 50 per link (beide ondeelbaar geteld). Voor dat tellen wordt dezelfde niet terug te rekenen afzendercode bewaard als bij het inloggen; die wordt na een dag gewist.
- Een meelezer krijgt een eigen sessiecookie per link (`__Host-kijk-…`, HttpOnly, Secure, SameSite=Strict, 8 uur). Intrekken, een nieuwe code, verlopen of verwijderen beëindigt lopende sessies direct.
- De server geeft een meelezer alleen wat is aangevinkt. Uitkomsten van een vragenlijst, vraag, thema of meetmoment met minder dan 5 respondenten worden aan de serverkant weggelaten, net als open antwoorden (tenzij aangevinkt) en links naar vragenlijsten. Een thema of meetmoment met een vraag van minder dan 5 respondenten valt ook weg, net als punten in het verloop die op een kleine of nog open vragenlijst berusten.
- Vragenlijsten die nog openstaan, krijgt een meelezer alleen als "tussenstand" is aangevinkt (anders is het antwoord van een nieuwe respondent af te leiden door twee keer te kijken). `tussenstand` staat los van `dashboard` en wordt ook bewaard bij een link die alleen rapporten deelt.
- Boven `KIJK_MAX_CELLEN` antwoordcellen (standaard 60.000: per vragenlijst inzendingen × vragen, alle vragenlijsten van het onderzoek samen) of boven `KIJK_MAX_INZENDINGEN` inzendingen (standaard 3.000) rekent de server het dashboard niet live uit voor een meelezer (413, met de melding om een rapport te vragen). Dat kost anders te veel rekentijd. Beide grenzen zijn aan te passen met een variabele met dezelfde naam bij de Worker; een waarde van 0 of geen getal geeft de standaard.
- Een rapport wordt voor een meelezer aan de serverkant opgebouwd uit de vastgelegde feiten, alleen met de hoofdstukken die aanstaan. Zonder tussenstand gebruikt `rapportVoorKijker` de optie `verbergOpen` (standaard aan): van een vragenlijst die op de peildatum openstond (`feiten.lijsten[].status`) komen Resultaten, de bijlagen, de responszin, de verlooppunten van dat meetmoment en de toetsen van of naar dat meetmoment niet mee; de responstabel wel. Dat werkt ook voor oude rapporten.
- Van meelezers wordt alleen de datum van het laatste bezoek per link bewaard, plus bij verkeerde toegangscodes de afzendercode (een dag).

**Cijfervraag en achtergrondkenmerk**
- Een cijfervraag (`type = 'cijfer'`) telt nooit mee in thema- of meetpuntgemiddelden, Cronbach, "% 4 of 5" of de toetsen: al die code kijkt alleen naar `type = 'schaal'`. Mist er ergens een stuk code voor cijfers, dan ontbreekt er een getal; er komt nooit een verkeerd getal.
- De server controleert een antwoord op een cijfervraag: een geheel getal binnen de schaal (0–10 of 1–10), of `weet_niet` als dat aan staat. Na de eerste antwoorden ligt de schaal vast (409).
- Een cijfervraag met minder dan 5 cijfers (`n_score`) is voor een meelezer helemaal verborgen (verdeling, gemiddelde en eNPS). In de uitsplitsing heeft elke cijfervraag een eigen kolom die apart wordt onderdrukt (`onderdrukKolom`), één getal per cel (gemiddelde of eNPS, geen verdeling per groep).
- `vragen.kenmerk` (`''` = geen) mag alleen bij ja/nee of meerkeuze met één antwoord, één keer per vragenlijst (behalve `overig`). De openbare vragenlijst (`GET /api/publiek/:code`) geeft het kenmerk nooit mee; `test/vraagmodel-api.test.mjs` (poort 8791) controleert dat. Een kenmerk of uitsplitsing beschermt de verdeling van de vraag (`isBeschermd`): haal je bij een vraag zonder uitsplitsing het kenmerk weg, dan zijn kleine aantallen weer zichtbaar (de vraageditor waarschuwt). De routes `PUT /vragen/:id/kenmerk` en `POST /vragenlijsten/:id/kenmerkvragen` doen elk hooguit één losse leesopdracht en één schrijfopdracht of batch (FT-02).
- Dezelfde vraag in een gekopieerde vragenlijst heeft dezelfde stam (`bron_vraag_id`). Kreeg een kopie daarna een ander soort (`vraagSoort`: type, cijferschaal, één of meer antwoorden), dan telt die nergens samen met de stamvraag: niet in het verloop (`dashboard-rekenen.js`), en in `bouwModel` (`analyse-model.js`) krijgt hij een eigen stam, dus een eigen variabele in SPSS, Analyse en de werkbank.
- `klasseVan`: "X tot Y" sluit Y uit, "X t/m Y" en "X tot en met Y" nemen Y mee; een streepje ("18-24 jaar") geeft geen klasse (met de hand koppelen). `kenmerkVoorTekst` herkent "Hoe lang werk je al bij …?" alleen als diensttijd als er een organisatie staat (geen afdeling, team of "voorkeur") en de antwoorden duurklassen zijn.
- SPSS: achtergrondvragen heten naar hun kenmerk (`afdeling`, `leeftijd` …) en een cijfervraag van 0 tot 10 krijgt `vNN_enps`. Alle namen komen uit `spssVariabeleNamen` (`export-bestanden.js`), zodat de werkbank dezelfde namen gebruikt. In exports van vóór deze versie hadden achtergrondvragen een nummer (`v03`).

**Rapporten**
- De feiten in een rapport worden in de browser met vaste regels uit de gegevens samengesteld (geen AI) en met een peildatum in de database vastgelegd. Uitkomsten van minder dan 5 respondenten worden niet opgenomen.
- Een toets (verloop tussen meetmomenten) gebruikt themascores per respondent, het dashboard alle losse antwoorden. Vallen in een vragenlijst 1 tot 4 gedeeltelijk ingevulde respondenten weg, dan wordt die toets niet getoond (anders zijn hun antwoorden uit de twee getallen terug te rekenen).

**Vergelijken van uitkomsten (verschilwacht)**
- `verschilwacht.js` verzamelt voor alle actieve deellinks wat een meelezer kan zien: per gedeeld rapport de vastgelegde n per vragenlijst (`GET /onderzoeken/:id/rapporten` geeft `lijsten_n`) en of het live dashboard gedeeld is. Een uitkomst van minder dan 5 respondenten toont niets en telt dus niet mee.
- Weer openzetten van een gesloten, gedeelde vragenlijst en antwoorden inlezen waardoor er 1 tot 4 respondenten bijkomen, geven een waarschuwing (geen blokkade). Kan de controle niet worden gedaan (geen verbinding), dan gaat de actie gewoon door.

**Exportbestanden**
- Excel, SPSS, de antwoorden als CSV en de volledige JSON bevatten alle losse antwoorden. Afronden vraagt daarom eerst bevestiging (K S10). Een rapport heet *geschikt om te delen*.
- Het willekeurige id van een inzending komt alleen via `export/inzendingen` bij de ingelogde beheerder (voor coderen). In de volledige JSON staan in plaats daarvan vragenlijst en respondentnummer.

**Werkbank (Analyse › Werkbank)**
- De server bewaart alleen definities en specs, nooit waarden per persoon of uitkomsten; alles rekent de browser opnieuw uit de antwoorden. De vorm wordt aan beide kanten met `werkbank/definities.js` gecontroleerd; namen niet gelijk aan een naam die de SPSS-export uitdeelt (`spssVariabeleNamen`), een kenmerksleutel of een SPSS-woord.
- Regels (D2 §7, BOUWPLAN B6/B7/B26): R0 (vragenlijst met 1–4 antwoorden doet niet mee); A (beschermde groepen via `privacy.js verdeelInGroepen`, "Overige groepen samen"); B (cellen; aanvullend verbergen; × met `VERBORGEN_UITLEG`); C (geen toets, effect, verwacht aantal of residu bij een verborgen cel); D (een selectie en elke buur – zonder één voorwaarde of zonder één gekozen groep – verschillen 0 of minstens 5, per uitvoer, per groep en per cel); E (twee indelingen van dezelfde wortelvariabele, ook verwijderde, bakenen geen groepje van 1–4 af); G (geen rijen per persoon, geen datum, geen open tekst; minimum en maximum zijn de 5e laagste en hoogste waarde, mediaan vanaf 9). B6: een variabele met hooguit twee waarden krijgt per groep de kruistabelregel. B7: een score die gedeeltelijke respondenten laat wegvallen, alleen bij 0 of minstens 5 weggevallen (ook per groep en in frequenties). B26: frequenties van meningsvragen zonder selectie volgen het dashboard (en tonen niets bij 1–4 antwoorden, PR-03); voor rapporten rekent `analysesVoorRapport` altijd streng, zodat `kleinste_n` minstens 5 is. Een indeling (kenmerk, eigen indeling, vragenlijst, code) mag alleen als getal meedoen als haar verdeling geen kleine groep heeft; bij een achtergrondvraag telt "Niet ingevuld" daarbij als groep.
- Pariteit met het dashboard (PR-05): bij een achtergrondvraag (kenmerk of uitsplitsvraag) krijgt `beschermIndeling` het aantal "Geen antwoord" als groep "Niet ingevuld" mee, net als `dashboard-rekenen.js uitsplitsing`. Komt die groep in "Overige groepen samen", dan horen die respondenten in de werkbank ook bij die groep (`groepVanRijen`, selecties, regel E); staat hij apart, dan doet hij niet mee. *Geldig (n)* in de variabelenlijst en "Geldig: …" in het voorbeeld van "Indelen in groepen" zijn × zodra de beschermde verdeling (antwoorden plus ontbrekende redenen) iets verbergt; in dat voorbeeld is elke verborgen groep ×.
- Gestapelde bron (alle vragenlijsten onder elkaar): "alleen vragenlijst k" en (bij drie of meer) "zonder vragenlijst k" zijn buren onder regel D (`privacy-selectie.js metLijstBuren`), ook zonder eigen selectie en ook voor de selectie zelf. Meningsvragen zonder selectie blijven zoals het dashboard (B26), maar een meningsvraag die in één vragenlijst 1–4 antwoorden heeft, toont gestapeld niets.
- Frequenties: alleen meningsvragen uit een vragenlijst tonen zonder selectie aantallen van 1–4; scores (`t:`, `m:`, eigen scores), kolommen van een eigen dataset en indelingen niet. Bij een achtergrondvraag vormen antwoorden en ontbrekende redenen één reeks (zoals `maskeerVerdeling`); anders worden antwoorden, ontbrekende redenen en "Niet gevraagd" elk als eigen reeks beschermd (het aantal geldig is elders te zien). Meerdere antwoorden: met bescherming is elke mogelijkheid een paar [gekozen, niet gekozen] met de kruistabelregel en regel D.
- Voorspellen (fase 5): een indeling als voorspeller wordt dummy's; groepen die in de steekproef kleiner zijn dan 5 gaan samen (regel A op de steekproef, `kruistabel.js voegKleineSamen`), daarna regel D voor de groepen (`randenMetBuren`). Een getal met twee waarden doet alleen mee als beide waarden minstens 5 keer voorkomen (B6). Logistisch: beide uitkomstgroepen en elke cel voorspellergroep × uitkomst (ook bij een getal met twee waarden) minstens 5, ook ten opzichte van de buren van een selectie; anders `P_LOGIT_CEL`. Lineaire regressie op een uitkomst met twee waarden gebruikt dezelfde celregel. De classificatietabel is gemaskeerd zoals een kruistabel; het aantal residuen boven 3 SD is × bij 1–4. Geen residuen, kansen of factorscores per persoon.
- Gepaard: per paar minstens 10 mensen; het aantal paren zonder verschil is × bij 1–4 (het volgt uit N en "N zonder gelijke"). Factoranalyse: lijstgewijs minstens max(50, 2 × het aantal vragen); vragen met twee waarden alleen als beide waarden minstens 5 keer voorkomen.
- **Restrisico** (D2 §7.9, K P11): de regels houden afleiden in één stap tegen (totaal min de getoonde delen, een selectie min een buur, twee indelingen van dezelfde vraag, toetsen over kleine cellen). Door veel verschillende uitkomsten over verschillende variabelen en selecties te combineren, is het in theorie nog mogelijk iets over een kleine groep af te leiden; volledige controle van alle uitkomsten samen is in een browserprogramma niet haalbaar. De onderzoeker heeft de ruwe gegevens toch al (SPSS-export); de regels zorgen dat wat ze **deelt** (stukken, rapporten, Excel, Word) niet per ongeluk kleine groepen laat zien.
- **Referentiewaarden opnieuw maken.** `python3 -I test/referentie/werkbank_referentie.py > test/fixtures/werkbank-referentie.json` (zaad 20261127; de versies van Python, NumPy, SciPy en statsmodels staan in de kop van het JSON-bestand; gecontroleerd met SciPy 1.18.1 en statsmodels 0.15.0). Draai daarna `node --test test/werkbank-statistiek.test.mjs`. `npm test` draait het Python-script niet. Voeg je een referentie toe, zet de nieuwe trekkingen dan **achteraan** in het script (vóór `json.dump`): dan blijven de bestaande waarden in het JSON-bestand gelijk. Wat er vergeleken wordt: beschrijvend, Levene, Student/Welch, Fisher, Yates/G², residuen, aanpassingstoets, ptukey/qtukey, Tukey, Games-Howell, Welch-ANOVA, Dunn, Pearson/Spearman/Holm, betrouwbaarheid, OLS (statsmodels: B, SE, t, p, BI, R², F, VIF, f_test, compare_f_test, residuen), Logit (statsmodels newton: B, SE, p, BI van de odds ratio, LL, omnibus, Wald, Cox & Snell, Nagelkerke, classificatie), gepaarde t en Wilcoxon (SciPy), KMO, Bartlett, PCA, PAF (zelfde stopregel als in JavaScript) en varimax (statsmodels `rotate_factors` met Kaiser-normalisatie, vergeleken na het passend maken van volgorde en teken).

**Eigen datasets (Analyse, onderdeel 6)**
- Groepen met minder dan 5 waarden doen niet mee; samenhang vraagt minstens 10 rijen. Kolommen die over gezondheid lijken te gaan (verzuim, ziekmelding, diagnose, arbo) staan bij het inlezen standaard uit, net als kolommen met persoonsgegevens.

**Inlezen uit Excel of CSV**
- Het bestand wordt in de browser gelezen; de server krijgt alleen de gekozen gegevens en controleert die opnieuw met dezelfde regels als bij handmatige invoer of invullen. Elke reeks wordt ondeelbaar opgeslagen (alles of niets).
- Ingelezen antwoorden krijgen, net als ingevulde vragenlijsten, een willekeurig id en alleen een datum; alleen antwoorden op bestaande vragen worden bewaard.

**Beheerder**
- **Wachtwoord:** wordt in constante tijd vergeleken.
- **Sessie:** een willekeurige sleutel in een cookie (`__Host-`, HttpOnly, Secure, SameSite=Strict) die 12 uur geldig is. In de database staat alleen een hash van die sleutel.
- **Raadpogingen:** maximaal 10 mislukte pogingen per afzender per 15 minuten. Voor dat tellen wordt een niet terug te rekenen code bewaard die na een dag wordt gewist. Voor alle afzenders samen geldt maximaal 200.
- **Andere websites:** verzoeken vanaf een andere website worden geweigerd.

**Bibliotheek**
- Er is geen bibliotheekroute onder `/api/kijk`; alles staat achter de beheerlogin (PR-18). Een meelezer krijgt van een bron alleen de APA-velden als die in een gedeeld rapport genoemd wordt (dat bouwt P6).
- `bronnen.notities` en `bron_koppelingen.notitie` gaan nooit in een rapport of RIS-bestand (RIS alleen met de optie *Eigen notities meenemen*); wel in de eigen Excel-export als die optie aan staat, en in de volledige JSON.
- Links worden alleen bewaard als ze met `http://` of `https://` beginnen en alleen als link getoond via `h()` (met `rel="noopener noreferrer"`).
- Een bron die in een rapport genoemd wordt (zoeken met `GLOB '*@<sleutel>[^a-z0-9]*'` in de rapporttekst), wordt alleen na bevestiging verwijderd.

**Coderen**
- Een codering hoort bij één antwoord (het willekeurige `inzendingen.id` plus de vraag) of bij één stuk eigen invoer van de soort interview of observatie. De server controleert dat de inzending bij een vragenlijst van dit onderzoek hoort, dat de vraag een open vraag van die vragenlijst is en dat er iets is ingevuld (bij eigen invoer: dat het een interview of observatie van dit onderzoek is). `PUT /onderzoeken/:id/coderingen` vervangt de codes van één stuk in één batch.
- `GET /onderzoeken/:id/codering` geeft de JSON zoals de database hem opbouwt (geen werk per codering in de Worker), met de coderingen in delen van hooguit 10.000 (`?na=<id>`, het veld `volgende`); de schermen gebruiken deze route niet (zij lezen `export/data`).
- `codering-regels.js coderingFeiten` (voor het rapport, P6) neemt alleen vragen met minstens 5 niet-lege antwoorden op; aantallen per code gaan door `verbergReeks` over [codes…, antwoorden zonder code]. Citaten alleen met `gecontroleerd = 1` én `in_rapport = 1` (de server weigert `in_rapport` zonder `gecontroleerd`; een nieuwe tekst zet beide terug op 0), en bij een vragenlijst alleen bij een vraag met minstens 5 antwoorden. Elk citaat uit een vragenlijst draagt `lijst_id` en `vraag_id`, zodat het rapport bij een meelezer zonder tussenstand de citaten uit lijsten die op de peildatum open waren kan weglaten (PR-13; de vraagtekst is daarvoor niet genoeg, want een gekopieerde vraag heeft dezelfde tekst).
- Grenzen: 200 codes, 50.000 coderingen en 300 citaten per onderzoek; een citaat hooguit 1.000 tekens.

**Overig**
- Er geldt een strikte Content-Security-Policy, de app wordt niet door zoekmachines geïndexeerd en geeft geen *referrer* door.
- Het logboek van Cloudflare (*observability*) staat uit.
- **Kanttekening:** Cloudflare verwerkt verzoeken in het datacenter dat het dichtst bij de bezoeker staat; voor Nederlandse bezoekers is dat in de praktijk in Europa. Dat verzoeken altijd binnen de EU worden afgehandeld, kan Cloudflare alleen garanderen met *Regional Services* (Enterprise, betaald). De opgeslagen gegevens staan wel gegarandeerd in de EU.

## Een nieuwe versie online zetten

Je hebt nodig:
- een computer met [Node.js](https://nodejs.org) (versie 20 of hoger);
- de code uit GitHub;
- een Cloudflare API-sleutel met de rechten *Workers Scripts: Edit*, *D1: Edit*, *Account Settings: Read*, *User Details: Read* en *Memberships: Read*.

Zet de code klaar en installeer Wrangler, de enige hulptool:

```bash
git clone https://github.com/Kaveano/onderzoeksomgeving.git
```

```bash
cd onderzoeksomgeving
```

```bash
npm install
```

Lokaal testen:

```bash
npm test
```

De servertests starten elk een eigen lokale testserver met een lege database, op een vaste poort: `api` 8799, `sjablonen` 8798, `delen` 8797, `rapport` 8796, `inlezen` 8795 en `fundament` 8790 (de uitbreidingen gebruiken 8788 tot en met 8794; de bibliotheek 8794 en het coderen 8789, met inspectiepoort 9794 en 9789). `migratie` en `dashboard-rekenen` hebben geen poort nodig; ze werken rechtstreeks op een tijdelijke lokale database. Zorg dat die poorten vrij zijn.

Database-aanpassingen doorvoeren, als er nieuwe bestanden in `migrations/` staan. Doe dit altijd **vóór** het online zetten:

```bash
npx wrangler d1 migrations apply DB --remote
```

**Eerst een reservekopie bij migratie 0011.** Migratie `0011_vragen_cijfer_kenmerk.sql` bouwt de tabel `vragen` opnieuw op (voor het vraagtype cijfer en het achtergrondkenmerk). Alle vragen, verwijzingen en antwoorden blijven daarbij staan; dat controleert `test/migratie.test.mjs` elke keer op een lokale kopie met voorbeeldgegevens. Maak toch eerst een reservekopie van de live database:

```bash
npx wrangler d1 export onderzoeksomgeving --remote --output backup-voor-0011.sql
```

Wil je extra zeker zijn, probeer de migraties dan eerst op een lokale kopie van die reservekopie: `npx wrangler d1 execute DB --local --file backup-voor-0011.sql`, daarna `npm run db:lokaal`. Gaat er live toch iets mis, dan zet je de database met D1 Time Travel terug naar het moment vóór de migratie (`npx wrangler d1 time-travel restore onderzoeksomgeving --timestamp=<tijdstip>`). Migraties 0012 tot en met 0015 voegen alleen nieuwe tabellen en hun indexen toe. Elke verwijzing met `ON DELETE CASCADE` of `SET NULL` heeft een index die met die kolom begint (bijvoorbeeld `coderingen(inzending_id)`); anders doorzoekt SQLite bij elke verwijderde inzending de hele tabel. `test/migratie.test.mjs` controleert dat voor alle nieuwe tabellen.

**Standaardsjablonen bijwerken (migratie 0017).** De standaardsjablonen staan in de database. Verandert hun inhoud in de code (`src/sjablonen.js`, `src/sjablonen-extra.js`), dan werkt een gegenereerde migratie de sjablonen bij die de onderzoeker niet zelf heeft aangepast: alleen als naam, omschrijving en inhoud nog precies gelijk zijn aan de vorige versie. Zo'n migratie maak je met:

```bash
node scripts/sjablonen-migratie.mjs <oude-commit> --uit migrations/0017_sjablonen_kenmerken.sql
```

`<oude-commit>` is de versie die nu live staat (voor 0017: `4e7aa5e`). Het script haalt die versie uit git, zet de sjablonen van beide versies in hun vaste vorm en schrijft per gewijzigd sjabloon één `UPDATE … WHERE bron = … AND naam = … AND omschrijving = … AND inhoud = …` (elk ongeveer 30 KB, ruim onder de 100 KB per opdracht). De sjabloonmigratie moet altijd het **hoogste nummer** hebben; verandert er later weer iets aan de sjablonen, maak hem dan opnieuw. `test/vraagmodel.test.mjs` controleert dat elke nieuwe inhoud precies gelijk is aan de code en dat de oude inhoud is wat migratie 0010 erin zette; `test/vraagmodel-api.test.mjs` voert 0017 uit op een database met de oude sjablonen en controleert dat ze daarna "gewijzigd: nee" lezen (en dat een aangepast sjabloon blijft staan).

Online zetten:

```bash
npx wrangler deploy
```

Wrangler vraagt bij de eerste keer om in te loggen bij Cloudflare. Je kunt ook vooraf `CLOUDFLARE_API_TOKEN` instellen.

Lokaal proberen kan met `npm run db:lokaal` en daarna `npm run dev`. Zet voor lokaal gebruik een bestand `.dev.vars` neer met de regel `BEHEER_WACHTWOORD=een-lokaal-testwachtwoord`. Dat bestand gaat niet mee naar GitHub.

## De startcollectie van de bibliotheek

<!-- [P5] Startcollectie -->

De startcollectie zijn openbare bronnen die een onderzoeksteam heeft gecontroleerd. Ze komen met een migratie in de database (`migrations/0016_bibliotheek_start.sql`), niet in de code van de Worker. Bronnen uit de startcollectie zijn alleen-lezen: de gebruiker kan notities toevoegen, koppelen, verbergen en een eigen kopie maken, maar niet aanpassen of verwijderen (`PUT /bibliotheek/:id` accepteert bij een startbron alleen `notities`).

**De migratie maken** (eenmalig per versie van de collectie):

```bash
node scripts/startcollectie.mjs data/startcollectie.json
```

Het script:
- zet elk record om (`normaliseerStartbron`) en controleert het met dezelfde regels als de server (`controleerBron`). Bij een harde fout (geen titel, geen link en geen DOI, onbekende soort, geen bekend onderwerp) stopt het zonder iets te schrijven. **Los zo'n fout op door het onderzoeksteam te vragen; vul nooit zelf iets in.**
- legt per bron een vaste `sleutel` en `citeersleutel` vast in `data/startcollectie-sleutels.json` (op DOI, anders op titel en jaar). Een nieuwe bron krijgt de `sleutel` uit het record zelf als die past (`^[a-z][a-z0-9-]{2,79}$`) en maar één keer voorkomt. Wijzig dat bestand niet met de hand: rapporten verwijzen naar de citeersleutels.
- schrijft de migratie: per bron één `INSERT … WHERE NOT EXISTS`, die nooit iets overschrijft. Heeft de gebruiker zelf al een bron met dezelfde citeersleutel, dan krijgt de startbron die sleutel met `st` erachter (bijvoorbeeld `bakker2017st`). Elke opdracht blijft onder 18 KB.
- herkent onderwerpen aan de sleutel, de naam, een sjabloon-id of een andere naam uit `ONDERWERP_ALIASSEN` in `bibliotheek-regels.js` (bijvoorbeeld de sleutels van het onderzoeksteam: `onderzoeksmethode`, `privacy-ethiek`, `tevredenheid-bevlogenheid`, `vertrek-verloop`, `diversiteit-inclusie`, `wet-regelgeving` → onderwerp "Wet- en regelgeving").
- leest bij een artikel zonder losse tijdschriftvelden het tijdschrift, de jaargang, het nummer en de pagina's (of het artikelnummer) uit `bron_details` als daar "Tijdschrift, 22(3), 273–285" staat; een toelichting daarachter wordt gemeld en niet overgenomen. Bij een webpagina en een rapport leest het alleen wat ondubbelzinnig is (`leesStartDetails`): de datum van een nieuwsbericht of de wijzigingsdatum die op de pagina staat (alleen als het jaar klopt; niet een datum uit de paginametadata), de naam van de website ("Webpagina op Arboportaal"; niet een webadres zoals "www.arboportaal.nl", en niet als die gelijk is aan de organisatie of de afkorting) en het rapportnummer ("TNO-rapport TNO 2021 R11794", "SER-advies 22/03"; alleen met een letter direct voor de cijfers of met één schuine streep, dus nooit een jaartal of datum zoals "Rapport 2023" of "Advies 3 november 2020"). Wat niet is overgenomen, staat in de melding.
- leest de auteurs met `leesAuteur`. Een voorvoegsel met een hoofdletter vooraan de achternaam hoort bij de achternaam (Vlaamse of buitenlandse naam: "De Witte, H.", "De Dreu, C. K. W.", in de lijst gesorteerd onder D); met een kleine letter is het een Nederlands tussenvoegsel ("de Vroome, E. M. M." → in de lijst "Vroome, E. M. M. de.", gesorteerd onder V, in de tekst "De Vroome"). Dat volgt de APA 7-gids van de Radboud Universiteit ("APA en Nederlandse conventies"), een besluit van het onderzoeksteam; dezelfde regel geldt bij "Plak een verwijzing" en RIS. Een buitenlandse auteur die zijn voorvoegsel zelf met een kleine letter schrijft, houdt het bij de achternaam, zoals hij het schrijft (APA 7). Aan een tekst zie je dat niet, dus het onderzoeksteam levert zo'n naam als object: `{"achternaam": "de Montjoye", "tussenvoegsel": "", "voorletters": "Y.-A."}` (record 37, Y.-A. de Montjoye, besluit van het onderzoeksteam) → in de lijst "Rocher, L., Hendrickx, J. M., & de Montjoye, Y.-A. (2019).", letter voor letter gesorteerd op "deMontjoye". Het is de enige auteur in die vorm; alle andere namen zijn tekst, dus Nederlandse namen veranderen niet (een test bewaakt dat). In de tekst begint ook zo'n naam met een hoofdletter ("De Montjoye (2019)"); in de startcollectie staat hij nooit vooraan.
- zet een afkorting tussen haakjes achter de organisatie apart ("Centraal Bureau voor de Statistiek (CBS)" → organisatie + afkorting `CBS`, citeersleutel `cbs2025`, in de tekst "(CBS, 2025)").
- maakt van de betrouwbaarheid van het onderzoeksteam een niveau: `peer-reviewed` → hoog; `overheid` van het CBS → hoog (officiële statistiek); andere `overheid` → redelijk; `kennisinstituut` → redelijk.
- houdt `geraadpleegd` alleen bij inhoud die bedoeld is om te veranderen en niet wordt gearchiveerd (APA 7; besluit van het onderzoeksteam, `metRaadpleegdatum` in `bibliotheek-regels.js`): altijd bij cijfers (zoals een StatLine-tabel), bij een webpagina alleen als die geen eigen datum heeft. Een gedateerd nieuwsbericht of een pagina met "Pagina bijgewerkt op …" krijgt dus de datum en geen "Geraadpleegd op". Een wet of richtlijn houdt de raadpleegdatum uit het record, ook met een eigen datum (het besluit noemt die soorten niet; de geldende tekst van een wet verandert wel). Bij artikelen en rapporten valt het weg (geen veld).
- geeft een webpagina waarvan de datum alleen in de paginametadata staat ("volgens de paginametadata", "geen zichtbare datum") "z.d." in plaats van het jaar, met de raadpleegdatum. De citeersleutel volgt dan ook z.d. (bijvoorbeeld `nederlandsezd`).
- `relevantie` en `open_access` worden niet gebruikt (de bibliotheek heeft er geen veld voor; het script noemt ze één keer).
- toont waarschuwingen: onbekende onderwerpen die als trefwoord zijn overgenomen, `http://` in plaats van `https://`, ingekorte velden, velden die niet bij de soort horen, en een record waarvan de eigen `sleutel` al in het sleutelbestand staat terwijl het niet op DOI of titel en jaar wordt herkend ("Let op (sleutels)"). Dat laatste gebeurt als het jaar of de titel van een bron zonder DOI verandert: de bron zou er dan dubbel in komen. Bij versie 1 die nog nergens live staat, maak je het sleutelbestand dan opnieuw (verwijder `data/startcollectie-sleutels.json` en draai het script met `--datum` van de collectie); bij een latere versie moet dat eerst worden uitgezocht.
- geeft met dezelfde invoer altijd precies dezelfde migratie (`--controle` controleert dat zonder iets te schrijven).

Een proef op een tijdelijke map: `node scripts/startcollectie.mjs test/fixtures/startcollectie-voorbeeld.json --uit /tmp/proef` (drie verzonnen records; `test/bibliotheek-api.test.mjs` doet dit en voert de migratie uit op een verse database).

**Een nieuwe versie van de collectie**: pas `data/startcollectie.json` aan en maak een **nieuwe** migratie met het volgende vrije nummer: `node scripts/startcollectie.mjs data/startcollectie.json --versie 2 --bestand 00NN_bibliotheek_start_v2.sql`. Voor bronnen die er al waren komt er dan ook een `UPDATE … WHERE sleutel = ? AND collectie = 'start'` bij (dat mag, want startbronnen zijn alleen-lezen); notities, koppelingen en verbergen blijven staan. Pas een migratie die al live is gegaan nooit meer aan.

**Grenzen**: hooguit 1.000 bronnen in de bibliotheek. Een RIS-bestand gaat in delen van hooguit 25 bronnen (en 480 KB) naar `POST /bibliotheek/reeks`, zodat de controle op dubbele bronnen ruim binnen de rekentijd blijft (`planReeks` maakt de vergelijkingssleutels van de bibliotheek één keer; een test bewaakt de tijd); de lijst gaat in delen van hooguit 700.000 tekens (de database bouwt de JSON op, de Worker plakt hem alleen door).

## Later: eigen subdomein (onderzoek.afpartners.nl)

Dit kan alleen als het domein **afpartners.nl in Cloudflare wordt beheerd**: de nameservers wijzen dan naar Cloudflare. Dat is gratis.

- Staat het domein nog bij een andere partij, dan moet het domeinbeheer eerst naar Cloudflare. Dat raakt je website en e-mail, dus doe dat zorgvuldig en met hulp.
- Staat het domein al bij Cloudflare, dan is het eenvoudig:
  1. Ga naar Cloudflare › Workers & Pages › **onderzoek** › **Settings** › **Domains & Routes** › **+ Add** › **Custom domain**.
  2. Vul `onderzoek.afpartners.nl` in.
  3. Cloudflare regelt de DNS en het certificaat.

  Respondentlinks met het oude adres blijven werken.

## API-sleutel

De API-sleutel waarmee deze versie online is gezet:
- heet **onderzoeksomgeving**;
- verloopt op 26 november 2027;
- heeft geen rechten op je domeinen.

Je kunt hem intrekken bij Cloudflare › My Profile › **API Tokens**.
