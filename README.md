# Métro, Efrei, Dodo

Application web statique pour explorer le réseau métro + RER IDFM :

- recherche d'itinéraire horaire avec Dijkstra ;
- prise en compte des correspondances GTFS ;
- test de connexité du réseau ;
- affichage et animation d'un arbre couvrant minimum avec Kruskal ;
- sélection du trajet directement en cliquant sur les stations de la carte.

## Arborescence

```text
metro-efrei-dodo/
├── data/
│   ├── README.md
│   └── raw/
│       ├── Version1/          # Données historiques fournies
│       ├── gtfs-idfm-2024/    # GTFS IDFM complet utilisé par le script
│       └── examples/          # Captures UI du sujet
├── public/
│   ├── index.html          # Page principale
│   ├── styles.css          # UI
│   ├── main.js             # Carte, algorithmes et interactions
│   └── data/
│       └── network.json    # Graphe compact utilisé par le navigateur
├── scripts/
│   └── build_network.py    # Génère network.json depuis les fichiers GTFS
└── docs/
    ├── DATA.md             # Notes sur les données et limites d'affichage
    ├── GTFS_SOURCE.md      # Notes source fournies avec le sujet
    ├── LIGNE_M7.md         # Exemple de ligne fourni
    └── opendata_gtfs.pdf   # Documentation GTFS IDFM
```

## Lancer l'application

Depuis ce dossier :

```bash
python3 -m http.server 8000 --directory public
```

Puis ouvrir :

```text
http://127.0.0.1:8000/
```

## Régénérer les données

Le fichier `public/data/network.json` suffit pour lancer l'application.
Il est généré depuis les fichiers GTFS inclus dans ce projet.

Commande :

```bash
python3 scripts/build_network.py
```

Par défaut, le script utilise les données incluses dans :

```text
data/raw/gtfs-idfm-2024/
```

Il est aussi possible de préciser d'autres chemins :

```bash
python3 scripts/build_network.py \
  --gtfs-dir data/raw/gtfs-idfm-2024 \
  --output public/data/network.json
```

## Notes

Le dossier contient aussi les GTFS bruts utiles, sauf `stop_times.txt`, qui est
volumineux et doit rester local. Ce fichier est nécessaire uniquement pour
régénérer `network.json`.

Le navigateur charge uniquement `public/data/network.json`, pas les fichiers
GTFS bruts.
