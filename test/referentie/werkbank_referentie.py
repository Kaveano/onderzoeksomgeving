"""Referentiewaarden voor de werkbank (BOUWPLAN P4, D2 §13.1), berekend met SciPy en statsmodels.

Gebruik (vanuit de hoofdmap van het project):
    python3 -I test/referentie/werkbank_referentie.py > test/fixtures/werkbank-referentie.json

De gegevens zijn verzonnen (numpy default_rng met zaad 20261127), afgerond op 2 decimalen of als
antwoorden 1 tot 5 met veel gelijke waarden. De versies van Python, NumPy, SciPy en statsmodels staan in de kop.
npm test draait dit script niet; het JSON-bestand wordt meegeleverd. Draai het opnieuw als je een
referentie toevoegt, en controleer daarna `node --test test/werkbank-statistiek.test.mjs`.
"""

import json
import math
import platform
import sys

import numpy as np
import scipy
import statsmodels
from scipy import stats, special
from statsmodels.stats.contingency_tables import Table
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.oneway import anova_oneway
import statsmodels.api as sm

ZAAD = 20261127
rng = np.random.default_rng(ZAAD)


def lijst(x):
    return [None if (isinstance(v, float) and not math.isfinite(v)) else float(v) for v in np.asarray(x, dtype=float).ravel()]


def r2(x):
    return np.round(np.asarray(x, dtype=float), 2)


uit = {
    "kop": {
        "zaad": ZAAD,
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "statsmodels": statsmodels.__version__,
        "gemaakt_met": "python3 -I test/referentie/werkbank_referentie.py",
    }
}

# ---------- Normaalverdeling ----------
zs = [-38.0, -12.5, -8.0, -5.0, -3.3, -1.96, -0.674, -0.1, 0.0, 0.3, 0.67448975, 0.7, 1.5, 2.5, 4.0, 5.6, 6.1, 9.0]
uit["phi"] = {"x": zs, "cdf": lijst(special.ndtr(zs))}

# ---------- Beschrijvende statistiek ----------
x = r2(rng.normal(3.2, 0.9, 87))
likert = rng.integers(1, 6, 120).astype(float)
scheef = r2(rng.gamma(2.0, 1.3, 64))


def beschrijf(v):
    v = np.asarray(v, dtype=float)
    n = len(v)
    m = v.mean()
    sd = v.std(ddof=1)
    se = sd / math.sqrt(n)
    t = stats.t.ppf(0.975, n - 1)
    se_g1 = math.sqrt(6 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3)))
    se_g2 = 2 * se_g1 * math.sqrt((n * n - 1) / ((n - 3) * (n + 5)))
    return {
        "x": lijst(v), "n": n, "gemiddelde": m, "sd": sd, "se": se, "ci": [m - t * se, m + t * se],
        "mediaan": float(np.median(v)),
        "scheef": float(stats.skew(v, bias=False)), "se_scheef": se_g1,
        "kurtosis": float(stats.kurtosis(v, bias=False)), "se_kurtosis": se_g2,
    }


uit["beschrijvend"] = [beschrijf(x), beschrijf(likert), beschrijf(scheef)]

# ---------- Twee groepen ----------
a = r2(rng.normal(3.0, 0.8, 34))
b = r2(rng.normal(3.45, 1.1, 27))
la = rng.integers(1, 6, 41).astype(float)
lb = np.clip(rng.integers(1, 6, 38) + rng.integers(0, 2, 38), 1, 5).astype(float)


def twee(a, b):
    st = stats.ttest_ind(b, a, equal_var=True)
    we = stats.ttest_ind(b, a, equal_var=False)
    ci_s = st.confidence_interval(0.95)
    ci_w = we.confidence_interval(0.95)
    mw = stats.mannwhitneyu(b, a, use_continuity=True, alternative="two-sided", method="asymptotic")
    n1, n2 = len(a), len(b)
    sp = math.sqrt(((n1 - 1) * a.var(ddof=1) + (n2 - 1) * b.var(ddof=1)) / (n1 + n2 - 2))
    d = (b.mean() - a.mean()) / sp
    corr = 1 - 3 / (4 * (n1 + n2 - 2) - 1)
    lev_m = stats.levene(a, b, center="mean")
    lev_med = stats.levene(a, b, center="median")
    return {
        "a": lijst(a), "b": lijst(b),
        "student": {"t": float(st.statistic), "df": float(st.df), "p": float(st.pvalue), "ci": [float(ci_s.low), float(ci_s.high)]},
        "welch": {"t": float(we.statistic), "df": float(we.df), "p": float(we.pvalue), "ci": [float(ci_w.low), float(ci_w.high)]},
        "mannwhitney": {"u": float(mw.statistic), "p": float(mw.pvalue)},
        "cohen_d": d, "hedges_g": corr * d,
        "levene_gemiddelde": {"f": float(lev_m.statistic), "p": float(lev_m.pvalue)},
        "levene_mediaan": {"f": float(lev_med.statistic), "p": float(lev_med.pvalue)},
    }


uit["tweegroepen"] = [twee(a, b), twee(la, lb)]

# ---------- Meer groepen ----------
groepen = [r2(rng.normal(mu, sd, n)) for mu, sd, n in [(3.1, 0.7, 23), (3.5, 1.2, 31), (2.8, 0.5, 17), (3.3, 0.9, 12)]]
likert_groepen = [rng.integers(1, 6, n).astype(float) for n in (19, 26, 22, 15, 30)]


def meer(groepen):
    k = len(groepen)
    alle = np.concatenate(groepen)
    N = len(alle)
    f = stats.f_oneway(*groepen)
    m = alle.mean()
    ssb = sum(len(g) * (g.mean() - m) ** 2 for g in groepen)
    ssw = sum(((g - g.mean()) ** 2).sum() for g in groepen)
    msw = ssw / (N - k)
    wa = anova_oneway(groepen, use_var="unequal", welch_correction=True)
    kw = stats.kruskal(*groepen)
    th = stats.tukey_hsd(*groepen)
    th_ci = th.confidence_interval(0.95)
    # Games-Howell (D2 §5.2)
    gh = []
    for i in range(k):
        for j in range(i + 1, k):
            gi, gj = groepen[i], groepen[j]
            vi, vj = gi.var(ddof=1) / len(gi), gj.var(ddof=1) / len(gj)
            se = math.sqrt(vi + vj)
            df = (vi + vj) ** 2 / (vi ** 2 / (len(gi) - 1) + vj ** 2 / (len(gj) - 1))
            dif = gi.mean() - gj.mean()
            q = abs(dif) / se * math.sqrt(2)
            p = float(stats.studentized_range.sf(q, k, df))
            krit = float(stats.studentized_range.ppf(0.95, k, df))
            marge = krit / math.sqrt(2) * se
            gh.append({"i": i, "j": j, "verschil": dif, "se": se, "df": df, "p": p, "ci": [dif - marge, dif + marge]})
    # Dunn met Bonferroni
    rang = stats.rankdata(alle)
    _, tellingen = np.unique(alle, return_counts=True)
    knopen = float(((tellingen ** 3) - tellingen).sum())
    basis = N * (N + 1) / 12 - knopen / (12 * (N - 1))
    grenzen = np.cumsum([0] + [len(g) for g in groepen])
    gem_rang = [rang[grenzen[i]:grenzen[i + 1]].mean() for i in range(k)]
    dunn = []
    m_paren = k * (k - 1) / 2
    for i in range(k):
        for j in range(i + 1, k):
            se = math.sqrt(basis * (1 / len(groepen[i]) + 1 / len(groepen[j])))
            z = (gem_rang[i] - gem_rang[j]) / se
            p = 2 * stats.norm.sf(abs(z))
            dunn.append({"i": i, "j": j, "z": z, "p": p, "p_bonferroni": min(1.0, p * m_paren)})
    lev = stats.levene(*groepen, center="mean")
    return {
        "groepen": [lijst(g) for g in groepen],
        "anova": {"f": float(f.statistic), "p": float(f.pvalue), "ssb": ssb, "ssw": ssw, "eta2": ssb / (ssb + ssw),
                  "omega2": max(0.0, (ssb - (k - 1) * msw) / (ssb + ssw + msw))},
        "welch": {"f": float(wa.statistic), "df1": float(wa.df[0]), "df2": float(wa.df[1]), "p": float(wa.pvalue)},
        "levene": {"f": float(lev.statistic), "p": float(lev.pvalue)},
        "kruskal": {"h": float(kw.statistic), "p": float(kw.pvalue), "gemiddelde_rang": [float(r) for r in gem_rang]},
        "tukey": [{"i": i, "j": j, "verschil": float(groepen[i].mean() - groepen[j].mean()), "p": float(th.pvalue[i, j]),
                   "ci": [float(th_ci.low[i, j]), float(th_ci.high[i, j])]} for i in range(k) for j in range(i + 1, k)],
        "gameshowell": gh,
        "dunn": dunn,
    }


uit["meergroepen"] = [meer(groepen), meer(likert_groepen)]

# ---------- Gestudentiseerd bereik ----------
ks = [2, 3, 4, 5, 8, 10, 12, 20]
nus = [2, 3, 5, 10, 20, 50, 120, 1000, 1e6]
qs = [0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0]
raster = []
for k in ks:
    for nu in nus:
        cdf = [float(stats.studentized_range.cdf(q, k, nu)) for q in qs]
        sf = [float(stats.studentized_range.sf(q, k, nu)) for q in qs]
        q95 = float(stats.studentized_range.ppf(0.95, k, nu))
        raster.append({"k": k, "nu": nu, "cdf": cdf, "sf": sf, "q95": q95})
uit["ptukey"] = {"q": qs, "raster": raster}

# ---------- Kruistabellen ----------
tabellen = [[[12, 5], [7, 18]], [[3, 9], [11, 2]], [[0, 7], [9, 4]], [[25, 14], [8, 30]], [[1, 0], [0, 1]]]
uit["fisher"] = [{"tabel": t, "p": float(stats.fisher_exact(t).pvalue)} for t in tabellen]
kruis = []
for t in [[[12, 5], [7, 18]], [[25, 14], [8, 30]], [[14, 9, 11], [6, 15, 22], [18, 7, 9]], [[30, 12, 8, 5], [22, 25, 14, 9]]]:
    tt = np.array(t, dtype=float)
    pe = stats.chi2_contingency(tt, correction=False)
    g2 = stats.chi2_contingency(tt, correction=False, lambda_="log-likelihood")
    rij = {"tabel": t, "chi2": float(pe.statistic), "df": int(pe.dof), "p": float(pe.pvalue),
           "g2": float(g2.statistic), "p_g2": float(g2.pvalue), "verwacht": lijst(pe.expected_freq),
           "residuen": lijst(Table(tt).standardized_resids)}
    if tt.shape == (2, 2):
        ya = stats.chi2_contingency(tt, correction=True)
        rij["yates"] = float(ya.statistic)
        rij["p_yates"] = float(ya.pvalue)
    n = tt.sum()
    rij["cramers_v"] = math.sqrt(pe.statistic / (n * (min(tt.shape) - 1)))
    kruis.append(rij)
uit["kruistabel"] = kruis
aanp = []
for o, p in [([18, 9, 6, 7], [60, 20, 25, 15]), ([40, 31, 22], [1, 1, 1]), ([55, 20, 25, 12, 8], [300, 150, 120, 90, 40])]:
    e = np.array(p, dtype=float) / sum(p) * sum(o)
    r = stats.chisquare(o, e)
    aanp.append({"waargenomen": o, "populatie": p, "chi2": float(r.statistic), "p": float(r.pvalue), "df": len(o) - 1})
uit["aanpassing"] = aanp

# ---------- Correlaties ----------
n = 140
basis = rng.normal(0, 1, n)
cx = np.column_stack([
    r2(3 + 0.8 * basis + rng.normal(0, 0.7, n)),
    r2(3 - 0.5 * basis + rng.normal(0, 0.9, n)),
    rng.integers(1, 6, n).astype(float),
    r2(rng.normal(5, 2, n)),
])
cx[rng.random((n, 4)) < 0.08] = np.nan
paren = []
pp, ps = [], []
for i in range(4):
    for j in range(i + 1, 4):
        ok = ~np.isnan(cx[:, i]) & ~np.isnan(cx[:, j])
        pr = stats.pearsonr(cx[ok, i], cx[ok, j])
        sp = stats.spearmanr(cx[ok, i], cx[ok, j])
        paren.append({"i": i, "j": j, "n": int(ok.sum()), "r": float(pr.statistic), "p": float(pr.pvalue), "rho": float(sp.statistic), "p_rho": float(sp.pvalue)})
        pp.append(pr.pvalue)
        ps.append(sp.pvalue)
holm_r = multipletests(pp, method="holm")[1]
holm_s = multipletests(ps, method="holm")[1]
for k2, p in enumerate(paren):
    p["p_holm"] = float(holm_r[k2])
    p["p_rho_holm"] = float(holm_s[k2])
uit["correlatie"] = {"kolommen": [lijst(cx[:, j]) for j in range(4)], "paren": paren}

# ---------- Betrouwbaarheid ----------
latent = rng.normal(0, 1, 150)
items = np.column_stack([np.clip(np.round(3 + 0.9 * latent + rng.normal(0, 0.8, 150)), 1, 5) for _ in range(5)])


def betrouwbaar(X):
    X = np.asarray(X, dtype=float)
    k = X.shape[1]
    totaal = X.sum(axis=1)
    alfa = k / (k - 1) * (1 - X.var(axis=0, ddof=1).sum() / totaal.var(ddof=1))
    R = np.corrcoef(X, rowvar=False)
    rgem = R[np.triu_indices(k, 1)].mean()
    inv = np.linalg.inv(R)
    perItem = []
    for j in range(k):
        rest = np.delete(X, j, axis=1)
        zonder = rest.sum(axis=1)
        kk = k - 1
        a2 = kk / (kk - 1) * (1 - rest.var(axis=0, ddof=1).sum() / zonder.var(ddof=1)) if kk > 1 else None
        perItem.append({
            "gemiddelde": X[:, j].mean(), "sd": X[:, j].std(ddof=1), "schaal_gem_zonder": zonder.mean(),
            "schaal_var_zonder": zonder.var(ddof=1), "item_totaal": float(np.corrcoef(X[:, j], zonder)[0, 1]),
            "smc": 1 - 1 / inv[j, j], "alfa_zonder": a2,
        })
    return {"rijen": [lijst(r) for r in X], "alpha": alfa, "gestandaardiseerd": k * rgem / (1 + (k - 1) * rgem), "items": perItem,
            "inter": [float(R[np.triu_indices(k, 1)].mean()), float(R[np.triu_indices(k, 1)].min()), float(R[np.triu_indices(k, 1)].max())]}


items_om = items.copy()
items_om[:, 2] = 6 - items_om[:, 2]  # zonder omscoren gaat deze vraag tegen de rest in
uit["betrouwbaarheid"] = [betrouwbaar(items), betrouwbaar(items_om)]

# ---------- Matrices ----------
A = rng.normal(0, 1, (6, 6))
S = A @ A.T + 6 * np.eye(6)
w, V = np.linalg.eigh(S)
volg = np.argsort(w)[::-1]
uit["matrix"] = {"S": [lijst(r) for r in S], "inverse": [lijst(r) for r in np.linalg.inv(S)], "logdet": float(np.linalg.slogdet(S)[1]),
                 "eigenwaarden": lijst(w[volg])}
X = np.column_stack([np.ones(50), rng.normal(0, 1, (50, 3))])
y = X @ np.array([1.0, 0.5, -0.3, 0.2]) + rng.normal(0, 0.5, 50)
fit = sm.OLS(y, X).fit()
uit["kleinste_kwadraten"] = {"X": [lijst(r) for r in X], "y": lijst(y), "beta": lijst(fit.params), "bse": lijst(fit.bse), "rss": float(fit.ssr)}

json.dump(uit, sys.stdout, ensure_ascii=False, indent=1)
sys.stdout.write("\n")
