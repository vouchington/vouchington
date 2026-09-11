import { randomUUID } from 'node:crypto'
import { setImmediate } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishImportProgress, subscribeImportProgress } from '../import-progress-pubsub.mts'

describe('import-progress-pubsub', () => {
  let cleanup: Array<() => void | Promise<void>> = []

  afterEach(async () => {
    for (const fn of cleanup.reverse()) {
      await fn()
    }
    cleanup = []
  })

  function trackClose<T extends { close(): void | Promise<void> }>(subscription: T): T {
    cleanup.push(() => subscription.close())
    return subscription
  }

  it('publishes and receives progress updates', async () => {
    const batchId = `batch-${randomUUID()}`
    const sub = trackClose(await subscribeImportProgress(batchId))
    const received: Array<{
      batchId: string
      completed: number
      failed: number
      total: number
      done: boolean
    }> = []
    sub.setHandler(chunk => received.push(chunk))

    await publishImportProgress(batchId, {
      batchId,
      completed: 5,
      failed: 0,
      total: 10,
      done: false,
    })

    await vi.waitFor(() => {
      expect(received).toEqual([
        {
          batchId,
          completed: 5,
          failed: 0,
          total: 10,
          done: false,
        },
      ])
    })
  })

  it('replays buffered progress updates after handler registration', async () => {
    const batchId = `batch-${randomUUID()}`
    const sub = trackClose(await subscribeImportProgress(batchId))
    const readinessProbe: Array<{
      batchId: string
      completed: number
      failed: number
      total: number
      done: boolean
    }> = []

    sub.setHandler(chunk => readinessProbe.push(chunk))
    await publishImportProgress(batchId, {
      batchId,
      completed: 0,
      failed: 0,
      total: 1,
      done: false,
    })
    await vi.waitFor(() => {
      expect(readinessProbe).toEqual([
        {
          batchId,
          completed: 0,
          failed: 0,
          total: 1,
          done: false,
        },
      ])
    })
    sub.setHandler(null)

    await publishImportProgress(batchId, {
      batchId,
      completed: 1,
      failed: 0,
      total: 1,
      done: true,
    })
    await setImmediate()

    const received: Array<{
      batchId: string
      completed: number
      failed: number
      total: number
      done: boolean
    }> = []
    sub.setHandler(chunk => received.push(chunk))

    await vi.waitFor(() => {
      expect(received).toEqual([
        {
          batchId,
          completed: 1,
          failed: 0,
          total: 1,
          done: true,
        },
      ])
    })
  })

  it('delivers progress updates in order to multiple subscribers', async () => {
    const batchId = `batch-${randomUUID()}`
    const subA = trackClose(await subscribeImportProgress(batchId))
    const subB = trackClose(await subscribeImportProgress(batchId))
    const receivedA: Array<{
      batchId: string
      completed: number
      failed: number
      total: number
      done: boolean
    }> = []
    const receivedB: Array<{
      batchId: string
      completed: number
      failed: number
      total: number
      done: boolean
    }> = []

    subA.setHandler(chunk => receivedA.push(chunk))
    subB.setHandler(chunk => receivedB.push(chunk))

    await publishImportProgress(batchId, {
      batchId,
      completed: 2,
      failed: 0,
      total: 3,
      done: false,
    })

    await vi.waitFor(() => {
      expect(receivedA).toEqual([
        {
          batchId,
          completed: 2,
          failed: 0,
          total: 3,
          done: false,
        },
      ])
      expect(receivedB).toEqual([
        {
          batchId,
          completed: 2,
          failed: 0,
          total: 3,
          done: false,
        },
      ])
    })
  })

  it('delivers updates only to the matching batch subscription', async () => {
    const batchA = `batch-${randomUUID()}`
    const batchB = `batch-${randomUUID()}`
    const subA = trackClose(await subscribeImportProgress(batchA))
    const subB = trackClose(await subscribeImportProgress(batchB))
    const receivedA: Array<{ batchId: string; completed: number }> = []
    const receivedB: Array<{ batchId: string; completed: number }> = []

    subA.setHandler(chunk => receivedA.push(chunk))
    subB.setHandler(chunk => receivedB.push(chunk))

    await publishImportProgress(batchA, {
      batchId: batchA,
      completed: 1,
      failed: 0,
      total: 2,
      done: false,
    })
    await publishImportProgress(batchB, {
      batchId: batchB,
      completed: 2,
      failed: 0,
      total: 2,
      done: true,
    })

    await vi.waitFor(() => {
      expect(receivedA).toEqual([
        { batchId: batchA, completed: 1, failed: 0, total: 2, done: false },
      ])
      expect(receivedB).toEqual([
        { batchId: batchB, completed: 2, failed: 0, total: 2, done: true },
      ])
    })
  })
})
