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


## Privacy en beveiliging (technisch)

**Respondenten**
- Er wordt geen naam, e-mailadres, IP-adres, browserinformatie of tijdstip opgeslagen; alleen de datum en de antwoorden.
- Elke inzending krijgt een willekeurig id, zodat de volgorde van invullen niet te herleiden is.
- Limieten per link: 100 inzendingen per 10 minuten, 1.000 per dag en optioneel een maximum in totaal. Die worden ondeelbaar gecontroleerd.
- Er is een lokaas-veld tegen robots.

**Dashboard**
- Er worden geen groepen of getallen getoond die op minder dan 5 respondenten berusten.
- Waar nodig worden ook andere groepen of getallen verborgen, zodat niets uit het totaal terug te rekenen is.

**Deellinks (meelezers)**
- Een meelezer heeft de link (`/d/<code>`, niet te raden) én een toegangscode van 10 tekens nodig. Van de toegangscode staat alleen een hash met zout in de database.
- Na 5 verkeerde codes per afzender per link volgt 15 minuten wachttijd; voor alle afzenders samen geldt maximaal 50 per link (beide ondeelbaar geteld). Voor dat tellen wordt dezelfde niet terug te rekenen afzendercode bewaard als bij het inloggen; die wordt na een dag gewist.
- Een meelezer krijgt een eigen sessiecookie per link (`__Host-kijk-…`, HttpOnly, Secure, SameSite=Strict, 8 uur). Intrekken, een nieuwe code, verlopen of verwijderen beëindigt lopende sessies direct.
- De server geeft een meelezer alleen wat is aangevinkt. Uitkomsten van een vragenlijst, vraag, thema of meetmoment met minder dan 5 respondenten worden aan de serverkant weggelaten, net als open antwoorden (tenzij aangevinkt) en links naar vragenlijsten. Een thema of meetmoment met een vraag van minder dan 5 respondenten valt ook weg, net als punten in het verloop die op een kleine of nog open vragenlijst berusten.
- Vragenlijsten die nog openstaan, krijgt een meelezer alleen als "tussenstand" is aangevinkt (anders is het antwoord van een nieuwe respondent af te leiden door twee keer te kijken).
- Een rapport wordt voor een meelezer aan de serverkant opgebouwd uit de vastgelegde feiten, alleen met de hoofdstukken die aanstaan.
- Van meelezers wordt alleen de datum van het laatste bezoek per link bewaard, plus bij verkeerde toegangscodes de afzendercode (een dag).

**Rapporten**
- De feiten in een rapport worden in de browser met vaste regels uit de gegevens samengesteld (geen AI) en met een peildatum in de database vastgelegd. Uitkomsten van minder dan 5 respondenten worden niet opgenomen.

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

Database-aanpassingen doorvoeren, als er nieuwe bestanden in `migrations/` staan. Doe dit altijd **vóór** het online zetten:

```bash
npx wrangler d1 migrations apply DB --remote
```

**Eerst een reservekopie bij migratie 0011.** Migratie `0011_vragen_cijfer_kenmerk.sql` bouwt de tabel `vragen` opnieuw op (voor het vraagtype cijfer en het achtergrondkenmerk). Alle vragen, verwijzingen en antwoorden blijven daarbij staan; dat controleert `test/migratie.test.mjs` elke keer op een lokale kopie met voorbeeldgegevens. Maak toch eerst een reservekopie van de live database:

```bash
npx wrangler d1 export onderzoeksomgeving --remote --output backup-voor-0011.sql
```

Wil je extra zeker zijn, probeer de migraties dan eerst op een lokale kopie van die reservekopie: `npx wrangler d1 execute DB --local --file backup-voor-0011.sql`, daarna `npm run db:lokaal`. Gaat er live toch iets mis, dan zet je de database met D1 Time Travel terug naar het moment vóór de migratie (`npx wrangler d1 time-travel restore onderzoeksomgeving --timestamp=<tijdstip>`). Migraties 0012 tot en met 0015 voegen alleen nieuwe tabellen toe.

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
