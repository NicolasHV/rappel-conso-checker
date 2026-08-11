# Rappel Conso Checker — variante APK Android

Empaquetage natif (WebView) du site web déjà présent sur `main`
(`frontend/`), pour installation directe sur Android sous forme de fichier
`.apk`. Contrairement à la version PWA (`frontend/` + `backend/`), cette
variante **n'a pas de backend** : le JavaScript embarqué appelle directement
l'API RappelConso (`data.economie.gouv.fr`) depuis la WebView.

## Pourquoi pas Gradle / Android Studio / Capacitor ?

Ces outils nécessitent de télécharger le SDK Android officiel depuis
`dl.google.com`, inaccessible dans l'environnement où ce projet a été
construit. À la place, ce dossier utilise la chaîne d'outils Android
packagée par Ubuntu (`apt`), suffisante pour construire à la main un APK
minimal :

```bash
sudo apt-get install aapt android-sdk-platform-23 dalvik-exchange proguard-cli zipalign apksigner
```

- `aapt` : compilation des ressources + packaging de l'APK
- `android-sdk-platform-23` (→ `libandroid-23-java`) : fournit `android.jar`
  (API 23 / Android 6.0), utilisé pour compiler `MainActivity.java`
- `dalvik-exchange` : génère `classes.dex` (compatible avec l'interface `dx`)
- `zipalign`, `apksigner` : alignement et signature de l'APK

## Build

```bash
cd android
./build.sh
```

Produit `android/build/app-debug.apk`, signé avec un keystore de debug
auto-généré à la première exécution (`android/debug.keystore`, non
versionné — régénérable à volonté, ne sert qu'au sideload local).

## Installer sur un téléphone

1. Transférer `app-debug.apk` sur le téléphone (câble, email, cloud...).
2. Autoriser l'installation d'apps depuis une source inconnue pour
   l'application utilisée pour ouvrir le fichier (Paramètres → Sécurité, ou
   demandé automatiquement à l'ouverture du fichier selon la version
   d'Android).
3. Ouvrir le fichier `.apk` et confirmer l'installation.

Alternative avec `adb` (téléphone en mode débogage USB) :

```bash
adb install android/build/app-debug.apk
```

## Structure

```
android/
  build.sh                          # script de build (aapt/javac/dalvik-exchange/zipalign/apksigner)
  app/src/main/
    AndroidManifest.xml             # package fr.huetvasseur.rappelconsochecker, permissions INTERNET+CAMERA
    java/.../MainActivity.java      # WebView plein écran + gestion permission caméra
    res/                            # icône de l'app (dérivée de frontend/static/icons/icon-512.png), strings.xml
    assets/www/                     # copie du site (index.html, css, icônes) + app.js autonome
```

`assets/www/static/js/app.js` est une variante autonome de
`frontend/static/js/app.js` : même interface, mais `checkBarcode()` appelle
directement l'API RappelConso au lieu de passer par `/api/check/{barcode}`
(logique de correspondance GTIN portée depuis `backend/app/rappelconso.py`).
Si l'un des deux évolue fonctionnellement, penser à répercuter le
changement dans l'autre.

## Limites connues

- **Compilé contre l'API 23** (Android 6.0, 2015) faute de SDK plus récent
  accessible hors ligne. Le rendu réel dépend cependant du composant système
  *Android System WebView* (Chromium), mis à jour indépendamment par le
  Play Store sur l'appareil — donc `getUserMedia` (scan caméra) et le JS
  moderne fonctionnent normalement sur un téléphone à jour malgré cette
  contrainte de compilation.
- **CORS non vérifié en conditions réelles** : cette variante suppose que
  `data.economie.gouv.fr` autorise les appels `fetch` cross-origin depuis une
  page `file://` (comportement standard des API OpenDataSoft publiques,
  mais non testé ici — le réseau de l'environnement de développement bloque
  ce domaine). À vérifier en priorité après installation sur un vrai
  téléphone ; si le fetch échoue pour cette raison, il faudra soit héberger
  la variante PWA+backend (`frontend/`+`backend/` sur `main`) sur un serveur
  accessible et pointer le WebView vers cette URL au lieu des assets locaux,
  soit passer par un proxy CORS.
- APK signé avec une clé de **debug auto-générée**, adaptée au sideload
  personnel mais pas à une publication sur le Play Store (nécessiterait une
  vraie clé de release, gérée séparément).
- Pas d'émulateur Android disponible dans l'environnement de build : seule
  la structure de l'APK (contenu de l'archive, signature) a pu être
  vérifiée ; le fonctionnement réel (affichage, scan, appel réseau) est à
  valider sur un téléphone physique.
