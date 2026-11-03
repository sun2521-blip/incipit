# Ranking evaluation

The fit score is hand-written rules with hand-set weights, not a trained model. This page records how they were checked against real, rated issues, what was found, what changed, what is still known to be weak, and how much the check can actually prove (less than the table suggests; see [Limits](#limits-of-this-evaluation)).

## Method

**The pool.** 33 real, open `good first issue` issues captured on 2026-11-01 at 15:28 UTC from the same three searches the app makes: unfiltered, `language:Python` and `language:TypeScript` (15 each, duplicates removed), each with its repository's facts. The pool is frozen in [`services/api/tests/fixtures/evaluation_pool.json`](../services/api/tests/fixtures/evaluation_pool.json), so every run ranks exactly the same data.

**The ratings.** Each issue has one rating, in [`evaluation/ratings.csv`](evaluation/ratings.csv), for how good a *first contribution* it is, with a one-line reason:

| Rating | Meaning |
| --- | --- |
| good | A newcomer could start today: clear, small, unassigned, in an active project. |
| okay | Plausible, but something weakens it: vague, bigger than it looks, research rather than code, or a brand-new repository with nobody to review. |
| poor | Should not be recommended: assigned, empty or only a link, a crowded bounty, or not a beginner's task. |

Result: 10 good, 15 okay, 8 poor. **What they are:** one unreviewed first pass, made on 2026-11-01 from each issue's text and facts. They have not been rated by a person yet, so they are a consistent baseline, not ground truth. `rate` (below) is how a person replaces or checks them.

**Fit is not rated.** Whether an issue suits a profile comes from verified facts: with languages set, the repository's main language must be one of them. That keeps one rating per issue valid for every profile and for any future change to the scorer.

**Profiles.** `python-docs` (Python; documentation, testing, cli; Documentation, Testing and Bug tasks), `typescript-ui` (TypeScript and JavaScript; ui, accessibility, react, css; UI / UX, Bug and Feature tasks) and `no-profile` (what a first visit sees).

**Metrics**, per profile, on the ranked pool:

- **P@5 / P@10:** the share of the top 5 or top 10 that are rated good *and* fit the profile.
- **poor@5:** how many poor issues reach the top 5.
- **mean@10:** the average rating of the top 10 (good 2, okay 1, poor 0).

Reproduce it from `services/api`:

```bash
uv run python scripts/evaluate_ranking.py report                 # the table below
uv run python scripts/evaluate_ranking.py rate --rater your-name  # rate the pool yourself, blind
uv run python scripts/evaluate_ranking.py agree ../../docs/evaluation/ratings.csv ../../docs/evaluation/ratings-your-name.csv
uv run python scripts/evaluate_ranking.py review                 # every issue with its facts and ranks
uv run python scripts/evaluate_ranking.py capture --pool FILE --per-search 40  # a new pool
```

`rate` shows the issues one at a time in a shuffled order, with their facts and text but no scores or ranks, and saves after every answer. `agree` reports how often two raters gave the same rating and Cohen's kappa, which discounts the agreement chance alone would produce.

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

Nothing got worse, and both changes moved a poor issue out of a top list. Read the bold numbers as "the rules fixed the cases they were written for", not as a measured improvement: each gain is a single issue, on the same pool the rules came from.

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

- **The rules were tested on the data they came from.** Both penalties were written after looking at failures in these 33 issues, then measured on the same 33. That shows they fix those failures; it cannot show they help on issues nobody has looked at. This pool is a development set, not a test set.
- **The rubric and the rules overlap.** "Good" includes "unassigned", and every good issue happens to have 0 to 2 comments, while the penalties act on assignees and comment counts. Part of their gain is agreeing with how the ratings were defined.
- **The gains are one issue wide.** With 5 issues in a top 5, one issue moves P@5 by 0.20, and P@10 0.50 → 0.60 for TypeScript is one issue. The numbers show direction, not precision.
- **One unreviewed set of ratings.** The ratings are a single first pass that no person has rated yet (see [Method](#method)), with no second opinion and no agreement figure.
- **One snapshot.** One day's `good first issue` results lean towards small, new repositories and bounty programmes, which may not be typical.

### What a fair test would look like

1. Capture a fresh pool of 100 or more issues (`capture --pool … --per-search 40`) and do not look at how Incipit ranks it.
2. Have a person rate all of it with `rate`, and a second person rate a subset; report `agree`'s kappa before trusting either.
3. Run `report` on that pool once, with no changes to the scorer in between, and publish whatever comes out. Keep these 33 as the development set for future changes.

## How it is guarded

[`services/api/tests/test_ranking_evaluation.py`](../services/api/tests/test_ranking_evaluation.py) checks, on the frozen pool:

- the exact top-10 order for each profile (golden ordering), so a ranking change is always deliberate;
- that no metric drops below the values above;
- that no assigned or crowded issue reaches any profile's top 5;
- that every issue in the pool has a rating.

When a change is intended, run the report, add a column to the table above, and only then update the test's golden orders and floors.
