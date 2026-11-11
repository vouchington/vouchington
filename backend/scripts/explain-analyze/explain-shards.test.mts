import { describe, expect, it } from 'vitest'
import {
  EXPLAIN_SHARDS,
  ORDINARY_EXPLAIN_SHARDS,
  PARTITION_SHARD_SCENARIO_IDS,
  SHARD_DECLARATIONS,
  assertShardDeclarations,
  assertShardsPartitionManifest,
  getShardScenarioIds,
  isOrdinaryExplainShard,
  parseExplainShard,
  type ExplainShard,
  type ShardDeclarations,
} from './explain-shards.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

const manifest = ['a', 'b', 'c', 'd', 'p1', 'p2']
const declarations: ShardDeclarations = {
  'main-2': ['b'],
  'main-3': ['c'],
  'main-4': [],
  partition: ['p1', 'p2'],
  'hn-scale': ['d'],
}

function subsets(overrides: Partial<Record<ExplainShard, readonly string[]>> = {}) {
  return Object.fromEntries(
    EXPLAIN_SHARDS.map(shard => [
      shard,
      overrides[shard] ?? getShardScenarioIds(shard, manifest, declarations),
    ]),
  ) as Record<ExplainShard, readonly string[]>
}

describe('parseExplainShard', () => {
  it('maps unset to every scenario and rejects unknown shards', () => {
    expect(parseExplainShard(undefined)).toBeUndefined()
    expect(parseExplainShard('')).toBeUndefined()
    expect(parseExplainShard('partition')).toBe('partition')
    expect(parseExplainShard('main-3')).toBe('main-3')
    expect(() => parseExplainShard('third')).toThrow('Invalid EXPLAIN_SHARD')
  })

  it('tells the ordinary shards from the fixture shards', () => {
    expect(ORDINARY_EXPLAIN_SHARDS.every(isOrdinaryExplainShard)).toBe(true)
    expect(isOrdinaryExplainShard('partition')).toBe(false)
    expect(isOrdinaryExplainShard('hn-scale')).toBe(false)
    expect(isOrdinaryExplainShard(undefined)).toBe(false)
  })
})

describe('getShardScenarioIds', () => {
  it('gives each declared shard its ids, main the rest, and everything without a shard', () => {
    expect(getShardScenarioIds('main', manifest, declarations)).toEqual(['a'])
    expect(getShardScenarioIds('main-2', manifest, declarations)).toEqual(['b'])
    expect(getShardScenarioIds('main-3', manifest, declarations)).toEqual(['c'])
    expect(getShardScenarioIds('main-4', manifest, declarations)).toEqual([])
    expect(getShardScenarioIds('hn-scale', manifest, declarations)).toEqual(['d'])
    expect(getShardScenarioIds('partition', manifest, declarations)).toEqual(['p1', 'p2'])
    expect(getShardScenarioIds(undefined, manifest, declarations)).toEqual(manifest)
  })
})

describe('assertShardsPartitionManifest', () => {
  it('accepts disjoint subsets whose union is the manifest', () => {
    expect(() => assertShardsPartitionManifest(manifest, subsets())).not.toThrow()
  })

  it('fails for a scenario in no shard, in two shards, or outside the manifest', () => {
    expect(() => assertShardsPartitionManifest(manifest, subsets({ main: [] }))).toThrow(
      'neither=[a]',
    )
    expect(() => assertShardsPartitionManifest(manifest, subsets({ main: ['a', 'p1'] }))).toThrow(
      'both=[p1]',
    )
    expect(() =>
      assertShardsPartitionManifest(manifest, subsets({ main: ['a', 'ghost'] })),
    ).toThrow('unknown=[ghost]')
  })
})

describe('assertShardDeclarations', () => {
  it('passes for the real manifest and its declared shards', () => {
    expect(() => assertShardDeclarations(EXPLAIN_SCENARIO_MANIFEST)).not.toThrow()
    // A shard keeps manifest order; only membership is declared.
    expect(new Set(getShardScenarioIds('partition', EXPLAIN_SCENARIO_MANIFEST))).toEqual(
      new Set(PARTITION_SHARD_SCENARIO_IDS),
    )
    for (const shard of EXPLAIN_SHARDS)
      expect(getShardScenarioIds(shard, EXPLAIN_SCENARIO_MANIFEST).length).toBeGreaterThan(0)
    expect(Object.keys(SHARD_DECLARATIONS).toSorted()).toEqual(
      EXPLAIN_SHARDS.filter(shard => shard !== 'main').toSorted(),
    )
  })

  it('accepts a complete split and fails when a declared id is unknown or repeated', () => {
    expect(() => assertShardDeclarations(manifest, declarations)).not.toThrow()
    expect(() =>
      assertShardDeclarations(manifest, { ...declarations, partition: ['p1', 'gone'] }),
    ).toThrow('partition shard declares unknown or duplicate ids [gone]')
    expect(() =>
      assertShardDeclarations(manifest, { ...declarations, partition: ['p1', 'p1'] }),
    ).toThrow('duplicate')
  })

  it('fails when two shards declare the same scenario', () => {
    expect(() =>
      assertShardDeclarations(manifest, { ...declarations, 'main-3': ['b', 'c'] }),
    ).toThrow('both=[b]')
  })
})
