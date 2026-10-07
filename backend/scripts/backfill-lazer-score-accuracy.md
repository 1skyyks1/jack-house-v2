# Recalculate recorded lazer accuracy

Run from the backend directory with its existing database environment configured.

```sh
npm run backfill:lazer-score-accuracy
npm run backfill:lazer-score-accuracy -- --apply
```

The first command only previews counts and up to ten before/after examples per table.
The second writes the corrections. Both cover `pack_score` and `event_score`, since
event scores use the same importer and can later populate pack leaderboards.
Use `--table=pack_score` or `--table=event_score` to restrict the scope, and
`--batch-size=500` to adjust the batch size (1–5000).

Only rows with a positive `build_id` are eligible. Valid stored judgement counts
and Mods are required; missing, malformed or empty snapshots and failed scores
are skipped and reported. No osu! API request is needed. The preview establishes
how many existing rows have enough information; the schema alone cannot establish
that all historical rows are recoverable.

The repair uses MAX=305, GREAT=300, GOOD=200, OK=100, MEH=50 and MISS=0, with
305 times the sum of those six counts as the denominator. Client origin selects
the formula, so CL on a lazer score does not select the stable formula. ACC and
the associated letter grade are updated together; total score, Mods, judgement
counts, client identifiers, play times and creation/update times are preserved.
Preserving `updated_time` also preserves the pack leaderboard's score tie-break.

Each apply batch locks the rows it reads and commits in a transaction. A failed
batch rolls back; earlier batches may already have committed. Re-running safely
finishes remaining corrections and ignores values already correct to the database's
ten decimal places. Rows inserted after a table's scan begins wait until the next run.

References: [lazer display accuracy and grades](https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/Scoring/ManiaScoreProcessor.cs),
[PP's separate 320 weighting](https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/Difficulty/ManiaPerformanceCalculator.cs).
