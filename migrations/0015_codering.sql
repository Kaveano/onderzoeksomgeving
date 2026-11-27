-- Open antwoorden en interviews coderen (kwalitatieve analyse).
-- Een code hoort bij een onderzoek. Een codering koppelt een code aan één antwoord (inzending + vraag) of aan één
-- stuk eigen invoer (bijv. een interview). Citaten zijn een bewerkbare kopie van (een deel van) een antwoord.
CREATE TABLE codes (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  naam          TEXT    NOT NULL,
  omschrijving  TEXT    NOT NULL DEFAULT '',
  groep         TEXT    NOT NULL DEFAULT '',     -- optionele hoofdcode
  volgorde      INTEGER NOT NULL DEFAULT 0,
  aangemaakt_op TEXT    NOT NULL
);
CREATE UNIQUE INDEX idx_codes_naam ON codes(onderzoek_id, naam);

CREATE TABLE coderingen (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  code_id       INTEGER NOT NULL REFERENCES codes(id) ON DELETE CASCADE,
  inzending_id  INTEGER REFERENCES inzendingen(id) ON DELETE CASCADE,
  vraag_id      INTEGER,                               -- bewust zonder verwijzing (zie 0011)
  invoer_id     INTEGER REFERENCES eigen_invoer(id) ON DELETE CASCADE,
  CHECK ((inzending_id IS NOT NULL AND vraag_id IS NOT NULL AND invoer_id IS NULL)
      OR (inzending_id IS NULL AND vraag_id IS NULL AND invoer_id IS NOT NULL))
);
CREATE UNIQUE INDEX idx_coderingen_antwoord ON coderingen(code_id, inzending_id, vraag_id) WHERE inzending_id IS NOT NULL;
CREATE UNIQUE INDEX idx_coderingen_invoer ON coderingen(code_id, invoer_id) WHERE invoer_id IS NOT NULL;
CREATE INDEX idx_coderingen_onderzoek ON coderingen(onderzoek_id);

CREATE TABLE citaten (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  code_id       INTEGER REFERENCES codes(id) ON DELETE SET NULL,
  inzending_id  INTEGER REFERENCES inzendingen(id) ON DELETE CASCADE,
  vraag_id      INTEGER,
  invoer_id     INTEGER REFERENCES eigen_invoer(id) ON DELETE CASCADE,
  tekst         TEXT    NOT NULL,                      -- zoals het in het rapport komt (ingekort of onherkenbaar gemaakt)
  gecontroleerd INTEGER NOT NULL DEFAULT 0 CHECK (gecontroleerd IN (0, 1)),
  in_rapport    INTEGER NOT NULL DEFAULT 0 CHECK (in_rapport IN (0, 1)),
  volgorde      INTEGER NOT NULL DEFAULT 0,
  aangemaakt_op TEXT    NOT NULL,
  bijgewerkt_op TEXT    NOT NULL
);
CREATE INDEX idx_citaten_onderzoek ON citaten(onderzoek_id);

-- Indexen voor de verwijzingen hierboven (ON DELETE CASCADE / SET NULL). Zonder index doorzoekt SQLite bij elke
-- verwijderde inzending, eigen invoer of code de hele tabel coderingen en citaten: met 20.000 coderingen kost het
-- wissen van een vragenlijst met 2.000 inzendingen dan ruim 260 miljoen stappen, met deze indexen 0,25 miljoen.
CREATE INDEX idx_coderingen_inzending ON coderingen(inzending_id);
CREATE INDEX idx_coderingen_eigen_invoer ON coderingen(invoer_id);
CREATE INDEX idx_coderingen_code ON coderingen(code_id);
CREATE INDEX idx_citaten_inzending ON citaten(inzending_id);
CREATE INDEX idx_citaten_eigen_invoer ON citaten(invoer_id);
CREATE INDEX idx_citaten_code ON citaten(code_id);
