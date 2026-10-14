import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Job = {
  steps?: Array<{ 'timeout-minutes'?: unknown }>
  'timeout-minutes'?: unknown
  uses?: string
}

const WORKFLOWS_DIR = '.github/workflows'

function declaredJobs(): Array<{ id: string; job: Job }> {
  return readdirSync(WORKFLOWS_DIR)
    .filter(file => /\.ya?ml$/.test(file))
    .flatMap(file => {
      const parsed = load(readFileSync(join(WORKFLOWS_DIR, file), 'utf8')) as {
        jobs?: Record<string, Job>
      }
      return Object.entries(parsed.jobs ?? {}).map(([name, job]) => ({
        id: `${file}#${name}`,
        job,
      }))
    })
}

function stepTimeouts(job: Job): number[] {
  return (job.steps ?? []).flatMap(step => {
    const timeout = step['timeout-minutes']
    return typeof timeout === 'number' ? [timeout] : []
  })
}

// Owner rule: a job's timeout-minutes is strictly below the sum of its steps' timeout-minutes
// and at least its largest step. A job with a single bounded step has no valid range to size
// within, so it is skipped until the shared static rule decides how to treat it
// (jonathanong/no-mistakes#1963).
describe('workflow job timeouts', () => {
  const sized = declaredJobs().filter(({ job }) => !job.uses && stepTimeouts(job).length >= 2)

  it('covers the multi-bounded-step jobs', () => {
    expect(sized.length).toBeGreaterThan(50)
  })

  it.each(sized.map(({ id, job }) => [id, job] as const))(
    '%s caps the job below the step sum and at or above the largest step',
    (_id, job) => {
      const timeouts = stepTimeouts(job)
      const jobTimeout = job['timeout-minutes']

      expect(jobTimeout).toBeTypeOf('number')
      expect(jobTimeout as number).toBeLessThan(timeouts.reduce((sum, value) => sum + value, 0))
      expect(jobTimeout as number).toBeGreaterThanOrEqual(Math.max(...timeouts))
    },
  )
})
