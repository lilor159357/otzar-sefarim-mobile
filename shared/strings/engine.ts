import {
  DEFAULT_STRINGS,
  type ParamArgs,
  type StringKey,
  type StringsDictionary,
} from "./dictionary.ts";

export type FlatStringsMap = Record<StringKey, string>;

export interface StringOverrideRecord {
  value: string;
  defaultValueSnapshot?: string;
  updatedAt?: string;
  promoted_desktop?: boolean;
  promoted_mobile?: boolean;
}

export interface OverrideRejectedItem {
  key: string;
  reason: string;
}

export interface MergeStringsResult {
  resolved: FlatStringsMap;
  appliedOverrides: Record<string, string>;
  rejected: OverrideRejectedItem[];
}

const PLACEHOLDER_REGEX = /\{([a-zA-Z0-9_]+)\}/g;
const UNSAFE_CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function flattenDictionaryNode(
  node: Record<string, unknown>,
  prefix = "",
  out: Record<string, string> = {}
): Record<string, string> {
  for (const [k, v] of Object.entries(node)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out[fullKey] = v;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      flattenDictionaryNode(v as Record<string, unknown>, fullKey, out);
    }
  }
  return out;
}

const BASE_FLAT_STRINGS = Object.freeze(
  flattenDictionaryNode(DEFAULT_STRINGS as unknown as Record<string, unknown>)
) as FlatStringsMap;

export const ALL_STRING_KEYS = Object.freeze(
  Object.keys(BASE_FLAT_STRINGS)
) as readonly StringKey[];

export function getDefaultStringsMap(): FlatStringsMap {
  return { ...BASE_FLAT_STRINGS };
}

export function getDefaultString(key: StringKey): string {
  return BASE_FLAT_STRINGS[key];
}

export function isValidStringKey(key: string): key is StringKey {
  return Object.prototype.hasOwnProperty.call(BASE_FLAT_STRINGS, key);
}

export function extractPlaceholders(template: string): string[] {
  const found = new Set<string>();
  const matches = template.matchAll(PLACEHOLDER_REGEX);
  for (const match of matches) {
    if (match[1]) found.add(match[1]);
  }
  return Array.from(found);
}

/**
 * ניקוי בטוח של מחרוזת תוך שמירה מלאה על גרשיים עבריים (׳ ״ " ')
 * והסרה של תווי בקרה מסוכנים.
 */
export function sanitizeStringValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(UNSAFE_CONTROL_CHARS_REGEX, "").trim();
  if (!cleaned) return null;
  if (cleaned.length > 1000) {
    return cleaned.slice(0, 1000);
  }
  return cleaned;
}

/**
 * בדיקה שסוגריים מסולסלים מאוזנים ואינם מקוננים בצורה שבורה.
 */
export function hasBalancedBraces(template: string): boolean {
  let depth = 0;
  for (let i = 0; i < template.length; i++) {
    const ch = template[i];
    if (ch === "{") {
      if (depth > 0) return false;
      depth++;
    } else if (ch === "}") {
      if (depth === 0) return false;
      depth--;
    }
  }
  return depth === 0;
}

export function validateOverrideEntry(
  key: string,
  rawValue: unknown
): { valid: true; value: string } | { valid: false; reason: string } {
  if (!isValidStringKey(key)) {
    return { valid: false, reason: "unknown_key" };
  }
  const sanitized = sanitizeStringValue(rawValue);
  if (sanitized === null) {
    return { valid: false, reason: "empty_or_non_string" };
  }
  if (!hasBalancedBraces(sanitized)) {
    return { valid: false, reason: "unbalanced_braces" };
  }
  const baseTemplate = BASE_FLAT_STRINGS[key];
  const requiredParams = extractPlaceholders(baseTemplate);
  const providedParams = new Set(extractPlaceholders(sanitized));
  for (const reqParam of requiredParams) {
    if (!providedParams.has(reqParam)) {
      return { valid: false, reason: `missing_param:${reqParam}` };
    }
  }
  return { valid: true, value: sanitized };
}

/**
 * החלפת פרמטרים בתוך תבנית עם הגנה מלאה מפני undefined/null
 * ומפני תווי החלפה מיוחדים של Regex (כגון $& או $1).
 */
export function formatTemplate(
  template: string,
  params?: Record<string, string | number | boolean | null | undefined>
): string {
  if (!template) return "";
  return template.replace(PLACEHOLDER_REGEX, (_full, name: string) => {
    if (!params || !Object.prototype.hasOwnProperty.call(params, name)) {
      return "";
    }
    const rawVal = params[name];
    if (rawVal === undefined || rawVal === null) {
      return "";
    }
    return String(rawVal);
  });
}

/**
 * הברחה בטוחה למחרוזת חד-גרשית ב-PowerShell ('...' -> '')
 */
export function escapePowerShellSingleQuoted(value: string): string {
  const safe = value.replace(UNSAFE_CONTROL_CHARS_REGEX, " ").replace(/[\r\n]+/g, " ");
  return safe.replace(/'/g, "''");
}

/**
 * הברחה בטוחה להזרקה לתוך תגיות XAML / XML של חלון העדכון הממותג (Splash)
 */
export function escapeXmlText(value: string): string {
  return value
    .replace(UNSAFE_CONTROL_CHARS_REGEX, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractOverrideValue(entry: unknown): unknown {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "value" in entry) {
    return (entry as { value?: unknown }).value;
  }
  return undefined;
}

export function mergeStringsWithOverrides(
  overrides: Record<string, unknown> | null | undefined,
  extraCloudOverrides?: Record<string, unknown> | null | undefined
): MergeStringsResult {
  const resolved: FlatStringsMap = { ...BASE_FLAT_STRINGS };
  const appliedOverrides: Record<string, string> = {};
  const rejected: OverrideRejectedItem[] = [];

  const applyLayer = (layer: Record<string, unknown> | null | undefined) => {
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) return;
    for (const [key, rawEntry] of Object.entries(layer)) {
      const candidateValue = extractOverrideValue(rawEntry);
      const check = validateOverrideEntry(key, candidateValue);
      if (check.valid) {
        resolved[key as StringKey] = check.value;
        appliedOverrides[key] = check.value;
      } else {
        rejected.push({ key, reason: check.reason });
      }
    }
  };

  // סדר עדיפויות: בסיס קשיח <- מטמון/ענן <- דריסה מקומית מפורשת
  applyLayer(extraCloudOverrides);
  applyLayer(overrides);

  return { resolved, appliedOverrides, rejected };
}

export type StringsTranslateFn = <K extends StringKey>(
  key: K,
  ...args: ParamArgs<K>
) => string;

export function createStringsTranslator(
  getMap: () => FlatStringsMap
): StringsTranslateFn {
  return <K extends StringKey>(key: K, ...args: ParamArgs<K>): string => {
    const map = getMap();
    const rawTemplate =
      (map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined) ??
      BASE_FLAT_STRINGS[key] ??
      key;
    const params = (args[0] ?? undefined) as
      | Record<string, string | number | boolean | null | undefined>
      | undefined;
    return formatTemplate(rawTemplate, params);
  };
}

export const fallbackT: StringsTranslateFn = createStringsTranslator(
  () => BASE_FLAT_STRINGS
);

export type { StringsDictionary };