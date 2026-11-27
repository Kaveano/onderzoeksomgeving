-- Bibliotheek: bronnen om je onderzoek op te baseren. Eén bibliotheek voor alle onderzoeken.
-- collectie 'start' komt uit de startcollectie (migratie 0016) en is alleen-lezen (wel notities, koppelen en verbergen);
-- collectie 'eigen' voeg je zelf toe, plak je als verwijzing of lees je in (RIS).
CREATE TABLE bronnen (
  id               INTEGER PRIMARY KEY,
  collectie        TEXT    NOT NULL DEFAULT 'eigen' CHECK (collectie IN ('start', 'eigen')),
  sleutel          TEXT    UNIQUE,              -- vaste sleutel in de startcollectie; NULL bij eigen bronnen
  citeersleutel    TEXT    NOT NULL UNIQUE,     -- code in de rapporttekst, bijv. [@cbs2024]; verandert nooit
  soort            TEXT    NOT NULL CHECK (soort IN ('artikel','rapport','boek','hoofdstuk','website','wet',
                                                     'richtlijn','cijfers','proefschrift','notitie','overig')),
  titel            TEXT    NOT NULL,
  auteurs          TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(auteurs)),      -- [{achternaam,tussenvoegsel,voorletters}]
  organisatie      TEXT    NOT NULL DEFAULT '',
  afkorting        TEXT    NOT NULL DEFAULT '',
  jaar             INTEGER CHECK (jaar IS NULL OR jaar BETWEEN 1800 AND 2200),      -- NULL = z.d.
  taal             TEXT    NOT NULL DEFAULT 'nl' CHECK (taal IN ('nl','en','de','fr','anders')),
  url              TEXT    NOT NULL DEFAULT '',
  doi              TEXT    NOT NULL DEFAULT '',
  details          TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(details)),
  onderwerpen      TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(onderwerpen)),
  trefwoorden      TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(trefwoorden)),
  samenvatting     TEXT    NOT NULL DEFAULT '',
  kernpunten       TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(kernpunten)),
  betrouwbaarheid  TEXT    NOT NULL DEFAULT 'onbekend' CHECK (betrouwbaarheid IN ('hoog','redelijk','beperkt','onbekend')),
  betrouwbaarheid_toelichting TEXT NOT NULL DEFAULT '',
  notities         TEXT    NOT NULL DEFAULT '',  -- alleen voor de onderzoeker; nooit in een rapport, deellink of RIS
  verborgen        INTEGER NOT NULL DEFAULT 0 CHECK (verborgen IN (0, 1)),  -- startcollectie: verborgen i.p.v. verwijderd
  kopie_van        TEXT,                         -- eigen kopie: de sleutel van de bron uit de startcollectie
  aangemaakt_op    TEXT    NOT NULL,
  bijgewerkt_op    TEXT    NOT NULL
);
CREATE INDEX idx_bronnen_collectie ON bronnen(collectie);

CREATE TABLE bron_koppelingen (
  onderzoek_id  INTEGER NOT NULL REFERENCES onderzoeken(id) ON DELETE CASCADE,
  bron_id       INTEGER NOT NULL REFERENCES bronnen(id) ON DELETE CASCADE,
  notitie       TEXT    NOT NULL DEFAULT '',     -- waarvoor je de bron in dit onderzoek gebruikt
  aangemaakt_op TEXT    NOT NULL,
  PRIMARY KEY (onderzoek_id, bron_id)
);
CREATE INDEX idx_bron_koppelingen_bron ON bron_koppelingen(bron_id);

INSERT INTO instellingen (sleutel, waarde) VALUES ('bibliotheek_versie', '1') ON CONFLICT(sleutel) DO NOTHING;
