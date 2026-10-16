Add one EXPLAIN scenario for an annotated read that has no captured plan. Ship at most one scenario
per run.

1. Capture custom and generic plans using the steps in
   [the EXPLAIN prompt](postgresql-explain-analyze.md#capture-the-plans), passing the isolated
   `DATABASE_URL` and `VALKEY_URL` inline for each local command. Alternatively, download the
   `explain-analyze-results` artifact only from a successfully completed `main` Nightly run whose
   head SHA matches the source checkout. A failed run can upload a partial artifact. If neither a
   complete local run nor a matching successful artifact is available, report `Outcome: incomplete`.
2. Run `pnpm run explain:coverage`, passing the downloaded `results-*.json` path after `--` when
   using an artifact. The command rejects an artifact missing any registered scenario. Select one
   confirmed uncovered read on a user-facing path: feeds, posts, users, topics, communities, or
   search. Prefer these over workers. Skip ambiguous same-name reads and any read already covered
   by an open PR. Skip unclassified annotated SQL: the evaluator has not proved its verb or full
   shape, even when its name matches a read. The report retains raw `PoolClient.query` reads in its
   counts and uncovered list.
   The current harness captures PostgreSQL wrapper calls and replays plans on a separate connection;
   it cannot capture or replay a raw client read of a session-local temporary table. Skip those
   entries when choosing a scenario, without treating them as covered or removing them from the
   report. Choose another supported user-facing read; if none remains, report `Outcome: incomplete`.
3. Add the smallest representative seed rows and a scenario that calls the real service. Register
   its `registerScenarioContract` budget at the measured value plus 20% for both plan-cache modes.
   The contract and scenario identity must remain in the owning EXPLAIN registry.
4. Fix the query or plan only when it violates [R3 or R6](../../development/postgres-schema-rules.md)
   or shows a red flag in [the EXPLAIN prompt](postgresql-explain-analyze.md#plan-red-flags).
   Otherwise ship the scenario and its measured budget without a speculative query rewrite.

Report the selected annotation and path, the measured custom/generic plan work, and whether the
run added a scenario or was incomplete.
