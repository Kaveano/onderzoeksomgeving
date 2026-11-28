"""Referentiewaarden voor de integratiefixes J2/G1, J3, G2 en G4 (werkbank), berekend met SciPy.

Gebruik (vanuit de hoofdmap van het project):
    python3 -I test/referentie/integratie_statistiek.py > test/fixtures/integratie-statistiek.json

De gegevens zijn verzonnen (numpy default_rng met zaad 20261128): één vragenlijst met 60 respondenten, de
achtergrondvragen leeftijd (geordend, met "Dat zeg ik liever niet") en leidinggevend (ja/nee), drie schaalvragen van
thema 10, een rapportcijfer in thema 10 en drie schaalvragen van thema 11 (3 respondenten beantwoordden daarvan maar
één vraag: B7). test/integratie-statistiek.test.mjs bouwt hieruit de export en vergelijkt de werkbank met deze waarden.
npm test draait dit script niet; het JSON-bestand wordt meegeleverd.
"""

import json
import math
import platform

import numpy as np
import scipy
from scipy import stats

ZAAD = 20261128
rng = np.random.default_rng(ZAAD)
N = 60

# Leeftijd: o1 jong, o2 midden, o3 oud, o4 "Dat zeg ik liever niet" (10 keer). Leidinggevend: 22 ja, 38 nee.
leeftijd = np.array(["o1"] * 18 + ["o2"] * 15 + ["o3"] * 17 + ["o4"] * 10)
rng.shuffle(leeftijd)
leiding = np.array(["ja"] * 22 + ["nee"] * 38)
rng.shuffle(leiding)
code = {"o1": 1, "o2": 2, "o3": 3, "o4": 4}

rijen = []
for i in range(N):
    basis = 2.4 + 0.35 * (code[leeftijd[i]] if leeftijd[i] != "o4" else 2) + (0.3 if leiding[i] == "ja" else 0.0)
    q = [int(min(5, max(1, round(basis + rng.normal(0, 0.9))))) for _ in range(3)]
    rij = {"leeftijd": str(leeftijd[i]), "leiding": str(leiding[i]), "q2": q[0], "q3": q[1], "q4": q[2],
           "q5": int(rng.integers(1, 11))}
    t11 = [int(rng.integers(1, 6)) for _ in range(3)]
    rij["q6"] = t11[0]
    if i >= 3:  # de eerste drie beantwoordden maar één vraag van thema 11 (B7: 1 tot 4 weggevallen)
        rij["q7"] = t11[1]
        rij["q8"] = t11[2]
    rijen.append(rij)

t10 = np.array([(r["q2"] + r["q3"] + r["q4"]) / 3 for r in rijen])
lf = np.array([code[r["leeftijd"]] for r in rijen], dtype=float)
zonder = lf != 4

uit = {
    "kop": {
        "zaad": ZAAD,
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
    },
    "rijen": rijen,
}

# J2/G1: leeftijd als getal zonder "Dat zeg ik liever niet".
x = lf[zonder]
uit["leeftijd"] = {
    "n": int(x.size),
    "gemiddelde": float(x.mean()),
    "sd": float(x.std(ddof=1)),
    "scheef": float(stats.skew(x, bias=False)),
    "kurtosis": float(stats.kurtosis(x, bias=False)),
    "n_met_liever_niet": int(lf.size),
    "gemiddelde_met_liever_niet": float(lf.mean()),
}
pr = stats.pearsonr(lf[zonder], t10[zonder])
sp = stats.spearmanr(lf[zonder], t10[zonder])
uit["correlatie"] = {"n": int(zonder.sum()), "r": float(pr.statistic), "p": float(pr.pvalue), "rho": float(sp.statistic), "p_rho": float(sp.pvalue)}

# G2: t-toets van thema 10 met groep 1 = ja, groep 2 = nee (zoals SPSS: groep 1 min groep 2).
ja = t10[leiding == "ja"]
nee = t10[leiding == "nee"]


def ttoets(a, b):
    st = stats.ttest_ind(a, b, equal_var=True)
    we = stats.ttest_ind(a, b, equal_var=False)
    ci_st = st.confidence_interval(0.95)
    ci_we = we.confidence_interval(0.95)
    df = a.size + b.size - 2
    sp2 = ((a.size - 1) * a.var(ddof=1) + (b.size - 1) * b.var(ddof=1)) / df
    d = (a.mean() - b.mean()) / math.sqrt(sp2)
    corr = 1 - 3 / (4 * df - 1)
    g = corr * d
    n = a.size + b.size
    se = corr * math.sqrt(n / (a.size * b.size) + d * d / (2 * n))
    z975 = stats.norm.ppf(0.975)
    mw = stats.mannwhitneyu(a, b, use_continuity=True, alternative="two-sided", method="asymptotic")
    # z zoals statistiek.js (met continuïteitscorrectie en correctie voor gelijke waarden), positief als a hoger ligt.
    rangen = stats.rankdata(np.concatenate([a, b]))
    _, tellingen = np.unique(np.concatenate([a, b]), return_counts=True)
    knopen = float(np.sum(tellingen ** 3 - tellingen))
    var = a.size * b.size / 12 * (n + 1 - knopen / (n * (n - 1)))
    afstand = mw.statistic - a.size * b.size / 2
    z = math.copysign(max(0.0, abs(afstand) - 0.5), afstand) / math.sqrt(var)
    return {
        "na": int(a.size), "nb": int(b.size), "ma": float(a.mean()), "mb": float(b.mean()),
        "student": {"t": float(st.statistic), "df": float(st.df), "p": float(st.pvalue), "verschil": float(a.mean() - b.mean()), "ci": [float(ci_st.low), float(ci_st.high)]},
        "welch": {"t": float(we.statistic), "df": float(we.df), "p": float(we.pvalue), "verschil": float(a.mean() - b.mean()), "ci": [float(ci_we.low), float(ci_we.high)]},
        "d": float(d), "g": float(g), "g_ci": [float(g - z975 * se), float(g + z975 * se)],
        "mw": {"u": float(mw.statistic), "p": float(mw.pvalue), "z": float(z),
               "rang_a": float(rangen[: a.size].mean()), "rang_b": float(rangen[a.size:].mean())},
    }


uit["ttoets_ja_nee"] = ttoets(ja, nee)
uit["ttoets_nee_ja"] = ttoets(nee, ja)

# J3: Cronbachs alfa van de drie schaalvragen van thema 10 (zonder de cijfervraag).
items = np.array([[r["q2"], r["q3"], r["q4"]] for r in rijen], dtype=float)
k = items.shape[1]
alfa = k / (k - 1) * (1 - items.var(axis=0, ddof=1).sum() / items.sum(axis=1).var(ddof=1))
uit["alfa_thema10"] = float(alfa)

# G4: de score van thema 11 met minimaal 1 beantwoorde vraag (niemand valt weg).
t11 = np.array([np.mean([r[q] for q in ("q6", "q7", "q8") if q in r]) for r in rijen])
uit["thema11_min1"] = {"n": int(t11.size), "gemiddelde": float(t11.mean()), "sd": float(t11.std(ddof=1))}
uit["thema11_weggevallen"] = 3

print(json.dumps(uit, indent=1, ensure_ascii=False))
