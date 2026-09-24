import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { workerQueuePolicy } from '../backend/modules/worker-queue-inventory/worker-queue-policy.mts'
import { cleanupTmuxTestDirs, makeFakeBin, makeRepo, runTmux } from './test-helpers/tmux.mts'

function createdWindowNames(log: string) {
  return log.split('\n').flatMap(line => {
    if (!line.startsWith('new-session ') && !line.startsWith('new-window ')) return []
    const parts = line.split(' ')
    return [parts[parts.indexOf('-n') + 1]]
  })
}

describe('dev/tmux', () => {
  afterEach(cleanupTmuxTestDirs)

  it('directs a fresh checkout to initialize before loading package tooling', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    await rm(join(cwd, '.initialized'))
    await rm(join(cwd, 'dev', 'lib', 'git-worktrees.sh'))

    const result = await runTmux({ binDir, cwd })

    expect(result).toEqual(expect.objectContaining({ code: 1 }))
    expect(result.stdout).toContain('Run ./dev/initialize web first')
    expect(result.stderr).not.toContain('No such file or directory')
  })

  it('routes missing tmux remediation through the host repository', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({ tmux: false })

    const result = await runTmux({ binDir, cwd })

    expect(result).toEqual(expect.objectContaining({ code: 1 }))
    expect(result.stdout).toContain('vouchington-machines')
    expect(result.stdout).toContain('docs/development/system-dependencies.md')
    expect(result.stdout).not.toMatch(/brew install tmux|apt install tmux/)
  })

  it('creates one window per service in the documented order', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({ binDir, cwd })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(createdWindowNames(result.log)).toEqual([
      'nextjs',
      'backend',
      'worker',
      'cloudflare',
      'lambdas',
    ])
    expect(result.log).not.toContain('split-window')
    expect(result.log).toContain('select-window -t =voucha-')
    expect(result.log).toContain(
      `QUEUES=${[...workerQueuePolicy.cpuOnlyQueues, ...workerQueuePolicy.ioCapableQueues].join(',')}`,
    )
    expect(result.log).toContain('crawl_urls')
  })

  it.each([
    { certs: false, protocol: 'HTTP' },
    { certs: true, protocol: 'HTTPS' },
  ])(
    'executes every $protocol pane command from a path containing a space and apostrophe',
    async ({ certs }) => {
      const cwd = await makeRepo({ certs, shellSensitiveParent: true })
      const binDir = await makeFakeBin()

      const result = await runTmux({
        binDir,
        cwd,
        extraEnv: { FAKE_TMUX_EXECUTE_COMMANDS: '1', OTEL_ENABLED: '1' },
      })

      expect(result).toEqual(expect.objectContaining({ code: 0 }))
      expect(result.statusLog.trim().split('\n')).toEqual([
        'nextjs\t0',
        'backend\t0',
        'worker\t0',
        'cloudflare\t0',
        'lambdas\t0',
      ])
      expect(result.execLog.trim().split('\n').sort()).toEqual([
        'node',
        'node',
        'node',
        'node',
        'pnpm',
      ])
      expect(result.nodeArgLog.split('\n')).toContain(
        `node-arg\t${join(cwd, 'dev', 'otel-register.mts')}`,
      )
      expect(result.nodeArgLog).toContain('node-env\tIMAGE_LAMBDA_PORT=3903')
      expect(result.stderr).not.toMatch(/unexpected EOF|unterminated quoted string/i)
    },
  )

  it('preserves worker heap cap while suppressing Node DEP0205 warnings in service windows', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({ binDir, cwd })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(result.log).toContain('--disable-warning=DEP0205')
    expect(result.log).toContain('--max-old-space-size=3072')
    expect(result.log).not.toContain('NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"')
  })

  it('detects any custom worker heap cap before adding the default cap', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({ binDir, cwd })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(result.log).toContain('case " ${NODE_OPTIONS:-} " in *" --max-old-space-size="*)')
    expect(result.log).not.toContain(
      'case " ${NODE_OPTIONS:-} " in *" --max-old-space-size=3072 "*)',
    )
  })

  it('keeps the complete queue policy in the worker', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({ binDir, cwd })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(result.log).toContain(
      `QUEUES=${[...workerQueuePolicy.cpuOnlyQueues, ...workerQueuePolicy.ioCapableQueues].join(',')}`,
    )
  })

  it('uses distinct session identities for same-basename worktrees', async () => {
    const first = await makeRepo({ fixedBasename: true })
    const second = await makeRepo({ fixedBasename: true })
    const binDir = await makeFakeBin()

    const [firstResult, secondResult] = await Promise.all([
      runTmux({ binDir, cwd: first, args: ['--no-attach'] }),
      runTmux({ binDir, cwd: second, args: ['--no-attach'] }),
    ])

    expect(firstResult).toEqual(expect.objectContaining({ code: 0 }))
    expect(secondResult).toEqual(expect.objectContaining({ code: 0 }))
    const sessionOf = (log: string) => log.match(/new-session -d -s (\S+)/)?.[1]
    expect(sessionOf(firstResult.log)).toBeDefined()
    expect(sessionOf(secondResult.log)).toBeDefined()
    expect(sessionOf(firstResult.log)).not.toBe(sessionOf(secondResult.log))
  })

  it('uses the same session identity through a symlinked worktree path', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const aliasParent = await mkdtemp(join(tmpdir(), 'voucha-tmux-alias-'))
    const alias = join(aliasParent, 'alias')
    await symlink(cwd, alias)
    try {
      const direct = await runTmux({ binDir, cwd, args: ['--no-attach'] })
      const throughAlias = await runTmux({ binDir, cwd: alias, args: ['--no-attach'] })
      expect(direct).toEqual(expect.objectContaining({ code: 0 }))
      const sessionOf = (log: string) => [...log.matchAll(/new-session -d -s (\S+)/g)].at(-1)?.[1]
      expect(sessionOf(direct.log)).toBeDefined()
      expect(sessionOf(throughAlias.log)).toBe(sessionOf(direct.log))
    } finally {
      await rm(aliasParent, { force: true, recursive: true })
    }
  })

  it('attaches to a session created by a concurrent invocation', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: {
        FAKE_TMUX_DEAD_WINDOWS: 'backend',
        FAKE_TMUX_NEW_SESSION_EXIT: '1',
        FAKE_TMUX_RACE: '1',
        FAKE_TMUX_STATE: join(cwd, 'tmux-race-state'),
      },
    })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(result.stdout).toContain('Services already running')
    expect(createdWindowNames(result.log)).toEqual(['nextjs'])
    expect(result.log).not.toContain('respawn-pane')
  })

  it('waits for a concurrent session to finish creating its windows', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: {
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        FAKE_TMUX_READY_AFTER: '3',
      },
    })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(result.stdout).toContain('Services already running')
    expect(createdWindowNames(result.log)).toEqual([])
    expect(result.log.split('\n').filter(line => line.startsWith('show-options'))).toHaveLength(3)
    expect(result.log).not.toContain('respawn-pane')
  })

  it('removes a partially created session when a window cannot start', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: { FAKE_TMUX_FAIL_WINDOW: 'worker' },
    })

    expect(result).toEqual(expect.objectContaining({ code: 1 }))
    expect(result.log).toContain('new-window')
    expect(result.log).toContain('kill-session -t =voucha-')
    expect(result.log).not.toContain(' -n lambdas ')
  })

  it('removes its session when interrupted during session creation', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: { FAKE_TMUX_SIGNAL_NEW_SESSION: '1' },
    })

    expect(result).toEqual(expect.objectContaining({ code: 143 }))
    expect(result.log).toContain('show-environment -t =voucha-')
    expect(result.log).toContain('kill-session -t =voucha-')
    expect(result.log).not.toContain('@voucha-ready 1')
  })

  it('refuses to run from inside an existing tmux session', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({ binDir, cwd, tmuxEnv: '/tmp/tmux-session' })

    expect(result).toEqual(expect.objectContaining({ code: 1 }))
    expect(result.stdout).toContain('Error: ./dev/tmux must be run outside tmux.')
    expect(result.log).toBe('')
  })

  it('keeps service windows ordered regardless of installed assistant CLIs', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({ claude: false, codex: false })

    const result = await runTmux({ binDir, cwd })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(createdWindowNames(result.log)).toEqual([
      'nextjs',
      'backend',
      'worker',
      'cloudflare',
      'lambdas',
    ])
    expect(result.stdout).not.toContain('CLI not found')
    expect(result.log).toContain(':nextjs')
    expect(result.log).not.toContain('split-window')
  })

  it('does not add assistant windows when cursor-agent is on PATH', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({ cursor: true })

    const result = await runTmux({ binDir, cwd })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(createdWindowNames(result.log)).toEqual([
      'nextjs',
      'backend',
      'worker',
      'cloudflare',
      'lambdas',
    ])
    expect(result.log).not.toContain(':cursor')
  })
})
