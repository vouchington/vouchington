import { describe, expect, it } from 'vitest'

import {
  extractToolOutcome,
  isCompactRestart,
  isFailureCandidate,
  isMilestoneCandidate,
} from '../checkpoints.mts'

describe('extractToolOutcome', () => {
  it('classifies the success object shape', () => {
    expect(
      extractToolOutcome({
        tool_response: { interrupted: false, isImage: false, stderr: 'e', stdout: 'o' },
      }),
    ).toEqual({ kind: 'success', stderr: 'e', stdout: 'o' })
  })

  it('classifies the failure string shape', () => {
    expect(extractToolOutcome({ tool_response: 'Error: Exit code 1: boom' })).toEqual({
      kind: 'failure',
      message: 'Error: Exit code 1: boom',
    })
  })

  it('classifies a nonzero exit_code object (Grok, normalized Cursor) as failure', () => {
    expect(extractToolOutcome({ tool_response: { exit_code: 1, stdout: 'boom' } })).toEqual({
      kind: 'failure',
      message: 'Error: Exit code 1\nboom',
    })
  })

  it('classifies a zero exit_code object as success', () => {
    expect(extractToolOutcome({ tool_response: { exit_code: 0, stdout: 'ok' } })).toEqual({
      kind: 'success',
      stderr: '',
      stdout: 'ok',
    })
  })

  it('classifies a non-"Error: Exit code" string as Codex output', () => {
    expect(extractToolOutcome({ tool_response: 'ok' })).toEqual({ kind: 'output', text: 'ok' })
  })

  it('falls back to toolResponse and defaults missing stdout/stderr to empty strings', () => {
    expect(extractToolOutcome({ toolResponse: {} })).toEqual({
      kind: 'success',
      stderr: '',
      stdout: '',
    })
  })

  it('treats a missing tool_response as unknown', () => {
    expect(extractToolOutcome({})).toEqual({ kind: 'unknown' })
  })
})

describe('isCompactRestart', () => {
  it('is true only when source is compact', () => {
    expect(isCompactRestart({ source: 'compact' })).toBe(true)
    expect(isCompactRestart({ source: 'startup' })).toBe(false)
    expect(isCompactRestart({})).toBe(false)
  })
})

describe('isFailureCandidate', () => {
  it('matches a high-signal command with a failure outcome', () => {
    expect(
      isFailureCandidate({
        tool_input: { command: 'npx vitest run dev/foo.test.mts' },
        tool_response: 'Error: Exit code 1: some failure',
      }),
    ).toEqual({
      command: 'npx vitest run dev/foo.test.mts',
      message: 'Error: Exit code 1: some failure',
    })
  })

  it('ignores a failure from a low-signal command', () => {
    expect(
      isFailureCandidate({
        tool_input: { command: 'ls -la' },
        tool_response: 'Error: Exit code 2: no such file',
      }),
    ).toBeNull()
  })

  it('ignores a successful high-signal command', () => {
    expect(
      isFailureCandidate({
        tool_input: { command: 'npx vitest run dev/foo.test.mts' },
        tool_response: { stderr: '', stdout: 'ok' },
      }),
    ).toBeNull()
  })

  it('ignores a failure with no extractable command', () => {
    expect(isFailureCandidate({ tool_response: 'Error: Exit code 1: boom' })).toBeNull()
  })

  it('ignores a failure where a high-signal tool name only appears as an argument', () => {
    expect(
      isFailureCandidate({
        tool_input: { command: 'rg vitest docs/' },
        tool_response: 'Error: Exit code 1: no matches found',
      }),
    ).toBeNull()
  })

  it('never fires on a Codex-shaped payload, even with a failure-looking token in the output', () => {
    // Codex's tool_response is a plain merged-output string with no exit code (context.rs:320,
    // :369-377) — extractToolOutcome classifies it as {kind:'output'}, never {kind:'failure'}, so
    // checkpoint 2 (repeated-failure capture) stays Claude-only by construction.
    expect(
      isFailureCandidate({
        tool_input: { command: 'npx vitest run dev/foo.test.mts' },
        tool_response: 'FAIL dev/foo.test.mts\n1 failed, 0 passed',
      }),
    ).toBeNull()
  })
})

describe('isMilestoneCandidate', () => {
  it('matches gh pr create with a PR URL in stdout', () => {
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_response: {
          stderr: '',
          stdout: 'https://github.com/vouchington/vouchington/pull/9358\n',
        },
      }),
    ).toEqual({
      command: 'gh pr create --title x --body y',
      evidence: 'https://github.com/vouchington/vouchington/pull/9358',
      kind: 'pr-create',
    })
  })

  it('rejects gh pr create with no PR URL in the output', () => {
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_response: { stderr: '', stdout: 'pull request already exists' },
      }),
    ).toBeNull()
  })

  it('matches git push with a ref-update line and no rejection', () => {
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'git push' },
        tool_response: {
          stderr:
            'To github.com:vouchington/vouchington.git\n   abc123..def456  my-branch -> my-branch\n',
          stdout: '',
        },
      }),
    ).toEqual({
      command: 'git push',
      evidence: 'abc123..def456  my-branch -> my-branch',
      kind: 'push',
    })
  })

  it('rejects a rejected git push even with a ref-update-shaped line', () => {
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'git push' },
        tool_response: {
          stderr:
            '! [rejected]  my-branch -> my-branch (non-fast-forward)\nerror: failed to push\n',
          stdout: '',
        },
      }),
    ).toBeNull()
  })

  it('ignores a --dry-run push', () => {
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'git push --dry-run' },
        tool_response: { stderr: 'abc..def  my-branch -> my-branch', stdout: '' },
      }),
    ).toBeNull()
  })

  it('ignores a failed command entirely', () => {
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'git push' },
        tool_response: 'Error: Exit code 1: boom',
      }),
    ).toBeNull()
  })

  it('ignores an unrelated successful command', () => {
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'ls -la' },
        tool_response: { stderr: '', stdout: '' },
      }),
    ).toBeNull()
  })

  it('matches a Codex-shaped gh pr create (plain-string tool_response) with a PR URL', () => {
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_response: 'https://github.com/vouchington/vouchington/pull/9358\n',
      }),
    ).toEqual({
      command: 'gh pr create --title x --body y',
      evidence: 'https://github.com/vouchington/vouchington/pull/9358',
      kind: 'pr-create',
    })
  })

  it('matches a Codex-shaped git push (plain-string tool_response) with a ref-update line', () => {
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'git push' },
        tool_response:
          'To github.com:vouchington/vouchington.git\n   abc123..def456  my-branch -> my-branch\n',
      }),
    ).toEqual({
      command: 'git push',
      evidence: 'abc123..def456  my-branch -> my-branch',
      kind: 'push',
    })
  })

  it('rejects a Codex-shaped rejected git push (plain-string tool_response)', () => {
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'git push' },
        tool_response:
          '! [rejected]  my-branch -> my-branch (non-fast-forward)\nerror: failed to push\n',
      }),
    ).toBeNull()
  })

  it('rejects a Codex-shaped gh pr create that failed because a PR already exists', () => {
    // gh CLI prints the existing PR's URL after an "already exists" error, not just after a real
    // creation — and Codex drops the exit code, so the URL alone is not proof of creation.
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_response:
          'a pull request for branch "my-branch" into "main" already exists:\nhttps://github.com/vouchington/vouchington/pull/9358\n',
      }),
    ).toBeNull()
  })

  it('does not treat a truncated non-"Error: Exit code" string as a milestone without corroborating output', () => {
    // extractToolOutcome classifies any string not starting with "Error: Exit code" as `output`,
    // including a truncated or unrecognized error shape — but isMilestoneCandidate still requires
    // a PR URL / non-rejected ref-update line, so this stays null rather than becoming a false
    // milestone.
    expect(
      isMilestoneCandidate({
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_response: 'Error: something unexpected happened',
      }),
    ).toBeNull()
  })
})
