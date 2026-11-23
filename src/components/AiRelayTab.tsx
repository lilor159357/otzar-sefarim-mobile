import React, { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Camera as CameraIcon, ImagePlus, Send, Trash2, CheckCircle2, AlertTriangle, Minus, Plus, Star } from "lucide-react";
import type { CabinetDoc, RelaySentItem } from "../types.ts";
import { compressImageDataUrl, type CompressedCapture } from "../lib/imageCompress.ts";
import { loadRelayHistory, saveRelayHistory } from "../lib/mobileFirebase.ts";

interface AiRelayTabProps {
  cabinets: CabinetDoc[];
  connected: boolean;
  onSendRelay: (params: {
    mainBase64: string;
    extraBase64s: string[];
    cabinetSyncId: string | null;
    cabinetCode: string | null;
    shelfNumber: number | null;
    onPickedUp?: (relayId: string) => void;
  }) => Promise<string>;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("קריאת הקובץ נכשלה"));
    reader.readAsDataURL(file);
  });
}

export const AiRelayTab: React.FC<AiRelayTabProps> = ({
  cabinets,
  connected,
  onSendRelay,
}) => {
  const [photos, setPhotos] = useState<CompressedCapture[]>([]);
  const [cabinetSyncId, setCabinetSyncId] = useState<string>("");
  const [shelfNumber, setShelfNumber] = useState<number>(1);
  const [useShelf, setUseShelf] = useState<boolean>(true);
  const [sending, setSending] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [history, setHistory] = useState<RelaySentItem[]>(() => loadRelayHistory());
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCabinet = cabinets.find((c) => c.sync_id === cabinetSyncId) || null;
  const maxShelf = selectedCabinet?.shelves_count || 12;

  const appendCompressedDataUrl = async (dataUrl: string) => {
    const compressed = await compressImageDataUrl(dataUrl, 700000);
    setPhotos((prev) => [...prev, compressed].slice(0, 4));
  };

  const handleCaptureCamera = async () => {
    setFeedback(null);
    if (photos.length >= 4) {
      setFeedback({ type: "err", text: "ניתן לצרף עד 4 תמונות במשלוח אחד (שדרה ראשית + שער/זוויות)." });
      return;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        setProcessingPhoto(true);
        const photo = await Camera.getPhoto({
          quality: 88,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
        });
        if (photo.dataUrl) {
          await appendCompressedDataUrl(photo.dataUrl);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.toLowerCase().includes("cancel")) {
          setFeedback({ type: "err", text: "לא ניתן לצלם כעת מהמצלמה — נסה בחירה מהגלריה." });
        }
      } finally {
        setProcessingPhoto(false);
      }
      return;
    }

    cameraInputRef.current?.click();
  };

  const handlePickGallery = async () => {
    setFeedback(null);
    if (photos.length >= 4) {
      setFeedback({ type: "err", text: "ניתן לצרף עד 4 תמונות במשלוח אחד." });
      return;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        setProcessingPhoto(true);
        const photo = await Camera.getPhoto({
          quality: 88,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Photos,
        });
        if (photo.dataUrl) {
          await appendCompressedDataUrl(photo.dataUrl);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.toLowerCase().includes("cancel")) {
          setFeedback({ type: "err", text: "בחירת התמונה מהגלריה בוטלה או נכשלה." });
        }
      } finally {
        setProcessingPhoto(false);
      }
      return;
    }

    galleryInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setProcessingPhoto(true);
    setFeedback(null);
    try {
      const remaining = Math.max(0, 4 - photos.length);
      for (const file of files.slice(0, remaining)) {
        const rawUrl = await readFileAsDataUrl(file);
        await appendCompressedDataUrl(rawUrl);
      }
    } catch (err: unknown) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "שגיאה בעיבוד התמונה" });
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleSend = async () => {
    if (photos.length === 0) return;
    setSending(true);
    setFeedback(null);
    const [main, ...extras] = photos;
    const targetCabinetCode = selectedCabinet?.code || null;
    const targetShelf = selectedCabinet && useShelf ? shelfNumber : null;

    try {
      const relayId = await onSendRelay({
        mainBase64: main.base64,
        extraBase64s: extras.map((x) => x.base64),
        cabinetSyncId: selectedCabinet?.sync_id || null,
        cabinetCode: targetCabinetCode,
        shelfNumber: targetShelf,
        onPickedUp: (pickedId) => {
          setHistory((prev) => {
            const updated = prev.map((item) =>
              item.relayId === pickedId ? { ...item, status: "picked_up" as const } : item
            );
            saveRelayHistory(updated);
            return updated;
          });
        },
      });

      const entry: RelaySentItem = {
        relayId,
        createdAt: new Date().toISOString(),
        cabinetCode: targetCabinetCode,
        shelfNumber: targetShelf,
        photoCount: photos.length,
        status: "queued",
      };
      const nextHistory = [entry, ...history].slice(0, 20);
      setHistory(nextHistory);
      saveRelayHistory(nextHistory);
      setPhotos([]);
      setFeedback({
        type: "ok",
        text: "התמונות נשלחו לענן! תוכנת המחשב תקלוט אותן אוטומטית בתור הקטלוג.",
      });
    } catch (err: unknown) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "שליחת התמונות נכשלה" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--otzar-border)] bg-[var(--otzar-surface)] p-3.5 text-sm">
        <p className="font-bold text-[var(--otzar-text)]">שידור ישיר לקטלוג AI במחשב</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--otzar-text-muted)]">
          צלם מדף ספרים או כריכה. המערכת דוחסת את התמונות אוטומטית ומשדרת למחשב הישיבה להרצת זיהוי השמות והוצאת הברקודים.
        </p>
      </div>

      {/* Hidden web file fallbacks */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

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
        {/* Capture & Queue */}
        <section className="space-y-3 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-3.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={processingPhoto || photos.length >= 4}
              onClick={handleCaptureCamera}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[var(--otzar-accent)] px-3 font-bold text-white active:scale-[0.98] disabled:opacity-45"
            >
              <CameraIcon className="h-5 w-5" />
              <span>{processingPhoto ? "מעבד..." : "צלם עכשיו"}</span>
            </button>

            <button
              type="button"
              disabled={processingPhoto || photos.length >= 4}
              onClick={handlePickGallery}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 font-semibold text-[var(--otzar-text)] active:scale-[0.98] disabled:opacity-45"
            >
              <ImagePlus className="h-5 w-5" />
              <span>מהגלריה</span>
            </button>
          </div>

          {photos.length === 0 ? (
            <div className="flex min-h-[150px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-5 text-center text-xs text-[var(--otzar-text-muted)]">
              <CameraIcon className="h-8 w-8 opacity-40" />
              <p className="mt-2 font-semibold text-[var(--otzar-text)]">עדיין לא צורפו תמונות (עד 4 תמונות)</p>
              <p className="mt-0.5">תמונה ראשונה תשמש כתמונת השדרה הראשית; תמונות נוספות יעזרו ל-AI בדיוק</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {photos.map((p, idx) => (
                <div
                  key={idx}
                  className="relative overflow-hidden rounded-2xl border border-[var(--otzar-border-muted)] bg-slate-950"
                >
                  <img
                    src={p.previewUrl}
                    alt={`תמונה ${idx + 1}`}
                    className="h-36 w-full object-cover"
                  />
                  <div className="flex items-center justify-between bg-[var(--otzar-bg)] px-2 py-1 text-[11px] tabular-nums">
                    <span className={idx === 0 ? "font-bold text-[var(--otzar-accent)]" : "text-[var(--otzar-text-muted)]"}>
                      {idx === 0 ? "ראשית" : `נוספת ${idx}`} · {Math.round(p.byteSize / 1024)}KB
                    </span>
                    <div className="flex items-center">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPhotos((prev) => {
                              const copy = [...prev];
                              const [chosen] = copy.splice(idx, 1);
                              return [chosen, ...copy];
                            })
                          }
                          aria-label="הגדר כראשית"
                          className="flex h-9 w-9 items-center justify-center text-[var(--otzar-accent)]"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="הסר תמונה"
                        className="flex h-9 w-9 items-center justify-center text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Location & Send */}
        <section className="space-y-3 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-3.5">
          <h2 className="text-sm font-bold text-[var(--otzar-text)]">שיוך ברירת מחדל לספרים שייזוהו (אופציונלי)</h2>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--otzar-text-muted)]">ארון יעד</label>
            <select
              value={cabinetSyncId}
              onChange={(e) => {
                setCabinetSyncId(e.target.value);
                setShelfNumber(1);
              }}
              className="min-h-[44px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
            >
              <option value="">ללא שיוך ארון (קביעה במחשב)</option>
              {cabinets.map((c) => (
                <option key={c.sync_id} value={c.sync_id}>
                  ארון {c.code}
                  {c.main_subject ? ` — ${c.main_subject}` : ""}
                </option>
              ))}
            </select>
          </div>

          {selectedCabinet && (
            <div className="flex items-center justify-between rounded-xl bg-[var(--otzar-surface-alt)] px-3 py-2">
              <label className="flex items-center gap-2 text-sm font-medium text-[var(--otzar-text)]">
                <input
                  type="checkbox"
                  checked={useShelf}
                  onChange={(e) => setUseShelf(e.target.checked)}
                  className="h-4 w-4 accent-[var(--otzar-accent)]"
                />
                <span>מספר מדף:</span>
              </label>

              {useShelf && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShelfNumber((s) => Math.max(1, s - 1))}
                    aria-label="הקטן מספר מדף"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] text-[var(--otzar-text)] active:scale-95"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-[28px] text-center text-base font-bold tabular-nums">
                    {shelfNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShelfNumber((s) => Math.min(maxShelf, s + 1))}
                    aria-label="הגדל מספר מדף"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] text-[var(--otzar-text)] active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={!connected || sending || photos.length === 0}
            onClick={handleSend}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--otzar-accent)] px-4 font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-45"
          >
            <Send className="h-5 w-5" />
            <span>
              {sending
                ? "משדר לתור הענן..."
                : !connected
                ? "נדרש חיבור פעיל לענן"
                : photos.length === 0
                ? "צלם או בחר תמונה לשליחה"
                : `שלח ${photos.length} תמונות לקטלוג AI במחשב`}
            </span>
          </button>

          {history.length > 0 && (
            <div className="pt-2">
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[var(--otzar-text-muted)]">
                <span>משלוחים אחרונים מהמכשיר</span>
                <button
                  type="button"
                  onClick={() => {
                    setHistory([]);
                    saveRelayHistory([]);
                  }}
                  className="text-[var(--otzar-accent)]"
                >
                  נקה היסטוריה
                </button>
              </div>
              <ul className="divide-y divide-[var(--otzar-border-muted)] rounded-xl border border-[var(--otzar-border-muted)] text-xs">
                {history.slice(0, 6).map((item) => (
                  <li key={item.relayId} className="flex items-center justify-between px-3 py-2">
                    <span className="text-[var(--otzar-text)] tabular-nums">
                      {new Date(item.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      {item.cabinetCode ? ` · ארון ${item.cabinetCode}` : ""}
                      {item.shelfNumber ? ` מדף ${item.shelfNumber}` : ""}
                      {` · ${item.photoCount} תמונות`}
                    </span>
                    <span
                      className={
                        item.status === "picked_up"
                          ? "font-bold text-emerald-600 dark:text-emerald-400"
                          : "font-semibold text-amber-600 dark:text-amber-400"
                      }
                    >
                      {item.status === "picked_up" ? "נקלט במחשב ✓" : "ממתין במחשב"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
