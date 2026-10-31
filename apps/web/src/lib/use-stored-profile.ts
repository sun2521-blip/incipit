import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parseStoredProfile, type StoredProfile } from "@/lib/profile";

const STORAGE_KEY = "incipit.profile.v1";
const CHANGE_EVENT = "incipit:profile-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return ""; // storage blocked (private mode, policy)
  }
}

// The server has no localStorage. React uses this during hydration, then
// switches to the real value, so the two never disagree.
function getServerSnapshot(): string {
  return "";
}

export function useStoredProfile(): [
  StoredProfile,
  (next: StoredProfile) => void,
] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const profile = useMemo(() => parseStoredProfile(raw), [raw]);

  const save = useCallback((next: StoredProfile) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not saved, but the page keeps working.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [profile, save];
}
