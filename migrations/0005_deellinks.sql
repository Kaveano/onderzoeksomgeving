-- Deellinks: een onderzoek alleen-lezen laten inzien door anderen (bijvoorbeeld de opdrachtgever).
-- Een kijker heeft de link (/d/<code>) én een toegangscode nodig. Van kijkers wordt niets bewaard.

CREATE TABLE deellinks (
  id             INTEGER PRIMARY KEY,
  onderzoek_id   INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  naam           TEXT    NOT NULL DEFAULT '',   -- voor wie de link bedoeld is
  code           TEXT    NOT NULL UNIQUE,       -- niet te raden code in de link
  toegang_zout   TEXT    NOT NULL,
  toegang_hash   TEXT    NOT NULL,              -- alleen een hash van de toegangscode
  onderdelen     TEXT    NOT NULL DEFAULT '{}', -- JSON: wat de kijker mag zien
  verloopt_op    TEXT,                          -- laatste dag dat de link werkt (JJJJ-MM-DD) of leeg
  ingetrokken    INTEGER NOT NULL DEFAULT 0,
  aangemaakt_op  TEXT    NOT NULL,
  laatst_bekeken TEXT                           -- alleen de datum, geen gegevens over de kijker
);
CREATE INDEX idx_deellinks_onderzoek ON deellinks(onderzoek_id);

-- Sessies van kijkers (alleen een hash van de sessiesleutel).
CREATE TABLE kijksessies (
  token_hash   TEXT PRIMARY KEY,
  deellink_id  INTEGER NOT NULL REFERENCES deellinks(id) ON DELETE CASCADE,
  verloopt_op  INTEGER NOT NULL
);
CREATE INDEX idx_kijksessies_link ON kijksessies(deellink_id);

-- Mislukte pogingen met een verkeerde toegangscode (alleen tijdstip), om raden te remmen.
CREATE TABLE kijkpogingen (
  id           INTEGER PRIMARY KEY,
  deellink_id  INTEGER NOT NULL REFERENCES deellinks(id) ON DELETE CASCADE,
  tijdstip     INTEGER NOT NULL
);
CREATE INDEX idx_kijkpogingen_link ON kijkpogingen(deellink_id, tijdstip);
