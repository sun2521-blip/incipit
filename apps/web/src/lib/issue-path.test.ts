import { describe, expect, it } from "vitest";
import { dossierPath, parseIssueRoute } from "@/lib/issue-path";

describe("parseIssueRoute", () => {
  it("accepts a normal issue address", () => {
    expect(parseIssueRoute("pallets", "flask", "5800")).toEqual({
      owner: "pallets",
      repo: "flask",
      number: 5800,
    });
  });

  it("accepts dots, dashes and underscores where GitHub does", () => {
    expect(parseIssueRoute("some-org", "my_repo.js", "1")).not.toBeNull();
    expect(parseIssueRoute("octo", ".github", "1")).not.toBeNull();
  });

  it.each([
    ["..", "x", "1"],
    ["octo", "..", "1"],
    ["octo", ".", "1"],
    ["octo/evil", "x", "1"],
    ["octo", "x/y", "1"],
    ["octo", "x y", "1"],
    ["o".repeat(40), "x", "1"],
    ["octo", "x", "0"],
    ["octo", "x", "01"],
    ["octo", "x", "-1"],
    ["octo", "x", "1.5"],
    ["octo", "x", "abc"],
    ["octo", "x", "99999999999"],
    ["octo", "x", "2147483648"],
  ])("refuses %s/%s#%s", (owner, repo, number) => {
    expect(parseIssueRoute(owner, repo, number)).toBeNull();
  });
});

describe("dossierPath", () => {
  it("builds the dossier address", () => {
    expect(dossierPath("pallets/flask", 5800)).toBe("/issues/pallets/flask/5800");
  });

  it.each([
    ["pallets", 1],
    ["pallets/flask/extra", 1],
    ["pallets/..", 1],
    ["pallets/flask", 0],
  ])("returns null for %s #%d", (repository, number) => {
    expect(dossierPath(repository, number)).toBeNull();
  });
});
