# Objection Offline для Android — сборка и ключ подписи

Исходники Android-части лежат в `android/` рядом с программой для ПК (тот же код в `app/`, `main.js`, `storage.js`, `zipimport.js`).

## Устройство
- `src/com/objectionoffline/app/MainActivity.java` — WebView, отдача `https://objection.offline/app/…` (assets) и `/lib/…` (библиотека, Range), мосты `OOFS` / `OONet` / `OOApp`, выбор файлов, полный экран, «Назад», «Открыть с помощью».
- `js/` — подмены Node/Electron для `main.js` в WebView (`electron.js`, `fs.js`, `crypto.js`, `zlib.js`, `fetch.js`, `process.js`, `misc.js`), `entry.js` собирает `window.api`.
- `build-android.sh` — сборка без Gradle: esbuild → `assets/app/android-main.js` (+ правка index.html), aapt2, javac (11), d8 (min-api 29), zipalign, apksigner. Результат: `dist-android/ObjectionOfflineAndroid_Release<версия>.apk`; versionCode = a·10000 + b·100 + c.
- Инструменты: build-tools 35.0.1 и platform android-35 с dl.google.com (`build-tools_r35.0.1_linux.zip`, `platform-35_r02.zip`) в `/opt/android/bt`, `/opt/android/pf`; npm: esbuild, buffer, path-browserify, fflate (в `android/`).
- `harness/` — тестовая обвязка: Electron с теми же мостами на Node (`preload.js`) и перехватом https://objection.offline (`main.js`). Тесты: `test/a1.mjs`–`a4.mjs`.
- Эмулятор в песочнице не запускается (нет KVM).

## Ключ подписи
Файл `android/release.keystore` (alias `oo`) в репозиторий не входит: им подписаны все выпущенные APK, и новые версии ставятся поверх старых только с тем же ключом. Хранится у владельца проекта отдельно. Без него сборка возможна с новым ключом (`keytool -genkeypair -keystore android/release.keystore -alias oo …`), но такое приложение не обновит уже установленное.
