import { describe, expect, it, vi } from 'vitest'
import type { Response, ResponseStreamEvent } from 'openai/resources/responses/responses'
import {
  makeSdkResponse,
  makeStreamEvent,
} from '../../test-helpers/modules/openai-utils/responses.mts'
import { runWithOpenAIResponseAttemptHooks } from '@modules/openai-utils/response-attempt-context'
import { createOpenRouterResponse, toOpenRouterModel } from './create-response.mts'

type CreateResponse = NonNullable<
  NonNullable<Parameters<typeof createOpenRouterResponse>[2]>['createResponse']
>

describe('OpenRouter Responses transport', () => {
  it('preserves tool chaining parameters and returns a terminal compatible response', async () => {
    const output: Response['output'] = [
      {
        type: 'function_call',
        id: 'fc_openrouter_fixture',
        call_id: 'call_openrouter_fixture',
        name: 'lookup_topic',
        arguments: '{"slug":"security"}',
        status: 'completed',
      },
    ]
    const response = makeSdkResponse({
      id: 'resp_openrouter_fixture',
      status: 'completed',
      model: 'openai/gpt-5.4-nano',
      output,
    })
    const createResponse = vi
      .fn<CreateResponse>()
      .mockResolvedValueOnce(
        makeResponseStream([
          makeStreamEvent({ type: 'response.completed', sequence_number: 1, response }),
        ]) as never,
      )

    const result = await createOpenRouterResponse(
      {
        model: toOpenRouterModel('gpt-5.4-nano'),
        input: [{ type: 'function_call_output', call_id: 'call_previous', output: '{"ok":true}' }],
        previous_response_id: 'resp_previous',
        tools: [
          {
            type: 'function',
            name: 'lookup_topic',
            description: 'Looks up a topic.',
            parameters: {
              type: 'object',
              properties: { slug: { type: 'string' } },
              required: ['slug'],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: 'auto',
        prompt_cache_key: 'openrouter-fixture-v1',
      } as never,
      undefined,
      { createResponse },
    )

    expect(result).toMatchObject({ id: 'resp_openrouter_fixture', status: 'completed' })
    expect(result.output).toEqual(output)
    expect(createResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-5.4-nano',
        stream: true,
        background: false,
        previous_response_id: 'resp_previous',
        tool_choice: 'auto',
        prompt_cache_key: 'openrouter-fixture-v1',
      }),
      expect.objectContaining({ maxRetries: 0 }),
    )
  })

  it('latches an unknown billed attempt when the response stream fails before completion', async () => {
    const cause = new Error('socket closed')
    const failingStream: AsyncIterable<ResponseStreamEvent> = {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(cause) }),
    }
    const createResponse = vi.fn<CreateResponse>().mockResolvedValueOnce(failingStream as never)
    const onUnknownBilledAttempt = vi.fn<
      (attempt: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())

    const error = await runWithOpenAIResponseAttemptHooks(
      { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
      () =>
        createOpenRouterResponse({ model: 'openai/gpt-5.4-nano', input: 'hello' }, undefined, {
          createResponse,
        }),
    ).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ cause })
    expect(onUnknownBilledAttempt).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ error }),
    )
  })
})

function makeResponseStream(events: ResponseStreamEvent[]): AsyncIterable<ResponseStreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* events
    },
  }
}
