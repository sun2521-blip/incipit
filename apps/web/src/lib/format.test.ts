import { describe, expect, it } from "vitest";
import { formatCount } from "@/lib/format";

describe("formatCount", () => {
  it.each([
    [0, "0"],
    [950, "950"],
    [999, "999"],
    [1000, "1k"],
    [1234, "1.2k"],
    [9_960, "10k"],
    [12_345, "12k"],
    [128_000, "128k"],
    [2_500_000, "2.5M"],
    [14_000_000, "14M"],
  ])("formats %d as %s", (value, expected) => {
    expect(formatCount(value)).toBe(expected);
  });
});
