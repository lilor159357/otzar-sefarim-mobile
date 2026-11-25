export type CoverageUnit = "siman" | "daf" | "perek" | "amud" | "any";

export interface VolumeNotationRule {
  symbol: string;
  rank: number;
  label?: string;
}

export interface ParsedCoverageSegment {
  unit: CoverageUnit;
  start: number;
  end: number;
  raw: string;
}

export interface CoverageQueryTarget {
  unit: CoverageUnit;
  value: number;
  displayToken: string;
  explicit: boolean;
  tokenStartIdx: number;
  tokenCount: number;
}

export interface CoverageMatchResult {
  matched: boolean;
  explicit: boolean;
  unit: CoverageUnit;
  value: number;
  hint: string;
}

const GEMATRIYA_MAP: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50,
  ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90, ק: 100, ר: 200, ש: 300, ת: 400,
};

export function hebrewGematriya(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/["'״׳\s]/g, "").trim();
  if (!clean) return 0;
  let sum = 0;
  for (const ch of clean) {
    if (GEMATRIYA_MAP[ch]) {
      sum += GEMATRIYA_MAP[ch];
    } else {
      return 0;
    }
  }
  return sum;
}

export function numberToHebrewGematriya(num: number): string {
  if (!Number.isFinite(num) || num <= 0 || num > 999) return String(num);
  const hundreds = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];
  const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  const h = Math.floor(num / 100);
  const rem = num % 100;
  if (rem === 15) return hundreds[h] + "טו";
  if (rem === 16) return hundreds[h] + "טז";
  const t = Math.floor(rem / 10);
  const o = rem % 10;
  return hundreds[h] + tens[t] + ones[o];
}

export function parseVolumeNotationRules(raw: unknown): VolumeNotationRule[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) list = p;
    } catch {
      return [];
    }
  }
  const out: VolumeNotationRule[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const symbol = String(rec.symbol || "").trim();
    const rank = Number(rec.rank);
    const label = rec.label ? String(rec.label).trim() : undefined;
    if (symbol && Number.isFinite(rank)) {
      out.push({ symbol, rank, ...(label ? { label } : {}) });
    }
  }
  out.sort((a, b) => b.symbol.length - a.symbol.length);
  return out;
}

const ROMAN_MAP: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

export function parseRomanNumeral(raw: string): number {
  const s = raw.trim().toUpperCase().replace(/[.)\]]+$/, "");
  if (!/^[IVXLC]{1,7}$/.test(s)) return 0;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN_MAP[s[i]] || 0;
    const next = ROMAN_MAP[s[i + 1]] || 0;
    if (!cur) return 0;
    total += cur < next ? -cur : cur;
  }
  return total > 0 && total <= 100 ? total : 0;
}

export function torahNaturalVolumeRank(val: unknown, customRules?: VolumeNotationRule[]): number {
  if (!val) return 999999;
  const s = String(val).trim();
  if (!s) return 999999;

  const stripped = s
    .replace(/^(חלק|כרך|ספר|מסכת|ח['"״׳]|כ['"״׳])\s*/i, "")
    .trim();

  // 1. Custom user-defined notation rules take highest priority
  if (customRules && customRules.length > 0) {
    const lowerFull = s.toLowerCase();
    const lowerStripped = stripped.toLowerCase();
    for (const rule of customRules) {
      const sym = rule.symbol.trim().toLowerCase();
      if (!sym) continue;
      if (lowerFull === sym || lowerStripped === sym) {
        return rule.rank;
      }
    }
    for (const rule of customRules) {
      const sym = rule.symbol.trim().toLowerCase();
      if (!sym) continue;
      if (lowerStripped.includes(sym)) {
        return rule.rank;
      }
    }
  }

  // 2. Repeated symbolic markers (*, **, •, ••, ★, ●, etc.)
  const symbolRunMatch = stripped.match(/(\*+|•+|★+|✦+|●+|◆+|▪+|◊+)/);
  if (symbolRunMatch) {
    return symbolRunMatch[1].length;
  }

  // 3. Combined Hebrew letter + number (e.g., א-1, ב-2, א/1) -> fractional sub-rank
  const hebNumMatch = stripped.match(/^([א-ת]{1,2})['"״׳]?[\s\-–—/]+(\d+)$/);
  if (hebNumMatch) {
    const g = hebrewGematriya(hebNumMatch[1]);
    const n = parseInt(hebNumMatch[2], 10);
    if (g > 0 && Number.isFinite(n)) {
      return g + Math.min(999, n) / 1000;
    }
  }

  // 4. Roman numerals (standalone or after prefix)
  const firstToken = stripped.split(/[\s\-–—]+/)[0] || "";
  const romanVal = parseRomanNumeral(firstToken) || parseRomanNumeral(stripped);
  if (romanVal > 0) {
    return romanVal;
  }

  // 5. Arabic digits
  const numMatch = stripped.match(/\d+/);
  if (numMatch) {
    return parseInt(numMatch[0], 10);
  }

  // 6. Hebrew Gematriya token
  const g = hebrewGematriya(firstToken);
  if (g > 0) {
    return g;
  }

  return 999999;
}

export function torahNaturalVolumeSort(
  a: unknown,
  b: unknown,
  customRules?: VolumeNotationRule[]
): number {
  const ra = torahNaturalVolumeRank(a, customRules);
  const rb = torahNaturalVolumeRank(b, customRules);
  if (ra !== rb) return ra - rb;
  return String(a || "").localeCompare(String(b || ""), "he");
}

export interface SetSortableBook {
  title?: string;
  volume?: string;
  sub_series?: string;
  set_global_number?: number | null;
  barcode?: string;
}

export function compareSetBooks(
  a: SetSortableBook,
  b: SetSortableBook,
  customRules?: VolumeNotationRule[]
): number {
  const ga = a.set_global_number != null && Number.isFinite(Number(a.set_global_number)) ? Number(a.set_global_number) : null;
  const gb = b.set_global_number != null && Number.isFinite(Number(b.set_global_number)) ? Number(b.set_global_number) : null;
  if (ga != null && gb != null && ga !== gb) {
    return ga - gb;
  }
  const sa = String(a.sub_series || "").trim();
  const sb = String(b.sub_series || "").trim();
  if (sa !== sb) {
    if (ga != null && gb == null) return -1;
    if (ga == null && gb != null) return 1;
    if (!sa) return 1;
    if (!sb) return -1;
    return sa.localeCompare(sb, "he");
  }
  if (ga != null && gb == null) return -1;
  if (ga == null && gb != null) return 1;
  const volCmp = torahNaturalVolumeSort(a.volume, b.volume, customRules);
  if (volCmp !== 0) return volCmp;
  const titleCmp = String(a.title || "").localeCompare(String(b.title || ""), "he");
  if (titleCmp !== 0) return titleCmp;
  return String(a.barcode || "").localeCompare(String(b.barcode || ""), "he");
}

export function parseHebrewOrArabicNumber(raw: string): number {
  const cleaned = String(raw || "")
    .replace(/[()\[\],.;:]/g, "")
    .trim();
  if (!cleaned) return 0;
  if (/^\d+$/.test(cleaned)) {
    const n = parseInt(cleaned, 10);
    return n > 0 && n <= 20000 ? n : 0;
  }
  const g = hebrewGematriya(cleaned);
  return g > 0 && g <= 2000 ? g : 0;
}

function detectUnitFromText(segment: string, fallback: CoverageUnit = "any"): CoverageUnit {
  const s = segment.trim();
  if (/(סימן|סימנים|סי['׳"״]?)(?=\s|$|[א-ת0-9])/.test(s)) return "siman";
  if (/(דף|דפים|ד['׳])(?=\s|$|[א-ת0-9])/.test(s)) return "daf";
  if (/(פרק|פרקים|פ['׳])(?=\s|$|[א-ת0-9])/.test(s)) return "perek";
  if (/(עמוד|עמודים|עמ['׳])(?=\s|$|[א-ת0-9])/.test(s)) return "amud";
  return fallback;
}

export function parseCoverageRanges(coverageStr: string | undefined | null): ParsedCoverageSegment[] {
  const raw = String(coverageStr || "").trim();
  if (!raw) return [];
  const parts = raw.split(/[,;/|]+/).map((p) => p.trim()).filter(Boolean);
  const out: ParsedCoverageSegment[] = [];
  let lastUnit: CoverageUnit = "any";

  for (const part of parts) {
    const unit = detectUnitFromText(part, lastUnit);
    if (unit !== "any") lastUnit = unit;
    const stripped = part
      .replace(/(סימנים|סימן|סי['׳"״]|דפים|דף|פרקים|פרק|עמודים|עמוד|עמ['׳])/g, " ")
      .replace(/\s+עד\s+/g, "-")
      .trim();

    const rangeRegex = /([א-ת"'״׳]{1,6}|\d{1,5})\s*[\-–—]+\s*([א-ת"'״׳]{1,6}|\d{1,5})/g;
    let matchedAnyRange = false;
    let m: RegExpExecArray | null;
    while ((m = rangeRegex.exec(stripped)) !== null) {
      const a = parseHebrewOrArabicNumber(m[1]);
      const b = parseHebrewOrArabicNumber(m[2]);
      if (a > 0 && b > 0) {
        out.push({ unit, start: Math.min(a, b), end: Math.max(a, b), raw: part });
        matchedAnyRange = true;
      }
    }
    if (!matchedAnyRange) {
      const tokens = stripped.split(/\s+/).filter(Boolean);
      for (const tok of tokens) {
        const val = parseHebrewOrArabicNumber(tok);
        if (val > 0) {
          out.push({ unit, start: val, end: val, raw: part });
        }
      }
    }
  }
  return out;
}

export function extractQueryCoverageTargets(rawQuery: string): CoverageQueryTarget[] {
  const q = String(rawQuery || "").trim();
  if (!q) return [];
  const tokens = q
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[()\[\],]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const targets: CoverageQueryTarget[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    const cleanCur = cur.replace(/["'״׳]/g, "");
    let markerUnit: CoverageUnit | null = null;
    if (/^(סימן|סימנים|סי)$/.test(cleanCur)) markerUnit = "siman";
    else if (/^(דף|דפים)$/.test(cleanCur)) markerUnit = "daf";
    else if (/^(פרק|פרקים)$/.test(cleanCur)) markerUnit = "perek";
    else if (/^(עמוד|עמודים|עמ)$/.test(cleanCur)) markerUnit = "amud";

    if (markerUnit && i + 1 < tokens.length) {
      const val = parseHebrewOrArabicNumber(tokens[i + 1]);
      if (val > 0) {
        targets.push({
          unit: markerUnit,
          value: val,
          displayToken: formatCoverageDisplayValue(tokens[i + 1], val),
          explicit: true,
          tokenStartIdx: i,
          tokenCount: 2,
        });
        i++;
        continue;
      }
    }

    // Handle attached prefix like ס"ה / 65 / כ"ד when multiple tokens exist
    const numVal = parseHebrewOrArabicNumber(cur);
    if (numVal > 0 && (/^\d+$/.test(cur) || cur.length >= 2 || tokens.length > 1)) {
      targets.push({
        unit: "any",
        value: numVal,
        displayToken: formatCoverageDisplayValue(cur, numVal),
        explicit: false,
        tokenStartIdx: i,
        tokenCount: 1,
      });
    }
  }
  return targets;
}

function formatCoverageDisplayValue(rawToken: string, numVal: number): string {
  const trimmed = rawToken.trim();
  if (/^\d+$/.test(trimmed)) {
    return numberToHebrewGematriya(numVal);
  }
  return trimmed;
}

function unitLabelHe(unit: CoverageUnit): string {
  if (unit === "siman") return "סימן";
  if (unit === "daf") return "דף";
  if (unit === "perek") return "פרק";
  if (unit === "amud") return "עמוד";
  return "סימן/קטע";
}

export function matchCoverageRange(
  coverageRange: string | undefined | null,
  targets: CoverageQueryTarget[]
): CoverageMatchResult | null {
  const cleanCov = String(coverageRange || "").trim();
  if (!cleanCov || targets.length === 0) return null;
  const segments = parseCoverageRanges(cleanCov);
  if (segments.length === 0) return null;

  let best: CoverageMatchResult | null = null;
  for (const t of targets) {
    for (const seg of segments) {
      const unitMatches = seg.unit === "any" || t.unit === "any" || seg.unit === t.unit;
      if (!unitMatches) continue;
      if (t.value >= seg.start && t.value <= seg.end) {
        const effUnit = t.unit !== "any" ? t.unit : seg.unit;
        const hint = `מכיל ${unitLabelHe(effUnit)} ${t.displayToken} · ${cleanCov}`;
        const candidate: CoverageMatchResult = {
          matched: true,
          explicit: t.explicit,
          unit: effUnit,
          value: t.value,
          hint,
        };
        if (!best || (candidate.explicit && !best.explicit)) {
          best = candidate;
        }
      }
    }
  }
  return best;
}
