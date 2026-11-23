export interface CompressedCapture {
  base64: string;
  previewUrl: string;
  byteSize: number;
}

export async function compressImageDataUrl(dataUrlOrBlobUrl: string, maxBytesB64 = 700000): Promise<CompressedCapture> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("לא ניתן לטעון את התמונה שצולמה"));
    el.src = dataUrlOrBlobUrl;
  });

  const steps = [
    { maxDim: 1400, quality: 0.78 },
    { maxDim: 1200, quality: 0.66 },
    { maxDim: 1000, quality: 0.54 },
    { maxDim: 820, quality: 0.44 },
  ];

  for (const step of steps) {
    const ratio = Math.min(1, step.maxDim / Math.max(img.width || 1, img.height || 1));
    const targetW = Math.max(1, Math.round(img.width * ratio));
    const targetH = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("שגיאה בעיבוד התמונה");
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const jpegDataUrl = canvas.toDataURL("image/jpeg", step.quality);
    const b64 = jpegDataUrl.includes(",") ? jpegDataUrl.split(",")[1] : jpegDataUrl;
    if (b64.length <= maxBytesB64 || step === steps[steps.length - 1]) {
      return {
        base64: b64,
        previewUrl: jpegDataUrl,
        byteSize: Math.round((b64.length * 3) / 4),
      };
    }
  }

  throw new Error("לא ניתן לדחוס את התמונה");
}
