import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import { readHookPayload } from './codex-hooks/hook-payload.mts'
import type { HookPayload } from './codex-hooks/types.mts'
import { renderPostToolReminder, type PostToolTmuxOptions } from './tmux-reminder-post-tool.mts'

// Checked-in stand-in: executing a script this test just wrote can fail with
// ETXTBSY, and the title lookup would treat that as missing.
const paneTitleTmux = fileURLToPath(new URL('./test-helpers/tmux-target-fake.sh', import.meta.url))

function withFakeTmux(
  paneTitle: string,
  run: (options: PostToolTmuxOptions) => string | null,
): string | null {
  return run({
    env: { ...process.env, VOUCHA_FAKE_PANE_TITLE: paneTitle },
    spawnPaneTitle: () => ({ error: null, status: 0, stdout: `${paneTitle}\n` }),
  })
}

describe('renderPostToolReminder', () => {
  it('is silent outside tmux', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree' },
      tool_name: 'Bash',
    }
    expect(renderPostToolReminder(payload, { env: {} })).toBeNull()
  })

  it('does not ask agents to rename reset-worktree windows to reset', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree' },
      tool_name: 'Bash',
    }
    expect(withFakeTmux('', options => renderPostToolReminder(payload, options))).toBeNull()
  })

  it('reads Cursor Shell post-tool payloads for reset-worktree', () => {
    const payload = readHookPayload(
      JSON.stringify({ tool_input: { command: './dev/reset-worktree' }, tool_name: 'Shell' }),
    )
    const reminder = withFakeTmux('old-task', options => renderPostToolReminder(payload, options))
    expect(reminder).toContain('./dev/tmux-name ""')
  })

  it('reads Grok camelCase post-tool payloads for reset-worktree', () => {
    const payload: HookPayload = {
      toolInput: { command: './dev/reset-worktree' },
      toolName: 'run_terminal_command',
    }
    const reminder = withFakeTmux('old-task', options => renderPostToolReminder(payload, options))
    expect(reminder).toContain('./dev/tmux-name ""')
  })

  it('asks agents to clear a non-empty reset-worktree window title', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree' },
      tool_name: 'Bash',
    }
    const reminder = withFakeTmux('old-task', options => renderPostToolReminder(payload, options))
    expect(reminder).toContain('./dev/tmux-name ""')
    expect(reminder).not.toContain('./dev/tmux-name reset')
  })

  it('does not remind after ./dev/reset-worktree --help', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree --help' },
      tool_name: 'Bash',
    }
    expect(withFakeTmux('old-task', options => renderPostToolReminder(payload, options))).toBeNull()
  })

  it('does not remind after ./dev/reset-worktree -h', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree -h' },
      tool_name: 'Bash',
    }
    expect(withFakeTmux('old-task', options => renderPostToolReminder(payload, options))).toBeNull()
  })

  it('still reminds when a help invocation is followed by a real reset in the same command', () => {
    const payload: HookPayload = {
      tool_input: { command: './dev/reset-worktree --help; ./dev/reset-worktree --force' },
      tool_name: 'Bash',
    }
    const reminder = withFakeTmux('old-task', options => renderPostToolReminder(payload, options))
    expect(reminder).toContain('./dev/tmux-name ""')
  })

  it('reminds on ExitPlanMode without needing a command', () => {
    const payload: HookPayload = { tool_name: 'ExitPlanMode' }
    const reminder = withFakeTmux('', options => renderPostToolReminder(payload, options))
    expect(reminder).toContain('Plan accepted')
  })

  it('reminds to set the -pr<N> suffix after a git push with no suffix set yet', () => {
    const payload: HookPayload = { tool_input: { command: 'git push' }, tool_name: 'Bash' }
    const reminder = withFakeTmux('my-feature', options => renderPostToolReminder(payload, options))
    expect(reminder).toContain('git push on PR branch')
  })

  it('stays silent for a git push once the -pr<N> suffix is already set', () => {
    const payload: HookPayload = { tool_input: { command: 'git push' }, tool_name: 'Bash' }
    expect(
      withFakeTmux('my-feature-pr123', options => renderPostToolReminder(payload, options)),
    ).toBeNull()
  })

  it('stays silent when a transient tmux spawn failure is followed by a -pr<N> title', () => {
    const payload: HookPayload = { tool_input: { command: 'git push' }, tool_name: 'Bash' }
    let attempts = 0
    const reminder = renderPostToolReminder(payload, {
      spawnPaneTitle: () => {
        attempts += 1
        if (attempts === 1) {
          const error = new Error('spawn ETXTBSY') as NodeJS.ErrnoException
          error.code = 'ETXTBSY'
          return { error, status: null, stdout: '' }
        }
        return { error: null, status: 0, stdout: 'my-feature-pr123\n' }
      },
    })
    expect(reminder).toBeNull()
    expect(attempts).toBe(2)
  })

  it('retries a transient inner tmux failure returned by the title helper', () => {
    const payload: HookPayload = { tool_input: { command: 'git push' }, tool_name: 'Bash' }
    let attempts = 0
    const reminder = renderPostToolReminder(payload, {
      spawnPaneTitle: () => {
        attempts += 1
        if (attempts === 1) {
          return {
            error: null,
            status: 1,
            stdout: '',
            stderr: 'tmux: Resource temporarily unavailable (EAGAIN)',
          }
        }
        return { error: null, status: 0, stdout: 'my-feature\n' }
      },
    })
    expect(reminder).toContain('git push on PR branch')
    expect(attempts).toBe(2)
  })

  it('does not retry a verified target refusal from the title helper', () => {
    const payload: HookPayload = { tool_input: { command: 'git push' }, tool_name: 'Bash' }
    let attempts = 0
    const reminder = renderPostToolReminder(payload, {
      spawnPaneTitle: () => {
        attempts += 1
        return {
          error: null,
          status: 1,
          stdout: '',
          stderr: 'tmux target: pane belongs to a different worktree',
        }
      },
    })
    expect(reminder).toBeNull()
    expect(attempts).toBe(1)
  })

  it('stays silent when the pane cannot be verified', () => {
    const payload: HookPayload = { tool_input: { command: 'git push' }, tool_name: 'Bash' }
    let attempts = 0
    const reminder = renderPostToolReminder(payload, {
      spawnPaneTitle: () => {
        attempts += 1
        const error = new Error('spawn ENOENT') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        return { error, status: null, stdout: '' }
      },
    })
    expect(reminder).toBeNull()
    expect(attempts).toBe(1)
  })

  it('reminds after gh pr create', () => {
    const payload: HookPayload = {
      tool_input: { command: 'gh pr create --title x --body y' },
      tool_name: 'Bash',
    }
    const reminder = withFakeTmux('', options => renderPostToolReminder(payload, options))
    expect(reminder).toContain('PR created')
  })

  it('ignores an unrelated Bash command', () => {
    const payload: HookPayload = { tool_input: { command: 'ls -la' }, tool_name: 'Bash' }
    expect(renderPostToolReminder(payload)).toBeNull()
  })

  it('ignores tools other than Bash/run_terminal_command/ExitPlanMode', () => {
    const payload: HookPayload = { tool_input: { command: 'x' }, tool_name: 'Read' }
    expect(renderPostToolReminder(payload)).toBeNull()
  })

  it('stays silent after a failed gh pr create when a real exit code is available (Cursor)', () => {
    const payload: HookPayload = {
      tool_input: { command: 'gh pr create --title x --body y' },
      tool_name: 'Bash',
      tool_response: { exit_code: 1 },
    }
    expect(renderPostToolReminder(payload)).toBeNull()
  })

  it('still reminds after gh pr create when the exit code is explicitly 0 (Cursor)', () => {
    const payload: HookPayload = {
      tool_input: { command: 'gh pr create --title x --body y' },
      tool_name: 'Bash',
      tool_response: { exit_code: 0 },
    }
    expect(withFakeTmux('', options => renderPostToolReminder(payload, options))).toContain(
      'PR created',
    )
  })

  it('stays silent after a failed gh pr create when a real exit code is available (Grok toolResult)', () => {
    const payload: HookPayload = {
      toolInput: { command: 'gh pr create --title x --body y' },
      toolName: 'run_terminal_command',
      toolResult: { exit_code: 1 },
    }
    expect(renderPostToolReminder(payload)).toBeNull()
  })

  it('still reminds after gh pr create when the Grok toolResult exit code is explicitly 0', () => {
    const payload: HookPayload = {
      toolInput: { command: 'gh pr create --title x --body y' },
      toolName: 'run_terminal_command',
      toolResult: { exit_code: 0 },
    }
    expect(withFakeTmux('', options => renderPostToolReminder(payload, options))).toContain(
      'PR created',
    )
  })

  it('reminds when no exit code is available at all (Claude/Codex)', () => {
    const payload: HookPayload = {
      tool_input: { command: 'gh pr create --title x --body y' },
      tool_name: 'Bash',
      tool_response: { stdout: '', stderr: '' },
    }
    expect(withFakeTmux('', options => renderPostToolReminder(payload, options))).toContain(
      'PR created',
    )
  })

  it('reads the pane title from VOUCHA_TMUX_BIN instead of the first tmux on PATH', () => {
    const payload: HookPayload = { tool_input: { command: 'git push' }, tool_name: 'Bash' }
    const decoyDir = mkdtempSync(join(tmpdir(), 'voucha-tmux-decoy-'))
    const marker = join(decoyDir, 'invoked')
    const originalPath = process.env.PATH ?? ''
    writeFileSync(
      join(decoyDir, 'tmux'),
      ['#!/bin/bash', `touch ${JSON.stringify(marker)}`, "printf '%s\\n' 'my-feature'", ''].join(
        '\n',
      ),
      { mode: 0o755 },
    )
    vi.stubEnv('PATH', `${decoyDir}:${originalPath}`)
    vi.stubEnv('FAKE_TMUX_TITLE', 'my-feature-pr123')
    vi.stubEnv('FAKE_TMUX_PANE_PATH', fileURLToPath(new URL('..', import.meta.url)))
    vi.stubEnv('VOUCHA_TMUX_BIN', paneTitleTmux)
    const socket = join(decoyDir, 'tmux.sock')
    vi.stubEnv('AGENT_TMUX_SOCKET', socket)
    vi.stubEnv('AGENT_TMUX_PANE', '%1')
    vi.stubEnv('AGENT_TMUX_WORKTREE', fileURLToPath(new URL('..', import.meta.url)))
    try {
      expect(renderPostToolReminder(payload)).toBeNull()
      expect(existsSync(marker)).toBe(false)
    } finally {
      vi.unstubAllEnvs()
      rmSync(decoyDir, { force: true, recursive: true })
    }
  })
})
