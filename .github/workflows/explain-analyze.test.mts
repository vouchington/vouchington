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
    // `date -u` ignores TZ. A zone whose local day differs (UTC+14 at/after 10:00, else UTC-11)
    // fails the step if it formats the local day. The test shims `date` so it does not depend on
    // the host flavor (GNU `-d` is unavailable in BSD date): Node computes both days and the shim
    // answers only the two exact calls the workflow may make, `-u` for UTC and none for local.
    const script = `
set -euo pipefail
date() {
  case "$*" in
    "-u +%Y-%m-%d") printf '%s\\n' "$VOUCH_UTC_DAY" ;;
    "+%Y-%m-%d") printf '%s\\n' "$VOUCH_LOCAL_DAY" ;;
    *) echo "unexpected date call: $*" >&2; return 1 ;;
  esac
}
${pinStep?.run ?? 'exit 1'}
printf '%s\\n' "$VOUCH_UTC_DAY" "$VOUCH_LOCAL_DAY"
`
    for (const instant of proofInstants()) {
      const directory = mkdtempSync(join(tmpdir(), 'explain-anchor-'))
      const githubEnv = join(directory, 'github-env')
      const at = new Date(instant)
      const zone = at.getUTCHours() >= 10 ? 'Pacific/Kiritimati' : 'Pacific/Pago_Pago'
      const utcDay = at.toISOString().slice(0, 10)
      const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(at)
      try {
        const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
          env: {
            ...process.env,
            GITHUB_ENV: githubEnv,
            VOUCH_UTC_DAY: utcDay,
            VOUCH_LOCAL_DAY: localDay,
          },
          encoding: 'utf8',
        })
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
        expect(result.stdout.trim().split('\n')).toEqual([utcDay, localDay])
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
