// Standaardsjablonen. Bij het toepassen worden thema's, meetpunten, vragen en acties
// in het onderzoek gekopieerd; daarna zijn ze daar vrij aan te passen.
// {bedrijf} wordt bij het toepassen vervangen door de bedrijfsnaam.

// Eerlijke uitleg over anonimiteit (klopt met wat de app werkelijk opslaat en toont).
export const INTRO_ANONIEM =
  'Je antwoorden zijn anoniem. We vragen niet naar je naam en slaan geen e-mailadres of IP-adres op. ' +
  'Van het invullen bewaren we alleen de datum, niet het tijdstip. ' +
  'Resultaten per groep (bijvoorbeeld per afdeling) worden alleen getoond als minstens 5 personen uit die groep hebben gereageerd. ' +
  'Antwoorden op open vragen worden letterlijk gelezen; noem daarin daarom geen namen. ' +
  'Deelname is vrijwillig. Vragen met een sterretje (*) zijn verplicht; de andere kun je overslaan als je ze niet wilt beantwoorden.';

const BEDANKT =
  'Hartelijk dank voor het invullen! Je antwoorden zijn anoniem opgeslagen. Je kunt dit venster nu sluiten.';

const ACHTERGROND_THEMA = {
  naam: 'Achtergrond',
  omschrijving: 'Algemene vragen om de resultaten per groep te kunnen bekijken (alleen bij minimaal 5 respondenten per groep).',
  meetpunten: [],
};

const ACHTERGROND_VRAGEN = [
  {
    thema: 'Achtergrond',
    type: 'meerkeuze',
    tekst: 'Op welke afdeling werk je?',
    opties: ['Afdeling A', 'Afdeling B', 'Afdeling C'],
    uitsplitsen: true,
  },
  {
    thema: 'Achtergrond',
    type: 'meerkeuze',
    tekst: 'Hoe lang werk je al bij {bedrijf}?',
    opties: ['Korter dan 1 jaar', '1 tot 5 jaar', '5 tot 10 jaar', '10 jaar of langer'],
    uitsplitsen: true,
  },
];

const ACHTERGROND_ACTIE = 'Afdelingen in de achtergrondvraag aanpassen aan de organisatie';

export const STANDAARD_SJABLONEN = [
  {
    id: 'medewerkerstevredenheid',
    naam: 'Medewerkerstevredenheid',
    omschrijving: 'Werkinhoud, werkdruk, leidinggevende, samenwerking, organisatie en betrokkenheid.',
    inhoud: {
      vragenlijst: {
        titel: 'Medewerkersonderzoek',
        introtekst:
          'Fijn dat je mee wilt doen aan het medewerkersonderzoek van {bedrijf}. Met deze vragenlijst willen we beter begrijpen hoe je je werk en de organisatie ervaart, zodat we gericht kunnen verbeteren. Het invullen duurt ongeveer 10 minuten.\n\n' +
          INTRO_ANONIEM,
        bedanktekst: BEDANKT,
      },
      themas: [
        {
          naam: 'Werkinhoud en ontwikkeling',
          omschrijving: 'Hoe medewerkers hun werk en hun ontwikkelmogelijkheden ervaren.',
          meetpunten: [
            { naam: 'Tevredenheid over werkinhoud', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Ontwikkelmogelijkheden', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Werkdruk en balans',
          omschrijving: 'Ervaren werkdruk en de balans tussen werk en privé.',
          meetpunten: [
            { naam: 'Ervaren werkdruk', omschrijving: 'Hogere score = werkdruk beter te doen', eenheid: 'score 1–5' },
            { naam: 'Balans werk en privé', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Leidinggevende',
          omschrijving: 'Waardering, bereikbaarheid en feedback van de direct leidinggevende.',
          meetpunten: [{ naam: 'Waardering leidinggevende', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Samenwerking en sfeer',
          omschrijving: 'Samenwerking in het team en met andere afdelingen.',
          meetpunten: [{ naam: 'Samenwerking in het team', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Organisatie en communicatie',
          omschrijving: 'Informatievoorziening en vertrouwen in de koers.',
          meetpunten: [{ naam: 'Informatievoorziening', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Betrokkenheid',
          omschrijving: 'Plezier, trots en de intentie om te blijven.',
          meetpunten: [
            { naam: 'Bevlogenheid', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Vertrekintentie', omschrijving: 'Hogere score = blijft liever', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Verzuim en verloop',
          omschrijving: 'Cijfers uit de HR-administratie (zelf invoeren bij Eigen invoer).',
          meetpunten: [
            { naam: 'Verzuimpercentage', omschrijving: 'Uit de verzuimregistratie', eenheid: '%' },
            { naam: 'Meldingsfrequentie', omschrijving: 'Gemiddeld aantal ziekmeldingen per medewerker per jaar', eenheid: 'aantal' },
            { naam: 'Verloop', omschrijving: 'Vertrokken medewerkers als percentage van het gemiddelde aantal', eenheid: '%' },
          ],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        { thema: 'Werkinhoud en ontwikkeling', meetpunt: 'Tevredenheid over werkinhoud', type: 'schaal', tekst: 'Ik vind mijn werk interessant en uitdagend.' },
        { thema: 'Werkinhoud en ontwikkeling', meetpunt: 'Tevredenheid over werkinhoud', type: 'schaal', tekst: 'Ik kan mijn kennis en vaardigheden goed gebruiken in mijn werk.' },
        { thema: 'Werkinhoud en ontwikkeling', meetpunt: 'Tevredenheid over werkinhoud', type: 'schaal', tekst: 'Ik heb voldoende zelfstandigheid in de manier waarop ik mijn werk doe.' },
        { thema: 'Werkinhoud en ontwikkeling', meetpunt: 'Ontwikkelmogelijkheden', type: 'schaal', tekst: 'Ik heb voldoende mogelijkheden om mij te ontwikkelen.' },
        { thema: 'Werkdruk en balans', meetpunt: 'Ervaren werkdruk', type: 'schaal', tekst: 'De hoeveelheid werk is goed te doen binnen mijn werktijd.' },
        { thema: 'Werkdruk en balans', meetpunt: 'Ervaren werkdruk', type: 'schaal', tekst: 'Ik heb na het werk nog voldoende energie over.' },
        { thema: 'Werkdruk en balans', meetpunt: 'Balans werk en privé', type: 'schaal', tekst: 'Ik kan werk en privé goed combineren.' },
        { thema: 'Leidinggevende', meetpunt: 'Waardering leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende geeft mij waardering voor mijn werk.' },
        { thema: 'Leidinggevende', meetpunt: 'Waardering leidinggevende', type: 'schaal', tekst: 'Ik krijg van mijn leidinggevende bruikbare feedback.' },
        { thema: 'Leidinggevende', meetpunt: 'Waardering leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende is goed bereikbaar als ik hem of haar nodig heb.' },
        { thema: 'Leidinggevende', meetpunt: 'Waardering leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende betrekt mij bij beslissingen die mijn werk raken.' },
        { thema: 'Samenwerking en sfeer', meetpunt: 'Samenwerking in het team', type: 'schaal', tekst: 'De samenwerking binnen mijn team is goed.' },
        { thema: 'Samenwerking en sfeer', meetpunt: 'Samenwerking in het team', type: 'schaal', tekst: 'Ik voel me veilig om in mijn team fouten of zorgen te bespreken.' },
        { thema: 'Samenwerking en sfeer', type: 'schaal', tekst: 'De samenwerking met andere afdelingen verloopt goed.', weet_niet: true },
        { thema: 'Organisatie en communicatie', meetpunt: 'Informatievoorziening', type: 'schaal', tekst: 'Ik word goed geïnformeerd over ontwikkelingen in de organisatie.' },
        { thema: 'Organisatie en communicatie', type: 'schaal', tekst: 'Ik heb vertrouwen in de koers van de organisatie.', weet_niet: true },
        { thema: 'Betrokkenheid', meetpunt: 'Bevlogenheid', type: 'schaal', tekst: 'Ik ga met plezier naar mijn werk.' },
        { thema: 'Betrokkenheid', meetpunt: 'Bevlogenheid', type: 'schaal', tekst: 'Ik ben trots op de organisatie waar ik werk.' },
        { thema: 'Betrokkenheid', meetpunt: 'Vertrekintentie', type: 'schaal', tekst: 'Ik verwacht over een jaar nog bij {bedrijf} te werken.' },
        { thema: 'Betrokkenheid', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden ben je, alles bij elkaar genomen, over je werk?' },
        { thema: 'Betrokkenheid', type: 'janee', tekst: 'Zou je {bedrijf} aanbevelen als werkgever aan vrienden of kennissen?' },
        { thema: 'Betrokkenheid', type: 'open', tekst: 'Wat gaat er goed bij {bedrijf} en moeten we vooral zo houden?' },
        { thema: 'Betrokkenheid', type: 'open', tekst: 'Wat zou volgens jou als eerste verbeterd moeten worden?' },
        ...ACHTERGROND_VRAGEN,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Vragenlijst laten controleren door opdrachtgever',
        'Aankondiging en link versturen naar medewerkers',
        'Herinnering sturen na één week',
        'Verzuim- en verloopcijfers opvragen en invoeren',
        'Resultaten analyseren en bevindingen schrijven',
        'Conceptrapport bespreken met opdrachtgever',
      ],
    },
  },
  {
    id: 'hr-processen',
    naam: 'HR-processen',
    omschrijving: 'Werving, onboarding, gesprekscyclus, opleiding, verzuimbegeleiding en HR-dienstverlening.',
    inhoud: {
      vragenlijst: {
        titel: 'Onderzoek HR-processen',
        introtekst:
          'Fijn dat je mee wilt doen aan dit onderzoek naar de HR-processen van {bedrijf}. We willen weten hoe je zaken als inwerken, gesprekken, opleiding en HR-ondersteuning ervaart, zodat we die kunnen verbeteren. Het invullen duurt ongeveer 8 minuten.\n\n' +
          INTRO_ANONIEM,
        bedanktekst: BEDANKT,
      },
      themas: [
        {
          naam: 'Werving en selectie',
          omschrijving: 'Hoe het sollicitatieproces is ervaren.',
          meetpunten: [
            { naam: 'Ervaring sollicitatieproces', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Doorlooptijd vacatures', omschrijving: 'Gemiddeld aantal dagen van vacature tot aanname', eenheid: 'dagen' },
          ],
        },
        {
          naam: 'Onboarding',
          omschrijving: 'De start en het inwerken van nieuwe medewerkers.',
          meetpunten: [{ naam: 'Kwaliteit inwerkperiode', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Gesprekscyclus',
          omschrijving: 'Plannings-, voortgangs- en beoordelingsgesprekken.',
          meetpunten: [
            { naam: 'Waarde van gesprekken', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Gevoerde jaargesprekken', omschrijving: 'Percentage medewerkers met een jaargesprek', eenheid: '%' },
          ],
        },
        {
          naam: 'Opleiding en ontwikkeling',
          omschrijving: 'Ruimte en kwaliteit van opleidingen.',
          meetpunten: [
            { naam: 'Ruimte voor ontwikkeling', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Besteding opleidingsbudget', omschrijving: 'Percentage van het budget dat is besteed', eenheid: '%' },
          ],
        },
        {
          naam: 'Verzuimbegeleiding',
          omschrijving: 'Begeleiding bij ziekte en duidelijkheid van de verzuimregels.',
          meetpunten: [
            { naam: 'Ervaren begeleiding bij ziekte', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Verzuimpercentage', omschrijving: 'Uit de verzuimregistratie', eenheid: '%' },
          ],
        },
        {
          naam: 'HR-dienstverlening',
          omschrijving: 'Bereikbaarheid van HR, afhandeling van vragen en gebruiksgemak van systemen.',
          meetpunten: [{ naam: 'Tevredenheid HR-dienstverlening', omschrijving: '', eenheid: 'score 1–5' }],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        { thema: 'Werving en selectie', meetpunt: 'Ervaring sollicitatieproces', type: 'schaal', tekst: 'Mijn sollicitatieprocedure verliep duidelijk en vlot.', weet_niet: true },
        { thema: 'Werving en selectie', meetpunt: 'Ervaring sollicitatieproces', type: 'schaal', tekst: 'De vacaturetekst gaf een realistisch beeld van mijn functie.', weet_niet: true },
        { thema: 'Onboarding', meetpunt: 'Kwaliteit inwerkperiode', type: 'schaal', tekst: 'Bij mijn start waren mijn werkplek en toegang tot systemen op tijd geregeld.', weet_niet: true },
        { thema: 'Onboarding', meetpunt: 'Kwaliteit inwerkperiode', type: 'schaal', tekst: 'Ik ben goed ingewerkt in mijn functie.', weet_niet: true },
        { thema: 'Onboarding', meetpunt: 'Kwaliteit inwerkperiode', type: 'schaal', tekst: 'Na mijn eerste maanden wist ik goed wat er van mij verwacht werd.', weet_niet: true },
        { thema: 'Gesprekscyclus', type: 'janee', tekst: 'Heb je het afgelopen jaar een ontwikkel- of beoordelingsgesprek gehad?' },
        { thema: 'Gesprekscyclus', meetpunt: 'Waarde van gesprekken', type: 'schaal', tekst: 'De gesprekken met mijn leidinggevende helpen mij om beter te functioneren.' },
        { thema: 'Gesprekscyclus', meetpunt: 'Waarde van gesprekken', type: 'schaal', tekst: 'Het is mij duidelijk hoe mijn functioneren wordt beoordeeld.' },
        { thema: 'Opleiding en ontwikkeling', meetpunt: 'Ruimte voor ontwikkeling', type: 'schaal', tekst: 'Ik krijg de ruimte om opleidingen of trainingen te volgen.' },
        { thema: 'Opleiding en ontwikkeling', meetpunt: 'Ruimte voor ontwikkeling', type: 'schaal', tekst: 'De opleidingen die ik volg zijn nuttig voor mijn werk.', weet_niet: true },
        { thema: 'Verzuimbegeleiding', meetpunt: 'Ervaren begeleiding bij ziekte', type: 'schaal', tekst: 'Het is mij duidelijk wat ik moet doen als ik me ziek meld.' },
        { thema: 'Verzuimbegeleiding', meetpunt: 'Ervaren begeleiding bij ziekte', type: 'schaal', tekst: 'Als ik ziek ben, voel ik me goed begeleid door mijn leidinggevende.', weet_niet: true },
        { thema: 'HR-dienstverlening', meetpunt: 'Tevredenheid HR-dienstverlening', type: 'schaal', tekst: 'Ik weet bij wie ik terechtkan met HR-vragen.' },
        { thema: 'HR-dienstverlening', meetpunt: 'Tevredenheid HR-dienstverlening', type: 'schaal', tekst: 'Mijn HR-vragen worden snel en goed afgehandeld.', weet_niet: true },
        { thema: 'HR-dienstverlening', meetpunt: 'Tevredenheid HR-dienstverlening', type: 'schaal', tekst: 'De HR-systemen (zoals verlof aanvragen of declareren) zijn gebruiksvriendelijk.', weet_niet: true },
        {
          thema: 'HR-dienstverlening',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Over welke HR-onderwerpen wil je beter geïnformeerd worden?',
          toelichting: 'Je kunt meerdere antwoorden kiezen.',
          opties: ['Verlof en verzuim', 'Salaris en toeslagen', 'Opleiding en ontwikkeling', 'Pensioen', 'Loopbaan en interne vacatures', 'Gezondheid en vitaliteit'],
        },
        { thema: 'HR-dienstverlening', type: 'open', tekst: 'Welk HR-proces zou volgens jou als eerste verbeterd moeten worden, en hoe?' },
        ...ACHTERGROND_VRAGEN,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Procesbeschrijvingen en HR-cijfers opvragen',
        'Interviews plannen met HR en leidinggevenden',
        'Aankondiging en link versturen naar medewerkers',
        'Resultaten analyseren en bevindingen schrijven',
        'Conceptrapport bespreken met opdrachtgever',
      ],
    },
  },
  {
    id: 'arbeidsvoorwaarden',
    naam: 'Arbeidsvoorwaarden',
    omschrijving: 'Salaris, secundaire voorwaarden, werktijden, verlof, ontwikkeling en wat medewerkers het belangrijkst vinden.',
    inhoud: {
      vragenlijst: {
        titel: 'Onderzoek arbeidsvoorwaarden',
        introtekst:
          'Fijn dat je mee wilt doen aan dit onderzoek naar de arbeidsvoorwaarden van {bedrijf}. We willen weten hoe je je beloning en regelingen ervaart en wat je het belangrijkst vindt. Het invullen duurt ongeveer 8 minuten.\n\n' +
          INTRO_ANONIEM,
        bedanktekst: BEDANKT,
      },
      themas: [
        {
          naam: 'Salaris en beloning',
          omschrijving: 'Hoogte, eerlijkheid en duidelijkheid van de beloning.',
          meetpunten: [
            { naam: 'Tevredenheid over salaris', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Duidelijkheid beloningsbeleid', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Secundaire arbeidsvoorwaarden',
          omschrijving: 'Pensioen, reiskosten, vakantiedagen en overige regelingen.',
          meetpunten: [{ naam: 'Tevredenheid secundaire voorwaarden', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Werktijden en flexibiliteit',
          omschrijving: 'Zeggenschap over werktijden en plaats.',
          meetpunten: [{ naam: 'Ervaren flexibiliteit', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Ontwikkeling en loopbaan',
          omschrijving: 'Opleidings- en loopbaanmogelijkheden als arbeidsvoorwaarde.',
          meetpunten: [],
        },
        {
          naam: 'Waardering en prioriteiten',
          omschrijving: 'Algemene waardering en wat medewerkers het belangrijkst vinden.',
          meetpunten: [{ naam: 'Totaaloordeel arbeidsvoorwaarden', omschrijving: '', eenheid: 'score 1–5' }],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        { thema: 'Salaris en beloning', meetpunt: 'Tevredenheid over salaris', type: 'schaal', tekst: 'Mijn salaris past bij mijn functie en verantwoordelijkheden.' },
        { thema: 'Salaris en beloning', meetpunt: 'Tevredenheid over salaris', type: 'schaal', tekst: 'Mijn salaris is vergelijkbaar met wat andere werkgevers bieden voor vergelijkbaar werk.', weet_niet: true },
        { thema: 'Salaris en beloning', meetpunt: 'Duidelijkheid beloningsbeleid', type: 'schaal', tekst: 'Het is mij duidelijk hoe salarisverhogingen tot stand komen.' },
        { thema: 'Secundaire arbeidsvoorwaarden', meetpunt: 'Tevredenheid secundaire voorwaarden', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden ben je over de pensioenregeling?', weet_niet: true },
        { thema: 'Secundaire arbeidsvoorwaarden', meetpunt: 'Tevredenheid secundaire voorwaarden', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden ben je over de reiskostenvergoeding?', weet_niet: true },
        { thema: 'Secundaire arbeidsvoorwaarden', meetpunt: 'Tevredenheid secundaire voorwaarden', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden ben je over het aantal vakantiedagen?' },
        { thema: 'Secundaire arbeidsvoorwaarden', type: 'schaal', tekst: 'Ik ken de regelingen voor bijzonder verlof, zoals ouderschaps- of zorgverlof.' },
        { thema: 'Werktijden en flexibiliteit', meetpunt: 'Ervaren flexibiliteit', type: 'schaal', tekst: 'Ik kan mijn werktijden voldoende zelf indelen.' },
        { thema: 'Werktijden en flexibiliteit', meetpunt: 'Ervaren flexibiliteit', type: 'schaal', tekst: 'De mogelijkheden om thuis of hybride te werken passen bij mijn situatie.', weet_niet: true },
        { thema: 'Ontwikkeling en loopbaan', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden ben je over de opleidings- en ontwikkelmogelijkheden?' },
        { thema: 'Ontwikkeling en loopbaan', type: 'schaal', tekst: 'Ik zie voor mezelf doorgroeimogelijkheden binnen {bedrijf}.', weet_niet: true },
        { thema: 'Waardering en prioriteiten', meetpunt: 'Totaaloordeel arbeidsvoorwaarden', type: 'schaal', tekst: 'Ik voel me gewaardeerd door de manier waarop {bedrijf} mij beloont.' },
        { thema: 'Waardering en prioriteiten', meetpunt: 'Totaaloordeel arbeidsvoorwaarden', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden ben je over je arbeidsvoorwaarden als geheel?' },
        {
          thema: 'Waardering en prioriteiten',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Welke arbeidsvoorwaarden vind jij het belangrijkst?',
          toelichting: 'Kies er maximaal drie.',
          opties: ['Salaris', 'Pensioen', 'Vakantiedagen', 'Flexibele werktijden', 'Thuiswerken', 'Opleidingsmogelijkheden', 'Reiskostenvergoeding', 'Bonus of winstdeling', 'Mobiliteitsbudget of leaseauto', 'Vitaliteit en sport'],
        },
        { thema: 'Waardering en prioriteiten', type: 'open', tekst: 'Welke arbeidsvoorwaarde mis je of zou je graag anders zien?' },
        ...ACHTERGROND_VRAGEN,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Huidige arbeidsvoorwaardenregeling en cao opvragen',
        'Marktvergelijking (benchmark) voorbereiden',
        'Aankondiging en link versturen naar medewerkers',
        'Resultaten analyseren en bevindingen schrijven',
        'Advies opstellen en bespreken met opdrachtgever',
      ],
    },
  },
];

export const STANDAARD_STUKKEN = [
  { soort: 'notitie', titel: 'Notities', inhoud: '' },
  { soort: 'bevindingen', titel: 'Bevindingen', inhoud: '' },
  {
    soort: 'rapport',
    titel: 'Conceptrapport',
    inhoud:
      '# Conceptrapport\n\n## 1. Inleiding\n\n\n## 2. Onderzoeksvraag\n\n\n## 3. Aanpak\n\n\n## 4. Resultaten\n\n\n## 5. Conclusies\n\n\n## 6. Aanbevelingen\n\n',
  },
];
