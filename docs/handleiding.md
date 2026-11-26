# Handleiding Onderzoeksomgeving

Adres: **https://onderzoek.af-partners.workers.dev**
(later eventueel **onderzoek.afpartners.nl**; zie [beheer.md](beheer.md))

De onderzoeksomgeving heeft twee delen:

- **De beheeromgeving.** Alleen voor jou, achter een wachtwoord. Hier richt je onderzoeken in, maak je vragenlijsten, volg je de resultaten en schrijf je je stukken.
- **De openbare vragenlijst.** Respondenten openen een link zoals `…/v/Ab3dE…`. Ze hebben geen account nodig.

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

1. Klik op **Onderzoeken** en dan op **+ Nieuw onderzoek**.
2. Vul de **bedrijfsnaam**, een **titel** (bijvoorbeeld "Medewerkersonderzoek 2026") en de **onderzoeksvraag** in.
3. Kies eventueel één of meer **startsjablonen**: Medewerkerstevredenheid, HR-processen of Arbeidsvoorwaarden.
   - Met **Bekijk inhoud** zie je vooraf welke thema's en vragen erin zitten.
   - Een sjabloon vult het onderzoek met thema's, meetpunten, een vragenlijst voor de **Nulmeting** en een actielijst.
   - Alles is daarna aan te passen.
4. Klik op **Onderzoek aanmaken**. Je komt nu op het tabblad **Opzet**.

Meerdere onderzoeken kunnen tegelijk lopen. Ze staan op het startscherm onder **Lopende onderzoeken**.

### Opzet: thema's, meetpunten en meetmomenten

- **Thema**: een onderwerp, bijvoorbeeld *Werkdruk en balans*.
- **Meetpunt**: iets wat je binnen een thema meet, bijvoorbeeld *Ervaren werkdruk* of *Verzuimpercentage*.
- **Meetmoment**: bijvoorbeeld *Nulmeting* en *Vervolgmeting*. Vragenlijsten en eigen invoer koppel je aan een meetmoment. Zo zie je op het dashboard het verloop.

Je kunt alles toevoegen, wijzigen, verwijderen en in een andere volgorde zetten.

- Een thema dat nog vragen of eigen invoer heeft, kun je pas verwijderen als je die eerst hebt verplaatst of verwijderd.
- Met **Opslaan als sjabloon** bewaar je jouw verbeterde opzet voor het volgende bedrijf. De bedrijfsnaam wordt dan automatisch vervangen.

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
7. Klik op **Link kopiëren** en stuur de link naar de medewerkers, bijvoorbeeld per e-mail of intranet.
8. Heb je de vragenlijst zelf getest? Wis dan je testantwoorden met **Antwoorden wissen** voordat het echte onderzoek begint.

**Tips**
- Vul **Aantal uitgenodigden** in om het responspercentage te zien.
- Met **Maximum aantal inzendingen** stel je een bovengrens in. Elke link kan daarnaast maximaal 100 inzendingen per 10 minuten en 1.000 per dag ontvangen, als bescherming tegen misbruik.
- **Nieuwe link maken** maakt de oude link onbruikbaar, bijvoorbeeld als die op de verkeerde plek terecht is gekomen.
- Zijn er al antwoorden binnen, dan kun je het vraagtype niet meer veranderen. Je kunt een vraag wel herformuleren, maar doe dat alleen als de betekenis gelijk blijft.

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
- Kleine groepen worden samengevoegd, zodat ze niet uit het totaal terug te rekenen zijn.
- Leg de uitkomsten van verschillende uitsplitsingen niet naast elkaar om kleinere groepen af te leiden.

Met **Neem op in stuk** zet je de cijfers van een kaart als tekst in een van je stukken, bijvoorbeeld in het Conceptrapport.

## 5. Eigen invoer

Op het tabblad **Eigen invoer** leg je vast wat je buiten de vragenlijst te weten komt: interviews, observaties, documentanalyse en cijfers zoals verzuim of verloop. Koppel elk item aan een thema en een datum, en eventueel aan een meetpunt en meetmoment.

- Kies je de soort **Cijfer** en vul je een waarde in, dan verschijnt die op het dashboard onder **Eigen cijfers**.
- Schrijf aantekeningen van interviews zonder namen van medewerkers.

## 6. Stukken

Op het tabblad **Stukken** staan standaard **Notities**, **Bevindingen** en een **Conceptrapport** met een indeling. Je kunt zelf stukken toevoegen.

- Alles wordt **automatisch opgeslagen** terwijl je typt. Rechtsboven zie je "Opgeslagen om …".
- Met de knoppen maak je kopjes, vette tekst en opsommingen. Met **Voorbeeld** zie je hoe het eruitziet.
- Werk je tegelijk in twee tabbladen of op twee apparaten, dan waarschuwt de app voordat er iets wordt overschreven.
- Met **Downloaden** krijg je het stuk als tekstbestand, dat je in Word kunt plakken.

## 7. Acties

Op het tabblad **Acties** staat je actielijst, met per actie een status (*Te doen*, *Bezig*, *Klaar*) en een datum. Acties waarvan de datum voorbij is, worden rood gemarkeerd.

## 8. Afronden: exporteren en archiveren

Ga naar het tabblad **Afronden**.

1. **Exporteren.** Download wat je wilt bewaren:
   - **Alle antwoorden (CSV)**: één regel per antwoord, handig voor een draaitabel in Excel.
   - **Antwoorden per vragenlijst (CSV)**: één regel per respondent.
   - **Eigen invoer (CSV)**.
   - **Stukken (tekstbestand)**: inclusief de actielijst.
   - **Alles samen (JSON)**: een volledige kopie voor je archief.

   CSV-bestanden openen direct goed in de Nederlandse Excel.

   Bewaar exportbestanden op een veilige plek. Ze bevatten alle losse antwoorden.
2. **Archiveren.** Klik op **Onderzoek archiveren**.
   - Daarna kun je alles nog inzien en exporteren, maar niets meer wijzigen.
   - Open vragenlijsten worden gesloten; de links werken niet meer.
3. **Nieuw onderzoek.** Klik op **Nieuw onderzoek starten** en begin leeg bij het volgende bedrijf.
4. **Definitief verwijderen** (optioneel). Een gearchiveerd onderzoek kun je bij Afronden definitief verwijderen. Bewaar onderzoeksgegevens niet langer dan nodig (AVG).

## 9. Privacy in het kort

- Van respondenten wordt **geen naam, e-mailadres, IP-adres of tijdstip** opgeslagen. Alleen de datum en de antwoorden worden bewaard.
- Ingevulde vragenlijsten krijgen een willekeurig nummer, zodat de volgorde van invullen niet te herleiden is.
- De database staat in de **EU** (Cloudflare D1 met jurisdictie "eu").
- Cloudflare houdt voor deze app geen logboek bij.
