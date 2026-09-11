import { execFile } from 'node:child_process'

import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { fileURLToPath } from 'node:url'

import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

describe('dev/tmux-name', () => {
  const scriptPath = fileURLToPath(new URL('./tmux-name', import.meta.url))

  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeFakeBin() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-tmux-name-bin-'))
    testDirs.push(dir)

    await writeFile(
      join(dir, 'tmux'),
      `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'tmux %s\\n' "$*" >> "$log"
case "$1" in
  display-message) printf '@0\\n' ;;
esac
`,
    )
    await chmod(join(dir, 'tmux'), 0o755)

    return dir
  }

  async function runTmuxName(name: string, env: Record<string, string> = {}) {
    const execFileAsync = promisify(execFile)
    const dir = await mkdtemp(join(tmpdir(), 'voucha-tmux-name-'))
    testDirs.push(dir)

    const logPath = join(dir, 'commands.log')
    await writeFile(logPath, '')
    const binDir = await makeFakeBin()
    const result = await execFileAsync('bash', [scriptPath, name], {
      env: {
        ...process.env,
        ...env,
        FAKE_COMMAND_LOG: logPath,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    })

    return { log: await readFile(logPath, 'utf8'), stderr: result.stderr, stdout: result.stdout }
  }

  it('re-enables automatic tmux window naming and clears the pane title for an empty name', async () => {
    const { log } = await runTmuxName('', { TMUX_PANE: '%0' })

    expect(log).toContain('tmux display-message -p -t %0 #{window_id}')
    expect(log).toContain('tmux set-window-option -t @0 automatic-rename on')
    expect(log).toContain('tmux select-pane -t %0 -T ')
    expect(log).not.toContain('tmux rename-window')
  })

  it('renames the tmux window and pane title for a non-empty name', async () => {
    const { log } = await runTmuxName('agent-workflow', { TMUX_PANE: '%0' })

    expect(log).toContain('tmux display-message -p -t %0 #{window_id}')
    expect(log).toContain('tmux rename-window -t @0 agent-workflow')
    expect(log).toContain('tmux select-pane -t %0 -T agent-workflow')
    expect(log).not.toContain('tmux set-window-option')
  })

  it('exits without tmux calls outside tmux', async () => {
    const { log, stderr, stdout } = await runTmuxName('agent-workflow', { TMUX_PANE: '' })

    expect(log).toBe('')
    expect(stderr).toBe('')
    expect(stdout).toBe('')
  })
})
