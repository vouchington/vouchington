import type { ExplainResult } from '@vouchington/explain-plan'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EXPLAIN_SHARDS,
  HN_SCALE_SHARD_SCENARIO_IDS,
  ORDINARY_EXPLAIN_SHARDS,
  PARTITION_SHARD_SCENARIO_IDS,
  type ExplainShard,
} from './explain-shards.mts'
import {
  SHARD_ARTIFACT_PREFIX,
  mergeShardDirectories,
  mergeShardResults,
} from './merge-shard-results.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

const manifest = [
  'a',
  'b',
  'c',
  'd',
  ...PARTITION_SHARD_SCENARIO_IDS,
  ...HN_SCALE_SHARD_SCENARIO_IDS,
]

function result(name: string): ExplainResult {
  return { name } as ExplainResult
}

function shard(name: ExplainShard, ids: readonly string[]) {
  return {
    shard: name,
    results: ids.map(result),
    repeatedResults: ids.map(id => result(`${id}:repeat`)),
    completedScenarioIds: ids,
  }
}

function validShards() {
  return [
    shard('partition', PARTITION_SHARD_SCENARIO_IDS),
    shard('main', ['a']),
    shard('main-2', ['b']),
    shard('main-3', ['c']),
    shard('main-4', ['d']),
    shard('hn-scale', HN_SCALE_SHARD_SCENARIO_IDS),
  ]
}

describe('mergeShardResults', () => {
  it('concatenates complete shards in shard order', () => {
    const merged = mergeShardResults(validShards(), manifest)
    expect(merged.completedScenarioIds).toEqual([
      'a',
      'b',
      'c',
      'd',
      ...PARTITION_SHARD_SCENARIO_IDS,
      ...HN_SCALE_SHARD_SCENARIO_IDS,
    ])
    expect(merged.results.map(item => item.name).slice(0, 4)).toEqual(['a', 'b', 'c', 'd'])
    expect(merged.repeatedResults.at(-1)?.name).toBe(`${HN_SCALE_SHARD_SCENARIO_IDS.at(-1)}:repeat`)
  })

  it('fails when a shard misses, duplicates, or adds scenarios, or a shard is absent', () => {
    expect(() =>
      mergeShardResults(
        [
          shard('main', ['a']),
          shard('main-2', ['b']),
          shard('main-3', ['c']),
          shard('main-4', ['a']),
          shard('partition', PARTITION_SHARD_SCENARIO_IDS),
          shard('hn-scale', HN_SCALE_SHARD_SCENARIO_IDS),
        ],
        manifest,
      ),
    ).toThrow('missing=[d]')
    expect(() =>
      mergeShardResults(
        [
          shard('main', ['a', 'ghost']),
          shard('main-2', ['b']),
          shard('main-3', ['c']),
          shard('main-4', ['d']),
          shard('partition', PARTITION_SHARD_SCENARIO_IDS),
          shard('hn-scale', HN_SCALE_SHARD_SCENARIO_IDS),
        ],
        manifest,
      ),
    ).toThrow('unexpected=[ghost]')
    expect(() => mergeShardResults([shard('main', ['a', 'b'])], manifest)).toThrow(
      'one result set per shard',
    )
  })
})

describe('mergeShardDirectories', () => {
  it('writes one results and repeat pair plus prefixed native coverage', () => {
    const root = mkdtempSync(join(tmpdir(), 'explain-shards-'))
    try {
      const fixedIds = new Set([...PARTITION_SHARD_SCENARIO_IDS, ...HN_SCALE_SHARD_SCENARIO_IDS])
      const ordinaryIds = EXPLAIN_SCENARIO_MANIFEST.filter(id => !fixedIds.has(id))
      const byShard: Record<ExplainShard, readonly string[]> = {
        main: ordinaryIds.slice(0, 1),
        'main-2': ordinaryIds.slice(1, 2),
        'main-3': ordinaryIds.slice(2, 3),
        'main-4': ordinaryIds.slice(3),
        partition: PARTITION_SHARD_SCENARIO_IDS,
        'hn-scale': HN_SCALE_SHARD_SCENARIO_IDS,
      }
      expect(ORDINARY_EXPLAIN_SHARDS.every(name => byShard[name].length > 0)).toBe(true)
      for (const name of EXPLAIN_SHARDS) {
        const ids = byShard[name]
        const directory = join(root, 'shards', `${SHARD_ARTIFACT_PREFIX}${name}`)
        mkdirSync(join(directory, 'pruning-v8'), { recursive: true })
        writeFileSync(join(directory, 'pruning-v8', 'coverage-1.json'), name)
        if (name === 'partition') writeFileSync(join(directory, 'pruning-proof-1.json'), '{}')
        const payload = (suffix: string) =>
          JSON.stringify({
            results: ids.map(id => result(`${id}${suffix}`)),
            completedScenarioIds: ids,
          })
        writeFileSync(join(directory, 'results-2026-01-01T00-00-00-000Z.json'), payload(''))
        writeFileSync(join(directory, 'repeat-2026-01-01T00-00-00-000Z.json'), payload(':repeat'))
      }
      const output = join(root, 'output')
      const resultsPath = mergeShardDirectories(join(root, 'shards'), output)
      const merged = JSON.parse(readFileSync(resultsPath, 'utf8')) as {
        completedScenarioIds: string[]
      }
      expect(merged.completedScenarioIds.toSorted()).toEqual(EXPLAIN_SCENARIO_MANIFEST.toSorted())
      expect(readdirSync(join(output, 'pruning-v8')).toSorted()).toEqual(
        EXPLAIN_SHARDS.map(name => `coverage-${name}-1.json`).toSorted(),
      )
      expect(readdirSync(output).filter(file => file.startsWith('repeat-'))).toHaveLength(1)
      expect(readdirSync(output)).toContain('pruning-proof-1.json')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
