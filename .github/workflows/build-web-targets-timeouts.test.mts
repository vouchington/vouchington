import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  assertNoWorkflowViolations,
  type WorkflowStep,
} from '../test-helpers/workflow-fixtures.mts'

// Each caller bounds the whole build-web-targets composite step, so its ceiling must cover every
// deadline the composite declares on its critical path: the cache restore (its per-segment download
// deadline plus a fixed allowance for lookup and extraction), the manifest verify, the bounded
// build, run-bounded's kill grace after each of those two deadlines, and a margin for the
// always() timing summary and upload, which run before the producer's cache save. The ceiling is that sum rounded up to a whole minute, so raising any one
// deadline without the callers fails here.
const BUILD_WEB_TARGETS = './.github/actions/build-web-targets'
const POST_DEADLINE_MARGIN_SECONDS = 60
const RESTORE_LOOKUP_EXTRACT_ALLOWANCE_SECONDS = 60

type Deadlines = { restore: number; verify: number; build: number; killGrace: number }

type Workflow = {
  jobs?: Record<string, { steps?: (WorkflowStep & { 'timeout-minutes'?: unknown })[] }>
}

type CallerTimeout = { job: string; timeoutMinutes: unknown }

function callerTimeouts(workflows: Record<string, Workflow>): CallerTimeout[] {
  return Object.entries(workflows).flatMap(([file, workflow]) =>
    Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
      (job.steps ?? [])
        .filter(step => step.uses === BUILD_WEB_TARGETS)
        .map(step => ({ job: `${file}#${jobName}`, timeoutMinutes: step['timeout-minutes'] })),
    ),
  )
}

function boundedSeconds(action: string, command: string): number {
  const match = new RegExp(`run-bounded\\.py" ([1-9]\\d*) ${command}`).exec(action)
  if (!match) throw new TypeError(`build-web-targets must run ${command} under run-bounded.py`)
  return Number(match[1])
}

function restoreSeconds(action: string): number {
  const match = /SEGMENT_DOWNLOAD_TIMEOUT_MINS: '([1-9]\d*)'/.exec(action)
  if (!match) throw new TypeError('build-web-targets must bound its cache restore download')
  return Number(match[1]) * 60 + RESTORE_LOOKUP_EXTRACT_ALLOWANCE_SECONDS
}

// run-bounded waits for SIGTERM, then for the relayed output pipes, before it returns.
function killGraceSeconds(runBounded: string, processSource: string): number {
  const term = /proc\.wait\(timeout=(\d+)\)/.exec(processSource)
  const relay = /RELAY_JOIN_SECONDS = (\d+)/.exec(runBounded)
  if (!term || !relay) throw new TypeError('run-bounded kill grace is no longer declared')
  return Number(term[1]) + Number(relay[1])
}

function readDeadlines(): Deadlines {
  const action = readFileSync('.github/actions/build-web-targets/action.yml', 'utf8')
  const runBounded = readFileSync('ci/run-bounded.py', 'utf8')
  const process = readFileSync('ci/run_bounded_process.py', 'utf8')
  return {
    restore: restoreSeconds(action),
    verify: boundedSeconds(action, 'node ci/web-build-cache-manifest\\.mts verify'),
    build: boundedSeconds(action, 'node ci/setup-web-integration\\.mts'),
    killGrace: killGraceSeconds(runBounded, process),
  }
}

function expectedMinutes(deadlines: Deadlines): number {
  const total =
    deadlines.restore +
    deadlines.verify +
    deadlines.build +
    2 * deadlines.killGrace +
    POST_DEADLINE_MARGIN_SECONDS
  return Math.ceil(total / 60)
}

function timeoutViolations(callers: readonly CallerTimeout[], deadlines: Deadlines): string[] {
  const expected = expectedMinutes(deadlines)
  return callers
    .filter(caller => caller.timeoutMinutes !== expected)
    .map(
      caller =>
        `${caller.job}: timeout-minutes is ${JSON.stringify(caller.timeoutMinutes)}, expected ${expected} ` +
        `(restore, verify, build and kill grace deadlines plus ${POST_DEADLINE_MARGIN_SECONDS}s)`,
    )
}

function readWorkflows(): Record<string, Workflow> {
  const files = readdirSync('.github/workflows').filter(file => /\.ya?ml$/.test(file))
  return Object.fromEntries(
    files.map(file => [file, load(readFileSync(join('.github/workflows', file), 'utf8'))]),
  ) as Record<string, Workflow>
}

describe('build-web-targets timeouts', () => {
  const deadlines: Deadlines = { restore: 120, verify: 30, build: 300, killGrace: 13 }

  it('sizes every caller step ceiling from the composite deadlines', () => {
    const callers = callerTimeouts(readWorkflows())

    // Guard against a vacuous pass: the static-web producer must be discovered.
    expect(callers.map(caller => caller.job)).toContain('checks-static.yml#static-web')
    assertNoWorkflowViolations(
      timeoutViolations(callers, readDeadlines()),
      'build-web-targets timeout violations',
    )
  })

  it('counts pre-build and kill-grace time, not only the build deadline', () => {
    expect(expectedMinutes(deadlines)).toBe(9)
    expect(expectedMinutes({ ...deadlines, restore: 0, verify: 0, killGrace: 0 })).toBe(6)
    // Both bounded commands can time out serially, so each spends its own kill grace.
    expect(expectedMinutes({ ...deadlines, verify: 45 })).toBe(10)
  })

  it('reports callers whose step ceiling is missing or does not match the deadlines', () => {
    const violations = timeoutViolations(
      [
        { job: 'a.yml#build', timeoutMinutes: 9 },
        { job: 'b.yml#test', timeoutMinutes: 6 },
        { job: 'd.yml#test', timeoutMinutes: undefined },
      ],
      deadlines,
    )

    const suffix = '(restore, verify, build and kill grace deadlines plus 60s)'
    expect(violations).toEqual([
      `b.yml#test: timeout-minutes is 6, expected 9 ${suffix}`,
      `d.yml#test: timeout-minutes is undefined, expected 9 ${suffix}`,
    ])
  })

  it('rejects a composite that leaves a step unbounded', () => {
    expect(() =>
      boundedSeconds('node ci/setup-web-integration.mts', 'node ci/setup-web-integration\\.mts'),
    ).toThrow('under run-bounded.py')
    expect(() => restoreSeconds('uses: actions/cache/restore')).toThrow('bound its cache restore')
    expect(() => killGraceSeconds('', '')).toThrow('kill grace')
  })
})
