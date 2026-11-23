import React, { useEffect, useMemo, useState } from "react";
import {
  ScanLine,
  UserCheck,
  BookPlus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Phone,
  Search,
  RotateCcw,
} from "lucide-react";
import type { BookDoc, BorrowerDoc, LoanDoc } from "../types.ts";
import { searchMobileBooks, normalizeHebrewText } from "../lib/torahSearch.ts";
import { BarcodeScannerModal } from "./BarcodeScannerModal.tsx";

interface CirculationTabProps {
  books: BookDoc[];
  borrowers: BorrowerDoc[];
  loans: LoanDoc[];
  defaultLoanDays: number;
  connected: boolean;
  preselectedBook: { book: BookDoc; action: "checkout" | "return"; seq: number } | null;
  onCheckout: (books: BookDoc[], borrower: BorrowerDoc, loanDays: number) => Promise<void>;
  onReturnLoan: (loan: LoanDoc) => Promise<void>;
}

type SubMode = "checkout" | "return" | "overdue";

function localTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function diffDaysFromToday(dueIso: string): number {
  const today = new Date(`${localTodayIso()}T00:00:00`);
  const due = new Date(`${dueIso.slice(0, 10)}T00:00:00`);
  return Math.round((today.getTime() - due.getTime()) / 86400000);
}

function formatHeDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("he-IL");
}

export const CirculationTab: React.FC<CirculationTabProps> = ({
  books,
  borrowers,
  loans,
  defaultLoanDays,
  connected,
  preselectedBook,
  onCheckout,
  onReturnLoan,
}) => {
  const [subMode, setSubMode] = useState<SubMode>("checkout");
  const [selectedBorrower, setSelectedBorrower] = useState<BorrowerDoc | null>(null);
  const [borrowerQuery, setBorrowerQuery] = useState("");
  const [basket, setBasket] = useState<BookDoc[]>([]);
  const [bookQuery, setBookQuery] = useState("");
  const [loanDays, setLoanDays] = useState<number>(defaultLoanDays || 14);
  const [returnQuery, setReturnQuery] = useState("");
  const [scannerFor, setScannerFor] = useState<"checkout" | "return" | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setLoanDays(defaultLoanDays || 14);
  }, [defaultLoanDays]);

  useEffect(() => {
    if (!preselectedBook) return;
    setFeedback(null);
    if (preselectedBook.action === "checkout") {
      setSubMode("checkout");
      addBookToBasket(preselectedBook.book);
    } else {
      setSubMode("return");
      setReturnQuery(preselectedBook.book.barcode || preselectedBook.book.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedBook?.seq]);

  const bookById = useMemo(() => {
    const m = new Map<string, BookDoc>();
    for (const b of books) {
      m.set(b.sync_id, b);
      if (b.barcode) m.set(`bc:${b.barcode}`, b);
    }
    return m;
  }, [books]);

  const borrowerById = useMemo(() => {
    const m = new Map<string, BorrowerDoc>();
    for (const br of borrowers) m.set(br.sync_id, br);
    return m;
  }, [borrowers]);

  const activeLoans = useMemo(() => loans.filter((l) => !l.return_date), [loans]);

  const overdueLoans = useMemo(() => {
    const today = localTodayIso();
    return activeLoans
      .filter((l) => l.due_date && l.due_date.slice(0, 10) < today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [activeLoans]);

  const filteredBorrowers = useMemo(() => {
    const q = normalizeHebrewText(borrowerQuery);
    if (!q) return borrowers.slice(0, 15);
    return borrowers
      .filter((br) => {
        const hay = normalizeHebrewText(`${br.full_name} ${br.shiur_group} ${br.phone}`);
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [borrowers, borrowerQuery]);

  const filteredBooksToAdd = useMemo(() => {
    if (!bookQuery.trim()) return [];
    return searchMobileBooks(books, bookQuery)
      .map((s) => s.book)
      .slice(0, 12);
  }, [books, bookQuery]);

  const filteredActiveLoans = useMemo(() => {
    const q = normalizeHebrewText(returnQuery);
    const list = activeLoans.filter((l) => {
      if (!q) return true;
      const bk = (l.book_sync_id && bookById.get(l.book_sync_id)) || bookById.get(`bc:${l.book_barcode}`);
      const br = l.borrower_sync_id ? borrowerById.get(l.borrower_sync_id) : undefined;
      const hay = normalizeHebrewText(
        `${bk?.title || ""} ${l.book_barcode} ${br?.full_name || ""} ${br?.shiur_group || ""}`
      );
      return hay.includes(q);
    });
    return list.slice(0, 50);
  }, [activeLoans, returnQuery, bookById, borrowerById]);

  const addBookToBasket = (book: BookDoc) => {
    setFeedback(null);
    if (book.status === "reference") {
      setFeedback({ type: "err", text: `הספר "${book.title}" מסומן לעיון בספרייה בלבד ואינו ניתן להשאלה.` });
      return;
    }
    if (book.status === "loaned") {
      setFeedback({ type: "err", text: `הספר "${book.title}" כבר מושאל כעת.` });
      return;
    }
    if (basket.some((b) => b.sync_id === book.sync_id)) {
      setFeedback({ type: "err", text: `הספר "${book.title}" כבר נמצא ברשימת ההשאלה.` });
      return;
    }
    setBasket((prev) => [...prev, book]);
    setBookQuery("");
  };

  const handleBarcodeResult = async (code: string) => {
    const mode = scannerFor;
    setScannerFor(null);
    const clean = code.trim();
    if (!clean) return;

    if (mode === "checkout") {
      const found = books.find((b) => b.barcode.trim() === clean);
      if (!found) {
        setFeedback({ type: "err", text: `לא נמצא ספר עם ברקוד ${clean}` });
        return;
      }
      addBookToBasket(found);
      return;
    }

    if (mode === "return") {
      const loan = activeLoans.find((l) => l.book_barcode.trim() === clean);
      if (!loan) {
        setFeedback({ type: "err", text: `לא נמצאה השאלה פעילה עבור ברקוד ${clean}` });
        return;
      }
      setBusy(true);
      try {
        await onReturnLoan(loan);
        const bk = (loan.book_sync_id && bookById.get(loan.book_sync_id)) || bookById.get(`bc:${loan.book_barcode}`);
        setFeedback({ type: "ok", text: `הספר "${bk?.title || clean}" הוחזר למאגר בהצלחה!` });
      } catch (err: unknown) {
        setFeedback({ type: "err", text: err instanceof Error ? err.message : "שגיאה בהחזרת הספר" });
      } finally {
        setBusy(false);
      }
    }
  };

  const handleConfirmCheckout = async () => {
    if (!selectedBorrower || basket.length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      await onCheckout(basket, selectedBorrower, loanDays);
      setFeedback({
        type: "ok",
        text: `בוצעה השאלת ${basket.length} ספרים עבור ${selectedBorrower.full_name}.`,
      });
      setBasket([]);
      setSelectedBorrower(null);
      setBorrowerQuery("");
    } catch (err: unknown) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "שגיאה בביצוע ההשאלה" });
    } finally {
      setBusy(false);
    }
  };

  const handleReturnClick = async (loan: LoanDoc) => {
    setBusy(true);
    setFeedback(null);
    try {
      await onReturnLoan(loan);
      const bk = (loan.book_sync_id && bookById.get(loan.book_sync_id)) || bookById.get(`bc:${loan.book_barcode}`);
      setFeedback({ type: "ok", text: `הספר "${bk?.title || loan.book_barcode}" הוחזר בהצלחה.` });
    } catch (err: unknown) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "שגיאה בהחזרת הספר" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Segmented Switch */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--otzar-surface-alt)] p-1">
        {(
          [
            { key: "checkout", label: "השאלה" },
            { key: "return", label: `החזרה (${activeLoans.length})` },
            { key: "overdue", label: `באיחור (${overdueLoans.length})` },
          ] as Array<{ key: SubMode; label: string }>
        ).map((tab) => {
          const active = subMode === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setSubMode(tab.key);
                setFeedback(null);
              }}
              className={`min-h-[42px] rounded-lg px-2 text-sm font-medium whitespace-nowrap tabular-nums transition-colors ${
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

      {!connected && (
        <div className="rounded-2xl border border-amber-300/70 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
          אין חיבור פעיל לענן — ניתן לעיין ברשימות מהמטמון, אך ביצוע השאלות והחזרות דורש חיבור רשת.
        </div>
      )}

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

      {/* CHECKOUT MODE */}
      {subMode === "checkout" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Step 1: Borrower */}
          <section className="space-y-2.5 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-3.5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--otzar-text)]">
                <UserCheck className="h-4 w-4 text-[var(--otzar-accent)]" />
                <span>1. בחר שואל / תלמיד</span>
              </h2>
              {selectedBorrower && (
                <button
                  type="button"
                  onClick={() => setSelectedBorrower(null)}
                  className="text-xs font-semibold text-[var(--otzar-accent)]"
                >
                  החלף שואל
                </button>
              )}
            </div>

            {selectedBorrower ? (
              <div className="rounded-xl bg-[var(--otzar-surface)] p-3">
                <p className="font-bold text-[var(--otzar-text)]">{selectedBorrower.full_name}</p>
                <p className="mt-0.5 text-xs text-[var(--otzar-text-muted)] tabular-nums">
                  {[selectedBorrower.shiur_group, selectedBorrower.phone].filter(Boolean).join(" · ") || "רשום במערכת"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--otzar-text-muted)]" />
                  <input
                    type="search"
                    value={borrowerQuery}
                    onChange={(e) => setBorrowerQuery(e.target.value)}
                    placeholder="חפש לפי שם תלמיד, שיעור או טלפון..."
                    className="min-h-[44px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] pl-3 pr-9 text-sm text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
                  />
                </div>

                {borrowers.length === 0 ? (
                  <p className="text-xs text-[var(--otzar-text-muted)]">אין רשימת שואלים במטמון עדיין.</p>
                ) : (
                  <ul className="max-h-52 divide-y divide-[var(--otzar-border-muted)] overflow-y-auto rounded-xl border border-[var(--otzar-border-muted)]">
                    {filteredBorrowers.map((br) => (
                      <li key={br.sync_id}>
                        <button
                          type="button"
                          onClick={() => setSelectedBorrower(br)}
                          className="flex min-h-[46px] w-full items-center justify-between px-3 py-2 text-right active:bg-[var(--otzar-surface-alt)]"
                        >
                          <span className="text-sm font-semibold text-[var(--otzar-text)]">{br.full_name}</span>
                          <span className="text-xs text-[var(--otzar-text-muted)] tabular-nums">
                            {br.shiur_group || br.phone}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* Step 2: Books & Confirm */}
          <section className="space-y-3 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-3.5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--otzar-text)]">
              <BookPlus className="h-4 w-4 text-[var(--otzar-accent)]" />
              <span>2. הוסף ספרים להשאלה ({basket.length})</span>
            </h2>

            <div className="flex gap-2">
              <input
                type="search"
                value={bookQuery}
                onChange={(e) => setBookQuery(e.target.value)}
                placeholder="חפש כותר או הקלד ברקוד..."
                className="min-h-[44px] flex-1 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
              />
              <button
                type="button"
                onClick={() => setScannerFor("checkout")}
                aria-label="סרוק ברקוד להשאלה"
                className="flex h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl bg-[var(--otzar-accent)] px-3 text-sm font-semibold text-white active:scale-95"
              >
                <ScanLine className="h-5 w-5" />
                <span>סרוק</span>
              </button>
            </div>

            {filteredBooksToAdd.length > 0 && (
              <ul className="max-h-48 divide-y divide-[var(--otzar-border-muted)] overflow-y-auto rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)]">
                {filteredBooksToAdd.map((bk) => (
                  <li key={bk.sync_id}>
                    <button
                      type="button"
                      onClick={() => addBookToBasket(bk)}
                      className="flex min-h-[46px] w-full items-center justify-between gap-2 px-3 py-2 text-right active:bg-[var(--otzar-bg)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--otzar-text)]">{bk.title}</p>
                        <p className="text-xs text-[var(--otzar-text-muted)] tabular-nums">
                          {[bk.volume, bk.barcode ? `#${bk.barcode}` : ""].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-[var(--otzar-accent)]">
                        {bk.status === "available" ? "+ הוסף" : bk.status === "loaned" ? "מושאל" : "עיון"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {basket.length > 0 && (
              <ul className="divide-y divide-[var(--otzar-border-muted)] rounded-xl border border-[var(--otzar-border-muted)]">
                {basket.map((bk) => (
                  <li key={bk.sync_id} className="flex min-h-[48px] items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--otzar-text)]">{bk.title}</p>
                      <p className="text-xs text-[var(--otzar-text-muted)] tabular-nums">
                        {bk.barcode ? `ברקוד ${bk.barcode}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBasket((prev) => prev.filter((item) => item.sync_id !== bk.sync_id))}
                      aria-label="הסר ספר מהרשימה"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-rose-600 active:bg-rose-50 dark:active:bg-rose-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Loan days selector */}
            <div className="flex items-center justify-between gap-2 pt-1 text-xs">
              <span className="font-medium text-[var(--otzar-text-muted)]">משך ההשאלה:</span>
              <div className="flex gap-1.5">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setLoanDays(d)}
                    className={`min-h-[36px] rounded-lg border px-3 font-semibold tabular-nums ${
                      loanDays === d
                        ? "border-[var(--otzar-accent)] bg-[var(--otzar-accent-soft)] text-[var(--otzar-accent)]"
                        : "border-[var(--otzar-border-muted)] text-[var(--otzar-text-muted)]"
                    }`}
                  >
                    {d} ימים
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!connected || busy || !selectedBorrower || basket.length === 0}
              onClick={handleConfirmCheckout}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--otzar-accent)] px-4 font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-45"
            >
              <CheckCircle2 className="h-5 w-5" />
              <span>
                {busy
                  ? "שומר השאלה בענן..."
                  : basket.length > 0
                  ? `אשר השאלת ${basket.length} ספרים`
                  : "בחר שואל וספרים לאישור"}
              </span>
            </button>
          </section>
        </div>
      )}

      {/* QUICK RETURN MODE */}
      {subMode === "return" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="search"
              value={returnQuery}
              onChange={(e) => setReturnQuery(e.target.value)}
              placeholder="חפש לפי שם שואל, כותר או ברקוד..."
              className="min-h-[46px] flex-1 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3.5 text-sm text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
            />
            <button
              type="button"
              onClick={() => setScannerFor("return")}
              className="flex h-[46px] items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-4 text-sm font-bold text-white active:scale-95"
            >
              <ScanLine className="h-5 w-5" />
              <span>סרוק להחזרה</span>
            </button>
          </div>

          {filteredActiveLoans.length === 0 ? (
            <div className="rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-7 text-center text-sm text-[var(--otzar-text-muted)]">
              אין השאלות פעילות התואמות לחיפוש.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--otzar-border-muted)] overflow-hidden rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)]">
              {filteredActiveLoans.map((loan) => {
                const bk = (loan.book_sync_id && bookById.get(loan.book_sync_id)) || bookById.get(`bc:${loan.book_barcode}`);
                const br = loan.borrower_sync_id ? borrowerById.get(loan.borrower_sync_id) : undefined;
                const daysLate = loan.due_date ? diffDaysFromToday(loan.due_date) : 0;

                return (
                  <li key={loan.sync_id} className="flex min-h-[64px] items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--otzar-text)]">
                        {bk?.title || `ברקוד ${loan.book_barcode}`}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--otzar-text-muted)] tabular-nums">
                        {[
                          br?.full_name || "שואל",
                          loan.book_barcode ? `#${loan.book_barcode}` : "",
                          `החזרה עד ${formatHeDate(loan.due_date)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {daysLate > 0 && (
                        <p className="mt-0.5 text-xs font-semibold text-rose-600 tabular-nums">
                          איחור של {daysLate} ימים
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={!connected || busy}
                      onClick={() => handleReturnClick(loan)}
                      className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-sm font-bold text-white active:scale-95 disabled:opacity-45"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>החזר</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* OVERDUE MODE */}
      {subMode === "overdue" && (
        <div className="space-y-3">
          {overdueLoans.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-7 text-center text-sm font-medium text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-200">
              אין השאלות באיחור כרגע.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--otzar-border-muted)] overflow-hidden rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)]">
              {overdueLoans.map((loan) => {
                const bk = (loan.book_sync_id && bookById.get(loan.book_sync_id)) || bookById.get(`bc:${loan.book_barcode}`);
                const br = loan.borrower_sync_id ? borrowerById.get(loan.borrower_sync_id) : undefined;
                const daysLate = diffDaysFromToday(loan.due_date);

                return (
                  <li key={loan.sync_id} className="flex min-h-[68px] items-center justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--otzar-text)]">
                        {bk?.title || `ברקוד ${loan.book_barcode}`}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--otzar-text-muted)] tabular-nums">
                        {br?.full_name || "שואל לא מזוהה"}
                        {br?.shiur_group ? ` (${br.shiur_group})` : ""} · איחור {daysLate} ימים
                      </p>
                      {br?.phone && (
                        <a
                          href={`tel:${br.phone.replace(/\s+/g, "")}`}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--otzar-accent)] tabular-nums"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span>{br.phone}</span>
                        </a>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={!connected || busy}
                      onClick={() => handleReturnClick(loan)}
                      className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-sm font-bold text-white active:scale-95 disabled:opacity-45"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>החזר</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <BarcodeScannerModal
        open={scannerFor !== null}
        title={scannerFor === "return" ? "סרוק ברקוד ספר להחזרה" : "סרוק ברקוד ספר להשאלה"}
        onDetected={handleBarcodeResult}
        onClose={() => setScannerFor(null)}
      />
    </div>
  );
};
