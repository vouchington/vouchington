import { describe, expect, it, vi } from 'vitest'
import {
  parseValkeyAdminCommand,
  runValkeyAdminCommand,
  type ValkeyAdminRuntime,
} from './valkey-admin-command.mts'

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

function makeRuntime(events: string[], operationError?: Error): ValkeyAdminRuntime {
  return {
    async diagnose() {
      events.push('diagnose')
      if (operationError) throw operationError
      return DIAGNOSTIC_RESULT
    },
    async flushConcern(concern, opts) {
      events.push(`flush:${concern}:${opts.force}`)
      if (operationError) throw operationError
      return { concern, keysRemoved: 3 }
    },
    async flushQueues() {
      events.push('flush:queues')
      if (operationError) throw operationError
      return { concern: 'queues', keysRemoved: null }
    },
    async shutdown() {
      events.push('shutdown')
    },
  }
}

function makeIO() {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    io: {
      stdout(value: string) {
        stdout.push(value)
      },
      stderr(value: string) {
        stderr.push(value)
      },
    },
  }
}

describe('Valkey admin command', () => {
  it('prints help with exit code 0 without loading runtime dependencies', async () => {
    let loads = 0
    const output = makeIO()
    const exitCode = await runValkeyAdminCommand(
      ['--help'],
      {},
      async () => {
        loads += 1
        return makeRuntime([])
      },
      output.io,
    )

    expect(exitCode).toBe(0)
    expect(loads).toBe(0)
    expect(output.stdout).toHaveLength(1)
    expect(output.stdout[0]).toContain('valkey-admin.mts diagnose')
    expect(output.stderr).toEqual([])
  })

  it('rejects missing, unknown, duplicate, and misplaced arguments with exit code 2', async () => {
    for (const argv of [
      [],
      ['unknown'],
      ['diagnose', '--force'],
      ['flush', 'unknown'],
      ['flush', 'caches', '--confirm'],
      ['flush', 'caches', '--unknown'],
      ['flush', 'caches', '--confirm', 'x', '--confirm', 'x'],
    ]) {
      const output = makeIO()
      const exitCode = await runValkeyAdminCommand(
        argv,
        { ENVIRONMENT: 'staging' },
        async () => {
          throw new Error('runtime must not load')
        },
        output.io,
      )
      expect(exitCode).toBe(2)
      expect(output.stdout).toEqual([])
      expect(output.stderr).toHaveLength(1)
    }
  })

  it('uses the process console when command IO is not supplied', async () => {
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await runValkeyAdminCommand(['--help'], {}, async () => makeRuntime([]))).toBe(0)
      expect(await runValkeyAdminCommand([], {}, async () => makeRuntime([]))).toBe(2)
      expect(stdout).toHaveBeenCalledOnce()
      expect(stderr).toHaveBeenCalledOnce()
    } finally {
      stdout.mockRestore()
      stderr.mockRestore()
    }
  })

  it('accepts staging and production and allows test only under NODE_ENV=test', () => {
    expect(parseValkeyAdminCommand(['diagnose'], { ENVIRONMENT: 'staging' })).toMatchObject({
      environment: 'staging',
    })
    expect(parseValkeyAdminCommand(['diagnose'], { ENVIRONMENT: 'production' })).toMatchObject({
      environment: 'production',
    })
    expect(
      parseValkeyAdminCommand(['diagnose'], { ENVIRONMENT: 'test', NODE_ENV: 'test' }),
    ).toMatchObject({ environment: 'test' })
    expect(() => parseValkeyAdminCommand(['diagnose'], { ENVIRONMENT: 'test' })).toThrow(
      'ENVIRONMENT must be staging or production',
    )
  })

  it('requires an environment-bound confirmation for every flush', () => {
    expect(() => parseValkeyAdminCommand(['flush', 'caches'], { ENVIRONMENT: 'staging' })).toThrow(
      'Confirmation must be exactly: FLUSH staging VALKEY caches',
    )
    expect(() =>
      parseValkeyAdminCommand(['flush', 'caches', '--confirm', 'FLUSH production VALKEY caches'], {
        ENVIRONMENT: 'staging',
      }),
    ).toThrow('Confirmation must be exactly: FLUSH staging VALKEY caches')
    expect(
      parseValkeyAdminCommand(['flush', 'caches', '--confirm', 'FLUSH staging VALKEY caches'], {
        ENVIRONMENT: 'staging',
      }),
    ).toMatchObject({ operation: 'flush', concern: 'caches' })
  })

  it('requires force only for sessions and rejects it for every other concern', () => {
    expect(() =>
      parseValkeyAdminCommand(
        ['flush', 'sessions', '--confirm', 'FLUSH production VALKEY sessions'],
        { ENVIRONMENT: 'production' },
      ),
    ).toThrow('Flushing sessions requires --force')
    expect(
      parseValkeyAdminCommand(
        ['flush', 'sessions', '--force', '--confirm', 'FLUSH production VALKEY sessions'],
        { ENVIRONMENT: 'production' },
      ),
    ).toMatchObject({ concern: 'sessions', force: true })
    expect(() =>
      parseValkeyAdminCommand(
        ['flush', 'queues', '--force', '--confirm', 'FLUSH production VALKEY queues'],
        { ENVIRONMENT: 'production' },
      ),
    ).toThrow('--force is allowed only for sessions')
  })

  it('loads runtime dependencies only after parsing a valid operation', async () => {
    const events: string[] = []
    const output = makeIO()
    await runValkeyAdminCommand(
      ['diagnose'],
      { ENVIRONMENT: 'staging' },
      async () => {
        events.push('load')
        return makeRuntime(events)
      },
      output.io,
    )
    expect(events).toEqual(['load', 'diagnose', 'shutdown'])
  })

  it('writes one schema-version 1 diagnose JSON document before shutting down quietly', async () => {
    const events: string[] = []
    const output = makeIO()
    const exitCode = await runValkeyAdminCommand(
      ['diagnose'],
      { ENVIRONMENT: 'staging' },
      async () => makeRuntime(events),
      {
        stdout(value) {
          events.push('stdout')
          output.io.stdout(value)
        },
        stderr: output.io.stderr,
      },
      () => new Date('2026-07-31T12:00:00.000Z'),
    )

    expect(exitCode).toBe(0)
    expect(events).toEqual(['diagnose', 'stdout', 'shutdown'])
    expect(output.stderr).toEqual([])
    expect(output.stdout).toHaveLength(1)
    expect(JSON.parse(output.stdout[0]!)).toEqual({
      schemaVersion: 1,
      operation: 'diagnose',
      environment: 'staging',
      timestamp: '2026-07-31T12:00:00.000Z',
      ...DIAGNOSTIC_RESULT,
    })
  })

  it('dispatches service and queue flushes and writes the versioned result', async () => {
    const serviceEvents: string[] = []
    const serviceOutput = makeIO()
    expect(
      await runValkeyAdminCommand(
        ['flush', 'blooms', '--confirm', 'FLUSH staging VALKEY blooms'],
        { ENVIRONMENT: 'staging' },
        async () => makeRuntime(serviceEvents),
        serviceOutput.io,
      ),
    ).toBe(0)
    expect(serviceEvents).toEqual(['flush:blooms:false', 'shutdown'])
    expect(JSON.parse(serviceOutput.stdout[0]!)).toMatchObject({
      schemaVersion: 1,
      operation: 'flush',
      environment: 'staging',
      concern: 'blooms',
      keysRemoved: 3,
    })

    const queueEvents: string[] = []
    const queueOutput = makeIO()
    await runValkeyAdminCommand(
      ['flush', 'queues', '--confirm', 'FLUSH production VALKEY queues'],
      { ENVIRONMENT: 'production' },
      async () => makeRuntime(queueEvents),
      queueOutput.io,
    )
    expect(queueEvents).toEqual(['flush:queues', 'shutdown'])
    expect(JSON.parse(queueOutput.stdout[0]!)).toMatchObject({
      concern: 'queues',
      keysRemoved: null,
    })
  })

  it('returns exit code 1, writes only stderr, and still shuts down after an operational failure', async () => {
    const events: string[] = []
    const output = makeIO()
    const exitCode = await runValkeyAdminCommand(
      ['diagnose'],
      { ENVIRONMENT: 'production' },
      async () =>
        makeRuntime(
          events,
          new Error('Unable to connect to rediss://admin:secret@valkey.voucha.ai:6380/0'),
        ),
      output.io,
    )

    expect(exitCode).toBe(1)
    expect(events).toEqual(['diagnose', 'shutdown'])
    expect(output.stdout).toEqual([])
    expect(output.stderr).toEqual(['Valkey admin operation failed'])
    expect(output.stderr.join('\n')).not.toContain('admin:secret')
  })
})
