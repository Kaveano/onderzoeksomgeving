-- Interne instellingen, zoals een willekeurige sleutel om afzenders van inlogpogingen
-- onherkenbaar te maken. Niets hiervan is afgeleid van het wachtwoord.
CREATE TABLE instellingen (
  sleutel TEXT PRIMARY KEY,
  waarde  TEXT NOT NULL
);
