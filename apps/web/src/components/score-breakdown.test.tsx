// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreBreakdown } from "@/components/score-breakdown";
import type { SignalResult } from "@/lib/api";

const breakdown: SignalResult[] = [
  {
    name: "task_match",
    score: 100,
    weight: 0.25,
    reason: "Labelled as a Bug, one of your preferred task types.",
  },
  {
    name: "maintenance",
    score: null,
    weight: 0.15,
    reason: "Repository activity is not fetched yet.",
  },
  { name: "mystery_signal", score: 40, weight: 0.1, reason: "Something new." },
];

describe("ScoreBreakdown", () => {
  it("says how many signals were counted", () => {
    render(<ScoreBreakdown breakdown={breakdown} />);

    expect(
      screen.getByText("Why this score · based on 2 of 3 signals"),
    ).toBeInTheDocument();
  });

  it("shows each signal with a readable name, score, weight and reason", () => {
    render(<ScoreBreakdown breakdown={breakdown} />);

    expect(screen.getByText("Task type")).toBeInTheDocument();
    expect(screen.getByText("100/100")).toBeInTheDocument();
    expect(screen.getByText(/weight 25%/)).toBeInTheDocument();
    expect(
      screen.getByText(/one of your preferred task types/),
    ).toBeInTheDocument();
  });

  it("marks a missing signal as not counted instead of scoring it 0", () => {
    render(<ScoreBreakdown breakdown={breakdown} />);

    expect(screen.getByText("Repository activity")).toBeInTheDocument();
    expect(screen.getByText("not counted")).toBeInTheDocument();
    expect(screen.queryByText("0/100")).not.toBeInTheDocument();
  });

  it("falls back to the raw name for a signal it does not know", () => {
    render(<ScoreBreakdown breakdown={breakdown} />);

    expect(screen.getByText("mystery_signal")).toBeInTheDocument();
  });
});
