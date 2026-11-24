import React, { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Camera as CameraIcon, ImagePlus, Send, Trash2, CheckCircle2, AlertTriangle, Minus, Plus, Star, BookCopy, Layers, RotateCcw } from "lucide-react";
import type { CabinetDoc, RelaySentItem } from "../types.ts";
import { compressImageDataUrl, compressBatchForRelay, type CompressedCapture } from "../lib/imageCompress.ts";
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
    setBatchId?: string | null;
    isShelfSet?: boolean;
    presetSetName?: string | null;
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
  const [captureMode, setCaptureMode] = useState<"standard" | "shelf-set">("standard");
  const [photos, setPhotos] = useState<CompressedCapture[]>([]);
  const [shelfTitlePhoto, setShelfTitlePhoto] = useState<CompressedCapture | null>(null);
  const [shelfSpinePhotos, setShelfSpinePhotos] = useState<CompressedCapture[]>([]);
  const [stickySetEnabled, setStickySetEnabled] = useState(false);
  const [stickyBatchId, setStickyBatchId] = useState<string>(() => `mobbatch_${Date.now()}`);
  const [stickyBatchCount, setStickyBatchCount] = useState<number>(0);
  const [presetSetName, setPresetSetName] = useState<string>("");
  const [cabinetSyncId, setCabinetSyncId] = useState<string>("");
  const [shelfNumber, setShelfNumber] = useState<number>(1);
  const [useShelf, setUseShelf] = useState<boolean>(true);
  const [sending, setSending] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [history, setHistory] = useState<RelaySentItem[]>(() => loadRelayHistory());
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const activeCaptureSlotRef = useRef<"standard" | "shelf-title" | "shelf-spine">("standard");

  const selectedCabinet = cabinets.find((c) => c.sync_id === cabinetSyncId) || null;
  const maxShelf = selectedCabinet?.shelves_count || 12;

  const appendCompressedDataUrl = async (
    dataUrl: string,
    slot: "standard" | "shelf-title" | "shelf-spine" = activeCaptureSlotRef.current
  ) => {
    const maxBudget = slot === "shelf-spine" ? 220000 : slot === "shelf-title" ? 380000 : 380000;
    const compressed = await compressImageDataUrl(dataUrl, maxBudget);
    if (slot === "shelf-title") {
      setShelfTitlePhoto(compressed);
    } else if (slot === "shelf-spine") {
      setShelfSpinePhotos((prev) => [...prev, compressed].slice(0, 3));
    } else {
      setPhotos((prev) => [...prev, compressed].slice(0, 4));
    }
  };

  const handleCaptureCamera = async (slot: "standard" | "shelf-title" | "shelf-spine" = "standard") => {
    setFeedback(null);
    activeCaptureSlotRef.current = slot;
    if (slot === "standard" && photos.length >= 4) {
      setFeedback({ type: "err", text: "ניתן לצרף עד 4 תמונות במשלוח אחד (שדרה ראשית + שער/זוויות)." });
      return;
    }
    if (slot === "shelf-spine" && shelfSpinePhotos.length >= 3) {
      setFeedback({ type: "err", text: "ניתן לצרף עד 3 תמונות שדרות במשלוח אחד." });
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
          await appendCompressedDataUrl(photo.dataUrl, slot);
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

  const handlePickGallery = async (slot: "standard" | "shelf-title" | "shelf-spine" = "standard") => {
    setFeedback(null);
    activeCaptureSlotRef.current = slot;
    if (slot === "standard" && photos.length >= 4) {
      setFeedback({ type: "err", text: "ניתן לצרף עד 4 תמונות במשלוח אחד." });
      return;
    }
    if (slot === "shelf-spine" && shelfSpinePhotos.length >= 3) {
      setFeedback({ type: "err", text: "ניתן לצרף עד 3 תמונות שדרות במשלוח אחד." });
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
          await appendCompressedDataUrl(photo.dataUrl, slot);
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

    const slot = activeCaptureSlotRef.current;
    setProcessingPhoto(true);
    setFeedback(null);
    try {
      const limitCount =
        slot === "shelf-title"
          ? 1
          : slot === "shelf-spine"
          ? Math.max(0, 3 - shelfSpinePhotos.length)
          : Math.max(0, 4 - photos.length);
      for (const file of files.slice(0, limitCount)) {
        const rawUrl = await readFileAsDataUrl(file);
        await appendCompressedDataUrl(rawUrl, slot);
      }
    } catch (err: unknown) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "שגיאה בעיבוד התמונה" });
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleSend = async () => {
    const isShelf = captureMode === "shelf-set";
    if (isShelf && !shelfTitlePhoto) return;
    if (!isShelf && photos.length === 0) return;

    setSending(true);
    setFeedback(null);
    const targetCabinetCode = selectedCabinet?.code || null;
    const targetShelf = selectedCabinet && useShelf ? shelfNumber : null;

    const main = isShelf ? shelfTitlePhoto! : photos[0];
    const extras = isShelf ? shelfSpinePhotos : photos.slice(1);
    const totalPhotoCount = 1 + extras.length;

    try {
      const batch = await compressBatchForRelay([main, ...extras], 750000);
      const relayId = await onSendRelay({
        mainBase64: batch.mainBase64,
        extraBase64s: batch.extraBase64s,
        cabinetSyncId: selectedCabinet?.sync_id || null,
        cabinetCode: targetCabinetCode,
        shelfNumber: targetShelf,
        setBatchId: !isShelf && stickySetEnabled ? stickyBatchId : null,
        isShelfSet: isShelf,
        presetSetName: (isShelf || stickySetEnabled) ? presetSetName.trim() : "",
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
        photoCount: totalPhotoCount,
        status: "queued",
        setBatchId: !isShelf && stickySetEnabled ? stickyBatchId : null,
        isShelfSet: isShelf,
        presetSetName: presetSetName.trim() || undefined,
      };
      const nextHistory = [entry, ...history].slice(0, 20);
      setHistory(nextHistory);
      saveRelayHistory(nextHistory);
      if (isShelf) {
        setShelfTitlePhoto(null);
        setShelfSpinePhotos([]);
        setPresetSetName("");
      } else {
        setPhotos([]);
        if (stickySetEnabled) {
          setStickyBatchCount((c) => c + 1);
        }
      }
      setFeedback({
        type: "ok",
        text: isShelf
          ? "סט המדף (שער + שדרות) נשלח לענן! המחשב יפרוס את כל הכרכים והעותקים אוטומטית."
          : "התמונות נשלחו לענן! תוכנת המחשב תקלוט אותן אוטומטית בתור הקטלוג.",
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : "שליחת התמונות נכשלה";
      const cleanMsg = rawMsg.includes("exceeds the maximum allowed size") || rawMsg.includes("1,048,576")
        ? "משקל התמונות הכולל חרג ממגבלת הענן. בוצעה דחיסה מותאמת, אנא נסה לשלוח שוב."
        : rawMsg;
      setFeedback({ type: "err", text: cleanMsg });
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

      {/* Mode Switcher */}
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[var(--otzar-surface-alt)] p-1 border border-[var(--otzar-border-muted)]">
        <button
          type="button"
          onClick={() => setCaptureMode("standard")}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition-colors ${
            captureMode === "standard"
              ? "bg-[var(--otzar-accent)] text-white shadow-xs"
              : "text-[var(--otzar-text-muted)]"
          }`}
        >
          <CameraIcon className="h-4 w-4" />
          <span>רגיל / סט רציף</span>
        </button>
        <button
          type="button"
          onClick={() => setCaptureMode("shelf-set")}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition-colors ${
            captureMode === "shelf-set"
              ? "bg-[var(--otzar-accent)] text-white shadow-xs"
              : "text-[var(--otzar-text-muted)]"
          }`}
        >
          <BookCopy className="h-4 w-4" />
          <span>סט מהמדף (שער + שדרות)</span>
        </button>
      </div>

      {/* Sticky Set / Preset Set Bar */}
      {captureMode === "standard" ? (
        <div className="space-y-2.5 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 font-bold text-[var(--otzar-text)]">
              <input
                type="checkbox"
                checked={stickySetEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setStickySetEnabled(on);
                  if (on && !stickyBatchId) {
                    setStickyBatchId(`mobbatch_${Date.now()}`);
                    setStickyBatchCount(0);
                  }
                }}
                className="h-4 w-4 accent-[var(--otzar-accent)]"
              />
              <Layers className="h-4 w-4 text-[var(--otzar-accent)]" />
              <span>קיבוץ צילומים לסט (Sticky Set)</span>
            </label>
            {stickySetEnabled && (
              <button
                type="button"
                onClick={() => {
                  setStickyBatchId(`mobbatch_${Date.now()}`);
                  setStickyBatchCount(0);
                  setPresetSetName("");
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--otzar-accent)] px-2.5 py-1 font-semibold text-[var(--otzar-accent)]"
              >
                <RotateCcw className="h-3 w-3" />
                התחל מקבץ חדש
              </button>
            )}
          </div>
          {stickySetEnabled && (
            <div className="space-y-2 pt-1">
              <input
                type="text"
                value={presetSetName}
                onChange={(e) => setPresetSetName(e.target.value)}
                placeholder="שם סט מקדים לכל הצילומים במקבץ (אופציונלי)"
                className="min-h-[40px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
              />
              <p className="text-[11px] text-[var(--otzar-text-muted)]">
                נשלחו במקבץ זה: <strong>{stickyBatchCount}</strong> ספרים · ארון ומדף יישארו נעולים בין הצילומים.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-3 text-xs">
          <p className="font-bold text-[var(--otzar-text)]">מצב סט מהמדף — 2 שלבים:</p>
          <p className="text-[var(--otzar-text-muted)]">
            1) צלם שער מייצג של אחד הכרכים, 2) צלם את שדרות הסט על המדף (1–3 תמונות).
          </p>
          <input
            type="text"
            value={presetSetName}
            onChange={(e) => setPresetSetName(e.target.value)}
            placeholder="שם הסט (אופציונלי — יזוהה מהשער)"
            className="min-h-[40px] w-full rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-sm text-[var(--otzar-text)] outline-none focus:border-[var(--otzar-accent)]"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Capture & Queue */}
        {captureMode === "shelf-set" ? (
          <section className="space-y-3 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-3.5">
            {/* Slot 1: Representative Title Page */}
            <div className="space-y-2 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--otzar-text)]">1. תמונת שער מייצגת *</span>
                {shelfTitlePhoto && (
                  <button
                    type="button"
                    onClick={() => setShelfTitlePhoto(null)}
                    className="text-xs font-semibold text-rose-600"
                  >
                    הסר
                  </button>
                )}
              </div>
              {shelfTitlePhoto ? (
                <div className="relative overflow-hidden rounded-xl border border-[var(--otzar-border-muted)] bg-slate-950">
                  <img src={shelfTitlePhoto.previewUrl} alt="שער הסט" className="h-36 w-full object-contain" />
                  <div className="bg-[var(--otzar-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--otzar-accent)] tabular-nums">
                    שער מייצג · {Math.round(shelfTitlePhoto.byteSize / 1024)}KB
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={processingPhoto}
                    onClick={() => handleCaptureCamera("shelf-title")}
                    className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-[var(--otzar-accent)] px-2 text-xs font-bold text-white"
                  >
                    <CameraIcon className="h-4 w-4" />
                    <span>צלם שער</span>
                  </button>
                  <button
                    type="button"
                    disabled={processingPhoto}
                    onClick={() => handlePickGallery("shelf-title")}
                    className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] px-2 text-xs font-semibold text-[var(--otzar-text)]"
                  >
                    <ImagePlus className="h-4 w-4" />
                    <span>מהגלריה</span>
                  </button>
                </div>
              )}
            </div>

            {/* Slot 2: Spine shelf photos */}
            <div className="space-y-2 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--otzar-text)]">
                  2. צילומי שדרות הסט ({shelfSpinePhotos.length}/3)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={processingPhoto || shelfSpinePhotos.length >= 3}
                  onClick={() => handleCaptureCamera("shelf-spine")}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[var(--otzar-accent)] px-2 text-xs font-bold text-white disabled:opacity-45"
                >
                  <CameraIcon className="h-4 w-4" />
                  <span>צלם שדרות</span>
                </button>
                <button
                  type="button"
                  disabled={processingPhoto || shelfSpinePhotos.length >= 3}
                  onClick={() => handlePickGallery("shelf-spine")}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] px-2 text-xs font-semibold text-[var(--otzar-text)] disabled:opacity-45"
                >
                  <ImagePlus className="h-4 w-4" />
                  <span>מהגלריה</span>
                </button>
              </div>
              {shelfSpinePhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {shelfSpinePhotos.map((sp, idx) => (
                    <div key={idx} className="relative overflow-hidden rounded-xl border border-[var(--otzar-border-muted)] bg-slate-950">
                      <img src={sp.previewUrl} alt={`שדרות ${idx + 1}`} className="h-24 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setShelfSpinePhotos((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="הסר תמונת שדרות"
                        className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : (
        <section className="space-y-3 rounded-2xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-bg)] p-3.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={processingPhoto || photos.length >= 4}
              onClick={() => handleCaptureCamera("standard")}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[var(--otzar-accent)] px-3 font-bold text-white active:scale-[0.98] disabled:opacity-45"
            >
              <CameraIcon className="h-5 w-5" />
              <span>{processingPhoto ? "מעבד..." : "צלם עכשיו"}</span>
            </button>

            <button
              type="button"
              disabled={processingPhoto || photos.length >= 4}
              onClick={() => handlePickGallery("standard")}
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
        )}

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
            disabled={
              !connected ||
              sending ||
              (captureMode === "shelf-set" ? !shelfTitlePhoto : photos.length === 0)
            }
            onClick={handleSend}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--otzar-accent)] px-4 font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-45"
          >
            <Send className="h-5 w-5" />
            <span>
              {sending
                ? "משדר לתור הענן..."
                : !connected
                ? "נדרש חיבור פעיל לענן"
                : captureMode === "shelf-set"
                ? !shelfTitlePhoto
                  ? "צלם שער מייצג לסט לשליחה"
                  : `שלח סט מהמדף (שער + ${shelfSpinePhotos.length} שדרות)`
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
