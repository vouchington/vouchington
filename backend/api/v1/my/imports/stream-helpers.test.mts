import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportProgressChunk, ImportProgressSubscription } from '@data-stores/valkey-pubsub'
import { pipeImportProgressToSSE, pipeUserRssFeedImportProgressToSSE } from './stream-helpers.mts'

const FAKE_USER_ID = '01900000-0000-7000-0000-000000000001'
const pendingImport = {
  import: {
    id: '01900000-0000-7000-8000-000000000123',
    total_rows: 1,
    completed_rows: 0,
    failed_rows: 0,
    pending_rows: 1,
    completed_at: null,
    created_at: new Date(),
  },
  rows: [],
}

function makeMockSubscription(): {
  sub: ImportProgressSubscription
  trigger: (chunk: ImportProgressChunk) => void
} {
  let handler: ((chunk: ImportProgressChunk) => void) | null = null

  const sub: ImportProgressSubscription = {
    setHandler(fn) {
      handler = fn
    },
    close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }

  return {
    sub,
    trigger(chunk) {
      handler?.(chunk)
    },
  }
}

describe('pipeImportProgressToSSE', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves immediately when disconnectSignal is already aborted', async () => {
    const { sub } = makeMockSubscription()
    const abortController = new AbortController()
    abortController.abort()
    const writes: string[] = []

    await pipeImportProgressToSSE({
      subscription: sub,
      write: data => writes.push(data),
      disconnectSignal: abortController.signal,
      throttleIntervalMs: 250,
    })

    expect(writes).toHaveLength(0)
  })

  it('emits done event and resolves when a done chunk arrives', async () => {
    const { sub, trigger } = makeMockSubscription()
    const writes: string[] = []

    const promise = pipeImportProgressToSSE({
      subscription: sub,
      write: data => writes.push(data),
      disconnectSignal: new AbortController().signal,
      throttleIntervalMs: 250,
    })

    const doneChunk: ImportProgressChunk = {
      batchId: 'b1',
      completed: 2,
      failed: 0,
      total: 2,
      done: true,
    }
    trigger(doneChunk)

    await promise

    const doneWrite = writes.find(w => w.includes('event: done'))
    expect(doneWrite).toBeTruthy()
    const progressWrite = writes.find(w => w.includes('event: progress'))
    expect(progressWrite).toBeTruthy()
    expect(progressWrite).toContain(JSON.stringify(doneChunk))
  })

  it('throttles progress writes via setInterval flush', async () => {
    const { sub, trigger } = makeMockSubscription()
    const writes: string[] = []

    const promise = pipeImportProgressToSSE({
      subscription: sub,
      write: data => writes.push(data),
      disconnectSignal: new AbortController().signal,
      throttleIntervalMs: 250,
    })

    const chunk1: ImportProgressChunk = {
      batchId: 'b1',
      completed: 1,
      failed: 0,
      total: 5,
      done: false,
    }
    const chunk2: ImportProgressChunk = {
      batchId: 'b1',
      completed: 2,
      failed: 0,
      total: 5,
      done: false,
    }
    trigger(chunk1)
    trigger(chunk2) // overwrites pending — only chunk2 should flush

    await vi.advanceTimersByTimeAsync(300)

    // Only the latest chunk should have been written (coalescing behavior)
    const progressWrites = writes.filter(w => w.includes('event: progress'))
    expect(progressWrites).toHaveLength(1)
    expect(progressWrites[0]).toContain(JSON.stringify(chunk2))

    // Clean up by triggering done
    trigger({ ...chunk2, completed: 5, done: true })
    await promise
  })

  it('resolves on disconnect signal abort', async () => {
    const { sub } = makeMockSubscription()
    const abortController = new AbortController()
    const writes: string[] = []

    const promise = pipeImportProgressToSSE({
      subscription: sub,
      write: data => writes.push(data),
      disconnectSignal: abortController.signal,
      throttleIntervalMs: 250,
    })

    abortController.abort()
    await promise

    // No events written on disconnect
    expect(writes).toHaveLength(0)
  })

  it('settles when replay aborts synchronously during handler registration', async () => {
    const abortController = new AbortController()
    let handler: ((chunk: ImportProgressChunk) => void) | null = null
    const subscription: ImportProgressSubscription = {
      setHandler(nextHandler) {
        handler = nextHandler
        if (nextHandler) abortController.abort()
      },
      close: vi.fn<VitestLooseMock>(),
    }

    await pipeImportProgressToSSE({
      subscription,
      write: vi.fn<VitestLooseMock>(),
      disconnectSignal: abortController.signal,
      throttleIntervalMs: 250,
    })

    expect(handler).toBeNull()
  })

  it('settles when disconnect is visible on the post-listener recheck', async () => {
    let abortedReads = 0
    const disconnectSignal = {
      get aborted() {
        abortedReads += 1
        return abortedReads > 1
      },
      addEventListener: vi.fn<VitestLooseMock>(),
      removeEventListener: vi.fn<VitestLooseMock>(),
    } as unknown as AbortSignal
    const { sub } = makeMockSubscription()
    const setHandlerSpy = vi.spyOn(sub, 'setHandler')
    const write = vi.fn<(data: string) => void>()

    await pipeImportProgressToSSE({
      subscription: sub,
      write,
      disconnectSignal,
      throttleIntervalMs: 250,
    })

    // The recheck must settle immediately, before ever registering a real chunk handler.
    expect(setHandlerSpy).toHaveBeenCalledExactlyOnceWith(null)
    expect(write).not.toHaveBeenCalled()
  })
})

describe('pipeUserRssFeedImportProgressToSSE', () => {
  it('does not wait when disconnect occurs immediately before the poll delay', async () => {
    const controller = new AbortController()
    const writes: string[] = []

    await pipeUserRssFeedImportProgressToSSE({
      batchId: pendingImport.import.id,
      userId: FAKE_USER_ID,
      initialImport: pendingImport,
      write: data => {
        writes.push(data)
        controller.abort()
      },
      disconnectSignal: controller.signal,
      pollIntervalMs: 60_000,
      readImport: vi.fn<() => Promise<typeof pendingImport>>(),
    })

    expect(writes).toHaveLength(1)
  })

  it('stops before polling when the disconnect signal is already aborted', async () => {
    const abortController = new AbortController()
    abortController.abort()
    const readImport = vi.fn<() => Promise<typeof pendingImport>>()

    await pipeUserRssFeedImportProgressToSSE({
      batchId: pendingImport.import.id,
      userId: FAKE_USER_ID,
      initialImport: pendingImport,
      write: () => true,
      disconnectSignal: abortController.signal,
      pollIntervalMs: 250,
      readImport,
    })

    expect(readImport).not.toHaveBeenCalled()
  })

  it('polls recursively until the import completes', async () => {
    const abortController = new AbortController()
    const chunks: string[] = []
    const doneImport = {
      import: {
        ...pendingImport.import,
        completed_rows: 1,
        pending_rows: 0,
        completed_at: new Date(),
      },
      rows: [],
    }

    await pipeUserRssFeedImportProgressToSSE({
      batchId: pendingImport.import.id,
      userId: FAKE_USER_ID,
      initialImport: pendingImport,
      write: data => {
        chunks.push(data)
        return true
      },
      disconnectSignal: abortController.signal,
      pollIntervalMs: 0,
      readImport: () => Promise.resolve(doneImport),
    })

    const body = chunks.join('')
    expect(body).toContain('event: progress')
    expect(body).toContain('event: done')
    expect(body).not.toContain('event: error')
  })
})
