import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'

import { describe, expect, it } from 'vitest'

type Job = { if?: string; env?: Record<string, string>; steps?: { run?: string }[] }
const workflow = parse(readFileSync('.github/workflows/merge-queue-ejection.yml', 'utf8')) as {
  jobs: Record<string, Job>
}
const escalate = workflow.jobs['escalate']
const script = escalate?.steps?.at(-1)?.run ?? 'exit 99'

const dispatchJob = (steps: unknown[]) => ({
  name: 'Harness dispatch / Dispatch Auto Harness session',
  conclusion: 'cancelled',
  steps,
})
const coalesced = dispatchJob([])
const timedOut = dispatchJob([{ name: 'Dispatch session', conclusion: 'cancelled' }])

type Scenario = { dispatchResult: string; sessionId?: string; jobs: unknown[] | 'fail' }

// Fake gh: the jobs lookup runs the workflow's real --jq filter through jq; every other call is
// recorded so the test can see whether the failure comment was posted.
function run({ dispatchResult, sessionId = '', jobs }: Scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'merge-queue-ejection-escalate-'))
  const fixture = join(dir, 'jobs.json')
  const calls = join(dir, 'calls')
  writeFileSync(fixture, JSON.stringify({ jobs: jobs === 'fail' ? [] : jobs }))
  writeFileSync(calls, '')
  writeFileSync(
    join(dir, 'gh'),
    `#!/bin/bash
set -euo pipefail
case "$*" in
  "api repos/o/r/actions/runs/9/jobs"*) [[ "$FAKE_JOBS" == fail ]] && exit 1; jq -r "$4" "$FAKE_FIXTURE" ;;
  *) printf '%s\\n' "$*" >> "$FAKE_CALLS" ;;
esac
`,
  )
  chmodSync(join(dir, 'gh'), 0o755)
  try {
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        PATH: `${dir}:${process.env['PATH']}`,
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_RUN_ID: '9',
        PR_NUMBER: '5',
        REASON: 'CI_FAILURE',
        SESSION_ID: sessionId,
        DISPATCH_RESULT: dispatchResult,
        THIS_RUN_URL: 'https://example.test/this',
        FAKE_JOBS: jobs === 'fail' ? 'fail' : 'ok',
        FAKE_FIXTURE: fixture,
        FAKE_CALLS: calls,
      },
    })
    const posted = readFileSync(calls, 'utf8').includes('pr comment 5')
    return { status: result.status, stdout: result.stdout, posted }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('merge-queue ejection escalate for a coalesced dispatch', () => {
  it('passes the dispatch result into the escalate job', () => {
    expect(escalate?.env?.['DISPATCH_RESULT']).toBe('${{ needs.dispatch.result }}')
    expect(escalate?.if).toContain("needs.dispatch.result == 'cancelled'")
  })

  it('stays quiet when dispatch was cancelled with zero steps', () => {
    const result = run({ dispatchResult: 'cancelled', jobs: [coalesced] })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('::notice::Dispatch was cancelled by concurrency coalescing')
    expect(result.posted).toBe(false)
  })

  it.each([
    [
      'a cancellation that executed steps (timeout)',
      { dispatchResult: 'cancelled', jobs: [timedOut] },
    ],
    ['no dispatch job found', { dispatchResult: 'cancelled', jobs: [] }],
    ['a failed lookup (fail open)', { dispatchResult: 'cancelled', jobs: 'fail' }],
    ['a dispatch failure', { dispatchResult: 'failure', jobs: [coalesced] }],
    ['a known session id', { dispatchResult: 'cancelled', sessionId: 's1', jobs: [coalesced] }],
    ['a render failure', { dispatchResult: 'skipped', jobs: [] }],
  ] as const)('still comments for %s', (_name, scenario) => {
    const result = run(scenario as Scenario)
    expect(result.status).toBe(0)
    expect(result.posted).toBe(true)
  })
})
