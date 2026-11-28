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
- **Importeren**: kies een RIS-bestand (.ris) uit Zotero, Mendeley of EndNote. Je ziet eerst hoeveel bronnen erin staan en welke al in je bibliotheek staan; die worden overgeslagen. Staat bij een bron geen taal in het bestand (Google Scholar en Mendeley laten die vaak weg), dan raden we de taal uit de titel en de samenvatting: Nederlands of Engels. Je krijgt daar een melding over. Klopt de taal niet, pas hem dan aan bij de bron.
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
   - **Cijfer (0–10 of 1–10)**: een cijfer van 0 tot 10 (bijvoorbeeld "Hoe waarschijnlijk is het dat je … aanbeveelt?") of een rapportcijfer van 1 tot 10. Zie "Cijfervraag" hieronder.
   - **Open tekst**.
4. Zet bij een achtergrondvraag zoals **"Op welke afdeling werk je?"** het vinkje **uitsplitsing** aan. Dan kun je op het dashboard de resultaten per afdeling bekijken.
   - Pas eerst de afdelingen aan; in het sjabloon staan voorbeeldnamen.
   - Kies bij **Achtergrondkenmerk** wat de vraag meet, zoals *Afdeling* of *Leeftijd*. Zie "Achtergrondvragen (kenmerken)" hieronder.
5. Bekijk het resultaat met **Voorbeeld** of **Bekijk als respondent**.
6. Klik op **Vragenlijst openzetten**.
7. Klik op **Link kopiëren** en stuur de link naar de medewerkers, bijvoorbeeld per e-mail of intranet. Een kant-en-klare uitnodiging, een herinnering en een QR-code vind je op het tabblad **Delen** (hoofdstuk 10).
8. Heb je de vragenlijst zelf getest? Wis dan je testantwoorden met **Antwoorden wissen** voordat het echte onderzoek begint. Ook de codes die je aan die antwoorden gaf en de citaten eruit worden dan gewist; het codeboek zelf blijft staan. Het venster zegt vooraf hoeveel het er zijn.

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

### Cijfervraag (0–10 en rapportcijfer)

Met het vraagtype **Cijfer** stel je een vraag waarop respondenten een cijfer geven. Er zijn twee soorten:

- **Aanbevelen (0 tot 10)**, bijvoorbeeld *"Hoe waarschijnlijk is het dat je [organisatie] als werkgever aanbeveelt aan vrienden of bekenden?"*. Op het dashboard zie je dan ook de **eNPS**: het percentage *promotors* (9 of 10) min het percentage *criticasters* (0 tot en met 6). De eNPS loopt van −100 tot +100. Wie 7 of 8 geeft, telt als *passief*.
- **Rapportcijfer (1 tot 10)**, bijvoorbeeld *"Welk rapportcijfer geef je [organisatie] als werkgever?"*. Op het dashboard zie je het gemiddelde en welk deel een onvoldoende gaf (5 of lager).

Goed om te weten:
- Een cijfervraag telt **nooit** mee in de gemiddelde score van een thema of meetpunt. Die blijven gemiddelden van de schaalvragen van 1 tot 5. Zo worden een cijfer en een score op een schaal van 5 nooit door elkaar opgeteld.
- Op een telefoon staan de cijfers in twee rijen (0 tot 5 en 6 tot 10). Onder elke rij staat wat het uiterste betekent, bijvoorbeeld "0 = Zeer onwaarschijnlijk".
- Je kunt "weet niet / n.v.t." toestaan, bijvoorbeeld bij een rapportcijfer voor iets waar niet iedereen mee te maken heeft. Dat antwoord telt niet mee in het gemiddelde of de eNPS.
- Zijn er al antwoorden, dan kun je de soort (0–10 of 1–10) niet meer veranderen. Een 0 zou anders opeens ongeldig zijn.
- Op het dashboard staat een cijfervraag bij zijn thema, met een staafje per cijfer. Bij de uitsplitsing krijgt elke cijfervraag een eigen kolom; een groep met minder dan 5 cijfers zie je daar als **×**.
- In de standaardsjablonen **Medewerkerstevredenheid**, **Onboarding** en **Vertrekonderzoek** is de ja/nee-vraag "Zou je [organisatie] aanbevelen als werkgever aan vrienden of kennissen?" vervangen door de cijfervraag van 0 tot 10. Medewerkerstevredenheid heeft er ook een rapportcijfer bij. **Een eerdere meting met de ja/nee-vraag over aanbevelen is niet te vergelijken met de nieuwe vraag van 0 tot 10.** Heb je een nulmeting met de oude vraag, houd dan in de vervolgmeting de oude vraag aan (kopieer de vragenlijst) of zet beide vragen erin.

### Achtergrondvragen (kenmerken)

Een achtergrondvraag gaat over wie de respondent is: afdeling, leeftijd, diensttijd, geslacht, dienstverband, arbeidsuren, functieniveau, of iemand leiding geeft, locatie of opleiding. Geef zo'n vraag bij **Achtergrondkenmerk** het juiste kenmerk. Dan weet de app wat de vraag meet en kun je straks zien wie er hebben meegedaan en groepen vergelijken.

- Een kenmerk kan alleen bij een **meerkeuzevraag met één antwoord** of bij een **ja/nee-vraag**.
- Per vragenlijst kan elk kenmerk één keer voorkomen. Alleen **Ander kenmerk** mag vaker.
- Kies je een kenmerk, dan wordt ook **uitsplitsing** aangevinkt. Je kunt dat weer uitzetten. Bij een vertrekonderzoek staat uitsplitsing bewust uit: per afdeling zijn er bijna altijd minder dan 5 vertrekkers.
- Een kenmerk mag je ook nog veranderen als er al antwoorden zijn. **Let op:** haal je het kenmerk weg bij een vraag zonder uitsplitsing, dan worden kleine aantallen bij die vraag niet meer verborgen, ook niet voor meelezers. De editor waarschuwt je dan.

**Achtergrondvragen toevoegen.** Met de knop **Achtergrondvragen toevoegen** (naast **+ Vraag toevoegen**) kies je uit kant-en-klare vragen met passende antwoorden. Ze komen in het thema *Achtergrond*, aan het eind van de vragenlijst. Kenmerken die er al in staan, kun je niet nog eens kiezen. Bij leeftijd kies je tussen 3 groepen (aangeraden bij minder dan 100 medewerkers) en 5 groepen. Dezelfde knop staat in de sjablooneditor.

**Vraag niet meer dan nodig.** Hoe meer achtergrondvragen, hoe makkelijker iemand herkenbaar wordt, en hoe minder mensen eerlijk antwoorden. In een kleine organisatie zijn twee of drie achtergrondvragen meestal genoeg. **Minder dan 50 medewerkers: kies hooguit twee achtergrondvragen.** Leeftijd staat daarom niet standaard in de sjablonen. De dialoog telt de achtergrondvragen die er al in staan mee ("Er staan er al 2 in."). Kies je er zoveel bij dat het er samen meer dan twee worden, dan krijg je een waarschuwing. Heb je bij de vragenlijst ingevuld hoeveel mensen je uitnodigt en zijn dat er 50 of meer, dan blijft die waarschuwing weg.

Voeg je achtergrondvragen toe aan een vragenlijst die al is ingevuld, dan hebben de eerdere respondenten die vragen niet gezien. Bij hen telt het antwoord als "niet ingevuld".

De vragen over afdeling en diensttijd in de standaardsjablonen (en de vraag of je leiding geeft) hebben hun kenmerk al. Bestaande vragenlijsten met die vragen hebben het kenmerk bij de update automatisch gekregen.

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
- Groepen met minder dan **5 respondenten** worden niet getoond. Hetzelfde geldt voor elke score binnen een groep die op minder dan 5 personen berust; die zie je als **×**. Soms staat er ook × bij een iets grotere score, zodat de kleine niet terug te rekenen is. Op de hele pagina betekent × hetzelfde: niet getoond, om de anonimiteit te beschermen. De uitleg staat onder de tabel.
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
- **Wie wegvalt, mag niet terug te rekenen zijn.** Vallen er bij een thema- of meetpuntscore in een vragenlijst (of in een groep) 1 tot 4 respondenten weg omdat ze te weinig vragen beantwoordden, dan zie je bij die vergelijking *"niet getoond: te weinig volledig ingevulde antwoorden om dit veilig naast het dashboard te tonen"*. Anders zijn hun antwoorden terug te rekenen uit het dashboard, dat alle losse antwoorden telt. Hetzelfde geldt in de werkbank en in het rapport.
- **Wat het dashboard verbergt, blijft hier ook weg.** Is op het dashboard in de uitsplitsing bij een groep een vraag of thema verborgen, dan doet die groep bij *Verschil tussen groepen* niet mee voor die vraag of dat thema.
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

Een groep met minder dan 5 waarden doet niet mee aan een vergelijking, net als bij de vragenlijsten; zo nodig valt ook de kleinste andere groep weg. In de verdeling van een indeling zie je aantallen van 1 tot 4 (en zo nodig een groter aantal ter bescherming) als **×**. Laagste en hoogste waarde zijn de 5e laagste en de 5e hoogste waarde, en staan er pas bij vanaf 9 waarden. Een kruistabel met een combinatie van minder dan 5 rijen wordt niet getoond, en dan ook de toets niet. Dit zijn dezelfde regels als in de werkbank. Voor samenhang zijn minstens 10 rijen met een waarde in beide kolommen nodig. Een dataset kan maximaal 2.000 rijen en 40 kolommen hebben; een onderzoek maximaal 10 datasets.

**Gegevens over gezondheid.** Kolommen die over verzuim, ziekmeldingen of diagnoses lijken te gaan, staan bij het inlezen uit, met de melding *"Deze kolom lijkt over gezondheid te gaan. Gebruik hiervoor 'Personeelsbestand voor HR-analytics'; dan worden alleen groepscijfers bewaard."* Verzuim per medewerker is een gegeven over iemands gezondheid; dat hoort niet als losse rijen in een eigen dataset.

### Werkbank: zelf analyses doen

Wil je zelf kiezen welke analyse je doet, zoals in SPSS? Kies dan bij **Analyse** bovenaan **Werkbank**. Je kunt nieuwe variabelen maken (bijvoorbeeld een schaalscore), een selectie maken en uitkomsten bewaren voor je rapport. De anonimiteit blijft beschermd: niets wat op minder dan 5 mensen berust, komt in beeld. De berekeningen gebeuren in je eigen browser; met **Stoppen** breek je een lange berekening af.

**Bovenaan kies je:**
- **Gegevens**: één vragenlijst, *Alle vragenlijsten samen (meetmoment als variabele)* of een eigen dataset (bijvoorbeeld *Dataset: Opleidingsuren 2025 – 480 rijen*). Een vragenlijst met minder dan 5 antwoorden doet niet mee.
- **Selectie**: *Iedereen* of een selectie die je hebt gemaakt (bijvoorbeeld één afdeling).
- **Schrijfwijze** van de zin onder een uitkomst: *Rapport (p = 0,036)*, zoals in je rapporten, of *APA (p = ,036)*, zonder nul voor maten die niet groter dan 1 kunnen zijn.
- **Gegevens vernieuwen** haalt de nieuwste antwoorden op.

**Variabelen.** Hier staan alle vragen, thema's, meetpunten, achtergrondkenmerken en je eigen variabelen, met dezelfde korte namen als in het SPSS-pakket (v01, thema02 …). Per variabele zie je de soort, het **meetniveau** (nominaal: groepen zonder volgorde; ordinaal: groepen met volgorde; interval: een getal), de waarden en hoeveel geldige antwoorden er zijn (× = minder dan 5). Pas het meetniveau aan als een variabele anders gebruikt moet worden. "Weet niet" en lege antwoorden tellen als ontbrekend. Ruwe gegevens per respondent zie je hier niet, om de anonimiteit te beschermen; gebruik daarvoor de export bij Afronden.

*"Dat zeg ik liever niet"* is bij een achtergrondvraag (zoals leeftijd) een gewone groep: in *Frequenties*, een kruistabel, *Gemiddelden per groep*, een t-toets of ANOVA en als voorspeller met groepen doet die groep gewoon mee, net als op het dashboard. Gebruik je de vraag als **getal** (beschrijvende statistiek, correlatie, een score, indelen met grenzen, een selectie *van … tot …*), dan telt *"Dat zeg ik liever niet"* als **ontbrekend**: het is geen leeftijd en hoort niet als hoogste leeftijdsklasse mee te tellen. In de uitvoer staat dat er dan bij; in de lijst met variabelen staat het bij *Ontbrekend*. In de zin over welke groep het hoogst en het laagst scoort, staat *"Dat zeg ik liever niet"* niet.

Staat bij een thema- of schaalscore *Niet te gebruiken: 1 tot 4 respondenten …*, dan vallen er een paar mensen weg die te weinig vragen van die score beantwoordden (zie *Privacy in de werkbank*). Met de knop **Schaalscore maken** bij die score maak je een score van dezelfde vragen met *minimaal 1 beantwoorde vraag*: dan valt niemand weg en kun je hem wel gebruiken. Bij een eigen score kies je **Aanpassen** en zet je het minimum op 1.

**Variabelen maken.** Elk venster toont meteen een voorbeeld.
- **Schaalscore berekenen**: het gemiddelde of de som van een aantal vragen. Vink *omscoren* aan bij een vraag die andersom gesteld is. Je ziet direct de Cronbachs alfa van die vragen.
- **Vraag omscoren**: 1 wordt 5, 2 wordt 4 (bij een rapportcijfer 1 tot 10: 1 wordt 10).
- **Indelen in groepen**: op antwoorden (geef antwoorden dezelfde groepsnaam) of met grenzen (bijvoorbeeld 30; 40; 50). *Gelijke groepen* (mediaan, tertielen, kwartielen) rekent de grenzen één keer uit en bewaart ze. Bij een vraag van 0 tot 10 is er de *eNPS-indeling (0–6 / 7–8 / 9–10)*.
- *Snel kiezen: Alle vragen van een thema* kiest de schaalvragen van dat thema, precies de vragen van de themascore. Een cijfervraag (0 tot 10 of 1 tot 10) hoort nooit bij een thema en staat er dus niet bij; bij *Betrouwbaarheid* en *Factoranalyse* kun je hem ook niet kiezen. Wil je weten hoe een cijfer samenhangt met een thema, gebruik dan de *Correlatiematrix*. Hebben de gekozen vragen niet allemaal hetzelfde bereik (bijvoorbeeld 1 tot 5 naast een eigen score), dan krijg je een waarschuwing.
- **Selectie maken**: een of meer voorwaarden die tegelijk gelden. Je kunt ook kiezen *"Laat respondenten weg die alle schaalvragen hetzelfde beantwoordden"* en *"Laat respondenten weg die minder dan … % van de vragen beantwoordden"*.

Verwijder je een indeling of selectie, dan verdwijnt die uit je lijst, maar telt hij nog mee bij de controle op terugrekenen (uitkomsten ervan kunnen al in je stukken staan). Met *Helemaal verwijderen* gaat hij echt weg.

**Analyseren.** Kies wat je wilt weten:

| Vraag | Analyse | Gebruik dit als … |
|---|---|---|
| Hoe zijn de antwoorden verdeeld? | Frequenties | je wilt zien hoe vaak elk antwoord is gegeven |
| Gemiddelde, spreiding en vorm | Beschrijvende statistiek | je van scores het gemiddelde, de spreiding en de vorm wilt weten |
| Gemiddelden per groep | Gemiddelden vergelijken | je de gemiddelden van groepen naast elkaar wilt zien (zonder toets) |
| Verschillen twee groepen? | t-toets (Student, Welch, Levene, Mann-Whitney, Cohens d en Hedges' g) | je twee groepen wilt vergelijken |
| Verschillen drie of meer groepen? | Variantieanalyse (ANOVA, Welch, Games-Howell of Tukey, Kruskal-Wallis met Dunn) | je drie of meer groepen wilt vergelijken |
| Hangen twee indelingen samen? | Kruistabel en chi-kwadraat (Fisher bij 2 × 2, Cramérs V, aangepaste residuen) | je twee vragen met vaste antwoorden wilt vergelijken |
| Wijkt de verdeling af van wat je verwacht? | Chi-kwadraat aanpassingstoets | je wilt controleren of de respons lijkt op de organisatie |
| Welke scores hangen samen? | Correlatiematrix (Pearson, Spearman, Holm) | je wilt zien welke scores samen hoger of lager zijn |
| Meten deze vragen samen één ding? | Betrouwbaarheid (Cronbachs alfa) | je van een aantal vragen één schaalscore wilt maken |
| Welke vragen horen bij elkaar? | Factoranalyse (hoofdcomponenten of principale assen, varimax, KMO, Bartlett) | je wilt ontdekken welke vragen samen één onderwerp meten |
| Verschillen twee vragen bij dezelfde mensen? | Gepaarde t-toets en Wilcoxon | dezelfde mensen twee vragen beantwoordden en je die wilt vergelijken |
| Wat voorspelt een score? | Lineaire regressie (met een tweede blok, β, tolerantie en VIF) | je wilt weten welke dingen samen een score voorspellen |
| Wat voorspelt een ja/nee-uitkomst, zoals vertrekwens? | Logistische regressie (odds ratio's, Nagelkerke R², classificatietabel) | de uitkomst twee groepen heeft, zoals wel of niet willen vertrekken |

Onder *Meer opties* vind je per analyse de extra keuzes, zoals de post-hoctoets, de referentiegroep of het aantal factoren.

**t-toets lezen.** Bij *Welke twee groepen?* kies je *Groep 1* en *Groep 2*. Net als in SPSS is het *Verschil* groep 1 min groep 2: een positief verschil, een positieve t en een positieve Cohens d of Hedges' g betekenen dat groep 1 hoger scoort; negatief dat groep 1 lager scoort. *Wat betekent dit?* en de zin in APA-stijl noemen groep 1 ook eerst, met hetzelfde teken. Bij Mann-Whitney is U die van groep 1 en is z positief als groep 1 hogere rangnummers heeft.

**Lineaire regressie lezen.** Kies bij *Score* wat je wilt verklaren (bijvoorbeeld een themascore) en bij *Voorspellers* waarmee. Een getal (een vraag of score) doet mee als getal; een indeling (zoals afdeling) doet mee als groepen, die elk worden vergeleken met een *referentiegroep* (standaard de grootste groep; dat zie je in de tabel *Voorspellers met groepen*). In SPSS moet je daarvoor zelf dummy's maken; hier gebeurt dat vanzelf.
- *Modeloverzicht*: R² is het deel van de verschillen in de score dat de voorspellers samen verklaren (0,24 = 24%). Met een *tweede blok* zie je hoeveel de extra voorspellers daar nog aan toevoegen (R²-verandering), net als *Block 2* in SPSS.
- *Variantieanalyse*: de toets of het model als geheel iets verklaart.
- *Coëfficiënten*: B is hoeveel de score gemiddeld verandert als de voorspeller 1 punt hoger is (en de rest gelijk blijft); bij een groep is B het verschil met de referentiegroep. β maakt de voorspellers onderling vergelijkbaar. *Tolerantie* en *VIF* laten zien of voorspellers te veel op elkaar lijken; bij een VIF boven 5 krijg je een waarschuwing.
- Bij een voorspeller met meer dan twee groepen staat er een toets van die voorspeller *als geheel*.
- *Gestandaardiseerde residuen*: hoe goed het model past (gemiddeld 0, SD ongeveer 1). Residuen per persoon zie je niet.
- Heb je weinig respondenten voor zoveel voorspellers (minder dan 50 + 8 per voorspeller), dan waarschuwt de werkbank. Kan een voorspeller volledig uit de andere worden voorspeld (bijvoorbeeld twee keer dezelfde vraag), dan laat de werkbank hem weg en zegt dat.

**Logistische regressie lezen.** Kies bij *Uitkomst* een indeling met precies twee groepen, zoals een ja/nee-vraag (of maak die eerst met *Indelen in groepen*), en bij *Waar kijk je naar?* de groep waarvan je de kans wilt voorspellen, bijvoorbeeld *Ja*.
- *Toets van het model* en *Nagelkerke R²*: zeggen de voorspellers samen iets over de uitkomst, en hoeveel (Nagelkerke is een soort R² tussen 0 en 1).
- *Classificatietabel*: hoeveel mensen het model goed indeelt (afkappunt 0,5).
- *Variabelen in de vergelijking*: Exp(B) is de odds ratio. Boven 1 betekent: bij een hogere score (of in deze groep, vergeleken met de referentiegroep) meer kans op de uitkomst; onder 1 minder kans. Het 95%-BI laat zien hoe zeker dat is: ligt 1 erbinnen, dan is het verband niet significant.
- Voorspelt een voorspeller de uitkomst (bijna) perfect, dan zijn de odds ratio's niet te schatten. De werkbank zegt dat dan (*volledige scheiding*) en rekent niet verder.

**Gepaard vergelijken.** Hiermee vergelijk je twee vragen die dezelfde mensen beantwoordden, bijvoorbeeld *"Ik heb genoeg tijd"* en *"Ik heb genoeg energie"*. Vink de eerste en de tweede vragen in dezelfde volgorde aan; onder de vakjes zie je welke paren je hebt gemaakt. Je krijgt de gemiddelden, de gepaarde t-toets (verschil = eerste min tweede, met dz als effectgrootte) en de toets van Wilcoxon (met rangnummers; handig bij losse vragen van 1 tot 5). Een nulmeting en een vervolgmeting kun je zo **niet** vergelijken: de antwoorden zijn anoniem en dus niet per persoon te koppelen. Gebruik daarvoor *Alle vragenlijsten samen* en een t-toets of ANOVA met *meetmoment* als groep.

**Factoranalyse lezen.** Kies minstens drie vragen (en minstens 50 respondenten die alles beantwoordden).
- *KMO en de toets van Bartlett*: KMO boven 0,6 en een significante toets van Bartlett betekenen dat de vragen genoeg samenhangen. Bij een KMO onder 0,5 krijg je een waarschuwing.
- *Verklaarde variantie* en de *screeplot*: hoeveel factoren er zijn. Standaard kiest de werkbank alle factoren met een eigenwaarde groter dan 1 (zoals SPSS); je kunt ook zelf een aantal kiezen.
- *Ladingen na rotatie (varimax)*: hoe sterk elke vraag bij een factor hoort. De vragen staan op volgorde van hun factor; ladingen kleiner dan 0,30 staan er niet bij (dat kun je uitzetten). Vanaf 0,40 telt een vraag duidelijk mee.
- Met **Maak van factor 1 een schaalscore** maak je meteen een schaalscore van de vragen die het sterkst bij die factor horen (vragen met een negatieve lading worden omgescoord). Controleer die schaal daarna met *Betrouwbaarheid*.
- *Principale assen* (standaard) zoekt wat de vragen gemeen hebben; *Hoofdcomponenten* vat alle verschillen samen. Geeft de berekening een communaliteit van 1 of meer (een *Heywood-geval*), dan krijg je een waarschuwing: kies dan minder factoren.

**Stoppen.** Een grote analyse (bijvoorbeeld een ANOVA met veel groepen) kan even duren. Je ziet dan *Bezig met rekenen…* met de knop **Stoppen**; het scherm blijft ondertussen gewoon bruikbaar.

**Uitvoer.** De nieuwste uitkomst staat bovenaan, met tabellen, *Wat betekent dit?* en een zin in APA-stijl met **Kopieer zin**. Per uitkomst: **Bewaren als analyse**, **Neem op in stuk**, **Naar Excel**, **Naar Word** en **Weghalen**; daarnaast **Hele uitvoer naar Excel** en **Hele uitvoer naar Word** (*geschikt om te delen*). De uitvoer blijft staan zolang je de pagina niet ververst. Op een telefoon wordt een correlatiematrix een lijst met paren.

**Mijn analyses.** Een bewaarde analyse is de vraag, niet de uitkomst: met **Opnieuw uitvoeren** rekent hij met de nieuwste gegevens. Met **Aanpassen** open je het formulier weer, met **Notitie** schrijf je iets voor jezelf (dat komt niet in een rapport). Gebruikt een analyse een variabele die niet meer bestaat, dan zegt de werkbank dat.

**Privacy in de werkbank, in gewone woorden.**
- Een getal dat op minder dan 5 mensen berust, verschijnt niet; een verborgen cel is overal ×. Waar nodig verdwijnt ook een andere cel, zodat een klein aantal niet uit het totaal is terug te rekenen.
- Kleine groepen worden samengevoegd tot *Overige groepen samen* of doen niet mee (ze worden dan genoemd, zonder getallen). Een toets wordt niet berekend als een cel verborgen is.
- Bij een achtergrondvraag (zoals afdeling) zijn de groepen precies die van het dashboard. Wie de vraag niet invulde, telt mee in *Overige groepen samen* als *Niet ingevuld* daar op het dashboard ook in zit. Zo kun je niet uit het verschil tussen het dashboard en de werkbank een kleine groep terugrekenen. Daarom staat bij zo'n vraag soms × bij *Geldig (n)*.
- Heeft een uitkomst maar twee waarden (zoals ja/nee), dan is een gemiddelde per groep een percentage; dan geldt de regel van de kruistabel.
- Wat het dashboard in een groep verbergt, verbergt de werkbank ook. Is op het dashboard bij een groep een vraag verborgen, dan zie je in de werkbank bij die groep ook het thema niet, en ook de andere vragen van dat thema en scores die je uit die vragen maakt niet. Anders is de verborgen vraag terug te rekenen (bijvoorbeeld thema × 2 min de andere vraag).
- Een selectie op een groep (bijvoorbeeld "afdeling is Productie") mag geen groep losmaken die bij die vraag samen met een andere verborgen blijft. Dan zie je de melding dat de selectie groepen uit elkaar haalt. Kies dan een selectie met die groepen allemaal erin of allemaal eruit.
- Van een schaalvraag of cijfervraag zie je per groep altijd het gemiddelde (net als op het dashboard). Kozen in een groep 1 tot 4 mensen een van de antwoorden, dan zie je bij die groep alleen N en het gemiddelde, en doet die groep niet mee in een toets: uit de spreiding en de mediaan zou anders terug te rekenen zijn hoeveel mensen elk antwoord kozen. Om dezelfde reden is er geen kruistabel of verdeling binnen een selectie met verborgen of samengevoegde cellen, ook niet als je de vraag eerst in groepen indeelt (*Indelen in groepen*). Kies dan grotere groepen, of deel de vraag in minder groepen in (bijvoorbeeld *oneens*, *neutraal* en *eens*). Een thema of een schaalscore van meer vragen heeft dit probleem niet.
- Binnen een selectie geldt hetzelfde: kozen daar 1 tot 4 mensen een van de antwoorden van zo'n vraag, dan zie je bij *Beschrijvende statistiek* alleen N en het gemiddelde. Regressie, logistische regressie, de gepaarde t-toets, correlatie en betrouwbaarheid laten die vraag dan niet meedoen. Zonder selectie kan alles gewoon.
- Bij een indeling als getal (zoals leeftijd) is het andersom: een gemiddelde per groep zie je alleen als die groep bij elke waarde minstens 5 mensen heeft.
- Een eigen indeling van een achtergrondvraag (bijvoorbeeld *Productie* tegenover *de rest* van afdeling) mag de groepen die bij die vraag samen verborgen blijven niet uit elkaar halen. Anders is zo'n groep alsnog terug te rekenen. Zet die groepen in dezelfde groep, of gebruik de vraag zelf. Dat geldt ook voor een selectie, een kruistabel en een regressie met zo'n indeling.
- Bij een vraag met *Dat zeg ik liever niet* telt dat antwoord als getal niet mee. Zeiden in een groep 1 tot 4 mensen "liever niet", dan zie je die groep niet bij *Gemiddelden per groep*, de toetsen en de regressie: het aantal zou anders volgen uit de grootte van de groep min N.
- Bij een themascore of eigen schaalscore: vallen er 1 tot 4 mensen weg omdat ze te weinig vragen beantwoordden, dan wordt die score niet getoond (anders zijn hun antwoorden terug te rekenen uit het dashboard). Dat zie je vooraf bij *Variabelen* (*Niet te gebruiken: 1 tot 4 respondenten …*). De uitweg: maak met **Schaalscore maken** een score van dezelfde vragen met minimaal 1 beantwoorde vraag; dan valt niemand weg. Heb je die score al gemaakt, dan zegt de werkbank *Er is al een schaalscore van deze vragen* en kun je hem met **Toon** opzoeken; een tweede, gelijke score maakt hij niet.
- Een selectie mag nooit maar 1 tot 4 mensen verschillen van iedereen of van dezelfde selectie met één voorwaarde minder. Twee indelingen van dezelfde vraag mogen samen geen groepje van 1 tot 4 mensen afbakenen (zoals "jonger dan 40" naast "jonger dan 41").
- Bij *Alle vragenlijsten samen* mag een uitkomst nooit maar 1 tot 4 mensen verschillen van dezelfde uitkomst bij één vragenlijst. Anders volgt uit het verschil iets over een kleine groep in een van de vragenlijsten. Een groep of cel waarvoor dat geldt, krijgt ×; soms weigert de werkbank en vraagt je één vragenlijst te kiezen.
- Minimum en maximum zijn de 5e laagste en de 5e hoogste waarde; de mediaan staat er pas bij vanaf 9 mensen.
- Bij *Frequenties* zonder selectie zie je bij gewone vragen de hele verdeling, net als op het dashboard. Bij achtergrondkenmerken, indelingen, thema- en schaalscores en kolommen van een eigen dataset worden aantallen van 1 tot 4 verborgen; die staan niet zo op het dashboard. Met een selectie en in een rapport worden ze altijd verborgen.
- Bij een vraag met meerdere antwoorden zie je met een selectie (en in een rapport) een aantal alleen als minstens 5 mensen het antwoord kozen én minstens 5 het niet kozen. Anders zou je zien wat een paar mensen deden.
- De datum van invullen en open antwoorden komen nooit in de werkbank; codes bij open antwoorden wel (als 0/1).
- Bij regressie en logistische regressie heeft elke groep van een voorspeller minstens 5 mensen; kleinere groepen worden samengevoegd. Bij een logistische regressie (en bij een regressie op een ja/nee-score) moet elke groep van een voorspeller minstens 5 mensen *met* en 5 mensen *zonder* de uitkomst hebben; anders weigert de werkbank, omdat de uitkomst dan iets over een kleine groep verraadt. Voeg dan groepen samen of laat die voorspeller weg.
- Er komen nooit residuen, voorspelde kansen of factorscores per persoon in beeld.

**Verschillen met SPSS.** De werkbank gebruikt dezelfde formules en is gecontroleerd met SciPy en statsmodels. Kleine verschillen:
- Mann-Whitney geeft z met continuïteitscorrectie (SPSS zonder; verschil in de 2e of 3e decimaal).
- De post-hoctoets is standaard Games-Howell (Tukey kan ook).
- Minimum en maximum zijn de 5e laagste en hoogste waarde.
- Bij een voorspeller met groepen is de referentiegroep standaard de grootste groep (in SPSS meestal de laatste); je kunt ook de eerste of de laatste kiezen.
- Principale assen rekent door tot de communaliteiten minder dan 0,000001 veranderen (hooguit 250 stappen); SPSS stopt standaard na 25 stappen of bij 0,001. Ladingen kunnen daardoor in de 3e decimaal verschillen. Het teken van een factor (alle ladingen positief of negatief) kan ook verschillen; dat betekent niets.
- Wilcoxon geeft z zonder continuïteitscorrectie, zoals SPSS; r = z / √N, met N het aantal paren met een verschil.
- *"Dat zeg ik liever niet"* bij een geordend achtergrondkenmerk (leeftijd, diensttijd …) is in het SPSS-pakket een ontbrekende waarde (MISSING VALUES), net als in de werkbank bij gebruik als getal. Zulke kenmerken zijn in SPSS ordinaal, net als in de werkbank. SPSS laat een ontbrekende waarde ook weg uit een kruistabel; in de werkbank blijft het daar een groep. Wil je hem in SPSS toch als groep, zet de ontbrekende waarde dan uit (bijvoorbeeld `MISSING VALUES leeftijd ().`).

### Open antwoorden en interviews coderen

<!-- [P5] Coderen -->

In het tabblad **Analyse**, onderdeel **Open antwoorden**, geef je open antwoorden en interviews een of meer **codes**. Een code is een kort label voor wat iemand zegt, bijvoorbeeld *werkdruk* of *waardering*. Zo zie je wat vaak genoemd wordt.

**Vragenlijsten**
1. Kies een vragenlijst en een open vraag. De antwoorden staan onder elkaar, in een vaste maar willekeurige volgorde (zodat de volgorde niets over personen zegt).
2. Klik op een antwoord. Je ziet dan knoppen met alle codes: klik een code aan of weer uit. Met **+ Nieuwe code** maak je ter plekke een code.
3. Op een laptop gaat het sneller met het toetsenbord: **1 tot 9** zet de eerste negen codes aan of uit, **J** gaat naar het volgende antwoord, **K** naar het vorige en **N** maakt een nieuwe code.
4. Met **Alleen antwoorden zonder code** zie je wat je nog moet doen.

**Interviews** (en observaties uit Eigen invoer): kies het interview; de codes gelden voor het hele stuk. Bij een interview in **Eigen invoer** brengt de knop **Coderen** je hier direct naartoe.

**Codeboek**: hier voeg je codes toe, wijzig je de naam of omschrijving, **voeg je codes samen** (alle antwoorden en citaten gaan naar de andere code) of verwijder je een code. Je ziet ook hoe vaak elke code bij deze vraag voorkomt. Net als in het rapport staan aantallen van 1 tot 4 er niet: die zie je als **×**. Dat geldt ook voor een code die bijna iedereen kreeg (minder dan 5 antwoorden zonder die code). Is er iets verborgen, dan is ook *Antwoorden zonder code* verborgen, en soms nog een code, zodat een klein aantal niet terug te rekenen is. Heeft een vraag minder dan 5 antwoorden, dan zie je geen aantallen.

Op een **telefoon** (of een smal venster) staat het codeboek als balk onder in beeld, terwijl je door de antwoorden scrolt. Tik op **Codeboek** om het te openen of weer dicht te doen. Zo zie je de aantallen bij het antwoord waar je bent.

**Citaten**
- Klik bij een antwoord op **Citaat maken**. Het citaat is een kopie die je kunt inkorten of aanpassen. Bij een interview selecteer je eerst het stuk tekst dat je wilt citeren.
- **Controleer of dit citaat iemand herkenbaar maakt. Haal namen, functies en andere herkenbare details weg.** Vink daarna **Gecontroleerd: dit citaat maakt niemand herkenbaar** aan. Pas dan kun je **In rapport** aanvinken.
- Pas je de tekst later aan, dan moet je hem opnieuw controleren: het vinkje Gecontroleerd (en In rapport) gaat er dan af.
- In het rapport komen alleen citaten die gecontroleerd zijn en waarbij In rapport aan staat, en alleen bij vragen met minstens 5 antwoorden.

Codes zijn in de **Werkbank** ook te gebruiken, als variabele (wel of niet genoemd), bijvoorbeeld om te zien of werkdruk vaker genoemd wordt op de ene afdeling dan op de andere. Ook daar gelden de regels voor kleine aantallen. Een code die in het codeboek bij een vraag verborgen is (×), kun je in de werkbank niet gebruiken; anders zou het verborgen aantal uit de werkbank terug te rekenen zijn. Voeg kleine codes samen of codeer meer antwoorden. Een eigen variabele kan niet dezelfde naam krijgen als een code.

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
   - Losse bestanden: **Alle antwoorden (CSV)**, **Antwoorden per vragenlijst (CSV)**, **Eigen invoer (CSV)**, **Stukken (tekstbestand)** en **Alles samen (JSON)**, een volledige kopie voor je archief. Daarin staan ook de werkbank (eigen variabelen, selecties en bewaarde analyses), de codes en citaten bij open antwoorden, de HR-instellingen, de personeelscijfers (alleen groepscijfers), de cijferschalen en achtergrondkenmerken, en de gekoppelde bronnen met hun gegevens voor de literatuurlijst.

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
- Bij schaalvragen en cijfervragen is **99** "weet niet / n.v.t."; die waarde telt niet mee in gemiddelden.
- *thema01*, *thema02* … zijn de scores per thema per respondent, berekend zoals op het tabblad Analyse. Een cijfervraag telt daarin niet mee.
- Achtergrondkenmerken met een vaste volgorde (zoals *leeftijd* en *diensttijd*) zijn **ordinaal**, net als in de werkbank. Daarbij is *"Dat zeg ik liever niet"* een ontbrekende waarde: SPSS telt die niet mee in gemiddelden en correlaties en toont hem bij *Frequencies* onder *Missing*. Wil je die groep in een kruistabel, zet de ontbrekende waarde dan uit met `MISSING VALUES leeftijd ().`
- **Achtergrondvragen heten naar hun kenmerk**, bijvoorbeeld *afdeling*, *leeftijd* of *diensttijd* (in plaats van *v03*). Let op: in exports van vóór deze versie hadden die vragen nog een nummer als naam. Een vraag met het kenmerk *Ander kenmerk* houdt zijn nummer.
- Een **cijfervraag** is een getal (meetniveau *Scale*). Bij een cijfervraag van 0 tot 10 staat er een extra variabele die eindigt op **_enps**, bijvoorbeeld *v07_enps*: 1 = criticaster (0–6), 2 = passief (7–8), 3 = promotor (9–10).
- In het Excel-werkboek heeft het **Codeboek** een laatste kolom **Kenmerk**: welk achtergrondkenmerk een vraag meet. In de CSV met alle antwoorden onder elkaar staat het cijfer van een cijfervraag in de laatste kolom, *Cijfer (0-10)*.
- Het pakket is getest met PSPP, de gratis variant van SPSS.

## 13. Privacy in het kort

- Van respondenten wordt **geen naam, e-mailadres, IP-adres of tijdstip** opgeslagen. Alleen de datum en de antwoorden worden bewaard.
- Ingevulde vragenlijsten krijgen een willekeurig nummer, zodat de volgorde van invullen niet te herleiden is.
- Het **achtergrondkenmerk** van een vraag (afdeling, leeftijd …) is alleen voor jou: het gaat nooit mee naar de vragenlijst die respondenten zien. Groepen met minder dan 5 respondenten worden nergens getoond, ook niet bij een cijfervraag.
- De database staat in de **EU** (Cloudflare D1 met jurisdictie "eu").
- Cloudflare houdt voor deze app geen logboek bij.
- Van **meelezers** met een deellink wordt niets bewaard, behalve de datum waarop de link het laatst is bekeken. Van de toegangscode wordt alleen een onleesbare versie (hash) bewaard.
- **E-mailadressen** worden nergens bewaard. Uitnodigingen verstuur je vanuit je eigen e-mailprogramma.
- Bestanden die je **inleest** worden in je eigen browser gelezen; alleen de gegevens die je kiest, worden opgeslagen.
- De **werkbank** bewaart alleen hoe je eigen variabelen, selecties en analyses gemaakt zijn, nooit waarden per persoon. Uitkomsten van minder dan 5 mensen komen niet in beeld, ook niet per groep als percentage (bij ja/nee of twee waarden geldt de regel van de kruistabel), en een selectie of indeling die maar een paar mensen verschilt van een andere, wordt geweigerd.
- **Coderen**: codes en citaten zie alleen jij. In het rapport staan aantallen per code alleen bij vragen met minstens 5 antwoorden, en aantallen van 1 tot 4 zie je als ×. Een citaat komt pas in het rapport als je hebt aangevinkt dat het niemand herkenbaar maakt.
- **Bibliotheek**: alleen jij kunt de bibliotheek zien. Een meelezer krijgt van een bron hooguit de verwijzing (auteur, jaar, titel, vindplaats) als die in een gedeeld rapport wordt genoemd. Je eigen notities bij een bron en bij een koppeling komen nooit in een rapport, een deellink of een RIS-bestand (tenzij je dat bij exporteren zelf aanzet).
