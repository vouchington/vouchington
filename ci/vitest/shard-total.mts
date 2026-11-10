import { appendFileSync } from 'node:fs'

import { GITHUB_MATRIX_MAX_JOBS } from '../shard-limits.mts'
import { shardedJobPolicies } from './project-ownership-registry.mts'

const SHARDED_JOB_POLICIES = shardedJobPolicies()

function shardTotalFor(fileCount: number, filesPerShard: number): number {
  return Math.min(GITHUB_MATRIX_MAX_JOBS, Math.max(1, Math.ceil(fileCount / filesPerShard)))
}

export function resolveShardTotalFromSuiteCount(job: string, suiteFileCount?: number): number {
  const policy = SHARDED_JOB_POLICIES[job]
  if (policy === undefined) throw new Error(`No sharding policy is registered for ${job}`)
  if (policy.mode === 'fixed') return policy.shards

  if (suiteFileCount === undefined || suiteFileCount <= 0) {
    throw new Error(`live suite file count for ${job} must be a positive integer`)
  }
  return shardTotalFor(suiteFileCount, policy.filesPerShard)
}

export async function resolveShardTotal(
  job: string,
  worktreeRoot = process.cwd(),
): Promise<number> {
  const policy = SHARDED_JOB_POLICIES[job]
  if (policy === undefined) throw new Error(`No sharding policy is registered for ${job}`)
  if (policy.mode === 'fixed') return policy.shards
  const { countJobSuiteFiles } = await import('./job-suite-count.mts')
  return resolveShardTotalFromSuiteCount(job, countJobSuiteFiles(worktreeRoot).get(job))
}

function writeOutput(key: string, value: string): void {
  const output = process.env['GITHUB_OUTPUT']
  if (output) appendFileSync(output, `${key}=${value}\n`)
  console.log(`[shard-total] ${key}=${value}`)
}

if (import.meta.main) {
  const [job] = process.argv.slice(2)
  if (job === undefined) throw new Error('usage: node ci/vitest/shard-total.mts <job>')
  void resolveShardTotal(job).then(total => writeOutput('shard-total', String(total)))
}
