#!/usr/bin/env bash
# Build a debug-signed APK for Rappel Conso Checker without Gradle/Android
# Studio, using the classic command-line Android tools packaged by Ubuntu
# (aapt, dalvik-exchange, zipalign, apksigner) against the API 23 platform
# jar shipped in android-sdk-platform-23. See android/README.md for the
# required apt packages and known limitations.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
SRC="app/src/main"
BUILD="build"
# Kept outside $BUILD (which is wiped on every run) so the same debug
# signing identity is reused across builds instead of being regenerated.
KEYSTORE="debug.keystore"

if [ ! -f "$ANDROID_JAR" ]; then
  echo "android.jar introuvable à $ANDROID_JAR (paquet android-sdk-platform-23 installé ?)" >&2
  exit 1
fi

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/classes"

echo "==> Compilation des ressources (aapt) + génération de R.java"
aapt package -f -m -J "$BUILD/gen" -M "$SRC/AndroidManifest.xml" -S "$SRC/res" -I "$ANDROID_JAR"

echo "==> Compilation Java"
find "$BUILD/gen" "$SRC/java" -name "*.java" > "$BUILD/sources.txt"
javac -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" \
  -d "$BUILD/classes" -source 8 -target 8 -nowarn @"$BUILD/sources.txt"

echo "==> Génération du classes.dex"
dalvik-exchange --dex --output="$BUILD/classes.dex" "$BUILD/classes"

echo "==> Packaging des ressources, du manifeste et des assets"
aapt package -f -M "$SRC/AndroidManifest.xml" -S "$SRC/res" -A "$SRC/assets" \
  -I "$ANDROID_JAR" -F "$BUILD/app-unsigned.apk"

echo "==> Ajout de classes.dex à l'APK"
(cd "$BUILD" && aapt add app-unsigned.apk classes.dex)

echo "==> Alignement (zipalign)"
zipalign -f 4 "$BUILD/app-unsigned.apk" "$BUILD/app-aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  echo "==> Génération d'un keystore de debug (local, non versionné)"
  keytool -genkeypair -v -keystore "$KEYSTORE" -storepass android -alias androiddebugkey \
    -keypass android -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Rappel Conso Checker Debug,O=Debug,C=FR"
fi

echo "==> Signature (apksigner)"
apksigner sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey --out "$BUILD/app-debug.apk" "$BUILD/app-aligned.apk"

apksigner verify "$BUILD/app-debug.apk"

echo
echo "APK prêt : $SCRIPT_DIR/$BUILD/app-debug.apk"
