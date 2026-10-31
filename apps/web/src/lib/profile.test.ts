import { describe, expect, it } from "vitest";
import {
  EMPTY_PROFILE,
  isProfileEmpty,
  MAX_TOPICS_TEXT,
  parseStoredProfile,
  parseTopics,
  toApiProfile,
} from "@/lib/profile";

describe("parseTopics", () => {
  it("trims, drops blanks and de-duplicates ignoring case", () => {
    expect(parseTopics("API, testing ,api,, ")).toEqual(["API", "testing"]);
  });

  it("returns an empty list for empty text", () => {
    expect(parseTopics("")).toEqual([]);
  });

  it("keeps at most 10 topics", () => {
    const text = Array.from({ length: 30 }, (_, i) => `t${i}`).join(",");

    expect(parseTopics(text)).toHaveLength(10);
  });

  it("cuts each topic to 40 characters", () => {
    expect(parseTopics("x".repeat(100))[0]).toHaveLength(40);
  });
});

describe("parseStoredProfile", () => {
  it("falls back to an empty profile for missing or broken storage", () => {
    expect(parseStoredProfile("")).toBe(EMPTY_PROFILE);
    expect(parseStoredProfile("{bad")).toBe(EMPTY_PROFILE);
    expect(parseStoredProfile("null")).toBe(EMPTY_PROFILE);
    expect(parseStoredProfile("42")).toBe(EMPTY_PROFILE);
  });

  it("keeps valid task types and drops unknown ones", () => {
    const raw = '{"topicsText":"api","taskTypes":["Bug","Hacker","Testing",7]}';

    expect(parseStoredProfile(raw)).toEqual({
      topicsText: "api",
      taskTypes: ["Bug", "Testing"],
    });
  });

  it("ignores fields of the wrong type", () => {
    const raw = '{"topicsText":123,"taskTypes":"Bug"}';

    expect(parseStoredProfile(raw)).toEqual({ topicsText: "", taskTypes: [] });
  });

  it("caps the topics text", () => {
    const raw = JSON.stringify({ topicsText: "a".repeat(5000), taskTypes: [] });

    expect(parseStoredProfile(raw).topicsText).toHaveLength(MAX_TOPICS_TEXT);
  });
});

describe("toApiProfile and isProfileEmpty", () => {
  it("converts the stored profile to the API shape", () => {
    expect(toApiProfile({ topicsText: "api, ml", taskTypes: ["Bug"] })).toEqual({
      topics: ["api", "ml"],
      task_types: ["Bug"],
    });
  });

  it("treats blank topics and no task types as empty", () => {
    expect(isProfileEmpty(EMPTY_PROFILE)).toBe(true);
    expect(isProfileEmpty({ topicsText: " , ", taskTypes: [] })).toBe(true);
  });

  it("is not empty once there is a topic or a task type", () => {
    expect(isProfileEmpty({ topicsText: "api", taskTypes: [] })).toBe(false);
    expect(isProfileEmpty({ topicsText: "", taskTypes: ["Bug"] })).toBe(false);
  });
});
