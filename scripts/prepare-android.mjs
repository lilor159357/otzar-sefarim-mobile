import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const androidDir = path.join(rootDir, "android");
const manifestPath = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");
const stringsPath = path.join(androidDir, "app", "src", "main", "res", "values", "strings.xml");
const iconSrc = path.join(rootDir, "assets", "icon.png");

if (!fs.existsSync(androidDir)) {
  console.log("[prepare-android] android/ folder not found yet — run npx cap add android first.");
  process.exit(0);
}

if (fs.existsSync(manifestPath)) {
  let xml = fs.readFileSync(manifestPath, "utf8");
  const perms = [
    "android.permission.INTERNET",
    "android.permission.CAMERA",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.REQUEST_INSTALL_PACKAGES",
  ];
  for (const perm of perms) {
    if (!xml.includes(perm)) {
      xml = xml.replace(
        "<application",
        `    <uses-permission android:name="${perm}" />\n\n    <application`
      );
    }
  }
  if (!xml.includes("android.permission.WRITE_EXTERNAL_STORAGE")) {
    xml = xml.replace(
      "<application",
      `    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />\n\n    <application`
    );
  }
  if (!xml.includes("android:networkSecurityConfig")) {
    xml = xml.replace(
      "<application",
      `<application\n        android:networkSecurityConfig="@xml/network_security_config"`
    );
  }
  fs.writeFileSync(manifestPath, xml, "utf8");
  console.log("[prepare-android] Verified AndroidManifest permissions & networkSecurityConfig.");
}

// Trust user CA certificates (NetFree / Etrog / Rimon) for HTTPS & APK updates
const xmlDir = path.join(androidDir, "app", "src", "main", "res", "xml");
fs.mkdirSync(xmlDir, { recursive: true });
fs.writeFileSync(
  path.join(xmlDir, "network_security_config.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`,
  "utf8"
);
console.log("[prepare-android] Configured network_security_config.xml (system + user CA).");

// Sync versionName & versionCode from package.json into android/app/build.gradle
const pkgPath = path.join(rootDir, "package.json");
const buildGradlePath = path.join(androidDir, "app", "build.gradle");
if (fs.existsSync(pkgPath) && fs.existsSync(buildGradlePath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const ver = String(pkg.version || "1.0.0").trim();
  const parts = ver.split(".").map((n) => parseInt(n, 10) || 0);
  const versionCode = (parts[0] || 1) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
  let gradle = fs.readFileSync(buildGradlePath, "utf8");
  gradle = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${ver}"`);
  if (!gradle.includes("signingConfigs {")) {
    gradle = gradle.replace(
      /buildTypes\s*\{/,
      `signingConfigs {
        otzarRelease {
            def ksPath = System.getenv("OTZAR_KEYSTORE_PATH")
            if (ksPath != null && !ksPath.trim().isEmpty()) {
                storeFile file(ksPath)
                storeType "PKCS12"
                storePassword System.getenv("OTZAR_KEYSTORE_PASSWORD")
                keyAlias (System.getenv("OTZAR_KEY_ALIAS") ?: "otzar")
                keyPassword System.getenv("OTZAR_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {`
    );
  }
  if (!gradle.includes("signingConfigs.otzarRelease")) {
    gradle = gradle.replace(
      /release\s*\{/,
      `release {
            if (System.getenv("OTZAR_KEYSTORE_PATH")) {
                signingConfig signingConfigs.otzarRelease
            }`
    );
    if (/debug\s*\{/.test(gradle)) {
      gradle = gradle.replace(
        /debug\s*\{/,
        `debug {
            if (System.getenv("OTZAR_KEYSTORE_PATH")) {
                signingConfig signingConfigs.otzarRelease
            }`
      );
    } else {
      gradle = gradle.replace(
        /buildTypes\s*\{/,
        `buildTypes {
        debug {
            if (System.getenv("OTZAR_KEYSTORE_PATH")) {
                signingConfig signingConfigs.otzarRelease
            }
        }`
      );
    }
  }
  fs.writeFileSync(buildGradlePath, gradle, "utf8");
  console.log(`[prepare-android] Synced Gradle versionName=${ver}, versionCode=${versionCode}.`);
}

// Install native AppUpdater Capacitor plugin & register in MainActivity
const javaBaseDir = path.join(androidDir, "app", "src", "main", "java");
let pkgName = "com.otzarsefarim.mobile";
let mainActivityPath = path.join(javaBaseDir, "com", "otzarsefarim", "mobile", "MainActivity.java");

function findMainActivity(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivity(full);
      if (found) return found;
    } else if (entry.name === "MainActivity.java") {
      return full;
    }
  }
  return null;
}

const detectedMain = findMainActivity(javaBaseDir);
if (detectedMain) {
  mainActivityPath = detectedMain;
  const src = fs.readFileSync(detectedMain, "utf8");
  const m = src.match(/^\s*package\s+([\w.]+)\s*;/m);
  if (m) pkgName = m[1];
}

const pluginDir = path.dirname(mainActivityPath);
fs.mkdirSync(pluginDir, { recursive: true });

const appUpdaterJava = `package ${pkgName};

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile String lastApkUrl = null;
    private volatile File lastApkFile = null;

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo pInfo = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            long vCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? pInfo.getLongVersionCode()
                    : pInfo.versionCode;
            JSObject ret = new JSObject();
            ret.put("versionName", pInfo.versionName != null ? pInfo.versionName : "1.0.0");
            ret.put("versionCode", vCode);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read package version", e);
        }
    }

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            granted = getContext().getPackageManager().canRequestPackageInstalls();
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + ctx.getPackageName())
                );
            } else {
                intent = new Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + ctx.getPackageName())
                );
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open install permission settings", e);
        }
    }

    @PluginMethod
    public void checkLatestRelease(PluginCall call) {
        String urlStr = call.getString("url");
        if (urlStr == null || urlStr.trim().isEmpty()) {
            call.reject("Missing url");
            return;
        }
        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(20000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("Accept", "application/vnd.github+json");
                conn.setRequestProperty("User-Agent", "OtzarSefarimMobile-Updater");
                int status = conn.getResponseCode();
                InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                StringBuilder sb = new StringBuilder();
                if (stream != null) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            sb.append(line).append((char) 10);
                        }
                    }
                }
                JSObject ret = new JSObject();
                ret.put("statusCode", status);
                ret.put("body", sb.toString());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Update check failed: " + e.getMessage(), e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private HttpURLConnection openWithRedirects(String startUrl) throws Exception {
        String current = startUrl;
        for (int hops = 0; hops < 8; hops++) {
            URL url = new URL(current);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(25000);
            conn.setReadTimeout(60000);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("User-Agent", "OtzarSefarimMobile-Updater");
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                    || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == HttpURLConnection.HTTP_SEE_OTHER
                    || code == 307
                    || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null || loc.isEmpty()) {
                    throw new Exception("Redirect without Location header");
                }
                current = new URL(url, loc).toString();
                continue;
            }
            return conn;
        }
        throw new Exception("Too many redirects while downloading APK");
    }

    private String sanitizeApkFileName(String rawName) {
        String name = rawName != null ? rawName.trim() : "";
        name = name.replaceAll("[^a-zA-Z0-9._-]", "-");
        if (name.isEmpty()) {
            name = "Otzar-Sefarim-Mobile.apk";
        }
        if (!name.toLowerCase().endsWith(".apk")) {
            name = name + ".apk";
        }
        return name;
    }

    private boolean isValidCachedApk(File f) {
        if (f == null || !f.exists() || f.length() < 100_000) return false;
        byte[] magic = new byte[2];
        try (FileInputStream fis = new FileInputStream(f)) {
            return fis.read(magic) == 2 && magic[0] == 0x50 && magic[1] == 0x4B;
        } catch (Exception ignored) {
            return false;
        }
    }

    private File downloadApkToCache(Context ctx, String urlStr, String safeFileName) throws Exception {
        HttpURLConnection conn = null;
        File outFile = new File(ctx.getCacheDir(), safeFileName);
        try {
            if (outFile.exists()) {
                outFile.delete();
            }
            conn = openWithRedirects(urlStr);
            int status = conn.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new Exception("HTTP " + status + " while downloading APK");
            }
            long totalBytes = -1;
            try {
                String clHeader = conn.getHeaderField("Content-Length");
                if (clHeader != null && !clHeader.trim().isEmpty()) {
                    totalBytes = Long.parseLong(clHeader.trim());
                }
            } catch (Exception ignored) {
            }
            long downloaded = 0;
            int lastReportedPct = -1;
            long lastReportMs = 0;
            try (InputStream in = new BufferedInputStream(conn.getInputStream());
                 FileOutputStream out = new FileOutputStream(outFile)) {
                byte[] buffer = new byte[16384];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    downloaded += read;
                    long now = System.currentTimeMillis();
                    int pct = totalBytes > 0 ? (int) Math.min(100, (downloaded * 100L) / totalBytes) : -1;
                    if (now - lastReportMs >= 150 || (pct >= 0 && pct >= lastReportedPct + 2) || pct == 100) {
                        lastReportMs = now;
                        lastReportedPct = pct;
                        JSObject prog = new JSObject();
                        prog.put("progress", pct >= 0 ? pct : 0);
                        prog.put("downloadedBytes", downloaded);
                        prog.put("totalBytes", totalBytes);
                        notifyListeners("downloadProgress", prog);
                    }
                }
                out.flush();
            }
            if (!isValidCachedApk(outFile)) {
                outFile.delete();
                throw new Exception("Downloaded file is not a valid APK package");
            }
            JSObject doneProg = new JSObject();
            doneProg.put("progress", 100);
            doneProg.put("downloadedBytes", downloaded);
            doneProg.put("totalBytes", totalBytes > 0 ? totalBytes : downloaded);
            notifyListeners("downloadProgress", doneProg);
            lastApkUrl = urlStr;
            lastApkFile = outFile;
            return outFile;
        } catch (Exception e) {
            if (outFile.exists()) {
                outFile.delete();
            }
            throw e;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private String exportFileToDownloads(Context ctx, File srcFile, String fileName) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = ctx.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/vnd.android.package-archive");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri itemUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (itemUri == null) {
                throw new Exception("Failed to create MediaStore download entry");
            }
            try (InputStream in = new FileInputStream(srcFile);
                 OutputStream out = resolver.openOutputStream(itemUri)) {
                if (out == null) {
                    throw new Exception("Failed to open output stream in Downloads");
                }
                byte[] buf = new byte[16384];
                int len;
                while ((len = in.read(buf)) != -1) {
                    out.write(buf, 0, len);
                }
                out.flush();
            } catch (Exception e) {
                try {
                    resolver.delete(itemUri, null, null);
                } catch (Exception ignored) {
                }
                throw e;
            }
            ContentValues ready = new ContentValues();
            ready.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(itemUri, ready, null, null);
            return "Downloads/" + fileName;
        } else {
            File dlDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dlDir.exists()) {
                dlDir.mkdirs();
            }
            File destFile = new File(dlDir, fileName);
            try (InputStream in = new FileInputStream(srcFile);
                 FileOutputStream out = new FileOutputStream(destFile)) {
                byte[] buf = new byte[16384];
                int len;
                while ((len = in.read(buf)) != -1) {
                    out.write(buf, 0, len);
                }
                out.flush();
            }
            return destFile.getAbsolutePath();
        }
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String urlStr = call.getString("url");
        if (urlStr == null || urlStr.trim().isEmpty()) {
            call.reject("Missing APK URL");
            return;
        }
        String safeName = sanitizeApkFileName(call.getString("fileName"));
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !ctx.getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent permIntent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + ctx.getPackageName())
                );
                permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(permIntent);
            } catch (Exception ignored) {
            }
            JSObject ret = new JSObject();
            ret.put("status", "permission_required");
            call.resolve(ret);
            return;
        }
        executor.execute(() -> {
            try {
                File outFile = (urlStr.equals(lastApkUrl) && isValidCachedApk(lastApkFile))
                        ? lastApkFile
                        : downloadApkToCache(ctx, urlStr, safeName);
                boolean savedToDownloads = false;
                String downloadPath = "";
                try {
                    downloadPath = exportFileToDownloads(ctx, outFile, safeName);
                    savedToDownloads = true;
                } catch (Exception ignored) {
                }
                Uri apkUri = FileProvider.getUriForFile(
                        ctx,
                        ctx.getPackageName() + ".fileprovider",
                        outFile
                );
                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(installIntent);
                JSObject ret = new JSObject();
                ret.put("status", "installer_launched");
                ret.put("bytes", outFile.length());
                ret.put("fileName", safeName);
                ret.put("savedToDownloads", savedToDownloads);
                ret.put("downloadPath", downloadPath);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("APK download/install failed: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void downloadApkToDownloads(PluginCall call) {
        String urlStr = call.getString("url");
        if (urlStr == null || urlStr.trim().isEmpty()) {
            call.reject("Missing APK URL");
            return;
        }
        String safeName = sanitizeApkFileName(call.getString("fileName"));
        Context ctx = getContext();
        executor.execute(() -> {
            try {
                File outFile = (urlStr.equals(lastApkUrl) && isValidCachedApk(lastApkFile))
                        ? lastApkFile
                        : downloadApkToCache(ctx, urlStr, safeName);
                String downloadPath = exportFileToDownloads(ctx, outFile, safeName);
                JSObject ret = new JSObject();
                ret.put("status", "saved_to_downloads");
                ret.put("bytes", outFile.length());
                ret.put("fileName", safeName);
                ret.put("downloadPath", downloadPath);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Saving APK to Downloads failed: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void shareApk(PluginCall call) {
        String urlStr = call.getString("url");
        String safeName = sanitizeApkFileName(call.getString("fileName"));
        Context ctx = getContext();
        executor.execute(() -> {
            try {
                File targetFile = isValidCachedApk(lastApkFile) ? lastApkFile : null;
                if (targetFile == null) {
                    if (urlStr == null || urlStr.trim().isEmpty()) {
                        call.reject("No downloaded APK available to share");
                        return;
                    }
                    targetFile = downloadApkToCache(ctx, urlStr, safeName);
                }
                Uri apkUri = FileProvider.getUriForFile(
                        ctx,
                        ctx.getPackageName() + ".fileprovider",
                        targetFile
                );
                Intent sendIntent = new Intent(Intent.ACTION_SEND);
                sendIntent.setType("application/vnd.android.package-archive");
                sendIntent.putExtra(Intent.EXTRA_STREAM, apkUri);
                sendIntent.putExtra(Intent.EXTRA_SUBJECT, safeName);
                sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(sendIntent, "שמירה / שיתוף קובץ APK");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(chooser);
                JSObject ret = new JSObject();
                ret.put("status", "share_opened");
                ret.put("fileName", safeName);
                ret.put("bytes", targetFile.length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to share APK: " + e.getMessage(), e);
            }
        });
    }
}`;

fs.writeFileSync(path.join(pluginDir, "AppUpdaterPlugin.java"), appUpdaterJava, "utf8");
fs.writeFileSync(
  mainActivityPath,
  `package ${pkgName};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`,
  "utf8"
);
console.log(`[prepare-android] Installed & registered AppUpdaterPlugin in ${pkgName}.`);

if (fs.existsSync(stringsPath)) {
  let stringsXml = fs.readFileSync(stringsPath, "utf8");
  stringsXml = stringsXml
    .replace(/<string name="app_name">.*?<\/string>/, '<string name="app_name">אוצר ספרים</string>')
    .replace(/<string name="title_activity_main">.*?<\/string>/, '<string name="title_activity_main">אוצר ספרים</string>');
  fs.writeFileSync(stringsPath, stringsXml, "utf8");
  console.log("[prepare-android] Updated Hebrew app_name in strings.xml.");
}

if (fs.existsSync(iconSrc)) {
  const resDir = path.join(androidDir, "app", "src", "main", "res");
  const mipmapDirs = ["mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"];
  for (const dirName of mipmapDirs) {
    const targetDir = path.join(resDir, dirName);
    if (fs.existsSync(targetDir)) {
      fs.copyFileSync(iconSrc, path.join(targetDir, "ic_launcher.png"));
      fs.copyFileSync(iconSrc, path.join(targetDir, "ic_launcher_round.png"));
      fs.copyFileSync(iconSrc, path.join(targetDir, "ic_launcher_foreground.png"));
    }
  }
  console.log("[prepare-android] Copied Otzar Sefarim launcher icons.");
}
