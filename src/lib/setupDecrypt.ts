import { inflateSync } from "fflate";
import type { FirebaseWebConfig, MobileConnectionConfig } from "../types.ts";

interface SetupEnvelope {
  format: string;
  version: number;
  kdf: string;
  iterations: number;
  cipher: string;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlToBytes(b64u: string): Uint8Array {
  const norm = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? "" : "=".repeat(4 - (norm.length % 4));
  return base64ToBytes(norm + pad);
}

export function parseFirebaseConfigRaw(input: unknown): FirebaseWebConfig | null {
  let obj: Record<string, unknown> | null = null;
  if (typeof input === "object" && input !== null) {
    obj = input as Record<string, unknown>;
  } else if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      const extract = (key: string) => {
        const m = trimmed.match(new RegExp(`${key}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
        return m ? m[1].trim() : "";
      };
      const apiKey = extract("apiKey");
      const projectId = extract("projectId");
      const appId = extract("appId");
      if (apiKey && projectId && appId) {
        obj = {
          apiKey,
          authDomain: extract("authDomain") || `${projectId}.firebaseapp.com`,
          projectId,
          storageBucket: extract("storageBucket") || undefined,
          messagingSenderId: extract("messagingSenderId") || undefined,
          appId,
        };
      }
    }
  }
  if (!obj) return null;
  const apiKey = String(obj.apiKey || "").trim();
  const projectId = String(obj.projectId || "").trim();
  const appId = String(obj.appId || "").trim();
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain: String(obj.authDomain || `${projectId}.firebaseapp.com`).trim(),
    projectId,
    storageBucket: obj.storageBucket ? String(obj.storageBucket).trim() : undefined,
    messagingSenderId: obj.messagingSenderId ? String(obj.messagingSenderId).trim() : undefined,
    appId,
  };
}

export async function decryptDesktopSetupBundle(rawInput: string, passcodeRaw: string): Promise<MobileConnectionConfig> {
  const trimmed = String(rawInput || "").trim();
  const passcode = String(passcodeRaw || "").trim();
  if (!trimmed) throw new Error("יש להדביק קוד העברה או לבחור קובץ .otzar-setup");
  if (!passcode) throw new Error("יש להזין את קוד האבטחה לפענוח החבילה");

  let envelope: SetupEnvelope;
  if (trimmed.startsWith("OTZAR-SETUP:")) {
    try {
      const rawBytes = base64UrlToBytes(trimmed.slice("OTZAR-SETUP:".length).trim());
      const jsonStr = new TextDecoder().decode(inflateSync(rawBytes));
      envelope = JSON.parse(jsonStr) as SetupEnvelope;
    } catch {
      throw new Error("קוד ההעברה אינו תקין או שנגזר חלקית");
    }
  } else {
    try {
      envelope = JSON.parse(trimmed) as SetupEnvelope;
    } catch {
      throw new Error("קובץ ההעברה אינו בפורמט .otzar-setup תקין");
    }
  }

  if (!envelope || envelope.format !== "otzar-sefarim-setup" || !envelope.salt || !envelope.iv || !envelope.authTag || !envelope.ciphertext) {
    throw new Error("מבנה קובץ ההעברה אינו נתמך");
  }

  try {
    const passKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passcode),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: base64ToBytes(envelope.salt),
        iterations: Math.min(300000, Math.max(10000, Number(envelope.iterations) || 100000)),
        hash: "SHA-256",
      },
      passKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const cipherBytes = base64ToBytes(envelope.ciphertext);
    const tagBytes = base64ToBytes(envelope.authTag);
    const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
    combined.set(cipherBytes, 0);
    combined.set(tagBytes, cipherBytes.length);

    const plainBuf = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(envelope.iv),
      },
      aesKey,
      combined
    );

    const payload = JSON.parse(new TextDecoder().decode(plainBuf)) as { settings?: Record<string, string> };
    const settings = payload?.settings || {};
    const fbConfig = parseFirebaseConfigRaw(settings.firebase_config || "");
    const email = String(settings.firebase_email || "").trim();
    const password = String(settings.firebase_password || "");
    if (!fbConfig || !email || !password) {
      throw new Error("חבילת ההעברה אינה כוללת חיבור Firebase פעיל");
    }

    const themePreset =
      settings.theme_preset === "classic-blue" || settings.theme_preset === "forest-green"
        ? settings.theme_preset
        : "default";
    const themeMode = settings.theme_mode === "dark" ? "dark" : "light";

    return {
      firebaseConfig: fbConfig,
      email,
      password,
      libraryName: settings.library_name || "אוצר ספרים",
      themePreset,
      themeMode,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Firebase")) throw err;
    throw new Error("קוד האבטחה שגוי או שהחבילה פגומה");
  }
}
