import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { GITHUB_MATRIX_MAX_JOBS } from '../shard-limits.mts'
import { shardedJobPolicies } from './project-ownership-registry.mts'

const SHARDED_JOB_POLICIES = shardedJobPolicies()

export function parseShardTotalOverride(override: string | undefined): number | undefined {
  if (override === undefined || override === '') return undefined
  if (!/^[1-9][0-9]*$/.test(override)) {
    throw new Error(
      `shard-total override must be a positive integer, got: ${JSON.stringify(override)}`,
    )
  }
  const total = Number(override)
  if (total > GITHUB_MATRIX_MAX_JOBS) {
    throw new Error(`shard-total override must not exceed ${GITHUB_MATRIX_MAX_JOBS}, got: ${total}`)
  }
  return total
}

export function shardTotalFor(fileCount: number, filesPerShard: number): number {
  return Math.min(GITHUB_MATRIX_MAX_JOBS, Math.max(1, Math.ceil(fileCount / filesPerShard)))
}

export function resolveShardTotalFromSuiteCount(
  job: string,
  override?: string,
  suiteFileCount?: number,
): number {
  const policy = SHARDED_JOB_POLICIES[job]
  if (policy === undefined) throw new Error(`No sharding policy is registered for ${job}`)

  const overrideTotal = parseShardTotalOverride(override)
  if (overrideTotal !== undefined) return overrideTotal
  if (policy.mode === 'fixed') return policy.shards

  if (suiteFileCount === undefined || suiteFileCount <= 0) {
    throw new Error(`live suite file count for ${job} must be a positive integer`)
  }
  return shardTotalFor(suiteFileCount, policy.filesPerShard)
}

export async function resolveShardTotal(
  job: string,
  override?: string,
  worktreeRoot = process.cwd(),
): Promise<number> {
  const policy = SHARDED_JOB_POLICIES[job]
  if (policy === undefined) throw new Error(`No sharding policy is registered for ${job}`)
  if (parseShardTotalOverride(override) !== undefined || policy.mode === 'fixed') {
    return resolveShardTotalFromSuiteCount(job, override)
  }
  const { countJobSuiteFiles } = await import('./job-suite-count.mts')
  return resolveShardTotalFromSuiteCount(job, override, countJobSuiteFiles(worktreeRoot).get(job))
}

function writeOutput(key: string, value: string): void {
  const output = process.env['GITHUB_OUTPUT']
  if (output) appendFileSync(output, `${key}=${value}\n`)
  console.log(`[shard-total] ${key}=${value}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [job] = process.argv.slice(2)
  if (job === undefined) throw new Error('usage: node ci/vitest/shard-total.mts <job>')
  void resolveShardTotal(job, process.env['SHARD_TOTAL_OVERRIDE']).then(total =>
    writeOutput('shard-total', String(total)),
  )
}
