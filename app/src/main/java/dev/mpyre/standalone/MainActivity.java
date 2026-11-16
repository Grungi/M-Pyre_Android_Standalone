// SPDX-License-Identifier: GPL-3.0-only
package dev.mpyre.standalone;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import java.io.OutputStream;

/** Offline Android wrapper around History Of Sky's GPLv3 M-PYRE WASM firmware emulator. */
public final class MainActivity extends Activity {
    private static final String START_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final String ORIGIN = "https://appassets.androidplatform.net/";
    private static final int IMPORT = 410, EXPORT = 411;
    private WebView webView;
    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private byte[] pendingExport;
    private String pendingExportTitle = "M-PYRE file";
    private UsbMidiBridge usbMidiBridge;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                             WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setNavigationBarColor(Color.BLACK);
        immersive();
        WebView.setWebContentsDebuggingEnabled(false);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11,9,8));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setLongClickable(false);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (START_URL.equals(url) && usbMidiBridge != null) usbMidiBridge.start();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri uri = req.getUrl();
                if (uri.toString().startsWith(ORIGIN)) return false;
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch(Exception ignored) {}
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view,
                   android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    startActivityForResult(intent, IMPORT);
                    return true;
                } catch (ActivityNotFoundException error) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "Dateiauswahl nicht verfügbar", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });
        usbMidiBridge = new UsbMidiBridge(this, new UsbMidiBridge.Listener() {
            @Override public void onBytes(byte[] raw) {
                final String encoded = Base64.encodeToString(raw, Base64.NO_WRAP);
                runOnUiThread(() -> {
                    if (webView != null) webView.evaluateJavascript(
                        "window.MPyreUsbMidi?.receive('" + encoded + "')", null);
                });
            }
            @Override public void onState(boolean connected, String detail) {
                final String label = android.util.Base64.encodeToString(
                    detail.getBytes(java.nio.charset.StandardCharsets.UTF_8), Base64.NO_WRAP);
                runOnUiThread(() -> {
                    if (webView != null) webView.evaluateJavascript(
                        "window.MPyreUsbMidi?.status(" + (connected ? "true" : "false") +
                        ",decodeURIComponent(escape(atob('" + label + "'))))", null);
                });
            }
        });
        webView.addJavascriptInterface(new SongFileBridge(), "MPyreAndroid");
        setContentView(webView);
        webView.loadUrl(START_URL);
    }
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }
    private final class SongFileBridge {
        @JavascriptInterface public void setUsbHostMode(boolean enabled) {
            runOnUiThread(() -> {
                if (usbMidiBridge != null) usbMidiBridge.setHostMode(enabled);
            });
        }
        @JavascriptInterface public void scanUsbMidi() {
            runOnUiThread(() -> {
                if (usbMidiBridge != null) usbMidiBridge.rescan();
            });
        }
        @JavascriptInterface public boolean sendUsbMidi(String data) {
            if (data == null || data.length() > 1200 || usbMidiBridge == null) return false;
            try {
                byte[] decoded = Base64.decode(data,Base64.DEFAULT);
                return usbMidiBridge.sendToPc(decoded);
            } catch (IllegalArgumentException error) {
                return false;
            }
        }

        @JavascriptInterface public void exportProject(String b64) {
            if (b64 == null || b64.length() > 4000000) return;
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                if (data.length == 0 || data.length > 2000000) return;
                runOnUiThread(() -> {
                    pendingExport = data;
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/octet-stream");
                    intent.putExtra(Intent.EXTRA_TITLE, "m-pyre-song.mpyre");
                    try { startActivityForResult(intent, EXPORT); }
                    catch (ActivityNotFoundException error) {
                        pendingExport = null;
                        Toast.makeText(MainActivity.this, "Speichern nicht verfügbar", Toast.LENGTH_LONG).show();
                    }
                });
            } catch (IllegalArgumentException ignored) {}
        }
        @JavascriptInterface public void exportFile(String b64, String fileName, String mimeType) {
            if (b64 == null || b64.length() > 24000000) return;
            try {
                final byte[] data = Base64.decode(b64, Base64.DEFAULT);
                if (data.length == 0 || data.length > 16000000) return;
                final String cleanName = (fileName == null ? "mpyre-export.bin" : fileName)
                    .replaceAll("[^a-zA-Z0-9._ -]", "_");
                final String name = cleanName.isEmpty() ? "mpyre-export.bin" :
                    cleanName.substring(0, Math.min(100, cleanName.length()));
                final String type = mimeType != null && mimeType.matches("[a-zA-Z0-9.+_-]+/[a-zA-Z0-9.+_-]+") ?
                    mimeType : "application/octet-stream";
                runOnUiThread(() -> {
                    if (pendingExport != null) {
                        Toast.makeText(MainActivity.this, "Finish the previous save first", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    pendingExport = data;
                    pendingExportTitle = name;
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(type);
                    intent.putExtra(Intent.EXTRA_TITLE, name);
                    try { startActivityForResult(intent, EXPORT); }
                    catch (ActivityNotFoundException error) {
                        pendingExport = null;
                        Toast.makeText(MainActivity.this, "Save dialog unavailable", Toast.LENGTH_LONG).show();
                    }
                });
            } catch (IllegalArgumentException ignored) {}
        }
    }
    @Override @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == IMPORT) {
            if (fileCallback != null) {
                Uri[] uris = resultCode == RESULT_OK && data != null && data.getData() != null ?
                    new Uri[]{data.getData()} : null;
                fileCallback.onReceiveValue(uris);
                fileCallback = null;
            }
        } else if (requestCode == EXPORT) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingExport != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out == null) throw new IllegalStateException("No output stream");
                    out.write(pendingExport);
                    Toast.makeText(this, pendingExportTitle + " saved", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Log.e("MPyre", "Export error", e);
                    Toast.makeText(this, "Speichern fehlgeschlagen", Toast.LENGTH_LONG).show();
                }
            }
            pendingExport = null;
        }
    }
    @Override @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript(
            "Boolean((window.MPyreCloseFullEditor && window.MPyreCloseFullEditor()) || " +
            "(window.MPyreCloseStudio && window.MPyreCloseStudio()) || " +
            "(window.MPyreCloseOptions && window.MPyreCloseOptions()))",
            result -> {
                if (!"true".equals(result) && !isFinishing()) {
                    MainActivity.super.onBackPressed();
                }
            });
    }
    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }
    @Override protected void onDestroy() {
        if (usbMidiBridge != null) { usbMidiBridge.stop(); usbMidiBridge = null; }
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
