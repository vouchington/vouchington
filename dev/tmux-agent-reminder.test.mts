import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('./tmux-agent-reminder', import.meta.url))

function runReminder(event: string, tmuxPane?: string, input = '') {
  const env = { ...process.env }
  if (tmuxPane === undefined) {
    delete env.TMUX_PANE
  } else {
    env.TMUX_PANE = tmuxPane
  }

  return spawnSync('/bin/bash', [scriptPath, event], {
    encoding: 'utf8',
    env,
    input,
    timeout: 5_000,
  })
}
function runReminderWithFakeTmux(event: string, paneTitle: string, input = '') {
  const dir = mkdtempSync(join(tmpdir(), 'voucha-tmux-agent-reminder-'))
  try {
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

    return spawnSync('/bin/bash', [scriptPath, event], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ''}`,
        TMUX_PANE: '%1',
      },
      input,
      timeout: 5_000,
    })
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

describe('dev/tmux-agent-reminder', () => {
  it('emits valid SessionStart JSON when running in tmux', () => {
    const { error, status, stdout, stderr } = runReminder('session-start', '%1')

    expect(error).toBeUndefined()
    expect(status).toBe(0)
    expect(stderr).toBe('')
    expect(() => JSON.parse(stdout)).not.toThrow()
    expect(JSON.parse(stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: expect.stringContaining('[tmux-window-name]'),
      },
    })
  })

  it('stays silent outside tmux', () => {
    const { error, status, stdout, stderr } = runReminder('session-start')

    expect(error).toBeUndefined()
    expect(status).toBe(0)
    expect(stdout).toBe('')
    expect(stderr).toBe('')
  })

  it('keeps PreCompact stdout empty for Claude and Codex hook compatibility', () => {
    const { error, status, stdout, stderr } = runReminder('pre-compact', '%1')

    expect(error).toBeUndefined()
    expect(status).toBe(0)
    expect(stdout).toBe('')
    expect(stderr).toBe('')
  })

  it('treats a cursor pane title as unset and asks for a topic name', () => {
    const { error, status, stdout, stderr } = runReminderWithFakeTmux('user-prompt', 'cursor')

    expect(error).toBeUndefined()
    expect(status).toBe(0)
    expect(stdout).toContain('[tmux-window-name] Topic is clear')
    expect(stderr).toBe('')
  })

  it('treats a grok pane title as unset and asks for a topic name', () => {
    const { error, status, stdout, stderr } = runReminderWithFakeTmux('user-prompt', 'grok')

    expect(error).toBeUndefined()
    expect(status).toBe(0)
    expect(stdout).toContain('[tmux-window-name] Topic is clear')
    expect(stderr).toBe('')
  })
})
