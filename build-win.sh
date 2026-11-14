#!/usr/bin/env bash
# Сборка портативной версии для Windows x64 из готового Electron
set -euo pipefail
cd "$(dirname "$0")"
VER=33.4.11
# ARCH=x64 (по умолчанию) или ARCH=ia32 — для 32-битной Windows
ARCH=${ARCH:-x64}
if [ "$ARCH" = "ia32" ]; then ZIP=/tmp/e32.zip; DIST=dist32; BITS=32; else ZIP=/tmp/e.zip; DIST=dist; BITS=64; fi
[ -f "$ZIP" ] || curl -sSL -o "$ZIP" "https://github.com/electron/electron/releases/download/v$VER/electron-v$VER-win32-$ARCH.zip"
OUT=$DIST/ObjectionOffline
rm -rf "$DIST" && mkdir -p "$OUT"
unzip -q "$ZIP" -d "$OUT"
mv "$OUT/electron.exe" "$OUT/ObjectionOffline.exe"
rm -f "$OUT/resources/default_app.asar"
# оставляем только русскую и английскую локали Chromium
find "$OUT/locales" -name '*.pak' ! -name 'ru.pak' ! -name 'en-US.pak' -delete
mkdir -p "$OUT/resources/app"
cp -r main.js preload.js zipimport.js storage.js app "$OUT/resources/app/"
node -e "const p=require('./package.json');delete p.devDependencies;delete p.scripts;require('fs').writeFileSync('$OUT/resources/app/package.json',JSON.stringify(p,null,2))"
cp README.txt "$OUT/README.txt"
# README в кодировке Windows не нужен: Блокнот понимает UTF-8, добавим BOM для надёжности
python3 -c "import sys;p=sys.argv[1];s=open(p,encoding='utf-8-sig').read();open(p,'w',encoding='utf-8-sig').write(s)" "$OUT/README.txt"
APPVER=$(node -p "require('./package.json').version")
NAME="ObjectionOfflineWin${BITS}_Release${APPVER}.zip"
(cd "$DIST" && zip -qr -9 "$NAME" ObjectionOffline)
echo "Собрано: $DIST/$NAME"
ls -la "$DIST"
