// Extra standaardsjablonen (aanvulling op src/sjablonen.js). Zelfde opbouw als STANDAARD_SJABLONEN.
//
// Uitgangspunten:
// - Alle schaalvragen zijn zo gesteld dat een HOGERE score GUNSTIGER is. Zo zijn de gemiddelden
//   per thema en per meetpunt direct te lezen (1 = ongunstig, 5 = gunstig).
// - De vragen zijn zelf geformuleerd; er is geen tekst overgenomen uit bestaande vragenlijsten.
// - Een vraag die in meerdere sjablonen thuishoort, heeft overal precies dezelfde tekst. Bij het
//   combineren van sjablonen komt zo'n vraag er dan maar één keer in. Hetzelfde geldt voor de
//   namen van cijfers zoals "Verzuimpercentage" en voor de standaardacties.
// - Meetpunten met een andere eenheid dan 'score 1–5' zijn cijfers uit de HR-administratie;
//   die vul je zelf in bij Eigen invoer.
// - {bedrijf} wordt bij het toepassen vervangen door de bedrijfsnaam.

import { INTRO_ANONIEM } from './sjablonen.js';

// Dezelfde teksten als in src/sjablonen.js (daar niet geëxporteerd), zodat het thema
// "Achtergrond" en de bijbehorende vragen en actie bij het combineren samenvallen.
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
    kenmerk: 'afdeling',
  },
  {
    thema: 'Achtergrond',
    type: 'meerkeuze',
    tekst: 'Hoe lang werk je al bij {bedrijf}?',
    opties: ['Korter dan 1 jaar', '1 tot 5 jaar', '5 tot 10 jaar', '10 jaar of langer'],
    uitsplitsen: true,
    kenmerk: 'diensttijd',
  },
];

const ACHTERGROND_ACTIE = 'Afdelingen in de achtergrondvraag aanpassen aan de organisatie';

// Nieuwe medewerkers: de diensttijd in maanden, want vrijwel iedereen is korter dan een jaar in dienst.
const ACHTERGROND_ONBOARDING = [
  ACHTERGROND_VRAGEN[0],
  {
    thema: 'Achtergrond',
    type: 'meerkeuze',
    tekst: 'Hoe lang werk je bij {bedrijf}?',
    opties: ['Korter dan 3 maanden', '3 tot 6 maanden', '6 tot 12 maanden', 'Een jaar of langer'],
    uitsplitsen: true,
    kenmerk: 'diensttijd',
  },
];

// Vertrekkers: terugblikkend gevraagd en zonder uitsplitsing, want per afdeling of diensttijd
// zijn er bijna altijd minder dan 5 vertrekkers. Het kenmerk staat er wel bij (wie heeft er meegedaan?).
const ACHTERGROND_VERTREK = [
  {
    thema: 'Achtergrond',
    type: 'meerkeuze',
    tekst: 'Op welke afdeling werkte je?',
    opties: ['Afdeling A', 'Afdeling B', 'Afdeling C'],
    kenmerk: 'afdeling',
  },
  {
    thema: 'Achtergrond',
    type: 'meerkeuze',
    tekst: 'Hoe lang heb je bij {bedrijf} gewerkt?',
    opties: ['Korter dan 1 jaar', '1 tot 5 jaar', '5 tot 10 jaar', '10 jaar of langer'],
    kenmerk: 'diensttijd',
  },
];

const CIJFERS = 'Cijfers uit de HR-administratie (zelf invoeren bij Eigen invoer).';

export const EXTRA_SJABLONEN = [
  // ------------------------------------------------------------------ 1. Verzuim en vitaliteit
  {
    id: 'verzuim-vitaliteit',
    naam: 'Verzuim en vitaliteit',
    omschrijving: 'Energie en herstel, belastbaarheid, aandacht voor gezond werken, ziekmelden en begeleiding bij ziekte, plus de verzuimcijfers.',
    inhoud: {
      vragenlijst: {
        titel: 'Onderzoek verzuim en vitaliteit',
        introtekst:
          'Fijn dat je mee wilt doen aan dit onderzoek naar verzuim en vitaliteit bij {bedrijf}. We willen weten hoe het met je energie gaat, of je je werk goed kunt volhouden en hoe je de aandacht voor gezond werken en de begeleiding bij ziekte ervaart. We vragen niet naar ziektes, klachten of de reden van een ziekmelding. Het invullen duurt ongeveer 8 minuten.\n\n' +
          INTRO_ANONIEM,
        bedanktekst: BEDANKT,
      },
      themas: [
        {
          naam: 'Energie en herstel',
          omschrijving: 'Hoe fit medewerkers zich voelen voor hun werk en of ze na het werk voldoende herstellen.',
          meetpunten: [
            { naam: 'Energie voor het werk', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Herstel na het werk', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Belastbaarheid en werkomstandigheden',
          omschrijving: 'Of het werk lichamelijk en mentaal vol te houden is, nu en in de komende jaren.',
          meetpunten: [
            { naam: 'Werk is vol te houden', omschrijving: 'Hogere score = werk beter vol te houden', eenheid: 'score 1–5' },
            { naam: 'Gezonde werkomstandigheden', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Aandacht voor gezond werken',
          omschrijving: 'Wat de organisatie en de leidinggevende doen om medewerkers gezond en met plezier te laten werken.',
          meetpunten: [{ naam: 'Steun bij gezond werken', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Ziekmelden en begeleiding',
          omschrijving: 'Duidelijkheid van de afspraken rond ziekte, het contact tijdens ziekte en de terugkeer naar het werk.',
          meetpunten: [
            { naam: 'Duidelijkheid verzuimafspraken', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Begeleiding en terugkeer', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Verzuimcijfers',
          omschrijving: CIJFERS,
          meetpunten: [
            { naam: 'Verzuimpercentage', omschrijving: 'Uit de verzuimregistratie', eenheid: '%' },
            { naam: 'Meldingsfrequentie', omschrijving: 'Gemiddeld aantal ziekmeldingen per medewerker per jaar', eenheid: 'aantal' },
            { naam: 'Gemiddelde verzuimduur', omschrijving: 'Gemiddeld aantal kalenderdagen per afgesloten ziekmelding', eenheid: 'dagen' },
            { naam: 'Nulverzuim', omschrijving: 'Percentage medewerkers dat zich in de periode niet ziek heeft gemeld', eenheid: '%' },
          ],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        { thema: 'Energie en herstel', meetpunt: 'Energie voor het werk', type: 'schaal', tekst: 'Ik voel me lichamelijk fit genoeg voor mijn werk.' },
        { thema: 'Energie en herstel', meetpunt: 'Energie voor het werk', type: 'schaal', tekst: 'Ik voel me mentaal fit genoeg voor mijn werk.' },
        { thema: 'Energie en herstel', meetpunt: 'Energie voor het werk', type: 'schaal', tekst: 'Ik heb tijdens een werkdag genoeg energie om mijn werk goed te doen.' },
        { thema: 'Energie en herstel', meetpunt: 'Herstel na het werk', type: 'schaal', tekst: 'Ik kan na het werk goed loskomen van mijn werk.' },
        { thema: 'Energie en herstel', meetpunt: 'Herstel na het werk', type: 'schaal', tekst: 'Ik begin meestal uitgerust aan een nieuwe werkdag.' },
        { thema: 'Energie en herstel', meetpunt: 'Herstel na het werk', type: 'schaal', schaal_soort: 'frequentie', tekst: 'Hoe vaak kun je tijdens je werk een echte pauze nemen?' },
        { thema: 'Belastbaarheid en werkomstandigheden', meetpunt: 'Werk is vol te houden', type: 'schaal', tekst: 'Ik kan de lichamelijke kant van mijn werk goed aan.' },
        { thema: 'Belastbaarheid en werkomstandigheden', meetpunt: 'Werk is vol te houden', type: 'schaal', tekst: 'Ik kan de mentale kant van mijn werk goed aan.' },
        { thema: 'Belastbaarheid en werkomstandigheden', meetpunt: 'Werk is vol te houden', type: 'schaal', tekst: 'Ik kan mijn werk zo indelen dat het past bij wat ik aankan.' },
        { thema: 'Belastbaarheid en werkomstandigheden', meetpunt: 'Werk is vol te houden', type: 'schaal', tekst: 'Ik verwacht dat ik mijn huidige werk de komende twee jaar gezond kan blijven doen.' },
        { thema: 'Belastbaarheid en werkomstandigheden', meetpunt: 'Gezonde werkomstandigheden', type: 'schaal', tekst: 'Mijn werkplek en hulpmiddelen maken het mogelijk om gezond en veilig te werken.' },
        { thema: 'Belastbaarheid en werkomstandigheden', meetpunt: 'Gezonde werkomstandigheden', type: 'schaal', tekst: 'Als mijn werk of werkplek aangepast moet worden om gezond te kunnen werken, wordt dat geregeld.', weet_niet: true },
        { thema: 'Aandacht voor gezond werken', meetpunt: 'Steun bij gezond werken', type: 'schaal', tekst: 'Bij {bedrijf} is er genoeg aandacht voor gezond en veilig werken.' },
        { thema: 'Aandacht voor gezond werken', meetpunt: 'Steun bij gezond werken', type: 'schaal', tekst: 'Mijn leidinggevende heeft oog voor hoe het met mij gaat.' },
        { thema: 'Aandacht voor gezond werken', meetpunt: 'Steun bij gezond werken', type: 'schaal', tekst: 'Ik kan het bij mijn leidinggevende aangeven als het werk mij te veel wordt.' },
        { thema: 'Aandacht voor gezond werken', meetpunt: 'Steun bij gezond werken', type: 'schaal', tekst: 'Ik weet wat {bedrijf} aanbiedt om gezond en fit te blijven.' },
        {
          thema: 'Aandacht voor gezond werken',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Wat zou jou het meest helpen om gezond en met energie te blijven werken?',
          toelichting: 'Kies er maximaal drie.',
          opties: [
            'Meer invloed op mijn werktijden of rooster',
            'Minder werkdruk',
            'Een betere werkplek of betere hulpmiddelen',
            'Meer afwisseling in mijn werk',
            'Hulp bij ontspannen en omgaan met stress',
            'Mogelijkheden om te bewegen of te sporten',
            'Gezond eten en drinken op het werk',
            'Een gesprek over mijn loopbaan en toekomst',
            'Hulp bij het combineren van werk en zorgtaken',
            'Ik heb niets extra nodig',
          ],
        },
        { thema: 'Aandacht voor gezond werken', type: 'open', tekst: 'Wat kan {bedrijf} volgens jou doen om medewerkers gezond en met plezier aan het werk te houden?' },
        { thema: 'Ziekmelden en begeleiding', meetpunt: 'Duidelijkheid verzuimafspraken', type: 'schaal', tekst: 'Het is mij duidelijk hoe en bij wie ik me ziek moet melden.' },
        { thema: 'Ziekmelden en begeleiding', meetpunt: 'Duidelijkheid verzuimafspraken', type: 'schaal', tekst: 'Ik weet wat {bedrijf} en ik van elkaar mogen verwachten als ik langere tijd ziek ben.' },
        { thema: 'Ziekmelden en begeleiding', meetpunt: 'Duidelijkheid verzuimafspraken', type: 'schaal', tekst: 'Ik weet hoe ik zelf een afspraak met de bedrijfsarts kan maken, ook als ik niet ziek ben.' },
        { thema: 'Ziekmelden en begeleiding', meetpunt: 'Begeleiding en terugkeer', type: 'schaal', tekst: 'Als ik twijfel of ik kan werken, kan ik met mijn leidinggevende bespreken wat wel lukt.' },
        { thema: 'Ziekmelden en begeleiding', meetpunt: 'Begeleiding en terugkeer', type: 'schaal', tekst: 'Als ik ziek ben, is het contact met mijn leidinggevende prettig en ondersteunend.', weet_niet: true },
        { thema: 'Ziekmelden en begeleiding', meetpunt: 'Begeleiding en terugkeer', type: 'schaal', tekst: 'Na ziekte krijg ik de ruimte om mijn werk stap voor stap weer op te pakken.', weet_niet: true },
        { thema: 'Ziekmelden en begeleiding', type: 'janee', tekst: 'Heb je het afgelopen jaar weleens doorgewerkt terwijl je je eigenlijk te ziek voelde om te werken?' },
        {
          thema: 'Ziekmelden en begeleiding',
          type: 'open',
          tekst: 'Wat kan er beter aan de manier waarop {bedrijf} omgaat met ziekmelden en de begeleiding bij ziekte?',
          toelichting: 'Noem geen namen en geen medische details.',
        },
        ...ACHTERGROND_VRAGEN,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Verzuimcijfers van de afgelopen 12 maanden opvragen en invoeren bij Eigen invoer',
        'Verzuimprotocol en afspraken met de arbodienst opvragen',
        'Vragenlijst laten controleren door opdrachtgever',
        'Aankondiging en link versturen naar medewerkers',
        'Herinnering sturen na één week',
        'Resultaten naast de verzuimcijfers leggen en bevindingen schrijven',
        'Conceptrapport bespreken met opdrachtgever',
      ],
    },
  },

  // ------------------------------------------------------------------ 2. Werkdruk en werkstress
  {
    id: 'werkdruk-werkstress',
    naam: 'Werkdruk en werkstress',
    omschrijving: 'Psychosociale arbeidsbelasting (PSA): hoeveelheid werk en tempo, duidelijkheid en regelruimte, steun, mentale belasting, herstel en balans.',
    inhoud: {
      vragenlijst: {
        titel: 'Onderzoek werkdruk en werkstress',
        introtekst:
          'Fijn dat je mee wilt doen aan dit onderzoek naar werkdruk en werkstress bij {bedrijf}. We willen weten hoe je de hoeveelheid werk, je regelruimte en de steun op het werk ervaart, en wat jou energie kost of juist oplevert. Met de uitkomsten kijken we waar het werk beter of anders georganiseerd kan worden. Het invullen duurt ongeveer 8 minuten.\n\n' +
          INTRO_ANONIEM,
        bedanktekst: BEDANKT,
      },
      themas: [
        {
          naam: 'Hoeveelheid werk en tempo',
          omschrijving: 'Of het werk past binnen de beschikbare tijd en in een normaal tempo te doen is.',
          meetpunten: [
            { naam: 'Werkhoeveelheid en tempo', omschrijving: 'Hogere score = werk beter te doen binnen de tijd', eenheid: 'score 1–5' },
            { naam: 'Totaaloordeel werkdruk', omschrijving: 'Hogere score = werkdruk beter vol te houden', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Duidelijkheid en regelruimte',
          omschrijving: 'Duidelijke taken en prioriteiten, en invloed op de indeling van het eigen werk.',
          meetpunten: [
            { naam: 'Duidelijkheid van het werk', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Regelruimte', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Steun van collega\'s en leidinggevende',
          omschrijving: 'Hulp van collega\'s en leidinggevende als het druk is, en of werkdruk bespreekbaar is.',
          meetpunten: [{ naam: 'Steun bij werkdruk', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Mentale en emotionele belasting',
          omschrijving: 'Hoe goed medewerkers de mentale en emotionele kant van het werk aankunnen.',
          meetpunten: [
            { naam: 'Omgaan met mentale en emotionele belasting', omschrijving: 'Hogere score = belasting beter te dragen', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Herstel en balans',
          omschrijving: 'Pauzes, loskomen van het werk en de combinatie van werk en privé.',
          meetpunten: [{ naam: 'Herstel en werk-privébalans', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Oorzaken en oplossingen',
          omschrijving: 'Wat volgens medewerkers de werkdruk veroorzaakt en wat zou helpen.',
          meetpunten: [],
        },
        {
          naam: 'Cijfers over werkdruk',
          omschrijving: CIJFERS,
          meetpunten: [
            { naam: 'Verzuimpercentage', omschrijving: 'Uit de verzuimregistratie', eenheid: '%' },
            { naam: 'Overuren', omschrijving: 'Gemiddeld aantal overuren per medewerker per maand', eenheid: 'uren' },
            { naam: 'Openstaande vacatures', omschrijving: 'Aantal vacatures dat op de peildatum openstaat', eenheid: 'aantal' },
          ],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        { thema: 'Hoeveelheid werk en tempo', meetpunt: 'Werkhoeveelheid en tempo', type: 'schaal', tekst: 'De hoeveelheid werk past bij de tijd die ik ervoor heb.' },
        { thema: 'Hoeveelheid werk en tempo', meetpunt: 'Werkhoeveelheid en tempo', type: 'schaal', schaal_soort: 'frequentie', tekst: 'Hoe vaak kun je je werk in een normaal tempo doen, zonder je te hoeven haasten?' },
        { thema: 'Hoeveelheid werk en tempo', meetpunt: 'Werkhoeveelheid en tempo', type: 'schaal', schaal_soort: 'frequentie', tekst: 'Hoe vaak krijg je je werk af binnen je afgesproken werktijd?' },
        { thema: 'Hoeveelheid werk en tempo', meetpunt: 'Werkhoeveelheid en tempo', type: 'schaal', schaal_soort: 'frequentie', tekst: 'Hoe vaak kun je ongestoord doorwerken als je werk dat vraagt?' },
        { thema: 'Hoeveelheid werk en tempo', meetpunt: 'Werkhoeveelheid en tempo', type: 'schaal', tekst: 'Drukke periodes worden afgewisseld met rustigere periodes.' },
        { thema: 'Hoeveelheid werk en tempo', meetpunt: 'Werkhoeveelheid en tempo', type: 'schaal', tekst: 'Als collega\'s ziek of met vakantie zijn, wordt hun werk goed opgevangen.' },
        { thema: 'Hoeveelheid werk en tempo', meetpunt: 'Totaaloordeel werkdruk', type: 'schaal', tekst: 'Alles bij elkaar is mijn werkdruk goed vol te houden.' },
        { thema: 'Duidelijkheid en regelruimte', meetpunt: 'Duidelijkheid van het werk', type: 'schaal', tekst: 'Mijn taken en verantwoordelijkheden zijn voor mij duidelijk.' },
        { thema: 'Duidelijkheid en regelruimte', meetpunt: 'Duidelijkheid van het werk', type: 'schaal', tekst: 'Het is voor mij duidelijk welk werk voorrang heeft als het druk is.' },
        { thema: 'Duidelijkheid en regelruimte', meetpunt: 'Duidelijkheid van het werk', type: 'schaal', tekst: 'Wat verschillende mensen van mij vragen, is goed met elkaar te combineren.' },
        { thema: 'Duidelijkheid en regelruimte', meetpunt: 'Regelruimte', type: 'schaal', tekst: 'Ik heb genoeg vrijheid om mijn werkdag zelf in te delen.' },
        { thema: 'Duidelijkheid en regelruimte', meetpunt: 'Regelruimte', type: 'schaal', tekst: 'Bij het plannen van het werk wordt rekening gehouden met wat voor mij haalbaar is.' },
        { thema: 'Duidelijkheid en regelruimte', meetpunt: 'Regelruimte', type: 'schaal', tekst: 'Ik kan werk weigeren of doorschuiven als ik al te veel heb liggen.' },
        { thema: 'Steun van collega\'s en leidinggevende', meetpunt: 'Steun bij werkdruk', type: 'schaal', tekst: 'Als het druk is, helpen mijn collega\'s en ik elkaar.' },
        { thema: 'Steun van collega\'s en leidinggevende', meetpunt: 'Steun bij werkdruk', type: 'schaal', tekst: 'Mijn leidinggevende helpt mij om keuzes te maken als ik te veel werk heb.' },
        { thema: 'Steun van collega\'s en leidinggevende', meetpunt: 'Steun bij werkdruk', type: 'schaal', tekst: 'Werkdruk is in mijn team goed bespreekbaar.' },
        { thema: 'Steun van collega\'s en leidinggevende', meetpunt: 'Steun bij werkdruk', type: 'schaal', tekst: 'Als ik aangeef dat het werk te veel wordt, wordt daar iets mee gedaan.', weet_niet: true },
        { thema: 'Mentale en emotionele belasting', meetpunt: 'Omgaan met mentale en emotionele belasting', type: 'schaal', tekst: 'Ik kan de concentratie die mijn werk vraagt goed opbrengen.' },
        { thema: 'Mentale en emotionele belasting', meetpunt: 'Omgaan met mentale en emotionele belasting', type: 'schaal', tekst: 'Ik kan goed omgaan met emotioneel zware situaties in mijn werk.', weet_niet: true },
        { thema: 'Mentale en emotionele belasting', meetpunt: 'Omgaan met mentale en emotionele belasting', type: 'schaal', tekst: 'Ik kan goed omgaan met lastige klanten, cliënten of andere contacten van buiten.', weet_niet: true },
        { thema: 'Mentale en emotionele belasting', meetpunt: 'Omgaan met mentale en emotionele belasting', type: 'schaal', tekst: 'Na een ingrijpende gebeurtenis op het werk kan ik mijn verhaal bij iemand kwijt.', weet_niet: true },
        { thema: 'Herstel en balans', meetpunt: 'Herstel en werk-privébalans', type: 'schaal', schaal_soort: 'frequentie', tekst: 'Hoe vaak kun je tijdens je werk een echte pauze nemen?' },
        { thema: 'Herstel en balans', meetpunt: 'Herstel en werk-privébalans', type: 'schaal', tekst: 'Ik kan na het werk goed loskomen van mijn werk.' },
        { thema: 'Herstel en balans', meetpunt: 'Herstel en werk-privébalans', type: 'schaal', tekst: 'Ik begin meestal uitgerust aan een nieuwe werkdag.' },
        { thema: 'Herstel en balans', meetpunt: 'Herstel en werk-privébalans', type: 'schaal', tekst: 'Ik kan werk en privé goed combineren.' },
        { thema: 'Herstel en balans', meetpunt: 'Herstel en werk-privébalans', type: 'schaal', tekst: 'In mijn vrije tijd word ik door het werk met rust gelaten.' },
        {
          thema: 'Oorzaken en oplossingen',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Wat zorgt bij jou het meest voor werkdruk?',
          toelichting: 'Kies er maximaal drie.',
          opties: [
            'Te veel werk voor de beschikbare tijd',
            'Krappe deadlines',
            'Te weinig collega\'s of openstaande vacatures',
            'Vaak gestoord worden of steeds wisselen tussen taken',
            'Onduidelijke prioriteiten of verwachtingen',
            'Veel administratie of regels',
            'Systemen of hulpmiddelen die niet goed werken',
            'Veel overleg en vergaderingen',
            'Emotioneel zwaar werk',
            'Veeleisende klanten of andere contacten van buiten',
            'Onregelmatige werktijden of veel overwerk',
            'Ik ervaar weinig werkdruk',
          ],
        },
        { thema: 'Oorzaken en oplossingen', type: 'janee', tekst: 'Heb je het afgelopen half jaar met je leidinggevende over je werkdruk gesproken?' },
        { thema: 'Oorzaken en oplossingen', type: 'open', tekst: 'Welke taken of werkzaamheden kunnen volgens jou slimmer, anders of minder?' },
        { thema: 'Oorzaken en oplossingen', type: 'open', tekst: 'Wat zou jou het meest helpen om je werk goed en gezond te kunnen blijven doen?' },
        ...ACHTERGROND_VRAGEN,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Nagaan wat de RI&E en het plan van aanpak zeggen over werkdruk (psychosociale arbeidsbelasting)',
        'Cijfers over verzuim, overuren en openstaande vacatures opvragen en invoeren bij Eigen invoer',
        'Vragenlijst laten controleren door opdrachtgever',
        'Aankondiging en link versturen naar medewerkers',
        'Herinnering sturen na één week',
        'Resultaten analyseren en bevindingen schrijven',
        'Uitkomsten per team bespreken en samen oplossingen kiezen',
      ],
    },
  },

  // ------------------------------------------------------------------ 3. Leiderschap en leidinggeven
  {
    id: 'leiderschap',
    naam: 'Leiderschap en leidinggeven',
    omschrijving: 'De direct leidinggevende: duidelijkheid, vertrouwen en ruimte, feedback, aandacht en bereikbaarheid, plus het vertrouwen in directie en management.',
    inhoud: {
      vragenlijst: {
        titel: 'Onderzoek leiderschap',
        introtekst:
          'Fijn dat je mee wilt doen aan dit onderzoek naar leidinggeven bij {bedrijf}. We willen weten hoe je de aansturing en ondersteuning door je leidinggevende ervaart, zodat leidinggevenden weten wat goed gaat en wat beter kan. Met "je leidinggevende" bedoelen we de persoon die jou in je dagelijkse werk aanstuurt. Het invullen duurt ongeveer 8 minuten.\n\n' +
          INTRO_ANONIEM,
        bedanktekst: BEDANKT,
      },
      themas: [
        {
          naam: 'Richting en duidelijkheid',
          omschrijving: 'Of de leidinggevende duidelijk maakt waar het team naartoe werkt en wat er van iedereen verwacht wordt.',
          meetpunten: [{ naam: 'Duidelijkheid van de leidinggevende', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Vertrouwen en ruimte',
          omschrijving: 'Ruimte en inspraak die medewerkers krijgen, en of de leidinggevende betrouwbaar en eerlijk is.',
          meetpunten: [
            { naam: 'Ruimte en inspraak', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Vertrouwen in de leidinggevende', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Feedback en ontwikkeling',
          omschrijving: 'Waardering, opbouwende feedback en aandacht voor de ontwikkeling van medewerkers.',
          meetpunten: [
            { naam: 'Feedback van de leidinggevende', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Aandacht voor ontwikkeling', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Aandacht en bereikbaarheid',
          omschrijving: 'Persoonlijke aandacht, steun bij problemen en bereikbaarheid van de leidinggevende.',
          meetpunten: [
            { naam: 'Aandacht en steun', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Bereikbaarheid van de leidinggevende', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Directie en management',
          omschrijving: 'Duidelijkheid, zichtbaarheid en vertrouwen in de directie of het managementteam.',
          meetpunten: [{ naam: 'Vertrouwen in directie en management', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Totaalbeeld en verbeterpunten',
          omschrijving: 'Het algemene oordeel over de leidinggevende en wat beter kan.',
          meetpunten: [{ naam: 'Totaaloordeel leidinggevende', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Cijfers over leidinggeven',
          omschrijving: CIJFERS,
          meetpunten: [
            { naam: 'Medewerkers per leidinggevende', omschrijving: 'Gemiddeld aantal medewerkers per leidinggevende (span of control)', eenheid: 'aantal' },
            { naam: 'Gevoerde jaargesprekken', omschrijving: 'Percentage medewerkers met een jaargesprek', eenheid: '%' },
          ],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        { thema: 'Richting en duidelijkheid', meetpunt: 'Duidelijkheid van de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende maakt duidelijk wat de doelen van ons team zijn.' },
        { thema: 'Richting en duidelijkheid', meetpunt: 'Duidelijkheid van de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende is duidelijk over wat hij of zij van mij verwacht.' },
        { thema: 'Richting en duidelijkheid', meetpunt: 'Duidelijkheid van de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende legt uit waarom beslissingen worden genomen.' },
        { thema: 'Richting en duidelijkheid', meetpunt: 'Duidelijkheid van de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende neemt op tijd een besluit als dat nodig is.' },
        { thema: 'Richting en duidelijkheid', meetpunt: 'Duidelijkheid van de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende houdt ons goed op de hoogte van wat er in de organisatie speelt.' },
        { thema: 'Vertrouwen en ruimte', meetpunt: 'Ruimte en inspraak', type: 'schaal', tekst: 'Mijn leidinggevende geeft mij de ruimte om mijn werk op mijn eigen manier te doen.' },
        { thema: 'Vertrouwen en ruimte', meetpunt: 'Ruimte en inspraak', type: 'schaal', tekst: 'Mijn leidinggevende vraagt naar mijn mening over zaken die mijn werk raken.' },
        { thema: 'Vertrouwen en ruimte', meetpunt: 'Ruimte en inspraak', type: 'schaal', tekst: 'Ik kan het tegen mijn leidinggevende zeggen als ik het ergens niet mee eens ben.' },
        { thema: 'Vertrouwen en ruimte', meetpunt: 'Vertrouwen in de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende komt afspraken na.' },
        { thema: 'Vertrouwen en ruimte', meetpunt: 'Vertrouwen in de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende behandelt iedereen in ons team eerlijk.' },
        { thema: 'Vertrouwen en ruimte', meetpunt: 'Vertrouwen in de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende geeft zelf het goede voorbeeld.' },
        { thema: 'Feedback en ontwikkeling', meetpunt: 'Feedback van de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende laat merken wat ik goed doe.' },
        { thema: 'Feedback en ontwikkeling', meetpunt: 'Feedback van de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende vertelt mij op een opbouwende manier wat beter kan.' },
        { thema: 'Feedback en ontwikkeling', meetpunt: 'Feedback van de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende staat zelf open voor feedback.' },
        { thema: 'Feedback en ontwikkeling', meetpunt: 'Aandacht voor ontwikkeling', type: 'schaal', tekst: 'Mijn leidinggevende denkt met mij mee over mijn ontwikkeling.' },
        { thema: 'Feedback en ontwikkeling', meetpunt: 'Aandacht voor ontwikkeling', type: 'schaal', tekst: 'Ik spreek mijn leidinggevende vaak genoeg over hoe het met mijn werk gaat.' },
        { thema: 'Aandacht en bereikbaarheid', meetpunt: 'Aandacht en steun', type: 'schaal', tekst: 'Mijn leidinggevende heeft oog voor hoe het met mij gaat.' },
        { thema: 'Aandacht en bereikbaarheid', meetpunt: 'Aandacht en steun', type: 'schaal', tekst: 'Mijn leidinggevende helpt mij om keuzes te maken als ik te veel werk heb.' },
        { thema: 'Aandacht en bereikbaarheid', meetpunt: 'Aandacht en steun', type: 'schaal', tekst: 'Mijn leidinggevende komt voor ons team op als dat nodig is.' },
        { thema: 'Aandacht en bereikbaarheid', meetpunt: 'Aandacht en steun', type: 'schaal', tekst: 'Mijn leidinggevende pakt problemen of spanningen in het team op tijd aan.', weet_niet: true },
        { thema: 'Aandacht en bereikbaarheid', meetpunt: 'Bereikbaarheid van de leidinggevende', type: 'schaal', schaal_soort: 'frequentie', tekst: 'Hoe vaak is je leidinggevende bereikbaar op de momenten dat je hem of haar nodig hebt?' },
        { thema: 'Aandacht en bereikbaarheid', meetpunt: 'Bereikbaarheid van de leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende maakt tijd voor mij als ik daarom vraag.' },
        { thema: 'Directie en management', meetpunt: 'Vertrouwen in directie en management', type: 'schaal', tekst: 'De directie of het managementteam is duidelijk over de koers van {bedrijf}.', weet_niet: true },
        { thema: 'Directie en management', meetpunt: 'Vertrouwen in directie en management', type: 'schaal', tekst: 'De directie of het managementteam is zichtbaar en benaderbaar voor medewerkers.', weet_niet: true },
        { thema: 'Directie en management', meetpunt: 'Vertrouwen in directie en management', type: 'schaal', tekst: 'Ik heb vertrouwen in de manier waarop {bedrijf} wordt geleid.', weet_niet: true },
        { thema: 'Totaalbeeld en verbeterpunten', meetpunt: 'Totaaloordeel leidinggevende', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden ben je, alles bij elkaar genomen, over de manier waarop je leidinggevende leidinggeeft?' },
        {
          thema: 'Totaalbeeld en verbeterpunten',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Waar zou je leidinggevende meer aandacht aan mogen geven?',
          toelichting: 'Kies er maximaal drie.',
          opties: [
            'Duidelijke doelen en prioriteiten',
            'Informatie delen over wat er speelt',
            'Besluiten nemen',
            'Ruimte en vertrouwen geven',
            'Waardering uitspreken',
            'Feedback geven op mijn werk',
            'Mijn ontwikkeling',
            'Werkdruk en welzijn',
            'Samenwerking en sfeer in het team',
            'Bereikbaar en zichtbaar zijn',
            'Niets, het gaat goed zo',
          ],
        },
        { thema: 'Totaalbeeld en verbeterpunten', type: 'open', tekst: 'Wat doet je leidinggevende goed en moet hij of zij vooral blijven doen?', toelichting: 'Noem geen namen.' },
        { thema: 'Totaalbeeld en verbeterpunten', type: 'open', tekst: 'Wat zou je leidinggevende anders kunnen doen om jou en je team beter te ondersteunen?', toelichting: 'Noem geen namen.' },
        ...ACHTERGROND_VRAGEN,
        { thema: 'Achtergrond', type: 'janee', tekst: 'Geef je zelf leiding aan een of meer medewerkers?', uitsplitsen: true, kenmerk: 'leidinggevend' },
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Met opdrachtgever afspreken wie de uitkomsten per afdeling of team te zien krijgt',
        'Leidinggevenden vooraf informeren over doel en aanpak van het onderzoek',
        'Vragenlijst laten controleren door opdrachtgever',
        'Aankondiging en link versturen naar medewerkers',
        'Herinnering sturen na één week',
        'Resultaten analyseren en bevindingen schrijven',
        'Uitkomsten eerst met de leidinggevenden zelf bespreken, daarna met de teams',
      ],
    },
  },

  // ------------------------------------------------------------------ 4. Onboarding
  {
    id: 'onboarding',
    naam: 'Onboarding van nieuwe medewerkers',
    omschrijving: 'Voor medewerkers die kort in dienst zijn: de periode voor de eerste werkdag, de eerste dagen, inwerken, begeleiding en of de verwachtingen zijn uitgekomen.',
    inhoud: {
      vragenlijst: {
        titel: 'Je start bij {bedrijf}',
        introtekst:
          'Je werkt nog niet zo lang bij {bedrijf}. Juist daarom zijn we benieuwd hoe je je start hebt ervaren: van het moment dat je werd aangenomen tot en met je inwerkperiode. Met je antwoorden maken we de start voor volgende nieuwe collega\'s beter. Het invullen duurt ongeveer 7 minuten.\n\n' +
          INTRO_ANONIEM,
        bedanktekst: BEDANKT,
      },
      themas: [
        {
          naam: 'Voor de eerste werkdag',
          omschrijving: 'De periode tussen de aanname en de eerste werkdag.',
          meetpunten: [{ naam: 'Voorbereiding op de start', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'De eerste werkdagen',
          omschrijving: 'Ontvangst, kennismaking en praktische zaken in de eerste week.',
          meetpunten: [{ naam: 'Ontvangst en eerste week', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Inwerken',
          omschrijving: 'Het leren van het werk: programma, uitleg en duidelijkheid over de functie.',
          meetpunten: [
            { naam: 'Kwaliteit van het inwerken', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Duidelijkheid over de functie', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Begeleiding en erbij horen',
          omschrijving: 'Begeleiding door leidinggevende en collega\'s, en of nieuwe medewerkers zich thuis voelen.',
          meetpunten: [
            { naam: 'Begeleiding in de inwerkperiode', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Erbij horen', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Verwachtingen en totaaloordeel',
          omschrijving: 'Of de functie en de organisatie zijn wat de nieuwe medewerker ervan verwachtte.',
          meetpunten: [
            { naam: 'Verwachtingen waargemaakt', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Totaaloordeel inwerkperiode', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Cijfers over nieuwe medewerkers',
          omschrijving: CIJFERS,
          meetpunten: [
            { naam: 'Nieuwe medewerkers', omschrijving: 'Aantal medewerkers dat in de periode is gestart', eenheid: 'aantal' },
            { naam: 'Vertrek binnen het eerste jaar', omschrijving: 'Percentage nieuwe medewerkers dat binnen een jaar na de start vertrekt', eenheid: '%' },
            { naam: 'Inwerktijd', omschrijving: 'Gemiddeld aantal dagen tot een nieuwe medewerker het werk zelfstandig doet', eenheid: 'dagen' },
          ],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        { thema: 'Voor de eerste werkdag', meetpunt: 'Voorbereiding op de start', type: 'schaal', tekst: 'Tussen mijn aanname en mijn eerste werkdag hield {bedrijf} goed contact met mij.' },
        { thema: 'Voor de eerste werkdag', meetpunt: 'Voorbereiding op de start', type: 'schaal', tekst: 'Voor mijn eerste werkdag wist ik waar, wanneer en bij wie ik verwacht werd.' },
        { thema: 'Voor de eerste werkdag', meetpunt: 'Voorbereiding op de start', type: 'schaal', tekst: 'Mijn contract en andere papieren waren op tijd en goed geregeld.' },
        { thema: 'Voor de eerste werkdag', meetpunt: 'Voorbereiding op de start', type: 'schaal', tekst: 'De informatie die ik vooraf kreeg, was duidelijk en volledig.' },
        { thema: 'De eerste werkdagen', meetpunt: 'Ontvangst en eerste week', type: 'schaal', tekst: 'Op mijn eerste werkdag voelde ik me welkom.' },
        { thema: 'De eerste werkdagen', meetpunt: 'Ontvangst en eerste week', type: 'schaal', tekst: 'Bij mijn start waren mijn werkplek en toegang tot systemen op tijd geregeld.' },
        { thema: 'De eerste werkdagen', meetpunt: 'Ontvangst en eerste week', type: 'schaal', tekst: 'In mijn eerste week heb ik kennisgemaakt met de collega\'s met wie ik het meest samenwerk.' },
        { thema: 'De eerste werkdagen', meetpunt: 'Ontvangst en eerste week', type: 'schaal', tekst: 'Mijn leidinggevende nam in mijn eerste week de tijd voor mij.' },
        { thema: 'Inwerken', meetpunt: 'Kwaliteit van het inwerken', type: 'schaal', tekst: 'Er was een duidelijk programma of een duidelijke planning voor mijn eerste weken.' },
        { thema: 'Inwerken', meetpunt: 'Kwaliteit van het inwerken', type: 'schaal', tekst: 'Ik ben goed ingewerkt in mijn functie.' },
        { thema: 'Inwerken', meetpunt: 'Kwaliteit van het inwerken', type: 'schaal', tekst: 'Ik kreeg genoeg tijd om het werk te leren voordat ik het zelfstandig moest doen.' },
        { thema: 'Inwerken', meetpunt: 'Kwaliteit van het inwerken', type: 'schaal', tekst: 'De uitleg en trainingen die ik kreeg, sloten aan op wat ik nodig had.' },
        { thema: 'Inwerken', meetpunt: 'Duidelijkheid over de functie', type: 'schaal', tekst: 'Ik weet waar ik werkafspraken, procedures en andere informatie kan vinden.' },
        { thema: 'Inwerken', meetpunt: 'Duidelijkheid over de functie', type: 'schaal', tekst: 'Het is mij duidelijk wat er in mijn functie van mij verwacht wordt.' },
        { thema: 'Begeleiding en erbij horen', type: 'janee', tekst: 'Had je tijdens je inwerkperiode een vaste begeleider, buddy of een vast aanspreekpunt?' },
        { thema: 'Begeleiding en erbij horen', meetpunt: 'Begeleiding in de inwerkperiode', type: 'schaal', tekst: 'Met mijn vragen kon ik steeds bij iemand terecht.' },
        { thema: 'Begeleiding en erbij horen', meetpunt: 'Begeleiding in de inwerkperiode', type: 'schaal', tekst: 'Mijn leidinggevende bespreekt regelmatig met mij hoe het gaat.' },
        { thema: 'Begeleiding en erbij horen', meetpunt: 'Begeleiding in de inwerkperiode', type: 'schaal', tekst: 'Ik krijg feedback waarmee ik verder kom in mijn nieuwe functie.' },
        { thema: 'Begeleiding en erbij horen', meetpunt: 'Erbij horen', type: 'schaal', tekst: 'Ik voel me opgenomen in mijn team.' },
        { thema: 'Begeleiding en erbij horen', meetpunt: 'Erbij horen', type: 'schaal', tekst: 'Ik heb een goed beeld van hoe {bedrijf} werkt en waar de organisatie voor staat.' },
        { thema: 'Verwachtingen en totaaloordeel', meetpunt: 'Verwachtingen waargemaakt', type: 'schaal', tekst: 'Mijn functie komt overeen met het beeld dat ik tijdens de sollicitatie kreeg.' },
        { thema: 'Verwachtingen en totaaloordeel', meetpunt: 'Verwachtingen waargemaakt', type: 'schaal', tekst: 'De afspraken die bij mijn aanname zijn gemaakt, zijn nagekomen.' },
        { thema: 'Verwachtingen en totaaloordeel', meetpunt: 'Verwachtingen waargemaakt', type: 'schaal', tekst: 'Ik ben blij met mijn keuze voor {bedrijf}.' },
        { thema: 'Verwachtingen en totaaloordeel', meetpunt: 'Totaaloordeel inwerkperiode', type: 'schaal', schaal_soort: 'kwaliteit', tekst: 'Hoe beoordeel je je inwerkperiode als geheel?' },
        {
          thema: 'Verwachtingen en totaaloordeel',
          type: 'meerkeuze',
          tekst: 'Hoe lang duurde het voordat je je werk grotendeels zelfstandig kon doen?',
          opties: ['Korter dan een maand', '1 tot 3 maanden', '3 tot 6 maanden', 'Langer dan 6 maanden', 'Zover ben ik nog niet'],
        },
        { thema: 'Verwachtingen en totaaloordeel', type: 'cijfer', schaal_soort: 'nps', tekst: 'Hoe waarschijnlijk is het dat je {bedrijf} als werkgever aanbeveelt aan vrienden of bekenden?' },
        { thema: 'Verwachtingen en totaaloordeel', type: 'open', tekst: 'Wat heeft je het meest geholpen bij je start bij {bedrijf}?' },
        { thema: 'Verwachtingen en totaaloordeel', type: 'open', tekst: 'Wat heb je gemist of had beter gekund tijdens je inwerkperiode?' },
        ...ACHTERGROND_ONBOARDING,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Bepalen wie de vragenlijst krijgt (bijvoorbeeld iedereen die korter dan een jaar in dienst is)',
        'Inwerkprogramma en checklist voor nieuwe medewerkers opvragen',
        'Cijfers over instroom en vertrek binnen het eerste jaar opvragen en invoeren bij Eigen invoer',
        'Uitnodiging en link versturen naar nieuwe medewerkers',
        'Resultaten analyseren en bevindingen schrijven',
        'Verbeterpunten bespreken met HR en leidinggevenden',
      ],
    },
  },

  // ------------------------------------------------------------------ 5. Vertrekonderzoek
  {
    id: 'vertrekonderzoek',
    naam: 'Vertrekonderzoek (exitonderzoek)',
    omschrijving: 'Redenen van vertrek en een terugblik op werk, leidinggevende, ontwikkeling en afscheid; het aantal respondenten is meestal klein, dus resultaten per groep worden zelden getoond (minimaal 5 per groep).',
    inhoud: {
      vragenlijst: {
        titel: 'Terugblik op je tijd bij {bedrijf}',
        introtekst:
          'Je gaat weg bij {bedrijf} of bent kort geleden vertrokken. We willen graag van je leren. Met deze vragenlijst kijken we terug op je tijd bij {bedrijf} en op de redenen voor je vertrek, zodat we het werk voor je (oud-)collega\'s kunnen verbeteren. Het invullen duurt ongeveer 7 minuten.\n\n' +
          'Goed om te weten: er vertrekken meestal maar een paar collega\'s tegelijk. We bekijken de antwoorden daarom zoveel mogelijk van meerdere vertrekkers samen. Toch kan een antwoord in zo\'n kleine groep herkenbaar zijn. Houd daar rekening mee, vooral bij de open vragen.\n\n' +
          INTRO_ANONIEM,
        bedanktekst:
          'Hartelijk dank voor het invullen, en veel succes met je volgende stap! Je antwoorden zijn anoniem opgeslagen. Je kunt dit venster nu sluiten.',
      },
      themas: [
        {
          naam: 'Redenen van vertrek',
          omschrijving: 'Waarom medewerkers vertrekken, wat ze daarna gaan doen en of het vertrek te voorkomen was.',
          meetpunten: [],
        },
        {
          naam: 'Terugblik op het werk',
          omschrijving: 'Inhoud van het werk, hulpmiddelen, werkdruk en de combinatie met privé.',
          meetpunten: [
            { naam: 'Terugblik werkinhoud', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Terugblik werkdruk en balans', omschrijving: 'Hogere score = werkdruk en balans waren beter', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Terugblik op leidinggevende en team',
          omschrijving: 'Waardering en steun van de leidinggevende, en de samenwerking in het team.',
          meetpunten: [
            { naam: 'Terugblik leidinggevende', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Terugblik samenwerking', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Terugblik op ontwikkeling en arbeidsvoorwaarden',
          omschrijving: 'Ontwikkel- en doorgroeimogelijkheden, salaris en overige arbeidsvoorwaarden.',
          meetpunten: [
            { naam: 'Terugblik ontwikkeling', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Terugblik arbeidsvoorwaarden', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Organisatie en afscheid',
          omschrijving: 'Het totaaloordeel over de werkgever en de afhandeling van het vertrek.',
          meetpunten: [
            { naam: 'Afhandeling van het vertrek', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Totaaloordeel werkgever', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Verloopcijfers',
          omschrijving: CIJFERS,
          meetpunten: [
            { naam: 'Verloop', omschrijving: 'Vertrokken medewerkers als percentage van het gemiddelde aantal', eenheid: '%' },
            { naam: 'Vrijwillig verloop', omschrijving: 'Medewerkers die zelf ontslag namen als percentage van het gemiddelde aantal', eenheid: '%' },
            { naam: 'Vertrek binnen het eerste jaar', omschrijving: 'Percentage nieuwe medewerkers dat binnen een jaar na de start vertrekt', eenheid: '%' },
            { naam: 'Diensttijd bij vertrek', omschrijving: 'Gemiddeld aantal jaren in dienst op het moment van vertrek', eenheid: 'jaren' },
          ],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        {
          thema: 'Redenen van vertrek',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Wat waren voor jou de belangrijkste redenen om te vertrekken?',
          toelichting: 'Kies er maximaal drie.',
          opties: [
            'Inhoud van het werk',
            'Werkdruk of werktijden',
            'Salaris of andere arbeidsvoorwaarden',
            'Te weinig mogelijkheden om me te ontwikkelen of door te groeien',
            'Mijn leidinggevende of de manier van leidinggeven',
            'Sfeer of samenwerking in het team',
            'Koers van of veranderingen in de organisatie',
            'Reistijd of werklocatie',
            'Combinatie van werk en privé',
            'Een aanbod van een andere werkgever dat ik niet wilde laten lopen',
            'Persoonlijke omstandigheden (bijvoorbeeld verhuizing, gezondheid of zorg)',
            'Einde van mijn contract of reorganisatie',
            'Pensioen',
            'Anders',
          ],
        },
        { thema: 'Redenen van vertrek', type: 'janee', tekst: 'Heb je, voordat je besloot te vertrekken, je twijfels of wensen met je leidinggevende besproken?' },
        {
          thema: 'Redenen van vertrek',
          type: 'meerkeuze',
          tekst: 'Had {bedrijf} iets kunnen doen waardoor je was gebleven?',
          opties: ['Ja', 'Misschien', 'Nee', 'Niet van toepassing (bijvoorbeeld pensioen of einde contract)'],
        },
        {
          thema: 'Redenen van vertrek',
          type: 'meerkeuze',
          tekst: 'Wat ga je na je vertrek doen?',
          opties: [
            'Vergelijkbaar werk bij een andere werkgever',
            'Ander werk bij een andere werkgever',
            'Als zelfstandige aan de slag',
            'Een opleiding of studie volgen',
            'Met pensioen',
            'Voorlopig niet werken',
            'Dat weet ik nog niet',
            'Dat zeg ik liever niet',
          ],
        },
        { thema: 'Redenen van vertrek', type: 'open', tekst: 'Wil je je belangrijkste reden om te vertrekken toelichten?', toelichting: 'Noem geen namen.' },
        { thema: 'Terugblik op het werk', meetpunt: 'Terugblik werkinhoud', type: 'schaal', tekst: 'Mijn werk was interessant en afwisselend genoeg.' },
        { thema: 'Terugblik op het werk', meetpunt: 'Terugblik werkinhoud', type: 'schaal', tekst: 'Ik kon mijn kennis en vaardigheden goed kwijt in mijn werk.' },
        { thema: 'Terugblik op het werk', meetpunt: 'Terugblik werkinhoud', type: 'schaal', tekst: 'De hulpmiddelen en systemen waarmee ik werkte, waren op orde.' },
        { thema: 'Terugblik op het werk', meetpunt: 'Terugblik werkdruk en balans', type: 'schaal', tekst: 'De werkdruk was goed vol te houden.' },
        { thema: 'Terugblik op het werk', meetpunt: 'Terugblik werkdruk en balans', type: 'schaal', tekst: 'Ik kon mijn werk goed combineren met mijn privéleven.' },
        { thema: 'Terugblik op leidinggevende en team', meetpunt: 'Terugblik leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende had waardering voor mijn werk.' },
        { thema: 'Terugblik op leidinggevende en team', meetpunt: 'Terugblik leidinggevende', type: 'schaal', tekst: 'Ik kon bij mijn leidinggevende terecht met vragen of problemen.' },
        { thema: 'Terugblik op leidinggevende en team', meetpunt: 'Terugblik leidinggevende', type: 'schaal', tekst: 'Mijn leidinggevende gaf mij feedback waar ik iets aan had.' },
        { thema: 'Terugblik op leidinggevende en team', meetpunt: 'Terugblik samenwerking', type: 'schaal', tekst: 'De samenwerking en sfeer in mijn team waren goed.' },
        { thema: 'Terugblik op leidinggevende en team', meetpunt: 'Terugblik samenwerking', type: 'schaal', tekst: 'Ik voelde me vrij om in mijn team mijn mening te geven.' },
        { thema: 'Terugblik op ontwikkeling en arbeidsvoorwaarden', meetpunt: 'Terugblik ontwikkeling', type: 'schaal', tekst: 'Ik kreeg genoeg mogelijkheden om mij te ontwikkelen.' },
        { thema: 'Terugblik op ontwikkeling en arbeidsvoorwaarden', meetpunt: 'Terugblik ontwikkeling', type: 'schaal', tekst: 'Er waren voor mij genoeg mogelijkheden om door te groeien binnen {bedrijf}.', weet_niet: true },
        { thema: 'Terugblik op ontwikkeling en arbeidsvoorwaarden', meetpunt: 'Terugblik arbeidsvoorwaarden', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden was je over je salaris?' },
        { thema: 'Terugblik op ontwikkeling en arbeidsvoorwaarden', meetpunt: 'Terugblik arbeidsvoorwaarden', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden was je over je overige arbeidsvoorwaarden, zoals verlof, pensioen en flexibele werktijden?' },
        { thema: 'Organisatie en afscheid', type: 'schaal', tekst: 'Ik werd goed geïnformeerd over wat er in de organisatie speelde.' },
        { thema: 'Organisatie en afscheid', meetpunt: 'Afhandeling van het vertrek', type: 'schaal', tekst: 'Mijn vertrek is zorgvuldig en respectvol afgehandeld.', weet_niet: true },
        { thema: 'Organisatie en afscheid', meetpunt: 'Totaaloordeel werkgever', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden ben je, alles bij elkaar genomen, over je tijd bij {bedrijf}?' },
        { thema: 'Organisatie en afscheid', type: 'cijfer', schaal_soort: 'nps', tekst: 'Hoe waarschijnlijk is het dat je {bedrijf} als werkgever aanbeveelt aan vrienden of bekenden?' },
        { thema: 'Organisatie en afscheid', type: 'janee', tekst: 'Zou je in de toekomst opnieuw bij {bedrijf} willen werken?' },
        { thema: 'Organisatie en afscheid', type: 'open', tekst: 'Wat heb je het meest gewaardeerd aan het werken bij {bedrijf}?' },
        { thema: 'Organisatie en afscheid', type: 'open', tekst: 'Welk advies wil je {bedrijf} meegeven?' },
        ...ACHTERGROND_VERTREK,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Afspreken wanneer vertrekkers de link krijgen (bijvoorbeeld in hun laatste werkweek)',
        'Link opnemen in de standaardmail of checklist bij uitdiensttreding',
        'Vragenlijst doorlopend openhouden en resultaten pas bekijken bij minimaal 5 respondenten',
        'Achtergrondvragen weglaten als er weinig vertrekkers zijn (herkenbaarheid)',
        'Verloopcijfers opvragen en invoeren bij Eigen invoer',
        'Uitkomsten per halfjaar of jaar samenvatten en bespreken met opdrachtgever',
      ],
    },
  },

  // ------------------------------------------------------------------ 6. Sociale veiligheid, diversiteit en inclusie
  {
    id: 'sociale-veiligheid',
    naam: 'Sociale veiligheid, diversiteit en inclusie',
    omschrijving: 'Omgang en respect, je kunnen uitspreken, gelijke behandeling en inclusie, ongewenst gedrag en het vertrouwen in melden en opvolgen; zonder vragen naar specifieke voorvallen of personen.',
    inhoud: {
      vragenlijst: {
        titel: 'Onderzoek sociale veiligheid en inclusie',
        introtekst:
          'Fijn dat je mee wilt doen aan dit onderzoek naar sociale veiligheid, diversiteit en inclusie bij {bedrijf}. We willen weten of iedereen zich op het werk veilig, gerespecteerd en welkom voelt, en of je weet waar je terechtkunt als dat niet zo is. Met de uitkomsten kijken we wat er beter kan. Het invullen duurt ongeveer 8 minuten.\n\n' +
          'Deze vragenlijst is geen meldpunt. Omdat je antwoorden anoniem zijn, kan niemand er persoonlijk op reageren. We vragen daarom ook niet naar specifieke voorvallen of personen. Heb je zelf te maken (gehad) met ongewenst gedrag, of zit je ergens mee? Neem dan contact op met de vertrouwenspersoon van {bedrijf}. Weet je niet wie dat is, vraag het dan na bij HR. Je kunt ook terecht bij de bedrijfsarts.\n\n' +
          INTRO_ANONIEM,
        bedanktekst:
          'Hartelijk dank voor het invullen! Je antwoorden zijn anoniem opgeslagen. Wil je naar aanleiding van deze vragenlijst met iemand praten? Neem dan contact op met de vertrouwenspersoon van {bedrijf}. Je kunt dit venster nu sluiten.',
      },
      themas: [
        {
          naam: 'Omgang en respect',
          omschrijving: 'Hoe collega\'s en leidinggevenden in de dagelijkse praktijk met elkaar omgaan.',
          meetpunten: [{ naam: 'Respectvolle omgang', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Je uitspreken',
          omschrijving: 'Of medewerkers zich vrij voelen om fouten, zorgen en een andere mening te delen.',
          meetpunten: [{ naam: 'Vrijheid om je uit te spreken', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Gelijke behandeling en inclusie',
          omschrijving: 'Gelijke kansen voor iedereen en het gevoel erbij te horen.',
          meetpunten: [
            { naam: 'Gelijke behandeling', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Inclusie', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Veiligheid en ongewenst gedrag',
          omschrijving: 'Of medewerkers zich veilig voelen en of ongewenst gedrag voorkomt. Er wordt niet gevraagd naar specifieke voorvallen of personen.',
          meetpunten: [{ naam: 'Ervaren veiligheid', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Melden en opvolgen',
          omschrijving: 'Bekendheid met de vertrouwenspersoon en de klachtenregeling, en het vertrouwen in de opvolging van meldingen.',
          meetpunten: [
            { naam: 'Bekendheid met hulp en melden', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Vertrouwen in melden en opvolging', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Cijfers over meldingen',
          omschrijving: 'Aantallen uit de registratie van HR en het jaarverslag van de vertrouwenspersoon (zelf invoeren bij Eigen invoer). Neem alleen aantallen over, geen details van meldingen.',
          meetpunten: [
            { naam: 'Meldingen bij de vertrouwenspersoon', omschrijving: 'Aantal meldingen of gesprekken per jaar, volgens het jaarverslag van de vertrouwenspersoon', eenheid: 'aantal' },
            { naam: 'Formele klachten', omschrijving: 'Aantal formele klachten over ongewenst gedrag per jaar', eenheid: 'aantal' },
          ],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        { thema: 'Omgang en respect', meetpunt: 'Respectvolle omgang', type: 'schaal', tekst: 'Bij {bedrijf} gaan we respectvol met elkaar om.' },
        { thema: 'Omgang en respect', meetpunt: 'Respectvolle omgang', type: 'schaal', tekst: 'Ik word op mijn werk met respect behandeld.' },
        { thema: 'Omgang en respect', meetpunt: 'Respectvolle omgang', type: 'schaal', tekst: 'Grappen en opmerkingen in mijn team blijven voor iedereen prettig.' },
        { thema: 'Omgang en respect', meetpunt: 'Respectvolle omgang', type: 'schaal', tekst: 'In mijn team spreken we elkaar op een goede manier aan als iemand over een grens gaat.' },
        { thema: 'Omgang en respect', meetpunt: 'Respectvolle omgang', type: 'schaal', tekst: 'Leidinggevenden geven het goede voorbeeld in hoe we met elkaar omgaan.', weet_niet: true },
        { thema: 'Omgang en respect', meetpunt: 'Respectvolle omgang', type: 'schaal', schaal_soort: 'frequentie', tekst: 'Hoe vaak voel je je op je gemak bij je collega\'s?' },
        { thema: 'Je uitspreken', meetpunt: 'Vrijheid om je uit te spreken', type: 'schaal', tekst: 'Ik durf in mijn team een andere mening te geven.' },
        { thema: 'Je uitspreken', meetpunt: 'Vrijheid om je uit te spreken', type: 'schaal', tekst: 'Als ik een fout maak, kan ik dat in mijn team gewoon vertellen.' },
        { thema: 'Je uitspreken', meetpunt: 'Vrijheid om je uit te spreken', type: 'schaal', tekst: 'Ik kan zorgen of problemen bespreken met mijn leidinggevende.' },
        { thema: 'Je uitspreken', meetpunt: 'Vrijheid om je uit te spreken', type: 'schaal', tekst: 'Als iemand in mijn team iets aankaart, wordt daar serieus naar geluisterd.' },
        { thema: 'Gelijke behandeling en inclusie', meetpunt: 'Gelijke behandeling', type: 'schaal', tekst: 'Bij {bedrijf} krijgt iedereen gelijke kansen, ongeacht bijvoorbeeld leeftijd, geslacht, afkomst, geloof, seksuele oriëntatie of beperking.', weet_niet: true },
        { thema: 'Gelijke behandeling en inclusie', meetpunt: 'Gelijke behandeling', type: 'schaal', tekst: 'Beslissingen over beloning en promotie worden bij {bedrijf} eerlijk genomen.', weet_niet: true },
        { thema: 'Gelijke behandeling en inclusie', meetpunt: 'Inclusie', type: 'schaal', tekst: 'Ik kan op mijn werk mezelf zijn.' },
        { thema: 'Gelijke behandeling en inclusie', meetpunt: 'Inclusie', type: 'schaal', tekst: 'Ik heb het gevoel dat ik er bij {bedrijf} bij hoor.' },
        { thema: 'Gelijke behandeling en inclusie', meetpunt: 'Inclusie', type: 'schaal', tekst: 'Verschillen tussen mensen worden bij {bedrijf} gewaardeerd.' },
        { thema: 'Gelijke behandeling en inclusie', meetpunt: 'Inclusie', type: 'schaal', tekst: 'Bij overleg en besluiten in mijn team telt de inbreng van iedereen mee.' },
        { thema: 'Veiligheid en ongewenst gedrag', meetpunt: 'Ervaren veiligheid', type: 'schaal', tekst: 'Ik voel me veilig op mijn werk.' },
        { thema: 'Veiligheid en ongewenst gedrag', meetpunt: 'Ervaren veiligheid', type: 'schaal', tekst: 'Bij {bedrijf} is duidelijk dat pesten, discriminatie en (seksuele) intimidatie niet worden geaccepteerd.' },
        {
          thema: 'Veiligheid en ongewenst gedrag',
          type: 'meerkeuze',
          tekst: 'Heb je in de afgelopen 12 maanden zelf ongewenst gedrag meegemaakt op of rond je werk?',
          toelichting: 'We vragen niet wat er precies is gebeurd of wie erbij betrokken was. Wil je erover praten of iets melden? Neem dan contact op met de vertrouwenspersoon.',
          opties: ['Ja', 'Nee', 'Dat zeg ik liever niet'],
        },
        {
          thema: 'Veiligheid en ongewenst gedrag',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Als je ongewenst gedrag hebt meegemaakt: wat voor gedrag was dat?',
          toelichting: 'Sla deze vraag over als je geen ongewenst gedrag hebt meegemaakt. Je kunt meer dan één antwoord kiezen.',
          opties: [
            'Pesten of buitensluiten',
            'Discriminatie',
            'Seksuele intimidatie of ongewenste aandacht',
            'Intimidatie of bedreiging',
            'Agressie of geweld',
            'Ander ongewenst gedrag',
            'Dat zeg ik liever niet',
          ],
        },
        {
          thema: 'Veiligheid en ongewenst gedrag',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Als je ongewenst gedrag hebt meegemaakt: van wie ging dat uit?',
          toelichting: 'Sla deze vraag over als je geen ongewenst gedrag hebt meegemaakt.',
          opties: [
            'Iemand van binnen de organisatie',
            'Iemand van buiten de organisatie (bijvoorbeeld een klant, bezoeker of leverancier)',
            'Dat zeg ik liever niet',
          ],
        },
        { thema: 'Veiligheid en ongewenst gedrag', type: 'janee', tekst: 'Heb je in de afgelopen 12 maanden gezien of gehoord dat een collega ongewenst gedrag meemaakte?' },
        { thema: 'Melden en opvolgen', type: 'janee', tekst: 'Weet je wie de vertrouwenspersoon van {bedrijf} is?' },
        { thema: 'Melden en opvolgen', meetpunt: 'Bekendheid met hulp en melden', type: 'schaal', tekst: 'Ik weet waar ik terechtkan als ik te maken krijg met ongewenst gedrag.' },
        { thema: 'Melden en opvolgen', meetpunt: 'Bekendheid met hulp en melden', type: 'schaal', tekst: 'Ik weet hoe ik een melding of klacht over ongewenst gedrag kan indienen.' },
        { thema: 'Melden en opvolgen', meetpunt: 'Vertrouwen in melden en opvolging', type: 'schaal', tekst: 'Als ik ongewenst gedrag zou meemaken, zou ik dat durven melden.' },
        { thema: 'Melden en opvolgen', meetpunt: 'Vertrouwen in melden en opvolging', type: 'schaal', tekst: 'Ik vertrouw erop dat een melding zorgvuldig en vertrouwelijk wordt behandeld.', weet_niet: true },
        { thema: 'Melden en opvolgen', meetpunt: 'Vertrouwen in melden en opvolging', type: 'schaal', tekst: 'Ik vertrouw erop dat melden geen nadelige gevolgen voor mij heeft.', weet_niet: true },
        { thema: 'Melden en opvolgen', meetpunt: 'Vertrouwen in melden en opvolging', type: 'schaal', tekst: 'Als er iets wordt gemeld, doet {bedrijf} daar ook echt iets mee.', weet_niet: true },
        { thema: 'Melden en opvolgen', type: 'open', tekst: 'Wat gaat er goed in de manier waarop we bij {bedrijf} met elkaar omgaan?', toelichting: 'Noem geen namen.' },
        {
          thema: 'Melden en opvolgen',
          type: 'open',
          tekst: 'Wat zou {bedrijf} kunnen doen om de omgang met elkaar veiliger of prettiger te maken?',
          toelichting: 'Beschrijf geen specifieke voorvallen en noem geen namen. Deze vragenlijst is geen meldpunt: voor een melding of een gesprek kun je terecht bij de vertrouwenspersoon.',
        },
        ...ACHTERGROND_VRAGEN,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Nagaan wie de vertrouwenspersoon is en hoe de klachtenregeling werkt',
        'Contactgegevens van de vertrouwenspersoon toevoegen aan de uitleg van de vragenlijst',
        'Vragenlijst vooraf afstemmen met opdrachtgever, vertrouwenspersoon en eventueel de ondernemingsraad',
        'Controleren dat de vragenlijst niet vraagt naar afkomst, geloof, gezondheid of seksuele oriëntatie (bijzondere persoonsgegevens)',
        'Aankondiging en link versturen naar medewerkers',
        'Resultaten analyseren en bevindingen schrijven, zonder herkenbare voorbeelden of citaten',
        'Exportbestanden met losse antwoorden veilig bewaren en niet delen met de opdrachtgever',
      ],
    },
  },

  // ------------------------------------------------------------------ 7. Hybride en plaatsonafhankelijk werken
  {
    id: 'hybride-werken',
    naam: 'Hybride en plaatsonafhankelijk werken',
    omschrijving: 'Thuis, op kantoor of elders werken: afspraken, werkplek en ICT, samenwerking en verbinding, leidinggeven op afstand, en balans en welzijn.',
    inhoud: {
      vragenlijst: {
        titel: 'Onderzoek hybride werken',
        introtekst:
          'Fijn dat je mee wilt doen aan dit onderzoek naar hybride werken bij {bedrijf}. We willen weten hoe het werken op verschillende plekken (thuis, op kantoor of ergens anders) je bevalt: wat goed gaat, wat lastig is en welke afspraken of voorzieningen beter kunnen. Kun je in jouw functie niet thuiswerken? Vul de vragenlijst dan toch in en kies "Weet niet / n.v.t." bij vragen die niet voor jou gelden, of sla ze over. Het invullen duurt ongeveer 8 minuten.\n\n' +
          INTRO_ANONIEM,
        bedanktekst: BEDANKT,
      },
      themas: [
        {
          naam: 'Werkpatroon en afspraken',
          omschrijving: 'Waar medewerkers werken en hoe duidelijk en passend de afspraken daarover zijn.',
          meetpunten: [{ naam: 'Duidelijke en passende afspraken', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Werkplek en techniek',
          omschrijving: 'De werkplek thuis en op kantoor, en de ICT om op afstand te werken.',
          meetpunten: [
            { naam: 'Thuiswerkplek', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'ICT op afstand', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Werkplek op kantoor', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Samenwerking en verbinding',
          omschrijving: 'Samenwerken op verschillende plekken en de band met team en organisatie.',
          meetpunten: [
            { naam: 'Samenwerking op afstand', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Verbinding met team en organisatie', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Leidinggeven op afstand',
          omschrijving: 'Vertrouwen, contact en gelijke kansen, waar iemand ook werkt.',
          meetpunten: [{ naam: 'Vertrouwen en contact op afstand', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Balans en welzijn',
          omschrijving: 'Grenzen tussen werk en privé, pauzes, concentratie en werkplezier.',
          meetpunten: [{ naam: 'Balans bij hybride werken', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Wensen en verbeterpunten',
          omschrijving: 'Wat medewerkers nodig hebben om hybride werken beter te laten verlopen.',
          meetpunten: [],
        },
        {
          naam: 'Cijfers over hybride werken',
          omschrijving: CIJFERS,
          meetpunten: [
            { naam: 'Thuiswerkdagen', omschrijving: 'Thuiswerkdagen als percentage van alle gewerkte dagen', eenheid: '%' },
            { naam: 'Bezetting kantoor', omschrijving: 'Gemiddeld percentage bezette werkplekken op kantoor', eenheid: '%' },
            { naam: 'Medewerkers met thuiswerkafspraak', omschrijving: 'Aantal medewerkers met een vastgelegde afspraak over thuiswerken', eenheid: 'aantal' },
          ],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        {
          thema: 'Werkpatroon en afspraken',
          type: 'meerkeuze',
          tekst: 'Hoeveel dagen per week werk je gemiddeld thuis of op een andere plek dan kantoor?',
          opties: ['(Bijna) nooit', '1 of 2 dagen', '3 dagen of meer', 'Mijn werk kan niet op afstand worden gedaan'],
          uitsplitsen: true,
        },
        {
          thema: 'Werkpatroon en afspraken',
          type: 'meerkeuze',
          tekst: 'Hoeveel dagen per week zou je het liefst thuis of op een andere plek dan kantoor werken?',
          opties: ['Het liefst niet', '1 of 2 dagen', '3 dagen of meer', 'Geen voorkeur'],
        },
        { thema: 'Werkpatroon en afspraken', type: 'janee', tekst: 'Heeft jouw team vaste dagen waarop iedereen op kantoor is?' },
        { thema: 'Werkpatroon en afspraken', meetpunt: 'Duidelijke en passende afspraken', type: 'schaal', tekst: 'De afspraken over thuis en op kantoor werken zijn voor mij duidelijk.' },
        { thema: 'Werkpatroon en afspraken', meetpunt: 'Duidelijke en passende afspraken', type: 'schaal', tekst: 'De afspraken over thuis en op kantoor werken passen bij mijn werk en mijn situatie.' },
        { thema: 'Werkpatroon en afspraken', meetpunt: 'Duidelijke en passende afspraken', type: 'schaal', tekst: 'Ik heb genoeg vrijheid om zelf te kiezen waar ik werk.', weet_niet: true },
        { thema: 'Werkpatroon en afspraken', meetpunt: 'Duidelijke en passende afspraken', type: 'schaal', tekst: 'In mijn team hebben we goede afspraken over wanneer we elkaar op kantoor zien.', weet_niet: true },
        { thema: 'Werkplek en techniek', meetpunt: 'Thuiswerkplek', type: 'schaal', schaal_soort: 'kwaliteit', tekst: 'Hoe beoordeel je je werkplek thuis (bureau, stoel, beeldscherm en rust)?', weet_niet: true },
        { thema: 'Werkplek en techniek', meetpunt: 'Thuiswerkplek', type: 'schaal', tekst: 'Ik weet hoe ik mijn thuiswerkplek gezond kan inrichten.', weet_niet: true },
        { thema: 'Werkplek en techniek', meetpunt: 'ICT op afstand', type: 'schaal', schaal_soort: 'kwaliteit', tekst: 'Hoe beoordeel je de ICT waarmee je op afstand werkt (laptop, verbinding en programma\'s)?', weet_niet: true },
        { thema: 'Werkplek en techniek', meetpunt: 'ICT op afstand', type: 'schaal', tekst: 'Bij een ICT-probleem word ik snel en goed geholpen, waar ik ook werk.', weet_niet: true },
        { thema: 'Werkplek en techniek', meetpunt: 'Werkplek op kantoor', type: 'schaal', schaal_soort: 'kwaliteit', tekst: 'Hoe beoordeel je de werkplekken op kantoor (beschikbaarheid, rust en voorzieningen)?', weet_niet: true },
        { thema: 'Werkplek en techniek', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden ben je over de vergoeding en voorzieningen voor thuiswerken?', weet_niet: true },
        { thema: 'Samenwerking en verbinding', meetpunt: 'Samenwerking op afstand', type: 'schaal', tekst: 'De samenwerking in mijn team loopt goed, ook als we op verschillende plekken werken.' },
        { thema: 'Samenwerking en verbinding', meetpunt: 'Samenwerking op afstand', type: 'schaal', tekst: 'Onze online en hybride overleggen zijn nuttig en goed te volgen.', weet_niet: true },
        { thema: 'Samenwerking en verbinding', meetpunt: 'Verbinding met team en organisatie', type: 'schaal', tekst: 'Ik voel me verbonden met mijn team, ook als we elkaar minder vaak zien.' },
        { thema: 'Samenwerking en verbinding', meetpunt: 'Verbinding met team en organisatie', type: 'schaal', tekst: 'Ik blijf goed op de hoogte van wat er bij {bedrijf} speelt, waar ik ook werk.' },
        { thema: 'Samenwerking en verbinding', meetpunt: 'Verbinding met team en organisatie', type: 'schaal', tekst: 'De dagen op kantoor gebruiken we goed om elkaar te ontmoeten en samen te werken.', weet_niet: true },
        { thema: 'Leidinggeven op afstand', meetpunt: 'Vertrouwen en contact op afstand', type: 'schaal', tekst: 'Mijn leidinggevende vertrouwt erop dat ik mijn werk goed doe, waar ik ook werk.' },
        { thema: 'Leidinggeven op afstand', meetpunt: 'Vertrouwen en contact op afstand', type: 'schaal', tekst: 'Mijn leidinggevende let op wat ik bereik, niet op waar of wanneer ik werk.' },
        { thema: 'Leidinggeven op afstand', meetpunt: 'Vertrouwen en contact op afstand', type: 'schaal', tekst: 'Mijn leidinggevende houdt goed contact met mij, ook als ik op afstand werk.', weet_niet: true },
        { thema: 'Leidinggeven op afstand', meetpunt: 'Vertrouwen en contact op afstand', type: 'schaal', tekst: 'Wie veel thuiswerkt, krijgt bij {bedrijf} dezelfde kansen als wie vaak op kantoor is.', weet_niet: true },
        { thema: 'Balans en welzijn', meetpunt: 'Balans bij hybride werken', type: 'schaal', tekst: 'Als ik thuiswerk, kan ik werk en privé goed van elkaar scheiden.', weet_niet: true },
        { thema: 'Balans en welzijn', meetpunt: 'Balans bij hybride werken', type: 'schaal', schaal_soort: 'frequentie', tekst: 'Hoe vaak neem je op een thuiswerkdag genoeg pauze en beweging?', weet_niet: true },
        { thema: 'Balans en welzijn', meetpunt: 'Balans bij hybride werken', type: 'schaal', tekst: 'Ik kan mij goed concentreren op de plek waar ik meestal werk.' },
        { thema: 'Balans en welzijn', meetpunt: 'Balans bij hybride werken', type: 'schaal', tekst: 'In mijn vrije tijd word ik door het werk met rust gelaten.' },
        { thema: 'Balans en welzijn', meetpunt: 'Balans bij hybride werken', type: 'schaal', tekst: 'De manier waarop ik nu thuis en op kantoor werk, is goed voor mijn werkplezier.' },
        {
          thema: 'Wensen en verbeterpunten',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Wat zou hybride werken voor jou beter maken?',
          toelichting: 'Kies er maximaal drie.',
          opties: [
            'Duidelijkere afspraken in het team',
            'Meer vrijheid om zelf te kiezen waar ik werk',
            'Vaste dagen waarop het hele team op kantoor is',
            'Een betere werkplek thuis',
            'Betere werkplekken of meer stilteplekken op kantoor',
            'Betere ICT of ondersteuning',
            'Minder of kortere online overleggen',
            'Meer momenten om collega\'s te ontmoeten',
            'Meer contact met mijn leidinggevende',
            'Een betere thuiswerkvergoeding',
            'Niets, het gaat goed zo',
          ],
        },
        { thema: 'Wensen en verbeterpunten', type: 'open', tekst: 'Wat gaat er goed in de manier waarop we bij {bedrijf} hybride werken?' },
        { thema: 'Wensen en verbeterpunten', type: 'open', tekst: 'Wat is voor jou het grootste knelpunt bij hybride werken, en hoe kunnen we dat oplossen?' },
        ...ACHTERGROND_VRAGEN,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Huidige thuiswerkregeling en afspraken opvragen',
        'Cijfers over thuiswerkdagen en bezetting van het kantoor opvragen en invoeren bij Eigen invoer',
        'Vragenlijst laten controleren door opdrachtgever',
        'Aankondiging en link versturen naar medewerkers',
        'Herinnering sturen na één week',
        'Resultaten analyseren en bevindingen schrijven',
        'Uitkomsten bespreken en afspraken over hybride werken aanscherpen',
      ],
    },
  },

  // ------------------------------------------------------------------ 8. Verandering en organisatiecultuur
  {
    id: 'verandering-cultuur',
    naam: 'Verandering en organisatiecultuur',
    omschrijving: 'Draagvlak voor een verandering (nut en noodzaak, communicatie, betrokkenheid, ondersteuning) en de cultuur in de praktijk: samenwerken, aanspreken, leren en vertrouwen in de leiding.',
    inhoud: {
      vragenlijst: {
        titel: 'Onderzoek verandering en cultuur',
        introtekst:
          'Fijn dat je mee wilt doen aan dit onderzoek naar verandering en cultuur bij {bedrijf}. We willen weten hoe je de veranderingen in de organisatie ervaart en hoe we in de praktijk met elkaar samenwerken. Met je antwoorden kunnen we veranderingen beter voorbereiden en begeleiden. Waar we het hebben over "de verandering", bedoelen we de belangrijkste verandering die nu in je werk speelt. Het invullen duurt ongeveer 8 minuten.\n\n' +
          INTRO_ANONIEM,
        bedanktekst: BEDANKT,
      },
      themas: [
        {
          naam: 'Nut en noodzaak van de verandering',
          omschrijving: 'Of medewerkers begrijpen waarom de verandering nodig is en of ze erachter staan.',
          meetpunten: [
            { naam: 'Begrip van de verandering', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Draagvlak', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Communicatie en betrokkenheid',
          omschrijving: 'Informatie over de verandering en de ruimte om mee te denken.',
          meetpunten: [
            { naam: 'Communicatie over de verandering', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Betrokkenheid bij de verandering', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Ondersteuning en haalbaarheid',
          omschrijving: 'Tijd, uitleg en begeleiding om mee te kunnen, en of het tempo vol te houden is.',
          meetpunten: [
            { naam: 'Ondersteuning bij de verandering', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Haalbaarheid', omschrijving: 'Hogere score = verandering beter te doen naast het gewone werk', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Cultuur: zo werken wij',
          omschrijving: 'Hoe er in de dagelijkse praktijk wordt samengewerkt, aangesproken en geleerd.',
          meetpunten: [
            { naam: 'Samenwerken en afspraken nakomen', omschrijving: '', eenheid: 'score 1–5' },
            { naam: 'Aanspreken en leren', omschrijving: '', eenheid: 'score 1–5' },
          ],
        },
        {
          naam: 'Vertrouwen en vooruitblik',
          omschrijving: 'Vertrouwen in de leiding van de verandering en wat medewerkers nodig hebben.',
          meetpunten: [{ naam: 'Vertrouwen in de leiding', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Cijfers rond de verandering',
          omschrijving: CIJFERS,
          meetpunten: [
            { naam: 'Verzuimpercentage', omschrijving: 'Uit de verzuimregistratie', eenheid: '%' },
            { naam: 'Verloop', omschrijving: 'Vertrokken medewerkers als percentage van het gemiddelde aantal', eenheid: '%' },
            { naam: 'Deelname aan bijeenkomsten en trainingen', omschrijving: 'Percentage medewerkers dat een bijeenkomst of training over de verandering heeft gevolgd', eenheid: '%' },
          ],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        {
          thema: 'Nut en noodzaak van de verandering',
          meetpunt: 'Begrip van de verandering',
          type: 'schaal',
          tekst: 'Ik begrijp waarom de verandering nodig is.',
          toelichting: 'Met "de verandering" bedoelen we de belangrijkste verandering die nu in je werk speelt.',
        },
        { thema: 'Nut en noodzaak van de verandering', meetpunt: 'Begrip van de verandering', type: 'schaal', tekst: 'Het is mij duidelijk waar {bedrijf} met de verandering naartoe wil.' },
        { thema: 'Nut en noodzaak van de verandering', meetpunt: 'Draagvlak', type: 'schaal', tekst: 'Ik verwacht dat de verandering goed uitpakt voor {bedrijf}.', weet_niet: true },
        { thema: 'Nut en noodzaak van de verandering', meetpunt: 'Draagvlak', type: 'schaal', tekst: 'Ik verwacht dat de verandering goed uitpakt voor mijn eigen werk.', weet_niet: true },
        { thema: 'Nut en noodzaak van de verandering', meetpunt: 'Draagvlak', type: 'schaal', tekst: 'Ik sta achter de verandering.' },
        { thema: 'Communicatie en betrokkenheid', meetpunt: 'Communicatie over de verandering', type: 'schaal', tekst: 'Ik word op tijd geïnformeerd over wat er gaat veranderen.' },
        { thema: 'Communicatie en betrokkenheid', meetpunt: 'Communicatie over de verandering', type: 'schaal', tekst: 'De informatie over de verandering is eerlijk en begrijpelijk.' },
        { thema: 'Communicatie en betrokkenheid', meetpunt: 'Communicatie over de verandering', type: 'schaal', tekst: 'Ik weet wat de verandering concreet voor mijn werk betekent.' },
        { thema: 'Communicatie en betrokkenheid', type: 'janee', tekst: 'Heb je zelf kunnen meedenken of meepraten over de verandering?' },
        { thema: 'Communicatie en betrokkenheid', meetpunt: 'Betrokkenheid bij de verandering', type: 'schaal', tekst: 'Ik kan met mijn vragen en zorgen over de verandering bij iemand terecht.' },
        { thema: 'Communicatie en betrokkenheid', meetpunt: 'Betrokkenheid bij de verandering', type: 'schaal', tekst: 'Medewerkers kunnen meedenken over hoe de verandering wordt uitgevoerd.' },
        { thema: 'Communicatie en betrokkenheid', meetpunt: 'Betrokkenheid bij de verandering', type: 'schaal', tekst: 'Met de inbreng van medewerkers wordt zichtbaar iets gedaan.', weet_niet: true },
        { thema: 'Ondersteuning en haalbaarheid', meetpunt: 'Ondersteuning bij de verandering', type: 'schaal', tekst: 'Ik krijg de tijd en ruimte om aan de nieuwe manier van werken te wennen.' },
        { thema: 'Ondersteuning en haalbaarheid', meetpunt: 'Ondersteuning bij de verandering', type: 'schaal', tekst: 'Ik krijg de uitleg of training die ik voor de verandering nodig heb.', weet_niet: true },
        { thema: 'Ondersteuning en haalbaarheid', meetpunt: 'Ondersteuning bij de verandering', type: 'schaal', tekst: 'Mijn leidinggevende helpt ons team goed door de verandering heen.' },
        { thema: 'Ondersteuning en haalbaarheid', meetpunt: 'Haalbaarheid', type: 'schaal', tekst: 'Het tempo en de hoeveelheid veranderingen zijn goed bij te houden.' },
        { thema: 'Ondersteuning en haalbaarheid', meetpunt: 'Haalbaarheid', type: 'schaal', tekst: 'De verandering is goed te combineren met mijn dagelijkse werk.' },
        { thema: 'Cultuur: zo werken wij', meetpunt: 'Samenwerken en afspraken nakomen', type: 'schaal', tekst: 'Bij {bedrijf} komen we afspraken met elkaar na.' },
        { thema: 'Cultuur: zo werken wij', meetpunt: 'Samenwerken en afspraken nakomen', type: 'schaal', tekst: 'Afdelingen werken samen aan hetzelfde doel.', weet_niet: true },
        { thema: 'Cultuur: zo werken wij', meetpunt: 'Aanspreken en leren', type: 'schaal', tekst: 'We spreken elkaar aan als iets niet goed gaat.' },
        { thema: 'Cultuur: zo werken wij', meetpunt: 'Aanspreken en leren', type: 'schaal', tekst: 'Van fouten wordt bij {bedrijf} geleerd, zonder dat er een schuldige wordt gezocht.' },
        { thema: 'Cultuur: zo werken wij', meetpunt: 'Aanspreken en leren', type: 'schaal', tekst: 'Nieuwe ideeën krijgen bij {bedrijf} een eerlijke kans.' },
        { thema: 'Cultuur: zo werken wij', type: 'schaal', tekst: 'Wat {bedrijf} zegt belangrijk te vinden, zie ik terug in de dagelijkse praktijk.', weet_niet: true },
        { thema: 'Vertrouwen en vooruitblik', meetpunt: 'Vertrouwen in de leiding', type: 'schaal', tekst: 'Ik heb vertrouwen in de manier waarop de directie de verandering leidt.', weet_niet: true },
        { thema: 'Vertrouwen en vooruitblik', meetpunt: 'Vertrouwen in de leiding', type: 'schaal', tekst: 'De directie en leidinggevenden laten in hun eigen gedrag zien wat ze van medewerkers vragen.', weet_niet: true },
        { thema: 'Vertrouwen en vooruitblik', meetpunt: 'Vertrouwen in de leiding', type: 'schaal', tekst: 'Eerdere veranderingen bij {bedrijf} zijn goed afgerond.', weet_niet: true },
        {
          thema: 'Vertrouwen en vooruitblik',
          type: 'meerkeuze',
          tekst: 'Hoe sta je op dit moment tegenover de verandering?',
          opties: ['Enthousiast', 'Positief', 'Afwachtend', 'Bezorgd', 'Kritisch', 'Ik weet er nog te weinig van'],
        },
        {
          thema: 'Vertrouwen en vooruitblik',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Wat heb je nodig om goed mee te kunnen in de verandering?',
          toelichting: 'Kies er maximaal drie.',
          opties: [
            'Meer uitleg over het waarom',
            'Duidelijkheid over wat het voor mijn werk betekent',
            'Meer tijd om eraan te wennen',
            'Training of begeleiding',
            'Meer inspraak',
            'Een leidinggevende die meedenkt',
            'Minder veranderingen tegelijk',
            'Zekerheid over mijn baan of functie',
            'Niets, ik kan goed mee',
          ],
        },
        { thema: 'Vertrouwen en vooruitblik', type: 'open', tekst: 'Wat moeten we bij {bedrijf} vooral behouden, ook als er veel verandert?' },
        { thema: 'Vertrouwen en vooruitblik', type: 'open', tekst: 'Wat is je grootste zorg of je belangrijkste tip bij de verandering?' },
        ...ACHTERGROND_VRAGEN,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'In de uitleg van de vragenlijst benoemen om welke verandering het gaat',
        'Veranderplan, planning en eerdere communicatie opvragen',
        'Vragenlijst laten controleren door opdrachtgever',
        'Aankondiging en link versturen naar medewerkers',
        'Herinnering sturen na één week',
        'Resultaten analyseren en bevindingen schrijven',
        'Vervolgmeting plannen om te volgen hoe het draagvlak zich ontwikkelt',
      ],
    },
  },

  // ------------------------------------------------------------------ 9. Ontwikkeling en loopbaan
  {
    id: 'ontwikkeling-loopbaan',
    naam: 'Ontwikkeling en loopbaan',
    omschrijving: 'Leren in het werk, opleidingen, het gesprek over ontwikkeling, loopbaanperspectief en klaar zijn voor de toekomst (duurzame inzetbaarheid).',
    inhoud: {
      vragenlijst: {
        titel: 'Onderzoek ontwikkeling en loopbaan',
        introtekst:
          'Fijn dat je mee wilt doen aan dit onderzoek naar ontwikkeling en loopbaan bij {bedrijf}. We willen weten of je genoeg kunt leren en groeien in je werk, hoe je de opleidingsmogelijkheden ervaart en hoe je naar je toekomst kijkt. Met de uitkomsten verbeteren we het aanbod en de begeleiding. Het invullen duurt ongeveer 8 minuten.\n\n' +
          INTRO_ANONIEM,
        bedanktekst: BEDANKT,
      },
      themas: [
        {
          naam: 'Leren in het werk',
          omschrijving: 'Of het dagelijkse werk genoeg ruimte biedt om te leren en talenten te gebruiken.',
          meetpunten: [{ naam: 'Leren in het dagelijkse werk', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Opleidingen en trainingen',
          omschrijving: 'Bekendheid, bereikbaarheid en nut van het opleidingsaanbod.',
          meetpunten: [{ naam: 'Opleidingsmogelijkheden', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Gesprek over ontwikkeling',
          omschrijving: 'Het gesprek met de leidinggevende over ontwikkeling en de afspraken die daaruit volgen.',
          meetpunten: [{ naam: 'Gesprek en afspraken over ontwikkeling', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Loopbaan en doorgroeien',
          omschrijving: 'Zicht op loopbaanstappen en eerlijke kansen binnen de organisatie.',
          meetpunten: [{ naam: 'Loopbaanperspectief', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Klaar voor de toekomst',
          omschrijving: 'Of medewerkers hun werk ook in de toekomst goed kunnen blijven doen (duurzame inzetbaarheid).',
          meetpunten: [{ naam: 'Duurzame inzetbaarheid', omschrijving: '', eenheid: 'score 1–5' }],
        },
        {
          naam: 'Wensen en belemmeringen',
          omschrijving: 'Hoe medewerkers zich het liefst ontwikkelen en wat hen daarbij tegenhoudt.',
          meetpunten: [],
        },
        {
          naam: 'Cijfers over ontwikkeling',
          omschrijving: CIJFERS,
          meetpunten: [
            { naam: 'Besteding opleidingsbudget', omschrijving: 'Percentage van het budget dat is besteed', eenheid: '%' },
            { naam: 'Opleidingsdagen', omschrijving: 'Gemiddeld aantal opleidingsdagen per medewerker per jaar', eenheid: 'dagen' },
            { naam: 'Gevoerde jaargesprekken', omschrijving: 'Percentage medewerkers met een jaargesprek', eenheid: '%' },
            { naam: 'Interne doorstroom', omschrijving: 'Percentage vacatures dat met een interne kandidaat is vervuld', eenheid: '%' },
          ],
        },
        ACHTERGROND_THEMA,
      ],
      vragen: [
        { thema: 'Leren in het werk', meetpunt: 'Leren in het dagelijkse werk', type: 'schaal', tekst: 'In mijn werk leer ik regelmatig nieuwe dingen.' },
        { thema: 'Leren in het werk', meetpunt: 'Leren in het dagelijkse werk', type: 'schaal', tekst: 'Ik leer van de collega\'s met wie ik samenwerk.' },
        { thema: 'Leren in het werk', meetpunt: 'Leren in het dagelijkse werk', type: 'schaal', tekst: 'Ik krijg de kans om nieuwe taken of projecten op te pakken.' },
        { thema: 'Leren in het werk', meetpunt: 'Leren in het dagelijkse werk', type: 'schaal', tekst: 'Mijn talenten komen in mijn huidige functie goed tot hun recht.' },
        { thema: 'Opleidingen en trainingen', meetpunt: 'Opleidingsmogelijkheden', type: 'schaal', tekst: 'Ik weet welke opleidingen en trainingen ik via {bedrijf} kan volgen.' },
        { thema: 'Opleidingen en trainingen', meetpunt: 'Opleidingsmogelijkheden', type: 'schaal', tekst: 'Ik krijg genoeg tijd om opleidingen of trainingen te volgen.' },
        { thema: 'Opleidingen en trainingen', meetpunt: 'Opleidingsmogelijkheden', type: 'schaal', tekst: 'Het is eenvoudig om een opleiding of training aan te vragen.', weet_niet: true },
        { thema: 'Opleidingen en trainingen', meetpunt: 'Opleidingsmogelijkheden', type: 'schaal', tekst: 'Wat ik in opleidingen en trainingen leer, kan ik toepassen in mijn werk.', weet_niet: true },
        { thema: 'Opleidingen en trainingen', meetpunt: 'Opleidingsmogelijkheden', type: 'schaal', schaal_soort: 'tevreden', tekst: 'Hoe tevreden ben je over het aanbod van opleidingen en trainingen bij {bedrijf}?', weet_niet: true },
        { thema: 'Opleidingen en trainingen', type: 'janee', tekst: 'Heb je in de afgelopen 12 maanden een opleiding, training of cursus gevolgd?' },
        { thema: 'Gesprek over ontwikkeling', type: 'janee', tekst: 'Heb je in de afgelopen 12 maanden met je leidinggevende over je ontwikkeling gesproken?' },
        { thema: 'Gesprek over ontwikkeling', meetpunt: 'Gesprek en afspraken over ontwikkeling', type: 'schaal', tekst: 'Mijn leidinggevende denkt met mij mee over mijn ontwikkeling.' },
        { thema: 'Gesprek over ontwikkeling', meetpunt: 'Gesprek en afspraken over ontwikkeling', type: 'schaal', tekst: 'Ik heb met mijn leidinggevende duidelijke afspraken gemaakt over mijn ontwikkeling.' },
        { thema: 'Gesprek over ontwikkeling', meetpunt: 'Gesprek en afspraken over ontwikkeling', type: 'schaal', tekst: 'Afspraken over mijn ontwikkeling worden nagekomen.', weet_niet: true },
        { thema: 'Gesprek over ontwikkeling', meetpunt: 'Gesprek en afspraken over ontwikkeling', type: 'schaal', tekst: 'Ik krijg feedback waarmee ik mij verder kan ontwikkelen.' },
        { thema: 'Loopbaan en doorgroeien', meetpunt: 'Loopbaanperspectief', type: 'schaal', tekst: 'Ik zie voor mezelf doorgroeimogelijkheden binnen {bedrijf}.', weet_niet: true },
        { thema: 'Loopbaan en doorgroeien', meetpunt: 'Loopbaanperspectief', type: 'schaal', tekst: 'Ik weet welke stappen ik kan zetten om door te groeien of van functie te veranderen.' },
        { thema: 'Loopbaan en doorgroeien', meetpunt: 'Loopbaanperspectief', type: 'schaal', tekst: 'Interne vacatures zijn voor mij goed te vinden.', weet_niet: true },
        { thema: 'Loopbaan en doorgroeien', meetpunt: 'Loopbaanperspectief', type: 'schaal', tekst: 'Bij {bedrijf} krijgt iedereen een eerlijke kans op een andere of hogere functie.', weet_niet: true },
        { thema: 'Loopbaan en doorgroeien', type: 'schaal', tekst: 'Ik heb een duidelijk beeld van wat ik de komende jaren in mijn werk wil bereiken.' },
        {
          thema: 'Loopbaan en doorgroeien',
          type: 'meerkeuze',
          tekst: 'Wat is je belangrijkste wens voor de komende twee jaar?',
          opties: [
            'Beter worden in mijn huidige functie',
            'Meer verantwoordelijkheid of een hogere functie',
            'Een andere functie op hetzelfde niveau',
            'Me breder ontwikkelen met nieuwe taken of projecten',
            'Minder gaan werken of een stap terug doen',
            'Het mag blijven zoals het nu is',
            'Dat weet ik nog niet',
          ],
        },
        { thema: 'Klaar voor de toekomst', meetpunt: 'Duurzame inzetbaarheid', type: 'schaal', tekst: 'Mijn kennis en vaardigheden zijn bij de tijd.' },
        { thema: 'Klaar voor de toekomst', meetpunt: 'Duurzame inzetbaarheid', type: 'schaal', tekst: 'Ik voel me goed voorbereid op veranderingen in mijn vak of functie.' },
        { thema: 'Klaar voor de toekomst', meetpunt: 'Duurzame inzetbaarheid', type: 'schaal', tekst: 'Ik neem zelf het initiatief om mij te blijven ontwikkelen.' },
        { thema: 'Klaar voor de toekomst', meetpunt: 'Duurzame inzetbaarheid', type: 'schaal', tekst: 'Met mijn kennis en ervaring zou ik ook buiten {bedrijf} passend werk kunnen vinden.', weet_niet: true },
        { thema: 'Klaar voor de toekomst', meetpunt: 'Duurzame inzetbaarheid', type: 'schaal', tekst: 'Ik verwacht mijn huidige werk ook over vijf jaar nog goed en met plezier te kunnen doen.', weet_niet: true },
        {
          thema: 'Wensen en belemmeringen',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Op welke manier ontwikkel je je het liefst?',
          opties: [
            'Leren tijdens het werk',
            'Meekijken of meelopen met een collega',
            'Coaching of intervisie',
            'Een korte training of workshop',
            'Een online cursus (e-learning)',
            'Een langere opleiding met diploma',
            'Een nieuwe taak, een project of een tijdje meewerken op een andere afdeling',
            'Zelfstudie',
          ],
        },
        {
          thema: 'Wensen en belemmeringen',
          type: 'meerkeuze',
          meerdere_antwoorden: true,
          tekst: 'Wat houdt je het meest tegen om je verder te ontwikkelen?',
          toelichting: 'Kies er maximaal drie.',
          opties: [
            'Te weinig tijd door de drukte van het werk',
            'Te weinig budget',
            'Ik weet niet wat de mogelijkheden zijn',
            'Het aanbod past niet bij wat ik wil leren',
            'Te weinig steun van mijn leidinggevende',
            'Er zijn geen doorgroeimogelijkheden',
            'Lastig te combineren met mijn privésituatie',
            'Ik heb er op dit moment geen behoefte aan',
            'Niets houdt mij tegen',
          ],
        },
        { thema: 'Wensen en belemmeringen', type: 'open', tekst: 'Welke kennis of vaardigheden wil je de komende tijd graag ontwikkelen?' },
        { thema: 'Wensen en belemmeringen', type: 'open', tekst: 'Wat zou {bedrijf} kunnen doen om jou beter te helpen bij je ontwikkeling of loopbaan?' },
        ...ACHTERGROND_VRAGEN,
      ],
      acties: [
        ACHTERGROND_ACTIE,
        'Opleidingsbeleid, opleidingsaanbod en budget opvragen',
        'Cijfers over opleidingen, jaargesprekken en interne doorstroom opvragen en invoeren bij Eigen invoer',
        'Vragenlijst laten controleren door opdrachtgever',
        'Aankondiging en link versturen naar medewerkers',
        'Herinnering sturen na één week',
        'Resultaten analyseren en bevindingen schrijven',
        'Conceptrapport bespreken met opdrachtgever',
      ],
    },
  },
];
