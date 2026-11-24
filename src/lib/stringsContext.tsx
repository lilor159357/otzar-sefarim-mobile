import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { STRINGS_DICTIONARY_VERSION, type StringKey } from "../../shared/strings/dictionary.ts";
import {
  createStringsTranslator,
  getDefaultStringsMap,
  mergeStringsWithOverrides,
  type FlatStringsMap,
  type StringOverrideRecord,
  type StringsTranslateFn,
} from "../../shared/strings/engine.ts";

const MOBILE_CACHE_KEY = "otzar_mobile_strings_cache_v1";

interface MobileStringsContextValue {
  version: number;
  t: StringsTranslateFn;
  resolved: FlatStringsMap;
  defaults: FlatStringsMap;
  overrides: Record<string, string>;
  remoteRecords: Record<string, StringOverrideRecord>;
  applyRemoteOverrides: (remote: Record<string, StringOverrideRecord | string>) => void;
  resetCachedOverrides: () => void;
}

function readCachedMobileOverrides(): Record<string, StringOverrideRecord> {
  try {
    const raw = window.localStorage.getItem(MOBILE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const normalized: Record<string, StringOverrideRecord> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") normalized[k] = { value: v };
        else if (v && typeof v === "object" && "value" in v) {
          normalized[k] = v as StringOverrideRecord;
        }
      }
      return normalized;
    }
  } catch {}
  return {};
}

function writeCachedMobileOverrides(records: Record<string, StringOverrideRecord>): void {
  try {
    window.localStorage.setItem(MOBILE_CACHE_KEY, JSON.stringify(records));
  } catch {}
}

const initialRemote = typeof window !== "undefined" ? readCachedMobileOverrides() : {};
const initialMerged = mergeStringsWithOverrides(initialRemote);
const defaultTranslate = createStringsTranslator(() => initialMerged.resolved);

const MobileStringsContext = createContext<MobileStringsContextValue>({
  version: STRINGS_DICTIONARY_VERSION,
  t: defaultTranslate,
  resolved: initialMerged.resolved,
  defaults: getDefaultStringsMap(),
  overrides: initialMerged.appliedOverrides,
  remoteRecords: initialRemote,
  applyRemoteOverrides: () => {},
  resetCachedOverrides: () => {},
});

export function StringsProvider({ children }: { children: React.ReactNode }) {
  const [remoteRecords, setRemoteRecords] = useState<Record<string, StringOverrideRecord>>(
    () => initialRemote
  );
  const [resolved, setResolved] = useState<FlatStringsMap>(() => initialMerged.resolved);
  const [overrides, setOverrides] = useState<Record<string, string>>(
    () => initialMerged.appliedOverrides
  );

  const resolvedRef = useRef<FlatStringsMap>(resolved);
  resolvedRef.current = resolved;

  const applyRemoteOverrides = useCallback(
    (remote: Record<string, StringOverrideRecord | string>) => {
      const normalized: Record<string, StringOverrideRecord> = {};
      for (const [k, v] of Object.entries(remote || {})) {
        if (typeof v === "string") {
          normalized[k] = { value: v };
        } else if (v && typeof v === "object" && typeof v.value === "string") {
          normalized[k] = v;
        }
      }
      const merged = mergeStringsWithOverrides(normalized);
      setRemoteRecords(normalized);
      setResolved(merged.resolved);
      setOverrides(merged.appliedOverrides);
      writeCachedMobileOverrides(normalized);
    },
    []
  );

  const resetCachedOverrides = useCallback(() => {
    const empty: Record<string, StringOverrideRecord> = {};
    const merged = mergeStringsWithOverrides(empty);
    setRemoteRecords(empty);
    setResolved(merged.resolved);
    setOverrides({});
    writeCachedMobileOverrides(empty);
  }, []);

  const t = useMemo<StringsTranslateFn>(
    () => createStringsTranslator(() => resolvedRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolved]
  );

  const defaults = useMemo(() => getDefaultStringsMap(), []);

  const value = useMemo<MobileStringsContextValue>(
    () => ({
      version: STRINGS_DICTIONARY_VERSION,
      t,
      resolved,
      defaults,
      overrides,
      remoteRecords,
      applyRemoteOverrides,
      resetCachedOverrides,
    }),
    [t, resolved, defaults, overrides, remoteRecords, applyRemoteOverrides, resetCachedOverrides]
  );

  return (
    <MobileStringsContext.Provider value={value}>
      {children}
    </MobileStringsContext.Provider>
  );
}

export function useStrings(): MobileStringsContextValue {
  return useContext(MobileStringsContext);
}

export type { StringKey };