import { beforeEach, describe, expect, it, vi } from 'vitest'

const { enqueueBulkClassifierRunDispatchers, onError } = vi.hoisted(() => ({
  enqueueBulkClassifierRunDispatchers: vi.fn<(jobs: readonly unknown[]) => Promise<void>>(),
  onError: vi.fn<(error: Error) => void>(),
}))

vi.mock<typeof import('@queues/ai-agents/enqueues/classifier-run')>(
  import('@queues/ai-agents/enqueues/classifier-run'),
  () => ({
    enqueueBulkClassifierRunDispatchers,
  }),
)
vi.mock<typeof import('@modules/on-error')>(import('@modules/on-error'), () => ({
  default: onError,
}))

import { dispatchStoryClusteringForEmbeddedItems } from './dispatch.mts'

describe('dispatchStoryClusteringForEmbeddedItems failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports an enqueue failure instead of failing the embedding job that already stored its vector', async () => {
    enqueueBulkClassifierRunDispatchers.mockRejectedValueOnce(new Error('queue unavailable'))

    await expect(dispatchStoryClusteringForEmbeddedItems(['item-1'])).resolves.toBeUndefined()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]![0]).toMatchObject({ message: 'queue unavailable' })
  })

  it('wraps a non-error rejection so the report is always an Error', async () => {
    enqueueBulkClassifierRunDispatchers.mockRejectedValueOnce('boom')

    await dispatchStoryClusteringForEmbeddedItems(['item-1'])

    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error)
    expect(onError.mock.calls[0]![0].message).toBe('boom')
  })

  it('never touches the queue for an empty list', async () => {
    await dispatchStoryClusteringForEmbeddedItems([])

    expect(enqueueBulkClassifierRunDispatchers).not.toHaveBeenCalled()
  })
})
