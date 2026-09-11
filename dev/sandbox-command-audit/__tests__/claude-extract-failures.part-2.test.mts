import { describe, expect, it } from 'vitest'

import { extractClaudeRecords } from '../claude-extract.mts'

function assistantToolUse(id: string, name: string, input: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input }] },
  })
}

function toolResult(id: string, text: string): string {
  return JSON.stringify({
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: text }],
    },
  })
}

// #8149 cb4 — worktree write-path denials are their own bucket, distinct from a generic
// genuine bypass candidate: the fix is sandbox write-path config, not an allowlist entry.
// See classify.mts's worktreeDenialCount and .agents/skills/retrospective/sandbox-audit.md.
// Split from claude-extract-failures.test.mts, which is at its 300-line cap.
describe('extractClaudeRecords — worktree write-path denials (#8149 cb4)', () => {
  it('classifies Git config, remote-tracking ref, and reflog permission denials', () => {
    const lines = [
      assistantToolUse('config', 'Bash', { command: 'git config branch.topic.remote origin' }),
      toolResult(
        'config',
        'error: could not lock config file /repo/.git/config: Permission denied',
      ),
      assistantToolUse('remote-ref', 'Bash', {
        command: 'git update-ref refs/remotes/origin/topic HEAD',
      }),
      toolResult(
        'remote-ref',
        "fatal: Unable to create '/repo/.git/refs/remotes/origin/topic.lock': EPERM",
      ),
      assistantToolUse('reflog', 'Bash', { command: 'git branch -m old new' }),
      toolResult(
        'reflog',
        'error: unable to move logfile logs/refs/heads/old to logs/refs/heads/new: Operation not permitted',
      ),
    ]

    expect(extractClaudeRecords(lines).sandboxFailures.map(record => record.kind)).toEqual([
      'worktree-denial',
      'worktree-denial',
      'worktree-denial',
    ])
  })

  it('requires Git command context for a Git-metadata permission signature', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'printf diagnostic' }),
      toolResult(
        't1',
        'diagnostic: could not lock config file /repo/.git/config: Operation not permitted',
      ),
    ]

    expect(extractClaudeRecords(lines).sandboxFailures[0]?.kind).toBe('genuine')
  })

  it('classifies a redacted real FETCH_HEAD denial as worktree-denial, not genuine', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'git -C .git/worktrees/x fetch' }),
      toolResult(
        't1',
        "error: cannot open '/Users/redacted/filaments/.git/worktrees/eager-coalescing-reef/FETCH_HEAD': Operation not permitted",
      ),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([
      {
        source: 'claude',
        kind: 'worktree-denial',
        command: 'git -C .git/worktrees/x fetch',
        errorText:
          "error: cannot open '/Users/redacted/filaments/.git/worktrees/eager-coalescing-reef/FETCH_HEAD': Operation not permitted",
      },
    ])
  })

  it('classifies a redacted real index.lock denial as worktree-denial', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'git add -A' }),
      toolResult(
        't1',
        "fatal: Unable to create '/Users/redacted/filaments/.git/worktrees/zany-wiggling-toast/index.lock': Operation not permitted",
      ),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([
      {
        source: 'claude',
        kind: 'worktree-denial',
        command: 'git add -A',
        errorText:
          "fatal: Unable to create '/Users/redacted/filaments/.git/worktrees/zany-wiggling-toast/index.lock': Operation not permitted",
      },
    ])
  })

  // Critical negative case: this exact shape occurs 965 times in local transcripts and is
  // lock CONTENTION (a concurrent git process holding the lock), not a sandbox denial — it
  // carries no permission-denial token and must keep matching no pattern at all.
  it('does not classify index.lock contention ("File exists", another git process) as any failure', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'git commit -m wip' }),
      toolResult(
        't1',
        'fatal: Unable to create \'/Users/redacted/filaments/.git/worktrees/shiny-spinning-hummingbird/index.lock\': File exists.\n\nAnother git process seems to be running in this repository, or the lock file may be stale\n\nno changes added to commit (use "git add" and/or "git commit -a")',
      ),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([])
  })

  it('does not classify a .git/worktrees path with no permission-denial token as worktree-denial', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'ls .git/worktrees/x' }),
      toolResult('t1', 'ls: /repo/.git/worktrees/x: No such file or directory'),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([])
  })

  it('does not classify a bare Operation-not-permitted failure with no worktree path as worktree-denial', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'chmod 000 /etc/shadow' }),
      toolResult('t1', 'chmod: Operation not permitted'),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([
      {
        source: 'claude',
        kind: 'genuine',
        command: 'chmod 000 /etc/shadow',
        errorText: 'chmod: Operation not permitted',
      },
    ])
  })

  it('classifies a bare EPERM token (no worktree path) as a genuine bypass candidate', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'npm install' }),
      toolResult('t1', '1 | Exit code 1\nnpm error code EPERM'),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([
      {
        source: 'claude',
        kind: 'genuine',
        command: 'npm install',
        errorText: '1 | Exit code 1\nnpm error code EPERM',
      },
    ])
  })

  // Real false positive caught against live data: a multi-command probe embeds a
  // `.git/worktrees` path in an unrelated `ls` diagnostic (which itself reports "No such
  // file or directory", not a denial) while a genuinely sandboxed command earlier in the
  // same blob (`ps`) reports "Operation not permitted" on an unrelated line. The two must
  // not be fused into a worktree-denial just because both substrings appear somewhere in
  // the text — the permission phrase has to immediately follow the worktree path. The `ps`
  // denial is still real, so this correctly falls through to 'genuine', not 'worktree-denial'.
  it('classifies an unrelated Operation-not-permitted as genuine, not fused with an incidental worktree path', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', {
        command: "ps aux | grep -i '[g]it'; ls -la /repo/.git/worktrees/x/index.lock 2>&1",
      }),
      toolResult(
        't1',
        '(eval):1: operation not permitted: ps\n---\nls: /repo/.git/worktrees/x/index.lock: No such file or directory',
      ),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures[0]?.kind).toBe('genuine')
  })

  it('classifies an env-wrapped rebase EROFS lock denial as worktree-denial', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'env GIT_EDITOR=true git rebase --continue' }),
      toolResult(
        't1',
        "fatal: Unable to create '/repo/.git/worktrees/x/index.lock': Read-only file system",
      ),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([
      {
        source: 'claude',
        kind: 'worktree-denial',
        command: 'env GIT_EDITOR=true git rebase --continue',
        errorText:
          "fatal: Unable to create '/repo/.git/worktrees/x/index.lock': Read-only file system",
      },
    ])
  })

  it('does not treat an rm diagnostic on a worktree-shaped path as a Git denial', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'git update-ref refs/heads/probe HEAD' }),
      toolResult(
        't1',
        'rm: /repo/.claude/worktrees/x/.git/worktrees/x/probe.mts: Operation not permitted',
      ),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures[0]?.kind).toBe('genuine')
  })
})
