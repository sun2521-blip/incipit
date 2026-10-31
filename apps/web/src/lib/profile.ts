import type { ApiProfile, TaskType } from "@/lib/api";

export const TASK_TYPES: TaskType[] = [
  "Bug",
  "Feature",
  "Documentation",
  "UI / UX",
  "Testing",
];

/** What is saved in the browser. Topics stay as typed so editing feels natural. */
export type StoredProfile = {
  topicsText: string;
  taskTypes: TaskType[];
};

export const EMPTY_PROFILE: StoredProfile = { topicsText: "", taskTypes: [] };

const MAX_TOPICS = 10;
const MAX_TOPIC_LENGTH = 40;
export const MAX_TOPICS_TEXT = 300;

/** "API, testing ,api" -> ["API", "testing"]: trimmed, de-duplicated, capped. */
export function parseTopics(text: string): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];

  for (const part of text.split(",")) {
    const topic = part.trim().slice(0, MAX_TOPIC_LENGTH);
    const key = topic.toLowerCase();

    if (!topic || seen.has(key)) continue;

    seen.add(key);
    topics.push(topic);

    if (topics.length === MAX_TOPICS) break;
  }

  return topics;
}

export function toApiProfile(profile: StoredProfile): ApiProfile {
  return {
    topics: parseTopics(profile.topicsText),
    task_types: profile.taskTypes,
  };
}

export function isProfileEmpty(profile: StoredProfile): boolean {
  const api = toApiProfile(profile);
  return api.topics.length === 0 && api.task_types.length === 0;
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

    const { topicsText, taskTypes } = data as Record<string, unknown>;

    return {
      topicsText:
        typeof topicsText === "string"
          ? topicsText.slice(0, MAX_TOPICS_TEXT)
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
