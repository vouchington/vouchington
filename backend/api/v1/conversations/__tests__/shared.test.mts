import { CHAT_SSE_CYCLE_EXPIRED } from '@agents/chat/stream-lifecycle'
import type { ChatTokenSubscription, TokenChunk } from '@data-stores/valkey-pubsub'
import { describe, expect, it, vi } from 'vitest'
import {
  CHAT_ENQUEUE_FAILED_ERROR,
  persistAndReportFailedChatEnqueue,
  pipeChatTokensToSSE,
} from '../index-routes/shared.mts'

describe('shared chat streaming', () => {
  it('signals expiry when it is visible on the post-listener recheck', async () => {
    let abortedReads = 0
    const disconnectSignal = {
      get aborted() {
        abortedReads += 1
        return abortedReads > 1
      },
      reason: CHAT_SSE_CYCLE_EXPIRED,
      addEventListener: vi.fn<VitestLooseMock>(),
      removeEventListener: vi.fn<VitestLooseMock>(),
    } as unknown as AbortSignal
    const subscription = { setHandler: vi.fn<VitestLooseMock>(), close: vi.fn<VitestLooseMock>() }
    const queue = { signal: vi.fn<VitestLooseMock>().mockResolvedValue(undefined) }

    await pipeChatTokensToSSE({
      subscription,
      jobId: 'job-post-listener-expiry',
      write: vi.fn<(data: string) => void>(),
      queue,
      disconnectSignal,
    })

    expect(queue.signal).toHaveBeenCalledWith('job-post-listener-expiry', CHAT_SSE_CYCLE_EXPIRED)
    expect(subscription.setHandler).toHaveBeenLastCalledWith(null)
  })

  it('signals an abort that occurs synchronously during buffered replay', async () => {
    const controller = new AbortController()
    let handler: ((chunk: TokenChunk) => void) | null = null
    const subscription: ChatTokenSubscription = {
      setHandler(nextHandler): void {
        handler = nextHandler
        if (!nextHandler) return
        nextHandler({ type: 'text', content: 'buffered' })
        controller.abort(CHAT_SSE_CYCLE_EXPIRED)
      },
      close: vi.fn<() => void>(() => {}),
    }
    const queue = {
      signal: vi.fn<(jobId: string, name: string) => Promise<unknown>>(() => Promise.resolve()),
    }
    const chunks: string[] = []

    await pipeChatTokensToSSE({
      subscription,
      jobId: 'job-replay-abort',
      write: data => chunks.push(data),
      queue,
      disconnectSignal: controller.signal,
    })

    expect(chunks.join('')).toContain('buffered')
    expect(queue.signal).toHaveBeenCalledWith('job-replay-abort', CHAT_SSE_CYCLE_EXPIRED)
    expect(handler).toBeNull()
  })

  it('persists and streams a retryable terminal error after enqueue failure', async () => {
    const queue = {
      signal: vi.fn<(jobId: string, name: string) => Promise<unknown>>(() =>
        Promise.reject(new Error('queue unavailable')),
      ),
    }
    const persistFailure = vi.fn<(error: string) => Promise<boolean>>(() => Promise.resolve(true))
    const chunks: string[] = []
    const onSignalError = vi.fn<(error: Error) => void>()

    await expect(
      persistAndReportFailedChatEnqueue({
        queue,
        jobId: 'job-enqueue-failed',
        persistFailure,
        write: data => chunks.push(data),
        disconnectSignal: new AbortController().signal,
        onSignalError,
      }),
    ).resolves.toBe(true)

    expect(queue.signal).toHaveBeenCalledWith('job-enqueue-failed', CHAT_SSE_CYCLE_EXPIRED)
    expect(onSignalError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'queue unavailable' }),
    )
    expect(persistFailure).toHaveBeenCalledWith(CHAT_ENQUEUE_FAILED_ERROR)
    expect(chunks).toEqual([
      `event: error\ndata: ${JSON.stringify({ error: CHAT_ENQUEUE_FAILED_ERROR })}\n\n`,
    ])
  })

  it('does not stream a retry error when the worker already terminalized', async () => {
    const chunks: string[] = []

    await expect(
      persistAndReportFailedChatEnqueue({
        queue: { signal: vi.fn<VitestLooseMock>().mockResolvedValue(undefined) },
        jobId: 'job-worker-won',
        persistFailure: vi.fn<VitestLooseMock>().mockResolvedValue(false),
        write: data => chunks.push(data),
        disconnectSignal: new AbortController().signal,
      }),
    ).resolves.toBe(false)

    expect(chunks).toEqual([])
  })
})
