import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  env?: Record<string, string>
  name?: string
  run?: string
}

type Workflow = {
  jobs: { 'explain-analyze': { env?: Record<string, string>; steps: Step[] } }
}

const ANCHOR_ENV = 'EXPLAIN_SEED_ANCHOR_DATE'

function explainAnalyzeJob() {
  const workflow = load(readFileSync('.github/workflows/explain-analyze.yml', 'utf8')) as Workflow
  return workflow.jobs['explain-analyze']
}

function stepIndexRunning(steps: readonly Step[], script: string): number {
  const index = steps.findIndex(candidate => candidate.run?.includes(script))
  expect(index).toBeGreaterThanOrEqual(0)
  return index
}

// seed.mts and run.mts are separate node processes. Each derives its seeded ids from the anchor
// day, so a UTC midnight between the two steps used to fail the job (#2110).
describe('explain-analyze seed anchor day', () => {
  it('is chosen in one step that precedes both the seed and the run step', () => {
    const { steps } = explainAnalyzeJob()
    const pinIndex = steps.findIndex(candidate => candidate.run?.includes(`${ANCHOR_ENV}=`))

    expect(pinIndex).toBeGreaterThanOrEqual(0)
    expect(pinIndex).toBeLessThan(stepIndexRunning(steps, 'explain-analyze/seed.mts'))
    expect(pinIndex).toBeLessThan(stepIndexRunning(steps, 'explain-analyze/run.mts'))
    expect(steps.filter(candidate => candidate.run?.includes(`${ANCHOR_ENV}=`))).toHaveLength(1)
  })

  it('exports the current UTC day to every later step', () => {
    const pinStep = explainAnalyzeJob().steps.find(candidate =>
      candidate.run?.includes(`${ANCHOR_ENV}=`),
    )
    const directory = mkdtempSync(join(tmpdir(), 'explain-anchor-'))
    const githubEnv = join(directory, 'github-env')
    try {
      const utcDayBefore = new Date().toISOString().slice(0, 10)
      // A zone far ahead of UTC proves the step reads the UTC day, not the runner's local day.
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', pinStep?.run ?? 'exit 1'], {
        env: { ...process.env, GITHUB_ENV: githubEnv, TZ: 'Pacific/Kiritimati' },
        encoding: 'utf8',
      })
      const utcDayAfter = new Date().toISOString().slice(0, 10)

      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
      const exported = readFileSync(githubEnv, 'utf8')
      expect(exported).toMatch(new RegExp(`^${ANCHOR_ENV}=\\d{4}-\\d{2}-\\d{2}\\n$`))
      expect([utcDayBefore, utcDayAfter]).toContain(exported.trim().slice(ANCHOR_ENV.length + 1))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('is not overridden by the job or any step, so the seed and run steps cannot diverge', () => {
    const job = explainAnalyzeJob()

    expect(job.env?.[ANCHOR_ENV]).toBeUndefined()
    expect(job.steps.filter(candidate => candidate.env?.[ANCHOR_ENV] !== undefined)).toEqual([])
  })
})
