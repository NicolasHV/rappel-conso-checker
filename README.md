# Rappel Conso Checker

Application web (PWA) qui permet de vérifier si un produit fait l'objet d'un
rappel de la DGCCRF (RappelConso) à partir de son code-barres — scanné avec
la caméra du téléphone ou saisi manuellement.

- **Backend** : FastAPI (Python), interroge en direct l'API officielle
  RappelConso (`data.economie.gouv.fr`, dataset `rappelconso-v2-gtin-espaces`)
  à chaque recherche — pas de base de données ni de cache.
- **Frontend** : PWA (installable sur mobile), HTML/CSS/JS vanilla, scan de
  code-barres via [`html5-qrcode`](https://github.com/mebjas/html5-qrcode).

## Installation

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Lancer l'application en local

```bash
cd backend
uvicorn app.main:app --reload
```

Ouvrir http://localhost:8000 dans le navigateur.

> **Scan caméra** : les navigateurs n'autorisent l'accès à la caméra
> (`getUserMedia`) que sur un contexte sécurisé (`https://` ou `localhost`).
> En local sur ordinateur ça fonctionne directement sur `localhost`. Pour
> tester sur un téléphone, il faut exposer le serveur en HTTPS (par exemple
> via [ngrok](https://ngrok.com/), [Caddy](https://caddyserver.com/) ou en
> déployant sur un hébergeur avec HTTPS automatique).

## Tester sur mobile

1. Déployer l'app derrière HTTPS (ex. `ngrok http 8000` en pointant vers le
   serveur uvicorn local, ou un hébergement type Render/Fly.io/VPS + Caddy).
2. Ouvrir l'URL HTTPS sur le téléphone.
3. Menu du navigateur → « Ajouter à l'écran d'accueil » / « Installer
   l'application » pour l'utiliser comme une app mobile (PWA).

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

Les tests du client RappelConso utilisent [`respx`](https://lundberg.github.io/respx/)
pour simuler l'API externe (aucun appel réseau réel).

## Structure du projet

```
backend/
  app/
    main.py            # application FastAPI, sert l'API + le frontend statique
    rappelconso.py      # client HTTP vers l'API RappelConso + logique de matching GTIN
    routers/recalls.py  # endpoint GET /api/check/{barcode}
  tests/                 # tests pytest (mockés, sans appel réseau)
frontend/
  index.html
  manifest.json          # manifeste PWA
  service-worker.js       # cache de l'app shell (pas des résultats API)
  static/
    css/style.css
    js/app.js             # scan caméra + appel API + affichage des résultats
    icons/                 # icônes PWA (générées)
```

## API

### `GET /api/check/{barcode}`

`barcode` : suite de 6 à 14 chiffres (EAN-8, UPC-A, EAN-13, GTIN-14...).

Réponse :

```json
{
  "barcode": "3273720193318",
  "found": true,
  "count": 1,
  "recalls": [
    {
      "reference": "2024-01-0123",
      "brand": "MarqueTest",
      "model": "Modèle X",
      "reason": "Présence de corps étrangers",
      "risks": "Risque d'étouffement",
      "conduct": "Ne plus consommer, rapporter en magasin",
      "publication_date": "2024-05-01",
      "sale_zone": "France entière",
      "distributors": "Supermarché Test",
      "images": ["https://..."],
      "sheet_link": "https://rappel.conso.gouv.fr/fiche-rappel/1234",
      "gtin": ["3273720193318"],
      "raw": { "...": "enregistrement brut de l'API, au cas où" }
    }
  ]
}
```

## Limitations connues

- Le réseau de l'environnement de développement utilisé pour créer cette app
  bloquait l'accès à `data.economie.gouv.fr` : l'intégration a donc été
  écrite à partir de la documentation publique du jeu de données, **sans
  pouvoir tester un appel réel en bout en bout**. Le mapping des champs
  (`app/rappelconso.py::FIELD_MAP`) est centralisé et fait au mieux ; chaque
  enregistrement retourné inclut aussi un champ `raw` avec les données brutes
  de l'API, pour diagnostiquer facilement un nom de champ qui aurait changé.
  Testez avec un vrai code-barres rappelé après déploiement, et ajustez
  `FIELD_MAP` si un champ n'apparaît pas correctement.
- Pas de cache : chaque recherche interroge l'API RappelConso en direct
  (choix assumé pour rester simple et toujours à jour).
- Cet outil n'est pas affilié à la DGCCRF ; les données affichées proviennent
  de leur API publique.
