-- Vraagtype 'cijfer' (0–10 of 1–10) en achtergrondkenmerk per vraag.
-- SQLite kan een CHECK niet wijzigen: de tabel vragen wordt opnieuw opgebouwd. Er verwijst geen andere tabel
-- naar vragen(id), dus het verwijderen van de oude tabel raakt geen andere gegevens. De verwijzingen VANUIT
-- vragen (vragenlijsten CASCADE, themas, meetpunten SET NULL) worden precies zo overgenomen.
PRAGMA defer_foreign_keys = on;

CREATE TABLE vragen_nieuw (
  id                   INTEGER PRIMARY KEY,
  vragenlijst_id       INTEGER NOT NULL REFERENCES vragenlijsten(id) ON DELETE CASCADE,
  thema_id             INTEGER NOT NULL REFERENCES themas(id),
  meetpunt_id          INTEGER REFERENCES meetpunten(id) ON DELETE SET NULL,
  type                 TEXT    NOT NULL CHECK (type IN ('schaal', 'meerkeuze', 'janee', 'open', 'cijfer')),
  tekst                TEXT    NOT NULL,
  toelichting          TEXT    NOT NULL DEFAULT '',
  opties               TEXT    NOT NULL DEFAULT '[]',
  schaal_soort         TEXT    NOT NULL DEFAULT 'eens',   -- schaal: eens|tevreden|frequentie|kwaliteit; cijfer: nps|rapport
  meerdere_antwoorden  INTEGER NOT NULL DEFAULT 0,
  verplicht            INTEGER NOT NULL DEFAULT 0,
  weet_niet            INTEGER NOT NULL DEFAULT 0,
  uitsplitsen          INTEGER NOT NULL DEFAULT 0,
  bron_vraag_id        INTEGER,
  volgorde             INTEGER NOT NULL DEFAULT 0,
  kenmerk              TEXT    NOT NULL DEFAULT ''        -- '' of een sleutel uit KENMERKEN (public/js/beheer/kenmerken.js)
);
INSERT INTO vragen_nieuw (id, vragenlijst_id, thema_id, meetpunt_id, type, tekst, toelichting, opties, schaal_soort,
  meerdere_antwoorden, verplicht, weet_niet, uitsplitsen, bron_vraag_id, volgorde, kenmerk)
SELECT id, vragenlijst_id, thema_id, meetpunt_id, type, tekst, toelichting, opties, schaal_soort,
  meerdere_antwoorden, verplicht, weet_niet, uitsplitsen, bron_vraag_id, volgorde, '' FROM vragen;
DROP TABLE vragen;
ALTER TABLE vragen_nieuw RENAME TO vragen;
CREATE INDEX idx_vragen_vragenlijst ON vragen(vragenlijst_id);
CREATE INDEX idx_vragen_thema ON vragen(thema_id);

-- Bestaande achtergrondvragen uit de standaardsjablonen krijgen hun kenmerk (de eerste per vragenlijst).
UPDATE vragen SET kenmerk = 'afdeling' WHERE id IN (
  SELECT MIN(id) FROM vragen WHERE kenmerk = '' AND type = 'meerkeuze' AND meerdere_antwoorden = 0
    AND tekst IN ('Op welke afdeling werk je?', 'Op welke afdeling werkte je?') GROUP BY vragenlijst_id);
UPDATE vragen SET kenmerk = 'diensttijd' WHERE id IN (
  SELECT MIN(id) FROM vragen WHERE kenmerk = '' AND type = 'meerkeuze' AND meerdere_antwoorden = 0
    AND (tekst LIKE 'Hoe lang werk je al bij %?' OR tekst LIKE 'Hoe lang werk je bij %?' OR tekst LIKE 'Hoe lang heb je bij % gewerkt?')
  GROUP BY vragenlijst_id);
UPDATE vragen SET kenmerk = 'leidinggevend' WHERE id IN (
  SELECT MIN(id) FROM vragen WHERE kenmerk = '' AND type = 'janee'
    AND tekst = 'Geef je zelf leiding aan een of meer medewerkers?' GROUP BY vragenlijst_id);
