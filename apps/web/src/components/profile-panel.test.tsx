// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfilePanel } from "@/components/profile-panel";
import { EMPTY_PROFILE, type StoredProfile } from "@/lib/profile";

function renderPanel(profile: StoredProfile = EMPTY_PROFILE) {
  const onChange = vi.fn();
  render(<ProfilePanel profile={profile} onChange={onChange} />);
  return onChange;
}

describe("ProfilePanel", () => {
  it("invites setup while the profile is empty", () => {
    renderPanel();

    expect(
      screen.getByText(/set it up to personalise the ranking/),
    ).toBeInTheDocument();
  });

  it("summarises languages, topics and task types", () => {
    renderPanel({
      languagesText: "Python, Go",
      topicsText: "api",
      taskTypes: ["Bug", "Testing"],
    });

    expect(
      screen.getByText(/2 languages, 1 topic, 2 task types/),
    ).toBeInTheDocument();
  });

  it("reports typed languages", () => {
    const onChange = renderPanel();

    fireEvent.change(screen.getByLabelText(/Languages you know/), {
      target: { value: "Rust" },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_PROFILE,
      languagesText: "Rust",
    });
  });

  it("reports typed topics", () => {
    const onChange = renderPanel();

    fireEvent.change(screen.getByLabelText(/Topics you care about/), {
      target: { value: "api" },
    });

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_PROFILE, topicsText: "api" });
  });

  it("toggles a task type on and off", () => {
    const onChange = renderPanel({ ...EMPTY_PROFILE, taskTypes: ["Bug"] });

    fireEvent.click(screen.getByLabelText("Testing"));
    fireEvent.click(screen.getByLabelText("Bug"));

    expect(onChange).toHaveBeenNthCalledWith(1, {
      ...EMPTY_PROFILE,
      taskTypes: ["Bug", "Testing"],
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      ...EMPTY_PROFILE,
      taskTypes: [],
    });
  });
});
