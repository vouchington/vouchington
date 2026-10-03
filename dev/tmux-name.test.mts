import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('./tmux-name', import.meta.url))
const fakeTmux = fileURLToPath(new URL('./test-helpers/tmux-target-fake.sh', import.meta.url))
const worktree = resolve(fileURLToPath(new URL('..', import.meta.url)))
describe('dev/tmux-name', () => {
  const dirs: string[] = []

  afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))

  function run(args: string[], override: NodeJS.ProcessEnv = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'voucha-tmux-name-'))
    dirs.push(dir)
    const log = join(dir, 'commands.log')
    writeFileSync(log, '')
    const socket = join(dir, 'tmux.sock')
    const result = spawnSync('bash', [scriptPath, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TMUX: undefined,
        TMUX_PANE: undefined,
        AGENT_TMUX_SOCKET: socket,
        AGENT_TMUX_PANE: '%1',
        AGENT_TMUX_WORKTREE: worktree,
        VOUCHA_TMUX_BIN: fakeTmux,
        FAKE_TMUX_PANE_PATH: worktree,
        FAKE_TMUX_LOG: log,
        ...override,
      },
    })
    return { ...result, log: readFileSync(log, 'utf8'), socket }
  }

  it('restores automatic naming and clears the verified pane title', () => {
    const result = run([''])
    expect(result.status).toBe(0)
    expect(result.log).toContain(`-S ${result.socket} set-window-option -t %1 automatic-rename on`)
    expect(result.log).toContain(`-S ${result.socket} select-pane -t %1 -T `)
    expect(result.log).not.toContain('rename-window')
  })

  it('renames the verified pane window and title without caching a window ID', () => {
    const result = run(['agent-workflow'])
    expect(result.status).toBe(0)
    expect(result.log).toContain(`-S ${result.socket} rename-window -t %1 -- agent-workflow`)
    expect(result.log).toContain(`-S ${result.socket} select-pane -t %1 -T agent-workflow`)
    expect(result.log).not.toContain('window_id')
  })

  it('accepts a complete CLI binding in place of an incomplete environment binding', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voucha-tmux-cli-'))
    dirs.push(dir)
    const socket = join(dir, 'override.sock')
    const result = run(['--socket', socket, '--pane', '%7', '--worktree', worktree, 'cli-name'], {
      AGENT_TMUX_SOCKET: '/bad/ambient.sock',
      AGENT_TMUX_PANE: undefined,
    })
    expect(result.status).toBe(0)
    expect(result.log).toContain(`-S ${socket} rename-window -t %7 -- cli-name`)
  })

  it('refuses partial binding and never mutates tmux', () => {
    const result = run(['agent-workflow'], { AGENT_TMUX_WORKTREE: undefined })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('incomplete explicit binding')
    expect(result.log).toBe('')
  })

  it('refuses a pane belonging to a different linked worktree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voucha-other-worktree-'))
    dirs.push(dir)
    const result = run(['agent-workflow'], { FAKE_TMUX_PANE_PATH: dir })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('pane belongs to a different worktree')
    expect(result.log).not.toContain('rename-window')
  })

  it('does not let exported Git worktree variables hide a different pane root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voucha-git-env-pane-'))
    dirs.push(dir)
    const gitDir = execFileSync('git', ['-C', worktree, 'rev-parse', '--absolute-git-dir'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_COMMON_DIR: undefined,
      },
    }).trim()
    const poisonedGitEnv = {
      GIT_DIR: gitDir,
      GIT_WORK_TREE: worktree,
      GIT_COMMON_DIR: gitDir,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.worktree',
      GIT_CONFIG_VALUE_0: worktree,
      FAKE_TMUX_PANE_PATH: dir,
    }

    const rejected = run(['agent-workflow'], poisonedGitEnv)
    expect(rejected.status).toBe(1)
    expect(rejected.stderr).toContain('pane belongs to a different worktree')
    expect(rejected.log).not.toContain('rename-window')

    const accepted = run(['agent-workflow'], {
      ...poisonedGitEnv,
      FAKE_TMUX_PANE_PATH: worktree,
    })
    expect(accepted.status).toBe(0)
    expect(accepted.log).toContain('rename-window -t %1 -- agent-workflow')
  })

  it('refuses a stale pane before any mutation', () => {
    const result = run(['agent-workflow'], { FAKE_TMUX_PANE_MISSING: '1' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('pane is missing or unavailable')
    expect(result.log).not.toContain('rename-window')
    expect(result.log).not.toContain('select-pane')
  })

  it('does not use an inherited TMUX_PANE without a verified socket and terminal', () => {
    const result = run(['agent-workflow'], {
      AGENT_TMUX_SOCKET: undefined,
      AGENT_TMUX_PANE: undefined,
      AGENT_TMUX_WORKTREE: undefined,
      TMUX_PANE: '%1',
    })
    expect(result.status).toBe(1)
    expect(result.log).toBe('')
  })

  it('is a silent no-op with no tmux context', () => {
    const result = run(['agent-workflow'], {
      AGENT_TMUX_SOCKET: undefined,
      AGENT_TMUX_PANE: undefined,
      AGENT_TMUX_WORKTREE: undefined,
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.log).toBe('')
  })
})
