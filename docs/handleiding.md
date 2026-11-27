# Handleiding Onderzoeksomgeving

Adres: **https://onderzoek.af-partners.workers.dev**
(later eventueel **onderzoek.afpartners.nl**; zie [beheer.md](beheer.md))

De onderzoeksomgeving heeft twee delen:

- **De beheeromgeving.** Alleen voor jou, achter een wachtwoord. Hier richt je onderzoeken in, maak je vragenlijsten, volg je de resultaten en schrijf je je stukken.
- **De openbare vragenlijst.** Respondenten openen een link zoals `…/v/Ab3dE…`. Ze hebben geen account nodig.
- **De inzage voor meelezers.** Een opdrachtgever of ondernemingsraad kan met een deellink (`…/d/…`) en een toegangscode de resultaten bekijken, zonder iets te kunnen wijzigen. Zie hoofdstuk 10.

De tabbladen van een onderzoek: **Dashboard · Analyse · Opzet · Vragenlijsten · Eigen invoer · Stukken · Rapport · Acties · Delen · Afronden**.

---

## 1. Inloggen

1. Ga naar het adres hierboven.
2. Vul je beheerwachtwoord in en klik op **Inloggen**.
   - Je stelt dit wachtwoord zelf in bij Cloudflare (zie [beheer.md](beheer.md), "Wachtwoord instellen of wijzigen").
3. Je blijft 12 uur ingelogd.
   - Verloopt je sessie terwijl je bezig bent, dan verschijnt een inlogvenster over je scherm. Wat je had ingevuld blijft staan.
   - Log op een gedeelde computer altijd uit met **Uitloggen** rechtsboven.

Na 10 verkeerde pogingen moet je 15 minuten wachten.

## 2. Een onderzoek starten

Klik op **Onderzoeken** en dan op **+ Nieuw onderzoek**. Je doorloopt vier stappen:

1. **Gegevens.** Vul de bedrijfsnaam, een titel (bijvoorbeeld "Medewerkersonderzoek 2026") en de onderzoeksvraag in.
2. **Sjablonen kiezen.** Vink één of meer sjablonen aan, of kies **Zonder sjabloon beginnen**.
   - Met **Bekijk inhoud** zie je vooraf welke thema's en vragen erin zitten.
   - Kies je er meer dan één, dan worden ze samengevoegd: thema's met dezelfde naam vallen samen en dubbele vragen komen maar één keer voor.
3. **Inhoud aanpassen.** Je ziet nu alles wat het onderzoek gaat bevatten, en je kunt het hier volledig aanpassen voordat er iets wordt aangemaakt:
   - de uitleg voor respondenten;
   - thema's en meetpunten;
   - alle vragen, met hun antwoordmogelijkheden;
   - de acties.

   Vink **Bewaar dit ook als nieuw sjabloon** aan als je deze aangepaste versie later opnieuw wilt gebruiken.
4. **Aanmaken.** Controleer de samenvatting en klik op **Onderzoek aanmaken**. Je komt op het tabblad **Opzet**.

Het onderzoek krijgt automatisch een meetmoment **Nulmeting**, één vragenlijst met de gekozen vragen en drie stukken (Notities, Bevindingen, Conceptrapport). Ook daarna blijft alles aan te passen.

Meerdere onderzoeken kunnen tegelijk lopen. Ze staan op het startscherm onder **Lopende onderzoeken**.

### Sjablonen beheren

Onder **Sjablonen** (bovenin het menu) staan alle sjablonen. Er worden er twaalf meegeleverd:

- Medewerkerstevredenheid
- HR-processen
- Arbeidsvoorwaarden
- Verzuim en vitaliteit
- Werkdruk en werkstress
- Leiderschap en leidinggeven
- Onboarding van nieuwe medewerkers
- Vertrekonderzoek (exitonderzoek)
- Sociale veiligheid, diversiteit en inclusie
- Hybride en plaatsonafhankelijk werken
- Verandering en organisatiecultuur
- Ontwikkeling en loopbaan

Wat je met een sjabloon kunt doen:

- **Bewerken:** alles aanpassen, ook bij de meegeleverde sjablonen. Dat geldt voor de naam, de uitleg, thema's, meetpunten, vragen, antwoordmogelijkheden en acties.
- **Kopie maken:** een variant maken zonder het origineel te veranderen.
- **+ Nieuw sjabloon:** helemaal zelf een sjabloon opbouwen.
- **Herstel origineel:** een aangepast meegeleverd sjabloon terugzetten naar de oorspronkelijke versie.
- **Standaardsjablonen terugzetten:** meegeleverde sjablonen terughalen die je hebt verwijderd.
- **Gebruiken voor nieuw onderzoek:** direct een onderzoek starten met dit sjabloon.

Typ in een tekst `{bedrijf}` op de plek waar de bedrijfsnaam moet komen. Die wordt bij het aanmaken van een onderzoek automatisch ingevuld.

**Let op bij gevoelige onderwerpen**
- **Sociale veiligheid:** zet in de uitleg voor respondenten de naam en contactgegevens van de vertrouwenspersoon voordat je de vragenlijst openzet.
- **Vertrekonderzoek en onboarding:** het aantal respondenten is meestal klein. Houd de vragenlijst langere tijd open en rapporteer pas bij minimaal 5 respondenten. Overweeg de achtergrondvragen (afdeling, diensttijd) weg te laten.

**Verbeteringen in de meegeleverde sjablonen.** Als de meegeleverde sjablonen worden verbeterd, krijg je die verbetering alleen in sjablonen die je zelf nog niet hebt aangepast. Heb je een sjabloon wel bewerkt, dan blijft jouw versie staan; met **Herstel origineel** haal je de nieuwe versie op. Lopende onderzoeken veranderen nooit mee.

De vragen in de sjablonen zijn zelf geformuleerd als praktisch vertrekpunt. Het zijn geen wetenschappelijk gevalideerde meetinstrumenten.

### Opzet: thema's, meetpunten en meetmomenten

- **Thema**: een onderwerp, bijvoorbeeld *Werkdruk en balans*.
- **Meetpunt**: iets wat je binnen een thema meet, bijvoorbeeld *Ervaren werkdruk* of *Verzuimpercentage*.
- **Meetmoment**: bijvoorbeeld *Nulmeting* en *Vervolgmeting*. Vragenlijsten en eigen invoer koppel je aan een meetmoment. Zo zie je op het dashboard het verloop.

Je kunt alles toevoegen, wijzigen, verwijderen en in een andere volgorde zetten.

- Een thema dat nog vragen of eigen invoer heeft, kun je pas verwijderen als je die eerst hebt verplaatst of verwijderd.
- Met **Opslaan als sjabloon** (onderaan het tabblad Opzet) bewaar je de opzet van dit onderzoek als nieuw sjabloon voor het volgende bedrijf. De bedrijfsnaam wordt dan automatisch vervangen door `{bedrijf}`.

## Bibliotheek: bronnen voor je onderzoek

<!-- [P5] Bibliotheek. Bewust zonder nummer, zodat de nummers van de andere hoofdstukken gelijk blijven; P6 nummert bij de eindcontrole. -->

Bovenin staat naast **Onderzoeken** en **Sjablonen** de **Bibliotheek**: één verzameling bronnen voor al je onderzoeken. Hier zoek je onderzoek, rapporten, boeken, wetten en websites om je onderzoek op te baseren, en bewaar je je eigen bronnen.

**Twee soorten bronnen**
- **Startcollectie**: openbare bronnen over HR-onderzoek, gecontroleerd door een onderzoeksteam. Deze bronnen kun je niet aanpassen, zodat ze kloppen zoals ze zijn gecontroleerd. Wel kun je er **eigen notities** bij zetten, ze aan een onderzoek koppelen en ze **verbergen** als je ze niet wilt zien. Wil je iets veranderen, kies dan **Eigen kopie maken**; die kopie kun je wel aanpassen. Verborgen bronnen haal je terug met **Startcollectie terugzetten** bovenaan de bibliotheek, of met **Weer tonen** bij de bron zelf. Staat er nog niets in de startcollectie, dan zie je: "De startcollectie wordt nog toegevoegd. Je kunt nu al eigen bronnen toevoegen."
- **Eigen bronnen**: wat je zelf toevoegt, plakt of inleest. Die kun je aanpassen en verwijderen.

**Zoeken**
- Typ een paar woorden, bijvoorbeeld *verzuim jongeren* of *werkdruk zorg*. Je hoeft niet precies te typen: *medewerkers* vindt ook *medewerker*, *verzuim* vindt ook *ziekteverzuim*, en *verloop* vindt ook bronnen over *turnover* of *uitstroom*.
- Zet woorden tussen aanhalingstekens om ze precies zo samen te vinden: *"nieuwe medewerkers"*.
- Eerst zie je bronnen met al je woorden. Zijn die er niet, dan zie je bronnen met een deel van de woorden (dat staat er dan bij).
- Met de **filters** kies je onderwerp, soort bron, jaar, taal, collectie, betrouwbaarheid en bronnen met eigen notities. Op een telefoon klap je de filters open met **Filters**.
- **Sorteren op**: Best passend, Nieuwste eerst, Oudste eerst, Titel, Auteur of Laatst toegevoegd.

**Een bron toevoegen**
1. Klik op **+ Bron toevoegen**.
2. Het snelst: open **Plak een verwijzing** en plak een verwijzing, bijvoorbeeld uit Google Scholar (knop *Citeer*, kies *APA*). Klik op **Velden invullen**. De app vult soort, auteurs, jaar, titel, tijdschrift, jaargang, nummer, pagina's en DOI of link in. Wat hij niet herkent, staat eronder ("Deze velden zijn niet herkend: …"). **Controleer daarna alle velden**; de app zoekt niets op internet op.
3. Is een organisatie de auteur, zoals CBS of TNO? Laat de auteurs leeg en vul de organisatie in, met een afkorting voor in de tekst (bijvoorbeeld CBS).
4. Geen jaartal? Laat het jaar leeg; in de verwijzing staat dan *z.d.* (zonder datum).
5. Een DOI heeft de voorkeur boven een link.
6. Kies onderwerpen, de betrouwbaarheid en eventueel kernpunten (één per regel).
7. Klik op **Opslaan**. De bron krijgt een vaste code voor rapporten, bijvoorbeeld `[@bakker2017]`. Staat de bron er al in (zelfde DOI, of zelfde titel en jaar), dan vraagt de app eerst of je hem toch apart wilt toevoegen.

**Citeer**: bij elke bron laat **Citeer** zien hoe je ernaar verwijst, met een knop **Kopieer** per vorm:
- in de literatuurlijst (APA, 7e editie, Nederlandse schrijfwijze), bijvoorbeeld *Bakker, A. B., & Demerouti, E. (2017). …*;
- in je tekst tussen haakjes: *(Bakker & Demerouti, 2017)*;
- in je tekst in de zin: *Bakker en Demerouti (2017)*;
- de code voor een rapport: `[@bakker2017]`.
Een organisatie met een afkorting noem je de eerste keer voluit: *(Centraal Bureau voor de Statistiek [CBS], 2024)*, daarna *(CBS, 2024)*.

**Koppelen aan een onderzoek**: met **Koppel aan onderzoek** zet je een bron bij een onderzoek, eventueel met waarvoor je hem gebruikt. Je ziet de bronnen van een onderzoek in het tabblad **Rapport**, onderdeel **Bronnen**. Daar vind je ook **Passende bronnen zoeken** (op grond van de thema's en de onderzoeksvraag), **Bron uit de bibliotheek koppelen** en de literatuurlijst (Word) of RIS van die bronnen.

**Eigen notities** zijn alleen voor jou. Ze komen nooit in een rapport, een deellink of een RIS-bestand (tenzij je bij exporteren zelf **Eigen notities meenemen** aanzet).

**Importeren en exporteren**
- **Importeren**: kies een RIS-bestand (.ris) uit Zotero, Mendeley of EndNote. Je ziet eerst hoeveel bronnen erin staan en welke al in je bibliotheek staan; die worden overgeslagen.
- **Exporteren**: de gevonden bronnen of de hele bibliotheek, als **Literatuurlijst (Word)**, **Excel** (je eigen overzicht) of **RIS** (om in Zotero, Mendeley of EndNote in te lezen).

**Betrouwbaarheid**: *Hoog* (wetenschappelijk getoetst, officiële statistiek of wet- en regelgeving), *Redelijk* (rapport van een bekend instituut, overheid of vakliteratuur), *Beperkt* (mening, blog, commerciële bron of klein onderzoek zonder verantwoording) of *Nog niet beoordeeld*. Gebruik in een rapport bij voorkeur bronnen met een hoge betrouwbaarheid, en controleer altijd de originele bron.

## 3. Een vragenlijst maken en uitzetten

1. Ga naar het tabblad **Vragenlijsten** en open een vragenlijst met **Bewerken**, of maak een nieuwe.
2. Pas bij **Instellingen** de **Uitleg voor respondenten** aan. Die staat bovenaan de vragenlijst en legt het doel en de anonimiteit uit.
   - De standaardtekst klopt met wat de app werkelijk bewaart. Verander dat deel alleen als je weet wat je doet.
3. Voeg vragen toe met **+ Vraag toevoegen**. Kies het thema, eventueel een meetpunt, en het vraagtype:
   - **Schaal 1 tot 5**, bijvoorbeeld van "helemaal oneens" tot "helemaal eens". Desgewenst met "weet niet".
   - **Meerkeuze**, met één of meerdere antwoorden.
   - **Ja / nee**.
   - **Open tekst**.
4. Zet bij een achtergrondvraag zoals **"Op welke afdeling werk je?"** het vinkje **uitsplitsing** aan. Dan kun je op het dashboard de resultaten per afdeling bekijken.
   - Pas eerst de afdelingen aan; in het sjabloon staan voorbeeldnamen.
5. Bekijk het resultaat met **Voorbeeld** of **Bekijk als respondent**.
6. Klik op **Vragenlijst openzetten**.
7. Klik op **Link kopiëren** en stuur de link naar de medewerkers, bijvoorbeeld per e-mail of intranet. Een kant-en-klare uitnodiging, een herinnering en een QR-code vind je op het tabblad **Delen** (hoofdstuk 10).
8. Heb je de vragenlijst zelf getest? Wis dan je testantwoorden met **Antwoorden wissen** voordat het echte onderzoek begint.

**Tips**
- Vul **Aantal uitgenodigden** in om het responspercentage te zien.
- Met **Maximum aantal inzendingen** stel je een bovengrens in. Elke link kan daarnaast maximaal 100 inzendingen per 10 minuten en 1.000 per dag ontvangen, als bescherming tegen misbruik.
- **Nieuwe link maken** maakt de oude link onbruikbaar, bijvoorbeeld als die op de verkeerde plek terecht is gekomen.
- Zijn er al antwoorden binnen, dan kun je het vraagtype niet meer veranderen. Je kunt een vraag wel herformuleren, maar doe dat alleen als de betekenis gelijk blijft.
- Staan je vragen al in Excel? Lees ze in één keer in (hoofdstuk 6, "Inlezen uit Excel of CSV").

### Een vervolgmeting

1. Voeg bij **Opzet** een meetmoment toe, bijvoorbeeld *Vervolgmeting*.
2. Klik bij **Vragenlijsten** op **Kopie voor volgend meetmoment** en kies dat meetmoment.
3. Zet de kopie open en deel de nieuwe link.

De vragen blijven gekoppeld. Het dashboard laat daardoor per thema en per vraag zien hoe de scores veranderen.

## 4. Resultaten volgen: het dashboard

Het tabblad **Dashboard** toont:

- de **respons** per vragenlijst, ook per dag;
- de **gemiddelde score per thema** en per meetpunt (1 = laag, 5 = hoog);
- de **verdeling van de antwoorden** per vraag;
- het **verloop over de meetmomenten**;
- je **eigen cijfers**, zoals verzuim per kwartaal;
- de **open antwoorden**, in willekeurige volgorde;
- de **uitsplitsing**, bijvoorbeeld per afdeling.

**Anonimiteit**
- Groepen met minder dan **5 respondenten** worden niet getoond. Hetzelfde geldt voor elke score binnen een groep die op minder dan 5 personen berust; die zie je als "<5".
- Kleine groepen worden samengevoegd, zodat ze niet uit het totaal terug te rekenen zijn. Bij **Overige groepen samen** staan alle antwoorden die niet apart te zien zijn, ook antwoorden die niemand gaf, in de volgorde van de vragenlijst. Wie de vraag niet invulde, telt ook mee in die groep, maar wordt niet apart genoemd. De uitleg erbij zegt niet welke groep klein is. Zo verraadt niets waar de paar respondenten zitten.
- Bij een ja/nee-achtergrondvraag is het percentage ja boven de tabel van wie de vraag beantwoordde; de tabel zelf geeft percentages van alle respondenten. Dat staat er ook bij.
- **Achtergrondvragen** (een vraag om op uit te splitsen, zoals afdeling, of een vraag over een kenmerk zoals geslacht) zijn extra beschermd. In de verdeling staat ook **Niet ingevuld**, en de percentages zijn van alle respondenten van de vragenlijst. Een aantal van 1 tot 4 zie je als **×**, net als de kleinste andere aantallen die nodig zijn om het niet terug te rekenen. Zie je ergens een ×, dan staat ook het totaal aantal antwoorden op die vraag er niet bij. Dat geldt voor jou, voor meelezers, in rapporten en bij de uitsplitsing.
- Leg de uitkomsten van verschillende uitsplitsingen niet naast elkaar om kleinere groepen af te leiden.

Met **Neem op in stuk** zet je de cijfers van een kaart als tekst in een van je stukken, bijvoorbeeld in het Conceptrapport.

## 5. Analyse: is een verschil echt?

Het dashboard laat zien wat de uitkomsten zijn. Op het tabblad **Analyse** toets je of een verschil of verband echt is, of dat het ook toeval kan zijn. Het werkt als een klein statistiekprogramma: jij kiest wat je tegen elkaar afzet, en bij elke uitkomst staat in gewone taal wat het betekent.

| Onderdeel | Vraag die je ermee beantwoordt |
|---|---|
| **1. Verschil tussen meetmomenten** | Is de score veranderd tussen bijvoorbeeld de nulmeting en de vervolgmeting? Kan voor één thema, meetpunt of vraag, of voor alle thema's tegelijk. |
| **2. Verschil tussen groepen** | Scoren groepen, bijvoorbeeld afdelingen, verschillend? Je kiest een vraag die je hebt gemarkeerd als uitsplitsing. |
| **3. Samenhang** | Hangen twee scores met elkaar samen, bijvoorbeeld werkdruk en betrokkenheid? Er is ook een overzicht van alle thema's. |
| **4. Betrouwbaarheid van de thema's** | Meten de vragen van een thema samen hetzelfde onderwerp? |
| **5. Verband tussen twee keuzevragen** | Hangen de antwoorden op twee keuzevragen (meerkeuze of ja/nee) met elkaar samen? |
| **6. Eigen dataset onderzoeken** | Wat laat een eigen Excel- of CSV-bestand zien, bijvoorbeeld verzuim per afdeling? Zie hieronder. |

### De uitkomsten lezen

- **Significant** (p kleiner dan 0,05): het is onwaarschijnlijk dat het verschil of verband alleen door toeval komt. **Niet significant**: het kan goed toeval zijn. Dat betekent niet dat er zeker geen verschil is, zeker niet bij weinig respondenten.
- **Effectgrootte**: hoe groot het verschil of verband is, van *verwaarloosbaar* via *klein* en *middelgroot* tot *groot*. Kijk hier altijd naar. Een significant verschil kan in de praktijk heel klein zijn.
- **95%-interval**: de marge waarbinnen het echte verschil waarschijnlijk ligt.
- **Betrouwbaarheid (Cronbachs alfa)**: vanaf ongeveer 0,7 vormen de vragen samen een bruikbare score. Is de waarde lager, kijk dan liever naar de losse vragen.

Met **Neem op in stuk** zet je een uitkomst, met de uitleg erbij, in een van je stukken.

### Goed om te weten

- **Minimale aantallen.** Een vergelijking vraagt minstens 5 respondenten per groep of meetmoment. Samenhang en betrouwbaarheid vragen minstens 10.
- **Kleine groepen.** Groepen met minder dan 5 respondenten doen niet mee en worden alleen bij naam genoemd, zonder getallen. Soms valt daarnaast ook de kleinste andere groep weg, zodat een kleine groep niet uit het totaal is terug te rekenen.
- **Kruistabel en samenhang met ja/nee.** Heeft een combinatie van antwoorden in een kruistabel minder dan 5 respondenten, dan worden de kruistabel en de toets helemaal niet getoond. Bij een samenhang met een ja/nee-vraag gebeurt hetzelfde als minder dan 5 mensen ja (of nee) hebben geantwoord. Anders zou je iets over die kleine groep kunnen afleiden.
- **Gemiddelden kunnen iets afwijken van het dashboard.** Analyse berekent eerst per respondent een score per thema; daarvoor moet iemand minstens de helft van de vragen van dat thema hebben beantwoord. Het dashboard middelt alle losse antwoorden.
- **Meetmomenten worden vergeleken als twee losse groepen.** De antwoorden zijn anoniem, dus dezelfde persoon is niet te volgen van de ene naar de andere meting.
- **Veel toetsen tegelijk.** Hoe meer je toetst, hoe groter de kans dat er door toeval iets "significant" uitkomt. Het scherm waarschuwt daarvoor.
- **Samenhang is geen oorzaak.** Dat twee scores samen op- en neergaan, bewijst niet dat de een de ander veroorzaakt.
- De berekeningen gebruiken gangbare toetsen (Welch t-toets, Mann-Whitney, ANOVA, Kruskal-Wallis, Pearson, Spearman, chi-kwadraat) en zijn gecontroleerd tegen een standaard statistiekpakket.

### Een eigen dataset onderzoeken (onderdeel 6)

Hiermee onderzoek je gegevens die niet uit een vragenlijst komen, zoals een overzicht uit het HR-systeem.

1. Klik bij onderdeel 6 op **Dataset toevoegen** en kies een Excel-bestand (.xlsx) of CSV-bestand.
   - De eerste rij moet de namen van de kolommen bevatten. Elke rij daaronder is één waarneming, bijvoorbeeld één medewerker of één maand.
2. Je ziet de kolommen met hun soort: **getallen**, **indeling in groepen** (bijvoorbeeld afdeling) of **tekst**. Vink uit wat je niet nodig hebt.
   - Kolommen die op persoonsgegevens lijken (naam, personeelsnummer, e-mail, geboortedatum, telefoonnummer) staan al uit. Dat wordt herkend aan de kolomnaam en aan de inhoud. Laat ze uit.
   - Staan groepen als code in een kolom (bijvoorbeeld 1, 2, 3 voor drie afdelingen), dan kun je die kolom ook als indeling gebruiken. Hij staat dan in de keuzelijst met "(als groepen)" erachter.
3. Klik op **Dataset opslaan**. Kies daarna bij **Wat wil je weten?** een van de vier vragen:
   - **Hoe ziet één kolom eruit?** Gemiddelde, middelste waarde, spreiding, of de verdeling over de groepen.
   - **Verschillen groepen van elkaar?** Bijvoorbeeld verzuimdagen per afdeling.
   - **Hangen twee getallen met elkaar samen?** Bijvoorbeeld leeftijd en verzuimdagen.
   - **Hangen twee indelingen met elkaar samen?** Bijvoorbeeld afdeling en soort contract (kruistabel).

Een groep met minder dan 5 waarden doet niet mee aan een vergelijking, net als bij de vragenlijsten. Voor samenhang zijn minstens 10 rijen met een waarde in beide kolommen nodig. Een dataset kan maximaal 2.000 rijen en 40 kolommen hebben; een onderzoek maximaal 10 datasets.

**Gegevens over gezondheid.** Kolommen die over verzuim, ziekmeldingen of diagnoses lijken te gaan, staan bij het inlezen uit, met de melding *"Deze kolom lijkt over gezondheid te gaan. Gebruik hiervoor 'Personeelsbestand voor HR-analytics'; dan worden alleen groepscijfers bewaard."* Verzuim per medewerker is een gegeven over iemands gezondheid; dat hoort niet als losse rijen in een eigen dataset.

## 6. Eigen invoer

Op het tabblad **Eigen invoer** leg je vast wat je buiten de vragenlijst te weten komt: interviews, observaties, documentanalyse en cijfers zoals verzuim of verloop. Koppel elk item aan een thema en een datum, en eventueel aan een meetpunt en meetmoment.

- Kies je de soort **Cijfer** en vul je een waarde in, dan verschijnt die op het dashboard onder **Eigen cijfers**.
- Schrijf aantekeningen van interviews zonder namen van medewerkers.

### Inlezen uit Excel of CSV

Onderaan het tabblad **Eigen invoer** staat **Inlezen uit Excel of CSV**. Gegevens die al in een bestand staan, hoef je dan niet over te typen. Er zijn vier mogelijkheden:

| Wat | Waarvoor | Wat er moet in het bestand |
|---|---|---|
| **Cijfers in één keer** | Bijvoorbeeld verzuim per maand | Per rij een naam (zoals *Verzuimpercentage*), een datum en een waarde. Eenheid, thema en meetmoment mogen erbij. |
| **Antwoorden op een vragenlijst** | Papieren formulieren of antwoorden uit een ander programma | Per rij één respondent, per kolom één vraag. Schaalvragen als cijfer 1 tot 5, ja/nee als *ja* of *nee*, meerkeuze als de tekst van het antwoord. |
| **Vragen voor een vragenlijst** | Een vragenlijst die je al in Excel hebt | Per rij één vraag, met thema, soort (*schaal*, *ja/nee*, *meerkeuze* of *open*) en bij meerkeuze de mogelijkheden gescheiden door een puntkomma. |
| **Eigen dataset voor Analyse** | Gegevens die je wilt onderzoeken | Zie hoofdstuk 5, onderdeel 6. |

Zo werkt het:

1. Klik op de knop bij wat je wilt inlezen. Met **Download een voorbeeldbestand** krijg je een Excel-bestand met de juiste kolommen.
2. Kies je bestand. Heeft het meer tabbladen, kies dan het juiste tabblad.
3. Controleer bij **Welke kolom is wat?** of elke kolom goed is herkend en pas het zo nodig aan.
4. Lees de **Controle**. Daar staat hoeveel regels bruikbaar zijn, en per regel wat niet herkend is. Wat niet herkend wordt, blijft leeg of wordt overgeslagen; er wordt niets geraden.
5. Klik op **… inlezen**. Pas dan wordt er iets opgeslagen.

Goed om te weten:
- Het bestand wordt in je eigen browser gelezen. Alleen de gegevens die je hebt gekozen, gaan naar de onderzoeksomgeving.
- Bij **antwoorden** worden alleen de kolommen bewaard die je aan een vraag koppelt. Een kolom met namen of e-mailadressen wordt niet bewaard. Haal zulke kolommen liever al uit het bestand.
- Lees hetzelfde bestand met antwoorden niet twee keer in: de antwoorden tellen dan dubbel.
- Datums mogen als 26-11-2026, 2026-11-26 of 26 november 2026.
- Getallen mogen met een komma (7,4) of een punt (7.4). Per kolom wordt gekeken welke notatie het bestand gebruikt, ook bij duizendtallen (1.234,5 of 1,234.5). Is een getal als 1.234 niet eenduidig, dan lees je in de **Controle** hoe het is gelezen. Klopt dat niet, pas het dan in het bestand aan.
- Een percentage uit Excel wordt gelezen zoals je het ziet: 25 % wordt 25.
- Een regel onderaan zoals **Totaal** of **Gemiddelde** wordt overgeslagen als dat woord in de eerste kolom staat. De **Controle** meldt welke regel dat was.
- Lijkt een kolom op persoonsgegevens (namen, e-mailadressen, telefoonnummers), dan krijg je een waarschuwing.
- Een oud Excel-bestand (.xls) eerst in Excel opslaan als .xlsx.

## 7. Stukken

Op het tabblad **Stukken** staan standaard **Notities**, **Bevindingen** en een **Conceptrapport** met een indeling. Je kunt zelf stukken toevoegen.

- Alles wordt **automatisch opgeslagen** terwijl je typt. Rechtsboven zie je "Opgeslagen om …".
- Met de knoppen maak je kopjes, vette tekst en opsommingen. Met **Voorbeeld** zie je hoe het eruitziet.
- Werk je tegelijk in twee tabbladen of op twee apparaten, dan waarschuwt de app voordat er iets wordt overschreven.
- Met **Downloaden** krijg je het stuk als tekstbestand. Alle stukken als Word-bestanden download je bij **Afronden**.

## 8. Rapport: tussenrapport en eindrapport

Op het tabblad **Rapport** maak je een adviesrapport, opgebouwd als een kleine scriptie.

- **Tussenrapport**: halverwege het onderzoek. Hoofdstukken: stand van zaken, onderzoeksvraag, voorlopige resultaten, ontwikkeling tussen de meetmomenten, vervolg en planning, aandachtspunten.
- **Eindrapport**: na afloop. Hoofdstukken: samenvatting, aanleiding en onderzoeksvraag, aanpak en verantwoording, resultaten, ontwikkeling tussen de meetmomenten, cijfers en overige bronnen, conclusies, aanbevelingen, en als bijlagen de vragenlijst en (als je dat aanzet) de open antwoorden.

### Feiten en eigen tekst blijven gescheiden

Het rapport verzint niets. Elk hoofdstuk heeft drie delen:

1. **Feiten uit het onderzoek** (blauwe streep). Tabellen en korte, neutrale zinnen die rechtstreeks uit je gegevens komen: respons, scores per thema, antwoorden per vraag, de vergelijking tussen meetmomenten met de toets, je eigen cijfers en de actielijst. Dit gebeurt met vaste regels: dezelfde gegevens geven altijd dezelfde tekst. Er zit geen AI achter.
2. **Hulpvragen** (grijs). Vragen die je helpen bij het schrijven, bijvoorbeeld "Elke conclusie moet terug te vinden zijn in een uitkomst uit het hoofdstuk Resultaten". Ze komen niet in het rapport.
3. **Jouw tekst** (oranje streep). Wat de cijfers betekenen, je conclusies en je aanbevelingen schrijf je zelf. Alles wordt automatisch opgeslagen.

Hoofdstukken als Samenvatting, Conclusies en Aanbevelingen hebben geen automatische feiten (Aanbevelingen toont alleen je actielijst): daar staat alleen wat jij schrijft.

### Zo werk je

1. Klik op **Tussenrapport maken** of **Eindrapport maken** en vul de titel, opdrachtgever en je eigen naam in.
2. De cijfers worden opgehaald en vastgelegd op de **peildatum** (vandaag). Komen er daarna nog antwoorden binnen, dan verandert het rapport niet vanzelf. Met **Cijfers bijwerken** haal je de actuele stand op; je eigen tekst blijft daarbij altijd staan.
3. Schrijf per hoofdstuk je tekst. Links zie je welke hoofdstukken nog leeg zijn.
4. Pas aan wat je wilt:
   - de titel van een hoofdstuk (klik erop);
   - de volgorde (pijltjes);
   - een hoofdstuk weglaten (vinkje **Dit hoofdstuk opnemen in het rapport**);
   - de automatische feiten van een hoofdstuk weglaten;
   - bij Resultaten: alleen de thema's, zonder de losse vragen (**Beknopt**);
   - **+ Eigen hoofdstuk toevoegen**, bijvoorbeeld een voorwoord;
   - bij **Voorblad en uitgangspunten**: op welke vragenlijst het hoofdstuk Resultaten is gebaseerd.
5. Bekijk het resultaat met **Voorbeeld**. Hoofdstukken zonder eigen tekst zie je daar als grijze regel.
6. Maak het rapport af met:
   - **Download als Word**: een .docx met koppen en tabellen, om in Word verder op te maken;
   - **Afdrukken of pdf**: kies bij het afdrukken "Opslaan als pdf";
   - **Kopieer als tekst**.

Uitkomsten van minder dan 5 respondenten komen nooit in een rapport. De bijlage met open antwoorden staat standaard uit, omdat open antwoorden herkenbaar kunnen zijn. Lees ze door voordat je die bijlage aanzet.

## 9. Acties

Op het tabblad **Acties** staat je actielijst, met per actie een status (*Te doen*, *Bezig*, *Klaar*) en een datum. Acties waarvan de datum voorbij is, worden rood gemarkeerd. Acties met een datum kun je bij **Afronden** in je agenda (Outlook) zetten.

## 10. Delen: uitnodigen en laten meekijken

### Uitnodigen om een vragenlijst in te vullen

Bovenaan het tabblad **Delen** staat elke vragenlijst met zijn link.

- **Uitnodiging** en **Herinnering**: een kant-en-klare tekst die je zelf kunt aanpassen. `{link}` wordt de link naar de vragenlijst, `{titel}` de titel en `{bedrijf}` de bedrijfsnaam. Je tekst wordt bewaard voor de volgende keer.
  - **Open in e-mailprogramma** zet de tekst als nieuw bericht klaar in Outlook (of je eigen e-mailprogramma). Zet de ontvangers in het veld **BCC**, zodat ze elkaars adres niet zien.
  - **Kopieer tekst** als je de uitnodiging liever via intranet of Teams verstuurt.
- **QR-code**: download als afbeelding (png) voor een presentatie of als svg voor drukwerk, bijvoorbeeld een poster in de kantine.

De onderzoeksomgeving verstuurt zelf geen e-mail en bewaart geen e-mailadressen. Omdat de vragenlijst anoniem is, weet niemand wie hem al heeft ingevuld; daarom krijgt iedereen de herinnering.

### Laten meekijken met een deellink

Wil je de opdrachtgever, de directie of de ondernemingsraad de resultaten laten zien? Maak dan een **deellink**.

1. Klik op **+ Deellink maken**.
2. Vul in voor wie de link is en vink aan wat diegene mag zien:
   - **Resultaten** (het dashboard), met of zonder de **open antwoorden**;
   - losse **rapporten** en **stukken**;
   - desgewenst de **tussenstand van vragenlijsten die nog openstaan**. Dat vinkje staat los van de resultaten: het geldt voor de resultaten en voor rapporten. Bij een rapport waarin een vragenlijst nog openstond, zie je **(een vragenlijst stond nog open)**.
3. Kies tot wanneer de link werkt (standaard 30 dagen).
4. Je krijgt **de link** en **een toegangscode** te zien. Stuur ze apart van elkaar, bijvoorbeeld de link per e-mail (**Open e-mail met de link**) en de code per sms of telefoon.
   - **Noteer de toegangscode meteen.** Hij wordt niet leesbaar bewaard en is later niet meer op te vragen. Kwijt? Klik op **Nieuwe code**.

Wat de meelezer ziet en kan:
- Alleen lezen: niets wijzigen, niets downloaden behalve afdrukken.
- Alleen wat jij hebt aangevinkt. Uitkomsten van minder dan 5 respondenten blijven altijd verborgen. Staat in een thema of meetmoment een vraag van minder dan 5 respondenten, dan blijft ook dat thema of meetmoment verborgen, zodat die vraag niet terug te rekenen is.
- Een vragenlijst die nog openstaat, ziet de meelezer pas als je hem sluit. Zo kan niemand door later nog eens te kijken afleiden wat één nieuwe respondent heeft geantwoord. Wil je toch tussentijds laten meekijken, vink dan de tussenstand aan.
- Dat geldt ook voor rapporten. Stond een vragenlijst op de peildatum van het rapport nog open, dan ziet een meelezer zonder tussenstand daarvan alleen hoeveel lijsten er waren ingevuld en de zin dat de vragenlijst nog openstond. In het verloop valt dat meetmoment weg. Sluit de vragenlijst en klik in het rapport op **Cijfers bijwerken**; daarna ziet de meelezer de uitkomsten wel.
- Bij een groot onderzoek rekent de app de resultaten niet live uit voor een meelezer. Dat gebeurt als het aantal ingevulde vragenlijsten keer het aantal vragen (alle vragenlijsten samen) boven de 60.000 komt, bijvoorbeeld meer dan 600 ingevulde lijsten van 100 vragen, of bij meer dan 3.000 ingevulde vragenlijsten. Die ziet dan: *"Deze resultaten zijn te groot om hier live te tonen. Vraag de onderzoeker om een rapport."* Deel in dat geval een rapport.
- Rapporten zien er voor de meelezer hetzelfde uit als bij jou, maar alleen met de hoofdstukken die je hebt aangezet.
- Na 5 verkeerde toegangscodes moet diegene 15 minuten wachten. Dat geldt per apparaat of netwerk: iemand anders die de link heeft, kan de echte meelezer zo niet buitensluiten.

**Let op bij kleine aanvullingen.** Heeft een meelezer de cijfers van een gesloten vragenlijst al gezien (op het dashboard of in een gedeeld rapport), dan kan hij uit het verschil met nieuwe cijfers afleiden wat een paar nieuwe respondenten hebben geantwoord. Daarom waarschuwt de app:
- als je een gesloten, gedeelde vragenlijst weer **openzet** (knoppen **Toch openzetten** of **Annuleren**);
- als je **antwoorden inleest** in een gesloten, gedeelde vragenlijst en er daardoor 1 tot 4 respondenten bijkomen (knoppen **Toch inlezen** of **Annuleren**).

Het is een waarschuwing, geen blokkade. Wacht liever tot er minstens 5 nieuwe antwoorden zijn, of trek de deellink tijdelijk in.

Je kunt een link op elk moment **Intrekken** (en later weer laten werken), een **Nieuwe code** maken of de link **Verwijderen**. Dat werkt direct, ook voor iemand die op dat moment meekijkt. Bij de link zie je wanneer hij het laatst is bekeken (alleen de datum; van meelezers wordt verder niets bewaard).

## 11. Afronden: exporteren en archiveren

Ga naar het tabblad **Afronden**.

1. **Exporteren.** Download wat je wilt bewaren of verder wilt gebruiken (zie ook hoofdstuk 12):
   - **Excel-werkboek (.xlsx)**: alles in één bestand met tabbladen: antwoorden per vragenlijst, scores per thema, een codeboek met alle vragen, eigen invoer, acties en meetmomenten.
   - **Stukken als Word-bestanden (.zip)**: elk stuk als los Word-bestand.
   - **SPSS-pakket (.zip)**: voor wie zelf verder wil rekenen in SPSS (of het gratis PSPP).
   - **Meetmomenten en acties in je agenda (.ics)**.
   - Losse bestanden: **Alle antwoorden (CSV)**, **Antwoorden per vragenlijst (CSV)**, **Eigen invoer (CSV)**, **Stukken (tekstbestand)** en **Alles samen (JSON)**, een volledige kopie voor je archief.

   Bewaar exportbestanden op een veilige plek. Ze bevatten alle losse antwoorden, ook van kleine groepen.
   - Bij het Excel-werkboek, het SPSS-pakket, de antwoorden als CSV en **Alles samen (JSON)** vraagt de app eerst of je het zeker weet: *"Dit bestand bevat alle losse antwoorden en is niet anoniem genoeg om te delen met de opdrachtgever."* In een klein bedrijf zijn mensen aan hun antwoorden (afdeling, leeftijd, open antwoorden) vaak te herkennen. Stuur zo'n bestand dus niet door.
   - Wil je resultaten delen? Gebruik dan een rapport (tabblad **Rapport**, als Word of pdf) of een deellink. Een rapport heeft het label **geschikt om te delen**: daarin staan geen uitkomsten van minder dan 5 respondenten.
   - Bij een groot onderzoek zie je op de knop hoe ver het ophalen is, bijvoorbeeld *"Gegevens laden: 2.000 van 5.000 antwoorden…"*. De gegevens worden één keer per sessie opgehaald; daarna alleen wat er veranderd is.
2. **Archiveren.** Klik op **Onderzoek archiveren**.
   - Daarna kun je alles nog inzien en exporteren, maar niets meer wijzigen.
   - Open vragenlijsten worden gesloten; de links werken niet meer.
   - Deellinks blijven werken tot hun einddatum, zodat de opdrachtgever het eindrapport nog kan lezen. Trek ze in bij **Delen** als dat niet meer nodig is.
3. **Nieuw onderzoek.** Klik op **Nieuw onderzoek starten** en begin leeg bij het volgende bedrijf.
4. **Definitief verwijderen** (optioneel). Een gearchiveerd onderzoek kun je bij Afronden definitief verwijderen. Bewaar onderzoeksgegevens niet langer dan nodig (AVG).

## 12. Samenwerken met Excel, Word, Outlook en SPSS

De onderzoeksomgeving werkt met bestanden; er is geen directe koppeling met Microsoft 365 (dat zou een externe dienst zijn).

| Programma | Erin (inlezen) | Eruit (exporteren) |
|---|---|---|
| **Excel** | Cijfers, antwoorden, vragen en eigen datasets (.xlsx of .csv), zie hoofdstuk 6 | Excel-werkboek en CSV-bestanden bij Afronden |
| **Word** | – | Rapport als .docx (tabblad Rapport), stukken als .docx (Afronden) |
| **Outlook** | – | Uitnodiging en herinnering als nieuw e-mailbericht (Delen); meetmomenten en acties als agendabestand (Afronden) |
| **SPSS** | – | SPSS-pakket (Afronden) |

### Het SPSS-pakket gebruiken

1. Download het pakket bij **Afronden** en pak het zip-bestand uit. Er zitten drie bestanden in: een gegevensbestand (.csv), een syntaxbestand (.sps) en een LEESMIJ.
2. Open het .sps-bestand in SPSS en kies **Run › All**. De gegevens verschijnen met namen, labels en waardelabels.
3. Bewaar ze als SPSS-bestand via **File › Save As**.

Goed om te weten:
- Alle vragenlijsten staan onder elkaar. De variabelen *vragenlijst* en *meetmoment* geven aan bij welke meting een rij hoort. Dezelfde vraag op verschillende meetmomenten staat in dezelfde kolom, zodat je metingen direct kunt vergelijken.
- Bij schaalvragen is **99** "weet niet / n.v.t."; die waarde telt niet mee in gemiddelden.
- *thema01*, *thema02* … zijn de scores per thema per respondent, berekend zoals op het tabblad Analyse.
- Het pakket is getest met PSPP, de gratis variant van SPSS.

## 13. Privacy in het kort

- Van respondenten wordt **geen naam, e-mailadres, IP-adres of tijdstip** opgeslagen. Alleen de datum en de antwoorden worden bewaard.
- Ingevulde vragenlijsten krijgen een willekeurig nummer, zodat de volgorde van invullen niet te herleiden is.
- De database staat in de **EU** (Cloudflare D1 met jurisdictie "eu").
- Cloudflare houdt voor deze app geen logboek bij.
- Van **meelezers** met een deellink wordt niets bewaard, behalve de datum waarop de link het laatst is bekeken. Van de toegangscode wordt alleen een onleesbare versie (hash) bewaard.
- **E-mailadressen** worden nergens bewaard. Uitnodigingen verstuur je vanuit je eigen e-mailprogramma.
- Bestanden die je **inleest** worden in je eigen browser gelezen; alleen de gegevens die je kiest, worden opgeslagen.
- **Bibliotheek** (P5): alleen jij kunt de bibliotheek zien. Een meelezer krijgt van een bron hooguit de verwijzing (auteur, jaar, titel, vindplaats) als die in een gedeeld rapport wordt genoemd. Je eigen notities bij een bron en bij een koppeling komen nooit in een rapport, een deellink of een RIS-bestand (tenzij je dat bij exporteren zelf aanzet).
