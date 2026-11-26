-- Eigen datasets: een Excel- of CSV-bestand dat de onderzoeker toevoegt om bij Analyse te onderzoeken
-- (bijvoorbeeld verzuimcijfers per afdeling). De inhoud staat als JSON in de database.
CREATE TABLE datasets (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  naam          TEXT    NOT NULL,
  kolommen      TEXT    NOT NULL,   -- JSON: namen van de kolommen
  rijen         TEXT    NOT NULL,   -- JSON: lijst van rijen; een cel is een getal, tekst of leeg (null)
  aantal_rijen  INTEGER NOT NULL,
  aangemaakt_op TEXT    NOT NULL
);
CREATE INDEX idx_datasets_onderzoek ON datasets(onderzoek_id);
