import { describe, expect, it, vi } from 'vitest'

import {
  ChatStreamIncompleteError,
  readChatStreamResponse,
  type ChatStreamHandlers,
} from './chat-stream-reader'

function makeHandlers(isCurrentRequest: () => boolean): ChatStreamHandlers {
  return {
    isCurrentRequest,
    setError: vi.fn<ChatStreamHandlers['setError']>(),
    setMetadata: vi.fn<ChatStreamHandlers['setMetadata']>(),
    appendContent: vi.fn<ChatStreamHandlers['appendContent']>(),
    appendToolCall: vi.fn<ChatStreamHandlers['appendToolCall']>(),
    appendSubagentStep: vi.fn<ChatStreamHandlers['appendSubagentStep']>(),
    appendSubagentText: vi.fn<ChatStreamHandlers['appendSubagentText']>(),
  }
}

describe('readChatStreamResponse', () => {
  it('throws a typed incomplete-stream error when EOF arrives before done or error', async () => {
    const response = new Response('event: text\ndata: {"content":"partial"}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    })
    await expect(
      readChatStreamResponse(
        response,
        makeHandlers(() => true),
      ),
    ).rejects.toBeInstanceOf(ChatStreamIncompleteError)
  })

  it('accepts a named error event as terminal completion', async () => {
    const handlers = makeHandlers(() => true)
    const response = new Response('event: error\ndata: {"error":"failed"}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    })
    await expect(readChatStreamResponse(response, handlers)).resolves.toBeUndefined()
    expect(handlers.setError).toHaveBeenCalledWith('failed')
  })

  it('does not buffer an oversized HTTP error body', async () => {
    let cancelled = false
    const handlers = makeHandlers(() => true)
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(64 * 1024 + 1))
        },
        cancel() {
          cancelled = true
        },
      }),
      { status: 500, statusText: 'Internal Server Error' },
    )

    await readChatStreamResponse(response, handlers)

    expect(cancelled).toBe(true)
    expect(handlers.setError).toHaveBeenCalledWith('Request failed: Internal Server Error')
  })

  it('cancels the upstream reader after a terminal event', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'))
      },
      cancel() {
        cancelled = true
      },
    })
    const response = new Response(body, { headers: { 'content-type': 'text/event-stream' } })

    await expect(
      readChatStreamResponse(
        response,
        makeHandlers(() => true),
      ),
    ).resolves.toBeUndefined()

    expect(cancelled).toBe(true)
  })

  it('cancels a stale reader before returning without dispatching its chunk', async () => {
    let current = true
    let cancelStarted = false
    let resolveCancel!: () => void
    const cancelFinished = new Promise<void>(resolve => {
      resolveCancel = resolve
    })
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        current = false
        controller.enqueue(new TextEncoder().encode('event: text\ndata: {"content":"stale"}\n\n'))
      },
      cancel() {
        cancelStarted = true
        return cancelFinished
      },
    })
    const handlers = makeHandlers(() => current)
    const response = new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
    })

    let readCompleted = false
    const reading = readChatStreamResponse(response, handlers).then(() => {
      readCompleted = true
      return undefined
    })

    await vi.waitFor(() => expect(cancelStarted).toBe(true))
    expect(readCompleted).toBe(false)
    expect(handlers.appendContent).not.toHaveBeenCalled()

    resolveCancel()
    await reading

    expect(readCompleted).toBe(true)
    expect(handlers.appendContent).not.toHaveBeenCalled()
  })
})
