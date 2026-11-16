# P.O.L. — устройство и сборка

Офлайн-редактор сцен в стиле Ace Attorney — аналог [objection.lol](https://objection.lol), который работает без интернета.
*An offline Ace Attorney-style scene maker modeled on objection.lol. The interface is available in Russian and English.*

- Открывает проекты `.objection` с objection.lol и докачивает нужных персонажей, фоны и музыку в локальную библиотеку.
- Редактор кадров, проигрыватель, библиотека ресурсов (свои персонажи, текстбоксы, улики, картинки), сцены с автосохранением.
- Экспорт видео в MP4 (WebCodecs), форматы 16:9, 4:3, 3:2, 21:9, 9:16.
- Windows (64/32 бит), Linux, macOS Intel 10.13+, Android 10+.

Подробное описание возможностей и истории версий — в [README.txt](README.txt) (он же кладётся в архивы программы).

## Устройство

| Путь | Что там |
|---|---|
| `main.js`, `preload.js` | главный процесс Electron: библиотека, скачивание с objection.lol, сцены, запись видео |
| `storage.js`, `zipimport.js` | раскладка библиотеки на диске, импорт персонажей из ZIP |
| `app/` | интерфейс: `index.html`, `style.css`, `js/` (редактор, проигрыватель, библиотека, экспорт) |
| `app/js/i18n.js`, `app/js/lang-en.js` | перевод интерфейса (строки обёрнуты в `tx(…)`, ключ — русская строка) |
| `tools/` | сборка перевода: `i18n-keys.cjs` → `tools/i18n/keys.json`, переводы `tools/i18n/en/*.json`, `i18n-build.cjs` → `app/js/lang-en.js` |
| `android/` | версия для Android: оболочка WebView (`src/`), подмены Node/Electron (`js/`), сборка без Gradle — см. [android/BUILD-public.md](android/BUILD-public.md) |
| `test/*.mjs` | тесты на Playwright (Electron под xvfb) |

## Сборка

Нужны Node.js 18+ и Linux (сборки для всех платформ делаются на Linux).

```bash
npm install                      # Electron для запуска и тестов
npx electron .                   # запустить из исходников
bash build-win.sh                # Windows 64 → dist/
ARCH=ia32 bash build-win.sh      # Windows 32 → dist32/
bash build-linux.sh              # Linux AppImage и tar.gz → dist-linux/ (нужен appimagetool в /tmp)
bash build-mac.sh                # macOS Intel → dist-mac/
cd android && npm install && bash build-android.sh   # APK → dist-android/
```

Скрипты сами скачивают нужную версию Electron с GitHub.

## Выпуски и проверка обновлений

Программа (Файл → «Проверить обновления…», а также сама при запуске раз в день) читает `https://api.github.com/repos/Makasinc4ik/P.O.L.-Portative-Objection.lol-/releases`. Учитываются выпуски, которые не черновики и не пре-релизы; версия берётся из тега (`v1.1.0` или `1.1.0`) и сравнивается с `version` в `package.json`. Чтобы кнопка «Скачать» открывала файл нужной системы, к выпуску прикрепляются архивы с обычными именами: `…Win64…`, `…Win32…`, `…Linux64….AppImage`, `…MacIntel….zip`, `…Android….apk`.

## Видеоуроки

Кнопка «?» в программе читает `tutorials.json` из корня ветки `main` этого репозитория (если GitHub недоступен — копию `app/tutorials.json` внутри программы). Формат:

```json
{
  "videos": [
    { "title": "Первая сцена за 5 минут", "title_en": "First scene in 5 minutes", "url": "https://www.youtube.com/watch?v=…", "note": "по желанию", "note_en": "optional" }
  ]
}
```

Достаточно отредактировать файл на GitHub — у всех установленных версий список обновится при следующем открытии окна.

## Права

Код программы — авторов проекта. Персонажи, фоны и музыка Ace Attorney принадлежат Capcom; в репозитории их нет — программа скачивает их с objection.lol на компьютер пользователя для личного использования. `app/vendor/mp4-muxer.js` — библиотека [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (лицензия MIT, см. `mp4-muxer.LICENSE.txt`).
