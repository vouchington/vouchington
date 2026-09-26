import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { GITHUB_MATRIX_MAX_JOBS } from '../shard-limits.mts'
import { shardedJobPolicies } from './project-ownership-registry.mts'

const SHARDED_JOB_POLICIES = shardedJobPolicies()

function shardTotalFor(fileCount: number, filesPerShard: number): number {
  return Math.min(GITHUB_MATRIX_MAX_JOBS, Math.max(1, Math.ceil(fileCount / filesPerShard)))
}

export function parseFilesPerShardOverride(override: string | undefined): number | undefined {
  if (override === undefined || override === '') return undefined
  if (!/^[1-9][0-9]*$/.test(override)) {
    throw new Error(
      `files-per-shard override must be a positive integer, got: ${JSON.stringify(override)}`,
    )
  }
  return Number(override)
}

export function resolveShardTotalFromSuiteCount(
  job: string,
  suiteFileCount?: number,
  filesPerShardOverride?: string,
): number {
  const policy = SHARDED_JOB_POLICIES[job]
  if (policy === undefined) throw new Error(`No sharding policy is registered for ${job}`)
  if (policy.mode === 'fixed') return policy.shards

  if (suiteFileCount === undefined || suiteFileCount <= 0) {
    throw new Error(`live suite file count for ${job} must be a positive integer`)
  }
  const filesPerShard = parseFilesPerShardOverride(filesPerShardOverride) ?? policy.filesPerShard
  return shardTotalFor(suiteFileCount, filesPerShard)
}

export async function resolveShardTotal(
  job: string,
  worktreeRoot = process.cwd(),
  filesPerShardOverride?: string,
): Promise<number> {
  const policy = SHARDED_JOB_POLICIES[job]
  if (policy === undefined) throw new Error(`No sharding policy is registered for ${job}`)
  if (policy.mode === 'fixed') return policy.shards
  const { countJobSuiteFiles } = await import('./job-suite-count.mts')
  return resolveShardTotalFromSuiteCount(
    job,
    countJobSuiteFiles(worktreeRoot).get(job),
    filesPerShardOverride,
  )
}

function writeOutput(key: string, value: string): void {
  const output = process.env['GITHUB_OUTPUT']
  if (output) appendFileSync(output, `${key}=${value}\n`)
  console.log(`[shard-total] ${key}=${value}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [job] = process.argv.slice(2)
  if (job === undefined) throw new Error('usage: node ci/vitest/shard-total.mts <job>')
  void resolveShardTotal(job, undefined, process.env['FILES_PER_SHARD_OVERRIDE']).then(total =>
    writeOutput('shard-total', String(total)),
  )
}
