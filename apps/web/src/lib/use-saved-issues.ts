import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ApiIssue } from "@/lib/schemas";
import {
  addSaved,
  applyChecks,
  parseSaved,
  removeSaved,
  snapshotOf,
  type CheckOutcome,
  type SavedIssue,
} from "@/lib/saved";

const STORAGE_KEY = "incipit.saved.v1";
const CHANGE_EVENT = "incipit:saved-change";

// Used when the browser refuses storage (blocked, private mode or full), so
// saving still works until the tab closes.
let memory: string | null = null;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): string {
  if (memory !== null) return memory;

  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

// The server has no localStorage; React swaps in the real value after hydration.
function getServerSnapshot(): string {
  return "";
}

function write(next: SavedIssue[]) {
  const raw = JSON.stringify(next);

  try {
    localStorage.setItem(STORAGE_KEY, raw);
    memory = null;
  } catch {
    memory = raw;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useSavedIssues() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const saved = useMemo(() => parseSaved(raw), [raw]);
  const savedIds = useMemo(() => new Set(saved.map((item) => item.id)), [saved]);

  const toggle = useCallback((issue: ApiIssue) => {
    const current = parseSaved(getSnapshot());
    write(
      current.some((item) => item.id === issue.id)
        ? removeSaved(current, issue.id)
        : addSaved(current, snapshotOf(issue)),
    );
  }, []);

  const remove = useCallback((id: number) => {
    write(removeSaved(parseSaved(getSnapshot()), id));
  }, []);

  // Read the list again first: it may have changed in another tab meanwhile.
  const recordChecks = useCallback((outcomes: Map<number, CheckOutcome>) => {
    write(applyChecks(parseSaved(getSnapshot()), outcomes));
  }, []);

  return { saved, savedIds, toggle, remove, recordChecks };
}
