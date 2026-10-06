import { describe, expect, it } from 'vitest'
import { createDataStoreShutdownRegistry } from './data-store-shutdown-registry.mts'

describe('owned data-store shutdown registry', () => {
  it('executes the registered callbacks without dependency overrides', async () => {
    const calls: string[] = []
    const logs: unknown[][] = []
    const registry = createDataStoreShutdownRegistry((...args) => logs.push(args))
    registry.registerGracefulShutdownValkey(async () => {
      calls.push('valkey')
    })
    registry.registerGracefulShutdownPSQL(async () => {
      calls.push('psql')
    })

    await expect(registry.close()).resolves.toEqual([])

    expect(calls).toEqual(['valkey', 'psql'])
    expect(logs).toEqual([
      ['Graceful Shutdown: Valkey connection closed.'],
      ['Graceful Shutdown: PostgreSQL connection closed.'],
    ])
  })

  it('defaults to no-op callbacks before registration', async () => {
    const logs: unknown[][] = []
    const registry = createDataStoreShutdownRegistry((...args) => logs.push(args))

    await expect(registry.close()).resolves.toEqual([])
    expect(logs).toHaveLength(2)
  })

  it('uses the most recent registration', async () => {
    const calls: string[] = []
    const registry = createDataStoreShutdownRegistry(() => {})
    registry.registerGracefulShutdownValkey(async () => {
      calls.push('old')
    })
    registry.registerGracefulShutdownValkey(async () => {
      calls.push('current')
    })

    await registry.close()

    expect(calls).toEqual(['current'])
  })

  it('prefers explicit overrides without changing registered owners', async () => {
    const calls: string[] = []
    const registry = createDataStoreShutdownRegistry(() => {})
    registry.registerGracefulShutdownValkey(async () => {
      calls.push('registered-valkey')
    })
    registry.registerGracefulShutdownPSQL(async () => {
      calls.push('registered-psql')
    })

    await expect(
      registry.close({
        onGracefulShutdownValkey: async () => {
          calls.push('override-valkey')
        },
        onGracefulShutdownPSQL: async () => {
          calls.push('override-psql')
        },
      }),
    ).resolves.toEqual([])
    expect(calls).toEqual(['override-valkey', 'override-psql'])
    await expect(registry.close()).resolves.toEqual([])
    expect(calls).toEqual([
      'override-valkey',
      'override-psql',
      'registered-valkey',
      'registered-psql',
    ])
  })

  it('starts both closes concurrently and waits for both', async () => {
    const started: string[] = []
    const valkey = Promise.withResolvers<void>()
    const psql = Promise.withResolvers<void>()
    const registry = createDataStoreShutdownRegistry(() => {})
    registry.registerGracefulShutdownValkey(async () => {
      started.push('valkey')
      await valkey.promise
    })
    registry.registerGracefulShutdownPSQL(async () => {
      started.push('psql')
      await psql.promise
    })
    let settled = false
    const closing = registry.close().then(errors => {
      settled = true
      return errors
    })
    try {
      await Promise.resolve()
      expect(started).toEqual(['valkey', 'psql'])
      expect(settled).toBe(false)
      valkey.resolve()
      await Promise.resolve()
      expect(settled).toBe(false)
      psql.resolve()
      await expect(closing).resolves.toEqual([])
      expect(settled).toBe(true)
    } finally {
      valkey.resolve()
      psql.resolve()
      await closing
    }
  })

  it('normalizes all failures in stable data-store order', async () => {
    const valkeyError = new Error('valkey close failed')
    const calls: string[] = []
    const logs: unknown[][] = []
    const registry = createDataStoreShutdownRegistry((...args) => logs.push(args))
    registry.registerGracefulShutdownValkey(async () => {
      calls.push('valkey')
      throw valkeyError
    })
    registry.registerGracefulShutdownPSQL(() => {
      calls.push('psql')
      // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- exercise normalization of an external close provider's non-Error failure
      throw 'psql close failed'
    })

    const errors = await registry.close()

    expect(calls).toEqual(['valkey', 'psql'])
    expect(errors).toHaveLength(2)
    expect(errors[0]).toBe(valkeyError)
    expect(errors[1]).toBeInstanceOf(Error)
    expect(logs).toEqual([])
  })

  it('lets an explicit logger override the owning logger', async () => {
    const defaultLogs: unknown[][] = []
    const explicitLogs: unknown[][] = []
    const registry = createDataStoreShutdownRegistry((...args) => defaultLogs.push(args))

    await registry.close({ logger: (...args) => explicitLogs.push(args) })

    expect(defaultLogs).toEqual([])
    expect(explicitLogs).toEqual([
      ['Graceful Shutdown: Valkey connection closed.'],
      ['Graceful Shutdown: PostgreSQL connection closed.'],
    ])
  })
})
