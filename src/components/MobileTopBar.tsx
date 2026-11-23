import React from "react";
import { RefreshCw, Wifi, WifiOff, Cloud } from "lucide-react";
import type { SyncSnapshot } from "../types.ts";

interface MobileTopBarProps {
  libraryName: string;
  sync: SyncSnapshot;
  booksCount: number;
  hasConfig: boolean;
  onSyncNow: () => void;
  onOpenSettings: () => void;
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  libraryName,
  sync,
  booksCount,
  hasConfig,
  onSyncNow,
  onOpenSettings,
}) => {
  const statusLabel = !hasConfig
    ? "ממתין לחיבור"
    : sync.connecting
    ? "מתחבר ומסנכרן..."
    : sync.connected
    ? `מחובר · ${booksCount.toLocaleString("he-IL")} ספרים`
    : sync.offline
    ? "מצב לא מקוון"
    : "מטמון מקומי";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)]/95 backdrop-blur-md pt-safe">
      <div className="mx-auto flex h-[52px] max-w-5xl items-center justify-between px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--otzar-accent-soft)] text-[var(--otzar-accent)]">
            <Cloud className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight text-[var(--otzar-text)]">
              {libraryName || "אוצר ספרים"}
            </h1>
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 text-xs text-[var(--otzar-text-muted)] tabular-nums"
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  sync.connected
                    ? "bg-emerald-500"
                    : sync.connecting
                    ? "animate-pulse bg-amber-500"
                    : "bg-slate-400"
                }`}
              />
              <span className="truncate">{statusLabel}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!sync.connected && hasConfig && (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="פרטי חיבור"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--otzar-text-muted)] active:bg-[var(--otzar-surface-alt)]"
            >
              {sync.offline ? <WifiOff className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={onSyncNow}
            disabled={!hasConfig || sync.connecting}
            aria-label="רענן סנכרון"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--otzar-text)] hover:bg-[var(--otzar-surface-alt)] active:scale-95 disabled:opacity-40"
          >
            <RefreshCw className={`h-5 w-5 ${sync.connecting ? "animate-spin text-[var(--otzar-accent)]" : ""}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
