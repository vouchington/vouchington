import { COMMENT_PARTITIONED_SCENARIO_IDS } from './comment-scenario-ids.mts'
import { CRITICAL_ALERT_SCENARIO_IDS } from './critical-alert-scenario-ids.mts'

export const EXPLAIN_SHARDS = ['main', 'partition'] as const
export type ExplainShard = (typeof EXPLAIN_SHARDS)[number]

export const EXPLAIN_SHARD_ENV = 'EXPLAIN_SHARD'

// The partitioned comment fixture is additive: its monthly bounds start after the current UTC
// month, so no other scenario reads it. runCommentDescendantPartitionedPages seeds and captures
// exactly these scenarios (the critical-alert recipient pages run at its end), which makes them
// the only ones the partition shard runs.
export const PARTITION_SHARD_SCENARIO_IDS: readonly string[] = [
  ...COMMENT_PARTITIONED_SCENARIO_IDS,
  ...CRITICAL_ALERT_SCENARIO_IDS,
]

/** An unset shard runs everything, as local runs do. */
export function parseExplainShard(value: string | undefined): ExplainShard | undefined {
  if (value === undefined || value === '') return undefined
  const shard = EXPLAIN_SHARDS.find(candidate => candidate === value)
  if (shard === undefined)
    throw new Error(
      `Invalid ${EXPLAIN_SHARD_ENV}: "${value}"; expected ${EXPLAIN_SHARDS.join('|')}`,
    )
  return shard
}

/** The scenarios one shard must complete; no shard means the whole manifest. */
export function getShardScenarioIds(
  shard: ExplainShard | undefined,
  manifest: readonly string[],
  partitionIds: readonly string[] = PARTITION_SHARD_SCENARIO_IDS,
): readonly string[] {
  const partitionSet = new Set(partitionIds)
  if (shard === 'partition') return manifest.filter(id => partitionSet.has(id))
  if (shard === 'main') return manifest.filter(id => !partitionSet.has(id))
  return manifest
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
  partitionIds: readonly string[] = PARTITION_SHARD_SCENARIO_IDS,
): void {
  assertPartitionIdsInManifest(manifest, partitionIds)
  assertShardsPartitionManifest(manifest, {
    main: getShardScenarioIds('main', manifest, partitionIds),
    partition: getShardScenarioIds('partition', manifest, partitionIds),
  })
}

/** Every declared partition scenario must exist, or the partition shard would silently shrink. */
function assertPartitionIdsInManifest(
  manifest: readonly string[],
  partitionIds: readonly string[] = PARTITION_SHARD_SCENARIO_IDS,
): void {
  const manifestSet = new Set(manifest)
  const missing = partitionIds.filter(id => !manifestSet.has(id))
  if (missing.length > 0 || new Set(partitionIds).size !== partitionIds.length)
    throw new Error(
      `EXPLAIN partition shard declares unknown or duplicate ids [${missing.join(', ')}]`,
    )
}
