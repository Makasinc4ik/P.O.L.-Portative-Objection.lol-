#!/usr/bin/env bash
# Сборка для Linux x64: папка (tar.gz) и AppImage
set -euo pipefail
cd "$(dirname "$0")"
VER=33.4.11
ZIP=/tmp/el.zip
[ -f "$ZIP" ] || curl -sSL -o "$ZIP" "https://github.com/electron/electron/releases/download/v$VER/electron-v$VER-linux-x64.zip"
APPVER=$(node -p "require('./package.json').version")
OUT=dist-linux/ObjectionOffline
rm -rf dist-linux && mkdir -p "$OUT"
unzip -q "$ZIP" -d "$OUT"
mv "$OUT/electron" "$OUT/objection-offline"
rm -f "$OUT/resources/default_app.asar"
find "$OUT/locales" -name '*.pak' ! -name 'ru.pak' ! -name 'en-US.pak' -delete
mkdir -p "$OUT/resources/app"
cp -r main.js preload.js zipimport.js storage.js app "$OUT/resources/app/"
node -e "const p=require('./package.json');delete p.devDependencies;delete p.scripts;require('fs').writeFileSync('$OUT/resources/app/package.json',JSON.stringify(p,null,2))"
cp app/icon.png "$OUT/objection-offline.png"

# Запуск: если система запрещает «песочнице» Chromium работать без прав root — запускаем без неё
cat > "$OUT/ObjectionOffline.sh" <<'SH'
#!/bin/sh
HERE="$(cd "$(dirname "$0")" && pwd)"
FLAGS=""
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ] || [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = "0" ]; then
  if [ ! -u "$HERE/chrome-sandbox" ]; then FLAGS="--no-sandbox"; fi
fi
exec "$HERE/objection-offline" $FLAGS "$@"
SH
chmod +x "$OUT/ObjectionOffline.sh" "$OUT/objection-offline"

# Ярлык в меню приложений: ./ObjectionOffline.sh --install-shortcut не нужен — даём готовый .desktop и скрипт установки
cat > "$OUT/install-shortcut.sh" <<'SH'
#!/bin/sh
# Добавляет Objection Offline в меню приложений текущего пользователя
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/objection-offline.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Objection Offline
Comment=Офлайн-редактор сцен в стиле Ace Attorney
Exec="$HERE/ObjectionOffline.sh" %f
Icon=$HERE/objection-offline.png
Terminal=false
Categories=Graphics;AudioVideo;
MimeType=application/x-objection;
DESK
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "Готово: Objection Offline добавлен в меню приложений."
SH
chmod +x "$OUT/install-shortcut.sh"

# README для Linux
{ cat README.txt; cat <<'TXT'

LINUX
-----
Вариант 1 — AppImage (один файл):
  chmod +x ObjectionOfflineLinux64_Release*.AppImage
  ./ObjectionOfflineLinux64_Release*.AppImage
  Если не запускается с ошибкой про FUSE: ./файл.AppImage --appimage-extract-and-run
  (или установите libfuse2: sudo apt install libfuse2).
  Если ругается на «sandbox»: ./файл.AppImage --no-sandbox

Вариант 2 — папка (tar.gz):
  tar xzf ObjectionOfflineLinux64_Release*.tar.gz
  cd ObjectionOffline && ./ObjectionOffline.sh
  ./install-shortcut.sh — добавит программу в меню приложений.

Библиотека: ~/Документы/Objection Offline/Library (или ~/Documents/…).
Видео сохраняется в MP4 (H.264); звук на Linux кодируется в Opus — его
понимают VLC, mpv, браузеры, YouTube, Telegram и Discord.
TXT
} > "$OUT/README.txt"

TAR="ObjectionOfflineLinux64_Release${APPVER}.tar.gz"
(cd dist-linux && tar czf "$TAR" ObjectionOffline)

# AppImage
APPDIR=dist-linux/AppDir
cp -r "$OUT" "$APPDIR"
rm -f "$APPDIR/install-shortcut.sh"
cat > "$APPDIR/AppRun" <<'SH'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
# В AppImage chrome-sandbox не может быть setuid — без песочницы Chromium, если система её не даёт
FLAGS=""
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ] || [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = "0" ]; then FLAGS="--no-sandbox"; fi
exec "$HERE/objection-offline" $FLAGS "$@"
SH
chmod +x "$APPDIR/AppRun"
cat > "$APPDIR/objection-offline.desktop" <<'DESK'
[Desktop Entry]
Type=Application
Name=Objection Offline
Comment=Офлайн-редактор сцен в стиле Ace Attorney
Exec=objection-offline %f
Icon=objection-offline
Terminal=false
Categories=Graphics;
DESK
cp app/icon.png "$APPDIR/.DirIcon"
APPIMG="ObjectionOfflineLinux64_Release${APPVER}.AppImage"
ARCH=x86_64 /tmp/appimagetool --appimage-extract-and-run -n "$APPDIR" "dist-linux/$APPIMG" >/tmp/appimagetool.log 2>&1 || { tail -20 /tmp/appimagetool.log; exit 1; }
rm -rf "$APPDIR"
ls -la dist-linux
