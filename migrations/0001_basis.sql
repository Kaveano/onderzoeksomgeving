-- Onderzoeksomgeving: basisstructuur van de database (Cloudflare D1 / SQLite)
-- Tijden worden opgeslagen als ISO-tekst in UTC, datums als 'JJJJ-MM-DD'.

-- D1 controleert verwijzingen (foreign keys) standaard.

-- Een onderzoek bij één bedrijf. Meerdere onderzoeken kunnen tegelijk actief zijn.
CREATE TABLE onderzoeken (
  id               INTEGER PRIMARY KEY,
  bedrijfsnaam     TEXT    NOT NULL,
  titel            TEXT    NOT NULL,
  onderzoeksvraag  TEXT    NOT NULL DEFAULT '',
  toelichting      TEXT    NOT NULL DEFAULT '',
  status           TEXT    NOT NULL DEFAULT 'actief' CHECK (status IN ('actief', 'gearchiveerd')),
  aangemaakt_op    TEXT    NOT NULL,
  gearchiveerd_op  TEXT
);

-- Thema's binnen een onderzoek (bijv. "Werkdruk", "Leiderschap").
CREATE TABLE themas (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  naam          TEXT    NOT NULL,
  omschrijving  TEXT    NOT NULL DEFAULT '',
  volgorde      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_themas_onderzoek ON themas(onderzoek_id);

-- Meetpunten (indicatoren) binnen een thema (bijv. "Verzuimpercentage").
CREATE TABLE meetpunten (
  id            INTEGER PRIMARY KEY,
  thema_id      INTEGER NOT NULL REFERENCES themas(id) ON DELETE CASCADE,
  naam          TEXT    NOT NULL,
  omschrijving  TEXT    NOT NULL DEFAULT '',
  eenheid       TEXT    NOT NULL DEFAULT '',
  volgorde      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_meetpunten_thema ON meetpunten(thema_id);

-- Meetmomenten (bijv. "Nulmeting", "Vervolgmeting").
CREATE TABLE meetmomenten (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  naam          TEXT    NOT NULL,
  datum         TEXT,
  omschrijving  TEXT    NOT NULL DEFAULT '',
  volgorde      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_meetmomenten_onderzoek ON meetmomenten(onderzoek_id);

-- Vragenlijsten. De code is de niet te raden sleutel in de openbare link (/v/<code>).
CREATE TABLE vragenlijsten (
  id                  INTEGER PRIMARY KEY,
  onderzoek_id        INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  meetmoment_id       INTEGER REFERENCES meetmomenten(id) ON DELETE SET NULL,
  titel               TEXT    NOT NULL,
  introtekst          TEXT    NOT NULL DEFAULT '',
  bedanktekst         TEXT    NOT NULL DEFAULT '',
  code                TEXT    NOT NULL UNIQUE,
  status              TEXT    NOT NULL DEFAULT 'gesloten' CHECK (status IN ('open', 'gesloten')),
  aantal_uitgenodigd  INTEGER,
  max_inzendingen     INTEGER,
  aangemaakt_op       TEXT    NOT NULL
);
CREATE INDEX idx_vragenlijsten_onderzoek ON vragenlijsten(onderzoek_id);

-- Vragen. opties = JSON-lijst [{"id":"a1","label":"..."}] voor meerkeuze.
CREATE TABLE vragen (
  id                   INTEGER PRIMARY KEY,
  vragenlijst_id       INTEGER NOT NULL REFERENCES vragenlijsten(id) ON DELETE CASCADE,
  thema_id             INTEGER NOT NULL REFERENCES themas(id),
  meetpunt_id          INTEGER REFERENCES meetpunten(id) ON DELETE SET NULL,
  type                 TEXT    NOT NULL CHECK (type IN ('schaal', 'meerkeuze', 'janee', 'open')),
  tekst                TEXT    NOT NULL,
  toelichting          TEXT    NOT NULL DEFAULT '',
  opties               TEXT    NOT NULL DEFAULT '[]',
  schaal_soort         TEXT    NOT NULL DEFAULT 'eens',
  meerdere_antwoorden  INTEGER NOT NULL DEFAULT 0,
  verplicht            INTEGER NOT NULL DEFAULT 0,
  weet_niet            INTEGER NOT NULL DEFAULT 0,
  uitsplitsen          INTEGER NOT NULL DEFAULT 0,
  bron_vraag_id        INTEGER,
  volgorde             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_vragen_vragenlijst ON vragen(vragenlijst_id);
CREATE INDEX idx_vragen_thema ON vragen(thema_id);

-- Ingevulde vragenlijsten. Bewust GEEN naam, e-mail, IP-adres, browser of tijdstip:
-- alleen de datum en de antwoorden (JSON: {"<vraag_id>": waarde}).
CREATE TABLE inzendingen (
  id              INTEGER PRIMARY KEY,
  vragenlijst_id  INTEGER NOT NULL REFERENCES vragenlijsten(id) ON DELETE CASCADE,
  datum           TEXT    NOT NULL,
  antwoorden      TEXT    NOT NULL
);
CREATE INDEX idx_inzendingen_vragenlijst ON inzendingen(vragenlijst_id);

-- Teller tegen misbruik: aantal inzendingen per link per tijdvak van 10 minuten.
-- Staat los van de antwoorden, zodat tijdstippen niet aan antwoorden te koppelen zijn.
CREATE TABLE inzendteller (
  vragenlijst_id  INTEGER NOT NULL REFERENCES vragenlijsten(id) ON DELETE CASCADE,
  tijdvak         TEXT    NOT NULL,
  aantal          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vragenlijst_id, tijdvak)
);

-- Eigen invoer: interviews, observaties en cijfers (zoals verzuim of verloop).
CREATE TABLE eigen_invoer (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  thema_id      INTEGER NOT NULL REFERENCES themas(id),
  meetpunt_id   INTEGER REFERENCES meetpunten(id) ON DELETE SET NULL,
  meetmoment_id INTEGER REFERENCES meetmomenten(id) ON DELETE SET NULL,
  soort         TEXT    NOT NULL CHECK (soort IN ('interview', 'observatie', 'cijfer', 'document', 'overig')),
  datum         TEXT    NOT NULL,
  titel         TEXT    NOT NULL,
  tekst         TEXT    NOT NULL DEFAULT '',
  waarde        REAL,
  eenheid       TEXT    NOT NULL DEFAULT '',
  aangemaakt_op TEXT    NOT NULL
);
CREATE INDEX idx_invoer_onderzoek ON eigen_invoer(onderzoek_id);

-- Stukken: notities, bevindingen, conceptrapport.
CREATE TABLE stukken (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  soort         TEXT    NOT NULL DEFAULT 'notitie' CHECK (soort IN ('notitie', 'bevindingen', 'rapport', 'overig')),
  titel         TEXT    NOT NULL,
  inhoud        TEXT    NOT NULL DEFAULT '',
  volgorde      INTEGER NOT NULL DEFAULT 0,
  aangemaakt_op TEXT    NOT NULL,
  bijgewerkt_op TEXT    NOT NULL
);
CREATE INDEX idx_stukken_onderzoek ON stukken(onderzoek_id);

-- Actielijst.
CREATE TABLE acties (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  titel         TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'te_doen' CHECK (status IN ('te_doen', 'bezig', 'klaar')),
  datum         TEXT,
  notitie       TEXT    NOT NULL DEFAULT '',
  volgorde      INTEGER NOT NULL DEFAULT 0,
  aangemaakt_op TEXT    NOT NULL
);
CREATE INDEX idx_acties_onderzoek ON acties(onderzoek_id);

-- Eigen sjablonen (opgeslagen vanuit een onderzoek). De standaardsjablonen staan in de code.
CREATE TABLE sjablonen (
  id            INTEGER PRIMARY KEY,
  naam          TEXT    NOT NULL,
  omschrijving  TEXT    NOT NULL DEFAULT '',
  inhoud        TEXT    NOT NULL,
  aangemaakt_op TEXT    NOT NULL
);

-- Inlogsessies van de beheerder. Alleen een hash van de sessiesleutel wordt bewaard.
CREATE TABLE sessies (
  token_hash   TEXT PRIMARY KEY,
  verloopt_op  INTEGER NOT NULL
);

-- Mislukte inlogpogingen (alleen het tijdstip), om raden van het wachtwoord te remmen.
CREATE TABLE inlogpogingen (
  id       INTEGER PRIMARY KEY,
  tijdstip INTEGER NOT NULL
);
CREATE INDEX idx_inlogpogingen_tijd ON inlogpogingen(tijdstip);
