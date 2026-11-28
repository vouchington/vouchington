import { describe, expect, it } from 'vitest'
import {
  EXPLAIN_SHARDS,
  FIXED_SHARD_SCENARIO_IDS,
  HN_SCALE_SHARD_SCENARIO_IDS,
  ORDINARY_EXPLAIN_SHARDS,
  PARTITION_SHARD_SCENARIO_IDS,
  assertFixedShardDeclarations,
  assertOrdinaryCompletedScenarios,
  assertShardCompletedScenarios,
  assertShardsPartitionManifest,
  isOrdinaryExplainShard,
  parseExplainShard,
  type ExplainShard,
  type FixedExplainShard,
} from './explain-shards.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

const manifest = ['a', 'b', 'c', 'd', 'p1', 'p2']
const fixedShards: Readonly<Record<FixedExplainShard, readonly string[]>> = {
  partition: ['p1', 'p2'],
  'hn-scale': ['d'],
}

function subsets(overrides: Partial<Record<ExplainShard, readonly string[]>> = {}) {
  return {
    main: ['a'],
    'main-2': ['b'],
    'main-3': ['c'],
    'main-4': [],
    partition: ['p1', 'p2'],
    'hn-scale': ['d'],
    ...overrides,
  } satisfies Record<ExplainShard, readonly string[]>
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

describe('assertFixedShardDeclarations', () => {
  it('passes for the real manifest and its fixture shards', () => {
    expect(() => assertFixedShardDeclarations(EXPLAIN_SCENARIO_MANIFEST)).not.toThrow()
    expect(FIXED_SHARD_SCENARIO_IDS.partition).toEqual(PARTITION_SHARD_SCENARIO_IDS)
    expect(FIXED_SHARD_SCENARIO_IDS['hn-scale']).toEqual(HN_SCALE_SHARD_SCENARIO_IDS)
    expect(PARTITION_SHARD_SCENARIO_IDS.length).toBeGreaterThan(0)
    expect(HN_SCALE_SHARD_SCENARIO_IDS.length).toBeGreaterThan(0)
  })

  it('rejects empty, unknown, duplicate, or overlapping fixture shard declarations', () => {
    expect(() => assertFixedShardDeclarations(manifest, fixedShards)).not.toThrow()
    expect(() => assertFixedShardDeclarations(manifest, { ...fixedShards, partition: [] })).toThrow(
      'partition shard declares unknown, empty, or duplicate ids',
    )
    expect(() =>
      assertFixedShardDeclarations(manifest, { ...fixedShards, partition: ['p1', 'gone'] }),
    ).toThrow('partition shard declares unknown, empty, or duplicate ids [gone]')
    expect(() =>
      assertFixedShardDeclarations(manifest, { ...fixedShards, partition: ['p1', 'p1'] }),
    ).toThrow('duplicate')
    expect(() =>
      assertFixedShardDeclarations(manifest, { partition: ['p1', 'd'], 'hn-scale': ['d'] }),
    ).toThrow('overlap on scenarios [d]')
  })
})

describe('assertShardCompletedScenarios', () => {
  it('checks ordinary shards against non-fixture manifest ids and fixture shards exactly', () => {
    expect(() =>
      assertShardCompletedScenarios(['a', 'b'], 'main', manifest, fixedShards),
    ).not.toThrow()
    expect(() =>
      assertShardCompletedScenarios(['p1', 'p2'], 'partition', manifest, fixedShards),
    ).not.toThrow()
    expect(() =>
      assertShardCompletedScenarios(['d'], 'hn-scale', manifest, fixedShards),
    ).not.toThrow()
    expect(() =>
      assertShardCompletedScenarios(manifest, undefined, manifest, fixedShards),
    ).not.toThrow()
  })

  it('rejects empty, duplicate, unknown, or fixture scenarios inside an ordinary shard or domain', () => {
    expect(() => assertOrdinaryCompletedScenarios([], manifest, 'main', fixedShards)).toThrow(
      'completed no scenarios',
    )
    expect(() =>
      assertOrdinaryCompletedScenarios(['a', 'a'], manifest, 'main', fixedShards),
    ).toThrow('duplicates=[a]')
    expect(() =>
      assertOrdinaryCompletedScenarios(['a', 'p1'], manifest, 'recovery', fixedShards),
    ).toThrow('unexpected=[p1]')
    expect(() =>
      assertOrdinaryCompletedScenarios(['a', 'ghost'], manifest, 'main-2', fixedShards),
    ).toThrow('unexpected=[ghost]')
    expect(EXPLAIN_SHARDS).toEqual(['main', 'main-2', 'main-3', 'main-4', 'partition', 'hn-scale'])
  })
})
