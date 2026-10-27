"""Tirage hebdomadaire d'un fonds spéculatif à régimes markoviens."""

import math
import random

from config import CONFIG, HAUSSIERS

_rng = random.SystemRandom()


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def p_positif(mu, sd):
    return 0.5 * (1 + math.erf(mu / (sd * math.sqrt(2))))


def transitions_ajustees(cfg, regime, serie):
    """Mean reversion : après N semaines de même signe, on pousse vers l'autre camp."""
    t = dict(cfg["transitions"][regime])
    if abs(serie) >= cfg["rappel_apres"]:
        bonus = cfg["rappel_force"] * (abs(serie) - cfg["rappel_apres"] + 1)
        cible = (lambda r: r not in HAUSSIERS) if serie > 0 else (lambda r: r in HAUSSIERS)
        for r in t:
            t[r] *= (1 + bonus) if cible(r) else (1 - bonus)
        s = sum(t.values())
        t = {r: v / s for r, v in t.items()}
    return t


def tirage_palier(nom, etat, delta_evenement=0.0, rng=None):
    """Tire le résultat d'une semaine pour un palier et fait avancer son état."""
    rng = rng or _rng
    cfg = CONFIG[nom]
    lo, hi = cfg["bornes"]
    t = transitions_ajustees(cfg, etat["regime"], etat["serie"])
    regime = rng.choices(list(t), weights=list(t.values()))[0]
    mu, sd = cfg["regimes"][regime]
    brut = rng.gauss(mu, sd)
    base = clamp(brut, lo, hi)

    garde_fou = False
    if etat["serie"] <= -cfg["serie_max"] and base < 0:
        base = abs(base) * 0.3
        regime = "stable"
        garde_fou = True

    final = round(clamp(base + delta_evenement, lo, hi), 1)
    serie = (max(etat["serie"], 0) + 1) if final >= 0 else (min(etat["serie"], 0) - 1)
    nouvel_etat = {"regime": regime, "serie": serie}

    t_next = transitions_ajustees(cfg, regime, serie)
    p_gain = sum(p * p_positif(*cfg["regimes"][r]) for r, p in t_next.items())
    detail = {
        "brut": round(brut, 2),
        "base_apres_clamp": round(base, 2),
        "delta_evenement": delta_evenement,
        "garde_fou": garde_fou,
    }
    return final, nouvel_etat, p_gain, detail


def tirage_semaine(etats, evenements=None, rng=None):
    """Tire les trois paliers. Les évènements d'un même palier s'additionnent."""
    deltas = {nom: 0.0 for nom in CONFIG}
    for evenement in evenements or []:
        valeur = float(evenement["valeur"])
        for nom in evenement["paliers"]:
            if nom not in deltas:
                raise KeyError(f"Palier inconnu : {nom}")
            deltas[nom] += valeur
    resultats = {}
    nouveaux = {}
    details = {}
    for nom in CONFIG:
        final, etat, _p_gain, detail = tirage_palier(nom, etats[nom], deltas[nom], rng)
        resultats[nom] = final
        nouveaux[nom] = etat
        details[nom] = {**detail, "p_gain": _p_gain}
    return resultats, nouveaux, details
