import type {
  ResponseCreateParamsStreaming,
  ResponseInput,
  ResponseInputItem,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses'
import {
  streamOpenAIResponseEvents,
  getOpenAIResponseAttemptHooks,
  shouldLatchUnknownBilledOpenAIAttempt,
  type OpenAIResponse,
  type ResponseStreamLike,
} from '@modules/openai-utils/create-response'
import { createOpenAICompatibleResponseWithRetries } from '@modules/openai-utils/response-retry'
import client from './client.mts'

type RawCreateParams = Parameters<typeof client.responses.create>[0]
type RawCreateOptions = Parameters<typeof client.responses.create>[1]

export type OpenRouterResponseInput = string | ResponseInput
export type OpenRouterResponseInputItem = ResponseInputItem
export type CreateOpenRouterResponseParams = Omit<RawCreateParams, 'input' | 'background'> & {
  input: OpenRouterResponseInput
}

type CreateResponse = (
  params: ResponseCreateParamsStreaming,
  options?: RawCreateOptions,
) => PromiseLike<ResponseStreamLike>

interface CreateOpenRouterResponseDeps {
  createResponse?: CreateResponse
}

/**
 * OpenRouter's OpenResponses endpoint is used in foreground mode. Unlike the direct OpenAI
 * endpoint, it is not enrolled in the OpenAI background-response registry: the terminal stream
 * is drained before this promise resolves, and the caller records the returned response id.
 */
/* no-mistakes: integration=openrouter */
export async function createOpenRouterResponse(
  params: CreateOpenRouterResponseParams,
  options?: RawCreateOptions,
  deps: CreateOpenRouterResponseDeps = {},
): Promise<OpenAIResponse> {
  const createResponse = deps.createResponse ?? createClientResponse
  const { stream, requestStartedAt } = await createOpenAICompatibleResponseWithRetries(
    async (request, requestOptions) => await createResponse(request, requestOptions),
    { ...params, stream: true, background: false } as ResponseCreateParamsStreaming,
    options,
  )
  try {
    return await drainOpenRouterResponse(stream)
  } catch (error) {
    if (shouldLatchUnknownBilledOpenAIAttempt(error)) {
      await getOpenAIResponseAttemptHooks()?.onUnknownBilledAttempt({ requestStartedAt, error })
    }
    throw error
  }
}

async function createClientResponse(
  params: ResponseCreateParamsStreaming,
  options?: RawCreateOptions,
): Promise<ResponseStreamLike> {
  return (await client.responses.create(params, options)) as ResponseStreamLike
}

async function drainOpenRouterResponse(stream: ResponseStreamLike): Promise<OpenAIResponse> {
  const events = streamOpenAIResponseEvents(stream)
  let result = await events.next()
  while (!result.done) {
    // oxlint-disable-next-line no-await-in-loop -- consuming an SSE stream is intentionally sequential.
    result = await events.next()
  }
  return result.value
}

export const OPENROUTER_DEFAULT_AGENT_MODEL = 'openai/gpt-5.4-nano' as const

export function toOpenRouterModel(model: string): string {
  return model.includes('/') ? model : `openai/${model}`
}

export type { OpenAIResponse, ResponseStreamEvent }
