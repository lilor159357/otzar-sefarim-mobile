import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import type { BookDoc, MobileConnectionConfig, TabKey } from "./types.ts";
import {
  clearSavedConnectionConfig,
  loadSavedConnectionConfig,
  MobileOtzarClient,
  saveConnectionConfig,
} from "./lib/mobileFirebase.ts";
import {
  canInstallApkDirectly,
  checkForAppUpdate,
  downloadAndInstallUpdate,
  getInstalledVersion,
  isNativeAndroid,
  loadUpdatePrefs,
  saveUpdatePrefs,
  type DownloadProgressInfo,
  type UpdateCheckResult,
  type UpdatePreferences,
} from "./lib/appUpdater.ts";
import { MobileTopBar } from "./components/MobileTopBar.tsx";
import { BottomNav } from "./components/BottomNav.tsx";
import { SearchAndMapTab } from "./components/SearchAndMapTab.tsx";
import { CirculationTab } from "./components/CirculationTab.tsx";
import { AiRelayTab } from "./components/AiRelayTab.tsx";
import { ConnectionTab } from "./components/ConnectionTab.tsx";

const THEME_STORAGE_KEY = "otzar_mobile_theme_v1";

function loadThemePrefs(savedConn: MobileConnectionConfig | null): {
  preset: "default" | "classic-blue" | "forest-green";
  mode: "light" | "dark";
} {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        preset: p.preset === "classic-blue" || p.preset === "forest-green" ? p.preset : "default",
        mode: p.mode === "dark" ? "dark" : "light",
      };
    }
  } catch {}
  return {
    preset: savedConn?.themePreset || "default",
    mode: savedConn?.themeMode || "light",
  };
}

export function App() {
  const initialConn = useMemo(() => loadSavedConnectionConfig(), []);
  const initialTheme = useMemo(() => loadThemePrefs(initialConn), [initialConn]);

  const [connConfig, setConnConfig] = useState<MobileConnectionConfig | null>(initialConn);
  const [activeTab, setActiveTab] = useState<TabKey>(initialConn ? "search" : "settings");
  const [themePreset, setThemePreset] = useState<"default" | "classic-blue" | "forest-green">(initialTheme.preset);
  const [themeMode, setThemeMode] = useState<"light" | "dark">(initialTheme.mode);
  const [preselectedCirc, setPreselectedCirc] = useState<{
    book: BookDoc;
    action: "checkout" | "return";
    seq: number;
  } | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string>(() =>
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.1"
  );
  const [updatePrefs, setUpdatePrefs] = useState<UpdatePreferences>(() => loadUpdatePrefs());
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<DownloadProgressInfo | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [, setTick] = useState(0);

  const clientRef = useRef<MobileOtzarClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new MobileOtzarClient(() => setTick((t) => t + 1));
  }
  const client = clientRef.current;

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark", themeMode === "dark");
    if (themePreset === "default") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", themePreset);
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ preset: themePreset, mode: themeMode }));
    } catch {}
  }, [themePreset, themeMode]);

  useEffect(() => {
    if (initialConn) {
      client.connect(initialConn).catch(() => {
        // Offline / error state already recorded in snapshot; cached library remains browsable
      });
    }
    return () => {
      void client.disconnect();
    };
  }, [client, initialConn]);

  const handleUpdatePrefsChange = useCallback((next: UpdatePreferences) => {
    setUpdatePrefs(next);
    saveUpdatePrefs(next);
  }, []);

  const installUpdateUrl = useCallback(async (apkUrl: string) => {
    setUpdateDownloading(true);
    setUpdateProgress({ progress: 0, downloadedBytes: 0, totalBytes: 0 });
    setUpdateError(null);
    setUpdateStatusMsg(null);
    try {
      const outcome = await downloadAndInstallUpdate(apkUrl, (prog) => {
        setUpdateProgress(prog);
      });
      if (outcome.status === "permission_required") {
        setUpdateStatusMsg(
          "נדרש אישור חד-פעמי להתקנת עדכונים בהגדרות הטלפון ('אפשר ממקור זה'). לאחר האישור לחץ שוב על 'הורד והתקן עדכון'."
        );
      } else if (outcome.status === "installer_launched") {
        setUpdateStatusMsg("מסך עדכון האפליקציה נפתח. אשר התקנה כדי לעדכן לגרסה החדשה.");
      } else {
        setUpdateStatusMsg("קובץ ההתקנה (APK) נפתח להורדה בדפדפן.");
      }
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : "הורדת העדכון נכשלה.");
    } finally {
      setUpdateDownloading(false);
    }
  }, []);

  const handleCheckForUpdates = useCallback(
    async (silent = false) => {
      if (navigator.onLine === false) {
        if (!silent) {
          setUpdateError("אין חיבור אינטרנט כרגע לבדיקת עדכונים.");
        }
        return;
      }
      setUpdateChecking(true);
      if (!silent) {
        setUpdateError(null);
        setUpdateStatusMsg(null);
      }
      try {
        const res = await checkForAppUpdate();
        setInstalledVersion(res.currentVersion);
        setUpdateInfo(res);
        setUpdatePrefs(loadUpdatePrefs());
        if (!res.hasUpdate) {
          if (!silent) {
            setUpdateStatusMsg(`האפליקציה מעודכנת לגרסה האחרונה (v${res.currentVersion}).`);
          }
        } else {
          if (!silent) {
            setBannerDismissed(false);
          }
          const latestPrefs = loadUpdatePrefs();
          if (silent && latestPrefs.autoDownloadAndPrompt && res.apkUrl && isNativeAndroid()) {
            const canDirect = await canInstallApkDirectly();
            if (canDirect) {
              void installUpdateUrl(res.apkUrl);
            }
          }
        }
      } catch (err) {
        if (!silent) {
          setUpdateError(err instanceof Error ? err.message : "בדיקת העדכונים נכשלה.");
        }
      } finally {
        setUpdateChecking(false);
      }
    },
    [installUpdateUrl]
  );

  const handleInstallUpdate = useCallback(async () => {
    if (!updateInfo?.apkUrl) {
      setUpdateError("לא נמצא קובץ APK מצורף לשחרור זה.");
      return;
    }
    await installUpdateUrl(updateInfo.apkUrl);
  }, [installUpdateUrl, updateInfo]);

  useEffect(() => {
    void getInstalledVersion().then(setInstalledVersion);
  }, []);

  useEffect(() => {
    const prefs = loadUpdatePrefs();
    if (!prefs.autoCheckOnLaunch) return;
    const timer = window.setTimeout(() => {
      void handleCheckForUpdates(true);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [handleCheckForUpdates]);

  const sync = client.getSnapshot();
  const data = client.getData();

  const overdueCount = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
    return data.loans.filter((l) => !l.return_date && l.due_date && l.due_date.slice(0, 10) < today).length;
  }, [data.loans]);

  const handleConnectConfig = async (cfg: MobileConnectionConfig) => {
    await client.connect(cfg);
    saveConnectionConfig(cfg);
    setConnConfig(cfg);
    if (cfg.themePreset || cfg.themeMode) {
      setThemePreset(cfg.themePreset || "default");
      setThemeMode(cfg.themeMode || "light");
    }
  };

  const handleSyncNow = async () => {
    if (!connConfig) return;
    if (!sync.connected) {
      await client.connect(connConfig);
    } else {
      await client.syncNow();
    }
  };

  const handleFullResync = async () => {
    if (!connConfig) return;
    client.clearCache();
    await client.connect(connConfig);
  };

  const handleClearAndDisconnect = async () => {
    await client.disconnect();
    client.clearCache();
    clearSavedConnectionConfig();
    setConnConfig(null);
  };

  return (
    <div className="min-h-screen bg-[var(--otzar-bg)] text-[var(--otzar-text)]">
      <MobileTopBar
        libraryName={data.meta.library_name || connConfig?.libraryName || "אוצר ספרים"}
        sync={sync}
        booksCount={data.books.length}
        hasConfig={connConfig !== null}
        onSyncNow={() => {
          void handleSyncNow();
        }}
        onOpenSettings={() => setActiveTab("settings")}
      />
      {updateInfo?.hasUpdate &&
        (updateDownloading ||
          (!bannerDismissed && updatePrefs.dismissedVersion !== updateInfo.latestVersion)) && (
          <div className="border-b border-[var(--otzar-accent)]/35 bg-[var(--otzar-accent-soft)] px-3 py-2 sm:px-5">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--otzar-text)]">
                  <Download className="h-3.5 w-3.5 shrink-0 text-[var(--otzar-accent)]" />
                  <span className="truncate">
                    {updateDownloading
                      ? `מוריד עדכון v${updateInfo.latestVersion} (${updateProgress?.progress ?? 0}%)...`
                      : `גרסה חדשה זמינה: v${updateInfo.latestVersion}`}
                  </span>
                </div>
                {updateDownloading && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--otzar-border-muted)]">
                    <div
                      className="h-full bg-[var(--otzar-accent)] transition-all duration-200"
                      style={{ width: `${Math.min(100, Math.max(4, updateProgress?.progress ?? 0))}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {updateInfo.apkUrl && (
                  <button
                    type="button"
                    disabled={updateDownloading}
                    onClick={() => {
                      void handleInstallUpdate();
                    }}
                    className="min-h-[34px] rounded-lg bg-[var(--otzar-accent)] px-2.5 text-xs font-bold text-white active:scale-95 disabled:opacity-50"
                  >
                    {updateDownloading ? "מוריד..." : "עדכן עכשיו"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab("settings")}
                  className="min-h-[34px] rounded-lg border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] px-2 text-xs font-semibold text-[var(--otzar-text)]"
                >
                  פרטים
                </button>
                {!updateDownloading && (
                  <button
                    type="button"
                    aria-label="סגור התראת עדכון"
                    onClick={() => {
                      setBannerDismissed(true);
                      handleUpdatePrefsChange({
                        ...updatePrefs,
                        dismissedVersion: updateInfo.latestVersion,
                      });
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--otzar-text-muted)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      <main className="mx-auto max-w-5xl px-3 pb-24 pt-3 sm:px-5">
        {activeTab === "search" && (
          <SearchAndMapTab
            books={data.books}
            cabinets={data.cabinets}
            borrowers={data.borrowers}
            loans={data.loans}
            meta={data.meta}
            onJumpToCirculation={(action, book) => {
              setPreselectedCirc({ book, action, seq: Date.now() });
              setActiveTab("circulation");
            }}
          />
        )}

        {activeTab === "circulation" && (
          <CirculationTab
            books={data.books}
            borrowers={data.borrowers}
            loans={data.loans}
            defaultLoanDays={data.meta.default_loan_days}
            connected={sync.connected}
            preselectedBook={preselectedCirc}
            onCheckout={(booksToLoan, borrower, days) =>
              client.checkoutBooks({ books: booksToLoan, borrower, loanDays: days })
            }
            onReturnLoan={(loan) => client.returnLoan(loan)}
          />
        )}

        {activeTab === "relay" && (
          <AiRelayTab
            cabinets={data.cabinets}
            connected={sync.connected}
            onSendRelay={(params) => client.sendRelayPhotos(params)}
          />
        )}

        {activeTab === "settings" && (
          <ConnectionTab
            config={connConfig}
            sync={sync}
            counts={{
              books: data.books.length,
              cabinets: data.cabinets.length,
              borrowers: data.borrowers.length,
              loans: data.loans.length,
            }}
            themePreset={themePreset}
            themeMode={themeMode}
            installedVersion={installedVersion}
            updatePrefs={updatePrefs}
            updateChecking={updateChecking}
            updateDownloading={updateDownloading}
            updateProgress={updateProgress}
            updateInfo={updateInfo}
            updateError={updateError}
            updateStatusMsg={updateStatusMsg}
            onUpdatePrefsChange={handleUpdatePrefsChange}
            onCheckForUpdates={() => handleCheckForUpdates(false)}
            onInstallUpdate={handleInstallUpdate}
            onConnectConfig={handleConnectConfig}
            onSyncNow={handleSyncNow}
            onFullResync={handleFullResync}
            onClearCacheAndDisconnect={handleClearAndDisconnect}
            onChangeTheme={(preset, mode) => {
              setThemePreset(preset);
              setThemeMode(mode);
            }}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onSelect={setActiveTab}
        overdueCount={overdueCount}
        hasConfig={connConfig !== null}
      />
    </div>
  );
}

export default App;
