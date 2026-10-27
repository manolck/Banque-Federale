# Fonds spéculatif fictif

Chaque semaine, les paliers I, II et III tirent un résultat en % indépendamment les uns des autres. Un palier est une chaîne de Markov : le régime change, puis le résultat est tiré dans la loi normale de ce régime, puis ramené dans les bornes du palier. Après plusieurs semaines de même signe, l'élastique pousse vers le camp opposé. Un garde-fou empêche une série de pertes de dépasser `serie_max`, avant l'application d'un éventuel évènement RP.

L'état de départ de chaque palier est le régime `stable`, avec une série à zéro.

## Lancer une simulation

Depuis ce dossier :

```text
python simulate.py --semaines 100000 --seed 1
python simulate.py --semaines 10000 --seed 1 --evenement I:-5
```

`--seed` rend le run reproductible. Sans graine, le tirage utilise le générateur système. `--evenement PALIER:VALEUR` ajoute ce choc, en points de %, à chaque semaine du palier nommé. L'option peut être répétée : les chocs d'un même palier s'additionnent, puis le résultat est de nouveau borné.

Les tests se lancent depuis la racine du dépôt :

```text
py -3.13 -m pytest algo/tests/test_engine.py
```

## Changer un paramètre

Tout se règle dans `config.py`.

- `bornes` : plancher et plafond du résultat hebdomadaire, en %.
- `regimes` : moyenne et écart-type de la loi normale de chaque régime. Ces couples sont calibrés : les modifier décale la moyenne et la part de semaines négatives.
- `transitions` : probabilités de passer d'un régime à l'autre. Chaque ligne doit sommer à 1.
- `rappel_apres` et `rappel_force` : à partir de combien de semaines de même signe l'élastique agit, et avec quelle force.
- `serie_max` : nombre de semaines négatives d'affilée avant le garde-fou.
- `LIBELLES` : noms affichés des régimes. Ils n'entrent pas dans le calcul.

`HAUSSIERS` dit quels régimes comptent comme haussiers pour l'élastique. Un régime absent de cet ensemble est baissier.

## Recalibrer

1. Modifier un paramètre dans `config.py`.
2. Lancer `python simulate.py --semaines 100000 --seed 1`.
3. Comparer, pour chaque palier, la moyenne et le pourcentage de semaines négatives aux objectifs : I ≈ +2,1 % et 25 % ; II ≈ +3,0 % et 30 % ; III ≈ +3,9 % et 43 %. La moyenne et l'écart-type doivent rester croissants de I vers III.
4. Relancer `py -3.13 -m pytest algo/tests/test_engine.py`. Le test de contrôle échoue si l'équilibre sort des tolérances. On retouche alors les transitions ou les lois des régimes, pas les tolérances du test.
