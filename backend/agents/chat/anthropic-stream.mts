import { getLongRunningExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { fetch as undiciFetch } from 'undici'
import type { ChatStreamEvent } from './stream-types.mts'
import type { ChatHistoryMessage } from './build-input.mts'

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_API_VERSION = '2023-06-01'
const ANTHROPIC_MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 2048

function readApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  return apiKey
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function parseAnthropicEvent(data: string): ChatStreamEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  const event = getRecord(parsed)
  if (!event) return null

  if (event.type === 'error') {
    const error = getRecord(event.error)
    const message = typeof error?.message === 'string' ? error.message : 'Anthropic stream error'
    throw new Error(message)
  }
  if (event.type !== 'content_block_delta') return null

  const delta = getRecord(event.delta)
  if (delta?.type !== 'text_delta' || typeof delta.text !== 'string') return null
  return { type: 'text', content: delta.text }
}

function findSseEventBoundary(buffer: string): { index: number; length: number } | null {
  const lfIndex = buffer.indexOf('\n\n')
  const crlfIndex = buffer.indexOf('\r\n\r\n')
  if (lfIndex === -1 && crlfIndex === -1) return null
  if (lfIndex === -1) return { index: crlfIndex, length: 4 }
  if (crlfIndex === -1) return { index: lfIndex, length: 2 }
  return lfIndex < crlfIndex ? { index: lfIndex, length: 2 } : { index: crlfIndex, length: 4 }
}

function getSseDataLines(rawEvent: string): string[] {
  return rawEvent
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trimStart())
}

async function* streamSseEvents(response: Response): AsyncGenerator<string> {
  const body = response.body
  if (!body) throw new Error('Anthropic stream response body was empty')

  const reader = body.getReader()
  try {
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary = findSseEventBoundary(buffer)
      while (boundary) {
        const rawEvent = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary.length)
        const dataLines = getSseDataLines(rawEvent)
        if (dataLines.length > 0) yield dataLines.join('\n')
        boundary = findSseEventBoundary(buffer)
      }
    }

    buffer += decoder.decode()
    const trailingData = getSseDataLines(buffer)
    if (trailingData.length > 0) yield trailingData.join('\n')
  } finally {
    reader.releaseLock()
  }
}

/* no-mistakes: integration=anthropic */
export async function* streamAnthropicChat(params: {
  systemPrompt: string
  input: ChatHistoryMessage[]
  signal?: AbortSignal
  fetch?: typeof undiciFetch
}): AsyncGenerator<ChatStreamEvent> {
  const requestFetch = params.fetch ?? undiciFetch
  const response = await requestFetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    dispatcher: getLongRunningExternalRequestDispatcher(),
    headers: {
      'content-type': 'application/json',
      'x-api-key': readApiKey(),
      'anthropic-version': ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'disabled' },
      stream: true,
      system: params.systemPrompt,
      messages: getAnthropicMessages(params.input),
    }),
    signal: params.signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Anthropic request failed with ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`,
    )
  }

  for await (const data of streamSseEvents(response)) {
    const event = parseAnthropicEvent(data)
    if (event) yield event
  }
}

function getAnthropicMessages(input: ChatHistoryMessage[]): ChatHistoryMessage[] {
  const messages = [...input]
  while (messages[0]?.role === 'assistant') messages.shift()
  return messages
}
