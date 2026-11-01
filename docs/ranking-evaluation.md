# Ranking evaluation

The fit score's weights started as the blueprint's hypotheses. This page records how they were checked against real issues judged by a person, what was found, what changed, and what is still known to be weak.

## Method

**The pool.** 33 real, open `good first issue` issues captured on 2026-11-01 at 15:28 UTC from the same three searches the app makes: unfiltered, `language:Python` and `language:TypeScript` (15 each, duplicates removed), each with its repository's facts. The pool is frozen in [`services/api/tests/fixtures/evaluation_pool.json`](../services/api/tests/fixtures/evaluation_pool.json), so every run ranks exactly the same data.

**The ratings.** Each issue has one rating, in [`evaluation/ratings.csv`](evaluation/ratings.csv), for how good a *first contribution* it is, with a one-line reason:

| Rating | Meaning |
| --- | --- |
| good | A newcomer could start today: clear, small, unassigned, in an active project. |
| okay | Plausible, but something weakens it: vague, bigger than it looks, research rather than code, or a brand-new repository with nobody to review. |
| poor | Should not be recommended: assigned, empty or only a link, a crowded bounty, or not a beginner's task. |

Result: 10 good, 15 okay, 8 poor. These are a first pass made on 2026-11-01; anyone can change a rating in the CSV and re-run the report.

**Fit is not rated.** Whether an issue suits a profile comes from verified facts: with languages set, the repository's main language must be one of them. That keeps one rating per issue valid for every profile and for any future change to the scorer.

**Profiles.** `python-docs` (Python; documentation, testing, cli; Documentation, Testing and Bug tasks), `typescript-ui` (TypeScript and JavaScript; ui, accessibility, react, css; UI / UX, Bug and Feature tasks) and `no-profile` (what a first visit sees).

**Metrics**, per profile, on the ranked pool:

- **P@5 / P@10:** the share of the top 5 or top 10 that are rated good *and* fit the profile.
- **poor@5:** how many poor issues reach the top 5.
- **mean@10:** the average rating of the top 10 (good 2, okay 1, poor 0).

Reproduce it from `services/api`:

```bash
uv run python scripts/evaluate_ranking.py report   # the table below
uv run python scripts/evaluate_ranking.py review   # every issue with its facts and ranks
uv run python scripts/evaluate_ranking.py capture  # a new pool (needs new ratings)
```

## Results

One change at a time, on the same pool and ratings:

| Profile | Metric | Baseline | + assignee rule | + busy-discussion rule |
| --- | --- | ---: | ---: | ---: |
| python-docs | P@5 | 0.20 | 0.20 | 0.20 |
| | P@10 | 0.10 | 0.10 | 0.10 |
| | poor@5 | 0 | 0 | 0 |
| | mean@10 | 1.10 | 1.10 | 1.10 |
| typescript-ui | P@5 | 0.60 | 0.60 | 0.60 |
| | P@10 | 0.50 | 0.50 | **0.60** |
| | poor@5 | 2 | 2 | **1** |
| | mean@10 | 1.30 | 1.30 | **1.50** |
| no-profile | P@5 | 0.40 | 0.40 | 0.40 |
| | P@10 | 0.30 | 0.30 | 0.30 |
| | poor@5 | 1 | 1 | 1 |
| | mean@10 | 1.10 | **1.20** | 1.20 |

Nothing got worse, and both changes moved a poor issue out of a top list.

## What was wrong, and what changed

1. **Assigned issues ranked as if they were free.** `ApexForge-cz/Pelagos-eye#62`, assigned to a named team member as an internal task, was #7 for a first visit. **Change 1:** an issue GitHub lists as assigned has its score halved. The reason, with the assignee's name, appears in "Why this score". An assignee is a verified fact; its absence is not treated as proof that nobody is working on an issue.
2. **Crowded bounty threads ranked high.** `Nexussyn/ai-growth-engine#4`, a bounty aimed at AI agents with 59 comments, was #4 for the TypeScript profile. Every issue rated good has 0 to 2 comments. **Change 2:** 10 or more comments lower the score by a quarter, 25 or more by half, again with the reason shown.

The weights themselves were not changed: no failure traced back to a weight, and moving weights on 33 issues would be fitting noise.

## Known weaknesses, not fixed

- **Clarity is not difficulty.** A long, well-structured migration task (`toasty-kj/docusaurus-plugin-pagefind#37`, rated poor) still ranks #2 for TypeScript and for a first visit, because its write-up is excellent. There is no verified fact that measures difficulty, and the blueprint warns against guessing one.
- **One repository can fill the list.** Ten near-identical research cards from one repository take 7 of the Python profile's top 10. A "repository variety" rule is the next candidate. It was not added yet because it would make a card's score depend on the other issues on screen, so the same issue could show a different score in its dossier.
- **The issue's language is not considered.** The research cards are written in Polish and still rank for an English-language profile.
- **Labels are noisy.** Task types come from labels; labels such as `research` or `detection` suggest none, and some UI issues are labelled `bug`.
- **Supply limits precision.** Only 2 of the 33 issues are both good and in Python, so the Python profile's P@5 cannot exceed 0.40 on this pool.

## Limits of this evaluation

33 issues, one snapshot, one day, one rater. With 5 issues in a top 5, one issue moves P@5 by 0.20, so the numbers show direction, not precision. The day's `good first issue` search results lean towards small, new repositories and bounty programmes, which may not be typical. Capture a fresh pool and re-rate it every few weeks; the old pool stays as a regression set.

## How it is guarded

[`services/api/tests/test_ranking_evaluation.py`](../services/api/tests/test_ranking_evaluation.py) checks, on the frozen pool:

- the exact top-10 order for each profile (golden ordering), so a ranking change is always deliberate;
- that no metric drops below the values above;
- that no assigned or crowded issue reaches any profile's top 5;
- that every issue in the pool has a rating.

When a change is intended, run the report, add a column to the table above, and only then update the test's golden orders and floors.
