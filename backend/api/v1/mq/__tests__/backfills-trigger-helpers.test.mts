import { describe, expect, it, vi } from 'vitest'
import {
  createBackfillDispatcherTrigger,
  createBackfillTrigger,
  createPriorityBackfillTrigger,
} from '../backfills-trigger-helpers.mts'

describe('backfill trigger helpers', () => {
  it('awaits the direct enqueue promise', async () => {
    const promise = Promise.resolve({ id: 'job-1' })
    const enqueue = vi.fn<() => Promise<unknown>>()
    enqueue.mockReturnValue(promise)

    const trigger = createBackfillTrigger(enqueue)

    await expect(trigger()).resolves.toEqual({ id: 'job-1' })
    expect(enqueue).toHaveBeenCalledWith()
  })

  it('awaits the dispatcher enqueue promise with a backfill dedupe id', async () => {
    const promise = Promise.resolve({ id: 'job-1' })
    const enqueue = vi.fn<(options?: { deduplicationId?: string }) => Promise<unknown>>()
    enqueue.mockReturnValue(promise)

    const trigger = createBackfillDispatcherTrigger('example-backfill', enqueue)

    await expect(trigger()).resolves.toEqual({ id: 'job-1' })
    expect(enqueue).toHaveBeenCalledWith({ deduplicationId: 'backfill:example-backfill' })
  })

  it('awaits the priority enqueue promise with priority 100', async () => {
    const promise = Promise.resolve([{ id: 'job-1' }])
    const enqueue = vi.fn<(data: { entityType: 'posts' }, priority: 100) => Promise<unknown>>()
    enqueue.mockReturnValue(promise)

    const trigger = createPriorityBackfillTrigger({ entityType: 'posts' }, enqueue)

    await expect(trigger()).resolves.toEqual([{ id: 'job-1' }])
    expect(enqueue).toHaveBeenCalledWith({ entityType: 'posts' }, 100)
  })

  it('converts synchronous enqueue errors to rejected promises', async () => {
    const error = new Error('sync enqueue failure')
    const enqueue = vi.fn<() => void>(() => {
      throw error
    })

    const trigger = createBackfillTrigger(enqueue)

    await expect(trigger()).rejects.toThrow(error)
  })
})
