-- Werkbank (Analyse > Werkbank): eigen variabelen, selecties en bewaarde analyses.
-- Alleen de definities worden bewaard. De waarden per respondent en de uitkomsten rekent de browser
-- steeds opnieuw uit de antwoorden; er worden dus geen nieuwe gegevens over personen opgeslagen.
CREATE TABLE werkbank_definities (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  dataset_id    INTEGER REFERENCES datasets(id) ON DELETE CASCADE,   -- NULL = de antwoorden op de vragenlijsten
  soort         TEXT    NOT NULL CHECK (soort IN ('bereken', 'omscoren', 'hercoderen', 'filter', 'eigenschappen')),
  naam          TEXT    NOT NULL,
  label         TEXT    NOT NULL DEFAULT '',
  definitie     TEXT    NOT NULL CHECK (json_valid(definitie)),
  volgorde      INTEGER NOT NULL DEFAULT 0,
  verwijderd_op TEXT,                       -- indeling of selectie die nog meetelt bij de controle op terugrekenen
  aangemaakt_op TEXT    NOT NULL,
  bijgewerkt_op TEXT    NOT NULL
);
CREATE INDEX idx_wb_definities_onderzoek ON werkbank_definities(onderzoek_id);

CREATE TABLE werkbank_analyses (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  dataset_id    INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
  titel         TEXT    NOT NULL,
  procedure     TEXT    NOT NULL,
  spec          TEXT    NOT NULL CHECK (json_valid(spec)),
  notitie       TEXT    NOT NULL DEFAULT '',
  volgorde      INTEGER NOT NULL DEFAULT 0,
  aangemaakt_op TEXT    NOT NULL,
  bijgewerkt_op TEXT    NOT NULL
);
CREATE INDEX idx_wb_analyses_onderzoek ON werkbank_analyses(onderzoek_id);

-- Indexen voor dataset_id (ON DELETE CASCADE): anders doorzoekt het verwijderen van een dataset beide tabellen helemaal.
CREATE INDEX idx_wb_definities_dataset ON werkbank_definities(dataset_id);
CREATE INDEX idx_wb_analyses_dataset ON werkbank_analyses(dataset_id);
