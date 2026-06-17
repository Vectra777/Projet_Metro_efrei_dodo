# Données

## Source

Les données runtime viennent des fichiers GTFS IDFM locaux dans
`data/raw/gtfs-idfm-2024/`, puis sont compactées dans
`public/data/network.json`. Le fichier volumineux `stop_times.txt` reste
local-only et n'est pas versionné.

L'application inclut :

- métro : `route_type = 1` ;
- RER A, B, C, D, E : `route_type = 2` et agence `IDFM:71` ;
- horaires de passage issus de `stop_times.txt` ;
- correspondances issues de `transfers.txt` ;
- fallback de correspondance de 180 secondes entre quais d'une même station.

## Non inclus

L'application ne calcule pas encore de marche entre deux stations commerciales
différentes. Les déplacements à pied sont limités aux correspondances internes
ou déclarées dans GTFS.

## Affichage des lignes

Le dossier GTFS fourni ne contient pas de `shapes.txt`. Sans géométrie réelle,
la carte ne connaît que l'ordre des arrêts et leurs coordonnées. Une liaison
entre deux arrêts consécutifs est donc dessinée comme une droite.

Pour éviter les grandes diagonales trompeuses, l'application masque les longues
liaisons dans la couche de fond. Elles restent disponibles pour les calculs
d'itinéraire, et peuvent encore apparaître lorsqu'un trajet sélectionné utilise
réellement ce segment.
