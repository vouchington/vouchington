import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStream } from '../use-chat-stream'

const sendConversationChatStreamMock = vi.hoisted(() =>
  vi.fn<(conversationId: string, message: string, signal: AbortSignal) => Promise<Response>>(),
)

vi.mock(import('@/lib/api/client/conversation-stream'), () => ({
  sendConversationChatStream: sendConversationChatStreamMock,
}))

function createStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

describe('useChatStream explicit cancellation', () => {
  beforeEach(() => {
    sendConversationChatStreamMock.mockReset()
  })

  it('keeps partial text without an error when explicit cancellation closes the stream', async () => {
    sendConversationChatStreamMock.mockImplementation((_conversationId, _message, signal) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode('event: text\ndata: {"content":"partial"}\n\n'),
              )
              signal.addEventListener('abort', () => controller.close(), { once: true })
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      ),
    )
    const { result } = renderHook(() => useChatStream())
    let sendTask!: Promise<void>
    act(() => {
      sendTask = result.current.sendMessage('conversation-1', 'hello')
    })
    await waitFor(() => expect(result.current.streamedContent).toBe('partial'))
    await act(async () => {
      result.current.abort()
      await sendTask
    })
    expect(result.current.error).toBeNull()
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.streamedContent).toBe('partial')
  })

  it('does not apply a buffered error event after explicit cancellation', async () => {
    const response = Promise.withResolvers<Response>()
    sendConversationChatStreamMock.mockReturnValue(response.promise)
    const { result } = renderHook(() => useChatStream())
    let sendTask!: Promise<void>
    act(() => {
      sendTask = result.current.sendMessage('conversation-1', 'hello')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(true))
    await act(async () => {
      result.current.abort()
      response.resolve(createStreamResponse(['event: error\ndata: {"error":"late failure"}\n\n']))
      await sendTask
    })
    expect(result.current.error).toBeNull()
    expect(result.current.isStreaming).toBe(false)
  })

  it('does not apply a non-OK response that finishes after explicit cancellation', async () => {
    const bodyRead = Promise.withResolvers<void>()
    let streamController!: ReadableStreamDefaultController<Uint8Array>
    const response = new Response(
      new ReadableStream(
        {
          start(controller) {
            streamController = controller
          },
          pull() {
            bodyRead.resolve()
          },
        },
        { highWaterMark: 0 },
      ),
      { status: 500, statusText: 'Service Unavailable' },
    )
    sendConversationChatStreamMock.mockResolvedValue(response)
    const { result } = renderHook(() => useChatStream())
    let sendTask!: Promise<void>
    act(() => {
      sendTask = result.current.sendMessage('conversation-1', 'hello')
    })
    await bodyRead.promise
    await act(async () => {
      result.current.abort()
      streamController.enqueue(new TextEncoder().encode('{"message":"late failure"}'))
      streamController.close()
      await sendTask
    })
    expect(result.current.error).toBeNull()
    expect(result.current.isStreaming).toBe(false)
  })
})
