import { COMMENT_PARTITIONED_SCENARIO_IDS } from './comment-scenario-ids.mts'
import { CRITICAL_ALERT_SCENARIO_IDS } from './critical-alert-scenario-ids.mts'
import { HACKER_NEWS_SCALE_SCENARIO_IDS } from './hacker-news-scale-scenario-ids.mts'
import { assertScenarioManifest } from './scenario-manifest-check.mts'

// Ordinary shards each own a set of whole domain files (ORDINARY_SHARD_DOMAINS in
// run-ordered-scenarios.mts). Fixture shards (`partition`, `hn-scale`) own fixed scenario sets.
export const ORDINARY_EXPLAIN_SHARDS = ['main', 'main-2', 'main-3', 'main-4'] as const
export const EXPLAIN_SHARDS = [...ORDINARY_EXPLAIN_SHARDS, 'partition', 'hn-scale'] as const
export type ExplainShard = (typeof EXPLAIN_SHARDS)[number]
export type OrdinaryExplainShard = (typeof ORDINARY_EXPLAIN_SHARDS)[number]
export type FixedExplainShard = Exclude<ExplainShard, OrdinaryExplainShard>

// The partitioned comment fixture is additive: its monthly bounds start after the current UTC
// month, so no other scenario reads it. runCommentDescendantPartitionedPages seeds and captures
// exactly these scenarios (the critical-alert recipient pages run at its end), which makes them
// the only ones the partition shard runs.
export const PARTITION_SHARD_SCENARIO_IDS: readonly string[] = [
  ...COMMENT_PARTITIONED_SCENARIO_IDS,
  ...CRITICAL_ALERT_SCENARIO_IDS,
]

// The million-post Hacker News fixture seeds its own future partitions and cleans them up, so
// only its scenarios read it. It runs in its own job so its seeding time never extends `main`.
export const HN_SCALE_SHARD_SCENARIO_IDS: readonly string[] = HACKER_NEWS_SCALE_SCENARIO_IDS

export const FIXED_SHARD_SCENARIO_IDS: Readonly<Record<FixedExplainShard, readonly string[]>> = {
  partition: PARTITION_SHARD_SCENARIO_IDS,
  'hn-scale': HN_SCALE_SHARD_SCENARIO_IDS,
}

/** An unset shard runs everything, as local runs do. */
export function parseExplainShard(value: string | undefined): ExplainShard | undefined {
  if (value === undefined || value === '') return undefined
  const shard = EXPLAIN_SHARDS.find(candidate => candidate === value)
  if (shard === undefined)
    throw new Error(`Invalid EXPLAIN_SHARD:"${value}"; expected ${EXPLAIN_SHARDS.join('|')}`)
  return shard
}

export function isOrdinaryExplainShard(
  shard: ExplainShard | undefined,
): shard is OrdinaryExplainShard {
  return ORDINARY_EXPLAIN_SHARDS.some(ordinary => ordinary === shard)
}

/** Checks that the fixture shard scenario sets are unique, disjoint, and belong to the manifest. */
export function assertFixedShardDeclarations(
  manifest: readonly string[],
  fixedShards: Readonly<Record<FixedExplainShard, readonly string[]>> = FIXED_SHARD_SCENARIO_IDS,
): void {
  const manifestSet = new Set(manifest)
  const seen = new Map<string, FixedExplainShard[]>()
  for (const [shard, ids] of Object.entries(fixedShards) as [
    FixedExplainShard,
    readonly string[],
  ][]) {
    const missing = ids.filter(id => !manifestSet.has(id))
    if (ids.length === 0 || missing.length > 0 || new Set(ids).size !== ids.length)
      throw new Error(
        `EXPLAIN ${shard} shard declares unknown, empty, or duplicate ids [${missing.join(', ')}]`,
      )
    for (const id of ids) seen.set(id, [...(seen.get(id) ?? []), shard])
  }
  const both = [...seen].filter(([, shards]) => shards.length > 1).map(([id]) => id)
  if (both.length > 0)
    throw new Error(`EXPLAIN fixture shards overlap on scenarios [${both.join(', ')}]`)
}

/** Checks that a single ordinary shard or standalone domain completed only ordinary manifest ids. */
export function assertOrdinaryCompletedScenarios(
  completed: readonly string[],
  manifest: readonly string[],
  owner: string,
  fixedShards: Readonly<Record<FixedExplainShard, readonly string[]>> = FIXED_SHARD_SCENARIO_IDS,
): void {
  if (completed.length === 0) throw new Error(`EXPLAIN ${owner} completed no scenarios`)
  const fixedIds = new Set(Object.values(fixedShards).flat())
  const ordinaryManifest = new Set(manifest.filter(id => !fixedIds.has(id)))
  const unexpected = completed.filter(id => !ordinaryManifest.has(id))
  const duplicates = completed.filter((id, index) => completed.indexOf(id) !== index)
  if (unexpected.length > 0 || duplicates.length > 0)
    throw new Error(
      `EXPLAIN ${owner} scenario mismatch; unexpected=[${unexpected.join(', ')}] duplicates=[${[...new Set(duplicates)].join(', ')}]`,
    )
}

/** Validates one shard's completed scenarios (or the whole manifest when unsharded). */
export function assertShardCompletedScenarios(
  completed: readonly string[],
  shard: ExplainShard | undefined,
  manifest: readonly string[],
  fixedShards: Readonly<Record<FixedExplainShard, readonly string[]>> = FIXED_SHARD_SCENARIO_IDS,
): void {
  if (shard === undefined) {
    assertScenarioManifest(completed, manifest)
    return
  }
  if (isOrdinaryExplainShard(shard)) {
    assertOrdinaryCompletedScenarios(completed, manifest, shard, fixedShards)
    return
  }
  assertScenarioManifest(completed, fixedShards[shard])
}

/** Fails unless the shard subsets are disjoint and together equal the manifest. */
export function assertShardsPartitionManifest(
  manifest: readonly string[],
  subsets: Readonly<Record<ExplainShard, readonly string[]>>,
): void {
  const seen = new Map<string, ExplainShard[]>()
  for (const shard of EXPLAIN_SHARDS)
    for (const id of subsets[shard]) seen.set(id, [...(seen.get(id) ?? []), shard])
  const manifestSet = new Set(manifest)
  const neither = manifest.filter(id => !seen.has(id))
  const both = [...seen].filter(([, shards]) => shards.length > 1).map(([id]) => id)
  const unknown = [...seen.keys()].filter(id => !manifestSet.has(id))
  if (neither.length > 0 || both.length > 0 || unknown.length > 0)
    throw new Error(
      `EXPLAIN shards must partition the scenario manifest; neither=[${neither.join(', ')}] both=[${both.join(', ')}] unknown=[${unknown.join(', ')}]`,
    )
}
