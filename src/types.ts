export type TabKey = "search" | "circulation" | "relay" | "settings";

export interface MapEntrance {
  wall: "top" | "bottom" | "left" | "right";
  offset: number;
}

export interface CabinetDoc {
  sync_id: string;
  code: string;
  main_subject: string;
  shelves_count: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface BookDoc {
  sync_id: string;
  barcode: string;
  barcode_status?: string;
  title: string;
  author: string;
  volume: string;
  publisher: string;
  pub_year: string;
  edition: string;
  category: string;
  tags: string[];
  cabinet_sync_id: string | null;
  cabinet_code: string | null;
  shelf_number: number | null;
  notes: string;
  status: "available" | "loaned" | "reference" | "lost" | string;
  updated_at: string;
  deleted_at: string | null;
  normalized_search?: string;
}

export interface BorrowerDoc {
  sync_id: string;
  full_name: string;
  shiur_group: string;
  phone: string;
  notes: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LoanDoc {
  sync_id: string;
  book_sync_id: string | null;
  book_barcode: string;
  borrower_sync_id: string | null;
  loan_date: string;
  due_date: string;
  return_date: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface LibraryMetaDoc {
  library_name: string;
  default_loan_days: number;
  map_entrance?: MapEntrance;
  updated_at?: string;
}

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export interface MobileConnectionConfig {
  firebaseConfig: FirebaseWebConfig;
  email: string;
  password: string;
  libraryName?: string;
  themePreset?: "default" | "classic-blue" | "forest-green";
  themeMode?: "light" | "dark";
}

export interface RelaySentItem {
  relayId: string;
  createdAt: string;
  cabinetCode: string | null;
  shelfNumber: number | null;
  photoCount: number;
  status: "queued" | "picked_up" | "error";
  error?: string;
}

export interface SyncSnapshot {
  connected: boolean;
  connecting: boolean;
  offline: boolean;
  lastSyncAt: string | null;
  error: string | null;
  deviceId: string;
  projectId: string | null;
}
