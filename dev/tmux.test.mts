import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  devWorkerCpuQueues,
  devWorkerIoQueues,
  workerQueuePolicy,
} from '../backend/modules/worker-queue-inventory/worker-queue-policy.mts'
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

  it('routes missing tmux remediation through the host repository', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({ tmux: false })

    const result = await runTmux({ binDir, cwd })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('vouchington-machines')
    expect(result.stdout).toContain('docs/development/system-dependencies.md')
    expect(result.stdout).not.toMatch(/brew install tmux|apt install tmux/)
  })

  it('creates one window per service and agent in the documented order', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({ binDir, cwd })

    expect(result.exitCode).toBe(0)
    expect(createdWindowNames(result.log)).toEqual([
      'nextjs',
      'backend',
      'workers-io',
      'worker-cpu',
      'cloudflare',
      'lambdas',
      'claude',
      'codex',
      'shell',
    ])
    expect(result.log).not.toContain('split-window')
    expect(result.log).toContain('select-window -t voucha-')
    expect(result.log).toContain(':codex')
    expect(result.log).toContain(`QUEUES=${devWorkerCpuQueues().join(',')}`)
    expect(result.log).toContain(`QUEUES=${devWorkerIoQueues().join(',')}`)
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

      expect(result.exitCode).toBe(0)
      expect(result.statusLog.trim().split('\n')).toEqual([
        'nextjs\t0',
        'backend\t0',
        'workers-io\t0',
        'worker-cpu\t0',
        'cloudflare\t0',
        'lambdas\t0',
        'claude\t0',
        'codex\t0',
      ])
      expect(result.execLog.trim().split('\n').sort()).toEqual([
        'claude',
        'codex',
        'node',
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

    expect(result.exitCode).toBe(0)
    expect(result.log).toContain('--disable-warning=DEP0205')
    expect(result.log).toContain('--max-old-space-size=3072')
    expect(result.log).not.toContain('NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"')
  })

  it('detects any custom worker heap cap before adding the default cap', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({ binDir, cwd })

    expect(result.exitCode).toBe(0)
    expect(result.log).toContain('case " ${NODE_OPTIONS:-} " in *" --max-old-space-size="*)')
    expect(result.log).not.toContain(
      'case " ${NODE_OPTIONS:-} " in *" --max-old-space-size=3072 "*)',
    )
  })

  it('preserves an empty worker-io selection when every IO queue moves to worker-cpu', async () => {
    const cwd = await makeRepo({
      envAppend: `export WORKER_CPU_EXTRA_QUEUES=${workerQueuePolicy.ioCapableQueues.join(',')}`,
    })
    const binDir = await makeFakeBin()

    const result = await runTmux({ binDir, cwd })

    expect(result.exitCode).toBe(0)
    expect(result.log).toContain(
      `QUEUES=${workerQueuePolicy.ioCapableQueues.map(queueName => `-${queueName}`).join(',')}`,
    )
    expect(result.log).not.toContain('QUEUES= UV_THREADPOOL_SIZE')
  })

  it('refuses to run from inside an existing tmux session', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({ binDir, cwd, tmuxEnv: '/tmp/tmux-session' })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('Error: ./dev/tmux must be run outside tmux.')
    expect(result.log).toBe('')
  })

  it('skips missing assistant CLIs while keeping service windows ordered', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({ claude: false, codex: false })

    const result = await runTmux({ binDir, cwd })

    expect(result.exitCode).toBe(0)
    expect(createdWindowNames(result.log)).toEqual([
      'nextjs',
      'backend',
      'workers-io',
      'worker-cpu',
      'cloudflare',
      'lambdas',
      'shell',
    ])
    expect(result.stdout).toContain("Note: 'claude' CLI not found")
    expect(result.stdout).toContain("Note: 'codex' CLI not found")
    expect(result.stdout).toContain('Cursor CLI not found')
    expect(result.log).toContain(':nextjs')
    expect(result.log).not.toContain('split-window')
  })

  it('opens a cursor window when cursor-agent is on PATH', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({ cursor: true })

    const result = await runTmux({ binDir, cwd })

    expect(result.exitCode).toBe(0)
    expect(createdWindowNames(result.log)).toEqual([
      'nextjs',
      'backend',
      'workers-io',
      'worker-cpu',
      'cloudflare',
      'lambdas',
      'claude',
      'codex',
      'cursor',
      'shell',
    ])
    expect(result.log).toContain(':cursor')
  })
})
