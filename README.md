# Onderzoeksomgeving

Webapp voor HR-onderzoek bij één bedrijf tegelijk, bijvoorbeeld naar medewerkerstevredenheid, HR-processen of arbeidsvoorwaarden. Je kunt:
- vragenlijsten uitzetten;
- de resultaten volgen op een dashboard;
- eigen bevindingen vastleggen;
- je stukken schrijven;
- het onderzoek na afloop exporteren en archiveren.

Live: **https://onderzoek.af-partners.workers.dev**

- **Handleiding voor gebruik:** [docs/handleiding.md](docs/handleiding.md)
- **Beheer, kosten, privacy en een nieuwe versie online zetten:** [docs/beheer.md](docs/beheer.md)

## Opbouw

```
src/                 Servercode (Cloudflare Worker, gewoon JavaScript)
  index.js           Adressen (routes) en beveiligingskoppen
  lib/               Inloggen, invoercontrole, database, sjablonen, statische bestanden
  routes/            Onderzoeken, opzet, vragenlijsten, openbare vragenlijst, dashboard,
                     eigen invoer, stukken, acties, export
  sjablonen.js       Standaardsjablonen (medewerkerstevredenheid, HR-processen, arbeidsvoorwaarden)
public/              Pagina's, opmaak en scripts (Nederlands, werkt op laptop en telefoon)
  index.html         Beheeromgeving
  vragenlijst.html   Openbare vragenlijst voor respondenten
  js/beheer/         Schermen van de beheeromgeving
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
