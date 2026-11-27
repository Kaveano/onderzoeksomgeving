# Onderzoeksomgeving

Webapp voor HR-onderzoek bij één bedrijf tegelijk, bijvoorbeeld naar medewerkerstevredenheid, HR-processen of arbeidsvoorwaarden. Je kunt:
- vragenlijsten uitzetten en mensen uitnodigen (e-mailtekst, QR-code);
- de resultaten volgen op een dashboard en toetsen of verschillen echt zijn (Analyse, "SPSS in het klein");
- eigen bevindingen vastleggen, ook door gegevens uit Excel in te lezen;
- je stukken schrijven en een tussen- of eindrapport maken (feiten uit de gegevens, eigen tekst gescheiden);
- een bibliotheek met bronnen (een gecontroleerde startcollectie en je eigen bronnen): zoeken, APA-verwijzingen, "Plak een verwijzing" en RIS voor Zotero, Mendeley en EndNote;
- anderen alleen-lezen laten meekijken met een deellink en toegangscode;
- exporteren naar Excel, Word, SPSS en je agenda, en het onderzoek na afloop archiveren.

Live: **https://onderzoek.af-partners.workers.dev**

- **Handleiding voor gebruik:** [docs/handleiding.md](docs/handleiding.md)
- **Beheer, kosten, privacy en een nieuwe versie online zetten:** [docs/beheer.md](docs/beheer.md)

## Opbouw

```
src/                 Servercode (Cloudflare Worker, gewoon JavaScript)
  index.js           Adressen (routes) en beveiligingskoppen
  lib/               Inloggen, invoercontrole, database, sjablonen, statische bestanden
  routes/            Onderzoeken, opzet, vragenlijsten, openbare vragenlijst, dashboard,
                     eigen invoer, stukken, acties, export, rapporten, deellinks (delen),
                     inlezen
  sjablonen.js       Standaardsjablonen (en sjablonen-extra.js: de overige negen)
public/              Pagina's, opmaak en scripts (Nederlands, werkt op laptop en telefoon)
  index.html         Beheeromgeving
  vragenlijst.html   Openbare vragenlijst voor respondenten
  kijk.html          Alleen-lezen inzage voor meelezers (deellink)
  js/beheer/         Schermen van de beheeromgeving, plus rekenmodules zonder DOM:
                     statistiek, analyse-model, rapport-feiten, inlees-regels,
                     bestanden (xlsx/docx/ics/zip/SPSS), export-bestanden, qr
migrations/          Opbouw van de database (D1)
scripts/             Bundelt public/ in de Worker bij het bouwen
test/                Automatische tests (npm test)
docs/                Handleiding en beheer
```

## Uitgangspunten

- **Kosten:** alleen de gratis laag van Cloudflare (Workers en een D1-database); geen externe diensten.
- **Afhankelijkheden:** geen frameworks of bibliotheken. De enige hulptool is Wrangler, en die is alleen nodig om de app online te zetten.
- **Opslag:** de database staat in de EU (jurisdictie "eu").
- **Respondenten:** anoniem. Er wordt geen naam, e-mailadres, IP-adres of tijdstip opgeslagen.
- **Dashboard:** geen uitkomsten van groepen of getallen die op minder dan 5 respondenten berusten.
- **Geheimen:** het beheerwachtwoord staat als geheim in Cloudflare (`BEHEER_WACHTWOORD`); er staan geen geheimen in deze repository.
