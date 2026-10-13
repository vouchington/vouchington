Add one EXPLAIN scenario for an annotated read that has no captured plan. Ship at most one scenario
per run.

1. Capture custom and generic plans using the steps in
   [the EXPLAIN prompt](postgresql-explain-analyze.md#capture-the-plans), passing the isolated
   `DATABASE_URL` and `VALKEY_URL` inline for each local command. Alternatively, download the
   `explain-analyze-results` artifact from the newest `main` Nightly run. If neither is available,
   report `Outcome: incomplete`.
2. Run `pnpm run explain:coverage`, passing the downloaded `results-*.json` path after `--` when
   using an artifact. Select one uncovered read on a user-facing path: feeds, posts, users, topics,
   communities, or search. Prefer these over workers. Skip a read already covered by an open PR.
3. Add the smallest representative seed rows and a scenario that calls the real service. Register
   its `registerScenarioContract` budget at the measured value plus 20% for both plan-cache modes.
   The contract and scenario identity must remain in the owning EXPLAIN registry.
4. Fix the query or plan only when it violates [R3 or R6](../../development/postgres-schema-rules.md)
   or shows a red flag in [the EXPLAIN prompt](postgresql-explain-analyze.md#plan-red-flags).
   Otherwise ship the scenario and its measured budget without a speculative query rewrite.

Report the selected annotation and path, the measured custom/generic plan work, and whether the
run added a scenario or was incomplete.
