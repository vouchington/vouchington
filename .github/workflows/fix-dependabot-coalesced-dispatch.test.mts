import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parsedDependabot as parsed } from '../test-helpers/fix-dependabot.test-helpers.mts'

const escalate = parsed.jobs?.['escalate']
const commentScript =
  escalate?.steps?.find(step => step.name === 'Comment failure on Dependabot PR')?.run ?? 'exit 99'

const dispatchName = 'Harness dispatch / Dispatch Auto Harness session'
const coalesced = { name: dispatchName, conclusion: 'cancelled', steps: [] }
const timedOut = {
  name: dispatchName,
  conclusion: 'cancelled',
  steps: [{ name: 'Dispatch session', conclusion: 'cancelled' }],
}

type Scenario = {
  dispatchResult: string
  sessionId?: string
  jobs?: unknown[] | 'fail'
}

function run({ dispatchResult, sessionId = '', jobs = [] }: Scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'fix-dependabot-escalate-'))
  const fixture = join(dir, 'jobs.json')
  const calls = join(dir, 'calls')
  writeFileSync(fixture, JSON.stringify({ jobs: jobs === 'fail' ? [] : jobs }))
  // Fake gh: the jobs lookup runs the real --jq filter through jq; the PR lookup passes the
  // head check; every mutating call is recorded.
  writeFileSync(
    join(dir, 'gh'),
    `#!/bin/bash
set -euo pipefail
case "$*" in
  "api repos/o/r/actions/runs/9/jobs"*)
    [[ "$FAKE_JOBS" == fail ]] && exit 1
    jq -r "$4" "$FAKE_FIXTURE" ;;
  "api repos/o/r/pulls/5"*) printf '%s\\n' "$EVENT_HEAD_SHA" ;;
  *) printf '%s\\n' "$*" >> "$FAKE_CALLS" ;;
esac
`,
  )
  chmodSync(join(dir, 'gh'), 0o755)
  try {
    const result = spawnSync('bash', ['-c', commentScript], {
      encoding: 'utf8',
      env: {
        PATH: `${dir}:${process.env['PATH']}`,
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_RUN_ID: '9',
        EVENT_HEAD_SHA: 'abc',
        HEAD_BRANCH: 'dependabot/x',
        FAILING_RUN_URL: 'https://example.test/failing',
        THIS_RUN_URL: 'https://example.test/this',
        PR_NUMBER: '5',
        SESSION_ID: sessionId,
        DISPATCH_RESULT: dispatchResult,
        FAKE_JOBS: jobs === 'fail' ? 'fail' : 'ok',
        FAKE_FIXTURE: fixture,
        FAKE_CALLS: calls,
      },
    })
    const posted = spawnSync('cat', [calls], { encoding: 'utf8' }).stdout
    return { status: result.status, stdout: result.stdout, posted: posted.includes('pr comment') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('fix-dependabot escalate for a coalesced dispatch', () => {
  it('passes the dispatch result into the escalate job', () => {
    expect(escalate?.env?.['DISPATCH_RESULT']).toBe('${{ needs.dispatch.result }}')
    expect(escalate?.if).toContain("needs.dispatch.result == 'cancelled'")
  })

  it('suppresses the comment when dispatch was cancelled with zero steps', () => {
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
  ] as const)('still comments for %s', (_name, scenario) => {
    const result = run(scenario as Scenario)
    expect(result.status).toBe(0)
    expect(result.posted).toBe(true)
  })
})
