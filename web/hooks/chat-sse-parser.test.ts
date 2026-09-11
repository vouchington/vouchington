import { describe, expect, it } from 'vitest'
import {
  ChatSseFrameTooLargeError,
  createChatSseParser,
  MAX_CHAT_SSE_FRAME_CHARS,
} from './chat-sse-parser'

describe('createChatSseParser', () => {
  it('dispatches a complete event when a blank line is received', () => {
    const events: Array<{ eventType: string; rawData: string }> = []
    const parser = createChatSseParser((eventType, rawData) => {
      events.push({ eventType, rawData })
    })

    parser.processChunk('event: text\ndata: {"content": "hi"}\n\n')

    expect(events).toEqual([{ eventType: 'text', rawData: '{"content": "hi"}' }])
  })

  it('dispatches a non-default event without data when the stream is flushed', () => {
    const events: Array<{ eventType: string; rawData: string }> = []
    const parser = createChatSseParser((eventType, rawData) => {
      events.push({ eventType, rawData })
    })

    parser.processChunk('event: done')
    parser.flush()

    expect(events).toEqual([{ eventType: 'done', rawData: '' }])
  })

  it('rejects an unterminated frame before retaining more than its limit', () => {
    const parser = createChatSseParser(() => {})

    expect(() => parser.processChunk('x'.repeat(MAX_CHAT_SSE_FRAME_CHARS + 1))).toThrow(
      ChatSseFrameTooLargeError,
    )
  })

  it('accepts many complete frames delivered in one chunk', () => {
    let eventCount = 0
    const parser = createChatSseParser(() => {
      eventCount += 1
    })

    parser.processChunk('data: one\n\ndata: two\n\n'.repeat(100_000))

    expect(eventCount).toBe(200_000)
  })
})
