import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStream } from './use-chat-stream'

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
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

describe('useChatStream', () => {
  beforeEach(() => {
    sendConversationChatStreamMock.mockReset()
  })

  it('parses SSE frames after blank-line dispatch with multiline data and default message events', async () => {
    sendConversationChatStreamMock.mockResolvedValue(
      createStreamResponse([
        [
          'event: metadata',
          'data: {"conversation_id": "conversation-1", "assistant_message_id": "assistant-1"}',
          '',
          'event: text',
          'data: {',
          'data: "content": "Hello"',
          'data: }',
          '',
          'data: {"content": " world"}',
          '',
          'event: text',
          'data: {"content": null}',
          '',
          'event: text',
          'data: null',
          '',
          'event: tool_call',
          `data: ${JSON.stringify({
            tool_call_id: 'tool_1',
            name: 'search',
            arguments: JSON.stringify({ q: 'test' }),
          })}`,
          '',
          'event: subagent_step',
          'data: {"agent_name": "research", "tool_name": "search_web", "tool_call_id": "call_1"}',
          '',
          'event: subagent_text',
          'data: {"agent_name": "research", "tool_call_id": "call_1", "content": "Checking sources"}',
          '',
          'event: done',
          'data: {}',
          '',
          '',
        ].join('\n'),
      ]),
    )

    const { result } = renderHook(() => useChatStream())

    await act(async () => {
      await result.current.sendMessage('conversation-1', 'hello')
    })

    expect(result.current.metadata).toEqual({
      conversationId: 'conversation-1',
      messageId: 'assistant-1',
    })
    expect(result.current.streamedContent).toBe('Hello world')
    expect(result.current.toolCalls).toEqual([
      { tool_call_id: 'tool_1', name: 'search', arguments: '{"q":"test"}' },
    ])
    expect(result.current.subagentSteps).toEqual([
      { agent_name: 'research', tool_name: 'search_web', tool_call_id: 'call_1' },
    ])
    expect(result.current.subagentTextChunks).toEqual([
      { agent_name: 'research', tool_call_id: 'call_1', content: 'Checking sources' },
    ])
    expect(result.current.isStreaming).toBe(false)
  })

  it('uses Unknown error for error events without a string message', async () => {
    sendConversationChatStreamMock.mockResolvedValue(
      createStreamResponse([
        ['event: error', 'data: {"error": null}', '', 'event: done', 'data: {}', '', ''].join('\n'),
      ]),
    )

    const { result } = renderHook(() => useChatStream())

    await act(async () => {
      await result.current.sendMessage('conversation-1', 'hello')
    })

    expect(result.current.error).toBe('Unknown error')
    expect(result.current.isStreaming).toBe(false)
  })

  it('aborts the active request when the hook unmounts', async () => {
    let capturedSignal!: AbortSignal
    sendConversationChatStreamMock.mockImplementation((_conversationId, _message, signal) => {
      capturedSignal = signal
      return new Promise<Response>(() => {})
    })

    const { result, unmount } = renderHook(() => useChatStream())

    act(() => {
      void result.current.sendMessage('conversation-1', 'hello')
    })

    await waitFor(() => expect(capturedSignal).toBeDefined())

    unmount()

    expect(capturedSignal.aborted).toBe(true)
  })

  it('surfaces an AbortError when this request was not cancelled', async () => {
    sendConversationChatStreamMock.mockRejectedValue(
      Object.assign(new Error('transport aborted unexpectedly'), { name: 'AbortError' }),
    )

    const { result } = renderHook(() => useChatStream())

    await act(async () => {
      await result.current.sendMessage('conversation-1', 'hello')
    })

    expect(result.current.error).toBe('transport aborted unexpectedly')
    expect(result.current.isStreaming).toBe(false)
  })

  it('reports an interrupted response when the server closes before a terminal event', async () => {
    sendConversationChatStreamMock.mockResolvedValue(
      createStreamResponse([
        [
          'event: metadata',
          'data: {"conversation_id":"conversation-1","assistant_message_id":"assistant-1"}',
          '',
          'event: text',
          'data: {"content":"partial"}',
          '',
        ].join('\n'),
      ]),
    )

    const { result } = renderHook(() => useChatStream())

    await act(async () => {
      await result.current.sendMessage('conversation-1', 'hello')
    })

    expect(result.current.metadata.messageId).toBe('assistant-1')
    expect(result.current.error).toBe('The response was interrupted. Please try again.')
    expect([result.current.streamedContent, result.current.isStreaming]).toEqual(['partial', false])
  })

  it('keeps newer request state when an older request settles after it was superseded', async () => {
    let rejectFirst!: (error: unknown) => void
    let resolveSecond!: (response: Response) => void
    sendConversationChatStreamMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectFirst = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>(resolve => {
            resolveSecond = resolve
          }),
      )

    const { result } = renderHook(() => useChatStream())
    let firstTask!: Promise<void>
    let secondTask!: Promise<void>

    act(() => {
      firstTask = result.current.sendMessage('conversation-1', 'first')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(true))

    act(() => {
      secondTask = result.current.sendMessage('conversation-1', 'second')
    })

    await act(async () => {
      rejectFirst(new DOMException('Aborted', 'AbortError'))
      await firstTask
    })

    expect(result.current.isStreaming).toBe(true)

    await act(async () => {
      resolveSecond(createStreamResponse([['event: done', 'data: {}', '', ''].join('\n')]))
      await secondTask
    })

    expect(result.current.isStreaming).toBe(false)
  })

  it('sets error when response content-type is not text/event-stream', async () => {
    sendConversationChatStreamMock.mockResolvedValue(
      new Response('{"error":"Internal Server Error"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const { result } = renderHook(() => useChatStream())

    await act(async () => {
      await result.current.sendMessage('conversation-1', 'hello')
    })

    expect(result.current.error).toBe('Unexpected response format')
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.streamedContent).toBe('')
  })
})
