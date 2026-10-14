import { readdirSync, readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = { if?: string; uses?: string; run?: string; 'timeout-minutes'?: number }
type Workflow = { jobs?: Record<string, { services?: Record<string, unknown>; steps?: Step[] }> }

const WORKFLOW_DIR = '.github/workflows'
const workflows = readdirSync(WORKFLOW_DIR)
  .filter(file => file.endsWith('.yml'))
  .map(file => ({
    file,
    parsed: load(readFileSync(`${WORKFLOW_DIR}/${file}`, 'utf8')) as Workflow,
  }))

describe('Valkey test container', () => {
  it('runs as a step container so a green job prints no Valkey logs', () => {
    for (const { parsed } of workflows) {
      for (const job of Object.values(parsed.jobs ?? {})) {
        expect(job.services?.valkey).toBeUndefined()
      }
    }
  })

  it('exports VALKEY_URL under a hard deadline and prints logs only on failure', () => {
    const action = load(readFileSync('.github/actions/start-valkey/action.yml', 'utf8')) as {
      runs?: { steps?: Array<Step & { env?: Record<string, string> }> }
    }
    const [start] = action.runs?.steps ?? []
    expect(start?.env?.VALKEY_IMAGE).toMatch(
      /^mirror\.gcr\.io\/valkey\/valkey-bundle:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/u,
    )
    expect(start?.run).toContain('timeout 60')
    expect(start?.run).toContain('VALKEY_URL=redis://localhost:6379')
  })

  it('pairs every start with a failure-only log step in the same job', () => {
    let starts = 0
    for (const { parsed } of workflows) {
      for (const job of Object.values(parsed.jobs ?? {})) {
        const steps = job.steps ?? []
        const start = steps.findIndex(step => step.uses === './.github/actions/start-valkey')
        if (start < 0) continue
        starts += 1
        const logs = steps.findIndex(step => step.uses === './.github/actions/valkey-logs')
        expect(logs).toBeGreaterThan(start)
        expect(steps[logs]?.if).toBe('failure()')
      }
    }
    expect(starts).toBeGreaterThan(0)
  })
})
