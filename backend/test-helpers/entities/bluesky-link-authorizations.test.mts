import { readPool, writePool } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'

import { observeTestBlueskyCallbackAuthorizationReadPool } from './bluesky-link-authorizations.mts'

describe('Bluesky callback pool observation', () => {
  it('serializes overlapping observations and restores the original property shape', async () => {
    const readDescriptor = Object.getOwnPropertyDescriptor(readPool, 'query')
    const writeDescriptor = Object.getOwnPropertyDescriptor(writePool, 'query')
    const readHadOwnQuery = Object.hasOwn(readPool, 'query')
    const writeHadOwnQuery = Object.hasOwn(writePool, 'query')
    const firstEntered = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    const events: string[] = []

    const first = observeTestBlueskyCallbackAuthorizationReadPool(async () => {
      events.push('first entered')
      firstEntered.resolve()
      await releaseFirst.promise
      events.push('first exited')
    })
    await firstEntered.promise
    const second = observeTestBlueskyCallbackAuthorizationReadPool(async () => {
      events.push('second entered')
    })
    await Promise.resolve()

    expect(events).toEqual(['first entered'])
    releaseFirst.resolve()
    await Promise.all([first, second])

    expect(events).toEqual(['first entered', 'first exited', 'second entered'])
    expect(Object.hasOwn(readPool, 'query')).toBe(readHadOwnQuery)
    expect(Object.hasOwn(writePool, 'query')).toBe(writeHadOwnQuery)
    expect(Object.getOwnPropertyDescriptor(readPool, 'query')).toEqual(readDescriptor)
    expect(Object.getOwnPropertyDescriptor(writePool, 'query')).toEqual(writeDescriptor)
  })

  it('allows nested observation and releases the lock after an operation failure', async () => {
    const operationError = new Error('operation failed')
    const readDescriptor = Object.getOwnPropertyDescriptor(readPool, 'query')
    const writeDescriptor = Object.getOwnPropertyDescriptor(writePool, 'query')
    await expect(
      observeTestBlueskyCallbackAuthorizationReadPool(async () => {
        const nested = await observeTestBlueskyCallbackAuthorizationReadPool(async () => 'nested')
        expect(nested.result).toBe('nested')
        throw operationError
      }),
    ).rejects.toBe(operationError)

    await expect(
      observeTestBlueskyCallbackAuthorizationReadPool(async () => 'next'),
    ).resolves.toEqual({ result: 'next', pools: [] })
    expect(Object.getOwnPropertyDescriptor(readPool, 'query')).toEqual(readDescriptor)
    expect(Object.getOwnPropertyDescriptor(writePool, 'query')).toEqual(writeDescriptor)
  })

  it('queues a stale async descendant as a new outer observation', async () => {
    const allowStaleDescendant = Promise.withResolvers<void>()
    const staleDescendantRequested = Promise.withResolvers<void>()
    const secondEntered = Promise.withResolvers<void>()
    const releaseSecond = Promise.withResolvers<void>()
    const events: string[] = []
    let staleDescendant!: Promise<unknown>

    await observeTestBlueskyCallbackAuthorizationReadPool(async () => {
      staleDescendant = observeStaleDescendant()

      async function observeStaleDescendant() {
        await allowStaleDescendant.promise
        events.push('stale requested')
        staleDescendantRequested.resolve()
        return observeTestBlueskyCallbackAuthorizationReadPool(async () => {
          events.push('stale entered')
        })
      }
    })

    const second = observeTestBlueskyCallbackAuthorizationReadPool(async () => {
      events.push('second entered')
      secondEntered.resolve()
      await releaseSecond.promise
      events.push('second exited')
    })
    await secondEntered.promise
    allowStaleDescendant.resolve()
    await staleDescendantRequested.promise
    const eventsBeforeRelease = [...events]
    releaseSecond.resolve()
    await Promise.all([second, staleDescendant])

    expect(eventsBeforeRelease).toEqual(['second entered', 'stale requested'])
    expect(events).toEqual(['second entered', 'stale requested', 'second exited', 'stale entered'])
  })
})
