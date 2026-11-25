import React, { useState } from "react";
import { Bug, X, Send, AlertTriangle, CheckCircle2 } from "lucide-react";

interface BugReportModalProps {
  open: boolean;
  onClose: () => void;
  appVersion: string;
  booksCount: number;
  cabinetsCount: number;
  connected: boolean;
  onSubmitReport: (params: {
    title: string;
    description: string;
    category: string;
    diagnostics: string;
  }) => Promise<{ ok: boolean; reportId: string }>;
}

export const BugReportModal: React.FC<BugReportModalProps> = ({
  open,
  onClose,
  appVersion,
  booksCount,
  cabinetsCount,
  connected,
  onSubmitReport,
}) => {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("סנכרון ומובייל");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const diag = JSON.stringify({
        platform: "Android/Mobile",
        app_version: appVersion,
        connected,
        books_count: booksCount,
        cabinets_count: cabinetsCount,
        user_agent: navigator.userAgent,
        time: new Date().toISOString(),
      });
      const res = await onSubmitReport({
        title: title.trim(),
        description: description.trim(),
        category,
        diagnostics: diag,
      });
      setStatus({
        type: "ok",
        text: "הדיווח נשלח לענן ונרשם (" + res.reportId + ") — ייפתח GitHub Issue אוטומטי למפתח.",
      });
      setTimeout(() => {
        setTitle("");
        setDescription("");
        onClose();
      }, 2200);
    } catch (err: any) {
      setStatus({
        type: "err",
        text: err?.message || "נכשלה שליחת הדיווח. ודא שהמכשיר מחובר לענן.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-[var(--otzar-border)] bg-[var(--otzar-bg)] p-5 space-y-4 text-[var(--otzar-text)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--otzar-border-muted)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <Bug className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-base">דיווח על תקלה / באג</h2>
              <p className="text-xs text-[var(--otzar-text-muted)]">גרסה {appVersion} • נשלח ל־GitHub</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--otzar-text-muted)] hover:bg-[var(--otzar-surface-alt)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {status && (
          <div
            className={"flex items-center gap-2 rounded-xl p-3 text-xs font-semibold " + (status.type === "ok"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300")}
          >
            {status.type === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{status.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold mb-1">כותרת התקלה *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: שליחת סט נתקעת / ספרים לא מסתנכרנים"
              className="min-h-[44px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm outline-none focus:border-[var(--otzar-accent)]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">קטגוריה</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm outline-none focus:border-[var(--otzar-accent)]"
            >
              <option value="סנכרון ומובייל">סנכרון, ענן וחיפוש</option>
              <option value="צילום ו-AI">צילום שערים ושליחה ל-AI</option>
              <option value="השאלות">השאלות והחזרות</option>
              <option value="כללי">כללי / ממשק</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">תיאור וצעדים לשחזור</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תאר מה קרה..."
              className="w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-3 text-sm outline-none focus:border-[var(--otzar-accent)] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-[var(--otzar-border-muted)] px-4 text-sm font-medium"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !connected}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{submitting ? "שולח..." : "שלח דיווח"}</span>
            </button>
          </div>
          {!connected && (
            <p className="text-[11px] text-amber-600 font-semibold">
              יש להתחבר לסנכרון הענן כדי לשלוח דיווח תקלה.
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
