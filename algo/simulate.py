"""Simulation longue d'un fonds spéculatif fictif.

Usage, depuis ce dossier :
    python simulate.py --semaines 100000 --seed 1
    python simulate.py --semaines 10000 --seed 1 --evenement I:-5
"""

import argparse
import math
import random
import statistics

from config import CONFIG, LIBELLES
from engine import tirage_semaine

PALIERS = tuple(CONFIG)


def analyser(valeurs, bornes):
    """Résume une série de résultats hebdomadaires, en pourcentage."""
    n = len(valeurs)
    moyenne = statistics.fmean(valeurs)
    ecart = statistics.pstdev(valeurs)
    croissance = math.expm1(sum(math.log1p(v / 100.0) for v in valeurs) / n) * 100.0
    negatif = 100.0 * sum(v < 0 for v in valeurs) / n
    lo, hi = bornes
    bas = 100.0 * sum(v == lo for v in valeurs) / n
    haut = 100.0 * sum(v == hi for v in valeurs) / n
    plus_longue = courant = 0
    for valeur in valeurs:
        if valeur < 0:
            courant += 1
            plus_longue = max(plus_longue, courant)
        else:
            courant = 0
    return {
        "negatives": negatif,
        "moyenne": moyenne,
        "ecart_type": ecart,
        "croissance": croissance,
        "serie_negative": plus_longue,
        "borne_basse": bas,
        "borne_haute": haut,
    }


def parse_evenement(texte):
    palier, separateur, valeur = texte.partition(":")
    palier = palier.strip()
    if not separateur or palier not in CONFIG:
        raise argparse.ArgumentTypeError("format attendu : PALIER:VALEUR, par exemple I:-5")
    try:
        nombre = float(valeur)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("la valeur doit être un nombre") from exc
    return {"valeur": nombre, "paliers": [palier]}


def simuler(semaines, seed=None, evenements=None):
    rng = random.Random(seed) if seed is not None else random.SystemRandom()
    etats = {nom: {"regime": "stable", "serie": 0} for nom in PALIERS}
    series = {nom: [] for nom in PALIERS}
    for _ in range(semaines):
        resultats, etats, _details = tirage_semaine(etats, evenements, rng)
        for nom, valeur in resultats.items():
            series[nom].append(valeur)
    return series, etats


def afficher(series, etats):
    for nom in PALIERS:
        stats = analyser(series[nom], CONFIG[nom]["bornes"])
        regime = etats[nom]["regime"]
        print(f"Palier {nom}")
        print(f"  semaines négatives          {stats['negatives']:.2f} %")
        print(f"  moyenne                     {stats['moyenne']:+.3f} %")
        print(f"  écart-type                  {stats['ecart_type']:.3f}")
        print(f"  croissance composée         {stats['croissance']:+.3f} % / semaine")
        print(f"  plus longue série négative  {stats['serie_negative']} semaines")
        print(f"  collé à la borne basse      {stats['borne_basse']:.2f} %")
        print(f"  collé à la borne haute      {stats['borne_haute']:.2f} %")
        print(f"  dernier régime              {LIBELLES[regime]}")
        print()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Simule les trois paliers d'un fonds spéculatif fictif.")
    parser.add_argument("--semaines", type=int, default=100_000, help="nombre de semaines à tirer")
    parser.add_argument("--seed", type=int, default=None, help="graine du générateur, pour reproduire un run")
    parser.add_argument(
        "--evenement",
        action="append",
        default=[],
        type=parse_evenement,
        metavar="PALIER:VALEUR",
        help="choc en points de % appliqué chaque semaine (répétable)",
    )
    args = parser.parse_args(argv)
    if args.semaines < 1:
        parser.error("le nombre de semaines doit être positif")
    evenements = args.evenement or None
    print(f"{args.semaines} semaines" + (f", graine {args.seed}" if args.seed is not None else ", tirage système"))
    if evenements:
        choc = ", ".join(f"{ev['paliers'][0]} {ev['valeur']:+.1f}" for ev in evenements)
        print(f"évènement chaque semaine : {choc}")
    print()
    series, etats = simuler(args.semaines, args.seed, evenements)
    afficher(series, etats)


if __name__ == "__main__":
    main()
