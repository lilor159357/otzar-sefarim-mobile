import React, { useMemo, useState } from "react";
import { Search, ScanLine, Map as MapIcon, X, BookOpen, ArrowLeftRight, MapPin, Layers, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import type { BookDoc, BorrowerDoc, CabinetDoc, LibraryMetaDoc, LoanDoc } from "../types.ts";
import { searchMobileBooks, groupMobileSetBySubSeries, type MobileSetSubSeriesSection, type MobileSetVolumeGroup } from "../lib/torahSearch.ts";
import { useStrings } from "../lib/stringsContext.tsx";
import { LibraryMap2D } from "./LibraryMap2D.tsx";
import { BarcodeScannerModal } from "./BarcodeScannerModal.tsx";

interface SearchAndMapTabProps {
  books: BookDoc[];
  cabinets: CabinetDoc[];
  borrowers: BorrowerDoc[];
  loans: LoanDoc[];
  meta: LibraryMetaDoc;
  onJumpToCirculation: (action: "checkout" | "return", book: BookDoc) => void;
}

type StatusFilter = "all" | "available" | "loaned" | "reference";

function formatHeDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("he-IL");
}

function statusMeta(status: string): { label: string; dotClass: string; textClass: string } {
  switch (status) {
    case "available":
      return { label: "זמין", dotClass: "bg-emerald-500", textClass: "text-emerald-700 dark:text-emerald-400" };
    case "loaned":
      return { label: "מושאל", dotClass: "bg-amber-500", textClass: "text-amber-700 dark:text-amber-400" };
    case "reference":
      return { label: "לעיון בלבד", dotClass: "bg-sky-500", textClass: "text-sky-700 dark:text-sky-400" };
    case "lost":
      return { label: "חסר / אבד", dotClass: "bg-rose-500", textClass: "text-rose-700 dark:text-rose-400" };
    default:
      return { label: status || "לא ידוע", dotClass: "bg-slate-400", textClass: "text-[var(--otzar-text-muted)]" };
  }
}

export const SearchAndMapTab: React.FC<SearchAndMapTabProps> = ({
  books,
  cabinets,
  borrowers,
  loans,
  meta,
  onJumpToCirculation,
}) => {
  const { t } = useStrings();
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<BookDoc | null>(null);
  const [sheetShowMap, setSheetShowMap] = useState(true);
  const [expandedVolGroup, setExpandedVolGroup] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("default");
  const [setTypeFilter, setSetTypeFilter] = useState<"all" | "set_only" | "single_only">("all");

  const bookCountsByCabinet = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of books) {
      if (b.cabinet_sync_id) {
        map[b.cabinet_sync_id] = (map[b.cabinet_sync_id] || 0) + 1;
      }
    }
    return map;
  }, [books]);

  const activeLoanByBook = useMemo(() => {
    const map = new Map<string, LoanDoc>();
    for (const l of loans) {
      if (l.return_date) continue;
      if (l.book_sync_id) map.set(l.book_sync_id, l);
      if (l.book_barcode) map.set(`bc:${l.book_barcode}`, l);
    }
    return map;
  }, [loans]);

  const borrowerById = useMemo(() => {
    const map = new Map<string, BorrowerDoc>();
    for (const br of borrowers) map.set(br.sync_id, br);
    return map;
  }, [borrowers]);

  const selectedCabinet = useMemo(
    () => cabinets.find((c) => c.sync_id === selectedCabinetId) || null,
    [cabinets, selectedCabinetId]
  );

  const filteredResults = useMemo(() => {
    const scored = searchMobileBooks(books, queryText);
    const filtered = scored.filter(({ book }) => {
      if (statusFilter !== "all" && book.status !== statusFilter) return false;
      if (selectedCabinetId && book.cabinet_sync_id !== selectedCabinetId) return false;
      if (setTypeFilter === "set_only" && !book.set_name?.trim()) return false;
      if (setTypeFilter === "single_only" && book.set_name?.trim()) return false;
      return true;
    });
    if (sortBy === "default") return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const ba = a.book;
      const bb = b.book;
      switch (sortBy) {
        case "title_asc":
          return (ba.title || "").localeCompare(bb.title || "", "he");
        case "title_desc":
          return (bb.title || "").localeCompare(ba.title || "", "he");
        case "author_asc":
          return (ba.author || "").localeCompare(bb.author || "", "he");
        case "publisher_asc":
          return (ba.publisher || "").localeCompare(bb.publisher || "", "he");
        case "year_desc":
          return (bb.pub_year || "").localeCompare(ba.pub_year || "", "he");
        case "location_asc": {
          const cabA = ba.cabinet_code || "תתת";
          const cabB = bb.cabinet_code || "תתת";
          if (cabA !== cabB) return cabA.localeCompare(cabB, "he");
          return (ba.shelf_number || 0) - (bb.shelf_number || 0);
        }
        default:
          return 0;
      }
    });
    return copy;
  }, [books, queryText, statusFilter, selectedCabinetId, setTypeFilter, sortBy]);

  const visibleResults = filteredResults.slice(0, 120);

  const handleScanDetected = (code: string) => {
    setScannerOpen(false);
    const exact = books.find((b) => b.barcode.trim() === code.trim());
    if (exact) {
      setSelectedBook(exact);
      setSheetShowMap(true);
    } else {
      setQueryText(code);
    }
  };

  const activeLoanForSelected = selectedBook
    ? activeLoanByBook.get(selectedBook.sync_id) ||
      (selectedBook.barcode ? activeLoanByBook.get(`bc:${selectedBook.barcode}`) : undefined)
    : undefined;
  const activeBorrowerForSelected =
    activeLoanForSelected?.borrower_sync_id
      ? borrowerById.get(activeLoanForSelected.borrower_sync_id)
      : undefined;

  return (
    <div className="space-y-3">
      {/* Search & Scan Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--otzar-text-muted)]" />
          <input
            type="search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder={t("mobile.searchPlaceholder")}
            className="min-h-[46px] w-full rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] pl-10 pr-10 text-base text-[var(--otzar-text)] outline-none transition-colors focus:border-[var(--otzar-accent)] focus:bg-[var(--otzar-bg)]"
          />
          {queryText && (
            <button
              type="button"
              onClick={() => setQueryText("")}
              aria-label={t("mobile.clearSearchAria")}
              className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--otzar-text-muted)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          aria-label={t("mobile.scanBarcodeForBook")}
          className="flex h-[46px] min-w-[46px] items-center justify-center rounded-2xl bg-[var(--otzar-accent)] px-3 text-white shadow-sm active:scale-95"
        >
          <ScanLine className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => setShowMap((v) => !v)}
          aria-label={t("mobile.showLibraryMap")}
          className={`flex h-[46px] min-w-[46px] items-center justify-center gap-1.5 rounded-2xl border px-3 text-sm font-semibold transition-colors active:scale-95 ${
            showMap
              ? "border-[var(--otzar-accent)] bg-[var(--otzar-accent-soft)] text-[var(--otzar-accent)]"
              : "border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] text-[var(--otzar-text)]"
          }`}
        >
          <MapIcon className="h-5 w-5" />
          <span className="hidden sm:inline">מפה</span>
        </button>
      </div>

      {/* Status Segmented Bar */}
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--otzar-surface-alt)] p-1">
        {(
          [
            { key: "all", label: t("search.filterAll") },
            { key: "available", label: t("mobile.filterAvailable") },
            { key: "loaned", label: t("mobile.filterLoaned") },
            { key: "reference", label: t("mobile.filterReference") },
          ] as Array<{ key: StatusFilter; label: string }>
        ).map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`min-h-[40px] rounded-lg px-2 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? "bg-[var(--otzar-bg)] font-bold text-[var(--otzar-accent)] shadow-xs"
                  : "text-[var(--otzar-text-muted)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      
      {/* Sort & Cabinet/Set Filter Row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1 flex-1 min-w-[140px]">
          <ArrowUpDown className="h-3.5 w-3.5 text-[var(--otzar-text-muted)] shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="min-h-[38px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-2.5 text-xs font-semibold text-[var(--otzar-text)] outline-none"
          >
            <option value="default">מיון: התאמה לחיפוש</option>
            <option value="title_asc">שם הספר (א-ת)</option>
            <option value="title_desc">שם הספר (ת-א)</option>
            <option value="author_asc">מחבר (א-ת)</option>
            <option value="publisher_asc">הוצאה לאור</option>
            <option value="year_desc">שנת הוצאה</option>
            <option value="location_asc">מיקום בארון</option>
          </select>
        </div>
        <select
          value={selectedCabinetId || ""}
          onChange={(e) => setSelectedCabinetId(e.target.value || null)}
          className="min-h-[38px] rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-2.5 text-xs font-semibold text-[var(--otzar-text)] outline-none"
        >
          <option value="">כל הארונות</option>
          {cabinets.map((c) => (
            <option key={c.sync_id} value={c.sync_id}>
              ארון {c.code}
            </option>
          ))}
        </select>
        <select
          value={setTypeFilter}
          onChange={(e) => setSetTypeFilter(e.target.value as any)}
          className="min-h-[38px] rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-2.5 text-xs font-semibold text-[var(--otzar-text)] outline-none"
        >
          <option value="all">הכל (סט/בודד)</option>
          <option value="set_only">סטים בלבד</option>
          <option value="single_only">בודדים בלבד</option>
        </select>
      </div>

      {/* Responsive Content: Map + Results */}
      <div className={showMap ? "grid gap-4 lg:grid-cols-12" : "space-y-3"}>
        {showMap && (
          <div className="space-y-2 lg:col-span-5">
            <div className="flex items-center justify-between text-xs text-[var(--otzar-text-muted)]">
              <span>לחץ על ארון לסינון הספרים שבו</span>
              {selectedCabinet && (
                <button
                  type="button"
                  onClick={() => setSelectedCabinetId(null)}
                  className="font-semibold text-[var(--otzar-accent)]"
                >
                  נקה בחירה ({selectedCabinet.code})
                </button>
              )}
            </div>
            <LibraryMap2D
              cabinets={cabinets}
              bookCountsByCabinet={bookCountsByCabinet}
              highlightedCabinetId={selectedCabinetId}
              entrance={meta.map_entrance}
              onSelectCabinet={(cab) =>
                setSelectedCabinetId((prev) => (prev === cab.sync_id ? null : cab.sync_id))
              }
            />
          </div>
        )}

        <div className={showMap ? "lg:col-span-7 space-y-2" : "space-y-2"}>
          <div className="flex items-center justify-between px-1 text-xs text-[var(--otzar-text-muted)] tabular-nums">
            <span>
              {selectedCabinet
                ? `ארון ${selectedCabinet.code}${selectedCabinet.main_subject ? ` · ${selectedCabinet.main_subject}` : ""} · ${filteredResults.length} ספרים`
                : `נמצאו ${filteredResults.length.toLocaleString("he-IL")} ספרים`}
            </span>
            {selectedCabinet && (
              <button
                type="button"
                onClick={() => setSelectedCabinetId(null)}
                className="font-semibold text-[var(--otzar-accent)]"
              >
                הצג הכל
              </button>
            )}
          </div>

          {books.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-8 text-center">
              <BookOpen className="mx-auto h-9 w-9 text-[var(--otzar-text-muted)] opacity-60" />
              <p className="mt-2 font-semibold text-[var(--otzar-text)]">המאגר המקומי ריק עדיין</p>
              <p className="mt-1 text-sm text-[var(--otzar-text-muted)]">
                היכנס ללשונית &quot;חיבור&quot; כדי לייבא הגדרות מהמחשב ולמשוך את ספרי הישיבה.
              </p>
            </div>
          ) : visibleResults.length === 0 ? (
            <div className="rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-7 text-center text-sm text-[var(--otzar-text-muted)]">
              לא נמצאו ספרים התואמים לחיפוש או לסינון שנבחר.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--otzar-border-muted)] overflow-hidden rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)]">
              {visibleResults.map(({ book, matchHint }) => {
                const st = statusMeta(book.status);
                const locParts = [
                  book.cabinet_code ? `ארון ${book.cabinet_code}` : "ללא שיוך ארון",
                  book.shelf_number ? `מדף ${book.shelf_number}` : "",
                ].filter(Boolean);
                const metaParts = [
                  book.set_name && book.set_name !== book.title ? `סט: ${book.set_name}` : "",
                  book.sub_series ? `תת-סדרה: ${book.sub_series}` : "",
                  book.volume ? `חלק ${book.volume}` : "",
                  book.coverage_range ? `כיסוי: ${book.coverage_range}` : "",
                  book.set_global_number != null ? `כרך #${book.set_global_number}` : "",
                  book.author,
                  locParts.join(" · "),
                  book.barcode ? `#${book.barcode}` : "",
                ].filter(Boolean);

                return (
                  <li key={book.sync_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBook(book);
                        setExpandedVolGroup(null);
                        setSheetShowMap(true);
                      }}
                      className="flex min-h-[60px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-right transition-colors active:bg-[var(--otzar-surface-alt)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-[15px] font-semibold text-[var(--otzar-text)]">
                            {book.title}
                          </span>
                          {matchHint && (
                            <span className="shrink-0 text-[11px] font-medium text-[var(--otzar-accent)]">
                              {matchHint}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[var(--otzar-text-muted)] tabular-nums">
                          {metaParts.join(" · ") || "ללא פרטים נוספים"}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                        <span className={`h-2 w-2 rounded-full ${st.dotClass}`} />
                        <span className={st.textClass}>{st.label}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {filteredResults.length > visibleResults.length && (
            <p className="py-1 text-center text-xs text-[var(--otzar-text-muted)]">
              מוצגות {visibleResults.length} תוצאות ראשונות מתוך {filteredResults.length.toLocaleString("he-IL")} — מקד את החיפוש לתוצאות נוספות.
            </p>
          )}
        </div>
      </div>

      {/* Book Detail Bottom Sheet */}
      {selectedBook && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4"
          onClick={() => setSelectedBook(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[var(--otzar-bg)] p-4 pb-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[var(--otzar-border-muted)] sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-snug text-[var(--otzar-text)]">
                  {selectedBook.title}
                  {selectedBook.volume ? ` (${selectedBook.volume})` : ""}
                </h2>
                {selectedBook.set_name && (
                  <p className="mt-0.5 text-xs font-semibold text-[var(--otzar-accent)]">
                    סט / סדרה: {selectedBook.set_name}
                  </p>
                )}
                {selectedBook.sub_series && (
                  <p className="mt-0.5 text-xs font-semibold text-[var(--otzar-text)]">
                    תת-סדרה / מסכת: {selectedBook.sub_series}
                  </p>
                )}
                {selectedBook.coverage_range && (
                  <p className="mt-0.5 text-xs font-semibold text-[var(--otzar-accent)]">
                    כיסוי סימנים / דפים: {selectedBook.coverage_range}
                  </p>
                )}
                {selectedBook.set_global_number != null && (
                  <p className="mt-0.5 text-xs text-[var(--otzar-text-muted)]">
                    מספר כרך כללי: #{selectedBook.set_global_number}
                  </p>
                )}
                <p className="mt-0.5 text-sm text-[var(--otzar-text-muted)]">
                  {[selectedBook.author, selectedBook.publisher, selectedBook.pub_year]
                    .filter(Boolean)
                    .join(" · ") || "פרטי מחבר/הוצאה לא צוינו"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBook(null)}
                aria-label="סגור פרטים"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--otzar-text-muted)] hover:bg-[var(--otzar-surface-alt)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Key details grid */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl bg-[var(--otzar-surface-alt)] p-3 text-sm">
              <div>
                <span className="block text-xs text-[var(--otzar-text-muted)]">סטטוס</span>
                <span className={`font-bold ${statusMeta(selectedBook.status).textClass}`}>
                  {statusMeta(selectedBook.status).label}
                </span>
              </div>
              <div>
                <span className="block text-xs text-[var(--otzar-text-muted)]">ברקוד</span>
                <span className="font-semibold text-[var(--otzar-text)] tabular-nums">
                  {selectedBook.barcode || "ללא ברקוד"}
                </span>
              </div>
              <div>
                <span className="block text-xs text-[var(--otzar-text-muted)]">מיקום באוצר</span>
                <span className="font-semibold text-[var(--otzar-text)]">
                  {selectedBook.cabinet_code
                    ? `ארון ${selectedBook.cabinet_code}${selectedBook.shelf_number ? ` · מדף ${selectedBook.shelf_number}` : ""}`
                    : "לא שובץ לארון"}
                </span>
              </div>
              <div>
                <span className="block text-xs text-[var(--otzar-text-muted)]">נושא / קטגוריה</span>
                <span className="font-semibold text-[var(--otzar-text)]">
                  {selectedBook.category || "כללי"}
                </span>
              </div>
            </div>

            {selectedBook.status === "loaned" && activeLoanForSelected && (
              <div className="mt-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-semibold">
                  מושאל כעת ל: {activeBorrowerForSelected?.full_name || "שואל לא מזוהה"}
                  {activeBorrowerForSelected?.shiur_group ? ` (${activeBorrowerForSelected.shiur_group})` : ""}
                </p>
                <p className="mt-0.5 text-xs tabular-nums">
                  תאריך החזרה צפוי: {formatHeDate(activeLoanForSelected.due_date)}
                </p>
              </div>
            )}

            {selectedBook.notes && (
              <p className="mt-3 rounded-xl bg-[var(--otzar-surface-alt)] px-3 py-2 text-xs text-[var(--otzar-text-muted)]">
                הערות: {selectedBook.notes}
              </p>
            )}

            {/* Other volumes in this Set (Torah Natural Sort + Nested Sub-Series + Copy Deduplication) */}
            {selectedBook.set_name && (() => {
              const targetSet = selectedBook.set_name!.trim();
              const setBooks = books.filter((b) => (b.set_name || "").trim() === targetSet);
              const sections = groupMobileSetBySubSeries(setBooks, meta.volume_notation_rules);
              const totalVolumes = sections.reduce((sum: number, s: MobileSetSubSeriesSection) => sum + s.volumes.length, 0);
              if (totalVolumes === 0 || (totalVolumes === 1 && sections[0].volumes[0].totalCopies <= 1)) return null;

              return (
                <div className="mt-4 space-y-2 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-3">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--otzar-text)]">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-[var(--otzar-accent)]" />
                      כרכים נוספים בסט זה ({setBooks.length} עותקים ב-{totalVolumes} כרכים)
                    </span>
                  </div>
                  <div className="space-y-2">
                    {sections.map((section: MobileSetSubSeriesSection, sIdx: number) => (
                      <div key={section.subSeriesLabel || `sec-${sIdx}`} className="space-y-1">
                        {section.subSeriesLabel && (
                          <div className="px-1 text-[11px] font-bold text-[var(--otzar-accent)]">
                            {section.subSeriesLabel}
                          </div>
                        )}
                        <div className="divide-y divide-[var(--otzar-border-muted)] rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)]">
                          {section.volumes.map((grp: MobileSetVolumeGroup) => {
                            const isExpanded = expandedVolGroup === `${grp.subSeriesLabel}_${grp.volumeLabel}`;
                            const isCurrent =
                              (selectedBook.volume || "").trim() === grp.volumeLabel &&
                              String(selectedBook.sub_series || "").trim() === grp.subSeriesLabel;
                            const statusParts = [
                              grp.availableCount > 0 ? `${grp.availableCount} זמינים` : "",
                              grp.loanedCount > 0 ? `${grp.loanedCount} מושאלים` : "",
                              grp.otherCount > 0 ? `${grp.otherCount} עיון/אחר` : "",
                            ].filter(Boolean);

                            return (
                              <div key={`${grp.subSeriesLabel}_${grp.volumeLabel}`} className="text-xs">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedVolGroup(
                                      isExpanded ? null : `${grp.subSeriesLabel}_${grp.volumeLabel}`
                                    )
                                  }
                                  className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-right ${
                                    isCurrent ? "bg-[var(--otzar-accent-soft)]/50 font-bold" : ""
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="font-semibold text-[var(--otzar-text)]">
                                      {grp.minGlobalNumber != null && (
                                        <span className="ml-1 text-[11px] text-[var(--otzar-text-muted)] tabular-nums">
                                          [#{grp.minGlobalNumber}]
                                        </span>
                                      )}
                                      {grp.volumeLabel}
                                      {grp.coverageSummary && (
                                        <span className="mr-1 text-[11px] text-[var(--otzar-text-muted)]">
                                          ({grp.coverageSummary})
                                        </span>
                                      )}
                                      {grp.totalCopies > 1 && (
                                        <span className="mr-1.5 text-[var(--otzar-accent)]">
                                          · {grp.totalCopies} עותקים ({statusParts.join(", ")})
                                        </span>
                                      )}
                                      {grp.totalCopies === 1 && (
                                        <span className="mr-1.5 font-normal text-[var(--otzar-text-muted)]">
                                          · {statusMeta(grp.books[0].status).label}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-[var(--otzar-text-muted)]">
                                      {grp.locationSummary}
                                    </div>
                                  </div>
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4 shrink-0" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 shrink-0" />
                                  )}
                                </button>
                                {isExpanded && (
                                  <div className="space-y-1 border-t border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 py-2">
                                    {grp.books.map((copy: BookDoc) => {
                                      const cst = statusMeta(copy.status);
                                      return (
                                        <div
                                          key={copy.sync_id}
                                          className="flex items-center justify-between py-1"
                                        >
                                          <span className="tabular-nums text-[var(--otzar-text)]">
                                            #{copy.barcode || "ללא ברקוד"} ·{" "}
                                            <span className={cst.textClass}>{cst.label}</span>
                                          </span>
                                          {copy.sync_id !== selectedBook.sync_id && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSelectedBook(copy);
                                                setExpandedVolGroup(null);
                                                setSheetShowMap(true);
                                              }}
                                              className="rounded-lg bg-[var(--otzar-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--otzar-accent)] border border-[var(--otzar-border-muted)]"
                                            >
                                              הצג עותק
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Embedded 2D Map Highlight */}
            {(selectedBook.cabinet_sync_id || selectedBook.cabinet_code) && cabinets.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--otzar-text-muted)]">
                    <MapPin className="h-4 w-4 text-[var(--otzar-accent)]" />
                    מיקום במפת הספרייה
                  </span>
                  <button
                    type="button"
                    onClick={() => setSheetShowMap((v) => !v)}
                    className="text-xs font-semibold text-[var(--otzar-accent)]"
                  >
                    {sheetShowMap ? "הסתר מפה" : "הצג מפה"}
                  </button>
                </div>
                {sheetShowMap && (
                  <LibraryMap2D
                    cabinets={cabinets}
                    bookCountsByCabinet={bookCountsByCabinet}
                    highlightedCabinetId={selectedBook.cabinet_sync_id}
                    highlightedCabinetCode={selectedBook.cabinet_code}
                    entrance={meta.map_entrance}
                    compact
                  />
                )}
              </div>
            )}

            {/* Primary Action */}
            <div className="mt-5 flex gap-2">
              {selectedBook.status === "available" && (
                <button
                  type="button"
                  onClick={() => {
                    const bk = selectedBook;
                    setSelectedBook(null);
                    onJumpToCirculation("checkout", bk);
                  }}
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--otzar-accent)] px-4 font-bold text-white active:scale-[0.98]"
                >
                  <ArrowLeftRight className="h-5 w-5" />
                  <span>השאל ספר זה</span>
                </button>
              )}

              {selectedBook.status === "loaned" && (
                <button
                  type="button"
                  onClick={() => {
                    const bk = selectedBook;
                    setSelectedBook(null);
                    onJumpToCirculation("return", bk);
                  }}
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 font-bold text-white active:scale-[0.98]"
                >
                  <ArrowLeftRight className="h-5 w-5" />
                  <span>עבור להחזרת ספר</span>
                </button>
              )}

              {selectedBook.status === "reference" && (
                <div className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-4 text-sm font-semibold text-[var(--otzar-text-muted)]">
                  ספר לעיון בספרייה בלבד — אינו ניתן להשאלה
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        title="סריקת ברקוד לאיתור ספר"
        onDetected={handleScanDetected}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  );
};
