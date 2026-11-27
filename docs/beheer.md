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
| Rapporten, deellinks, eigen datasets | In de database (tabellen `rapporten`, `deellinks`, `datasets`) | Gaan mee bij **Alles samen (JSON)**; worden verwijderd met het onderzoek |
| Code | GitHub-repository `onderzoeksomgeving` | |
| Gegevens in de browser | `public/js/beheer/gegevens.js` | De enige manier waarop schermen aan de antwoorden komen: één kopie per onderzoek per sessie, daarna alleen veranderde vragenlijsten (zie "Grote onderzoeken") |
| Verschilwacht | `public/js/beheer/verschilwacht.js` | Waarschuwt als een meelezer twee uitkomsten kan vergelijken die 1 tot 4 respondenten verschillen |
| Belastingtest | `scripts/belasting.mjs` | Meet hoe groot een onderzoek kan worden op de gratis laag (zie "Belastingtest") |

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

**Rapporten**
- De feiten in een rapport worden in de browser met vaste regels uit de gegevens samengesteld (geen AI) en met een peildatum in de database vastgelegd. Uitkomsten van minder dan 5 respondenten worden niet opgenomen.
- Een toets (verloop tussen meetmomenten) gebruikt themascores per respondent, het dashboard alle losse antwoorden. Vallen in een vragenlijst 1 tot 4 gedeeltelijk ingevulde respondenten weg, dan wordt die toets niet getoond (anders zijn hun antwoorden uit de twee getallen terug te rekenen).

**Vergelijken van uitkomsten (verschilwacht)**
- `verschilwacht.js` verzamelt voor alle actieve deellinks wat een meelezer kan zien: per gedeeld rapport de vastgelegde n per vragenlijst (`GET /onderzoeken/:id/rapporten` geeft `lijsten_n`) en of het live dashboard gedeeld is. Een uitkomst van minder dan 5 respondenten toont niets en telt dus niet mee.
- Weer openzetten van een gesloten, gedeelde vragenlijst en antwoorden inlezen waardoor er 1 tot 4 respondenten bijkomen, geven een waarschuwing (geen blokkade). Kan de controle niet worden gedaan (geen verbinding), dan gaat de actie gewoon door.

**Exportbestanden**
- Excel, SPSS, de antwoorden als CSV en de volledige JSON bevatten alle losse antwoorden. Afronden vraagt daarom eerst bevestiging (K S10). Een rapport heet *geschikt om te delen*.
- Het willekeurige id van een inzending komt alleen via `export/inzendingen` bij de ingelogde beheerder (voor coderen). In de volledige JSON staan in plaats daarvan vragenlijst en respondentnummer.

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

De servertests starten elk een eigen lokale testserver met een lege database, op een vaste poort: `api` 8799, `sjablonen` 8798, `delen` 8797, `rapport` 8796, `inlezen` 8795 en `fundament` 8790 (de uitbreidingen gebruiken 8788 tot en met 8794). `migratie` en `dashboard-rekenen` hebben geen poort nodig; ze werken rechtstreeks op een tijdelijke lokale database. Zorg dat die poorten vrij zijn.

Database-aanpassingen doorvoeren, als er nieuwe bestanden in `migrations/` staan. Doe dit altijd **vóór** het online zetten:

```bash
npx wrangler d1 migrations apply DB --remote
```

**Eerst een reservekopie bij migratie 0011.** Migratie `0011_vragen_cijfer_kenmerk.sql` bouwt de tabel `vragen` opnieuw op (voor het vraagtype cijfer en het achtergrondkenmerk). Alle vragen, verwijzingen en antwoorden blijven daarbij staan; dat controleert `test/migratie.test.mjs` elke keer op een lokale kopie met voorbeeldgegevens. Maak toch eerst een reservekopie van de live database:

```bash
npx wrangler d1 export onderzoeksomgeving --remote --output backup-voor-0011.sql
```

Wil je extra zeker zijn, probeer de migraties dan eerst op een lokale kopie van die reservekopie: `npx wrangler d1 execute DB --local --file backup-voor-0011.sql`, daarna `npm run db:lokaal`. Gaat er live toch iets mis, dan zet je de database met D1 Time Travel terug naar het moment vóór de migratie (`npx wrangler d1 time-travel restore onderzoeksomgeving --timestamp=<tijdstip>`). Migraties 0012 tot en met 0015 voegen alleen nieuwe tabellen en hun indexen toe. Elke verwijzing met `ON DELETE CASCADE` of `SET NULL` heeft een index die met die kolom begint (bijvoorbeeld `coderingen(inzending_id)`); anders doorzoekt SQLite bij elke verwijderde inzending de hele tabel. `test/migratie.test.mjs` controleert dat voor alle nieuwe tabellen.

Online zetten:

```bash
npx wrangler deploy
```

Wrangler vraagt bij de eerste keer om in te loggen bij Cloudflare. Je kunt ook vooraf `CLOUDFLARE_API_TOKEN` instellen.

Lokaal proberen kan met `npm run db:lokaal` en daarna `npm run dev`. Zet voor lokaal gebruik een bestand `.dev.vars` neer met de regel `BEHEER_WACHTWOORD=een-lokaal-testwachtwoord`. Dat bestand gaat niet mee naar GitHub.

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
