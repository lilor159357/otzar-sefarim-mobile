import type { BookDoc } from "../types.ts";

const HEBREW_FINAL_MAP: Record<string, string> = {
  ך: "כ",
  ם: "מ",
  ן: "נ",
  ף: "פ",
  ץ: "צ",
};

export function normalizeHebrewText(raw: string): string {
  if (!raw) return "";
  const s = raw
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/["״׳'`]/g, "")
    .replace(/[\-_\/\\.,:;!?()\[\]{}]/g, " ")
    .toLowerCase();

  let out = "";
  for (const ch of s) {
    out += HEBREW_FINAL_MAP[ch] ?? ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

const TORAH_SYNONYM_GROUPS: string[][] = [
  ["שוע", "שולחן ערוך", "הרב יוסף קארו", "מרן"],
  ["רמבם", "משנה תורה", "היד החזקה", "יד החזקה", "הרמבם"],
  ["משנב", "מב", "משנה ברורה", "חפץ חיים"],
  ["שס", "תלמוד בבלי", "גמרא", "בבלי"],
  ["ירושלמי", "תלמוד ירושלמי"],
  ["תנך", "תורה נביאים כתובים", "מקראות גדולות", "חומש"],
  ["רשי", "רבי שלמה יצחקי"],
  ["רמבן", "רבי משה בן נחמן"],
  ["תוס", "תוספות"],
  ["בי", "בית יוסף"],
  ["רמא", "הרמא", "דרכי משה"],
  ["טז", "טורי זהב"],
  ["שך", "שפתי כהן"],
  ["פמג", "פרי מגדים"],
  ["קצוהח", "קצות החושן", "קצות"],
  ["נתיהמ", "נתיבות המשפט", "נתיבות"],
  ["חזווא", "חזוא", "חזון איש"],
  ["אגמ", "אגרות משה"],
  ["יביא", "יביע אומר"],
  ["רמחל", "מסילת ישרים", "דעת תבונות", "דרך השם"],
  ["אוח", "אורח חיים"],
  ["יוד", "יורה דעה"],
  ["אהע", "אבן העזר"],
  ["חומ", "חושן משפט"],
  ["בק", "בבא קמא"],
  ["במ", "בבא מציעא"],
  ["בב", "בבא בתרא"],
  ["עז", "עבודה זרה"],
  ["רה", "ראש השנה"],
  ["יוכ", "יום כיפור", "יומא"],
  ["מגי", "מגילה"],
  ["שוות", "שות", "שאלות ותשובות"],
];

const SYNONYM_MAP = new Map<string, string[]>();
for (const group of TORAH_SYNONYM_GROUPS) {
  const normGroup = group.map((g) => normalizeHebrewText(g)).filter(Boolean);
  for (const term of normGroup) {
    const existing = SYNONYM_MAP.get(term) || [];
    const merged = Array.from(new Set([...existing, ...normGroup.filter((x) => x !== term)]));
    SYNONYM_MAP.set(term, merged);
  }
}

export function skeletonHebrew(word: string): string {
  if (!word) return "";
  const w = word.replace(/וו/g, "ו").replace(/יי/g, "י");
  if (w.length <= 2) return w;
  const head = w[0];
  const tail = w[w.length - 1];
  const mid = w.slice(1, -1).replace(/[וי]/g, "");
  return head + mid + tail;
}

function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  if (Math.abs(al - bl) > 2) return 99;
  const dp: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + cost);
      }
      dp[i][j] = val;
    }
  }
  return dp[al][bl];
}

export interface ScoredMobileBook {
  book: BookDoc;
  score: number;
  matchHint: string;
}

export function searchMobileBooks(books: BookDoc[], rawQuery: string): ScoredMobileBook[] {
  const normQuery = normalizeHebrewText(rawQuery);
  if (!normQuery) {
    return books.map((book) => ({ book, score: 1, matchHint: "" }));
  }
  const queryTokens = normQuery.split(" ").filter(Boolean);
  const fullPhraseSynonyms = SYNONYM_MAP.get(normQuery) || [];
  const results: ScoredMobileBook[] = [];

  for (const book of books) {
    const normBarcode = normalizeHebrewText(book.barcode);
    if (normBarcode === normQuery) {
      results.push({ book, score: 1000, matchHint: "התאמת ברקוד מדויקת" });
      continue;
    }
    if (normBarcode.includes(normQuery)) {
      results.push({ book, score: 850, matchHint: "ברקוד" });
      continue;
    }
    const normTitle = normalizeHebrewText(book.title);
    const normSetName = normalizeHebrewText(book.set_name || "");
    const normAuthor = normalizeHebrewText(book.author);
    const normCategory = normalizeHebrewText(book.category);
    const normVolume = normalizeHebrewText(book.volume);
    const normPublisher = normalizeHebrewText(book.publisher);
    const normPubYear = normalizeHebrewText(book.pub_year || "");
    const normEdition = normalizeHebrewText(book.edition || "");
    const normNotes = normalizeHebrewText(book.notes);
    const parsedTags = (book.tags || []).map((t) => normalizeHebrewText(String(t))).filter(Boolean);

    const combinedText = [
      normTitle,
      normSetName,
      normAuthor,
      normVolume,
      normPublisher,
      normPubYear,
      normEdition,
      normCategory,
      parsedTags.join(" "),
      normNotes,
      normalizeHebrewText(book.normalized_search || ""),
    ].join(" ");
    const combinedWords = Array.from(new Set(combinedText.split(" ").filter(Boolean)));
    const combinedSkeletons = combinedWords.map(skeletonHebrew);

    let totalScore = 0;
    let matchedTokens = 0;
    let hint = "";

    if (normTitle.includes(normQuery)) {
      totalScore += 300;
      hint = "שם ספר";
    } else if (normSetName && normSetName.includes(normQuery)) {
      totalScore += 270;
      hint = "שם סט";
    } else if (normAuthor.includes(normQuery)) {
      totalScore += 240;
      hint = "מחבר";
    } else if (fullPhraseSynonyms.some((syn) => combinedText.includes(syn))) {
      totalScore += 220;
      hint = "כינוי / ר״ת תורניים";
    }

    for (const token of queryTokens) {
      const tokenSyns = SYNONYM_MAP.get(token) || [];
      const tokenSkel = skeletonHebrew(token);
      if (normTitle.includes(token)) {
        totalScore += 100;
        matchedTokens++;
        if (!hint) hint = "שם ספר";
      } else if (normSetName && normSetName.includes(token)) {
        totalScore += 90;
        matchedTokens++;
        if (!hint) hint = "שם סט";
      } else if (
        normAuthor.includes(token) ||
        normCategory.includes(token) ||
        normVolume.includes(token) ||
        normPublisher.includes(token) ||
        normPubYear.includes(token) ||
        normEdition.includes(token)
      ) {
        totalScore += 80;
        matchedTokens++;
        if (!hint) hint = "פרטי ספר";
      } else if (parsedTags.some((t) => t.includes(token))) {
        totalScore += 75;
        matchedTokens++;
        if (!hint) hint = "תגיות נושא";
      } else if (tokenSyns.some((syn) => combinedText.includes(syn))) {
        totalScore += 70;
        matchedTokens++;
        if (!hint) hint = "כינוי / ר״ת תורניים";
      } else if (normNotes.includes(token)) {
        totalScore += 55;
        matchedTokens++;
        if (!hint) hint = "הערות";
      } else if (
        tokenSkel.length >= 2 &&
        combinedSkeletons.some((sk) => sk === tokenSkel || (sk.length >= 3 && tokenSkel.length >= 3 && sk.includes(tokenSkel)))
      ) {
        totalScore += 50;
        matchedTokens++;
        if (!hint) hint = "כתיב מלא/חסר";
      } else if (token.length >= 3) {
        const maxDist = token.length >= 6 ? 2 : 1;
        let bestDist = 99;
        for (const w of combinedWords) {
          if (w.length < 3) continue;
          const d = damerauLevenshtein(token, w);
          if (d < bestDist) bestDist = d;
          if (bestDist === 1) break;
        }
        if (bestDist <= maxDist) {
          totalScore += bestDist === 1 ? 40 : 25;
          matchedTokens++;
          if (!hint) hint = "התאמה קרובה";
        }
      }
    }

    if (matchedTokens === queryTokens.length || totalScore >= 220) {
      results.push({ book, score: totalScore, matchHint: hint });
    }
  }

  results.sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title, "he"));
  return results;
}

const GEMATRIYA_MAP: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50,
  ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90, ק: 100, ר: 200, ש: 300, ת: 400,
};

export function hebrewGematriya(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/["'״׳]/g, "").trim();
  let sum = 0;
  for (const ch of clean) {
    if (GEMATRIYA_MAP[ch]) sum += GEMATRIYA_MAP[ch];
    else return 0;
  }
  return sum;
}

export function torahNaturalVolumeRank(val: unknown): number {
  if (!val) return 9999;
  const s = String(val).trim();
  if (!s) return 9999;
  const numMatch = s.match(/\d+/);
  if (numMatch) return parseInt(numMatch[0], 10);
  const tokenMatch = s.replace(/^(חלק|כרך|ספר|ח['"״׳]|כ['"״׳])\s*/i, "").trim();
  const firstWord = tokenMatch.split(/[\s\-–—]/)[0];
  const g = hebrewGematriya(firstWord);
  if (g > 0) return g;
  return 9999;
}

export function torahNaturalVolumeSort(a: unknown, b: unknown): number {
  const ra = torahNaturalVolumeRank(a);
  const rb = torahNaturalVolumeRank(b);
  if (ra !== rb) return ra - rb;
  return String(a || "").localeCompare(String(b || ""), "he");
}

export interface MobileSetVolumeGroup {
  volumeLabel: string;
  books: BookDoc[];
  totalCopies: number;
  availableCount: number;
  loanedCount: number;
  otherCount: number;
  locationSummary: string;
}

export function groupMobileSetVolumes(books: BookDoc[]): MobileSetVolumeGroup[] {
  const map = new Map<string, BookDoc[]>();
  for (const b of books) {
    const key = (b.volume || "").trim() || "ללא ציון כרך";
    const arr = map.get(key) || [];
    arr.push(b);
    map.set(key, arr);
  }
  const groups: MobileSetVolumeGroup[] = [];
  for (const [volumeLabel, list] of map.entries()) {
    const availableCount = list.filter((x) => x.status === "available").length;
    const loanedCount = list.filter((x) => x.status === "loaned").length;
    const otherCount = list.length - availableCount - loanedCount;
    const locs = Array.from(
      new Set(
        list
          .filter((x) => x.cabinet_code)
          .map((x) => `ארון ${x.cabinet_code}${x.shelf_number ? ` מדף ${x.shelf_number}` : ""}`)
      )
    );
    groups.push({
      volumeLabel,
      books: list,
      totalCopies: list.length,
      availableCount,
      loanedCount,
      otherCount,
      locationSummary: locs.length > 0 ? locs.join(" / ") : "לא שויך",
    });
  }
  groups.sort((a, b) => torahNaturalVolumeSort(a.volumeLabel, b.volumeLabel));
  return groups;
}
