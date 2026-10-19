import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  id?: string
  if?: string
  uses?: string
  env?: Record<string, string>
  name?: string
  run?: string
  with?: { path?: string; suite?: string; 'name-suffix'?: string }
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
  it('runs the real RSS tier snapshot contract after migration and publishes its producer coverage', () => {
    const { steps } = explainAnalyzeJob()
    const migration = stepIndexRunning(steps, 'node data-stores/psql/migrate.mts')
    const rss = stepIndexRunning(steps, 'node backend/scripts/check-rss-feed-crawl-tiers.mts')
    const seed = stepIndexRunning(steps, 'node backend/scripts/seeds/dev-seed.mts')
    const converter = steps[stepIndexRunning(steps, 'pnpm exec coverage-check native-v8-to-lcov')]

    expect(migration).toBeLessThan(rss)
    expect(rss).toBeLessThan(seed)
    expect(steps[rss]?.env?.NODE_DISABLE_COMPILE_CACHE).toBe('1')
    expect(steps[rss]?.env?.NODE_V8_COVERAGE).toBe(
      '${{ github.workspace }}/backend/scripts/explain-analyze/output/pruning-v8',
    )
    expect(converter?.run).toContain(
      "--include 'backend/services/rss-feeds/{get-to-fetch,crawl-config,update,update-fields,update-state-helpers}.mts'",
    )
  })

  it('checks native planner and rollback contracts after migration and before seeding', () => {
    const { steps } = explainAnalyzeJob()
    const migration = stepIndexRunning(steps, 'node data-stores/psql/migrate.mts')
    const preflight = stepIndexRunning(
      steps,
      'node backend/scripts/explain-analyze/assert-native-contracts.mts',
    )
    const seed = stepIndexRunning(steps, 'node backend/scripts/seeds/dev-seed.mts')
    expect(migration).toBeLessThan(preflight)
    expect(preflight).toBeLessThan(seed)
    expect(steps[preflight]?.env?.NODE_V8_COVERAGE).toBe(
      '${{ github.workspace }}/backend/scripts/explain-analyze/output/pruning-v8',
    )
  })

  it('retains native pruning and retirement V8 coverage in the existing uploaded output', () => {
    const { steps } = explainAnalyzeJob()
    const pruning = steps[stepIndexRunning(steps, 'explain-analyze/pruning/run.mts')]
    expect(pruning?.env?.NODE_DISABLE_COMPILE_CACHE).toBe('1')
    expect(pruning?.env?.NODE_V8_COVERAGE).toBe(
      '${{ github.workspace }}/backend/scripts/explain-analyze/output/pruning-v8',
    )
    const converter = steps[stepIndexRunning(steps, 'pnpm exec coverage-check native-v8-to-lcov')]
    expect(converter?.run).toContain('pnpm exec coverage-check native-v8-to-lcov')
    expect(converter?.run).toContain('--v8-dir backend/scripts/explain-analyze/output/pruning-v8')
    expect(converter?.run).toContain('--source-root "$GITHUB_WORKSPACE"')
    expect(converter?.run).toContain(
      '--output backend/scripts/explain-analyze/output/retirement-coverage/lcov.info',
    )
    expect(steps.find(step => step.name === 'Upload EXPLAIN ANALYZE results')?.with?.path).toBe(
      'backend/scripts/explain-analyze/output/',
    )
  })
})

describe('native migration coverage fan-in', () => {
  it('publishes the real native producer LCOV before the required backend coverage check', () => {
    const { steps } = explainAnalyzeJob()
    const conversion = stepIndexRunning(steps, 'pnpm exec coverage-check native-v8-to-lcov')
    const preserve = stepIndexRunning(
      steps,
      'cp backend/scripts/explain-analyze/output/retirement-coverage/lcov.info',
    )
    expect(preserve).toBeGreaterThan(conversion)
    expect(steps[conversion]?.run).toContain("--include 'backend/data-stores/psql/migrate.mts'")
    const uploads = steps.filter(step => step.uses === './.github/actions/upload-full-lcov')
    expect(uploads.map(step => step.with)).toEqual([
      { suite: 'backend-native-migrations' },
      { suite: 'backend-native-migrations', 'name-suffix': '-retry' },
    ])
    expect(steps.indexOf(uploads[0]!)).toBeGreaterThan(preserve)
    const backend = load(readFileSync('.github/workflows/backend.yml', 'utf8')) as {
      jobs: Record<
        string,
        { needs?: string[]; with?: { publish_coverage?: boolean; uploads?: string } }
      >
    }
    expect(backend.jobs['test-explain-analyze']?.with?.publish_coverage).toBe(true)
    expect(backend.jobs.coverage?.needs).toContain('test-explain-analyze')
    expect(backend.jobs.codecov?.needs).toContain('test-explain-analyze')
    const uploadPolicies: unknown = JSON.parse(backend.jobs.codecov?.with?.uploads ?? '[]')
    expect(uploadPolicies).toContainEqual({
      flag: 'backend-native-migrations',
      pattern: 'lcov-full-backend-native-migrations*',
    })
  })
})
