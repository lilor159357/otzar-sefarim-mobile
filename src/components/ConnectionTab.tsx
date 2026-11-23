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
} from "lucide-react";
import type { MobileConnectionConfig, SyncSnapshot } from "../types.ts";
import { decryptDesktopSetupBundle, parseFirebaseConfigRaw } from "../lib/setupDecrypt.ts";

interface ConnectionTabProps {
  config: MobileConnectionConfig | null;
  sync: SyncSnapshot;
  counts: { books: number; cabinets: number; borrowers: number; loans: number };
  themePreset: "default" | "classic-blue" | "forest-green";
  themeMode: "light" | "dark";
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
  onConnectConfig,
  onSyncNow,
  onFullResync,
  onClearCacheAndDisconnect,
  onChangeTheme,
}) => {
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
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleConnectViaBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const decrypted = await decryptDesktopSetupBundle(bundleText, passcode);
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
            <h2 className="text-base font-bold text-[var(--otzar-text)]">חיבור מהיר מהמחשב (בלחיצה אחת)</h2>
          </div>
          <p className="text-xs leading-relaxed text-[var(--otzar-text-muted)]">
            בתוכנת המחשב היכנס ל<b>הגדרות ומפה ← העברה למכשיר אחר</b>, צור קוד העברה (`OTZAR-SETUP:...`) או קובץ `.otzar-setup` והדבק/טען כאן.
          </p>

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
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="קוד האבטחה שהגדרת בייצוא"
                className="min-h-[44px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] pl-3 pr-9 text-sm text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !bundleText.trim() || !passcode.trim()}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--otzar-accent)] px-4 font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-45"
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
            <h2 className="text-base font-bold text-[var(--otzar-text)]">מצב סנכרון ומאגר מקומי</h2>

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
                <span>סנכרן עכשיו</span>
              </button>

              <button
                type="button"
                disabled={!config || sync.connecting}
                onClick={onFullResync}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm font-semibold text-[var(--otzar-text)] active:scale-95 disabled:opacity-45"
              >
                <span>משיכה מלאה מחדש</span>
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
                    <span>התנתק מהענן ומחק מטמון מהטלפון</span>
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
        </div>
      </div>
    </div>
  );
};
