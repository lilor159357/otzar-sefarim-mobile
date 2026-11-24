import React, { useRef, useState } from "react";
import {
  FileKey2,
  KeyRound,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  Palette,
  Download,
  ExternalLink,
  FolderDown,
  Share2,
  ShieldCheck,
  QrCode,
} from "lucide-react";
import type { MobileConnectionConfig, SyncSnapshot } from "../types.ts";
import {
  decryptDesktopSetupBundle,
  isMobileQrPairingCode,
  parseFirebaseConfigRaw,
  parseMobileQrPairingCode,
} from "../lib/setupDecrypt.ts";
import { BarcodeScannerModal } from "./BarcodeScannerModal.tsx";
import { useStrings } from "../lib/stringsContext.tsx";
import {
  formatBytesHe,
  isNativeAndroid,
  type DownloadProgressInfo,
  type UpdateCheckResult,
  type UpdatePreferences,
} from "../lib/appUpdater.ts";

interface ConnectionTabProps {
  config: MobileConnectionConfig | null;
  sync: SyncSnapshot;
  counts: { books: number; cabinets: number; borrowers: number; loans: number };
  themePreset: "default" | "classic-blue" | "forest-green";
  themeMode: "light" | "dark";
  installedVersion: string;
  updatePrefs: UpdatePreferences;
  updateChecking: boolean;
  updateDownloading: boolean;
  updateProgress: DownloadProgressInfo | null;
  updateInfo: UpdateCheckResult | null;
  updateError: string | null;
  updateStatusMsg: string | null;
  onUpdatePrefsChange: (next: UpdatePreferences) => void;
  onCheckForUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
  onSaveApkToDownloads: () => Promise<void>;
  onShareApk: () => Promise<void>;
  onConnectConfig: (cfg: MobileConnectionConfig) => Promise<void>;
  onSyncNow: () => Promise<void>;
  onFullResync: () => Promise<void>;
  onClearCacheAndDisconnect: () => Promise<void>;
  onChangeTheme: (preset: "default" | "classic-blue" | "forest-green", mode: "light" | "dark") => void;
}

export const ConnectionTab: React.FC<ConnectionTabProps> = ({
  config,
  sync,
  counts,
  themePreset,
  themeMode,
  installedVersion,
  updatePrefs,
  updateChecking,
  updateDownloading,
  updateProgress,
  updateInfo,
  updateError,
  updateStatusMsg,
  onUpdatePrefsChange,
  onCheckForUpdates,
  onInstallUpdate,
  onSaveApkToDownloads,
  onShareApk,
  onConnectConfig,
  onSyncNow,
  onFullResync,
  onClearCacheAndDisconnect,
  onChangeTheme,
}) => {
  const { t } = useStrings();
  const [bundleText, setBundleText] = useState("");
  const [passcode, setPasscode] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualConfigJson, setManualConfigJson] = useState(() =>
    config?.firebaseConfig ? JSON.stringify(config.firebaseConfig, null, 2) : ""
  );
  const [manualEmail, setManualEmail] = useState(config?.email || "");
  const [manualPassword, setManualPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const passcodeInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const content = await file.text();
      setBundleText(content.trim());
      setFeedback({ type: "ok", text: `קובץ "${file.name}" נטען — הזן כעת את קוד האבטחה ולחץ התחבר.` });
    } catch {
      setFeedback({ type: "err", text: "לא ניתן לקרוא את קובץ ההעברה שנבחר" });
    }
  };

  const connectFromQrCode = async (rawCode: string) => {
    const trimmed = String(rawCode || "").trim();
    if (!trimmed) return;
    setQrScannerOpen(false);
    setFeedback(null);

    if (isMobileQrPairingCode(trimmed)) {
      setBusy(true);
      try {
        const cfg = parseMobileQrPairingCode(trimmed);
        await onConnectConfig(cfg);
        setBundleText("");
        setPasscode("");
        setFeedback({
          type: "ok",
          text: "החיבור למחשב הצליח בסריקת ברקוד והספרייה סונכרנה למכשיר!",
        });
      } catch (err: unknown) {
        setFeedback({
          type: "err",
          text: err instanceof Error ? err.message : "שגיאה בחיבור מהברקוד",
        });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (trimmed.startsWith("OTZAR-SETUP:") || trimmed.startsWith("{")) {
      setBundleText(trimmed);
      setFeedback({
        type: "ok",
        text: "קוד ההעברה נסרק! הזן את קוד האבטחה ולחץ על 'פענח והתחבר לענן'.",
      });
      window.setTimeout(() => passcodeInputRef.current?.focus(), 100);
      return;
    }

    setFeedback({
      type: "err",
      text: "הברקוד שנסרק אינו ברקוד חיבור של אוצר ספרים.",
    });
  };

  const handleConnectViaBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const decrypted = isMobileQrPairingCode(bundleText)
        ? parseMobileQrPairingCode(bundleText)
        : await decryptDesktopSetupBundle(bundleText, passcode);
      await onConnectConfig(decrypted);
      setBundleText("");
      setPasscode("");
      setFeedback({
        type: "ok",
        text: "החיבור לענן הצליח והספרייה סונכרנה למכשיר! מומלץ למחוק את קובץ ההעברה מהמכשיר.",
      });
    } catch (err: unknown) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "שגיאה בפענוח החיבור" });
    } finally {
      setBusy(false);
    }
  };

  const handleConnectManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const fb = parseFirebaseConfigRaw(manualConfigJson);
      if (!fb) throw new Error("הגדרות Firebase Web Config אינן תקינות");
      if (!manualEmail.trim() || !manualPassword) throw new Error("יש להזין אימייל וסיסמת ניהול");
      await onConnectConfig({
        firebaseConfig: fb,
        email: manualEmail.trim(),
        password: manualPassword,
        libraryName: config?.libraryName || "אוצר ספרים",
        themePreset,
        themeMode,
      });
      setManualPassword("");
      setFeedback({ type: "ok", text: "החיבור לענן נשמר והמאגר סונכרן בהצלחה." });
    } catch (err: unknown) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "החיבור לענן נכשל" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-2xl border px-3.5 py-2.5 text-sm ${
            feedback.type === "ok"
              ? "border-emerald-300/70 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-rose-300/70 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
          }`}
        >
          {feedback.type === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Transfer Bundle Setup */}
        <section className="space-y-3 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-4">
          <div className="flex items-center gap-2">
            <FileKey2 className="h-5 w-5 text-[var(--otzar-accent)]" />
            <h2 className="text-base font-bold text-[var(--otzar-text)]">{t("mobile.quickConnectTitle")}</h2>
          </div>
          <p className="text-xs leading-relaxed text-[var(--otzar-text-muted)]">
            בתוכנת המחשב היכנס ל<b>הגדרות ומפה ← סנכרון ענן</b> (או <b>העברה למכשיר אחר</b>), לחץ על <b>&quot;הצג ברקוד לחיבור מהיר&quot;</b> וסרוק מהטלפון — או טען קובץ <code>.otzar-setup</code>.
          </p>

          <button
            type="button"
            disabled={busy}
            onClick={() => setQrScannerOpen(true)}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--otzar-accent)] px-4 font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-45"
          >
            <QrCode className="h-5 w-5" />
            <span>סרוק ברקוד (QR) ממסך המחשב</span>
          </button>

          <form onSubmit={handleConnectViaBundle} className="space-y-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".otzar-setup,.json,.txt,application/json,text/plain"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm font-semibold text-[var(--otzar-text)] active:scale-[0.98]"
            >
              <FileKey2 className="h-4 w-4 text-[var(--otzar-accent)]" />
              <span>בחר קובץ .otzar-setup מהטלפון</span>
            </button>

            <textarea
              rows={3}
              dir="ltr"
              value={bundleText}
              onChange={(e) => setBundleText(e.target.value)}
              placeholder="או הדבק כאן קוד OTZAR-SETUP:..."
              className="w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-3 text-xs text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
            />

            <div className="relative">
              <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--otzar-text-muted)]" />
              <input
                ref={passcodeInputRef}
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={isMobileQrPairingCode(bundleText) ? "אין צורך בקוד עבור OTZAR-QR1" : "קוד האבטחה שהגדרת בייצוא"}
                disabled={isMobileQrPairingCode(bundleText)}
                className="min-h-[44px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] pl-3 pr-9 text-sm text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)] disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !bundleText.trim() || (!isMobileQrPairingCode(bundleText) && !passcode.trim())}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--otzar-accent)] px-4 font-bold text-[var(--otzar-accent)] active:scale-[0.98] disabled:opacity-45"
            >
              <span>{busy ? "מאמת ומושך נתונים..." : "פענח והתחבר לענן"}</span>
            </button>
          </form>

          {/* Manual Advanced Toggle */}
          <div className="border-t border-[var(--otzar-border-muted)] pt-2">
            <button
              type="button"
              onClick={() => setManualOpen((v) => !v)}
              className="flex min-h-[44px] w-full items-center justify-between text-xs font-semibold text-[var(--otzar-text-muted)]"
            >
              <span>חיבור ידני (Firebase Web Config + אימייל)</span>
              {manualOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {manualOpen && (
              <form onSubmit={handleConnectManual} className="mt-2 space-y-2.5">
                <textarea
                  rows={4}
                  dir="ltr"
                  value={manualConfigJson}
                  onChange={(e) => setManualConfigJson(e.target.value)}
                  placeholder='{"apiKey":"...","projectId":"...","appId":"..."}'
                  className="w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-2.5 text-xs text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
                />
                <input
                  type="email"
                  dir="ltr"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="admin@yeshiva.org"
                  className="min-h-[44px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
                />
                <input
                  type="password"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  placeholder="סיסמת Firebase Auth"
                  className="min-h-[44px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[44px] w-full rounded-xl border border-[var(--otzar-accent)] font-bold text-[var(--otzar-accent)] active:scale-[0.98]"
                >
                  התחבר ידנית
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Status, Theme & Cache Controls */}
        <div className="space-y-4">
          <section className="space-y-3 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-4">
            <h2 className="text-base font-bold text-[var(--otzar-text)]">{t("mobile.syncAndLocalDb")}</h2>

            <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-[var(--otzar-surface-alt)] p-3 text-xs tabular-nums">
              <div>
                <span className="block text-[var(--otzar-text-muted)]">ספרים במכשיר</span>
                <span className="text-base font-bold text-[var(--otzar-text)]">{counts.books.toLocaleString("he-IL")}</span>
              </div>
              <div>
                <span className="block text-[var(--otzar-text-muted)]">ארונות · שואלים</span>
                <span className="text-base font-bold text-[var(--otzar-text)]">
                  {counts.cabinets} · {counts.borrowers}
                </span>
              </div>
              <div>
                <span className="block text-[var(--otzar-text-muted)]">פרויקט ענן</span>
                <span className="font-semibold text-[var(--otzar-text)]">{sync.projectId || config?.firebaseConfig.projectId || "לא הוגדר"}</span>
              </div>
              <div>
                <span className="block text-[var(--otzar-text-muted)]">סנכרון אחרון</span>
                <span className="font-semibold text-[var(--otzar-text)]">
                  {sync.lastSyncAt
                    ? new Date(sync.lastSyncAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
                    : "טרם סונכרן"}
                </span>
              </div>
            </div>

            {sync.error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                {sync.error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!config || sync.connecting}
                onClick={onSyncNow}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[var(--otzar-accent)] px-3 text-sm font-bold text-white active:scale-95 disabled:opacity-45"
              >
                <RefreshCw className={`h-4 w-4 ${sync.connecting ? "animate-spin" : ""}`} />
                <span>{t("sync.syncNow")}</span>
              </button>

              <button
                type="button"
                disabled={!config || sync.connecting}
                onClick={onFullResync}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm font-semibold text-[var(--otzar-text)] active:scale-95 disabled:opacity-45"
              >
                <span>{t("mobile.fullResync")}</span>
              </button>
            </div>

            {config && (
              <div className="pt-1">
                {!confirmClear ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-rose-300/70 text-xs font-semibold text-rose-600 dark:border-rose-800 dark:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{t("mobile.disconnectAndClearCache")}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-2 dark:border-rose-800 dark:bg-rose-950/30">
                    <span className="flex-1 text-xs font-semibold text-rose-800 dark:text-rose-200">
                      הפעולה מוחקת רק מהטלפון (הענן והמחשב בטוחים). לאשר?
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        setConfirmClear(false);
                        await onClearCacheAndDisconnect();
                      }}
                      className="min-h-[40px] rounded-lg bg-rose-600 px-3 text-xs font-bold text-white"
                    >
                      אשר
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="min-h-[40px] rounded-lg px-2 text-xs font-semibold text-[var(--otzar-text-muted)]"
                    >
                      ביטול
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Theme & Display */}
          <section className="space-y-3 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--otzar-text)]">
                <Palette className="h-4 w-4 text-[var(--otzar-accent)]" />
                <span>עיצוב ומראה</span>
              </h2>
              <button
                type="button"
                onClick={() => onChangeTheme(themePreset, themeMode === "dark" ? "light" : "dark")}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-xs font-semibold text-[var(--otzar-text)]"
              >
                {themeMode === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
                <span>{themeMode === "dark" ? "מצב בהיר" : "מצב כהה"}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "default", label: "כתום ישיבתי" },
                  { id: "classic-blue", label: "כחול קלאסי" },
                  { id: "forest-green", label: "ירוק יער" },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChangeTheme(preset.id, themeMode)}
                  className={`min-h-[42px] rounded-xl border px-2 text-xs font-semibold transition-colors ${
                    themePreset === preset.id
                      ? "border-[var(--otzar-accent)] bg-[var(--otzar-accent-soft)] text-[var(--otzar-accent)]"
                      : "border-[var(--otzar-border-muted)] text-[var(--otzar-text-muted)]"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          {/* App Auto-Update */}
          <section className="space-y-3 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--otzar-text)]">
                <Download className="h-4 w-4 text-[var(--otzar-accent)]" />
                <span>עדכוני אפליקציה אוטומטיים</span>
              </h2>
              <span className="rounded-lg bg-[var(--otzar-surface-alt)] px-2.5 py-1 text-xs font-bold tabular-nums text-[var(--otzar-text-muted)]">
                v{installedVersion}
              </span>
            </div>

            <div className="space-y-2 rounded-xl bg-[var(--otzar-surface-alt)] p-3 text-xs">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <span className="block font-semibold text-[var(--otzar-text)]">
                    בדיקת עדכונים אוטומטית בהפעלה
                  </span>
                  <span className="text-[11px] text-[var(--otzar-text-muted)]">
                    בודק מול GitHub Releases בכל פתיחת אפליקציה
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={updatePrefs.autoCheckOnLaunch}
                  onChange={(e) =>
                    onUpdatePrefsChange({ ...updatePrefs, autoCheckOnLaunch: e.target.checked })
                  }
                  className="h-5 w-5 accent-[var(--otzar-accent)]"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-[var(--otzar-border-muted)] pt-2">
                <div>
                  <span className="block font-semibold text-[var(--otzar-text)]">
                    הורד והצע התקנה אוטומטית כשזמין עדכון
                  </span>
                  <span className="text-[11px] text-[var(--otzar-text-muted)]">
                    מוריד את העדכון מיד ברקע ומקפיץ את מסך ההתקנה (דורש אישור התקנה במכשיר)
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={updatePrefs.autoDownloadAndPrompt}
                  onChange={(e) =>
                    onUpdatePrefsChange({ ...updatePrefs, autoDownloadAndPrompt: e.target.checked })
                  }
                  className="h-5 w-5 accent-[var(--otzar-accent)]"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs text-[var(--otzar-text-muted)]">
              <span>
                בדיקה אחרונה:{" "}
                {updatePrefs.lastCheckedAt
                  ? new Date(updatePrefs.lastCheckedAt).toLocaleString("he-IL", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "טרם נבדק"}
              </span>
              <button
                type="button"
                disabled={updateChecking || updateDownloading}
                onClick={() => {
                  void onCheckForUpdates();
                }}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-xs font-bold text-[var(--otzar-text)] active:scale-95 disabled:opacity-45"
              >
                <RefreshCw className={"h-3.5 w-3.5 " + (updateChecking ? "animate-spin text-[var(--otzar-accent)]" : "")} />
                <span>{updateChecking ? "בודק..." : "בדוק עדכונים עכשיו"}</span>
              </button>
            </div>

            {updateError && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                {updateError}
              </p>
            )}

            {updateStatusMsg && (
              <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{updateStatusMsg}</span>
              </p>
            )}

            {updateInfo?.hasUpdate && (
              <div className="space-y-2.5 rounded-xl border border-[var(--otzar-accent)]/50 bg-[var(--otzar-accent-soft)]/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-[var(--otzar-text)]">
                    גרסה חדשה זמינה: v{updateInfo.latestVersion}
                  </div>
                  {updateInfo.apkSize && (
                    <span className="text-[11px] font-semibold tabular-nums text-[var(--otzar-text-muted)]">
                      {formatBytesHe(updateInfo.apkSize)}
                    </span>
                  )}
                </div>

                {updateInfo.releaseNotes && (
                  <p className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--otzar-bg)]/80 p-2 text-[11px] leading-relaxed text-[var(--otzar-text-muted)]">
                    {updateInfo.releaseNotes}
                  </p>
                )}

                {updateDownloading && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold tabular-nums text-[var(--otzar-text)]">
                      <span>מוריד עדכון...</span>
                      <span>{updateProgress?.progress ?? 0}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--otzar-border-muted)]">
                      <div
                        className="h-full bg-[var(--otzar-accent)] transition-all duration-200"
                        style={{ width: Math.min(100, Math.max(4, updateProgress?.progress ?? 0)) + "%" }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {updateInfo.apkUrl && (
                    <button
                      type="button"
                      disabled={updateDownloading}
                      onClick={() => {
                        void onInstallUpdate();
                      }}
                      className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--otzar-accent)] px-3 text-xs font-bold text-white active:scale-95 disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      <span>
                        {updateDownloading
                          ? "מוריד מתקין..."
                          : isNativeAndroid()
                          ? "הורד והתקן עדכון"
                          : "הורד APK"}
                      </span>
                    </button>
                  )}
                  {updateInfo.apkUrl && isNativeAndroid() && (
                    <>
                      <button
                        type="button"
                        disabled={updateDownloading}
                        onClick={() => {
                          void onSaveApkToDownloads();
                        }}
                        className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] px-3 text-xs font-semibold text-[var(--otzar-text)] active:scale-95 disabled:opacity-50"
                      >
                        <FolderDown className="h-3.5 w-3.5 text-[var(--otzar-accent)]" />
                        <span>שמור להורדות</span>
                      </button>
                      <button
                        type="button"
                        disabled={updateDownloading}
                        onClick={() => {
                          void onShareApk();
                        }}
                        className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] px-3 text-xs font-semibold text-[var(--otzar-text)] active:scale-95 disabled:opacity-50"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>שתף APK</span>
                      </button>
                    </>
                  )}
                  <a
                    href={updateInfo.apkUrl || updateInfo.releasePageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[42px] items-center justify-center gap-1 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] px-3 text-xs font-semibold text-[var(--otzar-text)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>פתח בדפדפן</span>
                  </a>
                </div>
                {isNativeAndroid() && (
                  <p className="flex items-start gap-1.5 text-[11px] text-[var(--otzar-text-muted)]">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--otzar-accent)]" />
                    <span>
                      בפעם הראשונה אנדרואיד עשוי לבקש אישור חד-פעמי עבור "התקן אפליקציות לא מוכרות" עבור אוצר ספרים.
                    </span>
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      <BarcodeScannerModal
        open={qrScannerOpen}
        title="סריקת ברקוד חיבור מהמחשב"
        formatsMode="qr"
        hintText="כוון את המצלמה אל ברקוד ה-QR שעל מסך המחשב"
        manualInputMode="text"
        manualLabel="או הדבק קוד חיבור מהמחשב:"
        manualPlaceholder="OTZAR-QR1:... או OTZAR-SETUP:..."
        onDetected={(code) => {
          void connectFromQrCode(code);
        }}
        onClose={() => setQrScannerOpen(false)}
      />
    </div>
  );
};
