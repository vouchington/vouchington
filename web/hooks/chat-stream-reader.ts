'use client'

import type { ChatSSEEventToolCall, ChatSSESubagentStep, ChatSSESubagentText } from '@/types/chat'
import { applyChatStreamEvent } from './chat-stream-events'
import { createChatSseParser } from './chat-sse-parser'
import { parseErrorResponseBody } from '@/lib/api/error-helpers'

export interface ChatStreamHandlers {
  isCurrentRequest: () => boolean
  setError: (message: string) => void
  setMetadata: (metadata: { conversationId?: string; messageId?: string }) => void
  appendContent: (content: string) => void
  appendToolCall: (toolCall: ChatSSEEventToolCall) => void
  appendSubagentStep: (step: ChatSSESubagentStep) => void
  appendSubagentText: (chunk: ChatSSESubagentText) => void
}

export class ChatStreamIncompleteError extends Error {
  constructor() {
    super('Chat stream ended before a terminal event')
    this.name = 'ChatStreamIncompleteError'
  }
}

export async function readChatStreamResponse(
  response: Response,
  handlers: ChatStreamHandlers,
): Promise<void> {
  if (!handlers.isCurrentRequest()) return
  if (!(await validateStreamResponse(response, handlers))) return
  await readEventStream(response.body, handlers)
}

async function validateStreamResponse(
  response: Response,
  handlers: ChatStreamHandlers,
): Promise<boolean> {
  if (!response.ok) {
    const body = await parseErrorResponseBody(response)
    if (handlers.isCurrentRequest()) handlers.setError(parseErrorMessage(body, response.statusText))
    return false
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.includes('text/event-stream')) {
    handlers.setError('Unexpected response format')
    return false
  }
  if (!response.body) {
    handlers.setError('No response body')
    return false
  }
  return true
}

function parseErrorMessage(body: unknown, statusText: string): string {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message
  }
  return `Request failed: ${statusText}`
}

async function readEventStream(
  body: ReadableStream<Uint8Array> | null,
  handlers: ChatStreamHandlers,
): Promise<void> {
  if (!body) return
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let receivedTerminalEvent = false
  const parser = createChatSseParser((eventType, rawData) => {
    if (dispatchChatStreamEvent(eventType, rawData, handlers)) receivedTerminalEvent = true
  })

  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- each read advances the same SSE reader and parser while applying stream backpressure
      const readResult = await reader.read()
      if (readResult.done) break
      if (!handlers.isCurrentRequest()) {
        // oxlint-disable-next-line no-await-in-loop -- finish canceling the stale reader before its request lifecycle exits
        await reader.cancel()
        return
      }

      parser.processChunk(decoder.decode(readResult.value, { stream: true }))
      if (receivedTerminalEvent) {
        // oxlint-disable-next-line no-await-in-loop -- terminal events must cancel this reader before the request lifecycle exits
        await reader.cancel()
        return
      }
    }

    if (handlers.isCurrentRequest()) {
      parser.processChunk(decoder.decode())
      parser.flush()
      if (!receivedTerminalEvent) throw new ChatStreamIncompleteError()
    }
  } catch (error) {
    await reader.cancel(error)
    throw error
  } finally {
    reader.releaseLock()
  }
}

function dispatchChatStreamEvent(
  eventType: string,
  rawData: string,
  handlers: ChatStreamHandlers,
): boolean {
  if (!handlers.isCurrentRequest()) return false
  if (eventType === 'done') return true
  if (!rawData) return false

  const data = parseEventData(rawData)
  if (!data || !handlers.isCurrentRequest()) return false
  return applyChatStreamEvent(eventType, data, handlers)
}

function parseEventData(rawData: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawData)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
