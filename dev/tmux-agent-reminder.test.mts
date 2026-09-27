import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
    const tmuxCommand = join(dir, 'tmux')
    writeFileSync(
      tmuxCommand,
      [
        '#!/bin/bash',
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
        TMUX_PANE: '%1',
        VOUCHA_TMUX_BIN: tmuxCommand,
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

  it('reads the pane title from VOUCHA_TMUX_BIN instead of the first tmux on PATH', () => {
    const realDir = mkdtempSync(join(tmpdir(), 'voucha-tmux-bin-'))
    const decoyDir = mkdtempSync(join(tmpdir(), 'voucha-tmux-decoy-'))
    const marker = join(decoyDir, 'invoked')
    const tmuxCommand = join(realDir, 'tmux')
    try {
      writeFileSync(tmuxCommand, ['#!/bin/bash', "printf '%s\\n' 'my-feature'", ''].join('\n'), {
        mode: 0o755,
      })
      writeFileSync(
        join(decoyDir, 'tmux'),
        ['#!/bin/bash', `touch ${JSON.stringify(marker)}`, "printf '%s\\n' 'cursor'", ''].join(
          '\n',
        ),
        { mode: 0o755 },
      )
      const { error, status, stdout } = spawnSync('/bin/bash', [scriptPath, 'user-prompt'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${decoyDir}:${process.env.PATH ?? ''}`,
          TMUX_PANE: '%1',
          VOUCHA_TMUX_BIN: tmuxCommand,
        },
        input: '',
        timeout: 5_000,
      })

      expect(error).toBeUndefined()
      expect(status).toBe(0)
      expect(existsSync(marker)).toBe(false)
      expect(stdout).not.toContain('Topic is clear')
    } finally {
      rmSync(realDir, { force: true, recursive: true })
      rmSync(decoyDir, { force: true, recursive: true })
    }
  })
})
