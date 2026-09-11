import type {
  Response,
  ResponseErrorEvent,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses'

type ResponseOverrides = Partial<Response> & Pick<Response, 'status'>

export function makeSdkResponse(overrides: ResponseOverrides): Response {
  const response = {
    id: 'resp-test',
    created_at: 0,
    output: [],
    output_text: '',
    instructions: null,
    metadata: null,
    model: 'gpt-4.1-mini',
    object: 'response',
    parallel_tool_calls: false,
    temperature: null,
    tool_choice: 'auto',
    tools: [],
    top_p: null,
    usage: {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 2,
    },
    error: null,
    incomplete_details: null,
    ...overrides,
  } satisfies Response
  return response
}

export function makeSdkTextResponse(text: string, overrides: Partial<Response> = {}): Response {
  return makeSdkResponse({
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'msg-test',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [], logprobs: [] }],
      },
    ],
    output_text: text,
    ...overrides,
  })
}

export function makeStreamEvent(event: ResponseStreamEvent): ResponseStreamEvent {
  return event
}

export function makeErrorEvent(overrides: Partial<ResponseErrorEvent> = {}): ResponseErrorEvent {
  return {
    type: 'error',
    code: 'rate_limit',
    message: 'try later',
    param: null,
    sequence_number: 1,
    ...overrides,
  }
}

export function makeResponseStream(
  events: ResponseStreamEvent[],
): AsyncIterable<ResponseStreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event
    },
  }
}
