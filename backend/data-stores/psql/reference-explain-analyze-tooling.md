# EXPLAIN ANALYZE Tooling

[Back to PostgreSQL Data Store](README.md#explain-analyze-tooling)

[explain-analyze.mts](explain-analyze.mts) captures executed SQL and replays it with
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.

The supporting scripts live in
[../../scripts/explain-analyze/README.md](../../scripts/explain-analyze/README.md).

Notable behavior:

- captured queries preserve bound parameter values
- query names come from the leading annotation comment
- EXPLAIN replay strips the leading annotation before prefixing `EXPLAIN`
- JIT is disabled with `SET LOCAL jit = off` during profiling to expose actual query execution
  costs
- `work_mem` is pinned with `SET LOCAL work_mem` (`EXPLAIN_WORK_MEM`, set in
  [`explain-analyze.mts`](explain-analyze.mts)), issued
  before `PREPARE` so planning and execution see the same budget — this is what makes a local
  `pnpm run explain:analyze` reach the same disk-spill verdict as CI (#11081)
- replay runs inside a transaction that is rolled back after plan capture, so mutating statements
  discovered by query capture do not persist profiling side effects

This matters for heavy feed queries, which can generate hundreds of plan nodes and spend more time
in JIT compilation than in execution.
