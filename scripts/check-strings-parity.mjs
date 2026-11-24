import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const mobileRoot = desktopRoot;
const siblingDesktop = path.resolve(mobileRoot, "..", "OtzarSefarim");

const mobileDictPath = path.join(mobileRoot, "shared", "strings", "dictionary.ts");
const desktopDictPath = path.join(siblingDesktop, "shared", "strings", "dictionary.ts");

if (!fs.existsSync(mobileDictPath)) {
  console.error("[check-strings-parity] Missing mobile dictionary:", mobileDictPath);
  process.exit(1);
}

if (!fs.existsSync(desktopDictPath)) {
  console.log("[check-strings-parity] Sibling desktop repo not present (e.g. cloud CI); skipping parity check.");
  process.exit(0);
}

function extractFlatEntries(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const startMarker = "export const DEFAULT_STRINGS = {";
  const endMarker = "} as const;";
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker, startIdx);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Could not locate DEFAULT_STRINGS block in ${filePath}`);
  }
  const body = src.slice(startIdx + "export const DEFAULT_STRINGS = ".length, endIdx + 1);
  // Evaluate pure object literal safely in isolated Function
  const obj = new Function(`return (${body});`)();
  const flat = {};
  const walk = (node, prefix = "") => {
    for (const [k, v] of Object.entries(node)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") {
        flat[fullKey] = v;
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        walk(v, fullKey);
      }
    }
  };
  walk(obj);
  return flat;
}

function getPlaceholders(str) {
  return Array.from(new Set([...str.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]))).sort();
}

const desktopMap = extractFlatEntries(desktopDictPath);
const mobileMap = extractFlatEntries(mobileDictPath);

const desktopKeys = new Set(Object.keys(desktopMap));
const mobileKeys = new Set(Object.keys(mobileMap));

const missingInMobile = [...desktopKeys].filter((k) => !mobileKeys.has(k));
const missingInDesktop = [...mobileKeys].filter((k) => !desktopKeys.has(k));
const paramMismatches = [];

for (const key of desktopKeys) {
  if (!mobileKeys.has(key)) continue;
  const dp = getPlaceholders(desktopMap[key]).join(",");
  const mp = getPlaceholders(mobileMap[key]).join(",");
  if (dp !== mp) {
    paramMismatches.push({ key, desktop: dp, mobile: mp });
  }
}

if (missingInMobile.length || missingInDesktop.length || paramMismatches.length) {
  console.error("[check-strings-parity] Parity mismatch detected:");
  if (missingInMobile.length) console.error("  Missing in Mobile:", missingInMobile);
  if (missingInDesktop.length) console.error("  Missing in Desktop:", missingInDesktop);
  if (paramMismatches.length) console.error("  Placeholder mismatches:", paramMismatches);
  process.exit(1);
}

console.log(
  `[check-strings-parity] OK — ${desktopKeys.size} keys & placeholders match 100% between Desktop and Mobile.`
);