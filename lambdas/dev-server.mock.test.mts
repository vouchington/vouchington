import type { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type http from 'node:http'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('node:child_process')>(import('node:child_process'), () => ({
  spawnSync: vi.fn<VitestLooseMock>(),
}))

const { spawnSync: spawnSyncMock } = vi.mocked(await import('node:child_process'))
const { listenWithRetry } = await import('./dev-server.mts')

type ListenOutcome = 'EADDRINUSE' | 'ok'

function createFakeServer(outcomes: ListenOutcome[]): { fake: http.Server } {
  const emitter = new EventEmitter()
  const fake = emitter as unknown as http.Server
  fake.listen = ((_port: number, callback?: () => void) => {
    if (callback) {
      fake.once('listening', callback)
    }
    const outcome = outcomes.shift()
    if (outcome === 'ok') {
      emitter.emit('listening')
    } else {
      emitter.emit('error', Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }))
    }
    return fake
  }) as unknown as http.Server['listen']
  return { fake }
}

function spawnSyncResult(
  overrides: Partial<ReturnType<typeof spawnSync>>,
): ReturnType<typeof spawnSync> {
  return {
    error: undefined,
    output: [],
    pid: 1,
    signal: null,
    status: 0,
    stderr: Buffer.from(''),
    stdout: Buffer.from(''),
    ...overrides,
  } as unknown as ReturnType<typeof spawnSync>
}

describe('listenWithRetry bind-time diagnostics', () => {
  const originalDiagnosticsDir = process.env.BROWSER_PORT_DIAGNOSTICS_DIR

  beforeEach(() => {
    vi.useFakeTimers()
    spawnSyncMock.mockReset()
    spawnSyncMock.mockReturnValue(spawnSyncResult({}))
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalDiagnosticsDir === undefined) {
      delete process.env.BROWSER_PORT_DIAGNOSTICS_DIR
    } else {
      process.env.BROWSER_PORT_DIAGNOSTICS_DIR = originalDiagnosticsDir
    }
  })

  it('does not spawn a probe when BROWSER_PORT_DIAGNOSTICS_DIR is unset', () => {
    delete process.env.BROWSER_PORT_DIAGNOSTICS_DIR
    const { fake } = createFakeServer(['EADDRINUSE'])

    expect(() => listenWithRetry(fake, 4100, 1, { maxAttempts: 1 })).toThrow('EADDRINUSE')
    expect(spawnSyncMock).not.toHaveBeenCalled()
  })

  it('captures the first collision even while retries remain', () => {
    process.env.BROWSER_PORT_DIAGNOSTICS_DIR = '/tmp/bind-time-diagnostics-test'
    const { fake } = createFakeServer(['EADDRINUSE'])
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined)

    expect(() => listenWithRetry(fake, 4100, 1, { maxAttempts: 3 })).not.toThrow()

    expect(spawnSyncMock).toHaveBeenCalledTimes(1)
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'bash',
      expect.arrayContaining([
        expect.stringContaining('ci/diagnose-browser-port-collision.sh'),
        '--ports',
        '4100',
        '--output-dir',
        '/tmp/bind-time-diagnostics-test/bind-time-attempt-1',
      ]),
      expect.objectContaining({
        env: expect.objectContaining({ BROWSER_PORT_DIAGNOSTICS_TIMEOUT_SECONDS: '4' }),
      }),
    )
    warnSpy.mockRestore()
  })

  it('skips capture on intermediate retries between the first and the final attempt', () => {
    process.env.BROWSER_PORT_DIAGNOSTICS_DIR = '/tmp/bind-time-diagnostics-test'
    const { fake } = createFakeServer(['EADDRINUSE'])
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined)

    expect(() => listenWithRetry(fake, 4100, 2, { maxAttempts: 3 })).not.toThrow()

    expect(spawnSyncMock).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('captures the final give-up attempt before throwing', () => {
    process.env.BROWSER_PORT_DIAGNOSTICS_DIR = '/tmp/bind-time-diagnostics-test'
    const { fake } = createFakeServer(['EADDRINUSE'])

    expect(() => listenWithRetry(fake, 4100, 3, { maxAttempts: 3 })).toThrow('EADDRINUSE')

    expect(spawnSyncMock).toHaveBeenCalledTimes(1)
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'bash',
      expect.arrayContaining([
        '--output-dir',
        '/tmp/bind-time-diagnostics-test/bind-time-attempt-3',
      ]),
      expect.anything(),
    )
  })

  it('warns instead of throwing when the probe fails to spawn', () => {
    process.env.BROWSER_PORT_DIAGNOSTICS_DIR = '/tmp/bind-time-diagnostics-test'
    spawnSyncMock.mockReturnValue(spawnSyncResult({ error: new Error('spawn bash ENOENT') }))
    const { fake } = createFakeServer(['EADDRINUSE'])
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined)

    expect(() => listenWithRetry(fake, 4100, 1, { maxAttempts: 3 })).not.toThrow()

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('bind-time port diagnostics did not run: spawn bash ENOENT'),
    )
    warnSpy.mockRestore()
  })

  it('warns instead of throwing when spawnSync itself throws synchronously', () => {
    process.env.BROWSER_PORT_DIAGNOSTICS_DIR = '/tmp/bind-time-diagnostics-test'
    const thrown = new Error('spawnSync exploded')
    spawnSyncMock.mockImplementation(() => {
      throw thrown
    })
    const { fake } = createFakeServer(['EADDRINUSE'])
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined)

    expect(() => listenWithRetry(fake, 4100, 1, { maxAttempts: 3 })).not.toThrow()

    expect(warnSpy).toHaveBeenCalledWith(
      'Lambda dev server: bind-time port diagnostics threw unexpectedly:',
      thrown,
    )
    warnSpy.mockRestore()
  })
})
