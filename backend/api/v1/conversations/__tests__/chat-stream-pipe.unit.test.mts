import { describe, expect, it, vi } from 'vitest'
import type { ChatTokenSubscription, TokenChunk } from '@data-stores/valkey-pubsub'
import { abortAmbiguousChatEnqueue, pipeChatTokensToSSE } from '../index-routes/shared.mts'
import { CHAT_SSE_CYCLE_EXPIRED } from '@agents/chat/stream-lifecycle'

type HandlerFn = ((chunk: TokenChunk) => void) | null

function makeFakeSubscription(): {
  subscription: ChatTokenSubscription
  trigger: (chunk: TokenChunk) => void
} {
  let storedHandler: HandlerFn = null
  const buffered: TokenChunk[] = []

  const subscription: ChatTokenSubscription = {
    setHandler(fn: HandlerFn): void {
      storedHandler = fn
      if (fn && buffered.length > 0) {
        for (const chunk of buffered.splice(0)) fn(chunk)
      }
    },
    close: vi.fn<() => void>(() => {}),
  }

  function trigger(chunk: TokenChunk): void {
    if (storedHandler) {
      storedHandler(chunk)
    } else {
      buffered.push(chunk)
    }
  }

  return { subscription, trigger }
}

function makeQueue() {
  return {
    signal: vi.fn<(jobId: string, name: string) => Promise<unknown>>(() => Promise.resolve()),
  }
}

async function collect(
  trigger: (chunk: TokenChunk) => void,
  subscription: ChatTokenSubscription,
  opts?: {
    disconnectSignal?: AbortSignal
    queueSignal?: ReturnType<typeof makeQueue>['signal']
  },
): Promise<{ chunks: string[]; queue: ReturnType<typeof makeQueue> }> {
  const chunks: string[] = []
  const queue = makeQueue()
  if (opts?.queueSignal) {
    queue.signal = opts.queueSignal
  }
  const abortController = new AbortController()
  const disconnectSignal = opts?.disconnectSignal ?? abortController.signal

  const pipePromise = pipeChatTokensToSSE({
    subscription,
    jobId: 'job-1',
    write: data => chunks.push(data),
    queue,
    disconnectSignal,
  })

  // Yield so setHandler is called before we trigger
  await Promise.resolve()
  trigger({ type: 'text', content: 'hello' })
  trigger({ type: 'done' })

  await pipePromise
  return { chunks, queue }
}

describe('pipeChatTokensToSSE', () => {
  it('text + done sequence writes SSE and resolves', async () => {
    const { subscription, trigger } = makeFakeSubscription()
    const { chunks } = await collect(trigger, subscription)

    expect(chunks.join('')).toContain('event: text')
    expect(chunks.join('')).toContain('"content":"hello"')
    expect(chunks.join('')).toContain('event: done')
  })

  it('subagent text chunk writes child stream SSE and resolves', async () => {
    const { subscription, trigger } = makeFakeSubscription()
    const chunks: string[] = []
    const queue = makeQueue()
    const abortController = new AbortController()

    const pipePromise = pipeChatTokensToSSE({
      subscription,
      jobId: 'job-subagent-text',
      write: data => chunks.push(data),
      queue,
      disconnectSignal: abortController.signal,
    })

    await Promise.resolve()
    trigger({
      type: 'subagent_text',
      agent_name: 'research',
      tool_call_id: 'call_1',
      content: 'Checking sources',
    })
    trigger({ type: 'done' })

    await pipePromise
    expect(chunks.join('')).toContain('event: subagent_text')
    expect(chunks.join('')).toContain('"agent_name":"research"')
    expect(chunks.join('')).toContain('"tool_call_id":"call_1"')
    expect(chunks.join('')).toContain('"content":"Checking sources"')
  })

  it('error chunk writes error SSE and resolves', async () => {
    const { subscription, trigger } = makeFakeSubscription()
    const chunks: string[] = []
    const queue = makeQueue()
    const abortController = new AbortController()

    const pipePromise = pipeChatTokensToSSE({
      subscription,
      jobId: 'job-2',
      write: data => chunks.push(data),
      queue,
      disconnectSignal: abortController.signal,
    })

    await Promise.resolve()
    trigger({ type: 'error', error: 'something went wrong' })

    await pipePromise
    expect(chunks.join('')).toContain('event: error')
    expect(chunks.join('')).toContain('something went wrong')
  })

  it('AbortSignal fired calls queue.signal and resolves', async () => {
    const { subscription } = makeFakeSubscription()
    const chunks: string[] = []
    const queue = makeQueue()
    const abortController = new AbortController()

    const pipePromise = pipeChatTokensToSSE({
      subscription,
      jobId: 'job-3',
      write: data => chunks.push(data),
      queue,
      disconnectSignal: abortController.signal,
    })

    // Abort before any chunks arrive
    abortController.abort()

    await pipePromise
    expect(queue.signal).toHaveBeenCalledWith('job-3', 'abort')
  })

  it('signals cycle expiry separately from an ordinary disconnect', async () => {
    const { subscription } = makeFakeSubscription()
    const queue = makeQueue()
    const abortController = new AbortController()
    const pipePromise = pipeChatTokensToSSE({
      subscription,
      jobId: 'job-cycle-expired',
      write: () => {},
      queue,
      disconnectSignal: abortController.signal,
    })

    abortController.abort(CHAT_SSE_CYCLE_EXPIRED)
    await pipePromise

    expect(queue.signal).toHaveBeenCalledWith('job-cycle-expired', CHAT_SSE_CYCLE_EXPIRED)
  })

  it('messages arriving before setHandler (buffered) are processed after setHandler', async () => {
    let storedHandler: HandlerFn = null
    const preBuffered: TokenChunk[] = []

    // Subscription that does NOT call setHandler until explicitly told
    const subscription: ChatTokenSubscription = {
      setHandler(fn: HandlerFn): void {
        storedHandler = fn
        if (fn) {
          for (const chunk of preBuffered.splice(0)) fn(chunk)
        }
      },
      close: vi.fn<() => void>(() => {}),
    }

    // Pre-buffer messages before pipe is called
    preBuffered.push({ type: 'text', content: 'buffered' })
    preBuffered.push({ type: 'done' })

    const chunks: string[] = []
    const queue = makeQueue()
    const abortController = new AbortController()

    await pipeChatTokensToSSE({
      subscription,
      jobId: 'job-5',
      write: data => chunks.push(data),
      queue,
      disconnectSignal: abortController.signal,
    })

    expect(chunks.join('')).toContain('"content":"buffered"')
    expect(chunks.join('')).toContain('event: done')
    // storedHandler is accessible but we just verify the output
    expect(storedHandler).toBeNull() // set to null on settle
  })

  it('chunks arriving after done event are ignored (settled guard)', async () => {
    const { subscription, trigger } = makeFakeSubscription()
    const chunks: string[] = []
    const queue = makeQueue()
    const abortController = new AbortController()

    const pipePromise = pipeChatTokensToSSE({
      subscription,
      jobId: 'job-6',
      write: data => chunks.push(data),
      queue,
      disconnectSignal: abortController.signal,
    })

    await Promise.resolve()
    trigger({ type: 'done' })

    await pipePromise

    // Now try to trigger more — should be ignored since settled
    trigger({ type: 'text', content: 'late chunk' })
    // No additional writes
    expect(chunks.join('')).not.toContain('late chunk')
  })

  it('resolves immediately and calls queue.signal when disconnectSignal is already aborted', async () => {
    const { subscription } = makeFakeSubscription()
    const queue = makeQueue()
    const abortController = new AbortController()
    abortController.abort()

    await pipeChatTokensToSSE({
      subscription,
      jobId: 'job-pre-abort',
      write: () => {},
      queue,
      disconnectSignal: abortController.signal,
    })

    expect(queue.signal).toHaveBeenCalledWith('job-pre-abort', 'abort')
  })
})

describe('abortAmbiguousChatEnqueue', () => {
  it('signals the stable job ID without propagating signal failure', async () => {
    const queue = makeQueue()
    queue.signal.mockRejectedValueOnce(new Error('queue unavailable'))
    const onSignalError = vi.fn<(error: Error) => void>()

    await expect(
      abortAmbiguousChatEnqueue(queue, 'chat_assistant-1', onSignalError),
    ).resolves.toBeUndefined()

    expect(queue.signal).toHaveBeenCalledWith('chat_assistant-1', CHAT_SSE_CYCLE_EXPIRED)
    expect(onSignalError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'queue unavailable' }),
    )
  })
})
