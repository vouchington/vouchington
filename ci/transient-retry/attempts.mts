import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { deriveRetryAttempt } from 'vouchington-tooling'

import { ghApi, type GhApiExecFile } from './gh-api.mts'
import type { WorkflowJobStep } from './types.mts'

const execFile = promisify(execFileCb)

export interface JobEntry {
  name: string
  id: number
  conclusion?: string
  steps?: WorkflowJobStep[]
}

export function parseWorkflowJobEntries(stdout: string): JobEntry[] {
  const pages = JSON.parse(stdout.trim()) as { jobs?: JobEntry[] }[]
  return pages.flatMap(page => page.jobs ?? [])
}

export const deriveRuleAttempt = deriveRetryAttempt

interface PriorAttemptJobCountOptions {
  repository: string
  runId: string
  runAttempt: number
  execFile?: GhApiExecFile
  sleep?: (ms: number) => Promise<void>
}

export async function fetchPriorAttemptJobCounts({
  repository,
  runId,
  runAttempt,
  execFile: ghApiExecFile = execFile,
  sleep,
}: PriorAttemptJobCountOptions): Promise<Array<number | null>> {
  return Promise.all(
    Array.from({ length: Math.max(0, runAttempt - 1) }, async (_, index) => {
      const attempt = index + 1
      try {
        const result = await ghApi(
          [
            `repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs`,
            '--paginate',
            '--slurp',
          ],
          { execFile: ghApiExecFile, sleep },
        )
        return parseWorkflowJobEntries(result.stdout).length
      } catch {
        return null
      }
    }),
  )
}
