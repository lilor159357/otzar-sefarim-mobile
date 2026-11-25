import React, { useMemo } from "react";
import type { CabinetDoc, MapEntrance, RoomDimensions } from "../types.ts";

export const MAP_WIDTH = 760;
export const MAP_HEIGHT = 440;

interface LibraryMap2DProps {
  cabinets: CabinetDoc[];
  bookCountsByCabinet?: Record<string, number>;
  highlightedCabinetId?: string | null;
  highlightedCabinetCode?: string | null;
  entrance?: MapEntrance;
  onSelectCabinet?: (cabinet: CabinetDoc) => void;
  roomDimensions?: RoomDimensions;
  compact?: boolean;
}

export const LibraryMap2D: React.FC<LibraryMap2DProps> = ({
  cabinets,
  bookCountsByCabinet = {},
  highlightedCabinetId,
  highlightedCabinetCode,
  entrance = { wall: "bottom", offset: 0.5 },
  onSelectCabinet,
  roomDimensions,
  compact = false,
}) => {
  const entranceCoords = useMemo(() => {
    const off = Math.min(0.92, Math.max(0.08, Number(entrance?.offset ?? 0.5)));
    switch (entrance?.wall) {
      case "top":
        return { x: off * MAP_WIDTH - 48, y: 0, w: 96, h: 20, tx: off * MAP_WIDTH, ty: 14 };
      case "left":
        return { x: 0, y: off * MAP_HEIGHT - 36, w: 22, h: 72, tx: 11, ty: off * MAP_HEIGHT + 4 };
      case "right":
        return { x: MAP_WIDTH - 22, y: off * MAP_HEIGHT - 36, w: 22, h: 72, tx: MAP_WIDTH - 11, ty: off * MAP_HEIGHT + 4 };
      case "bottom":
      default:
        return { x: off * MAP_WIDTH - 48, y: MAP_HEIGHT - 20, w: 96, h: 20, tx: off * MAP_WIDTH, ty: MAP_HEIGHT - 6 };
    }
  }, [entrance]);

  if (cabinets.length === 0) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-6 text-center text-sm text-[var(--otzar-text-muted)]">
        <p className="font-medium text-[var(--otzar-text)]">אין ארונות מוגדרים במפה עדיין</p>
        <p className="mt-1 text-xs">סנכרן נתונים מהמחשב או הגדר ארונות בממשק הניהול.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)]">
      {roomDimensions && !compact && (
        <div className="flex items-center justify-between border-b border-[var(--otzar-border-muted)] bg-[var(--otzar-surface)] px-3 py-1.5 text-xs text-[var(--otzar-text-muted)]">
          <span className="font-semibold text-[var(--otzar-text)]">
            מידות חדר: {roomDimensions.width_m}×{roomDimensions.length_m} מ׳
          </span>
          <span className="tabular-nums">
            {(roomDimensions.width_m * roomDimensions.length_m).toFixed(1)} מ״ר
          </span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className={`block w-full select-none ${compact ? "max-h-[240px]" : "max-h-[340px]"}`}
        role="img"
        aria-label="מפת ארונות הספרייה"
      >
        <defs>
          <pattern id="mob-map-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#mob-map-grid)" />
        <rect
          x="4"
          y="4"
          width={MAP_WIDTH - 8}
          height={MAP_HEIGHT - 8}
          rx="14"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="2"
        />

        {/* Entrance */}
        <g>
          <rect
            x={entranceCoords.x}
            y={entranceCoords.y}
            width={entranceCoords.w}
            height={entranceCoords.h}
            rx="6"
            fill="#10b981"
          />
          <text
            x={entranceCoords.tx}
            y={entranceCoords.ty}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#ffffff"
          >
            כניסה
          </text>
        </g>

        {cabinets.map((cab) => {
          const isHighlighted =
            (highlightedCabinetId && cab.sync_id === highlightedCabinetId) ||
            (highlightedCabinetCode && cab.code === highlightedCabinetCode);
          const count = bookCountsByCabinet[cab.sync_id] ?? 0;
          const cx = cab.x + cab.width / 2;
          const cy = cab.y + cab.height / 2;
          const rot = cab.rotation || 0;

          return (
            <g
              key={cab.sync_id}
              transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined}
              onClick={() => onSelectCabinet?.(cab)}
              className={onSelectCabinet ? "cursor-pointer" : undefined}
            >
              {isHighlighted && (
                <rect
                  x={cab.x - 6}
                  y={cab.y - 6}
                  width={cab.width + 12}
                  height={cab.height + 12}
                  rx="12"
                  fill="none"
                  stroke="#ea580c"
                  strokeWidth="3"
                  strokeDasharray="6 4"
                />
              )}
              <rect
                x={cab.x}
                y={cab.y}
                width={cab.width}
                height={cab.height}
                rx="9"
                fill={isHighlighted ? "#ea580c" : "var(--otzar-bg)"}
                stroke={isHighlighted ? "#9a3412" : "var(--otzar-accent)"}
                strokeWidth={isHighlighted ? "2.5" : "1.8"}
              />
              <text
                x={cx}
                y={cy - 4}
                textAnchor="middle"
                fontSize={Math.min(18, Math.max(12, cab.height * 0.25))}
                fontWeight="800"
                fill={isHighlighted ? "#ffffff" : "var(--otzar-text)"}
              >
                {cab.code}
              </text>
              <text
                x={cx}
                y={cy + 14}
                textAnchor="middle"
                fontSize="10.5"
                fontWeight="500"
                fill={isHighlighted ? "#ffedd5" : "var(--otzar-text-muted)"}
              >
                {(cab.main_subject || `${cab.shelves_count} מדפים`).slice(0, 14)}
                {count > 0 ? ` (${count})` : ""}
              </text>
              {cab.height >= 70 && cab.width_cm && cab.depth_cm && (
                <text
                  x={cx}
                  y={cy + 26}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="500"
                  fill={isHighlighted ? "#ffedd5" : "var(--otzar-text-muted)"}
                  opacity={0.85}
                >
                  {cab.width_cm}×{cab.depth_cm} ס״מ
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
