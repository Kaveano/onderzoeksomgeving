-- Sjablonen volledig bewerkbaar maken.
-- Alle sjablonen staan voortaan in deze tabel, ook de standaardsjablonen. Die worden
-- automatisch uit de code overgenomen zodra de sjablonen voor het eerst worden opgevraagd.
--
-- bron          = kenmerk van het standaardsjabloon waar dit sjabloon van afkomt
--                 (bijv. 'medewerkerstevredenheid'); leeg (NULL) bij een eigen sjabloon.
-- bijgewerkt_op = tijdstip van de laatste wijziging; leeg zolang het sjabloon niet is aangepast.
ALTER TABLE sjablonen ADD COLUMN bron TEXT;
ALTER TABLE sjablonen ADD COLUMN bijgewerkt_op TEXT;
CREATE INDEX idx_sjablonen_bron ON sjablonen(bron);
