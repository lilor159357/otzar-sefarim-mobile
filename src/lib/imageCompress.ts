export interface CompressedCapture {
  base64: string;
  previewUrl: string;
  byteSize: number;
}

export async function compressImageDataUrl(
  dataUrlOrBlobUrl: string,
  maxBytesB64 = 500000
): Promise<CompressedCapture> {
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
    { maxDim: 700, quality: 0.38 },
    { maxDim: 580, quality: 0.32 },
    { maxDim: 480, quality: 0.28 },
  ];

  let bestResult: CompressedCapture | null = null;

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

    bestResult = {
      base64: b64,
      previewUrl: jpegDataUrl,
      byteSize: Math.round((b64.length * 3) / 4),
    };

    if (b64.length <= maxBytesB64) {
      return bestResult;
    }
  }

  if (bestResult) return bestResult;
  throw new Error("לא ניתן לדחוס את התמונה");
}

export async function compressBatchForRelay(
  captures: CompressedCapture[],
  maxTotalB64Chars = 750000
): Promise<{ mainBase64: string; extraBase64s: string[] }> {
  if (captures.length === 0) {
    throw new Error("אין תמונות לשליחה");
  }

  const currentTotal = captures.reduce((acc, c) => acc + (c.base64?.length || 0), 0);
  if (currentTotal <= maxTotalB64Chars) {
    return {
      mainBase64: captures[0].base64,
      extraBase64s: captures.slice(1).map((c) => c.base64),
    };
  }

  const count = captures.length;
  const mainBudget = count === 1 ? maxTotalB64Chars : Math.round(maxTotalB64Chars * 0.34);
  const extraBudgetPerItem = count > 1 ? Math.floor((maxTotalB64Chars - mainBudget) / (count - 1)) : 0;

  const outBase64s: string[] = [];
  for (let i = 0; i < captures.length; i++) {
    const targetBudget = i === 0 ? mainBudget : extraBudgetPerItem;
    const item = captures[i];
    if (item.base64.length <= targetBudget) {
      outBase64s.push(item.base64);
    } else {
      const src = item.previewUrl || `data:image/jpeg;base64,${item.base64}`;
      const recompressed = await compressImageDataUrl(src, targetBudget);
      outBase64s.push(recompressed.base64);
    }
  }

  return {
    mainBase64: outBase64s[0],
    extraBase64s: outBase64s.slice(1),
  };
}
