import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import {
  EXPLAIN_SHARDS,
  PARTITION_SHARD_SCENARIO_IDS,
  getShardScenarioIds,
  type ExplainShard,
} from './explain-shards.mts'
import {
  SHARD_ARTIFACT_PREFIX,
  mergeShardDirectories,
  mergeShardResults,
} from './merge-shard-results.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

const manifest = ['a', 'b', ...PARTITION_SHARD_SCENARIO_IDS]

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

// The remaining shards complete nothing in a manifest that only names `main` and `partition`.
function emptyShards(...except: readonly ExplainShard[]) {
  return EXPLAIN_SHARDS.filter(name => !except.includes(name)).map(name => shard(name, []))
}

describe('mergeShardResults', () => {
  it('concatenates complete shards in shard order', () => {
    const merged = mergeShardResults(
      [
        shard('partition', PARTITION_SHARD_SCENARIO_IDS),
        shard('main', getShardScenarioIds('main', manifest)),
        ...emptyShards('main', 'partition'),
      ],
      manifest,
    )
    expect(merged.completedScenarioIds).toEqual(['a', 'b', ...PARTITION_SHARD_SCENARIO_IDS])
    expect(merged.results.map(item => item.name).slice(0, 2)).toEqual(['a', 'b'])
    expect(merged.repeatedResults.at(-1)?.name).toBe(
      `${PARTITION_SHARD_SCENARIO_IDS.at(-1)}:repeat`,
    )
  })

  it('fails when a shard misses or adds scenarios, or a shard is absent', () => {
    expect(() =>
      mergeShardResults(
        [
          shard('main', ['a']),
          shard('partition', PARTITION_SHARD_SCENARIO_IDS),
          ...emptyShards('main', 'partition'),
        ],
        manifest,
      ),
    ).toThrow('missing=[b]')
    expect(() =>
      mergeShardResults(
        [
          shard('main', ['a', 'b', 'c']),
          shard('partition', PARTITION_SHARD_SCENARIO_IDS),
          ...emptyShards('main', 'partition'),
        ],
        manifest,
      ),
    ).toThrow('unexpected=[c]')
    expect(() => mergeShardResults([shard('main', ['a', 'b'])], manifest)).toThrow(
      'one result set per shard',
    )
  })
})

describe('mergeShardDirectories', () => {
  it('writes one results and repeat pair plus prefixed native coverage', () => {
    const root = mkdtempSync(join(tmpdir(), 'explain-shards-'))
    try {
      for (const name of EXPLAIN_SHARDS) {
        const ids = getShardScenarioIds(name, EXPLAIN_SCENARIO_MANIFEST)
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
