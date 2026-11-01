import type { ApiProfile, TaskType } from "@/lib/api";

export const TASK_TYPES: TaskType[] = [
  "Bug",
  "Feature",
  "Documentation",
  "UI / UX",
  "Testing",
];

/**
 * What is saved in the browser. Languages and topics stay as typed so editing
 * feels natural.
 */
export type StoredProfile = {
  languagesText: string;
  topicsText: string;
  taskTypes: TaskType[];
};

export const EMPTY_PROFILE: StoredProfile = {
  languagesText: "",
  topicsText: "",
  taskTypes: [],
};

// The API accepts at most 10 entries of 40 characters each per list.
const MAX_LIST_ITEMS = 10;
const MAX_ITEM_LENGTH = 40;
export const MAX_LIST_TEXT = 300;

/** "API, testing ,api" -> ["API", "testing"]: trimmed, de-duplicated, capped. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const part of text.split(",")) {
    const item = part.trim().slice(0, MAX_ITEM_LENGTH);
    const key = item.toLowerCase();

    if (!item || seen.has(key)) continue;

    seen.add(key);
    items.push(item);

    if (items.length === MAX_LIST_ITEMS) break;
  }

  return items;
}

export function toApiProfile(profile: StoredProfile): ApiProfile {
  return {
    languages: parseList(profile.languagesText),
    topics: parseList(profile.topicsText),
    task_types: profile.taskTypes,
  };
}

export function isProfileEmpty(profile: StoredProfile): boolean {
  const api = toApiProfile(profile);
  return (
    api.languages.length === 0 &&
    api.topics.length === 0 &&
    api.task_types.length === 0
  );
}

/**
 * Read a profile back from localStorage. Anything stored there can be
 * missing, corrupted or edited by hand, so every field is checked.
 */
export function parseStoredProfile(raw: string): StoredProfile {
  if (!raw) return EMPTY_PROFILE;

  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return EMPTY_PROFILE;

    const { languagesText, topicsText, taskTypes } = data as Record<
      string,
      unknown
    >;

    return {
      // Profiles saved before languages existed simply have none.
      languagesText:
        typeof languagesText === "string"
          ? languagesText.slice(0, MAX_LIST_TEXT)
          : "",
      topicsText:
        typeof topicsText === "string"
          ? topicsText.slice(0, MAX_LIST_TEXT)
          : "",
      taskTypes: Array.isArray(taskTypes)
        ? taskTypes.filter((value): value is TaskType =>
            TASK_TYPES.includes(value as TaskType),
          )
        : [],
    };
  } catch {
    return EMPTY_PROFILE;
  }
}
