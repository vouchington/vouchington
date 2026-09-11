export type ResourcePressureBaseline = Readonly<Record<string, readonly string[]>>

// Add an exact query identity and pressure fingerprint only after validating that the pressure is
// intentional. A different node, relation, or pressure kind remains a new regression.
//
// Empty as of #11081: the one entry this file ever held
// (platform-stats|0|getPlatformStats|auto, for getPlatformStats() in backend/services/
// platform-stats/get-platform-stats.mts) was measured against a local server at Postgres's stock
// 4MB work_mem, where the query's Sort spilled to disk (~48MB, external merge). The harness now
// pins work_mem to 32MB for every capture (see EXPLAIN_WORK_MEM in
// backend/data-stores/psql/explain-analyze.mts), and at that budget the same Sort — ~10MB for the
// ~100k eligible posts in the CI capture (Sort Space Used=10108kB, rows=100066) — stays in memory.
// There is no pressure left to allow, and the entry's identity
// (…|auto) could never have matched a CI result anyway: CI runs EXPLAIN_PLAN_CACHE_MODE=compare,
// which appends the plan-cache mode to the query name (see README.md), so the entry was inert in
// CI from the day it landed.
//
// This gate is fail-closed with an empty baseline: if the seed grows enough to push this sort
// (or any other) past 32MB, CI will catch it as a new regression rather than silently matching a
// stale allowance.
export const RESOURCE_PRESSURE_BASELINE: ResourcePressureBaseline = {}
