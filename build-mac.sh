#!/usr/bin/env bash
# Сборка для macOS (Intel) начиная с 10.13 High Sierra.
# Новые Electron не работают на macOS старше 10.15, поэтому здесь Electron 26 — последний с поддержкой 10.13.
set -euo pipefail
cd "$(dirname "$0")"
VER=26.6.10
ZIP=/tmp/e26-mac.zip
[ -f "$ZIP" ] || curl -sSL -o "$ZIP" "https://github.com/electron/electron/releases/download/v$VER/electron-v$VER-darwin-x64.zip"
DIST=dist-mac
APP="$DIST/Objection Offline.app"
rm -rf "$DIST" && mkdir -p "$DIST"
unzip -q "$ZIP" -d "$DIST"
mv "$DIST/Electron.app" "$APP"
rm -f "$APP/Contents/Resources/default_app.asar"
# оставляем только русскую и английскую локали
find "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources" -maxdepth 1 -name '*.lproj' ! -name 'ru.lproj' ! -name 'en.lproj' -exec rm -rf {} +
mkdir -p "$APP/Contents/Resources/app"
cp -r main.js preload.js zipimport.js storage.js app "$APP/Contents/Resources/app/"
node -e "const p=require('./package.json');delete p.devDependencies;delete p.scripts;require('fs').writeFileSync('$APP/Contents/Resources/app/package.json',JSON.stringify(p,null,2))"
APPVER=$(node -p "require('./package.json').version")
# имя программы и значок
python3 - "$APP" "$APPVER" <<'PY'
import sys, plistlib
from PIL import Image
app, ver = sys.argv[1], sys.argv[2]
p = app + '/Contents/Info.plist'
d = plistlib.load(open(p, 'rb'))
d.update({'CFBundleName': 'Objection Offline', 'CFBundleDisplayName': 'Objection Offline', 'CFBundleIdentifier': 'lol.objection.offline',
          'CFBundleShortVersionString': ver, 'CFBundleVersion': ver, 'LSMinimumSystemVersion': '10.13.0', 'NSHumanReadableCopyright': 'Objection Offline'})
d['CFBundleDocumentTypes'] = [{'CFBundleTypeName': 'Objection project', 'CFBundleTypeExtensions': ['objection'], 'CFBundleTypeRole': 'Editor'}]
plistlib.dump(d, open(p, 'wb'))
im = Image.open('app/icon.png').convert('RGBA')
im.save(app + '/Contents/Resources/electron.icns', sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512)])
PY
cp README.txt "$DIST/README.txt"
cat >> "$DIST/README.txt" <<'TXT'

macOS (Intel, 10.13 и новее)
----------------------------
1. Перетащите «Objection Offline.app» в папку «Программы» (или оставьте где угодно).
2. Первый запуск: щёлкните по программе ПРАВОЙ кнопкой (или с Ctrl) → «Открыть» → «Открыть».
   Программа не подписана сертификатом Apple, поэтому обычный двойной щелчок в первый раз
   macOS не разрешит. Дальше она запускается как обычно.
3. Если macOS пишет, что программа «повреждена», откройте «Терминал» и выполните:
      xattr -cr "/Applications/Objection Offline.app"
   (путь — где лежит программа), затем снова «Открыть».
Библиотека лежит в «Документы/Objection Offline/Library», как и на Windows.
На Mac с процессором Apple (M1 и новее) эта версия работает через Rosetta.
TXT
NAME="ObjectionOfflineMacIntel_Release${APPVER}.zip"
# -y: внутри .app есть символические ссылки (фреймворки), их нужно сохранить
(cd "$DIST" && zip -qr -y -9 "$NAME" "Objection Offline.app" README.txt)
echo "Собрано: $DIST/$NAME"
ls -la "$DIST"
