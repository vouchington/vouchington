import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers'

vi.mock<typeof import('@jongleberry/vurst-prompt')>(import('@jongleberry/vurst-prompt'), () => ({
  sanitizePromptInjection: vi.fn<VitestLooseMock>((text: string) => Promise.resolve(text)),
  wrapExternalContent: vi.fn<VitestLooseMock>(
    (text: string, options: { source: string; contentType?: string }) =>
      `<external-content source="${options.source}" contentType="${options.contentType}">\n${text}\n</external-content>`,
  ),
}))

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenAIResponse: vi.fn<VitestLooseMock>(),
    streamOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

import { streamResearchResponse } from './respond.mts'
import { streamOpenAIResponse, type OpenAIResponse } from '@modules/openai-utils/create-response'

function makeTextResponse(id: string, text: string): OpenAIResponse {
  return {
    id,
    status: 'completed',
    output: [
      {
        id: `${id}-message`,
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    output_text: text,
  }
}

function makeNoTextStream(response: OpenAIResponse) {
  return async function* (): AsyncGenerator<{ delta: string }, OpenAIResponse> {
    yield* []
    return response
  }
}

describe('streamResearchResponse', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns content and terminationReason from the OpenAI response', async () => {
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(
      makeNoTextStream(makeTextResponse('resp_1', 'Research complete.')),
    )

    const result = await streamResearchResponse({
      currentUser: user,
      task: 'What is the best travel card?',
      agentResponseId: 'test-agent-response-id-1',
    })

    expect(result.content).toBe('Research complete.')
    expect(result.terminationReason).toBe('no_tool_calls')
  })

  it('returns generic fallback when OpenAI response has no extractable text', async () => {
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(
      makeNoTextStream({ id: 'resp_2', status: 'completed', output: [], output_text: '' }),
    )

    const result = await streamResearchResponse({
      currentUser: user,
      task: 'Empty response test',
      agentResponseId: 'test-agent-response-id-2',
    })

    expect(result.content).toContain('could not generate')
    expect(result.terminationReason).toBe('no_tool_calls')
  })

  it('includes sanitized context in input when context is provided', async () => {
    let capturedInput: unknown

    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (params) {
      capturedInput = (params as Record<string, unknown>).input
      yield* []
      return makeTextResponse('resp_3', 'Done.')
    })

    await streamResearchResponse({
      currentUser: user,
      task: 'Context test task',
      context: 'User has Amex Platinum',
      agentResponseId: 'test-agent-response-id-3',
    })

    expect(capturedInput).toContain('Context test task')
    expect(capturedInput).toContain('User has Amex Platinum')
  })

  it('does not include context section when no context is provided', async () => {
    let capturedInput: unknown

    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (params) {
      capturedInput = (params as Record<string, unknown>).input
      yield* []
      return makeTextResponse('resp_4', 'No context result.')
    })

    await streamResearchResponse({
      currentUser: user,
      task: 'No context task',
      agentResponseId: 'test-agent-response-id-4',
    })

    expect(capturedInput).not.toContain('Conversation context')
  })

  it('passes abort signal to the OpenAI API call', async () => {
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(
      makeNoTextStream(makeTextResponse('resp_5', 'Signal test.')),
    )

    const controller = new AbortController()
    await streamResearchResponse({
      currentUser: user,
      task: 'Signal propagation test',
      agentResponseId: 'test-agent-response-id-5',
      signal: controller.signal,
    })

    expect(vi.mocked(streamOpenAIResponse)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('coalesces text deltas through the markdown buffer and publishes tail on flush', async () => {
    // Delta contains an unclosed '[' — buffer emits "Hello " immediately (L83-84)
    // and holds "[world" in pending until flush (L100)
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* () {
      yield { delta: 'Hello [world' }
      return makeTextResponse('resp_buffer', 'Hello [world')
    })

    const result = await streamResearchResponse({
      currentUser: user,
      task: 'Buffer coalescing test',
      agentResponseId: 'test-agent-response-id-buffer',
    })

    expect(result.content).toBe('Hello [world')
    expect(result.terminationReason).toBe('no_tool_calls')
  })

  it('publishes buffered markdown content as a flush event before the tool_call event', async () => {
    // Yield text with an unclosed '[' so the buffer holds pending content, then return a tool call
    const toolCallResponse: OpenAIResponse = {
      id: 'resp_tool_flush',
      status: 'completed',
      output: [
        {
          type: 'function_call',
          call_id: 'call_flush',
          name: '__nonexistent_tool__',
          arguments: '{}',
        },
      ],
      output_text: '',
    }
    vi.mocked(streamOpenAIResponse)
      .mockImplementationOnce(async function* () {
        yield { delta: 'Searching [' }
        return toolCallResponse
      })
      .mockImplementationOnce(makeNoTextStream(makeTextResponse('resp_final_flush', 'Flush done.')))

    const result = await streamResearchResponse({
      currentUser: user,
      task: 'Buffer flush before tool_call test',
      agentResponseId: 'test-agent-response-id-flush',
    })

    // fullContent accumulated the delta; result.text is only the final turn's text
    expect(result.content).toBe('Searching [')
    expect(result.terminationReason).toBe('no_tool_calls')
    expect(vi.mocked(streamOpenAIResponse)).toHaveBeenCalledTimes(2)
  })

  it('publishes tool_call progress event when model emits a tool call', async () => {
    // First response: contains a function_call (unknown tool — dispatched as error result)
    // Second response: final text answer
    const toolCallResponse: OpenAIResponse = {
      id: 'resp_tool',
      status: 'completed',
      output: [
        {
          type: 'function_call',
          call_id: 'call_abc',
          name: '__nonexistent_tool__',
          arguments: '{}',
        },
      ],
      output_text: '',
    }
    vi.mocked(streamOpenAIResponse)
      .mockImplementationOnce(makeNoTextStream(toolCallResponse))
      .mockImplementationOnce(
        makeNoTextStream(makeTextResponse('resp_final', 'Tool research done.')),
      )

    const result = await streamResearchResponse({
      currentUser: user,
      task: 'Tool call test',
      agentResponseId: 'test-agent-response-id-tool',
    })

    expect(result.content).toBe('Tool research done.')
    // streamOpenAIResponse called twice: once with tool calls, once with results
    expect(vi.mocked(streamOpenAIResponse)).toHaveBeenCalledTimes(2)
  })
})
