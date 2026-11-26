-- Tekst van de uitnodiging en de herinnering per vragenlijst (JSON met onderwerp en tekst).
-- Er worden geen e-mailadressen bewaard en de omgeving verstuurt zelf geen e-mail.
ALTER TABLE vragenlijsten ADD COLUMN uitnodiging TEXT NOT NULL DEFAULT '';
