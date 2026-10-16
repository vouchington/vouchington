import { describe, expect, it } from 'vitest'
import { createRetainedBindingCleanupLifetime } from './retained-binding-cleanup-lifetime.mts'

describe('retained binding cleanup lifetime', () => {
  it('preserves raw callback failures including undefined without reporting them again in finish', async () => {
    for (const primary of [new Error('callback'), undefined]) {
      const events: string[] = []
      const owner = createOwner(events)
      await expect(owner.run(() => rejectRaw(primary))).rejects.toBe(primary)
      await owner.finish()
      expect(events).toEqual(['rollback', 'dispose'])
    }
  })

  it('unwraps an escaping operation failure and omits only that reported operation from cleanup', async () => {
    const primary = new Error('query')
    const events: string[] = []
    const owner = createOwner(events)
    await expect(owner.run(() => owner.admit(() => rejectRaw(primary)))).rejects.toBe(primary)
    await owner.finish()
    expect(events).toEqual(['rollback', 'dispose'])
  })

  it('reports a caught rejected undefined operation even when the callback succeeds', async () => {
    const owner = createOwner([])
    await owner.run(async () => {
      await owner.admit(() => rejectRaw(undefined)).catch(() => {})
    })
    const error = await cleanupError(owner.finish())
    expect(error.errors).toEqual([undefined])
    expect(error.cause).toBeUndefined()
  })

  it('retains a caught query failure when the callback replaces its rejection', async () => {
    const queryFailure = new Error('query')
    const replacement = new Error('replacement')
    const owner = createOwner([])
    await expect(
      owner.run(async () => {
        await owner.admit(() => rejectRaw(queryFailure)).catch(() => {})
        throw replacement
      }),
    ).rejects.toBe(replacement)
    const error = await cleanupError(owner.finish())
    expect(error.cause).toBe(replacement)
    expect(error.errors).toEqual([queryFailure])
  })

  it('distinguishes three operation entries that reject the identical raw reason', async () => {
    const shared = new Error('same identity')
    const owner = createOwner([])
    await expect(
      owner.run(async () => {
        await owner.admit(() => rejectRaw(shared)).catch(() => {})
        await owner.admit(() => rejectRaw(shared)).catch(() => {})
        await owner.admit(() => rejectRaw(shared))
      }),
    ).rejects.toBe(shared)
    const error = await cleanupError(owner.finish())
    expect(error.cause).toBe(shared)
    expect(error.errors).toHaveLength(2)
    expect(error.errors[0]).toBe(shared)
    expect(error.errors[1]).toBe(shared)
  })

  it('attempts rollback and disposal once in order and repeats the same cleanup rejection', async () => {
    const secondary = new Error('dispose')
    const events: string[] = []
    const owner = createRetainedBindingCleanupLifetime<void>(
      {
        rollback: () => {
          events.push('rollback')
          return rejectRaw(undefined)
        },
        dispose: () => {
          events.push('dispose')
          return rejectRaw(secondary)
        },
      },
      () => {},
    )
    await expect(owner.run(() => rejectRaw(undefined))).rejects.toBeUndefined()
    const finish = owner.finish()
    expect(owner.finish()).toBe(finish)
    const error = await cleanupError(finish)
    expect(error.cause).toBeUndefined()
    expect(error.errors).toEqual([undefined, secondary])
    expect(await cleanupError(owner.finish())).toBe(error)
    expect(events).toEqual(['rollback', 'dispose'])
  })

  it('registers cleanup before acquisition and joins later root admissions before rolling back', async () => {
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const events: string[] = []
    let registered: (() => Promise<void>) | undefined
    const owner = createOwner(events, finish => {
      events.push('registered')
      registered = finish
    })
    const root = owner.run(async () => {
      await owner.admit(async () => {
        entered.resolve()
        await resume.promise
        events.push('acquired')
      })
      await owner.admit(async () => {
        events.push('later query')
      })
    })
    await entered.promise
    if (!registered) throw new Error('Cleanup must be registered before acquisition')
    const finish = registered()
    expect(events).toEqual(['registered'])
    resume.resolve()
    await root
    await finish
    expect(events).toEqual(['registered', 'acquired', 'later query', 'rollback', 'dispose'])
    expect(() => owner.admit(async () => {})).toThrow('closing')
  })

  it('joins and reports an unawaited failed admission after its root has succeeded', async () => {
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const events: string[] = []
    const owner = createOwner(events)
    await owner.run(async () => {
      void owner.admit(async () => {
        entered.resolve()
        await resume.promise
        return rejectRaw(undefined)
      })
      await entered.promise
    })
    const finish = owner.finish()
    expect(events).toEqual([])
    resume.resolve()
    const error = await cleanupError(finish)
    expect(error.errors).toEqual([undefined])
    expect(error.cause).toBeUndefined()
    expect(events).toEqual(['rollback', 'dispose'])
  })
})

function createOwner(
  events: string[],
  registerFinished: (finish: () => Promise<void>) => void = () => {},
) {
  return createRetainedBindingCleanupLifetime<void>(
    {
      rollback: async () => {
        events.push('rollback')
      },
      dispose: async () => {
        events.push('dispose')
      },
    },
    registerFinished,
  )
}

function rejectRaw(reason: unknown): Promise<never> {
  const rejection = Promise.withResolvers<never>()
  rejection.reject(reason)
  return rejection.promise
}

async function cleanupError(pending: Promise<void>): Promise<AggregateError> {
  const error: unknown = await pending.catch(err => err)
  if (!(error instanceof AggregateError)) throw new Error('Expected owned cleanup failure')
  return error
}
