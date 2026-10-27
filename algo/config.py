"""Configuration des trois paliers du fonds spéculatif fictif."""

CONFIG = {
    "I": {
        "bornes": (-3, 9),
        "rappel_apres": 2,
        "rappel_force": 0.20,
        "serie_max": 3,
        "regimes": {
            "croissance": (5.3, 2.0),
            "stable": (3.2, 2.0),
            "tassement": (0.1, 1.5),
            "turbulence": (-2.5, 2.0),
        },
        "transitions": {
            "croissance": {"croissance": 0.60, "stable": 0.30, "tassement": 0.10, "turbulence": 0},
            "stable": {"croissance": 0.20, "stable": 0.60, "tassement": 0.17, "turbulence": 0.03},
            "tassement": {"croissance": 0.10, "stable": 0.45, "tassement": 0.35, "turbulence": 0.10},
            "turbulence": {"croissance": 0.10, "stable": 0.40, "tassement": 0.50, "turbulence": 0},
        },
    },
    "II": {
        "bornes": (-5, 15),
        "rappel_apres": 3,
        "rappel_force": 0.12,
        "serie_max": 4,
        "regimes": {
            "expansion": (7.8, 4),
            "stable": (5.2, 3),
            "correction": (-0.8, 4),
            "choc": (-4.2, 4),
        },
        "transitions": {
            "expansion": {"expansion": 0.50, "stable": 0.30, "correction": 0.18, "choc": 0.02},
            "stable": {"expansion": 0.25, "stable": 0.40, "correction": 0.28, "choc": 0.07},
            "correction": {"expansion": 0.15, "stable": 0.30, "correction": 0.40, "choc": 0.15},
            "choc": {"expansion": 0.15, "stable": 0.35, "correction": 0.50, "choc": 0},
        },
    },
    "III": {
        "bornes": (-15, 30),
        "rappel_apres": 4,
        "rappel_force": 0.06,
        "serie_max": 5,
        "regimes": {
            "boom": (21, 9),
            "stable": (8.5, 7),
            "correction": (-6, 8),
            "krach": (-12, 6),
        },
        "transitions": {
            "boom": {"boom": 0.35, "stable": 0.25, "correction": 0.30, "krach": 0.10},
            "stable": {"boom": 0.25, "stable": 0.30, "correction": 0.30, "krach": 0.15},
            "correction": {"boom": 0.20, "stable": 0.25, "correction": 0.35, "krach": 0.20},
            "krach": {"boom": 0.20, "stable": 0.30, "correction": 0.50, "krach": 0},
        },
    },
}

HAUSSIERS = {"croissance", "stable", "expansion", "boom"}

LIBELLES = {
    "croissance": "Trafic soutenu",
    "stable": "Marché calme",
    "tassement": "Ralentissement",
    "turbulence": "Turbulences",
    "expansion": "Carnets pleins",
    "correction": "Stocks qui s'accumulent",
    "choc": "Choc sectoriel",
    "boom": "Ruée",
    "krach": "Panique sur les marchés",
}
