import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  BookDoc,
  BorrowerDoc,
  CabinetDoc,
  LibraryMetaDoc,
  LoanDoc,
  MobileConnectionConfig,
  RelaySentItem,
  SyncSnapshot,
} from "../types.ts";

const CONFIG_STORAGE_KEY = "otzar_mobile_conn_v1";
const CACHE_STORAGE_KEY = "otzar_mobile_cache_v1";
const DEVICE_ID_KEY = "otzar_mobile_device_id";
const RELAY_HISTORY_KEY = "otzar_mobile_relay_history_v1";

export interface MobileLibraryCache {
  cabinets: Record<string, CabinetDoc>;
  books: Record<string, BookDoc>;
  borrowers: Record<string, BorrowerDoc>;
  loans: Record<string, LoanDoc>;
  meta: LibraryMetaDoc;
  cursors: {
    cabinet: string;
    borrower: string;
    book: string;
    loan: string;
  };
  lastSyncAt: string | null;
}

function defaultCache(): MobileLibraryCache {
  return {
    cabinets: {},
    books: {},
    borrowers: {},
    loans: {},
    meta: { library_name: "אוצר ספרים", default_loan_days: 14 },
    cursors: { cabinet: "", borrower: "", book: "", loan: "" },
    lastSyncAt: null,
  };
}

export function getOrCreateMobileDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = `android-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `android-${Date.now().toString(36)}`;
  }
}

export function loadSavedConnectionConfig(): MobileConnectionConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MobileConnectionConfig;
    if (!parsed?.firebaseConfig?.projectId || !parsed?.email || !parsed?.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConnectionConfig(cfg: MobileConnectionConfig): void {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
}

export function clearSavedConnectionConfig(): void {
  localStorage.removeItem(CONFIG_STORAGE_KEY);
}

export function loadMobileCache(): MobileLibraryCache {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return defaultCache();
    const parsed = JSON.parse(raw) as Partial<MobileLibraryCache>;
    return {
      cabinets: parsed.cabinets || {},
      books: parsed.books || {},
      borrowers: parsed.borrowers || {},
      loans: parsed.loans || {},
      meta: parsed.meta || { library_name: "אוצר ספרים", default_loan_days: 14 },
      cursors: parsed.cursors || { cabinet: "", borrower: "", book: "", loan: "" },
      lastSyncAt: parsed.lastSyncAt || null,
    };
  } catch {
    return defaultCache();
  }
}

export function saveMobileCache(cache: MobileLibraryCache): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota overflow if library grows huge
  }
}

export function loadRelayHistory(): RelaySentItem[] {
  try {
    const raw = localStorage.getItem(RELAY_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRelayHistory(items: RelaySentItem[]): void {
  try {
    localStorage.setItem(RELAY_HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
  } catch {}
}

export function formatFirebaseErrorHe(err: unknown): string {
  const code = String((err as { code?: string })?.code || "");
  const msg = String((err as { message?: string })?.message || err || "");
  if (code.includes("wrong-password") || code.includes("invalid-credential")) {
    return "אימייל או סיסמת הניהול ב-Firebase שגויים";
  }
  if (code.includes("user-not-found")) {
    return "משתמש הניהול לא נמצא ב-Firebase Auth";
  }
  if (code.includes("permission-denied")) {
    return "שגיאת הרשאות Firestore — בדוק את חוקי האבטחה והאימות";
  }
  if (code.includes("unavailable") || msg.toLowerCase().includes("network") || msg.toLowerCase().includes("offline")) {
    return "אין חיבור רשת זמין — המערכת פועלת על המטמון המקומי";
  }
  return msg || "שגיאת תקשורת מול הענן";
}

export class MobileOtzarClient {
  private app: FirebaseApp | null = null;
  private firestore: Firestore | null = null;
  private appSeq = 0;
  private unsubscribers: Unsubscribe[] = [];
  private deviceId = getOrCreateMobileDeviceId();
  private cache: MobileLibraryCache = loadMobileCache();
  private snapshot: SyncSnapshot = {
    connected: false,
    connecting: false,
    offline: false,
    lastSyncAt: this.cache.lastSyncAt,
    error: null,
    deviceId: this.deviceId,
    projectId: null,
  };
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  public getSnapshot(): SyncSnapshot {
    return { ...this.snapshot };
  }

  public getData() {
    const cabinets = Object.values(this.cache.cabinets)
      .filter((c) => !c.deleted_at)
      .sort((a, b) => a.code.localeCompare(b.code, "he"));
    const books = Object.values(this.cache.books)
      .filter((b) => !b.deleted_at)
      .sort((a, b) => a.title.localeCompare(b.title, "he"));
    const borrowers = Object.values(this.cache.borrowers)
      .filter((br) => !br.deleted_at)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "he"));
    const loans = Object.values(this.cache.loans)
      .filter((l) => !l.deleted_at)
      .sort((a, b) => (b.loan_date || "").localeCompare(a.loan_date || ""));
    return {
      cabinets,
      books,
      borrowers,
      loans,
      meta: this.cache.meta,
    };
  }

  public async disconnect(): Promise<void> {
    for (const u of this.unsubscribers) {
      try {
        u();
      } catch {}
    }
    this.unsubscribers = [];
    this.firestore = null;
    if (this.app) {
      try {
        await deleteApp(this.app);
      } catch {}
      this.app = null;
    }
    this.snapshot.connected = false;
    this.snapshot.connecting = false;
    this.onChange();
  }

  public clearCache(): void {
    this.cache = defaultCache();
    localStorage.removeItem(CACHE_STORAGE_KEY);
    this.snapshot.lastSyncAt = null;
    this.onChange();
  }

  public async connect(cfg: MobileConnectionConfig): Promise<void> {
    await this.disconnect();
    this.snapshot.connecting = true;
    this.snapshot.error = null;
    this.snapshot.projectId = cfg.firebaseConfig.projectId;
    this.onChange();

    try {
      const app = initializeApp(cfg.firebaseConfig, `otzar-mobile-${++this.appSeq}`);
      const auth = getAuth(app);
      const fsClient = initializeFirestore(app, { experimentalForceLongPolling: true });
      await signInWithEmailAndPassword(auth, cfg.email.trim(), cfg.password);

      this.app = app;
      this.firestore = fsClient;
      this.snapshot.connected = true;
      this.snapshot.connecting = false;
      this.snapshot.offline = false;
      this.onChange();

      await this.pullAllDeltas();
      this.startListeners();
    } catch (err) {
      this.snapshot.connected = false;
      this.snapshot.connecting = false;
      this.snapshot.offline = !navigator.onLine;
      this.snapshot.error = formatFirebaseErrorHe(err);
      this.onChange();
      throw new Error(this.snapshot.error);
    }
  }

  public async syncNow(): Promise<void> {
    if (!this.firestore) return;
    await this.pullAllDeltas();
  }

  private applyDoc(entity: "cabinet" | "borrower" | "book" | "loan", id: string, raw: Record<string, unknown>) {
    const syncId = String(raw.sync_id || id);
    const updatedAt = String(raw.updated_at || "");
    const deletedAt = raw.deleted_at ? String(raw.deleted_at) : null;

    if (entity === "cabinet") {
      this.cache.cabinets[syncId] = {
        sync_id: syncId,
        code: String(raw.code || ""),
        main_subject: String(raw.main_subject || ""),
        shelves_count: Number(raw.shelves_count) || 5,
        x: Number(raw.x) || 40,
        y: Number(raw.y) || 40,
        width: Number(raw.width) || 150,
        height: Number(raw.height) || 64,
        rotation: Number(raw.rotation) || 0,
        updated_at: updatedAt,
        deleted_at: deletedAt,
      };
    } else if (entity === "borrower") {
      this.cache.borrowers[syncId] = {
        sync_id: syncId,
        full_name: String(raw.full_name || ""),
        shiur_group: String(raw.shiur_group || ""),
        phone: String(raw.phone || ""),
        notes: String(raw.notes || ""),
        updated_at: updatedAt,
        deleted_at: deletedAt,
      };
    } else if (entity === "book") {
      const tags = Array.isArray(raw.tags) ? raw.tags.map((t) => String(t)) : [];
      this.cache.books[syncId] = {
        sync_id: syncId,
        barcode: String(raw.barcode || ""),
        barcode_status: String(raw.barcode_status || "assigned"),
        title: String(raw.title || ""),
        author: String(raw.author || ""),
        volume: String(raw.volume || ""),
        publisher: String(raw.publisher || ""),
        pub_year: String(raw.pub_year || ""),
        edition: String(raw.edition || ""),
        category: String(raw.category || ""),
        tags,
        cabinet_sync_id: raw.cabinet_sync_id ? String(raw.cabinet_sync_id) : null,
        cabinet_code: raw.cabinet_code ? String(raw.cabinet_code) : null,
        shelf_number: raw.shelf_number != null ? Number(raw.shelf_number) : null,
        notes: String(raw.notes || ""),
        status: String(raw.status || "available"),
        updated_at: updatedAt,
        deleted_at: deletedAt,
      };
    } else if (entity === "loan") {
      this.cache.loans[syncId] = {
        sync_id: syncId,
        book_sync_id: raw.book_sync_id ? String(raw.book_sync_id) : null,
        book_barcode: String(raw.book_barcode || ""),
        borrower_sync_id: raw.borrower_sync_id ? String(raw.borrower_sync_id) : null,
        loan_date: String(raw.loan_date || ""),
        due_date: String(raw.due_date || ""),
        return_date: raw.return_date ? String(raw.return_date) : null,
        updated_at: updatedAt,
        deleted_at: deletedAt,
      };
    }
  }

  private async pullAllDeltas(): Promise<void> {
    if (!this.firestore) return;
    const fsClient = this.firestore;

    try {
      const metaSnap = await getDoc(doc(fsClient, "library_meta", "settings"));
      if (metaSnap.exists()) {
        const m = metaSnap.data();
        this.cache.meta = {
          library_name: String(m.library_name || this.cache.meta.library_name || "אוצר ספרים"),
          default_loan_days: Number(m.default_loan_days) || 14,
          map_entrance: m.map_entrance || this.cache.meta.map_entrance,
          updated_at: String(m.updated_at || ""),
        };
      }
    } catch {}

    const mapCols: Array<{ col: string; entity: "cabinet" | "borrower" | "book" | "loan" }> = [
      { col: "cabinets", entity: "cabinet" },
      { col: "borrowers", entity: "borrower" },
      { col: "books", entity: "book" },
      { col: "loans", entity: "loan" },
    ];

    for (const { col, entity } of mapCols) {
      let cursor = this.cache.cursors[entity] || "";
      for (let page = 0; page < 25; page++) {
        const q = cursor
          ? query(collection(fsClient, col), where("updated_at", ">", cursor), orderBy("updated_at", "asc"), limit(200))
          : query(collection(fsClient, col), orderBy("updated_at", "asc"), limit(200));
        const snap = await getDocs(q);
        if (snap.empty) break;
        for (const d of snap.docs) {
          const data = d.data();
          const u = String(data.updated_at || "");
          if (u && u > cursor) cursor = u;
          this.applyDoc(entity, d.id, data);
        }
        this.cache.cursors[entity] = cursor;
        if (snap.size < 200) break;
      }
    }

    const nowIso = new Date().toISOString();
    this.cache.lastSyncAt = nowIso;
    this.snapshot.lastSyncAt = nowIso;
    this.snapshot.error = null;
    saveMobileCache(this.cache);
    this.onChange();
  }

  private startListeners(): void {
    if (!this.firestore) return;
    const fsClient = this.firestore;

    const entities: Array<{ col: string; entity: "cabinet" | "borrower" | "book" | "loan" }> = [
      { col: "cabinets", entity: "cabinet" },
      { col: "borrowers", entity: "borrower" },
      { col: "books", entity: "book" },
      { col: "loans", entity: "loan" },
    ];

    for (const { col, entity } of entities) {
      const cursor = this.cache.cursors[entity] || "";
      const q = cursor
        ? query(collection(fsClient, col), where("updated_at", ">", cursor), orderBy("updated_at", "asc"), limit(100))
        : query(collection(fsClient, col), orderBy("updated_at", "asc"), limit(100));
      let first = true;
      const unsub = onSnapshot(q, (snap) => {
        if (first) {
          first = false;
          return;
        }
        const changes = snap.docChanges().filter((c) => c.type === "added" || c.type === "modified");
        if (changes.length === 0) return;
        let maxU = this.cache.cursors[entity] || "";
        for (const ch of changes) {
          const data = ch.doc.data();
          const u = String(data.updated_at || "");
          if (u && u > maxU) maxU = u;
          this.applyDoc(entity, ch.doc.id, data);
        }
        this.cache.cursors[entity] = maxU;
        const nowIso = new Date().toISOString();
        this.cache.lastSyncAt = nowIso;
        this.snapshot.lastSyncAt = nowIso;
        saveMobileCache(this.cache);
        this.onChange();
      });
      this.unsubscribers.push(unsub);
    }
  }

  public async sendRelayPhotos(params: {
    mainBase64: string;
    extraBase64s: string[];
    cabinetSyncId: string | null;
    cabinetCode: string | null;
    shelfNumber: number | null;
    setBatchId?: string | null;
    isShelfSet?: boolean;
    presetSetName?: string | null;
    onPickedUp?: (relayId: string) => void;
  }): Promise<string> {
    if (!this.firestore) {
      throw new Error("יש להתחבר קודם ל-Firebase בלשונית 'חיבור'");
    }
    const relayId = `mob-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();

    await setDoc(doc(this.firestore, "ai_relay_queue", relayId), {
      relay_id: relayId,
      image_base64: params.mainBase64,
      extra_images_base64: params.extraBase64s.slice(0, 3),
      mime_type: "image/jpeg",
      default_cabinet_sync_id: params.cabinetSyncId,
      default_cabinet_code: params.cabinetCode,
      default_shelf_number: params.shelfNumber,
      set_batch_id: params.setBatchId || null,
      is_shelf_set: Boolean(params.isShelfSet),
      preset_set_name: params.presetSetName || "",
      created_at: nowIso,
      device_id: this.deviceId,
    });

    if (params.onPickedUp) {
      let seenOnce = false;
      const unsub = onSnapshot(doc(this.firestore, "ai_relay_queue", relayId), (snap) => {
        if (snap.exists()) {
          seenOnce = true;
        } else if (seenOnce) {
          params.onPickedUp?.(relayId);
          unsub();
        }
      });
      this.unsubscribers.push(unsub);
    }

    return relayId;
  }

  public async checkoutBooks(params: {
    books: BookDoc[];
    borrower: BorrowerDoc;
    loanDays?: number;
  }): Promise<void> {
    if (!this.firestore) {
      throw new Error("אין חיבור פעיל ל-Firebase לביצוע השאלה");
    }
    const days = params.loanDays || this.cache.meta.default_loan_days || 14;
    const now = new Date();
    const due = new Date(now.getTime() + days * 86400000);
    const nowIso = now.toISOString();
    const dueIso = due.toISOString();

    const batch = writeBatch(this.firestore);
    for (const bk of params.books) {
      const loanSyncId = `mobloan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const loanPayload: LoanDoc = {
        sync_id: loanSyncId,
        book_sync_id: bk.sync_id,
        book_barcode: bk.barcode,
        borrower_sync_id: params.borrower.sync_id,
        loan_date: nowIso,
        due_date: dueIso,
        return_date: null,
        updated_at: nowIso,
        deleted_at: null,
      };
      batch.set(doc(this.firestore, "loans", loanSyncId), {
        ...loanPayload,
        source_device: this.deviceId,
      });
      batch.set(
        doc(this.firestore, "books", bk.sync_id),
        {
          sync_id: bk.sync_id,
          status: "loaned",
          updated_at: nowIso,
          source_device: this.deviceId,
        },
        { merge: true }
      );
      this.cache.loans[loanSyncId] = loanPayload;
      if (this.cache.books[bk.sync_id]) {
        this.cache.books[bk.sync_id] = {
          ...this.cache.books[bk.sync_id],
          status: "loaned",
          updated_at: nowIso,
        };
      }
    }
    await batch.commit();
    saveMobileCache(this.cache);
    this.onChange();
  }

  public async returnLoan(loan: LoanDoc): Promise<void> {
    if (!this.firestore) {
      throw new Error("אין חיבור פעיל ל-Firebase לביצוע החזרה");
    }
    const nowIso = new Date().toISOString();
    const batch = writeBatch(this.firestore);
    batch.set(
      doc(this.firestore, "loans", loan.sync_id),
      {
        sync_id: loan.sync_id,
        return_date: nowIso,
        updated_at: nowIso,
        source_device: this.deviceId,
      },
      { merge: true }
    );
    const book =
      (loan.book_sync_id && this.cache.books[loan.book_sync_id]) ||
      Object.values(this.cache.books).find((b) => b.barcode === loan.book_barcode && !b.deleted_at);
    if (book) {
      batch.set(
        doc(this.firestore, "books", book.sync_id),
        {
          sync_id: book.sync_id,
          status: "available",
          updated_at: nowIso,
          source_device: this.deviceId,
        },
        { merge: true }
      );
      this.cache.books[book.sync_id] = {
        ...this.cache.books[book.sync_id],
        status: "available",
        updated_at: nowIso,
      };
    }
    if (this.cache.loans[loan.sync_id]) {
      this.cache.loans[loan.sync_id] = {
        ...this.cache.loans[loan.sync_id],
        return_date: nowIso,
        updated_at: nowIso,
      };
    }
    await batch.commit();
    saveMobileCache(this.cache);
    this.onChange();
  }
}
