import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { HookPayload } from './codex-hooks/types.mts'
import { renderPostToolReminder } from './tmux-reminder-post-tool.mts'

// Fakes `tmux display-message` on PATH for the duration of one call, exactly like
// dev/tmux-agent-reminder.test.mts's runReminderWithFakeTmux did for the bash script — ported
// here since renderPostToolReminder shells out to the real `tmux` binary via spawnSync.
function withFakeTmux(paneTitle: string, run: () => string | null): string | null {
  const dir = mkdtempSync(join(tmpdir(), 'voucha-tmux-reminder-post-tool-'))
  writeFileSync(
    join(dir, 'tmux'),
    [
      '#!/usr/bin/env bash',
      'case "$1" in',
      `  display-message) printf '%s\\n' ${JSON.stringify(paneTitle)} ;;`,
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  const originalPath = process.env.PATH
  process.env.PATH = `${dir}:${originalPath ?? ''}`
  try {
    return run()
  } finally {
    process.env.PATH = originalPath
    rmSync(dir, { force: true, recursive: true })
  }
}

describe('renderPostToolReminder', () => {
  it('is silent outside tmux', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree' },
      tool_name: 'Bash',
    }
    expect(renderPostToolReminder(payload, '')).toBeNull()
  })

  it('does not ask agents to rename reset-worktree windows to reset', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree' },
      tool_name: 'Bash',
    }
    expect(withFakeTmux('', () => renderPostToolReminder(payload, '%1'))).toBeNull()
  })

  it('reads Cursor Shell post-tool payloads for reset-worktree', () => {
    const payload: HookPayload = {
      command: './dev/reset-worktree',
      tool_name: 'Shell',
    }
    const reminder = withFakeTmux('old-task', () => renderPostToolReminder(payload, '%1'))
    expect(reminder).toContain('./dev/tmux-name ""')
  })

  it('reads Grok camelCase post-tool payloads for reset-worktree', () => {
    const payload: HookPayload = {
      toolInput: { command: './dev/reset-worktree' },
      toolName: 'run_terminal_command',
    }
    const reminder = withFakeTmux('old-task', () => renderPostToolReminder(payload, '%1'))
    expect(reminder).toContain('./dev/tmux-name ""')
  })

  it('asks agents to clear a non-empty reset-worktree window title', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree' },
      tool_name: 'Bash',
    }
    const reminder = withFakeTmux('old-task', () => renderPostToolReminder(payload, '%1'))
    expect(reminder).toContain('./dev/tmux-name ""')
    expect(reminder).not.toContain('./dev/tmux-name reset')
  })

  it('does not remind after ./dev/reset-worktree --help', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree --help' },
      tool_name: 'Bash',
    }
    expect(withFakeTmux('old-task', () => renderPostToolReminder(payload, '%1'))).toBeNull()
  })

  it('does not remind after ./dev/reset-worktree -h', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree -h' },
      tool_name: 'Bash',
    }
    expect(withFakeTmux('old-task', () => renderPostToolReminder(payload, '%1'))).toBeNull()
  })

  it('still reminds when a help invocation is followed by a real reset in the same command', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree --help; ./dev/reset-worktree --force' },
      tool_name: 'Bash',
    }
    const reminder = withFakeTmux('old-task', () => renderPostToolReminder(payload, '%1'))
    expect(reminder).toContain('./dev/tmux-name ""')
  })

  it('reminds on ExitPlanMode without needing a command', () => {
    const payload: HookPayload = { tool_name: 'ExitPlanMode' }
    const reminder = renderPostToolReminder(payload, '%1')
    expect(reminder).toContain('Plan accepted')
  })

  it('reminds to set the -pr<N> suffix after a git push with no suffix set yet', () => {
    const payload: HookPayload = { tool_input: { command: 'git push' }, tool_name: 'Bash' }
    const reminder = withFakeTmux('my-feature', () => renderPostToolReminder(payload, '%1'))
    expect(reminder).toContain('git push on PR branch')
  })

  it('stays silent for a git push once the -pr<N> suffix is already set', () => {
    const payload: HookPayload = { tool_input: { command: 'git push' }, tool_name: 'Bash' }
    expect(withFakeTmux('my-feature-pr123', () => renderPostToolReminder(payload, '%1'))).toBeNull()
  })

  it('reminds after gh pr create', () => {
    const payload: HookPayload = {
      tool_input: { command: 'gh pr create --title x --body y' },
      tool_name: 'Bash',
    }
    const reminder = renderPostToolReminder(payload, '%1')
    expect(reminder).toContain('PR created')
  })

  it('ignores an unrelated Bash command', () => {
    const payload: HookPayload = { tool_input: { command: 'ls -la' }, tool_name: 'Bash' }
    expect(renderPostToolReminder(payload, '%1')).toBeNull()
  })

  it('ignores tools other than Bash/Shell/run_terminal_command/ExitPlanMode', () => {
    const payload: HookPayload = { tool_input: { command: 'x' }, tool_name: 'Read' }
    expect(renderPostToolReminder(payload, '%1')).toBeNull()
  })

  it('stays silent after a failed gh pr create when a real exit code is available (Cursor)', () => {
    const payload: HookPayload = {
      tool_input: { command: 'gh pr create --title x --body y' },
      tool_name: 'Bash',
      tool_response: { exit_code: 1 },
    }
    expect(renderPostToolReminder(payload, '%1')).toBeNull()
  })

  it('still reminds after gh pr create when the exit code is explicitly 0 (Cursor)', () => {
    const payload: HookPayload = {
      tool_input: { command: 'gh pr create --title x --body y' },
      tool_name: 'Bash',
      tool_response: { exit_code: 0 },
    }
    expect(renderPostToolReminder(payload, '%1')).toContain('PR created')
  })

  it('stays silent after a failed gh pr create when a real exit code is available (Grok toolResult)', () => {
    const payload: HookPayload = {
      toolInput: { command: 'gh pr create --title x --body y' },
      toolName: 'run_terminal_command',
      toolResult: { exit_code: 1 },
    }
    expect(renderPostToolReminder(payload, '%1')).toBeNull()
  })

  it('still reminds after gh pr create when the Grok toolResult exit code is explicitly 0', () => {
    const payload: HookPayload = {
      toolInput: { command: 'gh pr create --title x --body y' },
      toolName: 'run_terminal_command',
      toolResult: { exit_code: 0 },
    }
    expect(renderPostToolReminder(payload, '%1')).toContain('PR created')
  })

  it('reminds when no exit code is available at all (Claude/Codex)', () => {
    const payload: HookPayload = {
      tool_input: { command: 'gh pr create --title x --body y' },
      tool_name: 'Bash',
      tool_response: { stdout: '', stderr: '' },
    }
    expect(renderPostToolReminder(payload, '%1')).toContain('PR created')
  })
})
