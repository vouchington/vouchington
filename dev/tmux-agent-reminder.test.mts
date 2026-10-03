import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('./tmux-agent-reminder', import.meta.url))
const fakeTmux = fileURLToPath(new URL('./test-helpers/tmux-target-fake.sh', import.meta.url))
const worktree = resolve(fileURLToPath(new URL('..', import.meta.url)))
describe('dev/tmux-agent-reminder', () => {
  const dirs: string[] = []

  afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { force: true, recursive: true })))

  function runReminder(event: string, title: string, override: NodeJS.ProcessEnv = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'voucha-tmux-agent-reminder-'))
    dirs.push(dir)
    return spawnSync('/bin/bash', [scriptPath, event], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TMUX: undefined,
        TMUX_PANE: undefined,
        AGENT_TMUX_SOCKET: join(dir, 'tmux.sock'),
        AGENT_TMUX_PANE: '%1',
        AGENT_TMUX_WORKTREE: worktree,
        VOUCHA_TMUX_BIN: fakeTmux,
        FAKE_TMUX_PANE_PATH: worktree,
        FAKE_TMUX_TITLE: title,
        ...override,
      },
      input: '',
      timeout: 5_000,
    })
  }

  it('emits valid SessionStart JSON for a verified pane', () => {
    const { error, status, stdout, stderr } = runReminder('session-start', '')
    expect(error).toBeUndefined()
    expect(status).toBe(0)
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: expect.stringContaining('[tmux-window-name]'),
      },
    })
  })

  it('stays silent outside tmux', () => {
    const { status, stdout, stderr } = runReminder('session-start', '', {
      AGENT_TMUX_SOCKET: undefined,
      AGENT_TMUX_PANE: undefined,
      AGENT_TMUX_WORKTREE: undefined,
    })
    expect(status).toBe(0)
    expect(stdout).toBe('')
    expect(stderr).toBe('')
  })

  it.each(['cursor', 'grok'])('treats a %s pane title as unset', title => {
    const { status, stdout, stderr } = runReminder('user-prompt', title)
    expect(status).toBe(0)
    expect(stdout).toContain('[tmux-window-name] Topic is clear')
    expect(stderr).toBe('')
  })

  it('refuses a mismatched pane before reading its title', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voucha-reminder-other-'))
    dirs.push(dir)
    const { status, stdout, stderr } = runReminder('user-prompt', 'cursor', {
      FAKE_TMUX_PANE_PATH: dir,
    })
    expect(status).toBe(0)
    expect(stdout).toBe('')
    expect(stderr).toContain('pane belongs to a different worktree')
  })

  it('uses VOUCHA_TMUX_BIN instead of a decoy on PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voucha-tmux-decoy-'))
    dirs.push(dir)
    const marker = join(dir, 'invoked')
    writeFileSync(join(dir, 'tmux'), `#!/bin/bash\ntouch ${JSON.stringify(marker)}\n`, {
      mode: 0o755,
    })
    const { status, stdout } = runReminder('user-prompt', 'my-feature', {
      PATH: `${dir}:${process.env.PATH ?? ''}`,
    })
    expect(status).toBe(0)
    expect(existsSync(marker)).toBe(false)
    expect(stdout).not.toContain('Topic is clear')
  })
})
