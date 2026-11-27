-- HR-analytics: instellingen per onderzoek en personeelscijfers.
-- Van een personeelsbestand worden ALLEEN groepscijfers bewaard (aantallen en sommen per groep), berekend in de
-- browser. Er komt nooit een rij per medewerker, naam, personeelsnummer of geboortedatum op de server.
CREATE TABLE hr_instellingen (
  onderzoek_id  INTEGER PRIMARY KEY REFERENCES onderzoeken(id) ON DELETE CASCADE,
  inhoud        TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(inhoud)),   -- HrInstellingen v1, max 100 KB
  bijgewerkt_op TEXT    NOT NULL
);

CREATE TABLE personeelscijfers (
  id            INTEGER PRIMARY KEY,
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  naam          TEXT    NOT NULL,                                          -- bijv. "Personeelsbestand 2025"
  periode_van   TEXT    NOT NULL,                                          -- JJJJ-MM
  periode_tot   TEXT    NOT NULL,                                          -- JJJJ-MM; peildatum = laatste dag van deze maand
  inhoud        TEXT    NOT NULL CHECK (json_valid(inhoud)),               -- Personeelsaggregaat v1, max 200 KB
  bewaren_tot   TEXT    NOT NULL,                                          -- JJJJ-MM-DD; daarna een melding bij Overzicht en Afronden
  aangemaakt_op TEXT    NOT NULL
);
CREATE INDEX idx_personeelscijfers_onderzoek ON personeelscijfers(onderzoek_id);
