Add one EXPLAIN scenario for an annotated read that has no captured plan. Ship at most one scenario per run.

Unit: one service.

1. Capture custom and generic plans using [the EXPLAIN prompt](postgresql-explain-analyze.md#capture-the-plans), or download the `explain-analyze-results` artifact only from a successful `main` Nightly run whose head SHA matches the checkout (a failed run can upload a partial artifact). With neither, report `Outcome: incomplete`.
2. Run `pnpm run explain:coverage` (pass the artifact's `results-*.json` after `--`; it rejects an artifact missing a registered scenario). Select one confirmed uncovered read on a user-facing path (feeds, posts, users, topics, communities, search) over workers. Skip ambiguous same-name reads, reads covered by an open PR, unclassified SQL executions, and raw client reads of session-local temporary tables, which the harness cannot capture or replay. If no supported read remains, report `Outcome: incomplete`.
3. Add the smallest representative seed rows and a scenario calling the real service, with a `registerScenarioContract` budget at the measured value plus 20% for both plan-cache modes, in the owning EXPLAIN registry.
4. Change the query only when it violates the `vouchington-postgres` query-shape rules or `postgres-schema-design` or shows a [red flag](postgresql-explain-analyze.md#plan-red-flags); otherwise ship the scenario and budget alone.

Report the annotation and path, the measured custom/generic plan work, and whether a scenario was added or the run was incomplete.
