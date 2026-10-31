import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount anything a component test rendered so tests stay independent.
afterEach(() => {
  cleanup();
});
