# Rappel Conso Checker — variante APK Android

Empaquetage natif (WebView) du site web déjà présent sur `main`
(`frontend/`), pour installation directe sur Android sous forme de fichier
`.apk`. Le site (`frontend/`) est lui-même 100% statique — pas de backend —
et le JavaScript embarqué dans l'APK appelle directement l'API RappelConso
(`data.economie.gouv.fr`) depuis la WebView, exactement comme le fait
`frontend/static/js/app.js`.

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
    assets/www/                     # copie du site (index.html, css, icônes, app.js)
```

`assets/www/` est une copie de `frontend/` (à l'identique pour `style.css`
et `static/js/app.js` ; `index.html` diffère seulement par l'absence des
balises `<link>` vers `manifest.json`/`apple-touch-icon`, propres à la PWA
et sans objet dans un wrapper natif — `manifest.json` et
`service-worker.js` ne sont pas embarqués non plus, pour la même raison).
Une seule logique applicative à maintenir : après toute modification de
`frontend/`, recopier les fichiers concernés ici puis relancer
`./build.sh`.

## Limites connues

- **Compilé contre l'API 23** (Android 6.0, 2015) faute de SDK plus récent
  accessible hors ligne. Le rendu réel dépend cependant du composant système
  *Android System WebView* (Chromium), mis à jour indépendamment par le
  Play Store sur l'appareil — donc `getUserMedia` (scan caméra) et le JS
  moderne fonctionnent normalement sur un téléphone à jour malgré cette
  contrainte de compilation.
- **CORS** : confirmé en conditions réelles (`access-control-allow-origin: *`
  renvoyé par l'API RappelConso), donc l'appel `fetch` cross-origin depuis
  la WebView (origine `file://`) devrait fonctionner. Reste à confirmer
  spécifiquement le comportement de `file://` comme "secure context" pour
  `getUserMedia` (scan caméra) sur un vrai appareil — comportement standard
  des WebView Chromium modernes, mais non testé faute d'émulateur/téléphone
  disponible dans l'environnement de build.
- APK signé avec une clé de **debug auto-générée**, adaptée au sideload
  personnel mais pas à une publication sur le Play Store (nécessiterait une
  vraie clé de release, gérée séparément).
- Pas d'émulateur Android disponible dans l'environnement de build : seule
  la structure de l'APK (contenu de l'archive, signature) a pu être
  vérifiée ; le fonctionnement réel (affichage, scan, appel réseau) est à
  valider sur un téléphone physique.
