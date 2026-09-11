import type { OpenAIResponse } from '../create-response.mts'
import type { RunToolLoopStreamEvent } from '../run-tool-loop-streaming.mts'
import type { OpenAIFunctionCall, OpenAIFunctionCallOutput } from '@services/openai-agents'

export const makeTextResponse = (text: string, id = 'resp-1'): OpenAIResponse => ({
  id,
  status: 'completed',
  output: [
    {
      id: `${id}-message`,
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [], logprobs: [] }],
    },
  ],
  output_text: text,
})

export const makeToolCallResponse = (id = 'resp-tool'): OpenAIResponse => ({
  id,
  status: 'completed',
  output: [
    {
      type: 'function_call',
      call_id: 'call-1',
      name: 'search_posts',
      arguments: '{}',
      status: 'completed',
    },
  ],
  output_text: '',
})

export const makeToolCall = (): OpenAIFunctionCall => ({
  type: 'function_call',
  call_id: 'call-1',
  name: 'search_posts',
  arguments: '{}',
})

export const makeToolResult = (callId = 'call-1'): OpenAIFunctionCallOutput => ({
  type: 'function_call_output',
  call_id: callId,
  output: '{"results":[]}',
})

export function makeTextStream(delta: string, response: OpenAIResponse) {
  return async function* () {
    yield { delta }
    return response
  }
}

export function makeNoTextStream(response: OpenAIResponse) {
  return async function* (): AsyncGenerator<{ delta: string }, OpenAIResponse> {
    yield* []
    return response
  }
}

export function makeThrowingStream(error: Error) {
  return async function* (): AsyncGenerator<{ delta: string }, never> {
    yield* []
    throw error
  }
}

export async function drainRunToolLoopStream<T = unknown>(
  gen: AsyncGenerator<RunToolLoopStreamEvent, T>,
): Promise<{ events: RunToolLoopStreamEvent[]; returnValue: T }> {
  const events: RunToolLoopStreamEvent[] = []
  let step = await gen.next()
  while (!step.done) {
    events.push(step.value)
    step = await gen.next()
  }
  return { events, returnValue: step.value }
}
