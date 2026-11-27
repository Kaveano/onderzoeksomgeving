-- Foute toegangscodes per afzender tellen (een niet terug te rekenen code, na een dag gewist),
-- zodat iemand met alleen de link de echte meelezer niet kan buitensluiten.
ALTER TABLE kijkpogingen ADD COLUMN afzender TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_kijkpogingen_afzender ON kijkpogingen(deellink_id, afzender, tijdstip);
