import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExplainResult } from '@data-stores/psql'
import { EXPLAIN_SHARDS, getShardScenarioIds, type ExplainShard } from './explain-shards.mts'
import { loadLatestPairedResults } from './paired-results.mts'
import { assertScenarioManifest } from './scenario-manifest-check.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'

export const SHARD_ARTIFACT_PREFIX = 'explain-analyze-results-'
const V8_DIRECTORY = 'pruning-v8'

export interface ShardResults {
  shard: ExplainShard
  results: readonly ExplainResult[]
  repeatedResults: readonly ExplainResult[]
  completedScenarioIds: readonly string[]
}

export interface MergedResults {
  results: ExplainResult[]
  repeatedResults: ExplainResult[]
  completedScenarioIds: string[]
}

/**
 * Join the shards into the single run analyze.mts gates. Each shard must have completed exactly
 * its own subset, and together they must cover the whole manifest once.
 */
export function mergeShardResults(
  shards: readonly ShardResults[],
  manifest: readonly string[] = EXPLAIN_SCENARIO_MANIFEST,
): MergedResults {
  const names = shards.map(shard => shard.shard).toSorted()
  if (JSON.stringify(names) !== JSON.stringify(EXPLAIN_SHARDS.toSorted()))
    throw new Error(
      `Expected one result set per shard (${EXPLAIN_SHARDS.join(', ')}); got ${names.join(', ')}`,
    )
  const ordered = EXPLAIN_SHARDS.map(name => shards.find(shard => shard.shard === name)!)
  for (const shard of ordered)
    assertScenarioManifest(
      shard.completedScenarioIds,
      getShardScenarioIds(shard.shard, manifest),
      shard.shard,
    )
  const completedScenarioIds = ordered.flatMap(shard => [...shard.completedScenarioIds])
  assertScenarioManifest(completedScenarioIds, manifest)
  return {
    results: ordered.flatMap(shard => [...shard.results]),
    repeatedResults: ordered.flatMap(shard => [...shard.repeatedResults]),
    completedScenarioIds,
  }
}

// Native V8 records from both shards feed one LCOV conversion; prefix the names so two runners
// that happened to pick the same process id and instant cannot overwrite each other. The
// converter reads only `coverage-*.json`, so the prefix goes after that stem.
function copyV8Coverage(shard: ExplainShard, shardDirectory: string, outputDir: string): void {
  const source = join(shardDirectory, V8_DIRECTORY)
  if (!existsSync(source)) return
  const target = join(outputDir, V8_DIRECTORY)
  mkdirSync(target, { recursive: true })
  for (const file of readdirSync(source))
    copyFileSync(join(source, file), join(target, file.replace(/^coverage-/, `coverage-${shard}-`)))
}

// The pruning proof runs in one shard; the merged output keeps its evidence beside the results.
function copyPruningProofs(shardDirectory: string, outputDir: string): void {
  for (const file of readdirSync(shardDirectory))
    if (file.startsWith('pruning-proof-') && file.endsWith('.json'))
      copyFileSync(join(shardDirectory, file), join(outputDir, file))
}

/** Read each shard artifact directory and write the merged results-/repeat- pair into outputDir. */
export function mergeShardDirectories(shardsDirectory: string, outputDir: string): string {
  const shards = EXPLAIN_SHARDS.map((shard): ShardResults => {
    const directory = join(shardsDirectory, `${SHARD_ARTIFACT_PREFIX}${shard}`)
    const { results, repeatedResults, completedScenarioIds } = loadLatestPairedResults(directory)
    mkdirSync(outputDir, { recursive: true })
    copyV8Coverage(shard, directory, outputDir)
    copyPruningProofs(directory, outputDir)
    return { shard, results, repeatedResults, completedScenarioIds }
  })
  const merged = mergeShardResults(shards)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  mkdirSync(outputDir, { recursive: true })
  const resultsPath = join(outputDir, `results-${timestamp}.json`)
  writeFileSync(
    resultsPath,
    JSON.stringify({
      results: merged.results,
      completedScenarioIds: merged.completedScenarioIds,
    }),
  )
  writeFileSync(
    join(outputDir, `repeat-${timestamp}.json`),
    JSON.stringify({
      results: merged.repeatedResults,
      completedScenarioIds: merged.completedScenarioIds,
    }),
  )
  return resultsPath
}

if (import.meta.main) {
  const shardsDirectory = process.argv[2]
  if (!shardsDirectory) throw new Error('Usage: merge-shard-results.mts <shards-directory>')
  console.error(
    `Merged shard results into ${mergeShardDirectories(shardsDirectory, join(import.meta.dirname, 'output'))}`,
  )
}
