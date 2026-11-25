-- Aanvullende beveiliging
-- 1. Sessies onthouden een kenmerk van het wachtwoord. Wijzig je het wachtwoord in Cloudflare,
--    dan zijn alle bestaande sessies direct ongeldig.
ALTER TABLE sessies ADD COLUMN wachtwoord_kenmerk TEXT NOT NULL DEFAULT '';

-- 2. Mislukte inlogpogingen worden per afzender geteld (een versleutelde, niet terug te
--    rekenen code, na een dag gewist), zodat één persoon de beheerder niet kan buitensluiten.
ALTER TABLE inlogpogingen ADD COLUMN afzender TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_inlogpogingen_afzender ON inlogpogingen(afzender, tijdstip);

-- 3. Oude tellers tegen misbruik snel kunnen opruimen.
CREATE INDEX idx_inzendteller_tijdvak ON inzendteller(tijdvak);
