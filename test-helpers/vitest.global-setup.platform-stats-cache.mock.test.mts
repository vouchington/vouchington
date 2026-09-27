import { PassThrough } from 'node:stream'
import { execFileSync, spawn, ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TestProject } from 'vitest/node'
import setup from './vitest.global-setup.platform-stats-cache.mts'

vi.mock<typeof import('node:child_process')>(import('node:child_process'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    execFileSync: vi.fn<VitestLooseMock>(),
    spawn: vi.fn<VitestLooseMock>(),
  }
})

const containerId = 'a'.repeat(64)
type Failure = 'start' | 'create' | 'id' | 'unhealthy' | 'exit'

function fixture(failure?: Failure, manualHealth = false) {
  let owner = ''
  let foreign = false
  const watcher = new ChildProcess()
  const stdout = new PassThrough()
  watcher.stdout = stdout
  vi.spyOn(watcher, 'kill').mockReturnValue(true)
  const provide = vi.fn<TestProject['provide']>()
  const commands = vi.mocked(execFileSync)
  vi.mocked(spawn).mockReturnValue(watcher)
  commands.mockImplementation((...parameters) => {
    const args = parameters[1]
    if (!Array.isArray(args)) throw new Error('Expected Docker argument array')
    if (args[0] === 'create') {
      owner = String(args[args.indexOf('--label') + 1]).split('=')[1]
      if (failure === 'create') throw new Error('create transport timeout')
      return Buffer.from(failure === 'id' ? 'missing-id' : containerId)
    }
    if (args[0] === 'ps') return Buffer.from(containerId)
    if (args[0] === 'start') {
      if (failure === 'start') throw new Error('start failed')
      if (failure === 'exit') queueMicrotask(() => watcher.emit('close', null, 'SIGTERM'))
      else if (!manualHealth)
        queueMicrotask(() =>
          stdout.write(
            `${JSON.stringify({
              Actor: { ID: containerId },
              Action: `health_status: ${failure === 'unhealthy' ? 'unhealthy' : 'healthy'}`,
            })}\n`,
          ),
        )
    }
    if (args[0] === 'inspect')
      return Buffer.from(
        String(args[2]).includes('NetworkSettings')
          ? JSON.stringify({ '6379/tcp': [{ HostIp: '127.0.0.1', HostPort: '43210' }] })
          : foreign
            ? 'foreign-owner'
            : owner,
      )
    return Buffer.from('')
  })
  return {
    project: { provide } satisfies Pick<TestProject, 'provide'>,
    provide,
    watcher,
    stdout,
    commands,
    owner: () => owner,
    makeForeign: () => {
      foreign = true
    },
  }
}

describe('private platform-stats cache lifecycle', () => {
  afterEach(() => vi.clearAllMocks())

  it('provides the healthy owned endpoint and removes that exact container on teardown', async () => {
    const target = fixture()
    const teardown = await setup(target.project)
    expect(target.provide).toHaveBeenCalledWith('platformStatsCache', {
      url: 'redis://127.0.0.1:43210',
      owner: target.owner(),
    })
    expect(target.watcher.kill).toHaveBeenCalledOnce()
    expect(
      target.commands.mock.calls.find(([, args]) => Array.isArray(args) && args[0] === 'rm'),
    ).toBeUndefined()
    teardown()
    expect(target.commands).toHaveBeenLastCalledWith('docker', ['rm', '--force', containerId], {
      timeout: 30_000,
    })
    const create = target.commands.mock.calls[0][1] as string[]
    expect(create).toContain('127.0.0.1::6379')
    expect(create).not.toContain('--volume')
    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      'docker',
      [
        'events',
        '--since',
        expect.any(String),
        '--filter',
        `container=${containerId}`,
        '--format',
        '{{json .}}',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 },
    )
  })

  it.each([
    ['start', 'start failed', 1],
    ['create', 'create transport timeout', 0],
    ['id', 'Docker did not return a container ID', 0],
    ['unhealthy', 'unhealthy', 1],
    ['exit', 'health watcher exited', 1],
  ] as const)('cleans up its owned container after %s failure', async (mode, message, watchers) => {
    const target = fixture(mode)
    await expect(setup(target.project)).rejects.toThrow(message)
    expect(target.commands).toHaveBeenLastCalledWith('docker', ['rm', '--force', containerId], {
      timeout: 30_000,
    })
    expect(target.watcher.kill).toHaveBeenCalledTimes(watchers)
    expect(spawn).toHaveBeenCalledTimes(watchers)
  })

  it('ignores a healthy event for another container', async () => {
    const target = fixture(undefined, true)
    const starting = setup(target.project)
    await Promise.resolve()
    target.stdout.write(
      `${JSON.stringify({ Actor: { ID: 'b'.repeat(64) }, Action: 'health_status: healthy' })}\n`,
    )
    await Promise.resolve()
    expect(target.provide).not.toHaveBeenCalled()
    target.stdout.write(
      `${JSON.stringify({ Actor: { ID: containerId }, Action: 'health_status: healthy' })}\n`,
    )
    const teardown = await starting
    teardown()
  })

  it('refuses to remove a container whose ownership label differs', async () => {
    const target = fixture()
    const teardown = await setup(target.project)
    target.makeForeign()
    expect(teardown).toThrow('foreign platform-stats cache container')
    expect(
      target.commands.mock.calls.some(([, args]) => Array.isArray(args) && args[0] === 'rm'),
    ).toBe(false)
  })
})
