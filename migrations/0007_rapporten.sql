-- Rapporten: tussenrapport en eindrapport.
-- De feiten (cijfers en tabellen) komen uit de gegevens van het onderzoek en worden vastgelegd op een
-- peildatum; de tekst (duiding, conclusies, aanbevelingen) schrijft de onderzoeker zelf.

CREATE TABLE rapporten (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  soort         TEXT    NOT NULL DEFAULT 'eind',  -- 'tussen' of 'eind'
  titel         TEXT    NOT NULL,
  inhoud        TEXT    NOT NULL DEFAULT '{}',    -- JSON: voorblad en hoofdstukken met eigen tekst
  feiten        TEXT    NOT NULL DEFAULT '',      -- JSON: de cijfers zoals vastgelegd op de peildatum
  aangemaakt_op TEXT    NOT NULL,
  bijgewerkt_op TEXT    NOT NULL
);
CREATE INDEX idx_rapporten_onderzoek ON rapporten(onderzoek_id);
