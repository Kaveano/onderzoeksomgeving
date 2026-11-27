// Automatische test van de statistiekfuncties (public/js/beheer/statistiek.js).
// Uitvoeren: node --test test/statistiek.test.mjs   (er is geen server of database voor nodig)
//
// De verwachte uitkomsten zijn berekend met SciPy 1.18.1 en NumPy 2.5.5 (Python 3.13) en staan hier
// letterlijk in, samen met de gegevens waarop ze zijn berekend. Gebruikt (a en b zoals in de aanroep
// welchT(a, b); een positieve uitkomst betekent dat b hoger ligt dan a):
//   beschrijf       numpy: mean, std(ddof=1), median, min, max
//   welchT          scipy.stats.ttest_ind(b, a, equal_var=False), met .df en .confidence_interval(0.95)
//   cohensD         numpy: d = (gem(b) − gem(a)) / gezamenlijke sd;  g = d · (1 − 3 / (4·(n1 + n2) − 9));
//                   interval = g ± 1,959964 · (g / d) · √((n1 + n2) / (n1·n2) + d² / (2·(n1 + n2)))
//   mannWhitney     scipy.stats.mannwhitneyu(b, a, use_continuity=True, method='asymptotic');
//                   z met dezelfde formule nagerekend in numpy (2·norm.sf(|z|) is gelijk aan de p van SciPy)
//   anova           scipy.stats.f_oneway(*groepen);  eta² = kwadratensom tussen groepen / totale kwadratensom
//   welchAnova      numpy, standaardformule van Welch (1951); nagerekend met
//                   statsmodels.stats.oneway.anova_oneway(use_var='unequal', welch_correction=True)
//   kruskalWallis   scipy.stats.kruskal(*groepen);  epsilon² = H / (N − 1)
//   pearson         scipy.stats.pearsonr(x, y), met .confidence_interval(0.95) (z-transformatie van Fisher)
//   spearman        scipy.stats.spearmanr(x, y)
//   cronbachAlpha   numpy: k / (k − 1) · (1 − som van de itemvarianties / variantie van de somscores)
//   chiKwadraat     scipy.stats.chi2_contingency(tabel, correction=False);  V = √(chi² / (N · (min(r, k) − 1)))
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../public/js/beheer/statistiek.js';

// ---------- Gegevens ----------

const D = {
  // Kleine steekproeven met scores 1 tot 5: veel gelijke waarden, ongelijke groepsgrootte
  likertA: [3, 4, 2, 5, 4, 3, 3, 4, 2, 4, 5, 3],
  likertB: [4, 5, 4, 3, 5, 5, 4, 4, 5, 3, 4, 5, 4, 2, 5, 4, 5],
  likertC: [2, 3, 1, 2, 4, 3, 2, 3, 2],
  kleinA: [1, 2, 2, 3, 5],
  kleinB: [2, 4, 4, 5, 5, 5],
  // Grotere willekeurige steekproeven (numpy.random.default_rng(20261126)), afgerond op 2 decimalen
  normA: [
    3.06, 3.17, 4.24, 4.65, 2.13, 3.47, 5.09, 4.19, 1.86, 4.4, 2.85, 2.55, 3.76, 3.48, 3.09, 4.66, 3.99, 3.21, 3.57,
    2.56, 3.19, 4.01, 4.04, 4, 4.48, 3.31, 2.36, 4.78, 4.85, 2.03, 2.63, 2.63, 2.81, 2.95, 2.49, 2.89, 4.13, 4.84,
    2.55, 4.16, 3.39, 3.61, 3.26, 2.34, 3.49, 3.25, 3.43, 2.29, 3.17, 2.9, 2.9, 1.48, 2.53, 3.2, 3.69, 3.18, 4.55,
    4.31, 2.92, 3.34,
  ],
  normB: [
    4.7, 3.13, 5.05, 2.35, 5.08, 5.56, 4.24, 4.47, 6.1, 3.98, 5.36, 2.21, 2.41, 4.17, 7.02, 2.6, 3.98, 5.13, 3.82,
    4.01, 2.68, 3.86, 6.54, 3.59, 2.43, 2.21, 3.66, 2.03, 4.46, 1.36, 5.5, 5.48, 2.26, 4.72, 4.13, 2.37, 3.04, 3,
    3.26, 3.29, 3.53, 4.22, 3.47, 4.33, 3.29, 3.92, 4.11, 6.06, 5.43, 3.22, 5.59, 5.23, 5.4, 3.57, 1.93, 3.76, 4.2,
    1.85, 2.68, 4.26, 2.3, 1.72, 3.69, 2.99, 4.82, 3.96, 3.77, 4.85, 2.98, 4.43, 4.77, 6.25, 4.94, 4.27, 2.17,
  ],
  normC: [
    3.05, 4.71, 3.22, 4.69, 4.13, 2.38, 3.83, 3.38, 3.26, 3.48, 3.46, 3.36, 4, 4.01, 2.69, 3.35, 3.19, 3.37, 3.68,
    3.77, 3.84, 4.55, 2.36, 4.97, 3.39, 2.57, 3.32, 4.73, 3.9, 4.35, 3.18, 2.7, 3.04, 3.1, 3.46, 3.24, 4.06, 4.9,
    4.38, 3.2, 4.11, 4.07, 4.47, 3.59, 4.18,
  ],
  normD: [
    5.12, 4, 3.57, 4.45, 4.6, 4.58, 3.37, 3.63, 3.1, 4.76, 4.17, 4.15, 3.77, 4.18, 3.08, 2.49, 2.77, 4.62, 1.02,
    4.01, 3.34, 4.68, 4.17, 4.38, 4.29, 4.33, 4.17, 2.48, 4.55, 2.5, 0.51, 2.59, 4.5, 3.82, 4.43, 4.33, 1.02, 3.97,
    3.48, 3.59, 4.41, 0.95, 3.29, 5.47, 3.4, 2.34, 4.93, 3.68, 2.92, 3.83, 2.95, 3.5,
  ],
  // Paren voor correlaties
  corX: [
    1.9, 2.69, 2.66, 3.57, 3.1, 4.05, 3.73, 2.01, 4.44, 2.99, 3.71, 3.53, 3.07, 2.65, 2.49, 3.66, 2.22, 3.08, 4.63,
    1.54, 4.11, 2.87, 3.66, 3.13, 3.94, 3.56, 3.46, 3.54, 3.05, 3.15, 4.34, 3.46, 3.14, 2.63, 3.39, 1.94, 3.98,
    3.21, 2.83, 4.01,
  ],
  corY: [
    3.22, 3.15, 2.79, 3.77, 2.66, 3.3, 5.36, 1.9, 5.01, 3.83, 3.5, 3.27, 2.44, 3.01, 3.79, 3.04, 1.91, 2.83, 3.79,
    1.82, 3.81, 2.26, 3.62, 3.64, 3.4, 2.61, 3.39, 3.86, 2.9, 3.81, 2.72, 3.02, 2.69, 1.49, 4.16, 2.21, 3.37, 3.56,
    3.43, 4.19,
  ],
  paarX: [1, 3, 3, 3, 2, 4, 2, 1, 4, 1, 1, 5, 1, 5, 3, 1, 3, 1, 3, 1, 5, 3, 4, 1, 2, 1, 5, 4, 4, 5],
  paarY: [1, 4, 2, 3, 4, 5, 2, 1, 5, 1, 1, 5, 1, 5, 2, 2, 2, 2, 4, 2, 5, 3, 5, 1, 4, 1, 5, 5, 4, 5],
  negX: [
    -0.27, 0.47, -1.69, -1.42, 0, -0.1, 0.96, -2.38, 0.74, 0.84, -0.34, -1.53, -0.03, 1.02, -0.42, -0.13, 0.06,
    0.51, 0.5, 0.32, -1.74, 1.37, 1.07, -0.02, -0.37,
  ],
  negY: [
    0.8, 0.78, 1.34, 0.74, -1.59, -1.65, -1.86, 2.84, -0.69, -0.18, 0.85, 0.54, 0.35, -1.05, -0.5, 1.05, 0.1, -1.29,
    -0.25, 0.66, -0.09, -1.6, -1.3, 0.44, 1.69,
  ],
  // Twee groepen die heel ver uit elkaar liggen (voor heel kleine p-waarden)
  uitersteA: [
    2, 2, 1, 1, 1, 1, 1, 1, 1, 3, 2, 1, 1, 3, 2, 2, 1, 1, 2, 1, 1, 1, 2, 1, 2, 2, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1, 2,
    1, 1, 2,
  ],
  uitersteB: [
    4, 5, 4, 4, 5, 5, 5, 4, 3, 5, 3, 5, 4, 5, 4, 5, 5, 4, 5, 5, 5, 5, 4, 5, 4, 5, 5, 4, 5, 4, 4, 5, 4, 5, 5, 5, 5,
    5, 5, 4, 5, 5, 4, 5, 5,
  ],
  // Grote steekproeven met scores 1 tot 5 (300, 400 en 350 respondenten), als cijferreeks
  grootA: cijfers(
    '2113235253334543253233451423133252332325534121222133544333451221152423534235435352323454144224554323' +
    '3453344343244323225334433233341541332253432322542231154535313543542534123424533333214324234443322433' +
    '2122541312522421414332533324412443234544254345233454322344334113443322323332543413425323333552354442',
  ),
  grootB: cijfers(
    '4233552525255414555432422421444543413243335445253133255213523135343453234453554532312532124355443244' +
    '4123452344344433144553455443135541153425315343431543251353134333333352132332145544455545324343435323' +
    '4445443452233455544323255355452145244212532554433355523453144144434534541554311353533525423255342334' +
    '2342455253122233525534415532534333333445343343345445214242344543543524255434334344323253522355534335',
  ),
  grootC: cijfers(
    '2133433242423534244233342325331422352343443233533323355535524312424445322423444235345343433354342344' +
    '5454443332451423542533133443432434331233332545423233252343453433345453323334333435335421355335442222' +
    '5134355135333443144354332224422454132155533325433521313443243223424433452442433244114134333224334541' +
    '43554255233115445445534554433255512232544255344312',
  ),
};

// Kruistabellen (aantallen)
const TABELLEN = {
  tabel2x2: [[10, 20], [30, 5]],
  tabel2x3: [[12, 18, 9], [20, 11, 14]],
  tabel3x3: [[15, 9, 6], [8, 14, 10], [5, 11, 19]],
  tabel4x5: [[23, 11, 8, 15, 4], [9, 17, 12, 6, 10], [14, 14, 20, 9, 7], [5, 8, 6, 19, 13]],
  tabelSterk: [[80, 10, 5], [12, 70, 9], [6, 14, 90]],
};

// Antwoorden per respondent (rij) en vraag (kolom) voor Cronbachs alfa; null = niet ingevuld
const ITEMS = {
  items6x4: [[4, 5, 4, 3], [2, 3, 2, 2], [5, 5, 4, 5], [3, 3, 4, 2], [1, 2, 1, 2], [4, 4, 5, 4]],
  items24x5: [
    [2, 3, 4, 4, 3], [4, 4, 5, 3, 5], [3, null, 2, 2, 3], [3, 5, 5, 2, 5], [3, 5, 4, 4, 4], [3, 3, 3, 1, 3],
    [3, 4, 3, 3, 4], [null, 3, 4, 2, null], [3, 3, 4, 4, 3], [4, 3, 2, 4, 5], [3, 2, 3, 4, 2], [4, 4, 2, 3, 5],
    [3, 5, 3, 3, 3], [5, 5, 4, 5, 5], [3, 2, 4, 2, 2], [2, 2, 2, null, 2], [2, 4, 3, 4, 4], [4, 2, 5, 4, 4],
    [3, 1, 3, 3, 1], [1, 3, 1, 2, 4], [3, 3, 3, 4, 5], [4, 3, 3, 2, 4], [2, 4, 4, 3, 4], [4, 5, 5, 1, 4],
  ],
};

// Controle dat de reeksen uit de generator (zie onder) dezelfde zijn als in Python: [aantal, som]
const LCG_CONTROLE = {
  lcgA: [5000, 15807],
  lcgB: [4000, 12847],
  lcgC: [3000, 9339],
  lcgX: [5000, 248094.06],
  lcgY: [5000, 10420.02812],
};

// ---------- Uitkomsten van SciPy ----------

const VERWACHT = {
  beschrijf: {
    likertA: { n: 12, gemiddelde: 3.5, sd: 1, mediaan: 3.5, min: 2, max: 5 },
    likertB: { n: 17, gemiddelde: 4.176470588235294, sd: 0.8828430011649196, mediaan: 4, min: 2, max: 5 },
    kleinB: { n: 6, gemiddelde: 4.166666666666667, sd: 1.169045194450012, mediaan: 4.5, min: 2, max: 5 },
    normA: { n: 60, gemiddelde: 3.372333333333333, sd: 0.8324445656031758, mediaan: 3.255, min: 1.48, max: 5.09 },
    normB: { n: 75, gemiddelde: 3.909333333333334, sd: 1.2655874966637872, mediaan: 3.96, min: 1.36, max: 7.02 },
    grootB: { n: 400, gemiddelde: 3.45, sd: 1.2108531758779983, mediaan: 3.5, min: 1, max: 5 },
    lcgA: { n: 5000, gemiddelde: 3.1614, sd: 1.205504329373241, mediaan: 3, min: 1, max: 5 },
    lcgY: {
      n: 5000, gemiddelde: 2.084005624, sd: 1.1458411655725564, mediaan: 2.06765, min: 0.01692, max: 4.17662,
    },
  },
  welchT: {
    'likertA|likertB': {
      t: 1.8821293032854352, df: 21.88014942762974, p: 0.07318690383062913, verschil: 0.6764705882352944,
      ciLaag: -0.06915289945632475, ciHoog: 1.4220940759269136,
    },
    'likertB|likertC': {
      t: -4.76242187245517, df: 16.428133311067786, p: 0.00019767097212376104, verschil: -1.7320261437908497,
      ciLaag: -2.5013762624487903, ciHoog: -0.9626760251329092,
    },
    'kleinA|kleinB': {
      t: 1.889089496986631, df: 7.475728723611816, p: 0.09813872646883809, verschil: 1.5666666666666669,
      ciLaag: -0.36935567697711424, ciHoog: 3.5026890103104478,
    },
    'normA|normB': {
      t: 2.9603269095246216, df: 128.53247018717667, p: 0.00366054893115767, verschil: 0.5370000000000008,
      ciLaag: 0.17808550305302517, ciHoog: 0.8959144969469764,
    },
    'normC|normA': {
      t: -1.957547008567258, df: 102.47190067116826, p: 0.05300305121072201, verschil: -0.28700000000000037,
      ciLaag: -0.5777882531118843, ciHoog: 0.003788253111883577,
    },
    'normA|normD': {
      t: 1.3413815011341563, df: 95.07562589974343, p: 0.1829920308994959, verschil: 0.24766666666666648,
      ciLaag: -0.11887741777104865, ciHoog: 0.6142107511043816,
    },
    'grootA|grootB': {
      t: 3.864453050420196, df: 656.2695624980603, p: 0.00012239721675431225, verschil: 0.3500000000000001,
      ciLaag: 0.17215986166679692, ciHoog: 0.5278401383332032,
    },
    'grootA|grootC': {
      t: 2.1172738157760564, df: 625.9136768247367, p: 0.03463039885513803, verschil: 0.19142857142857128,
      ciLaag: 0.013879491048075843, ciHoog: 0.3689776518090667,
    },
    'uitersteA|uitersteB': {
      t: 24.36833955239144, df: 81.35532250641572, p: 3.878582101634406e-39, verschil: 3.1277777777777773,
      ciLaag: 2.8724101667388435, ciHoog: 3.383145388816711,
    },
    'lcgA|lcgB': {
      t: 1.9470500296981827, df: 8494.830150962474, p: 0.051561647999005464, verschil: 0.050349999999999895,
      ciLaag: -0.0003411727259867575, ciHoog: 0.10104117272598655,
    },
    'lcgA|lcgC': {
      t: -1.7536104494847826, df: 6383.258554654752, p: 0.07954526984972356, verschil: -0.0484,
      ciLaag: -0.10250565817864477, ciHoog: 0.005705658178644761,
    },
  },
  cohensD: {
    'likertA|likertB': {
      d: 0.7255524515965002, g: 0.7052098594956637, ciLaag: -0.03562463177844455, ciHoog: 1.446044350769772,
    },
    'likertB|likertC': {
      d: -1.9625591857370597, g: -1.900583632503258, ciLaag: -2.838170102036189, ciHoog: -0.9629971629703268,
    },
    'kleinA|kleinB': {
      d: 1.1737779507874042, g: 1.073168412148484, ciLaag: -0.1009350308451844, ciHoog: 2.247271855142152,
    },
    'normA|normB': {
      d: 0.4905013731581949, g: 0.48773017895956106, ciLaag: 0.14519590105628033, ciHoog: 0.8302644568628418,
    },
    'normC|normA': {
      d: -0.3742358269139336, g: -0.37150417854229906, ciLaag: -0.7584690553615813, ciHoog: 0.015460698276983154,
    },
    'normA|normD': {
      d: 0.2588978103427541, g: 0.2571285770146715, ciLaag: -0.11321460994068278, ciHoog: 0.6274717639700258,
    },
    'grootA|grootB': {
      d: 0.2935890945720105, g: 0.2932735204825386, ciLaag: 0.14295265165596874, ciHoog: 0.44359438930910844,
    },
    'grootA|grootC': {
      d: 0.16701654824595258, g: 0.16682316744906417, ciLaag: 0.012525859244786941, ciHoog: 0.3211204756533414,
    },
    'uitersteA|uitersteB': {
      d: 5.302651078519026, g: 5.254590796840605, ciLaag: 4.359022071415853, ciHoog: 6.150159522265358,
    },
    'lcgA|lcgB': {
      d: 0.04139466035239696, g: 0.04139120993476318, ciLaag: -0.0001868362947640076, ciHoog: 0.08296925616429038,
    },
    'lcgA|lcgC': {
      d: -0.040357302985652495, g: -0.04035351842408965, ciLaag: -0.08561702213057357, ciHoog: 0.004909985282394273,
    },
  },
  mannWhitney: {
    'likertA|likertB': { u: 142, z: 1.8369279219856587, p: 0.06622053665256816, r: 0.34110895167999605 },
    'likertB|likertC': { u: 14.5, z: -3.421605238263836, p: 0.0006225262780566147, r: 0.6710319952968689 },
    'kleinA|kleinB': { u: 23.5, z: 1.5130865455448816, p: 0.1302576767340204, r: 0.45621275880976087 },
    'normA|normB': { u: 2830, z: 2.566125455558708, p: 0.010284162455378876, r: 0.22085691452572884 },
    'normC|normA': { u: 1048.5, z: -1.9491277918378265, p: 0.051280165464504555, r: 0.19021539542405483 },
    'normA|normD': { u: 1915, z: 2.0682779092862984, p: 0.038613897801837, r: 0.1954338925050055 },
    'grootA|grootB': { u: 70107.5, z: 3.9271093821441525, p: 0.0000859728885985737, r: 0.14843078280717065 },
    'grootA|grootC': { u: 57414, z: 2.1253370225292505, p: 0.03355850114112208, r: 0.08336257654490643 },
    'uitersteA|uitersteB': { u: 1798, z: 8.186097445792385, p: 2.698332762041915e-16, r: 0.8879069333319369 },
    'lcgA|lcgB': { u: 10251020, z: 2.105320465587112, p: 0.03526342181147575, r: 0.022192026252738053 },
    'lcgA|lcgC': { u: 7342262.5, z: -1.622105526719152, p: 0.10478075501831514, r: 0.018135691122110626 },
  },
  anova: {
    'likertA|likertB|likertC': {
      f: 10.432953531749249, df1: 2, df2: 35, p: 0.0002793320839353233, etaKwadraat: 0.37349983487750094,
    },
    'kleinA|kleinB|likertC': {
      f: 4.485521717423864, df1: 2, df2: 17, p: 0.027268166924202357, etaKwadraat: 0.34542483660130724,
    },
    'normA|normB|normC|normD': {
      f: 3.088882918013491, df1: 3, df2: 228, p: 0.0279510051024146, etaKwadraat: 0.03905584203554314,
    },
    'normA|normD': {
      f: 1.8672106941504558, df1: 1, df2: 110, p: 0.17458160123682193, etaKwadraat: 0.016691313590141123,
    },
    'grootA|grootB|grootC': {
      f: 7.660426977736047, df1: 2, df2: 1047, p: 0.0004979952967079317, etaKwadraat: 0.014422058927325064,
    },
    'lcgA|lcgB|lcgC': {
      f: 5.777671760626375, df1: 2, df2: 11997, p: 0.0031045358499087587, etaKwadraat: 0.0009622592552306423,
    },
    'likertA|normA|grootA|normC|kleinB': {
      f: 4.457798652713622, df1: 4, df2: 418, p: 0.0015429682859266702, etaKwadraat: 0.04091307559289241,
    },
    'uitersteA|uitersteB|likertC': {
      f: 273.1682427107955, df1: 2, df2: 91, p: 3.448290212156097e-39, etaKwadraat: 0.8572182793837629,
    },
  },
  welchAnova: {
    'likertA|likertB|likertC': { f: 10.993665303974392, df1: 2, df2: 19.689984314772577, p: 0.0006222076776731108 },
    'kleinA|kleinB|likertC': { f: 4.4549855404285665, df1: 2, df2: 8.207099536449643, p: 0.0489760585798053 },
    'normA|normB|normC|normD': { f: 3.0769606432877743, df1: 3, df2: 123.39491908565515, p: 0.030131425937660182 },
    'normA|normD': { f: 1.7993043315849224, df1: 1, df2: 95.07562589974343, p: 0.18299203089949595 },
    'grootA|grootB|grootC': { f: 7.46009721300236, df1: 2, df2: 679.5692285469966, p: 0.000623986453419542 },
    'lcgA|lcgB|lcgC': { f: 5.781858535862923, df1: 2, df2: 7293.065749862742, p: 0.0030971294369918387 },
    'likertA|normA|grootA|normC|kleinB': {
      f: 6.032980720816022, df1: 4, df2: 26.10607737949807, p: 0.0014147502199603848,
    },
    'uitersteA|uitersteB|likertC': {
      f: 290.3486366523209, df1: 2, df2: 20.938465746827212, p: 5.392477440199455e-16,
    },
  },
  kruskalWallis: {
    'likertA|likertB|likertC': {
      h: 13.497435497902964, df: 2, p: 0.001172381945385426, epsilonKwadraat: 0.3647955539973774,
    },
    'kleinA|kleinB|likertC': {
      h: 5.896997598078454, df: 2, p: 0.05241833737130553, epsilonKwadraat: 0.3103682946357081,
    },
    'normA|normB|normC|normD': {
      h: 8.704402790438342, df: 3, p: 0.033490466055882843, epsilonKwadraat: 0.037681397361204946,
    },
    'normA|normD': { h: 4.289849082046121, df: 1, p: 0.03834056869408409, epsilonKwadraat: 0.038647289027442536 },
    'grootA|grootB|grootC': {
      h: 16.034532820474713, df: 2, p: 0.00032972011153832386, epsilonKwadraat: 0.01528554129692537,
    },
    'lcgA|lcgB|lcgC': {
      h: 11.908888834961733, df: 2, p: 0.002594284773554917, epsilonKwadraat: 0.0009924901104226796,
    },
    'likertA|normA|grootA|normC|kleinB': {
      h: 21.84289627978088, df: 4, p: 0.0002153794940034165, epsilonKwadraat: 0.051760417724599245,
    },
    'uitersteA|uitersteB|likertC': {
      h: 74.87738279573188, df: 2, p: 5.502789706626755e-17, epsilonKwadraat: 0.805133148341203,
    },
  },
  pearson: {
    'corX|corY': {
      r: 0.6000242453740587, n: 40, t: 4.6236024233584, df: 38, p: 0.00004270440963450408,
      ciLaag: 0.3548389703658364, ciHoog: 0.7679867605300736,
    },
    'paarX|paarY': {
      r: 0.8846128323988413, n: 30, t: 10.0378897724494, df: 28, p: 8.85332177082024e-11,
      ciLaag: 0.7696208261928161, ciHoog: 0.9440230599318156,
    },
    'negX|negY': {
      r: -0.6743535150377066, n: 25, t: -4.379804920041438, df: 23, p: 0.00021846398550720548,
      ciLaag: -0.8444689752035058, ciHoog: -0.38064975447460236,
    },
    'lcgX|lcgY': {
      r: 0.039000094739306185, n: 5000, t: 2.7592707800782197, df: 4998, p: 0.0058141453709045846,
      ciLaag: 0.011293010183912794, ciHoog: 0.06664733821883646,
    },
    'likertA12|likertB12': {
      r: -0.422115882408869, n: 12, t: -1.472461066690849, df: 10, p: 0.17165800313367852,
      ciLaag: -0.8017831387470975, ciHoog: 0.20031188786577164,
    },
  },
  spearman: {
    'corX|corY': { rho: 0.5619253143178834, n: 40, p: 0.00016121312133643496 },
    'paarX|paarY': { rho: 0.9060443460927118, n: 30, p: 5.7149327587875756e-12 },
    'negX|negY': { rho: -0.6684615384615384, n: 25, p: 0.00025976550011971855 },
    'lcgX|lcgY': { rho: 0.03769539768799701, n: 5000, p: 0.007681723503123584 },
    'likertA12|likertB12': { rho: -0.3892693312411061, n: 12, p: 0.21103388987859412 },
  },
  cronbachAlpha: {
    items6x4: { alpha: 0.9391151992991678, k: 4, n: 6 },
    items24x5: { alpha: 0.5520738377392889, k: 5, n: 21 },
  },
  chiKwadraat: {
    tabel2x2: { chi2: 18.726190476190474, df: 1, p: 0.000015089565704354248, cramersV: 0.5367450401216932 },
    tabel2x3: { chi2: 4.370337907969094, df: 2, p: 0.11245873169828914, cramersV: 0.22809610307439998 },
    tabel3x3: { chi2: 13.997169867947182, df: 4, p: 0.0073040938168066, cramersV: 0.2686081907612976 },
    tabel4x5: { chi2: 40.363985904953424, df: 12, p: 0.00006255903713883055, cramersV: 0.24186469419291842 },
    tabelSterk: { chi2: 304.5945730635871, df: 4, p: 1.105766218597045e-64, cramersV: 0.7172990031393519 },
  },
};

// Kansverdelingen: [argumenten..., uitkomst van SciPy]
const VERDELINGEN = {
  // scipy.special.gammaln(x)
  logGamma: [
    [0.00001, 11.512919692895826],
    [0.1, 2.252712651734206],
    [0.5, 0.5723649429247],
    [1, 0],
    [1.5, -0.12078223763524526],
    [2, 0],
    [3.7, 1.428072326665388],
    [10, 12.801827480081469],
    [100.5, 361.43554046777757],
    [171.3, 708.1149470389971],
    [5000, 37582.62631568535],
    [10000.5, 82104.32265412837],
    [1000000, 12815504.569147611],
    [-0.5, 1.2655121234846454],
    [-2.5, -0.05624371649767401],
    [-10.3, -14.457515440024208],
  ],
  // scipy.special.betainc(a, b, x)
  incBeta: [
    [0.5, 0.5, 0.3, 0.36901011956554536],
    [2, 3, 0.4, 0.5247999999999999],
    [1, 1, 0.25, 0.25],
    [10, 20, 0.1, 0.0003325960345446004],
    [10, 20, 0.5, 0.9692858271300793],
    [50, 50, 0.5, 0.5000000000000007],
    [2.5, 1.5, 0.99, 0.9966351976580841],
    [5000, 0.5, 0.999, 0.0015615791602892836],
    [5000, 0.5, 0.9999, 0.3173105072579534],
    [0.5, 5000, 0.0001, 0.6826894927420731],
    [0.5, 5000, 0.002, 0.9999923324540595],
    [3000, 2000, 0.61, 0.9258494502887021],
    [3000, 2000, 0.58, 0.002027667604028029],
    [2500.5, 1.5, 0.9985, 0.057356270970392566],
    [8, 0.5, 0.2, 5.545447643693234e-7],
    [1.5, 9000, 0.0005, 0.9707423444481517],
    [3, 4, 0, 0],
    [3, 4, 1, 1],
  ],
  // scipy.special.gammainc(a, x)
  incGammaP: [
    [0.5, 0.1, 0.34527915398142317],
    [0.5, 2, 0.9544997361036415],
    [1, 1, 0.6321205588285577],
    [3, 2.5, 0.45618688411667035],
    [10, 5, 0.03182805730620481],
    [10, 15, 0.9301463393005901],
    [100, 90, 0.15822098918643007],
    [100, 120, 0.9721362601094793],
    [5000, 4900, 0.07794495622651393],
    [5000, 5100, 0.9206711189223811],
    [0.001, 0.5, 0.9994399333435291],
    [2.5, 0.000001, 3.0090089629618914e-16],
    [7.5, 40, 0.9999999999301534],
    [3, 0, 0],
  ],
  // scipy.stats.norm.cdf(z)
  normaalCdf: [
    [-37, 5.7255712225239266e-300],
    [-10, 7.61985302416047e-24],
    [-5, 2.866515718791933e-7],
    [-3, 0.0013498980316300933],
    [-1.959963984540054, 0.025],
    [-1, 0.15865525393145707],
    [-0.5, 0.3085375387259869],
    [-1e-8, 0.4999999960105772],
    [0, 0.5],
    [0.3, 0.6179114221889526],
    [1, 0.8413447460685429],
    [1.6448536269514722, 0.95],
    [2.5, 0.9937903346742238],
    [6, 0.9999999990134123],
    [9, 1],
  ],
  // scipy.stats.t.cdf(t, df)
  tCdf: [
    [0, 5, 0.5],
    [1, 1, 0.75],
    [-1, 1, 0.25000000000000006],
    [2.5, 3, 0.9561466764959672],
    [-2.5, 3, 0.04385332350403278],
    [1.96, 10000, 0.9749882398840835],
    [-4, 10000, 0.00003189933441156984],
    [0.01, 10000, 0.5039892565753221],
    [30, 2, 0.9994453686590201],
    [-30, 2.5, 0.00014553235457869768],
    [0.00001, 7, 0.5000038499145083],
    [12.706204736432095, 1, 0.9750000000005044],
    [-100, 4.3, 1.0489634753084725e-8],
    [5, 21.88, 0.9999732575416799],
    [-8.5, 5000, 1.2363879387083673e-17],
    [-2.2281388519862744, 10, 0.025],
    [-30, 9000, 7.531973231981865e-189],
    [-1.3, 0.5, 0.2703073267225601],
  ],
  // scipy.stats.f.sf(f, df1, df2)
  fSf: [
    [1, 1, 1, 0.5000000000000001],
    [3.5, 2, 30, 0.0430321415445366],
    [0.2, 3, 10, 0.8940181114207209],
    [10, 4, 5000, 4.651509399272475e-8],
    [1.02, 5000, 5000, 0.24193621292604092],
    [1.1, 5000, 5000, 0.00037731950519146444],
    [50, 2, 9000, 2.541130869694307e-22],
    [0.001, 2, 30, 0.9990005331319123],
    [2.2, 3.5, 17.25, 0.11795536678286715],
    [1e-10, 1, 10, 0.9999922178323208],
    [300, 1, 3, 0.00041937423065354057],
    [7, 10, 10000, 4.880535671024617e-11],
    [4.2, 1, 21.88, 0.052601153096665056],
    [0, 2, 5, 1],
    [15.3, 2, 8996.4, 2.3257840454425654e-7],
  ],
  // scipy.stats.chi2.sf(x, df)
  chi2Sf: [
    [0.5, 1, 0.47950012218695337],
    [3.841458820694124, 1, 0.04999999999999989],
    [10, 2, 0.006737946999085468],
    [30, 4, 0.000004894437128029217],
    [100, 3, 1.5541594313896026e-21],
    [0.001, 4, 0.9999998750416589],
    [5000, 5000, 0.4973403788923451],
    [5300, 5000, 0.0015958249441347303],
    [4700, 5000, 0.9988765386162006],
    [25, 30, 0.7250318841806004],
    [1e-12, 1, 0.9999992021154392],
    [700, 2, 9.929590396265143e-153],
    [0, 3, 1],
    [12.5, 8, 0.1302503547279264],
    [1400, 6, 2.4225323864784486e-299],
  ],
  // scipy.stats.t.ppf(p, df)
  tKwantiel: [
    [0.975, 1, 12.706204736174694],
    [0.975, 2.5, 3.5746548420036817],
    [0.975, 21.88, 2.0745327272047556],
    [0.975, 10000, 1.960201239890626],
    [0.025, 8, -2.3060041352041662],
    [0.9, 3, 1.637744353696209],
    [0.5, 4, 0],
    [0.999999, 1, 318309.88617359026],
    [0.6, 4, 0.2707222947075976],
    [0.55, 100, 0.12598088204153987],
    [1e-10, 5, -156.82559270889433],
    [0.995, 12, 3.0545395893929013],
    [0.75, 0.7, 1.200330743457406],
  ],
};

// ---------- Hulpjes ----------

/** '34521' -> [3, 4, 5, 2, 1] */
function cijfers(tekst) {
  return Array.from(tekst, Number);
}

// Grote reeksen (duizenden waarden) komen uit een eenvoudige generator met alleen gehele getallen.
// Die geeft in JavaScript en Python precies dezelfde reeks, zodat ze hier niet uitgeschreven hoeven te staan.
function lcg(zaad) {
  let x = zaad;
  return () => (x = (x * 48271) % 2147483647);
}
function lcgScores(zaad, n, grenzen) {
  const volgende = lcg(zaad);
  return Array.from({ length: n }, () => {
    const x = volgende() % 1000;
    return 1 + grenzen.filter((g) => x >= g).length;
  });
}
D.lcgA = lcgScores(12345, 5000, [100, 300, 600, 850]);
D.lcgB = lcgScores(67890, 4000, [90, 280, 570, 830]);
D.lcgC = lcgScores(24680, 3000, [100, 290, 590, 850]);
{
  const x = lcg(1357);
  const ruis = lcg(97531);
  D.lcgX = Array.from({ length: 5000 }, () => (x() % 10007) / 100);
  D.lcgY = D.lcgX.map((v) => 0.002 * v + (ruis() % 1000) / 250);
}
// Paren van 12 respondenten uit de kleine steekproeven
D.likertA12 = D.likertA;
D.likertB12 = D.likertB.slice(0, 12);

const groepen = (sleutel) => sleutel.split('|').map((naam) => D[naam]);

/** Toetsgrootheden, effectgroottes en intervalgrenzen: 1e-9 (relatief bij getallen groter dan 1). */
function bijna(werkelijk, verwacht, waar, marge = 1e-9) {
  assert.equal(typeof werkelijk, 'number', `${waar}: ${werkelijk} is geen getal`);
  assert.ok(
    Math.abs(werkelijk - verwacht) <= marge * Math.max(1, Math.abs(verwacht)),
    `${waar}: ${werkelijk} in plaats van ${verwacht}`,
  );
}

/** p-waarden: hooguit 1e-6 relatief én hooguit 1e-9 absoluut ernaast. */
function bijnaP(werkelijk, verwacht, waar, relatief = 1e-6) {
  assert.equal(typeof werkelijk, 'number', `${waar}: ${werkelijk} is geen getal`);
  assert.ok(werkelijk >= 0 && werkelijk <= 1, `${waar}: ${werkelijk} is geen kans`);
  assert.ok(
    Math.abs(werkelijk - verwacht) <= Math.min(1e-9, relatief * Math.abs(verwacht)),
    `${waar}: ${werkelijk} in plaats van ${verwacht}`,
  );
}

/** Vergelijkt alle velden van een uitkomst met de uitkomst van SciPy. */
function vergelijk(uit, verwacht, waar) {
  assert.ok(uit, `${waar}: geen uitkomst`);
  assert.deepEqual(Object.keys(uit), Object.keys(verwacht), `${waar}: andere velden`);
  for (const [veld, waarde] of Object.entries(verwacht)) {
    if (veld === 'p') bijnaP(uit[veld], waarde, `${waar}.${veld}`);
    else bijna(uit[veld], waarde, `${waar}.${veld}`);
  }
}

/** Voert een functie uit op alle gegevenssets waarvoor een SciPy-uitkomst is vastgelegd. */
function vergelijkAlles(naam, bereken) {
  const gevallen = Object.entries(VERWACHT[naam]);
  assert.ok(gevallen.length > 0);
  for (const [sleutel, verwacht] of gevallen) vergelijk(bereken(sleutel), verwacht, `${naam}(${sleutel})`);
}

/** Geen NaN of Infinity: een uitkomst is null, of elk veld is een eindig getal of null. */
function netjes(uit, waar) {
  if (uit === null) return;
  assert.equal(typeof uit, 'object', `${waar}: ${uit}`);
  for (const [veld, waarde] of Object.entries(uit)) {
    assert.ok(waarde === null || Number.isFinite(waarde), `${waar}.${veld} = ${waarde}`);
  }
}

// ---------- Vergelijking met SciPy ----------

test('de generator geeft dezelfde reeksen als in Python', () => {
  for (const [naam, [aantal, som]] of Object.entries(LCG_CONTROLE)) {
    assert.equal(D[naam].length, aantal, naam);
    bijna(D[naam].reduce((s, x) => s + x, 0), som, `som van ${naam}`, 1e-12);
  }
  assert.equal(D.grootA.length, 300);
  assert.equal(D.grootB.length, 400);
  assert.equal(D.grootC.length, 350);
});

test('beschrijf: aantal, gemiddelde, standaarddeviatie, mediaan, laagste en hoogste', () => {
  vergelijkAlles('beschrijf', (sleutel) => S.beschrijf(D[sleutel]));
});

test('welchT komt overeen met scipy.stats.ttest_ind(equal_var=False)', () => {
  vergelijkAlles('welchT', (sleutel) => S.welchT(...groepen(sleutel)));
});

test('cohensD: Cohens d, Hedges\' g en het interval van g', () => {
  vergelijkAlles('cohensD', (sleutel) => S.cohensD(...groepen(sleutel)));
});

test('mannWhitney komt overeen met scipy.stats.mannwhitneyu (asymptotisch, met continuïteitscorrectie)', () => {
  vergelijkAlles('mannWhitney', (sleutel) => S.mannWhitney(...groepen(sleutel)));
});

test('anova komt overeen met scipy.stats.f_oneway', () => {
  vergelijkAlles('anova', (sleutel) => S.anova(groepen(sleutel)));
});

test('welchAnova komt overeen met de formule van Welch (numpy en statsmodels)', () => {
  vergelijkAlles('welchAnova', (sleutel) => S.welchAnova(groepen(sleutel)));
});

test('kruskalWallis komt overeen met scipy.stats.kruskal', () => {
  vergelijkAlles('kruskalWallis', (sleutel) => S.kruskalWallis(groepen(sleutel)));
});

test('pearson komt overeen met scipy.stats.pearsonr, inclusief het interval', () => {
  vergelijkAlles('pearson', (sleutel) => S.pearson(...groepen(sleutel)));
});

test('spearman komt overeen met scipy.stats.spearmanr', () => {
  vergelijkAlles('spearman', (sleutel) => S.spearman(...groepen(sleutel)));
});

test('cronbachAlpha: standaardformule, alleen volledig ingevulde rijen', () => {
  vergelijkAlles('cronbachAlpha', (sleutel) => S.cronbachAlpha(ITEMS[sleutel]));
  // In de tabel van 24 respondenten hebben er 3 een vraag overgeslagen.
  assert.equal(S.cronbachAlpha(ITEMS.items24x5).n, 21);
  // Rijen die te kort zijn of tekst bevatten tellen ook niet mee.
  const metRommel = [...ITEMS.items6x4, [3, 4], [2, 'weet_niet', 3, 4], [1, 2, 3, NaN], null];
  assert.deepEqual(S.cronbachAlpha(metRommel), S.cronbachAlpha(ITEMS.items6x4));
});

test('chiKwadraat komt overeen met scipy.stats.chi2_contingency(correction=False)', () => {
  vergelijkAlles('chiKwadraat', (sleutel) => S.chiKwadraat(TABELLEN[sleutel]));
});

test('chiKwadraat: rijen en kolommen met totaal 0 tellen niet mee', () => {
  const metNullen = [[12, 0, 18, 9], [0, 0, 0, 0], [20, 0, 11, 14]];
  assert.deepEqual(S.chiKwadraat(metNullen), S.chiKwadraat(TABELLEN.tabel2x3));
  // Gekanteld (rijen en kolommen verwisseld) blijft de uitkomst gelijk.
  const gekanteld = TABELLEN.tabel2x3[0].map((_, j) => TABELLEN.tabel2x3.map((rij) => rij[j]));
  vergelijk(S.chiKwadraat(gekanteld), VERWACHT.chiKwadraat.tabel2x3, 'chiKwadraat(gekanteld)');
});

test('kansverdelingen komen overeen met SciPy', () => {
  // Kansen: relatief 1e-9 (dus ook heel kleine kansen in de staart moeten kloppen).
  for (const naam of ['incBeta', 'incGammaP', 'normaalCdf', 'tCdf', 'fSf', 'chi2Sf']) {
    for (const rij of VERDELINGEN[naam]) {
      const argumenten = rij.slice(0, -1);
      bijnaP(S[naam](...argumenten), rij.at(-1), `${naam}(${argumenten.join(', ')})`, 1e-9);
    }
  }
  for (const [x, verwacht] of VERDELINGEN.logGamma) bijna(S.logGamma(x), verwacht, `logGamma(${x})`, 1e-12);
  for (const [p, df, verwacht] of VERDELINGEN.tKwantiel) bijna(S.tKwantiel(p, df), verwacht, `tKwantiel(${p}, ${df})`);
});

test('kansverdelingen: bekende waarden en randen', () => {
  assert.equal(S.normaalCdf(0), 0.5);
  assert.equal(S.tCdf(0, 7), 0.5);
  assert.equal(S.fSf(0, 3, 12), 1);
  assert.equal(S.chi2Sf(0, 4), 1);
  assert.equal(S.incBeta(2, 3, 0), 0);
  assert.equal(S.incBeta(2, 3, 1), 1);
  assert.equal(S.incGammaP(2, 0), 0);
  assert.equal(S.tKwantiel(0.5, 9), 0);
  bijna(S.normaalCdf(1.959963984540054), 0.975, 'normaalCdf(1,96)', 1e-14);
  bijna(S.logGamma(5), Math.log(24), 'logGamma(5)', 1e-14);
  bijna(S.logGamma(0.5), Math.log(Math.sqrt(Math.PI)), 'logGamma(0,5)', 1e-14);
  // Symmetrie en samenhang tussen de functies
  for (const [t, df] of [[0.3, 2], [1.7, 9.5], [4.2, 300]]) {
    bijna(S.tCdf(t, df) + S.tCdf(-t, df), 1, `tCdf(±${t}, ${df})`, 1e-14);
    bijna(S.fSf(t * t, 1, df), 2 * S.tCdf(-t, df), `F = t² bij df ${df}`, 1e-12);
    bijna(S.tCdf(S.tKwantiel(0.9, df), df), 0.9, `tKwantiel en tCdf bij df ${df}`, 1e-12);
    bijna(S.tKwantiel(0.2, df), -S.tKwantiel(0.8, df), `tKwantiel symmetrisch bij df ${df}`, 1e-12);
  }
  bijna(S.chi2Sf(1.7 * 1.7, 1), 2 * S.normaalCdf(-1.7), 'chi² met df 1 = z²', 1e-13);
  bijna(S.incBeta(2.5, 4, 0.3) + S.incBeta(4, 2.5, 0.7), 1, 'incBeta gespiegeld', 1e-13);
  bijna(S.incGammaP(1, 2.5), 1 - Math.exp(-2.5), 'incGammaP(1, x) = 1 − e^−x', 1e-14);
  // Volgorde van de argumenten: incBeta(a, b, x) en incGammaP(a, x), net als in SciPy.
  bijna(S.incBeta(2, 1, 0.5), 0.25, 'incBeta(2, 1, x) = x²', 1e-14);
  bijna(S.incBeta(1, 2, 0.5), 0.75, 'incBeta(1, 2, x) = 1 − (1 − x)²', 1e-14);
  // Heel ver in de staart blijft het een nette kans.
  assert.equal(S.normaalCdf(-1e200), 0);
  assert.equal(S.normaalCdf(1e200), 1);
  assert.equal(S.tCdf(-1e200, 3), 0);
  assert.equal(S.fSf(1e308, 5, 5), 0);
  assert.equal(S.chi2Sf(1e308, 2), 0);
  assert.equal(S.chi2Sf(-1, 2), 1);
});

test('kansverdelingen: ongeldige invoer geeft null', () => {
  const ongeldig = [
    S.logGamma(0), S.logGamma(-3), S.logGamma(NaN), S.logGamma('2'),
    S.incBeta(0, 1, 0.5), S.incBeta(1, -1, 0.5), S.incBeta(1, 1, 1.5), S.incBeta(1, 1, -0.1), S.incBeta(1, 1, NaN),
    S.incGammaP(0, 2), S.incGammaP(-1, 2), S.incGammaP(1, -2), S.incGammaP(1, Infinity),
    S.normaalCdf(NaN), S.normaalCdf(Infinity), S.normaalCdf(null), S.normaalCdf(),
    S.tCdf(1, 0), S.tCdf(1, -2), S.tCdf(NaN, 3), S.tCdf(1, Infinity), S.tCdf(1),
    S.fSf(1, 0, 3), S.fSf(1, 3, 0), S.fSf(NaN, 1, 3), S.fSf(Infinity, 1, 3),
    S.chi2Sf(1, 0), S.chi2Sf('1', 2), S.chi2Sf(NaN, 2),
    S.tKwantiel(0, 3), S.tKwantiel(1, 3), S.tKwantiel(0.9, 0), S.tKwantiel(NaN, 3),
  ];
  ongeldig.forEach((uit, i) => assert.equal(uit, null, `geval ${i + 1}`));
});

// ---------- Richting, samenhang en ongeldige waarden ----------

test('twee groepen: positief betekent dat b hoger ligt dan a, en omdraaien spiegelt de uitkomst', () => {
  const laag = D.likertC;
  const hoog = D.likertB;
  const t = S.welchT(laag, hoog);
  const terug = S.welchT(hoog, laag);
  assert.ok(t.verschil > 0 && t.t > 0);
  assert.ok(t.ciLaag < t.verschil && t.verschil < t.ciHoog);
  bijna(terug.t, -t.t, 't');
  bijna(terug.verschil, -t.verschil, 'verschil');
  bijna(terug.ciLaag, -t.ciHoog, 'ciLaag');
  bijna(terug.ciHoog, -t.ciLaag, 'ciHoog');
  bijna(terug.p, t.p, 'p', 1e-12);
  bijna(terug.df, t.df, 'df');

  const d = S.cohensD(laag, hoog);
  const dTerug = S.cohensD(hoog, laag);
  assert.ok(d.d > 0 && d.g > 0 && Math.abs(d.g) < Math.abs(d.d));
  assert.ok(d.ciLaag < d.g && d.g < d.ciHoog);
  bijna(dTerug.d, -d.d, 'd');
  bijna(dTerug.ciLaag, -d.ciHoog, 'ciLaag van g');

  const u = S.mannWhitney(laag, hoog);
  const uTerug = S.mannWhitney(hoog, laag);
  assert.ok(u.z > 0);
  assert.ok(u.u > (laag.length * hoog.length) / 2);
  bijna(u.u + uTerug.u, laag.length * hoog.length, 'U van a + U van b = n1·n2');
  bijna(uTerug.z, -u.z, 'z');
  bijna(uTerug.p, u.p, 'p', 1e-12);
  bijna(u.r, Math.abs(u.z) / Math.sqrt(laag.length + hoog.length), 'r');
});

test('mannWhitney: u telt de paren waarin b hoger is dan a (gelijken tellen half)', () => {
  const a = [1, 2, 2, 3, 5];
  const b = [2, 4, 4, 5, 5, 5];
  let paren = 0;
  for (const x of a) for (const y of b) paren += y > x ? 1 : y === x ? 0.5 : 0;
  assert.equal(S.mannWhitney(a, b).u, paren);
  // Volledig gescheiden groepen: u = n1·n2
  assert.equal(S.mannWhitney([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]).u, 25);
  // Zit de rangsom precies op de verwachting, dan is z 0 en p 1.
  assert.deepEqual(S.mannWhitney([1, 2, 3, 4], [1, 2, 3, 4]), { u: 8, z: 0, p: 1, r: 0 });
});

test('welchAnova met twee groepen is gelijk aan welchT (F = t²)', () => {
  for (const [a, b] of [[D.likertA, D.likertB], [D.normA, D.normB], [D.grootA, D.grootC]]) {
    const t = S.welchT(a, b);
    const f = S.welchAnova([a, b]);
    bijna(f.f, t.t * t.t, 'F = t²');
    bijna(f.df2, t.df, 'df2 = df');
    bijnaP(f.p, t.p, 'p');
    assert.equal(f.df1, 1);
  }
});

test('de volgorde van de groepen maakt niet uit bij anova, welchAnova en kruskalWallis', () => {
  const heen = [D.likertA, D.normA, D.kleinB, D.grootA];
  const terug = [...heen].reverse();
  for (const naam of ['anova', 'welchAnova', 'kruskalWallis']) {
    const een = S[naam](heen);
    const twee = S[naam](terug);
    for (const veld of Object.keys(een)) bijna(twee[veld], een[veld], `${naam}.${veld}`);
  }
});

test('correlaties: richting, omwisselen van x en y, en volmaakte samenhang', () => {
  const p = S.pearson(D.corX, D.corY);
  assert.ok(p.ciLaag < p.r && p.r < p.ciHoog);
  assert.deepEqual(S.pearson(D.corY, D.corX), p);
  assert.ok(S.pearson(D.negX, D.negY).r < 0);
  assert.ok(S.spearman(D.negX, D.negY).rho < 0);
  assert.deepEqual(S.spearman(D.corY, D.corX), S.spearman(D.corX, D.corY));
  // Spearman is Pearson op de rangnummers: een stijgende, niet-rechte lijn geeft rho = 1.
  assert.deepEqual(S.spearman([1, 2, 3, 4, 10], [1, 4, 9, 16, 1000]), { rho: 1, n: 5, p: 0 });
  assert.deepEqual(S.spearman([1, 2, 3, 4, 10], [9, 7, 5, 3, 1]), { rho: -1, n: 5, p: 0 });
  // Volmaakte samenhang: t bestaat niet (delen door nul), p is 0.
  assert.deepEqual(S.pearson([1, 2, 3, 4], [2, 4, 6, 8]), { r: 1, n: 4, t: null, df: 2, p: 0, ciLaag: 1, ciHoog: 1 });
  assert.deepEqual(
    S.pearson([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]),
    { r: -1, n: 5, t: null, df: 3, p: 0, ciLaag: -1, ciHoog: -1 },
  );
  // Bij precies 3 paren bestaat het interval niet.
  const drie = S.pearson([1, 2, 3], [3, 5, 4]);
  bijna(drie.r, 0.5, 'r bij 3 paren');
  assert.equal(drie.ciLaag, null);
  assert.equal(drie.ciHoog, null);
});

test('alleen eindige getallen tellen mee; de rest wordt overgeslagen', () => {
  const rommel = (xs) =>
    [null, ...xs.slice(0, 3), 'weet_niet', NaN, undefined, ...xs.slice(3), Infinity, '4', {}, -Infinity];
  const a = rommel(D.likertA);
  const b = rommel(D.likertB);
  const c = rommel(D.likertC);
  assert.deepEqual(S.beschrijf(a), S.beschrijf(D.likertA));
  assert.deepEqual(S.welchT(a, b), S.welchT(D.likertA, D.likertB));
  assert.deepEqual(S.cohensD(a, b), S.cohensD(D.likertA, D.likertB));
  assert.deepEqual(S.mannWhitney(a, b), S.mannWhitney(D.likertA, D.likertB));
  // Lege groepen en groepen met alleen ongeldige waarden vervallen.
  const drie = [D.likertA, D.likertB, D.likertC];
  for (const naam of ['anova', 'welchAnova', 'kruskalWallis']) {
    assert.deepEqual(S[naam]([a, [], b, [null, 'x'], c]), S[naam](drie), naam);
  }
  // Bij paren vervalt het hele paar als een van de twee ontbreekt.
  const x = [1, 2, null, 4, 5, 6, 'x', 8];
  const y = [2, 1, 3, NaN, 5, 7, 9, 6];
  assert.deepEqual(S.pearson(x, y), S.pearson([1, 2, 5, 6, 8], [2, 1, 5, 7, 6]));
  assert.deepEqual(S.spearman(x, y), S.spearman([1, 2, 5, 6, 8], [2, 1, 5, 7, 6]));
  assert.equal(S.pearson(x, y).n, 5);
  // Andere soorten lijsten werken ook.
  assert.deepEqual(S.beschrijf(new Float64Array([1, 2, 4])), S.beschrijf([1, 2, 4]));
  assert.deepEqual(S.beschrijf(new Set([1, 2, 4])), S.beschrijf([1, 2, 4]));
});

test('beschrijf: mediaan, één waarde en gelijke waarden', () => {
  assert.deepEqual(S.beschrijf([5, 1, 3]), { n: 3, gemiddelde: 3, sd: 2, mediaan: 3, min: 1, max: 5 });
  assert.equal(S.beschrijf([4, 1, 3, 2]).mediaan, 2.5);
  assert.deepEqual(S.beschrijf([4]), { n: 1, gemiddelde: 4, sd: null, mediaan: 4, min: 4, max: 4 });
  // Geen afrondingsruis bij gelijke waarden: (0,1 + 0,1 + 0,1) / 3 is in de computer niet precies 0,1.
  assert.deepEqual(S.beschrijf([0.1, 0.1, 0.1]), { n: 3, gemiddelde: 0.1, sd: 0, mediaan: 0.1, min: 0.1, max: 0.1 });
  // De invoer wordt niet gewijzigd (ook niet gesorteerd).
  const invoer = [3, 1, 2];
  S.beschrijf(invoer);
  S.mannWhitney(invoer, [2, 5, 4]);
  S.kruskalWallis([invoer, [2, 5, 4]]);
  S.spearman(invoer, [2, 5, 4]);
  assert.deepEqual(invoer, [3, 1, 2]);
});

// ---------- Randgevallen: null in plaats van NaN of Infinity ----------

test('lege invoer of iets anders dan een lijst geeft null', () => {
  for (const leeg of [[], null, undefined, 'tekst', 5, {}, [null, 'x', NaN]]) {
    assert.equal(S.beschrijf(leeg), null);
    assert.equal(S.welchT(leeg, [1, 2, 3]), null);
    assert.equal(S.welchT([1, 2, 3], leeg), null);
    assert.equal(S.cohensD(leeg, [1, 2, 3]), null);
    assert.equal(S.mannWhitney(leeg, [1, 2, 3]), null);
    assert.equal(S.mannWhitney([1, 2, 3], leeg), null);
    assert.equal(S.anova(leeg), null);
    assert.equal(S.welchAnova(leeg), null);
    assert.equal(S.kruskalWallis(leeg), null);
    assert.equal(S.anova([[1, 2, 3], leeg]), null);
    assert.equal(S.kruskalWallis([[1, 2, 3], leeg]), null);
    assert.equal(S.pearson(leeg, [1, 2, 3]), null);
    assert.equal(S.spearman([1, 2, 3], leeg), null);
    assert.equal(S.cronbachAlpha(leeg), null);
    assert.equal(S.chiKwadraat(leeg), null);
  }
});

test('te weinig waarden geeft null', () => {
  assert.equal(S.welchT([3], [1, 2, 4]), null);
  assert.equal(S.welchT([1, 2, 4], [3]), null);
  assert.equal(S.cohensD([3], [1, 2, 4]), null);
  assert.equal(S.cohensD([1, 2, 4], [3]), null);
  assert.equal(S.anova([[1, 2, 3]]), null, 'één groep');
  assert.equal(S.anova([[1], [2]]), null, 'evenveel waarden als groepen');
  assert.equal(S.welchAnova([[1, 2, 3]]), null, 'één groep');
  assert.equal(S.welchAnova([[1, 2, 3], [5]]), null, 'groep met één waarde');
  assert.equal(S.kruskalWallis([[1, 2, 3]]), null, 'één groep');
  assert.equal(S.pearson([1, 2], [3, 5]), null);
  assert.equal(S.spearman([1, 2], [3, 5]), null);
  assert.equal(S.pearson([1, 2, 3, 4], [1, 2, 3]), null, 'ongelijke lengte');
  assert.equal(S.spearman([1, 2, 3, 4], [1, 2, 3]), null, 'ongelijke lengte');
  assert.equal(S.cronbachAlpha([[1], [2], [3]]), null, 'één item');
  assert.equal(S.cronbachAlpha([[1, 2, 3]]), null, 'één respondent');
  assert.equal(S.cronbachAlpha([[1, 2], [null, 3], [2, null]]), null, 'één volledige rij');
  assert.equal(S.chiKwadraat([[1, 2, 3]]), null, 'één rij');
  assert.equal(S.chiKwadraat([[1], [2]]), null, 'één kolom');
  // anova kan wel overweg met een groep van één waarde, zolang er meer waarden dan groepen zijn.
  bijna(S.anova([[1, 2, 3], [5]]).f, 6.75, 'anova met een groep van één');
});

test('geen spreiding (alle waarden gelijk) geeft null', () => {
  // Ook met kommagetallen, waar het gemiddelde afrondingsruis kan geven.
  for (const w of [3, 0.1, 4.35, -2.7, 1e-12, 123456.789]) {
    const gelijk = [w, w, w, w, w];
    assert.equal(S.welchT(gelijk, gelijk), null, `welchT ${w}`);
    assert.equal(S.welchT(gelijk, [w + 1, w + 1, w + 1]), null, `welchT twee constante groepen ${w}`);
    assert.equal(S.cohensD(gelijk, gelijk), null, `cohensD ${w}`);
    assert.equal(S.cohensD(gelijk, [w + 1, w + 1, w + 1]), null, `cohensD twee constante groepen ${w}`);
    assert.equal(S.mannWhitney(gelijk, gelijk), null, `mannWhitney ${w}`);
    assert.equal(S.anova([gelijk, gelijk, gelijk]), null, `anova ${w}`);
    assert.equal(S.anova([gelijk, [w + 1, w + 1]]), null, `anova constante groepen ${w}`);
    assert.equal(S.welchAnova([gelijk, gelijk]), null, `welchAnova ${w}`);
    assert.equal(S.welchAnova([[1, 2, 3, 4], gelijk]), null, `welchAnova één constante groep ${w}`);
    assert.equal(S.kruskalWallis([gelijk, gelijk]), null, `kruskalWallis ${w}`);
    assert.equal(S.pearson(gelijk, [1, 2, 3, 4, 5]), null, `pearson constante x ${w}`);
    assert.equal(S.pearson([1, 2, 3, 4, 5], gelijk), null, `pearson constante y ${w}`);
    assert.equal(S.spearman(gelijk, [1, 2, 3, 4, 5]), null, `spearman constante x ${w}`);
    assert.equal(S.spearman([1, 2, 3, 4, 5], gelijk), null, `spearman constante y ${w}`);
    assert.equal(S.cronbachAlpha([[w, w, w], [w, w, w], [w, w, w]]), null, `cronbachAlpha ${w}`);
    assert.equal(S.beschrijf(gelijk).sd, 0);
  }
  assert.equal(S.cronbachAlpha([[1, 5], [5, 1], [3, 3]]), null, 'somscores allemaal gelijk');
});

test('geen spreiding in maar één van beide groepen: de toets kan nog wel', () => {
  const t = S.welchT([2, 2, 2], [3, 4, 5]);
  bijna(t.t, 2 * Math.sqrt(3), 't');
  bijna(t.df, 2, 'df');
  assert.ok(S.cohensD([2, 2, 2], [3, 4, 5]).d > 0);
  // Gelijke gemiddelden: verschil 0, p 1.
  const nul = S.welchT([1, 2, 3], [1, 2, 3]);
  assert.equal(nul.t, 0);
  assert.equal(nul.p, 1);
  assert.equal(S.cohensD([1, 2, 3], [1, 2, 3]).d, 0);
  const f = S.anova([[1, 2, 3], [1, 2, 3], [2, 2, 2]]);
  assert.deepEqual(f, { f: 0, df1: 2, df2: 6, p: 1, etaKwadraat: 0 });
  assert.deepEqual(S.kruskalWallis([[1, 2, 3], [1, 2, 3]]), { h: 0, df: 1, p: 1, epsilonKwadraat: 0 });
});

test('chiKwadraat: ongeldige tabellen en bijzondere gevallen', () => {
  assert.equal(S.chiKwadraat([[1, 2, 3], [0, 0, 0]]), null, 'één gevulde rij');
  assert.equal(S.chiKwadraat([[1, 0], [4, 0]]), null, 'één gevulde kolom');
  assert.equal(S.chiKwadraat([[0, 0], [0, 0]]), null, 'alles nul');
  assert.equal(S.chiKwadraat([[1, -2], [3, 4]]), null, 'negatief aantal');
  assert.equal(S.chiKwadraat([[1, NaN], [3, 4]]), null, 'NaN');
  assert.equal(S.chiKwadraat([[1, null], [3, 4]]), null, 'lege cel');
  assert.equal(S.chiKwadraat([[1, 2], [3]]), null, 'rijen van ongelijke lengte');
  assert.equal(S.chiKwadraat([[1, 2], 'ab']), null, 'rij is geen lijst');
  // Precies evenredige tabel: geen samenhang.
  assert.deepEqual(S.chiKwadraat([[10, 20], [20, 40]]), { chi2: 0, df: 1, p: 1, cramersV: 0 });
  // Volledige samenhang: V = 1.
  const vol = S.chiKwadraat([[10, 0], [0, 10]]);
  bijna(vol.chi2, 20, 'chi2');
  bijna(vol.cramersV, 1, 'V');
});

test('cronbachAlpha: bekende gevallen', () => {
  // Twee identieke items: alfa = 1.
  bijna(S.cronbachAlpha([[1, 1], [2, 2], [5, 5]]).alpha, 1, 'identieke items');
  // Items die tegen elkaar in gaan: alfa is negatief (en dus geen bruikbare schaal).
  assert.ok(S.cronbachAlpha([[1, 5], [5, 2], [3, 3]]).alpha < 0);
});

test('er komt nooit NaN of Infinity uit, wat de invoer ook is', () => {
  const lijsten = [
    [], [1], [2, 2], [1, 2], [1, 2, 3], [5, 5, 5, 5], [0.1, 0.1, 0.1], [1e308, 1e308, -1e308],
    [1e-320, 2e-320, 3e-320], [1, 2, 3, 4, 1000000], [-1, -2, -3], [0, 0, 0, 1], [1e154, 2e154, 3e154],
    [NaN, 1, Infinity, 2], [3, null, 'x', 4, 5], [1e-200, 2e-200, 4e-200], [7, 7, 7, 7, 7, 7, 8],
  ];
  for (const a of lijsten) {
    netjes(S.beschrijf(a), `beschrijf(${JSON.stringify(a)})`);
    netjes(S.cronbachAlpha([a, a]), 'cronbachAlpha');
    netjes(S.cronbachAlpha(lijsten.filter((l) => l.length === a.length)), 'cronbachAlpha');
    netjes(S.chiKwadraat([a, a]), 'chiKwadraat');
    for (const b of lijsten) {
      const waar = `(${JSON.stringify(a)}, ${JSON.stringify(b)})`;
      netjes(S.welchT(a, b), `welchT${waar}`);
      netjes(S.cohensD(a, b), `cohensD${waar}`);
      netjes(S.mannWhitney(a, b), `mannWhitney${waar}`);
      netjes(S.anova([a, b]), `anova${waar}`);
      netjes(S.welchAnova([a, b]), `welchAnova${waar}`);
      netjes(S.kruskalWallis([a, b]), `kruskalWallis${waar}`);
      netjes(S.anova([a, b, a]), `anova met drie groepen${waar}`);
      netjes(S.welchAnova([a, b, [1, 2, 4]]), `welchAnova met drie groepen${waar}`);
      netjes(S.kruskalWallis([a, b, [1, 2, 4]]), `kruskalWallis met drie groepen${waar}`);
      netjes(S.pearson(a, b), `pearson${waar}`);
      netjes(S.spearman(a, b), `spearman${waar}`);
      if (a.length === b.length) netjes(S.chiKwadraat([a, b]), `chiKwadraat${waar}`);
    }
  }
});

test('grote aantallen: 5.000 waarden per groep rekent vlot en geeft nette uitkomsten', () => {
  const start = performance.now();
  netjes(S.welchT(D.lcgA, D.lcgB), 'welchT');
  netjes(S.mannWhitney(D.lcgA, D.lcgB), 'mannWhitney');
  netjes(S.kruskalWallis([D.lcgA, D.lcgB, D.lcgC]), 'kruskalWallis');
  netjes(S.spearman(D.lcgX, D.lcgY), 'spearman');
  assert.ok(performance.now() - start < 2000, 'duurt te lang');
});

// ---------- Effectgrootte in woorden ----------

test('effectGrootte: grenzen per soort', () => {
  const verwacht = {
    d: [[0, 'verwaarloosbaar'], [0.19, 'verwaarloosbaar'], [0.2, 'klein'], [0.49, 'klein'], [0.5, 'middelgroot'],
      [0.79, 'middelgroot'], [0.8, 'groot'], [2.4, 'groot']],
    r: [[0, 'verwaarloosbaar'], [0.09, 'verwaarloosbaar'], [0.1, 'klein'], [0.29, 'klein'], [0.3, 'middelgroot'],
      [0.49, 'middelgroot'], [0.5, 'groot'], [1, 'groot']],
    eta2: [[0, 'verwaarloosbaar'], [0.009, 'verwaarloosbaar'], [0.01, 'klein'], [0.059, 'klein'], [0.06, 'middelgroot'],
      [0.139, 'middelgroot'], [0.14, 'groot'], [0.9, 'groot']],
    v: [[0, 'verwaarloosbaar'], [0.09, 'verwaarloosbaar'], [0.1, 'klein'], [0.29, 'klein'], [0.3, 'middelgroot'],
      [0.49, 'middelgroot'], [0.5, 'groot'], [1, 'groot']],
  };
  verwacht.epsilon2 = verwacht.eta2;
  for (const [soort, gevallen] of Object.entries(verwacht)) {
    for (const [waarde, woord] of gevallen) {
      assert.equal(S.effectGrootte(waarde, soort), woord, `${soort} ${waarde}`);
      // Het teken maakt niet uit.
      assert.equal(S.effectGrootte(-waarde, soort), woord, `${soort} −${waarde}`);
    }
  }
  // Hedges' g volgt de grenzen van d, Spearmans rho die van r.
  assert.equal(S.effectGrootte(0.6, 'g'), 'middelgroot');
  assert.equal(S.effectGrootte(-0.35, 'rho'), 'middelgroot');
});

test('effectGrootte: onbekende soort of geen getal geeft null', () => {
  assert.equal(S.effectGrootte(0.3, 'iets'), null);
  assert.equal(S.effectGrootte(0.3), null);
  assert.equal(S.effectGrootte(0.3, 'toString'), null);
  assert.equal(S.effectGrootte(NaN, 'd'), null);
  assert.equal(S.effectGrootte(null, 'd'), null);
  assert.equal(S.effectGrootte(undefined, 'r'), null);
  assert.equal(S.effectGrootte(Infinity, 'r'), null);
  assert.equal(S.effectGrootte('0.5', 'd'), null);
});

test('de uitkomsten sluiten aan op effectGrootte', () => {
  assert.equal(S.effectGrootte(S.cohensD(D.likertB, D.likertC).d, 'd'), 'groot');
  assert.equal(S.effectGrootte(S.cohensD(D.grootA, D.grootC).d, 'd'), 'verwaarloosbaar');
  assert.equal(S.effectGrootte(S.mannWhitney(D.likertA, D.likertB).r, 'r'), 'middelgroot');
  assert.equal(S.effectGrootte(S.anova([D.likertA, D.likertB, D.likertC]).etaKwadraat, 'eta2'), 'groot');
  const epsilon2 = S.kruskalWallis([D.grootA, D.grootB, D.grootC]).epsilonKwadraat;
  assert.equal(S.effectGrootte(epsilon2, 'epsilon2'), 'klein');
  assert.equal(S.effectGrootte(S.chiKwadraat(TABELLEN.tabel2x2).cramersV, 'v'), 'groot');
  assert.equal(S.effectGrootte(S.pearson(D.lcgX, D.lcgY).r, 'r'), 'verwaarloosbaar');
});

test('de module biedt alle afgesproken functies', () => {
  const afgesproken = [
    'beschrijf', 'welchT', 'cohensD', 'mannWhitney', 'anova', 'welchAnova', 'kruskalWallis', 'pearson', 'spearman',
    'cronbachAlpha', 'chiKwadraat', 'effectGrootte',
    'normaalCdf', 'tCdf', 'fSf', 'chi2Sf', 'logGamma', 'incBeta', 'incGammaP', 'tKwantiel',
  ];
  for (const naam of afgesproken) assert.equal(typeof S[naam], 'function', naam);
});

// ---------- Uitbreiding (BOUWPLAN P1): aanpassingstoets, foutmarge en gedeelde hulpjes ----------
// Verwachte waarden berekend met SciPy 1.18.1:
//   aanpassingsToets  scipy.stats.chisquare(waargenomen, f_exp = n · P / ΣP)
//   foutmarge         100 · norm.ppf(0.975) · √(0,25 / n) · √((N − n) / (N − 1))

test('aanpassingsToets komt overeen met scipy.stats.chisquare (respons per afdeling tegen het personeel)', () => {
  const uit = S.aanpassingsToets([18, 9, 6, 7], [60, 20, 25, 15]);
  assert.deepEqual(Object.keys(uit), ['chi2', 'df', 'p', 'n', 'verwacht', 'kleinste_verwacht']);
  bijna(uit.chi2, 2.47, 'chi2');
  assert.equal(uit.df, 3);
  bijnaP(uit.p, 0.4807371601075049, 'p');
  assert.ok(Math.abs(uit.p - 0.480737) <= 1e-6);
  assert.equal(uit.n, 40);
  [20, 6.666666666666667, 8.333333333333334, 5].forEach((e, i) => bijna(uit.verwacht[i], e, `verwacht ${i}`));
  bijna(uit.kleinste_verwacht, 5, 'kleinste verwacht');
  // Na samenvoegen van kleine groepen (zoals het Overzicht doet): [18, 9, 3+1+9] tegen [60, 20, 10+5+25].
  const samen = S.aanpassingsToets([18, 9, 13], [60, 20, 40]);
  bijna(samen.chi2, 1.0249999999999997, 'chi2 samengevoegd');
  assert.equal(samen.df, 2);
  bijnaP(samen.p, 0.5989962148511054, 'p samengevoegd');
});

test('aanpassingsToets: alleen toetsen als het verantwoord is', () => {
  // Een verwacht aantal onder de 5 (Cochran): niet toetsen.
  assert.deepEqual(S.aanpassingsToets([10, 3], [80, 20]), { reden: 'klein' });
  assert.deepEqual(S.aanpassingsToets([12, 2], [5, 0]), { reden: 'klein' }); // groep zonder populatie maar met respondenten
  assert.deepEqual(S.aanpassingsToets([0, 0], [50, 50]), { reden: 'klein' });
  assert.deepEqual(S.aanpassingsToets([20], [50]), { reden: 'te_weinig_groepen' });
  assert.deepEqual(S.aanpassingsToets([20, 0], [50, 0]), { reden: 'te_weinig_groepen' });
  // Een groep met 0 respondenten en 0 in de populatie telt niet mee, de rest blijft in dezelfde volgorde.
  const uit = S.aanpassingsToets([18, 0, 9, 13], [60, 0, 20, 40]);
  assert.equal(uit.df, 2);
  bijna(uit.chi2, 1.0249999999999997, 'chi2');
  assert.deepEqual(uit.verwacht.map((x) => Math.round(x * 1000) / 1000), [20, 0, 6.667, 13.333]);
  // Ongeldige invoer.
  assert.equal(S.aanpassingsToets([1, 2], [3]), null);
  assert.equal(S.aanpassingsToets([1, -2], [3, 4]), null);
  assert.equal(S.aanpassingsToets([1, Number.NaN], [3, 4]), null);
  assert.equal(S.aanpassingsToets(null, [3, 4]), null);
});

test('foutmarge: 95% in procentpunten met correctie voor de grootte van de organisatie', () => {
  const m = S.foutmarge(62, 130);
  assert.ok(Math.abs(m - 9.0361) <= 1e-3, `${m}`);
  bijna(m, 9.036117130324751, 'foutmarge 62 van 130');
  bijna(S.foutmarge(100, 1000), 9.3015774365656, 'foutmarge 100 van 1000');
  assert.equal(S.foutmarge(130, 130), null); // iedereen deed mee: geen steekproef
  assert.equal(S.foutmarge(140, 130), null);
  assert.equal(S.foutmarge(62, null), null); // populatie onbekend
  assert.equal(S.foutmarge(62, undefined), null);
  assert.equal(S.foutmarge(0, 130), null);
  assert.equal(S.foutmarge(6.5, 130), null);
});

test('gedeelde hulpjes zijn beschikbaar voor de werkbank en het rapport', () => {
  assert.deepEqual(S.momenten([2, 4, 6]), { n: 3, m: 4, ss: 8, min: 2, max: 6 });
  assert.deepEqual(S.rangnummers([10, 20, 20, 5]), { rangen: [2, 3.5, 3.5, 1], knopen: 6 });
  assert.ok(S.EFFECT_GRENZEN instanceof Map);
  assert.deepEqual(S.EFFECT_GRENZEN.get('d'), [0.2, 0.5, 0.8]);
  for (const naam of ['aanpassingsToets', 'foutmarge', 'momenten', 'rangnummers']) assert.equal(typeof S[naam], 'function', naam);
});
