import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { runValkeyAdminCommand, type ValkeyAdminRuntime } from './valkey-admin-command.mts'
import { installOneOffSignalCancellation } from './valkey-admin-signal-cancellation.mts'

const DIAGNOSTIC_RESULT = {
  memory: {
    usedMemoryBytes: 100,
    usedMemoryRssBytes: 120,
    usedMemoryPeakBytes: 140,
    maxmemoryBytes: 1_000,
    maxmemoryPolicy: 'noeviction',
    usedMemoryDatasetBytes: null,
    lazyfreePendingObjects: 0,
    memFragmentationRatio: 1.2,
  },
  observedFlushTargetKeyCounts: {
    caches: 1,
    'recently-viewed': 2,
    blooms: 3,
    'rate-limiter': 4,
    'dynamic-config': 5,
    sessions: 6,
    queues: 7,
    unclassified: 8,
  },
}

function makeRuntime(): ValkeyAdminRuntime {
  return {
    diagnose: async () => DIAGNOSTIC_RESULT,
    flushConcern: async concern => ({ concern, keysRemoved: 0 }),
    flushQueues: async () => ({ concern: 'queues', keysRemoved: null }),
    shutdown: async () => {},
  }
}

function makeIO() {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    io: {
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    },
  }
}

describe('Valkey admin result and shutdown contract', () => {
  it('returns exit code 1 after preserving successful operation evidence when shutdown fails', async () => {
    const output = makeIO()
    const runtime = makeRuntime()
    runtime.shutdown = () => Promise.reject(new Error('shutdown failed'))

    expect(
      await runValkeyAdminCommand(
        ['diagnose'],
        { ENVIRONMENT: 'staging' },
        async () => runtime,
        output.io,
      ),
    ).toBe(1)
    expect(output.stdout).toHaveLength(1)
    expect(JSON.parse(output.stdout[0]!)).toMatchObject({
      schemaVersion: 1,
      operation: 'diagnose',
      environment: 'staging',
      ...DIAGNOSTIC_RESULT,
    })
    expect(output.stderr).toEqual(['Valkey admin operation failed'])
  })

  it('prevents operation result fields from overriding the evidence envelope', async () => {
    const output = makeIO()
    const runtime = makeRuntime()
    runtime.diagnose = async () =>
      ({
        ...DIAGNOSTIC_RESULT,
        schemaVersion: 999,
        operation: 'flush',
        environment: 'production',
        timestamp: 'untrusted',
      }) as unknown as Awaited<ReturnType<ValkeyAdminRuntime['diagnose']>>

    expect(
      await runValkeyAdminCommand(
        ['diagnose'],
        { ENVIRONMENT: 'staging' },
        async () => runtime,
        output.io,
        () => new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).toBe(0)
    expect(JSON.parse(output.stdout[0]!)).toMatchObject({
      schemaVersion: 1,
      operation: 'diagnose',
      environment: 'staging',
      timestamp: '2026-08-01T12:00:00.000Z',
    })
  })

  it('still shuts down and returns nonzero when completed evidence cannot be written', async () => {
    const runtime = makeRuntime()
    const outputFailure = createOutputFailure()
    outputFailure.next()
    let shutdown = false
    runtime.shutdown = async () => {
      shutdown = true
    }
    const stderr: string[] = []

    expect(
      await runValkeyAdminCommand(['diagnose'], { ENVIRONMENT: 'staging' }, async () => runtime, {
        stdout() {
          outputFailure.throw(undefined)
        },
        stderr: value => stderr.push(value),
      }),
    ).toBe(1)
    expect(shutdown).toBe(true)
    expect(stderr).toEqual(['Valkey admin operation failed'])
  })

  it('shuts down data stores initialized before runtime loading fails', async () => {
    const output = makeIO()
    let shutdown = false

    expect(
      await runValkeyAdminCommand(
        ['diagnose'],
        { ENVIRONMENT: 'staging' },
        async registerPartialInitializationShutdown => {
          registerPartialInitializationShutdown(async () => {
            shutdown = true
          })
          throw new Error('runtime initialization failed')
        },
        output.io,
      ),
    ).toBe(1)
    expect(shutdown).toBe(true)
    expect(output.stdout).toEqual([])
    expect(output.stderr).toEqual(['Valkey admin operation failed'])
  })

  it('cancels during partial runtime initialization without starting the operation', async () => {
    const signalTarget = new EventEmitter()
    const cancellation = installOneOffSignalCancellation(signalTarget)
    const runtimeImport = Promise.withResolvers<void>()
    const partialShutdown = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const standardShutdown = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const runtime = makeRuntime()
    const diagnose = vi.spyOn(runtime, 'diagnose')
    const runtimeShutdown = vi.spyOn(runtime, 'shutdown')
    const output = makeIO()

    try {
      const command = runValkeyAdminCommand(
        ['diagnose'],
        { ENVIRONMENT: 'staging' },
        async registerPartialInitializationShutdown => {
          signalTarget.on('SIGTERM', standardShutdown)
          cancellation.removeStandardListener(standardShutdown)
          registerPartialInitializationShutdown(partialShutdown)
          await runtimeImport.promise
          return runtime
        },
        output.io,
        undefined,
        cancellation.signal,
      )

      signalTarget.emit('SIGTERM')
      expect(cancellation.signal.aborted).toBe(true)
      runtimeImport.resolve()

      await expect(command).resolves.toBe(1)
      expect(diagnose).not.toHaveBeenCalled()
      expect(runtimeShutdown).toHaveBeenCalledOnce()
      expect(partialShutdown).not.toHaveBeenCalled()
      expect(standardShutdown).not.toHaveBeenCalled()
      expect(output.stdout).toEqual([])
      expect(output.stderr).toEqual(['Valkey admin operation failed'])
    } finally {
      cancellation.dispose()
    }
  })

  it('passes the command cancellation signal to every runtime operation API', async () => {
    const cancellation = new AbortController()
    const runtime = makeRuntime()
    const diagnose = vi.spyOn(runtime, 'diagnose')
    const flushConcern = vi.spyOn(runtime, 'flushConcern')
    const flushQueues = vi.spyOn(runtime, 'flushQueues')

    await runValkeyAdminCommand(
      ['diagnose'],
      { ENVIRONMENT: 'staging' },
      async () => runtime,
      makeIO().io,
      undefined,
      cancellation.signal,
    )
    await runValkeyAdminCommand(
      ['flush', 'blooms', '--confirm', 'FLUSH staging VALKEY blooms'],
      { ENVIRONMENT: 'staging' },
      async () => runtime,
      makeIO().io,
      undefined,
      cancellation.signal,
    )
    await runValkeyAdminCommand(
      ['flush', 'queues', '--confirm', 'FLUSH staging VALKEY queues'],
      { ENVIRONMENT: 'staging' },
      async () => runtime,
      makeIO().io,
      undefined,
      cancellation.signal,
    )

    expect(diagnose).toHaveBeenCalledWith(cancellation.signal)
    expect(flushConcern).toHaveBeenCalledWith('blooms', {
      force: false,
      signal: cancellation.signal,
    })
    expect(flushQueues).toHaveBeenCalledWith(cancellation.signal)
  })

  it.each(['resolves', 'rejects'] as const)(
    'drains a cancelled in-flight operation that %s before emitting no evidence and shutting down',
    async settlement => {
      const cancellation = new AbortController()
      const operation = Promise.withResolvers<typeof DIAGNOSTIC_RESULT>()
      const shutdown = Promise.withResolvers<void>()
      const runtime = makeRuntime()
      const diagnose = vi.spyOn(runtime, 'diagnose').mockImplementation(async signal => {
        expect(signal).toBe(cancellation.signal)
        return await operation.promise
      })
      const runtimeShutdown = vi.spyOn(runtime, 'shutdown').mockImplementation(async () => {
        await shutdown.promise
      })
      const output = makeIO()

      const command = runValkeyAdminCommand(
        ['diagnose'],
        { ENVIRONMENT: 'staging' },
        async () => runtime,
        output.io,
        undefined,
        cancellation.signal,
      )
      await vi.waitFor(() => expect(diagnose).toHaveBeenCalledOnce())

      cancellation.abort(new Error('cancelled during operation'))
      await Promise.resolve()
      expect(runtimeShutdown).not.toHaveBeenCalled()
      expect(output.stdout).toEqual([])

      if (settlement === 'resolves') operation.resolve(DIAGNOSTIC_RESULT)
      else operation.reject(new Error('operation stopped after cancellation'))
      await vi.waitFor(() => expect(runtimeShutdown).toHaveBeenCalledOnce())

      let settled = false
      void command.then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)
      expect(output.stdout).toEqual([])

      shutdown.resolve()
      await expect(command).resolves.toBe(1)
      expect(runtimeShutdown).toHaveBeenCalledOnce()
      expect(output.stdout).toEqual([])
      expect(output.stderr).toEqual(['Valkey admin operation failed'])
    },
  )
})

function* createOutputFailure(): Generator<void, void, void> {
  yield
}
