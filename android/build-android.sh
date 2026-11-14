#!/bin/bash
# Сборка APK для Android (без Gradle): esbuild → assets, aapt2 → ресурсы, javac + d8 → код, apksigner → подпись
set -e
cd "$(dirname "$0")"
ROOT=$(cd .. && pwd)
SDK=${ANDROID_TOOLS:-/opt/android}
BT=$SDK/bt/android-15
JAR=$SDK/pf/android-35/android.jar
APPVER=$(node -p "require('$ROOT/package.json').version")
VCODE=${VCODE:-$(node -p "const [a,b,c]=require('$ROOT/package.json').version.split('.').map(Number); a*10000+b*100+c")}
OUT=build
rm -rf $OUT && mkdir -p $OUT/assets/app $OUT/classes $OUT/dex $OUT/res

# 1. браузерная часть + «главный процесс» одним файлом
cp -r $ROOT/app/. $OUT/assets/app/
node_modules/.bin/esbuild js/entry.js --bundle --format=iife --platform=browser --target=chrome100 \
  --alias:electron=./js/electron.js --alias:fs=./js/fs.js --alias:crypto=./js/crypto.js --alias:zlib=./js/zlib.js \
  --alias:path=path-browserify --alias:url=./js/misc.js --alias:stream=./js/misc.js \
  --define:fetch=__ooFetch --define:process=__ooProcess --define:Buffer=__ooBuffer --define:global=globalThis --define:__dirname='"/app"' \
  --log-level=warning --outfile=$OUT/assets/app/android-main.js
# перед остальными скриптами страницы
python3 - "$OUT/assets/app/index.html" <<'PY'
import sys,re
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
s=s.replace('<head>','<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',1)
i=s.index('<script')
s=s[:i]+'<script src="android-main.js"></script>\n  '+s[i:]
s=s.replace('<body>','<body class="android">',1)
open(p,'w',encoding='utf-8').write(s)
PY

# 2. ресурсы и манифест
$BT/aapt2 compile --dir res -o $OUT/res.zip
$BT/aapt2 link -I $JAR --manifest AndroidManifest.xml -A $OUT/assets -R $OUT/res.zip \
  --min-sdk-version 29 --target-sdk-version 34 --version-code $VCODE --version-name "$APPVER" \
  --auto-add-overlay -o $OUT/unsigned.apk

# 3. код
javac -encoding UTF-8 -source 11 -target 11 -Xlint:-options -classpath $JAR -d $OUT/classes $(find src -name '*.java')
$BT/d8 --release --min-api 29 --lib $JAR --output $OUT/dex $(find $OUT/classes -name '*.class')
(cd $OUT/dex && zip -q -j ../unsigned.apk classes.dex)

# 4. выравнивание и подпись (ключ один и тот же — обновления ставятся поверх)
$BT/zipalign -f -p 4 $OUT/unsigned.apk $OUT/aligned.apk
NAME="ObjectionOfflineAndroid_Release${APPVER}.apk"
mkdir -p ../dist-android
# пароль ключа — из переменной OO_KS_PASS или файла keystore.pass (оба не в репозитории)
KS_PASS=${OO_KS_PASS:-$(cat keystore.pass 2>/dev/null)}
[ -f release.keystore ] && [ -n "$KS_PASS" ] || { echo "Нет release.keystore или пароля (OO_KS_PASS / keystore.pass) — см. BUILD-public.md"; exit 1; }
$BT/apksigner sign --ks release.keystore --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --ks-key-alias oo \
  --out ../dist-android/$NAME $OUT/aligned.apk
$BT/apksigner verify ../dist-android/$NAME && ls -la ../dist-android/$NAME
