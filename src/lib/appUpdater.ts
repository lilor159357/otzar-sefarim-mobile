import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

export const MOBILE_GITHUB_REPO = "lilor159357/otzar-sefarim-mobile";
export const GITHUB_RELEASES_API = `https://api.github.com/repos/${MOBILE_GITHUB_REPO}/releases/latest`;
export const GITHUB_RELEASES_PAGE = `https://github.com/${MOBILE_GITHUB_REPO}/releases/latest`;

const UPDATE_PREFS_KEY = "otzar_mobile_update_prefs_v1";

export interface UpdatePreferences {
  autoCheckOnLaunch: boolean;
  autoDownloadAndPrompt: boolean;
  dismissedVersion: string | null;
  lastCheckedAt: string | null;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  publishedAt: string | null;
  apkUrl: string | null;
  apkName: string | null;
  apkSize: number | null;
  releasePageUrl: string;
}

export interface DownloadProgressInfo {
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
}

export type InstallOutcome =
  | { status: "installer_launched"; bytes?: number; savedToDownloads?: boolean; downloadPath?: string; fileName?: string }
  | { status: "permission_required" }
  | { status: "opened_browser" };

export type SaveApkOutcome =
  | { status: "saved_to_downloads"; bytes?: number; fileName?: string; downloadPath?: string }
  | { status: "opened_browser" };

interface AppUpdaterPlugin {
  getAppVersion(): Promise<{ versionName: string; versionCode: number }>;
  checkLatestRelease(options: { url: string }): Promise<{ statusCode: number; body: string }>;
  canRequestPackageInstalls(): Promise<{ granted: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  downloadAndInstallApk(options: { url: string; fileName?: string }): Promise<{
    status: "installer_launched" | "permission_required";
    bytes?: number;
    savedToDownloads?: boolean;
    downloadPath?: string;
    fileName?: string;
  }>;
  downloadApkToDownloads(options: { url: string; fileName?: string }): Promise<{
    status: "saved_to_downloads";
    bytes?: number;
    fileName?: string;
    downloadPath?: string;
  }>;
  shareApk(options: { url?: string; fileName?: string }): Promise<{ status: "share_opened"; fileName?: string; bytes?: number }>;
  addListener(
    eventName: "downloadProgress",
    listenerFunc: (data: DownloadProgressInfo) => void
  ): Promise<PluginListenerHandle>;
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>("AppUpdater");

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function normalizeVersion(v: string | null | undefined): string {
  return String(v || "")
    .trim()
    .replace(/^v/i, "")
    .split("-")[0]
    .trim();
}

export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = normalizeVersion(b)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

export function loadUpdatePrefs(): UpdatePreferences {
  try {
    const raw = localStorage.getItem(UPDATE_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        autoCheckOnLaunch: parsed.autoCheckOnLaunch !== false,
        autoDownloadAndPrompt: parsed.autoDownloadAndPrompt === true,
        dismissedVersion: typeof parsed.dismissedVersion === "string" ? parsed.dismissedVersion : null,
        lastCheckedAt: typeof parsed.lastCheckedAt === "string" ? parsed.lastCheckedAt : null,
      };
    }
  } catch {}
  return {
    autoCheckOnLaunch: true,
    autoDownloadAndPrompt: false,
    dismissedVersion: null,
    lastCheckedAt: null,
  };
}

export function saveUpdatePrefs(next: UpdatePreferences): UpdatePreferences {
  try {
    localStorage.setItem(UPDATE_PREFS_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function getInstalledVersion(): Promise<string> {
  const fallback = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";
  if (isNativeAndroid()) {
    try {
      const info = await AppUpdater.getAppVersion();
      if (info?.versionName) return normalizeVersion(info.versionName);
    } catch {
      // Fallback to build-time version
    }
  }
  return normalizeVersion(fallback);
}

interface GitHubReleaseAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
}

interface GitHubReleasePayload {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
  html_url?: string;
  assets?: GitHubReleaseAsset[];
  message?: string;
}

async function fetchLatestReleaseJson(): Promise<GitHubReleasePayload> {
  if (isNativeAndroid()) {
    try {
      const res = await AppUpdater.checkLatestRelease({ url: GITHUB_RELEASES_API });
      if (res.statusCode >= 200 && res.statusCode < 300 && res.body) {
        return JSON.parse(res.body) as GitHubReleasePayload;
      }
      if (res.statusCode === 404) {
        throw new Error("לא נמצאו גרסאות משוחררות עדיין ב-GitHub Releases.");
      }
      throw new Error(`שגיאת שרת עדכונים (${res.statusCode})`);
    } catch (err) {
      // Fall back to browser fetch if native call fails unexpectedly
      if (err instanceof Error && err.message.includes("שגיאת שרת")) throw err;
    }
  }

  const resp = await fetch(GITHUB_RELEASES_API, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error("לא נמצאו גרסאות משוחררות עדיין ב-GitHub Releases.");
    }
    throw new Error(`בדיקת העדכון נכשלה (HTTP ${resp.status})`);
  }
  return (await resp.json()) as GitHubReleasePayload;
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = await getInstalledVersion();
  const payload = await fetchLatestReleaseJson();

  const rawTag = payload.tag_name || payload.name || "";
  const latestVersion = normalizeVersion(rawTag);
  if (!latestVersion) {
    throw new Error("לא התקבל מספר גרסה תקין משרת העדכונים.");
  }

  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  const apkAsset =
    assets.find((a) => typeof a.name === "string" && a.name.toLowerCase().endsWith(".apk")) || null;

  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

  const prefs = loadUpdatePrefs();
  saveUpdatePrefs({ ...prefs, lastCheckedAt: new Date().toISOString() });

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    releaseNotes: String(payload.body || "").trim(),
    publishedAt: payload.published_at || null,
    apkUrl: apkAsset?.browser_download_url || null,
    apkName: apkAsset?.name || null,
    apkSize: typeof apkAsset?.size === "number" ? apkAsset.size : null,
    releasePageUrl: payload.html_url || GITHUB_RELEASES_PAGE,
  };
}

export async function canInstallApkDirectly(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await AppUpdater.canRequestPackageInstalls();
    return Boolean(res?.granted);
  } catch {
    return false;
  }
}

export async function openInstallPermissionSettings(): Promise<void> {
  if (!isNativeAndroid()) return;
  await AppUpdater.openInstallPermissionSettings();
}

export async function downloadAndInstallUpdate(
  apkUrl: string,
  onProgress?: (info: DownloadProgressInfo) => void,
  fileName?: string | null
): Promise<InstallOutcome> {
  if (!apkUrl) {
    throw new Error("קישור ההורדה של קובץ ה-APK חסר.");
  }
  if (!isNativeAndroid()) {
    window.open(apkUrl, "_blank", "noopener,noreferrer");
    return { status: "opened_browser" };
  }
  let handle: PluginListenerHandle | null = null;
  if (onProgress) {
    try {
      handle = await AppUpdater.addListener("downloadProgress", (data) => {
        onProgress(data);
      });
    } catch {
      handle = null;
    }
  }
  try {
    const result = await AppUpdater.downloadAndInstallApk({
      url: apkUrl,
      fileName: fileName || undefined,
    });
    if (result?.status === "permission_required") {
      return { status: "permission_required" };
    }
    return {
      status: "installer_launched",
      bytes: result?.bytes,
      savedToDownloads: result?.savedToDownloads,
      downloadPath: result?.downloadPath,
      fileName: result?.fileName,
    };
  } finally {
    if (handle) {
      try {
        await handle.remove();
      } catch {}
    }
  }
}

export async function saveApkToDownloads(
  apkUrl: string,
  onProgress?: (info: DownloadProgressInfo) => void,
  fileName?: string | null
): Promise<SaveApkOutcome> {
  if (!apkUrl) {
    throw new Error("קישור ההורדה של קובץ ה-APK חסר.");
  }
  if (!isNativeAndroid()) {
    window.open(apkUrl, "_blank", "noopener,noreferrer");
    return { status: "opened_browser" };
  }
  let handle: PluginListenerHandle | null = null;
  if (onProgress) {
    try {
      handle = await AppUpdater.addListener("downloadProgress", (data) => {
        onProgress(data);
      });
    } catch {
      handle = null;
    }
  }
  try {
    const result = await AppUpdater.downloadApkToDownloads({
      url: apkUrl,
      fileName: fileName || undefined,
    });
    return {
      status: "saved_to_downloads",
      bytes: result?.bytes,
      fileName: result?.fileName,
      downloadPath: result?.downloadPath,
    };
  } finally {
    if (handle) {
      try {
        await handle.remove();
      } catch {}
    }
  }
}

export async function shareDownloadedApk(
  apkUrl?: string | null,
  fileName?: string | null
): Promise<void> {
  if (!isNativeAndroid()) {
    if (apkUrl) window.open(apkUrl, "_blank", "noopener,noreferrer");
    return;
  }
  await AppUpdater.shareApk({
    url: apkUrl || undefined,
    fileName: fileName || undefined,
  });
}

export function formatBytesHe(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
