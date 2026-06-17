# Dossier data

Ce dossier contient les données du projet.

```text
data/
├── raw/
│   ├── Version1/          # Données historiques metro.txt, pospoints.txt, image V1
│   ├── gtfs-idfm-2024/    # Données GTFS IDFM utilisées pour V2/V3
│   └── examples/          # Captures d'exemples d'UI du sujet
└── README.md
```

Le navigateur ne lit pas directement les fichiers GTFS bruts. Ils servent à
régénérer `public/data/network.json` avec :

```bash
python3 scripts/build_network.py
```

Le fichier `network.json` est la version compacte réellement chargée par
l'application web.

`data/raw/gtfs-idfm-2024/stop_times.txt` est volontairement ignoré par Git car
il dépasse la limite de taille GitHub. Il doit exister localement uniquement si
vous voulez régénérer `network.json`.
