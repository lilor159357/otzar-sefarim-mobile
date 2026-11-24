import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { X, ScanLine, Keyboard } from "lucide-react";

interface BarcodeScannerModalProps {
  open: boolean;
  title?: string;
  formatsMode?: "all" | "qr";
  hintText?: string;
  manualInputMode?: "numeric" | "text";
  manualLabel?: string;
  manualPlaceholder?: string;
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  title = "סריקת ברקוד ספר",
  formatsMode = "all",
  hintText,
  manualInputMode = "numeric",
  manualLabel = "או הזן מספר ברקוד ידנית:",
  manualPlaceholder = "למשל: 100001",
  onDetected,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    if (!open) {
      handledRef.current = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
      return;
    }

    let cancelled = false;
    setCameraError(null);
    setManualCode("");
    handledRef.current = false;

    const startScanner = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError("המצלמה אינה זמינה בדפדפן זה — ניתן להזין ברקוד ידנית למטה");
          return;
        }
        const hints = new Map();
        hints.set(
          DecodeHintType.POSSIBLE_FORMATS,
          formatsMode === "qr"
            ? [BarcodeFormat.QR_CODE]
            : [
                BarcodeFormat.CODE_128,
                BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8,
                BarcodeFormat.CODE_39,
                BarcodeFormat.QR_CODE,
              ]
        );
        if (formatsMode === "qr") {
          hints.set(DecodeHintType.TRY_HARDER, true);
        }
        const reader = new BrowserMultiFormatReader(hints);
        const videoEl = videoRef.current;
        if (!videoEl || cancelled) return;

        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video:
              formatsMode === "qr"
                ? {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                  }
                : {
                    facingMode: { ideal: "environment" },
                  },
          },
          videoEl,
          (result) => {
            if (!result || handledRef.current || cancelled) return;
            const code = result.getText().trim();
            if (code) {
              handledRef.current = true;
              controlsRef.current?.stop();
              onDetected(code);
            }
          }
        );
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "";
          setCameraError(
            msg.toLowerCase().includes("permission")
              ? "נדרשת הרשאת מצלמה לסריקת ברקודים. אפשר גם להקליד ידנית."
              : "לא ניתן להפעיל את המצלמה כעת. ניתן להקליד מספר ברקוד ידנית."
          );
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetected, formatsMode]);

  if (!open) return null;

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    onDetected(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-[var(--otzar-bg)] shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[var(--otzar-border-muted)] px-4 py-3">
          <div className="flex items-center gap-2 font-bold text-[var(--otzar-text)]">
            <ScanLine className="h-5 w-5 text-[var(--otzar-accent)]" />
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור סורק"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--otzar-text-muted)] hover:bg-[var(--otzar-surface-alt)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-950">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />
            {!cameraError && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div
                  className={
                    formatsMode === "qr"
                      ? "h-48 w-48 rounded-2xl border-2 border-[var(--otzar-accent)] shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
                      : "h-28 w-4/5 rounded-2xl border-2 border-[var(--otzar-accent)] shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                  }
                />
                {hintText && (
                  <span className="rounded-lg bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
                    {hintText}
                  </span>
                )}
              </div>
            )}
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center p-5 text-center text-sm text-slate-200">
                {cameraError}
              </div>
            )}
          </div>

          <form onSubmit={submitManual} className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--otzar-text-muted)]">
              <Keyboard className="h-4 w-4" />
              <span>{manualLabel}</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode={manualInputMode}
                dir="ltr"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder={manualPlaceholder}
                className="min-h-[44px] flex-1 rounded-xl border border-[var(--otzar-border-muted)] bg-[var(--otzar-surface-alt)] px-3 text-base text-[var(--otzar-text)] tabular-nums outline-none focus:border-[var(--otzar-accent)]"
              />
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-[var(--otzar-accent)] px-4 font-semibold text-white active:scale-95"
              >
                אישור
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
