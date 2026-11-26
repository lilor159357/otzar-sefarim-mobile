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

const TORAH_CANONICAL_ENTRIES: Array<[string, number]> = [
  // 63 Masechtot (Mishnah / Shas) - checked BEFORE generic Seder names
  // Seder Zeraim (10000 - 11999)
  ["ברכות", 10010],
  ["פאה", 10020],
  ["דמאי", 10030],
  ["כלאים", 10040],
  ["כלאיים", 10040],
  ["שביעית", 10050],
  ["תרומות", 10060],
  ["מעשר שני", 10080],
  ["מעשרות", 10070],
  ["חלה", 10090],
  ["ערלה", 10100],
  ["בכורים", 10110],
  ["ביכורים", 10110],

  // Seder Moed (12000 - 13999)
  ["שבת", 12010],
  ["עירובין", 12020],
  ["ערובין", 12020],
  ["פסחים", 12030],
  ["שקלים", 12040],
  ["יומא", 12050],
  ["סוכה", 12060],
  ["ביצה", 12070],
  ["ראש השנה", 12080],
  ["תענית", 12090],
  ["מגילה", 12100],
  ["מועד קטן", 12110],
  ["חגיגה", 12120],

  // Seder Nashim (14000 - 15999)
  ["יבמות", 14010],
  ["כתובות", 14020],
  ["נדרים", 14030],
  ["נזיר", 14040],
  ["סוטה", 14050],
  ["גיטין", 14060],
  ["קידושין", 14070],

  // Seder Nezikin (16000 - 17999)
  ["בבא קמא", 16010],
  ["בבא מציעא", 16020],
  ["בבא בתרא", 16030],
  ["סנהדרין", 16040],
  ["מכות", 16050],
  ["שבועות", 16060],
  ["עדיות", 16070],
  ["עדויות", 16070],
  ["עבודה זרה", 16080],
  ["פרקי אבות", 16090],
  ["אבות", 16090],
  ["הוריות", 16100],

  // Seder Kodashim (18000 - 19999)
  ["זבחים", 18010],
  ["מנחות", 18020],
  ["חולין", 18030],
  ["בכורות", 18040],
  ["ערכין", 18050],
  ["תמורה", 18060],
  ["כריתות", 18070],
  ["מעילה", 18080],
  ["תמיד", 18090],
  ["מידות", 18100],
  ["מדות", 18100],
  ["קינים", 18110],
  ["קנים", 18110],

  // Seder Taharot (20000 - 21999)
  ["כלים", 20010],
  ["אהלות", 20020],
  ["אוהלות", 20020],
  ["נגעים", 20030],
  ["פרה", 20040],
  ["טהרות", 20050],
  ["מקוואות", 20060],
  ["מקואות", 20060],
  ["נידה", 20070],
  ["נדה", 20070],
  ["מכשירין", 20080],
  ["זבים", 20090],
  ["טבול יום", 20100],
  ["ידיים", 20110],
  ["ידים", 20110],
  ["עוקצין", 20120],
  ["עוקצים", 20120],

  // Generic Sedarim (only matched if no specific Masechet above matched)
  ["סדר זרעים", 10000],
  ["סדר מועד", 12000],
  ["סדר נשים", 14000],
  ["סדר נזיקין", 16000],
  ["סדר קדשים", 18000],
  ["סדר קודשים", 18000],
  ["סדר טהרות", 20000],

  // Tur / Shulchan Aruch (30000 - 30999)
  ["אורח חיים", 30010],
  ["אוח", 30010],
  ["יורה דעה", 30020],
  ["יוד", 30020],
  ["אבן העזר", 30030],
  ["אהע", 30030],
  ["חושן משפט", 30040],
  ["חומ", 30040],

  // Rambam Mishneh Torah (40000 - 41999) - explicit "ספר ..." before bare Tanach/Seder names
  ["ספר המדע", 40010],
  ["ספר מדע", 40010],
  ["המדע", 40010],
  ["מדע", 40010],
  ["ספר אהבה", 40020],
  ["אהבה", 40020],
  ["ספר זמנים", 40030],
  ["זמנים", 40030],
  ["ספר נשים", 40040],
  ["ספר קדושה", 40050],
  ["קדושה", 40050],
  ["ספר הפלאה", 40060],
  ["הפלאה", 40060],
  ["ספר זרעים", 40070],
  ["ספר עבודה", 40080],
  ["עבודה", 40080],
  ["ספר קרבנות", 40090],
  ["קרבנות", 40090],
  ["ספר טהרה", 40100],
  ["טהרה", 40100],
  ["ספר נזיקין", 40110],
  ["ספר קניין", 40120],
  ["ספר קנין", 40120],
  ["קניין", 40120],
  ["קנין", 40120],
  ["ספר משפטים", 40130],
  ["ספר שופטים", 40140],

  // Chumashim & Parshiot (1000 - 1500)
  ["פרשת בראשית", 1001],
  ["פרשת נח", 1002],
  ["לך לך", 1003],
  ["וירא", 1004],
  ["חיי שרה", 1005],
  ["פרשת תולדות", 1006],
  ["ויצא", 1007],
  ["וישלח", 1008],
  ["וישב", 1009],
  ["מקץ", 1010],
  ["ויגש", 1011],
  ["ויחי", 1012],
  ["בראשית", 1000],

  ["פרשת שמות", 1101],
  ["וארא", 1102],
  ["פרשת בא", 1103],
  ["בשלח", 1104],
  ["יתרו", 1105],
  ["פרשת משפטים", 1106],
  ["פרשת תרומה", 1107],
  ["תצוה", 1108],
  ["תצווה", 1108],
  ["כי תשא", 1109],
  ["ויקהל", 1110],
  ["פקודי", 1111],
  ["שמות", 1100],

  ["פרשת ויקרא", 1201],
  ["פרשת צו", 1202],
  ["שמיני", 1203],
  ["תזריע", 1204],
  ["מצורע", 1205],
  ["אחרי מות", 1206],
  ["קדושים", 1207],
  ["אמור", 1208],
  ["בהר", 1209],
  ["בחוקותי", 1210],
  ["בחקתי", 1210],
  ["ויקרא", 1200],

  ["פרשת במדבר", 1301],
  ["נשא", 1302],
  ["בהעלותך", 1303],
  ["בהעלתך", 1303],
  ["שלח לך", 1304],
  ["פרשת שלח", 1304],
  ["קורח", 1305],
  ["קרח", 1305],
  ["חוקת", 1306],
  ["חקת", 1306],
  ["בלק", 1307],
  ["פינחס", 1308],
  ["פנחס", 1308],
  ["מטות", 1309],
  ["מסעי", 1310],
  ["במדבר", 1300],

  ["פרשת דברים", 1401],
  ["ואתחנן", 1402],
  ["עקב", 1403],
  ["ראה", 1404],
  ["פרשת שופטים", 1405],
  ["כי תצא", 1406],
  ["כי תבוא", 1407],
  ["כי תבא", 1407],
  ["ניצבים", 1408],
  ["נצבים", 1408],
  ["וילך", 1409],
  ["האזינו", 1410],
  ["וזאת הברכה", 1411],
  ["דברים", 1400],

  ["משפטים", 40130],

  // Nevi'im (2000 - 2999)
  ["יהושע", 2010],
  ["שופטים", 2020],
  ["שמואל ב", 2040],
  ["שמואל א", 2030],
  ["שמואל", 2030],
  ["מלכים ב", 2060],
  ["מלכים א", 2050],
  ["מלכים", 2050],
  ["ישעיהו", 2070],
  ["ישעיה", 2070],
  ["ירמיהו", 2080],
  ["ירמיה", 2080],
  ["יחזקאל", 2090],
  ["תרי עשר", 2100],
  ["הושע", 2110],
  ["יואל", 2120],
  ["עמוס", 2130],
  ["עובדיה", 2140],
  ["יונה", 2150],
  ["מיכה", 2160],
  ["נחום", 2170],
  ["חבקוק", 2180],
  ["צפניה", 2190],
  ["חגי", 2200],
  ["זכריה", 2210],
  ["מלאכי", 2220],

  // Ketuvim (3000 - 3999)
  ["תהילים", 3010],
  ["תהלים", 3010],
  ["משלי", 3020],
  ["איוב", 3030],
  ["חמש מגילות", 3040],
  ["שיר השירים", 3050],
  ["רות", 3060],
  ["איכה", 3070],
  ["קהלת", 3080],
  ["אסתר", 3090],
  ["דניאל", 3100],
  ["עזרא", 3110],
  ["נחמיה", 3120],
  ["דברי הימים ב", 3140],
  ["דברי הימים א", 3130],
  ["דברי הימים", 3130],

  // Back matter / Indices
  ["מפתחות", 95010],
  ["מפתח", 95010],
  ["השלמה", 95020],
  ["נספחים", 95030],
];

function escapeRegExpCanon(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\export function torahNaturalVolumeRank(");
}

function normalizeCanonInput(raw: unknown): string {
  return String(raw || "")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/["'״׳]/g, "")
    .replace(/[\-_\/\\.,:;!?()\[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function torahSubSeriesRank(val: unknown): number {
  const norm = normalizeCanonInput(val);
  if (!norm) return 999999;
  for (const [term, rank] of TORAH_CANONICAL_ENTRIES) {
    const re = new RegExp(`(?:^|\\s)${escapeRegExpCanon(term)}(?=$|\\s)`);
    if (re.test(norm)) {
      return rank;
    }
  }
  return 999999;
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

  // 5. Canonical Torah / Shas / Tanach / Shulchan Aruch names (check before Gematriya so words like בראשית/שבת are not summed as numbers)
  const canonRank = torahSubSeriesRank(stripped);
  if (canonRank < 999999) {
    // Check if there is also a trailing volume number or Hebrew letter (e.g., "בראשית / חלק א׳" vs "בראשית / חלק ב׳")
    const tailMatch = stripped.match(/(?:חלק|כרך|ספר)\s*([א-ת]{1,2}|\d+)['"״׳]?\s*$/);
    if (tailMatch) {
      const subNum = /^\d+$/.test(tailMatch[1]) ? parseInt(tailMatch[1], 10) : hebrewGematriya(tailMatch[1]);
      if (subNum > 0) {
        return 100000 + canonRank + Math.min(999, subNum) / 1000;
      }
    }
    const digitTail = stripped.match(/(\d+)\s*$/);
    if (digitTail) {
      const subNum = parseInt(digitTail[1], 10);
      if (subNum > 0) {
        return 100000 + canonRank + Math.min(999, subNum) / 1000;
      }
    }
    return 100000 + canonRank;
  }

  // 6. Arabic digits
  const numMatch = stripped.match(/\d+/);
  if (numMatch) {
    return parseInt(numMatch[0], 10);
  }

  // 7. Hebrew Gematriya token
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
  const sa = String(a.sub_series || "").trim();
  const sb = String(b.sub_series || "").trim();
  const ra = sa ? torahSubSeriesRank(sa) : 999999;
  const rb = sb ? torahSubSeriesRank(sb) : 999999;
  const ga = a.set_global_number != null && Number.isFinite(Number(a.set_global_number)) ? Number(a.set_global_number) : null;
  const gb = b.set_global_number != null && Number.isFinite(Number(b.set_global_number)) ? Number(b.set_global_number) : null;

  // Canonical Torah sub-series order takes precedence across distinct canonical sections
  if (ra < 999999 && rb < 999999 && ra !== rb) {
    return ra - rb;
  }
  if (ga != null && gb != null && ga !== gb && (sa === sb || ra === 999999 || rb === 999999)) {
    return ga - gb;
  }
  if (sa !== sb) {
    if (ra !== rb) return ra - rb;
    if (ga != null && gb == null) return -1;
    if (ga == null && gb != null) return 1;
    if (!sa) return 1;
    if (!sb) return -1;
    const subVolCmp = torahNaturalVolumeRank(sa, customRules) - torahNaturalVolumeRank(sb, customRules);
    if (subVolCmp !== 0) return subVolCmp;
    return sa.localeCompare(sb, "he");
  }
  if (ga != null && gb == null) return -1;
  if (ga == null && gb != null) return 1;
  if (ga != null && gb != null && ga !== gb) return ga - gb;
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
  const parts = raw.split(/[,;/|·\u00B7]+/).map((p) => p.trim()).filter(Boolean);
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


export function formatHebrewNumeralWithPunctuation(num: number): string {
  const letters = numberToHebrewGematriya(num);
  if (!letters || /^\d+$/.test(letters)) return letters;
  if (letters.length === 1) return letters + "'";
  return letters.slice(0, -1) + '"' + letters.slice(-1);
}

function unitPluralLabelHe(unit: CoverageUnit): string {
  if (unit === "siman") return "סימנים";
  if (unit === "daf") return "דפים";
  if (unit === "perek") return "פרקים";
  if (unit === "amud") return "עמודים";
  return "";
}

function unitSingularLabelHe(unit: CoverageUnit): string {
  if (unit === "siman") return "סימן";
  if (unit === "daf") return "דף";
  if (unit === "perek") return "פרק";
  if (unit === "amud") return "עמוד";
  return "";
}

export function inferDominantCoverageUnit(ranges: Array<string | undefined | null>): CoverageUnit {
  const counts: Record<Exclude<CoverageUnit, "any">, number> = {
    siman: 0,
    daf: 0,
    perek: 0,
    amud: 0,
  };
  for (const r of ranges) {
    const clean = String(r || "").trim();
    if (!clean) continue;
    const segs = parseCoverageRanges(clean);
    for (const s of segs) {
      if (s.unit !== "any") counts[s.unit]++;
    }
  }
  let best: CoverageUnit = "any";
  let bestCount = 0;
  for (const u of ["siman", "daf", "perek", "amud"] as const) {
    if (counts[u] > bestCount) {
      bestCount = counts[u];
      best = u;
    }
  }
  return best;
}

export function normalizeCoverageRange(
  raw: string | undefined | null,
  preferredUnit: CoverageUnit = "any"
): string {
  const str = String(raw || "").trim();
  if (!str) return "";
  const segs = parseCoverageRanges(str);
  if (segs.length === 0) {
    // Standardize dashes & Hebrew punctuation to ASCII
    return str
      .replace(/([א-ת])['`׳]/g, "$1'")
      .replace(/([א-ת])["״]/g, '$1"')
      .replace(/\s*[-–—]+\s*/g, "-")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  const formattedSegments = segs.map((seg) => {
    const unit = seg.unit !== "any" ? seg.unit : preferredUnit;
    const startHeb = formatHebrewNumeralWithPunctuation(seg.start);
    const endHeb = formatHebrewNumeralWithPunctuation(seg.end);
    if (seg.start === seg.end) {
      const prefix = unitSingularLabelHe(unit);
      return prefix ? `${prefix} ${startHeb}` : startHeb;
    }
    const prefix = unitPluralLabelHe(unit);
    return prefix ? `${prefix} ${startHeb}-${endHeb}` : `${startHeb}-${endHeb}`;
  });
  return Array.from(new Set(formattedSegments)).join(" · ");
}

export function extractVolumeNumberIndex(
  volume: string | undefined | null,
  setGlobalNumber?: number | null
): number | null {
  const s = String(volume || "").trim();
  if (s) {
    const cleaned = s
      .replace(/^(כרך|חלק|ספר|כ['"״׳]|ח['"״׳])\s+/i, "")
      .replace(/["'״׳]/g, "")
      .trim();
    // Avoid matching full tractate / Chumash names as volume numbers
    const hasPrefix = /^(כרך|חלק|ספר|כ['"״׳]|ח['"״׳])\s+/i.test(s);
    if (/^\d{1,3}$/.test(cleaned)) {
      const n = parseInt(cleaned, 10);
      if (n > 0 && n <= 200) return n;
    }
    const roman = parseRomanNumeral(cleaned);
    if (roman > 0 && roman <= 100) return roman;
    // Only interpret Hebrew letters as a volume number if <= 3 letters AND (hasPrefix or single/2-letter gematria <= 60)
    if (/^[א-ת]{1,3}$/.test(cleaned)) {
      const g = hebrewGematriya(cleaned);
      if (g > 0 && (hasPrefix || g <= 60) && torahSubSeriesRank(cleaned) === 999999) {
        return g;
      }
    }
    // Check explicit trailing volume number after dash e.g. "בראשית / חלק א'" or "מסכת שבת - כרך ג'"
    const tail = s.match(/(?:כרך|חלק|ספר)\s+([א-ת]{1,3}['"״׳]?|\d{1,3})\s*$/);
    if (tail) {
      const tok = tail[1].replace(/["'״׳]/g, "");
      if (/^\d+$/.test(tok)) {
        const n = parseInt(tok, 10);
        if (n > 0 && n <= 200) return n;
      }
      const g = hebrewGematriya(tok);
      if (g > 0 && g <= 100) return g;
    }
  }
  if (setGlobalNumber != null && Number.isFinite(Number(setGlobalNumber)) && Number(setGlobalNumber) > 0 && Number(setGlobalNumber) <= 200) {
    return Math.round(Number(setGlobalNumber));
  }
  return null;
}

export function buildMissingVolumeLabel(index: number, sampleVolume?: string): string {
  const sample = String(sampleVolume || "").trim();
  if (/^\d+$/.test(sample)) return String(index);
  if (/^חלק\s+/.test(sample)) return `חלק ${formatHebrewNumeralWithPunctuation(index)}`;
  if (/^ספר\s+/.test(sample)) return `ספר ${formatHebrewNumeralWithPunctuation(index)}`;
  return `כרך ${formatHebrewNumeralWithPunctuation(index)}`;
}

export interface MissingVolumeSlot {
  key: string;
  setName: string;
  subSeries: string;
  slotType: "volume" | "global";
  index: number;
  suggestedVolume: string;
  suggestedGlobalNumber: number | null;
  ignored: boolean;
}

export function makeMissingVolumeIgnoreKey(
  setName: string,
  subSeries: string,
  slotType: "volume" | "global",
  index: number
): string {
  return `${setName.trim().toLowerCase()}::${subSeries.trim().toLowerCase()}::${slotType}::${index}`;
}

export function computeMissingSetSlots(
  books: Array<{
    set_name?: string;
    sub_series?: string;
    volume?: string;
    set_global_number?: number | null;
  }>,
  setName: string,
  ignoredKeys?: Set<string>
): MissingVolumeSlot[] {
  const cleanSet = String(setName || "").trim();
  if (!cleanSet || !Array.isArray(books) || books.length === 0) return [];
  const slots: MissingVolumeSlot[] = [];
  const seenKeys = new Set<string>();

  // 1. Per sub_series volume sequence gaps (1..maxVolIdx)
  const bySub = new Map<string, typeof books>();
  for (const b of books) {
    const sub = String(b.sub_series || "").trim();
    const arr = bySub.get(sub) || [];
    arr.push(b);
    bySub.set(sub, arr);
  }

  const coveredGlobalNumbers = new Set<number>();
  for (const b of books) {
    const gn = b.set_global_number != null ? Number(b.set_global_number) : 0;
    if (Number.isFinite(gn) && gn > 0) coveredGlobalNumbers.add(Math.round(gn));
  }

  for (const [subSeries, list] of bySub.entries()) {
    const presentVolIndices = new Set<number>();
    let sampleVol = "";
    for (const b of list) {
      if (!sampleVol && String(b.volume || "").trim()) sampleVol = String(b.volume || "").trim();
      const idx = extractVolumeNumberIndex(b.volume, null);
      if (idx != null && idx > 0) presentVolIndices.add(idx);
    }
    if (presentVolIndices.size === 0) continue;
    const maxVol = Math.max(...Array.from(presentVolIndices));
    if (maxVol < 2 || maxVol > 120) continue;
    for (let i = 1; i <= maxVol; i++) {
      if (presentVolIndices.has(i)) continue;
      const key = makeMissingVolumeIgnoreKey(cleanSet, subSeries, "volume", i);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      slots.push({
        key,
        setName: cleanSet,
        subSeries,
        slotType: "volume",
        index: i,
        suggestedVolume: buildMissingVolumeLabel(i, sampleVol),
        suggestedGlobalNumber: subSeries === "" && coveredGlobalNumbers.size > 0 ? i : null,
        ignored: Boolean(ignoredKeys?.has(key)),
      });
    }
  }

  // 2. Overall set_global_number sequence gaps across the whole set (when set_global_number is used)
  if (coveredGlobalNumbers.size > 0) {
    const maxGlobal = Math.max(...Array.from(coveredGlobalNumbers));
    if (maxGlobal >= 2 && maxGlobal <= 150) {
      let sampleGlobalVol = "";
      for (const b of books) {
        if (!sampleGlobalVol && String(b.volume || "").trim()) sampleGlobalVol = String(b.volume || "").trim();
      }
      for (let g = 1; g <= maxGlobal; g++) {
        if (coveredGlobalNumbers.has(g)) continue;
        const rootVolKey = makeMissingVolumeIgnoreKey(cleanSet, "", "volume", g);
        if (seenKeys.has(rootVolKey)) continue;
        const gKey = makeMissingVolumeIgnoreKey(cleanSet, "", "global", g);
        if (seenKeys.has(gKey)) continue;
        seenKeys.add(gKey);
        slots.push({
          key: gKey,
          setName: cleanSet,
          subSeries: "",
          slotType: "global",
          index: g,
          suggestedVolume: bySub.size <= 1 ? buildMissingVolumeLabel(g, sampleGlobalVol) : "",
          suggestedGlobalNumber: g,
          ignored: Boolean(ignoredKeys?.has(gKey)),
        });
      }
    }
  }

  return slots;
}

export function shouldSuppressSingleVolumeLabel(
  book: {
    set_name?: string;
    sub_series?: string;
    volume?: string;
    coverage_range?: string;
    title?: string;
  },
  sameSetBooks?: Array<{
    sub_series?: string;
    volume?: string;
    coverage_range?: string;
    title?: string;
  }>
): boolean {
  const vol = String(book.volume || "").trim();
  if (!vol) return false;
  const cov = String(book.coverage_range || "").trim();
  if (cov) return false;

  const sub = String(book.sub_series || "").trim();
  const setBooks = Array.isArray(sameSetBooks) ? sameSetBooks : [];

  if (sub) {
    const siblings = setBooks.filter((b) => String(b.sub_series || "").trim() === sub);
    if (siblings.length <= 1) return true;
    const distinctVols = new Set(siblings.map((b) => String(b.volume || "").trim()).filter(Boolean));
    const anyCov = siblings.some((b) => Boolean(String(b.coverage_range || "").trim()));
    if (distinctVols.size <= 1 && !anyCov) return true;
    return false;
  }

  // When sub_series is empty, check if volume is just a tractate / Chumash name without distinct numerals
  if (/^(?:כרך|חלק|ספר)?\s*(?:מסכת|חומש|סדר)?\s*[א-ת]+/i.test(vol)) {
    const volWithoutPrefix = vol.replace(/^(?:כרך|חלק|ספר|מסכת|חומש)\s+/g, "").trim();
    if (torahSubSeriesRank(volWithoutPrefix) < 999999 || torahSubSeriesRank(vol) < 999999) {
      return true;
    }
  }

  if (setBooks.length > 0) {
    const allSubs = setBooks.map((b) => String(b.sub_series || "").trim()).filter(Boolean);
    if (allSubs.length >= 2) {
      return true;
    }
  }

  return false;
}

export interface TitleTemplateDerivationParams {
  setName: string;
  subSeries?: string;
  volume?: string;
  coverageRange?: string;
  sampleBooks?: Array<{
    title?: string;
    set_name?: string;
    sub_series?: string;
    volume?: string;
    coverage_range?: string;
  }>;
}

export function deriveTitleFromSetTemplate(params: TitleTemplateDerivationParams): string {
  const cleanSet = String(params.setName || "").trim();
  const cleanSub = String(params.subSeries || "").trim();
  let cleanVol = String(params.volume || "").trim();
  const cleanCov = String(params.coverageRange || "").trim();
  const samples = Array.isArray(params.sampleBooks) ? params.sampleBooks : [];

  if (!cleanSet) {
    if (cleanSub && cleanVol) return `${cleanSub} · ${cleanVol}`;
    return cleanSub || cleanVol || "";
  }

  if (cleanVol && shouldSuppressSingleVolumeLabel(
    { set_name: cleanSet, sub_series: cleanSub, volume: cleanVol, coverage_range: cleanCov },
    samples
  )) {
    cleanVol = "";
  }

  const validTitles = samples
    .map((s) => String(s.title || "").trim())
    .filter((t) => t.length > 0 && t.startsWith(cleanSet));

  if (validTitles.length > 0) {
    let sampleSep = " · ";
    const firstSample = validTitles[0];
    const afterSet = firstSample.slice(cleanSet.length).trim();
    if (afterSet.startsWith("·")) sampleSep = " · ";
    else if (afterSet.startsWith("-") || afterSet.startsWith("–") || afterSet.startsWith("—")) sampleSep = " - ";
    else if (afterSet.startsWith("/")) sampleSep = " / ";

    if (cleanSub && cleanVol) {
      if (firstSample.includes("(") && firstSample.includes(")") && firstSample.includes(cleanSub)) {
        return `${cleanSet}${sampleSep}${cleanSub} (${cleanVol})`;
      }
      return `${cleanSet}${sampleSep}${cleanSub}${sampleSep}${cleanVol}`;
    }
    if (cleanSub) {
      return `${cleanSet}${sampleSep}${cleanSub}`;
    }
    if (cleanVol) {
      return `${cleanSet}${sampleSep}${cleanVol}`;
    }
    return cleanSet;
  }

  if (cleanSub && cleanVol) {
    return `${cleanSet} · ${cleanSub} · ${cleanVol}`;
  }
  if (cleanSub) {
    return `${cleanSet} · ${cleanSub}`;
  }
  if (cleanVol) {
    return `${cleanSet} · ${cleanVol}`;
  }
  return cleanSet;
}
