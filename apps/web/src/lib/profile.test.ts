import { describe, expect, it } from "vitest";
import {
  EMPTY_PROFILE,
  isProfileEmpty,
  MAX_LIST_TEXT,
  parseStoredProfile,
  parseList,
  toApiProfile,
} from "@/lib/profile";

describe("parseList", () => {
  it("trims, drops blanks and de-duplicates ignoring case", () => {
    expect(parseList("API, testing ,api,, ")).toEqual(["API", "testing"]);
  });

  it("returns an empty list for empty text", () => {
    expect(parseList("")).toEqual([]);
  });

  it("keeps at most 10 topics", () => {
    const text = Array.from({ length: 30 }, (_, i) => `t${i}`).join(",");

    expect(parseList(text)).toHaveLength(10);
  });

  it("cuts each topic to 40 characters", () => {
    expect(parseList("x".repeat(100))[0]).toHaveLength(40);
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
      languagesText: "",
      topicsText: "api",
      taskTypes: ["Bug", "Testing"],
    });
  });

  it("reads languages, and gives profiles saved before them none", () => {
    const withLanguages =
      '{"languagesText":"Python, Go","topicsText":"api","taskTypes":[]}';

    expect(parseStoredProfile(withLanguages).languagesText).toBe("Python, Go");
    expect(
      parseStoredProfile('{"topicsText":"api","taskTypes":[]}').languagesText,
    ).toBe("");
  });

  it("ignores fields of the wrong type", () => {
    const raw = '{"topicsText":123,"taskTypes":"Bug"}';

    expect(parseStoredProfile(raw)).toEqual({
      languagesText: "",
      topicsText: "",
      taskTypes: [],
    });
  });

  it("caps the topics text", () => {
    const raw = JSON.stringify({ topicsText: "a".repeat(5000), taskTypes: [] });

    expect(parseStoredProfile(raw).topicsText).toHaveLength(MAX_LIST_TEXT);
  });
});

describe("toApiProfile and isProfileEmpty", () => {
  it("converts the stored profile to the API shape", () => {
    expect(
      toApiProfile({
        languagesText: "Python, python, Go",
        topicsText: "api, ml",
        taskTypes: ["Bug"],
      }),
    ).toEqual({
      languages: ["Python", "Go"],
      topics: ["api", "ml"],
      task_types: ["Bug"],
    });
  });

  it("treats blank lists and no task types as empty", () => {
    expect(isProfileEmpty(EMPTY_PROFILE)).toBe(true);
    expect(
      isProfileEmpty({ languagesText: " ,", topicsText: " , ", taskTypes: [] }),
    ).toBe(true);
  });

  it("is not empty once there is a language, a topic or a task type", () => {
    expect(
      isProfileEmpty({ ...EMPTY_PROFILE, languagesText: "Rust" }),
    ).toBe(false);
    expect(isProfileEmpty({ ...EMPTY_PROFILE, topicsText: "api" })).toBe(false);
    expect(isProfileEmpty({ ...EMPTY_PROFILE, taskTypes: ["Bug"] })).toBe(false);
  });
});
