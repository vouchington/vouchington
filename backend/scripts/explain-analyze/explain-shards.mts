import { COMMENT_PARTITIONED_SCENARIO_IDS } from './comment-scenario-ids.mts'
import { CRITICAL_ALERT_SCENARIO_IDS } from './critical-alert-scenario-ids.mts'
import { HACKER_NEWS_SCALE_SCENARIO_IDS } from './hacker-news-scale-scenario-ids.mts'
import orderedShardScenarioIds from './explain-shard-scenario-ids.json' with { type: 'json' }

// The ordinary scenarios run in one fixed order (run-ordered-scenarios.mts) that is cut into
// contiguous segments, one per ordinary shard. `main` is the first segment and owns every
// manifest scenario no other shard declares; the later segments list theirs in
// explain-shard-scenario-ids.json.
export const ORDINARY_EXPLAIN_SHARDS = ['main', 'main-2', 'main-3', 'main-4'] as const
export const EXPLAIN_SHARDS = [...ORDINARY_EXPLAIN_SHARDS, 'partition', 'hn-scale'] as const
export type ExplainShard = (typeof EXPLAIN_SHARDS)[number]
export type OrdinaryExplainShard = (typeof ORDINARY_EXPLAIN_SHARDS)[number]
/** Every shard that declares its scenarios; `main` owns the rest. */
export type DeclaredExplainShard = Exclude<ExplainShard, 'main'>
export type ShardDeclarations = Readonly<Record<DeclaredExplainShard, readonly string[]>>

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

export const SHARD_DECLARATIONS: ShardDeclarations = {
  ...orderedShardScenarioIds,
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

/** The scenarios one shard must complete; no shard means the whole manifest. */
export function getShardScenarioIds(
  shard: ExplainShard | undefined,
  manifest: readonly string[],
  declarations: ShardDeclarations = SHARD_DECLARATIONS,
): readonly string[] {
  if (shard === undefined) return manifest
  if (shard === 'main') {
    const declared = new Set(Object.values(declarations).flat())
    return manifest.filter(id => !declared.has(id))
  }
  const owned = new Set(declarations[shard])
  return manifest.filter(id => owned.has(id))
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

/** Checks the declared shard split against the manifest before a shard runs anything. */
export function assertShardDeclarations(
  manifest: readonly string[],
  declarations: ShardDeclarations = SHARD_DECLARATIONS,
): void {
  const manifestSet = new Set(manifest)
  for (const [shard, ids] of Object.entries(declarations)) {
    const missing = ids.filter(id => !manifestSet.has(id))
    if (missing.length > 0 || new Set(ids).size !== ids.length)
      throw new Error(
        `EXPLAIN ${shard} shard declares unknown or duplicate ids [${missing.join(', ')}]`,
      )
  }
  const subsets = Object.fromEntries(
    EXPLAIN_SHARDS.map(shard => [shard, getShardScenarioIds(shard, manifest, declarations)]),
  ) as Record<ExplainShard, readonly string[]>
  assertShardsPartitionManifest(manifest, subsets)
}
