import { describe, expect, it } from 'vitest'
import {
  PARTITION_SHARD_SCENARIO_IDS,
  assertShardDeclarations,
  assertShardsPartitionManifest,
  getShardScenarioIds,
  parseExplainShard,
} from './explain-shards.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

const manifest = ['a', 'b', 'p1', 'p2']

describe('parseExplainShard', () => {
  it('maps unset to every scenario and rejects unknown shards', () => {
    expect(parseExplainShard(undefined)).toBeUndefined()
    expect(parseExplainShard('')).toBeUndefined()
    expect(parseExplainShard('partition')).toBe('partition')
    expect(() => parseExplainShard('third')).toThrow('Invalid EXPLAIN_SHARD')
  })
})

describe('getShardScenarioIds', () => {
  it('splits the manifest by the partition ids and keeps it whole without a shard', () => {
    expect(getShardScenarioIds('main', manifest, ['p1', 'p2'], ['b'])).toEqual(['a'])
    expect(getShardScenarioIds('hn-scale', manifest, ['p1', 'p2'], ['b'])).toEqual(['b'])
    expect(getShardScenarioIds('main', manifest, ['p1', 'p2'])).toEqual(['a', 'b'])
    expect(getShardScenarioIds('partition', manifest, ['p1', 'p2'])).toEqual(['p1', 'p2'])
    expect(getShardScenarioIds(undefined, manifest, ['p1', 'p2'])).toEqual(manifest)
  })
})

describe('assertShardsPartitionManifest', () => {
  it('accepts disjoint subsets whose union is the manifest', () => {
    expect(() =>
      assertShardsPartitionManifest(manifest, {
        main: ['a', 'b'],
        partition: ['p1', 'p2'],
        'hn-scale': [],
      }),
    ).not.toThrow()
  })

  it('fails for a scenario in neither shard, in both shards, or outside the manifest', () => {
    expect(() =>
      assertShardsPartitionManifest(manifest, {
        main: ['a'],
        partition: ['p1', 'p2'],
        'hn-scale': [],
      }),
    ).toThrow('neither=[b]')
    expect(() =>
      assertShardsPartitionManifest(manifest, {
        main: ['a', 'b', 'p1'],
        partition: ['p1', 'p2'],
        'hn-scale': [],
      }),
    ).toThrow('both=[p1]')
    expect(() =>
      assertShardsPartitionManifest(manifest, {
        main: ['a', 'b', 'ghost'],
        partition: ['p1', 'p2'],
        'hn-scale': [],
      }),
    ).toThrow('unknown=[ghost]')
  })
})

describe('assertShardDeclarations', () => {
  it('passes for the real manifest and its declared partition scenarios', () => {
    expect(() => assertShardDeclarations(EXPLAIN_SCENARIO_MANIFEST)).not.toThrow()
    // The shard keeps manifest order; only membership is declared.
    expect(new Set(getShardScenarioIds('partition', EXPLAIN_SCENARIO_MANIFEST))).toEqual(
      new Set(PARTITION_SHARD_SCENARIO_IDS),
    )
  })

  it('fails when a declared partition scenario is missing or repeated', () => {
    expect(() => assertShardDeclarations(manifest, ['p1', 'gone'])).toThrow('[gone]')
    expect(() => assertShardDeclarations(manifest, ['p1', 'p1'])).toThrow('duplicate')
  })
})
