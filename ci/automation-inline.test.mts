import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function run(script: string, env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'automation-script-'))
  const output = join(dir, 'output')
  writeFileSync(output, '')
  writeFileSync(
    join(dir, 'gh'),
    '#!/bin/sh\ncase "$*" in */issues/comments/*) printf "%s\\n" "$FAKE_COMMENT";; *) printf "%s\\n" "$FAKE_GH_VALUE";; esac\n',
  )
  chmodSync(join(dir, 'gh'), 0o755)
  try {
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', `ci/automation-inline/${script}.sh`],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          ...env,
          PATH: `${dir}:${process.env.PATH ?? ''}`,
          GITHUB_OUTPUT: output,
        },
      },
    )
    return { status: result.status, output: readFileSync(output, 'utf8') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('automation decisions', () => {
  it.each([
    ['true', 'dispatch', 'true', 'should_dispatch=true\n'],
    ['false', 'dispatch', 'true', 'should_dispatch=false\n'],
    ['true', 'rerun', 'true', 'should_dispatch=false\n'],
    ['true', 'dispatch', 'false', 'should_dispatch=false\n'],
  ])('dispatch checks source, decision and gate', (current, decision, enabled, expected) => {
    expect(
      run('fix-main-dispatch-decision', {
        SOURCE_CURRENT: current,
        DECISION: decision,
        HARNESS_AGENT_DISPATCH_ENABLED: enabled,
      }),
    ).toEqual({ status: 0, output: expected })
  })
  it.each([
    ['rerun', '2', 'retry_pending=true\n'],
    ['rerun', '3', 'retry_pending=false\n'],
    ['dispatch', '2', 'retry_pending=false\n'],
  ])('limits retry pending by decision and attempt', (decision, attempt, expected) => {
    expect(run('fix-main-retry-pending', { DECISION: decision, RUN_ATTEMPT: attempt })).toEqual({
      status: 0,
      output: expected,
    })
  })
  it.each([
    [
      { ESCALATE_STATE_OUTCOME: 'success', ESCALATE_CONCLUSION: 'success' },
      'disposition=handled\n',
    ],
    [{ SOURCE_OUTCOME: 'success', SOURCE_CURRENT: 'false' }, 'disposition=handled\n'],
    [{ DECISION: 'rerun', FAILED_JOBS_RERUN_OUTCOME: 'success' }, 'disposition=handled\n'],
    [{}, 'disposition=unhandled\n'],
  ])('records the self-retry disposition', (override, expected) => {
    expect(
      run('self-retry-disposition', {
        ESCALATE_STATE_OUTCOME: '',
        ESCALATE_CONCLUSION: '',
        SOURCE_OUTCOME: '',
        SOURCE_CURRENT: '',
        DECISION: '',
        FAILED_JOBS_RERUN_OUTCOME: '',
        ...override,
      }),
    ).toEqual({ status: 0, output: expected })
  })
})

describe('Dependabot source validation', () => {
  const env = {
    WORKFLOW_NAME: 'Checks',
    CONCLUSION: 'failure',
    RUN_ATTEMPT: '2',
    HTML_URL: 'https://example.test/run',
    HEAD_BRANCH: 'dependabot/test',
    PR_NUMBER: '123',
    SOURCE_STATE_CURRENT: 'true',
    TRANSIENT_DECISION: 'dispatch',
    EVENT_HEAD_SHA: 'abc',
    GITHUB_REPOSITORY: 'o/r',
    FAKE_GH_VALUE: 'abc',
  }
  it.each([
    [{}, 'pr_number=123\nshould_dispatch=true\n'],
    [{ FAKE_GH_VALUE: 'other' }, 'pr_number=123\nshould_dispatch=false\n'],
    [{ SOURCE_STATE_CURRENT: 'false' }, 'pr_number=123\nshould_dispatch=false\n'],
    [{ TRANSIENT_DECISION: 'rerun' }, 'pr_number=123\nshould_dispatch=false\n'],
  ])('triages only current source and matching PR head', (override, output) => {
    expect(run('dependabot-triage', { ...env, ...override })).toEqual({ status: 0, output })
  })
  it.each([
    ['abc', 0, 'current=true\n'],
    ['other', 1, ''],
  ])('revalidates the exact head', (head, status, output) => {
    expect(run('dependabot-validate-head', { ...env, FAKE_GH_VALUE: head })).toEqual({
      status,
      output,
    })
  })
})

describe('issue trigger validation', () => {
  it.each([
    ['123', '{"body":"/fix\\nmore"}', 0, 'valid=true\n'],
    ['123', '{"body":"/other"}', 0, ''],
    ['', '{"body":"/fix"}', 1, ''],
  ])('accepts only an open issue with the original command', (number, comment, status, output) => {
    expect(
      run('issue-validate-trigger', {
        GITHUB_REPOSITORY: 'o/r',
        ISSUE_NUMBER: '123',
        TRIGGER_COMMENT_ID: '5',
        FAKE_GH_VALUE: number,
        FAKE_COMMENT: comment,
      }),
    ).toEqual({ status, output })
  })
})

describe('main failure escalation', () => {
  it.each([
    ['', 'issue create'],
    ['42', 'issue comment 42'],
  ])('opens or updates an issue with fake gh', (existing, expected) => {
    const dir = mkdtempSync(join(tmpdir(), 'main-escalation-'))
    const trace = join(dir, 'trace')
    const gh = join(dir, 'gh')
    writeFileSync(
      gh,
      `#!/bin/sh
if [ "$1 $2" = 'issue list' ]; then printf '%s\\n' "$FAKE_EXISTING"; exit 0; fi
printf '%s\\n' "$*" > "$FAKE_TRACE"
`,
    )
    chmodSync(gh, 0o755)
    try {
      const result = spawnSync(
        'bash',
        [
          '--noprofile',
          '--norc',
          '-e',
          '-o',
          'pipefail',
          'ci/automation-inline/fix-main-escalate.sh',
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH ?? ''}`,
            FAKE_EXISTING: existing,
            FAKE_TRACE: trace,
            FAILED_WORKFLOW_NAME: 'Checks',
            FAILED_RUN_URL: 'https://example.test/run',
            FAILED_COMMIT_SHA: 'abc',
            GITHUB_SERVER_URL: 'https://example.test',
            GITHUB_REPOSITORY: 'o/r',
            GITHUB_RUN_ID: '9',
            RENDER_PROMPT_RESULT: 'failure',
            DISPATCH_RESULT: 'skipped',
            SESSION_ID: '',
          },
        },
      )
      expect(result.status).toBe(0)
      expect(readFileSync(trace, 'utf8')).toContain(expected)
      expect(readFileSync(trace, 'utf8')).toContain('render-prompt (failure)')
      expect(readFileSync(trace, 'utf8')).toContain('https://example.test/o/r/actions/runs/9')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
