"""Tests du moteur de tirage hebdomadaire."""

import math
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import CONFIG, HAUSSIERS
from engine import clamp, tirage_palier, tirage_semaine, transitions_ajustees

PALIERS = ("I", "II", "III")
CIBLES = {
    "I": {"moyenne": 2.1, "tolerance_moyenne": 0.3, "negatives": 25.0, "tolerance_negatives": 3.0},
    "II": {"moyenne": 3.0, "tolerance_moyenne": 0.3, "negatives": 30.0, "tolerance_negatives": 3.0},
    "III": {"moyenne": 3.9, "tolerance_moyenne": 0.5, "negatives": 43.0, "tolerance_negatives": 3.0},
}


def etat_initial():
    return {"regime": "stable", "serie": 0}


def etats_initiaux():
    return {nom: etat_initial() for nom in PALIERS}


class RNGFixe:
    """RNG déterministe : régime imposé et gaussienne constante."""

    def __init__(self, regime, valeur):
        self.regime = regime
        self.valeur = valeur

    def choices(self, population, weights):
        if self.regime not in population:
            raise AssertionError(f"{self.regime} absent de {population}")
        return [self.regime]

    def gauss(self, mu, sd):
        return self.valeur


def test_bornes_avec_et_sans_evenement():
    rng = random.Random(7)
    etats = etats_initiaux()
    for _ in range(10_000):
        resultats, etats, _details = tirage_semaine(etats, rng=rng)
        for nom, valeur in resultats.items():
            lo, hi = CONFIG[nom]["bornes"]
            assert lo <= valeur <= hi

    etats = etats_initiaux()
    rng = random.Random(11)
    for i in range(10_000):
        choc = 40.0 if i % 2 == 0 else -40.0
        evenements = [{"valeur": choc, "paliers": list(PALIERS)}]
        resultats, etats, _details = tirage_semaine(etats, evenements, rng)
        for nom, valeur in resultats.items():
            lo, hi = CONFIG[nom]["bornes"]
            assert lo <= valeur <= hi


def test_evenement_negatif_respecte_la_borne_basse_du_palier_i():
    rng = random.Random(3)
    etat = etat_initial()
    for _ in range(10_000):
        final, etat, _p_gain, _detail = tirage_palier("I", etat, delta_evenement=-5.0, rng=rng)
        assert final >= -3


def test_evenement_additionne_au_tirage_et_ignore_les_autres_paliers():
    rng = RNGFixe("stable", 4.0)
    sans, _etats, details = tirage_semaine(etats_initiaux(), rng=rng)
    assert sans == {"I": 4.0, "II": 4.0, "III": 4.0}
    assert details["I"]["garde_fou"] is False

    avec, _etats, details = tirage_semaine(
        etats_initiaux(),
        [{"valeur": -5.0, "paliers": ["I"]}],
        rng,
    )
    assert avec["I"] == -1.0
    assert avec["II"] == sans["II"]
    assert avec["III"] == sans["III"]
    assert details["I"]["delta_evenement"] == -5.0
    assert details["II"]["delta_evenement"] == 0.0

    cumule, _etats, _details = tirage_semaine(
        etats_initiaux(),
        [
            {"valeur": -2.0, "paliers": ["I"]},
            {"valeur": -3.0, "paliers": ["I", "II"]},
        ],
        rng,
    )
    assert cumule["I"] == -1.0
    assert cumule["II"] == clamp(4.0 - 3.0, *CONFIG["II"]["bornes"])
    assert cumule["III"] == 4.0


def test_garde_fou_empeche_une_semaine_negative_de_plus():
    for nom, cfg in CONFIG.items():
        etat = {"regime": "stable", "serie": -cfg["serie_max"]}
        final, _nouvel, _p_gain, detail = tirage_palier(
            nom, etat, rng=RNGFixe("stable", -100.0)
        )
        assert detail["garde_fou"] is True
        assert final >= 0

        etat = {"regime": "stable", "serie": -cfg["serie_max"]}
        rng = random.Random(nom.__hash__() or 1)
        for _ in range(500):
            final, _nouvel, _p_gain, _detail = tirage_palier(nom, etat, rng=rng)
            assert final >= 0


def test_transitions_somment_a_un():
    for cfg in CONFIG.values():
        for regime, ligne in cfg["transitions"].items():
            assert math.isclose(sum(ligne.values()), 1.0, abs_tol=1e-9)
            for serie in (0, cfg["rappel_apres"], -cfg["rappel_apres"], cfg["rappel_apres"] + 2):
                ajuste = transitions_ajustees(cfg, regime, serie)
                assert math.isclose(sum(ajuste.values()), 1.0, abs_tol=1e-9)


def _masse_baissiere(transitions):
    return sum(poids for regime, poids in transitions.items() if regime not in HAUSSIERS)


def test_mean_reversion_pousse_vers_les_regimes_baissiers():
    for cfg in CONFIG.values():
        for regime in cfg["transitions"]:
            calme = transitions_ajustees(cfg, regime, 0)
            longue = transitions_ajustees(cfg, regime, cfg["rappel_apres"] + 3)
            assert _masse_baissiere(longue) > _masse_baissiere(calme)


def _simuler(semaines, seed):
    rng = random.Random(seed)
    etats = etats_initiaux()
    series = {nom: [] for nom in PALIERS}
    for _ in range(semaines):
        resultats, etats, _details = tirage_semaine(etats, rng=rng)
        for nom, valeur in resultats.items():
            series[nom].append(valeur)
    return series


@pytest.fixture(scope="module")
def simulation_controle():
    return _simuler(100_000, seed=1)


def test_simulation_de_controle(simulation_controle):
    for nom, cible in CIBLES.items():
        valeurs = simulation_controle[nom]
        moyenne = sum(valeurs) / len(valeurs)
        negatives = 100.0 * sum(valeur < 0 for valeur in valeurs) / len(valeurs)
        assert abs(moyenne - cible["moyenne"]) <= cible["tolerance_moyenne"], (
            f"Palier {nom} : moyenne {moyenne:.3f} hors de "
            f"{cible['moyenne']} ± {cible['tolerance_moyenne']}"
        )
        assert abs(negatives - cible["negatives"]) <= cible["tolerance_negatives"], (
            f"Palier {nom} : {negatives:.2f} % de semaines négatives hors de "
            f"{cible['negatives']} ± {cible['tolerance_negatives']}"
        )


def test_hierarchie_moyenne_et_volatilite(simulation_controle):
    stats = {}
    for nom, valeurs in simulation_controle.items():
        moyenne = sum(valeurs) / len(valeurs)
        variance = sum((valeur - moyenne) ** 2 for valeur in valeurs) / len(valeurs)
        stats[nom] = (moyenne, math.sqrt(variance))
    assert stats["I"][0] < stats["II"][0] < stats["III"][0]
    assert stats["I"][1] < stats["II"][1] < stats["III"][1]
