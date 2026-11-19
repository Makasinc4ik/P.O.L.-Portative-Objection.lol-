package com.objectionoffline.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Objection Offline для Android: системный WebView с тем же интерфейсом, что и на ПК.
 * Страница открывается с https://objection.offline/ — эти адреса не уходят в сеть, их отдаёт само приложение:
 *   /app/...  — файлы программы из APK (assets/app),
 *   /lib/...  — файлы библиотеки (с поддержкой Range для звука и видео).
 * Мосты для JavaScript: OOFS (файлы, синхронно), OONet (сеть в обход CORS, асинхронно), OOApp (система).
 */
public class MainActivity extends Activity {
    static final String TAG = "ObjectionOffline";
    static final String HOST = "objection.offline";
    static final String START_URL = "https://" + HOST + "/app/index.html";
    static final int REQ_FILES = 41;

    WebView web;
    FrameLayout root;
    View customView;
    WebChromeClient.CustomViewCallback customCb;
    ValueCallback<Uri[]> fileCb;
    File libRoot;
    final ExecutorService pool = Executors.newFixedThreadPool(24);
    final ConcurrentHashMap<String, HttpURLConnection> active = new ConcurrentHashMap<>();
    final ConcurrentHashMap<String, Boolean> cancelled = new ConcurrentHashMap<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.parseColor("#1a7f72"));
        getWindow().setNavigationBarColor(Color.parseColor("#15171c"));
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        File ext = getExternalFilesDir(null);
        libRoot = new File(ext != null ? ext : getFilesDir(), "Library");
        libRoot.mkdirs();

        WebView.setWebContentsDebuggingEnabled(true);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#15171c"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#15171c"));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.addJavascriptInterface(new FsBridge(), "OOFS");
        web.addJavascriptInterface(new NetBridge(), "OONet");
        web.addJavascriptInterface(new AppBridge(), "OOApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        if (web.getUrl() == null) web.loadUrl(START_URL);
        if (savedInstanceState == null) handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    // ---------- Открыть файл проекта из другого приложения ----------
    final Object launchLock = new Object();
    volatile boolean pageReady = false;
    volatile String pendingFile = null;

    @SuppressWarnings("deprecation")
    void handleIntent(Intent i) {
        if (i == null) return;
        Uri u = null;
        if (Intent.ACTION_VIEW.equals(i.getAction())) u = i.getData();
        else if (Intent.ACTION_SEND.equals(i.getAction())) u = i.getParcelableExtra(Intent.EXTRA_STREAM);
        if (u == null) return;
        final Uri src = u;
        pool.execute(() -> {
            try {
                String name = displayName(src, "project.objection").replaceAll("[\\\\/:*?\"<>|]+", "_");
                File dir = new File(getCacheDir(), "picked");
                dir.mkdirs();
                File f = new File(dir, name);
                try (InputStream in = getContentResolver().openInputStream(src); OutputStream out = new FileOutputStream(f)) {
                    if (in == null) throw new IOException("openInputStream");
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                String path = f.getAbsolutePath();
                synchronized (launchLock) {
                    if (pageReady) {
                        final String js = "window.__ooOpenFile && window.__ooOpenFile(" + JSONObject.quote(path) + ")";
                        web.post(() -> web.evaluateJavascript(js, null));
                    } else pendingFile = path;
                }
            } catch (Exception e) {
                Log.w(TAG, "open intent", e);
                runOnUiThread(() -> Toast.makeText(this, "Не удалось открыть файл: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        pool.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    // «Назад»: сначала полный экран, потом окна программы (как Esc), иначе — свернуть приложение
    @Override
    public void onBackPressed() {
        if (customView != null) { exitCustomView(); return; }
        web.evaluateJavascript("(window.__ooBack && window.__ooBack()) ? 'y' : 'n'", (v) -> {
            if (v == null || !v.contains("y")) moveTaskToBack(true);
        });
    }

    void exitCustomView() {
        if (customCb != null) customCb.onCustomViewHidden();
        else hideCustom();
    }

    void hideCustom() {
        if (customView != null) root.removeView(customView);
        customView = null;
        customCb = null;
        web.setVisibility(View.VISIBLE);
        setFullscreenUi(false);
    }

    @SuppressWarnings("deprecation")
    void setFullscreenUi(boolean on) {
        View d = getWindow().getDecorView();
        if (on) {
            d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        } else {
            d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    // ---------- Выбор файлов (<input type=file>) ----------
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILES || fileCb == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[] { data.getData() };
            }
        }
        fileCb.onReceiveValue(result);
        fileCb = null;
    }

    class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            String[] mimes = mimeTypesOf(params.getAcceptTypes());
            if (mimes.length > 0) i.putExtra(Intent.EXTRA_MIME_TYPES, mimes);
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(i, REQ_FILES);
            } catch (ActivityNotFoundException e) {
                fileCb = null;
                return false;
            }
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) { callback.onCustomViewHidden(); return; }
            customView = view;
            customCb = callback;
            root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            web.setVisibility(View.INVISIBLE);
            setFullscreenUi(true);
        }

        @Override
        public void onHideCustomView() { hideCustom(); }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            Log.d(TAG, m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
            return true;
        }
    }

    // Типы из accept="..." (только MIME; расширения вроде .objection Android не понимает — тогда любые файлы)
    static String[] mimeTypesOf(String[] accept) {
        if (accept == null) return new String[0];
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        for (String a : accept) {
            if (a == null) continue;
            for (String p : a.split(",")) {
                p = p.trim();
                if (p.isEmpty()) continue;
                if (!p.contains("/")) return new String[0];
                out.add(p);
            }
        }
        return out.toArray(new String[0]);
    }

    // ---------- Отдача файлов программы и библиотеки ----------
    class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String p = u.getPath() == null ? "/" : u.getPath();
            try {
                if (p.startsWith("/app/")) return serveAsset(p.substring(5));
                if (p.startsWith("/lib/")) return serveFile(new File(libRoot, p.substring(5)), req.getRequestHeaders());
            } catch (Exception e) {
                Log.w(TAG, "serve " + p, e);
            }
            return notFound();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            openExternalUri(u);
            return true;
        }
    }

    static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new java.io.ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    static final Map<String, String> MIME = new HashMap<>();
    static {
        String[][] m = {
            {"html", "text/html"}, {"js", "text/javascript"}, {"mjs", "text/javascript"}, {"css", "text/css"}, {"json", "application/json"},
            {"png", "image/png"}, {"apng", "image/apng"}, {"gif", "image/gif"}, {"webp", "image/webp"}, {"jpg", "image/jpeg"}, {"jpeg", "image/jpeg"},
            {"jfif", "image/jpeg"}, {"avif", "image/avif"}, {"bmp", "image/bmp"}, {"svg", "image/svg+xml"}, {"ico", "image/x-icon"},
            {"mp3", "audio/mpeg"}, {"ogg", "audio/ogg"}, {"oga", "audio/ogg"}, {"opus", "audio/ogg"}, {"wav", "audio/wav"}, {"m4a", "audio/mp4"},
            {"aac", "audio/aac"}, {"flac", "audio/flac"}, {"weba", "audio/webm"}, {"webm", "video/webm"}, {"mp4", "video/mp4"},
            {"woff", "font/woff"}, {"woff2", "font/woff2"}, {"ttf", "font/ttf"}, {"otf", "font/otf"}, {"txt", "text/plain"},
        };
        for (String[] x : m) MIME.put(x[0], x[1]);
    }

    static String mimeOf(String name) {
        int i = name.lastIndexOf('.');
        String ext = i >= 0 ? name.substring(i + 1).toLowerCase(Locale.ROOT) : "";
        String t = MIME.get(ext);
        return t != null ? t : "application/octet-stream";
    }

    static Map<String, String> baseHeaders() {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        h.put("Access-Control-Allow-Origin", "*");
        return h;
    }

    WebResourceResponse serveAsset(String rel) throws IOException {
        if (rel.isEmpty() || rel.endsWith("/")) rel = rel + "index.html";
        if (rel.contains("..")) return notFound();
        AssetManager am = getAssets();
        InputStream in;
        try { in = am.open("app/" + rel, AssetManager.ACCESS_STREAMING); } catch (IOException e) { return notFound(); }
        String mime = mimeOf(rel);
        boolean text = mime.startsWith("text/") || mime.equals("application/json");
        return new WebResourceResponse(mime, text ? "utf-8" : null, 200, "OK", baseHeaders(), in);
    }

    WebResourceResponse serveFile(File f, Map<String, String> reqHeaders) throws IOException {
        String canon = f.getCanonicalPath();
        if (!canon.startsWith(libRoot.getCanonicalPath()) || !f.isFile()) return notFound();
        long size = f.length();
        String mime = mimeOf(f.getName());
        Map<String, String> h = baseHeaders();
        h.put("Accept-Ranges", "bytes");
        String range = null;
        if (reqHeaders != null) for (Map.Entry<String, String> e : reqHeaders.entrySet()) if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
        if (range != null && range.startsWith("bytes=") && size > 0) {
            String spec = range.substring(6).split(",")[0].trim();
            int dash = spec.indexOf('-');
            long start = 0, end = size - 1;
            try {
                String a = dash >= 0 ? spec.substring(0, dash).trim() : spec;
                String b = dash >= 0 ? spec.substring(dash + 1).trim() : "";
                if (a.isEmpty() && !b.isEmpty()) start = Math.max(0, size - Long.parseLong(b));
                else {
                    start = a.isEmpty() ? 0 : Long.parseLong(a);
                    if (!b.isEmpty()) end = Math.min(size - 1, Long.parseLong(b));
                }
            } catch (NumberFormatException e) { start = 0; end = size - 1; }
            if (start >= size || start > end) {
                h.put("Content-Range", "bytes */" + size);
                WebResourceResponse r = new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", h, new java.io.ByteArrayInputStream(new byte[0]));
                return r;
            }
            FileInputStream in = new FileInputStream(f);
            long skipped = 0;
            while (skipped < start) { long k = in.skip(start - skipped); if (k <= 0) break; skipped += k; }
            h.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
            h.put("Content-Length", String.valueOf(end - start + 1));
            return new WebResourceResponse(mime, null, 206, "Partial Content", h, new Limited(in, end - start + 1));
        }
        h.put("Content-Length", String.valueOf(size));
        return new WebResourceResponse(mime, null, 200, "OK", h, new FileInputStream(f));
    }

    static class Limited extends FilterInputStream {
        long left;
        Limited(InputStream in, long n) { super(in); left = n; }
        @Override public int read() throws IOException { if (left <= 0) return -1; int b = super.read(); if (b >= 0) left--; return b; }
        @Override public int read(byte[] buf, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = super.read(buf, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }
    }

    // ---------- Мост: файлы (синхронно, пути абсолютные) ----------
    class FsBridge {
        @JavascriptInterface public boolean exists(String p) { return new File(p).exists(); }

        @JavascriptInterface public String stat(String p) {
            File f = new File(p);
            if (!f.exists()) return "";
            try {
                JSONObject o = new JSONObject();
                o.put("size", f.isFile() ? f.length() : 0);
                o.put("mtimeMs", f.lastModified());
                o.put("isDir", f.isDirectory());
                o.put("isFile", f.isFile());
                return o.toString();
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface public String readdir(String p) {
            String[] names = new File(p).list();
            if (names == null) return "";
            JSONArray a = new JSONArray();
            for (String n : names) a.put(n);
            return a.toString();
        }

        /** [[имя, это_папка], …] */
        @JavascriptInterface public String readdirTypes(String p) {
            File[] kids = new File(p).listFiles();
            if (kids == null) return "";
            JSONArray a = new JSONArray();
            for (File k : kids) { JSONArray e = new JSONArray(); e.put(k.getName()); e.put(k.isDirectory()); a.put(e); }
            return a.toString();
        }

        @JavascriptInterface public boolean mkdirs(String p) { File f = new File(p); return f.isDirectory() || f.mkdirs(); }

        @JavascriptInterface public String readText(String p) {
            try { return new String(readAll(new File(p)), StandardCharsets.UTF_8); } catch (IOException e) { return null; }
        }

        @JavascriptInterface public String readB64(String p) {
            try { return Base64.encodeToString(readAll(new File(p)), Base64.NO_WRAP); } catch (IOException e) { return null; }
        }

        /** Первые n байт файла (base64) — узнать тип файла, не читая его целиком */
        @JavascriptInterface public String head(String p, int n) {
            try (InputStream in = new FileInputStream(p)) {
                byte[] b = new byte[Math.max(0, n)];
                int got = 0, r;
                while (got < b.length && (r = in.read(b, got, b.length - got)) > 0) got += r;
                return Base64.encodeToString(b, 0, got, Base64.NO_WRAP);
            } catch (IOException e) { return null; }
        }

        /** Распаковать ZIP в папку (проект с ресурсами); имена с «../» не выходят за пределы папки */
        @JavascriptInterface public String unzip(String zip, String dest) {
            try (ZipInputStream zin = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip), 1 << 16))) {
                File root = new File(dest).getCanonicalFile();
                root.mkdirs();
                byte[] buf = new byte[1 << 16];
                ZipEntry e;
                while ((e = zin.getNextEntry()) != null) {
                    File out = new File(root, e.getName()).getCanonicalFile();
                    if (!out.getPath().startsWith(root.getPath() + File.separator)) continue;
                    if (e.isDirectory()) { out.mkdirs(); continue; }
                    File parent = out.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try (OutputStream os = new FileOutputStream(out)) {
                        int n;
                        while ((n = zin.read(buf)) > 0) os.write(buf, 0, n);
                    }
                }
                return "ok";
            } catch (Exception ex) {
                return "error:" + ex.getMessage();
            }
        }

        @JavascriptInterface public boolean writeText(String p, String text, boolean append) {
            return write(new File(p), text.getBytes(StandardCharsets.UTF_8), append);
        }

        @JavascriptInterface public boolean writeB64(String p, String b64, boolean append) {
            try { return write(new File(p), Base64.decode(b64, Base64.DEFAULT), append); } catch (IllegalArgumentException e) { return false; }
        }

        @JavascriptInterface public boolean writeAt(String p, String b64, double position) {
            try (RandomAccessFile f = new RandomAccessFile(p, "rw")) {
                f.seek((long) position);
                f.write(Base64.decode(b64, Base64.DEFAULT));
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface public boolean truncate(String p, double len) {
            try (RandomAccessFile f = new RandomAccessFile(p, "rw")) { f.setLength((long) len); return true; } catch (Exception e) { return false; }
        }

        @JavascriptInterface public boolean rename(String a, String b) {
            File fa = new File(a), fb = new File(b);
            File parent = fb.getParentFile();
            if (parent != null) parent.mkdirs();
            if (fb.exists() && fb.isFile()) fb.delete();
            if (fa.renameTo(fb)) return true;
            if (fa.isFile() && copyFile(fa, fb)) { fa.delete(); return true; }
            return false;
        }

        @JavascriptInterface public boolean copy(String a, String b) {
            File fb = new File(b);
            File parent = fb.getParentFile();
            if (parent != null) parent.mkdirs();
            return copyFile(new File(a), fb);
        }

        @JavascriptInterface public boolean remove(String p, boolean recursive) {
            File f = new File(p);
            if (!f.exists()) return true;
            if (f.isDirectory() && recursive) return deleteTree(f);
            return f.delete();
        }

        @JavascriptInterface public String sha1(String p) {
            try (InputStream in = new FileInputStream(p)) {
                MessageDigest md = MessageDigest.getInstance("SHA-1");
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
                StringBuilder sb = new StringBuilder();
                for (byte x : md.digest()) sb.append(String.format(Locale.ROOT, "%02x", x));
                return sb.toString();
            } catch (Exception e) { return null; }
        }

        @JavascriptInterface public boolean sameBytes(String a, String b) {
            File fa = new File(a), fb = new File(b);
            if (!fa.isFile() || !fb.isFile() || fa.length() != fb.length()) return false;
            try (InputStream x = new FileInputStream(fa); InputStream y = new FileInputStream(fb)) {
                byte[] bx = new byte[65536], by = new byte[65536];
                for (;;) {
                    int nx = readFully(x, bx), ny = readFully(y, by);
                    if (nx != ny) return false;
                    if (nx <= 0) return true;
                    for (int i = 0; i < nx; i++) if (bx[i] != by[i]) return false;
                }
            } catch (IOException e) { return false; }
        }
    }

    static int readFully(InputStream in, byte[] buf) throws IOException {
        int off = 0;
        while (off < buf.length) { int n = in.read(buf, off, buf.length - off); if (n < 0) break; off += n; }
        return off;
    }

    static byte[] readAll(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) { return readStream(in); }
    }

    static byte[] readStream(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    static boolean write(File f, byte[] data, boolean append) {
        File parent = f.getParentFile();
        if (parent != null) parent.mkdirs();
        try (OutputStream out = new FileOutputStream(f, append)) { out.write(data); return true; } catch (IOException e) { return false; }
    }

    static boolean copyFile(File a, File b) {
        try (InputStream in = new FileInputStream(a); OutputStream out = new FileOutputStream(b)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return true;
        } catch (IOException e) { return false; }
    }

    static boolean deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        return f.delete();
    }

    // ---------- Мост: сеть (в обход CORS; результат — window.__ooNetDone(id, json)) ----------
    class NetBridge {
        /** headers — JSON-объект; body — текст или ""; toFile — куда записать тело ("" — вернуть в base64) */
        @JavascriptInterface public void request(final String id, final String url, final String method, final String headers, final String body, final String toFile) {
            pool.execute(() -> {
                JSONObject res = new JSONObject();
                HttpURLConnection c = null;
                try {
                    String cur = url;
                    int redirects = 0;
                    for (;;) {
                        c = (HttpURLConnection) new URL(cur).openConnection();
                        active.put(id, c);
                        c.setInstanceFollowRedirects(false);
                        c.setConnectTimeout(30000);
                        c.setReadTimeout(30000);
                        c.setRequestMethod(method == null || method.isEmpty() ? "GET" : method);
                        if (headers != null && !headers.isEmpty()) {
                            JSONObject h = new JSONObject(headers);
                            Iterator<String> it = h.keys();
                            while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.optString(k)); }
                        }
                        if (body != null && !body.isEmpty()) {
                            c.setDoOutput(true);
                            byte[] b = body.getBytes(StandardCharsets.UTF_8);
                            c.setFixedLengthStreamingMode(b.length);
                            try (OutputStream o = c.getOutputStream()) { o.write(b); }
                        }
                        int code = c.getResponseCode();
                        if (code >= 300 && code < 400 && code != 304 && redirects < 8) {
                            String loc = c.getHeaderField("Location");
                            if (loc != null) {
                                cur = new URL(new URL(cur), loc).toString();
                                redirects++;
                                c.disconnect();
                                continue;
                            }
                        }
                        break;
                    }
                    if (cancelled.containsKey(id)) throw new IOException("aborted");
                    int code = c.getResponseCode();
                    res.put("status", code);
                    res.put("url", c.getURL().toString());
                    JSONObject rh = new JSONObject();
                    for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                        if (e.getKey() == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                        rh.put(e.getKey().toLowerCase(Locale.ROOT), e.getValue().get(0));
                    }
                    res.put("headers", rh);
                    // заголовки пришли — JavaScript может решать дальше, тело докачивается (ожидание ответа ≠ время скачивания)
                    final String head = "window.__ooNetHead && window.__ooNetHead(" + JSONObject.quote(id) + "," + res.toString() + ")";
                    web.post(() -> web.evaluateJavascript(head, null));
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (in == null) in = new java.io.ByteArrayInputStream(new byte[0]);
                    try (InputStream src = in) {
                        if (toFile != null && !toFile.isEmpty() && code < 400) {
                            File f = new File(toFile);
                            File parent = f.getParentFile();
                            if (parent != null) parent.mkdirs();
                            long total = 0;
                            try (OutputStream out = new FileOutputStream(f)) {
                                byte[] buf = new byte[65536];
                                int n;
                                while ((n = src.read(buf)) > 0) {
                                    if (cancelled.containsKey(id)) throw new IOException("aborted");
                                    out.write(buf, 0, n);
                                    total += n;
                                }
                            }
                            res.put("size", total);
                        } else {
                            byte[] data = readStream(src);
                            res.put("size", data.length);
                            res.put("body", Base64.encodeToString(data, Base64.NO_WRAP));
                        }
                    }
                } catch (Exception e) {
                    try { res.put("error", cancelled.containsKey(id) ? "aborted" : String.valueOf(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName())); } catch (Exception ignore) { }
                    if (toFile != null && !toFile.isEmpty()) new File(toFile).delete();
                } finally {
                    if (c != null) c.disconnect();
                    active.remove(id);
                    cancelled.remove(id);
                }
                final String js = "window.__ooNetDone && window.__ooNetDone(" + JSONObject.quote(id) + "," + res.toString() + ")";
                web.post(() -> web.evaluateJavascript(js, null));
            });
        }

        @JavascriptInterface public void cancel(String id) {
            cancelled.put(id, true);
            HttpURLConnection c = active.get(id);
            if (c != null) pool.execute(c::disconnect);
        }
    }

    // ---------- Мост: система ----------
    class AppBridge {
        @JavascriptInterface public String version() {
            try {
                PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                return pi.versionName;
            } catch (Exception e) { return "?"; }
        }

        @JavascriptInterface public String paths() {
            try {
                JSONObject o = new JSONObject();
                o.put("lib", libRoot.getAbsolutePath());
                o.put("data", getFilesDir().getAbsolutePath());
                o.put("cache", getCacheDir().getAbsolutePath());
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface public void openExternal(String url) {
            runOnUiThread(() -> openExternalUri(Uri.parse(url)));
        }

        @JavascriptInterface public void keepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** "landscape" / "portrait" / "auto" — для просмотра на весь экран */
        @JavascriptInterface public void setOrientation(String o) {
            runOnUiThread(() -> setRequestedOrientation("landscape".equals(o) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : "portrait".equals(o) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED));
        }

        @JavascriptInterface public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
        }

        /** Копирует файл в общую папку телефона: kind = "video" → Movies/Objection Offline, иначе Download/Objection Offline.
         *  Возвращает путь для показа или строку "error:…". */
        @JavascriptInterface public String publish(String src, String name, String mime, String kind) {
            boolean video = "video".equals(kind);
            String folder = (video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_DOWNLOADS) + "/Objection Offline";
            ContentResolver cr = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, folder);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri coll = video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            Uri item = null;
            try {
                // тот же файл уже сохраняли (повторное «Сохранить») — перезаписываем, а не плодим «имя (1)»
                try (Cursor c = cr.query(coll, new String[] { MediaStore.MediaColumns._ID },
                        MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?",
                        new String[] { folder + "/", name }, null)) {
                    if (c != null && c.moveToFirst()) item = android.content.ContentUris.withAppendedId(coll, c.getLong(0));
                } catch (Exception ignore) { }
                if (item != null) {
                    try (InputStream in = new FileInputStream(src); OutputStream out = cr.openOutputStream(item, "wt")) {
                        if (out == null) throw new IOException("openOutputStream");
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        return folder + "/" + displayName(item, name);
                    } catch (Exception e) { item = null; }
                }
                item = cr.insert(coll, v);
                if (item == null) return "error:нет доступа к общей папке";
                try (InputStream in = new FileInputStream(src); OutputStream out = cr.openOutputStream(item)) {
                    if (out == null) throw new IOException("openOutputStream");
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(item, done, null, null);
                return folder + "/" + displayName(item, name);
            } catch (Exception e) {
                if (item != null) try { cr.delete(item, null, null); } catch (Exception ignore) { }
                return "error:" + e.getMessage();
            }
        }

        /** Файл, с которым запустили приложение («Открыть с помощью»), или "" */
        @JavascriptInterface public String takeLaunchFile() {
            synchronized (launchLock) {
                pageReady = true;
                String p = pendingFile;
                pendingFile = null;
                return p == null ? "" : p;
            }
        }

        @JavascriptInterface public void exit() { runOnUiThread(MainActivity.this::finish); }
    }

    String displayName(Uri item, String fallback) {
        try (Cursor c = getContentResolver().query(item, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignore) { }
        return fallback;
    }

    void openExternalUri(Uri u) {
        String sch = u.getScheme();
        if (!"http".equals(sch) && !"https".equals(sch)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignore) { }
    }
}
