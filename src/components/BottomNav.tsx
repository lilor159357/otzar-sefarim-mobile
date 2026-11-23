import React from "react";
import { Search, ArrowLeftRight, Camera, Settings2 } from "lucide-react";
import type { TabKey } from "../types.ts";

interface BottomNavProps {
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
  overdueCount: number;
  hasConfig: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelect,
  overdueCount,
  hasConfig,
}) => {
  const items: Array<{ key: TabKey; label: string; icon: React.ReactNode; badge?: number }> = [
    { key: "search", label: "חיפוש ומפה", icon: <Search className="h-5 w-5" /> },
    {
      key: "circulation",
      label: "השאלה",
      icon: <ArrowLeftRight className="h-5 w-5" />,
      badge: overdueCount > 0 ? overdueCount : undefined,
    },
    { key: "relay", label: "צילום AI", icon: <Camera className="h-5 w-5" /> },
    {
      key: "settings",
      label: "חיבור",
      icon: <Settings2 className="h-5 w-5" />,
      badge: !hasConfig ? 1 : undefined,
    },
  ];

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)]/95 backdrop-blur-md pb-safe"
    >
      <div className="mx-auto grid h-16 max-w-5xl grid-cols-4 px-1">
        {items.map((item) => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={`relative flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl transition-colors ${
                active
                  ? "text-[var(--otzar-accent)] font-semibold"
                  : "text-[var(--otzar-text-muted)] hover:text-[var(--otzar-text)]"
              }`}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-10 rounded-full bg-[var(--otzar-accent)]" />
              )}
              <span className="relative">
                {item.icon}
                {item.badge != null && (
                  <span className="absolute -left-2.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white tabular-nums">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className="text-[11px] leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
