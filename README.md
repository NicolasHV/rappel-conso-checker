# Rappel Conso Checker

Application web (PWA) qui permet de vérifier si un produit fait l'objet d'un
rappel de la DGCCRF (RappelConso) à partir de son code-barres — scanné avec
la caméra du téléphone ou saisi manuellement.

Site **100% statique** : HTML/CSS/JS vanilla, aucun backend. Le JavaScript
interroge directement l'API publique RappelConso
(`data.economie.gouv.fr`, dataset `rappelconso-v2-gtin-trie`) depuis le
navigateur à chaque recherche — pas de base de données ni de cache de
données. Scan de code-barres via
[`html5-qrcode`](https://github.com/mebjas/html5-qrcode).

## Lancer en local

```bash
cd frontend
python3 -m http.server 8000
```

Ouvrir http://localhost:8000. Le scan caméra (`getUserMedia`) nécessite un
contexte sécurisé (`https://` ou `localhost` — `localhost` fonctionne
directement ici).

## Déploiement sur GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` déploie automatiquement le
contenu de `frontend/` sur GitHub Pages à chaque push sur `main` qui touche
ce dossier (ou manuellement via l'onglet Actions → "Deploy to GitHub Pages"
→ "Run workflow").

**Étape unique à faire une fois, à la main** (aucun outil ne permet de le
faire depuis ce dépôt) : dans les paramètres du repo GitHub, aller dans
**Settings → Pages → Build and deployment → Source**, et choisir **"GitHub
Actions"**. Après ça, chaque déploiement se fait automatiquement.

Une fois activé, le site est disponible à :
`https://nicolashv.github.io/rappel-conso-checker/`

Pour tester le scan caméra sur un téléphone, il suffit d'ouvrir cette URL
HTTPS directement dessus, puis "Ajouter à l'écran d'accueil" / "Installer
l'application" pour l'utiliser comme une PWA.

## Structure du projet

```
frontend/
  index.html
  manifest.json          # manifeste PWA
  service-worker.js       # cache de l'app shell (jamais des résultats de l'API)
  static/
    css/style.css
    js/app.js             # scan caméra + appel direct à l'API RappelConso + affichage
    icons/                 # icônes PWA
.github/workflows/
  deploy-pages.yml         # déploiement automatique sur GitHub Pages
android/
  ...                      # variante APK Android (voir android/README.md)
```

## API RappelConso utilisée

`GET https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-trie/records?where=gtin=<code-barres>`

Le champ `gtin` du dataset est un entier unique par ligne (une même fiche de
rappel apparaît en plusieurs lignes si plusieurs codes-barres y sont
associés) : un simple filtre d'égalité suffit, l'API renvoie déjà
exactement les lignes correspondantes. Voir `frontend/static/js/app.js`
(`FIELD_MAP`) pour le détail du mapping des champs retournés (marque,
motif du rappel, risques, conduite à tenir, images, lien vers la fiche
officielle...).

## Limitations connues

- L'API RappelConso doit autoriser les appels `fetch` cross-origin (CORS)
  depuis le domaine où le site est hébergé — vérifié en direct pendant le
  développement (`access-control-allow-origin: *`), donc cela devrait
  fonctionner depuis n'importe quel domaine, y compris GitHub Pages.
- Pas de cache de données : chaque recherche interroge l'API RappelConso en
  direct (choix assumé pour rester simple et toujours à jour).
- Cet outil n'est pas affilié à la DGCCRF ; les données affichées
  proviennent de leur API publique.
