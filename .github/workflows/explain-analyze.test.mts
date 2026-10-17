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
  with?: { path?: string }
}

type Workflow = {
  jobs: { 'explain-analyze': { env?: Record<string, string>; steps: Step[] } }
}

const ANCHOR_ENV = 'EXPLAIN_SEED_ANCHOR_DATE'
const PROOF_INSTANTS = [
  '2026-10-05T23:59:40Z',
  '2026-10-06T00:01:13Z',
  '2026-10-31T12:00:00Z',
] as const

function proofInstants(): readonly string[] {
  const override = process.env.VOUCH_PROOF_NOW
  if (override === undefined) return PROOF_INSTANTS
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(override)) {
    throw new Error('VOUCH_PROOF_NOW must be a UTC instant')
  }
  return [override]
}

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

  it('exports the pinned UTC day, not the runner zone day', () => {
    const pinStep = explainAnalyzeJob().steps.find(candidate =>
      candidate.run?.includes(`${ANCHOR_ENV}=`),
    )
    // date -u ignores TZ. A zone whose local day differs (UTC+14 at/after 10:00, else UTC-11)
    // fails the step if it formats the local day. The instant is injected into `date -d`.
    const script = `
set -euo pipefail
hour=$(command date -u -d "$VOUCH_INSTANT" +%H)
if [ "$hour" -ge 10 ]; then
  export TZ=Pacific/Kiritimati
else
  export TZ=Pacific/Pago_Pago
fi
date() { command date -d "$VOUCH_INSTANT" "$@"; }
utc_day=$(date -u +%Y-%m-%d)
local_day=$(date +%Y-%m-%d)
${pinStep?.run ?? 'exit 1'}
printf '%s\\n' "$utc_day" "$local_day"
`
    for (const instant of proofInstants()) {
      const directory = mkdtempSync(join(tmpdir(), 'explain-anchor-'))
      const githubEnv = join(directory, 'github-env')
      try {
        const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
          env: { ...process.env, GITHUB_ENV: githubEnv, VOUCH_INSTANT: instant },
          encoding: 'utf8',
        })
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
        const [utcDay, localDay] = result.stdout.trim().split('\n')
        const exported = readFileSync(githubEnv, 'utf8')
        expect(exported).toBe(`${ANCHOR_ENV}=${utcDay}\n`)
        expect(localDay).not.toBe(utcDay)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  })

  it('is not overridden by the job or any step, so the seed and run steps cannot diverge', () => {
    const job = explainAnalyzeJob()

    expect(job.env?.[ANCHOR_ENV]).toBeUndefined()
    expect(job.steps.filter(candidate => candidate.env?.[ANCHOR_ENV] !== undefined)).toEqual([])
  })
})

// The seed and run steps execute the same fixtures that the development seed encrypts, so a key
// that only the dev-seed step has fails in CI and never in a local run with the inline key (#2734).
describe('stored-secret encryption key', () => {
  it('is the same value on the development seed, EXPLAIN seed, and EXPLAIN run steps', () => {
    const { steps } = explainAnalyzeJob()
    const key = 'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS'
    const values = [
      'backend/scripts/seeds/dev-seed.mts',
      'explain-analyze/seed.mts',
      'explain-analyze/run.mts',
    ].map(script => steps[stepIndexRunning(steps, script)]?.env?.[key])

    expect(values[0]).toMatch(/^[\w-]+:raw32:/)
    expect(new Set(values).size).toBe(1)
  })
})

describe('native pruning coverage artifacts', () => {
  it('retains native pruning and retirement V8 coverage in the existing uploaded output', () => {
    const { steps } = explainAnalyzeJob()
    const pruning = steps[stepIndexRunning(steps, 'explain-analyze/pruning/run.mts')]
    expect(pruning?.env?.NODE_DISABLE_COMPILE_CACHE).toBe('1')
    expect(pruning?.env?.NODE_V8_COVERAGE).toBe(
      '${{ github.workspace }}/backend/scripts/explain-analyze/output/pruning-v8',
    )
    const converter = steps.find(
      step => step.name === 'Convert native pruning coverage with published c8',
    )
    expect(converter?.run).toContain('node node_modules/c8/bin/c8.js report')
    expect(converter?.run).toContain('--reporter lcovonly')
    expect(converter?.run).toContain('--extension .mts')
    expect(converter?.run).toContain('backend/scripts/explain-analyze/output/retirement-coverage')
    expect(steps.find(step => step.name === 'Upload EXPLAIN ANALYZE results')?.with?.path).toBe(
      'backend/scripts/explain-analyze/output/',
    )
  })
})
