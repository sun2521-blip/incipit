// The same rules as the API, so a bad address never becomes a request.
// "." and ".." are refused: browsers and HTTP clients collapse them in paths.
const OWNER = /^[A-Za-z0-9-]{1,39}$/;
const REPO = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;
const NUMBER = /^[1-9]\d{0,9}$/;
const MAX_NUMBER = 2 ** 31 - 1;

export type IssueRoute = { owner: string; repo: string; number: number };

/** The route params of /issues/[owner]/[repo]/[number], or null if invalid. */
export function parseIssueRoute(
  owner: string,
  repo: string,
  number: string,
): IssueRoute | null {
  if (!OWNER.test(owner) || !REPO.test(repo) || !NUMBER.test(number)) {
    return null;
  }

  const value = Number(number);
  return value <= MAX_NUMBER ? { owner, repo, number: value } : null;
}

/** "owner/name" and 42 -> "/issues/owner/name/42", or null if they are invalid. */
export function dossierPath(repository: string, number: number): string | null {
  const [owner = "", repo = "", ...rest] = repository.split("/");

  if (rest.length > 0 || !parseIssueRoute(owner, repo, String(number))) {
    return null;
  }

  return `/issues/${owner}/${repo}/${number}`;
}
