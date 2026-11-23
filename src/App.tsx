import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BookDoc, MobileConnectionConfig, TabKey } from "./types.ts";
import {
  clearSavedConnectionConfig,
  loadSavedConnectionConfig,
  MobileOtzarClient,
  saveConnectionConfig,
} from "./lib/mobileFirebase.ts";
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
