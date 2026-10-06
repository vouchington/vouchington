import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { publishImportProgress, subscribeImportProgress } from '../import-progress-pubsub.mts'

type ImportProgress = {
  batchId: string
  completed: number
  failed: number
  total: number
  done: boolean
}

describe('import-progress-pubsub', () => {
  let cleanup: Array<() => void | Promise<void>> = []

  afterEach(async () => {
    for (const fn of cleanup.toReversed()) {
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
    const progress = { batchId, completed: 5, failed: 0, total: 10, done: false }
    const sub = trackClose(await subscribeImportProgress(batchId))
    const received = nextMessage<ImportProgress>(sub.setHandler)

    await publishImportProgress(batchId, progress)
    await expect(received).resolves.toEqual(progress)
  })

  it('replays buffered progress updates after handler registration', async () => {
    const batchId = `batch-${randomUUID()}`
    const ready = { batchId, completed: 0, failed: 0, total: 1, done: false }
    const buffered = { batchId, completed: 1, failed: 0, total: 1, done: true }
    const sub = trackClose(await subscribeImportProgress(batchId))
    const readiness = nextMessage<ImportProgress>(sub.setHandler)
    await publishImportProgress(batchId, ready)
    await expect(readiness).resolves.toEqual(ready)
    sub.setHandler(null)

    const probe = trackClose(await subscribeImportProgress(batchId))
    const seen = nextMessage<ImportProgress>(probe.setHandler)
    await publishImportProgress(batchId, buffered)
    await seen

    const received: ImportProgress[] = []
    sub.setHandler(chunk => {
      received.push(chunk)
    })
    expect(received).toEqual([buffered])
  })

  it('delivers progress updates in order to multiple subscribers', async () => {
    const batchId = `batch-${randomUUID()}`
    const progress = { batchId, completed: 2, failed: 0, total: 3, done: false }
    const subA = trackClose(await subscribeImportProgress(batchId))
    const subB = trackClose(await subscribeImportProgress(batchId))
    const receivedA = nextMessage<ImportProgress>(subA.setHandler)
    const receivedB = nextMessage<ImportProgress>(subB.setHandler)

    await publishImportProgress(batchId, progress)
    expect(await receivedA).toEqual(progress)
    expect(await receivedB).toEqual(progress)
  })

  it('delivers updates only to the matching batch subscription', async () => {
    const batchA = `batch-${randomUUID()}`
    const batchB = `batch-${randomUUID()}`
    const progressA = { batchId: batchA, completed: 1, failed: 0, total: 2, done: false }
    const progressB = { batchId: batchB, completed: 2, failed: 0, total: 2, done: true }
    const subA = trackClose(await subscribeImportProgress(batchA))
    const subB = trackClose(await subscribeImportProgress(batchB))
    const receivedA = nextMessage<ImportProgress>(subA.setHandler)
    const receivedB = nextMessage<ImportProgress>(subB.setHandler)

    await publishImportProgress(batchA, progressA)
    await publishImportProgress(batchB, progressB)
    expect(await receivedA).toEqual(progressA)
    expect(await receivedB).toEqual(progressB)
  })
})

function nextMessage<T>(setHandler: (handler: (value: T) => void) => void): Promise<T> {
  return new Promise(resolve => {
    setHandler(value => {
      resolve(value)
    })
  })
}
