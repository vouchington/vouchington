import { setTimeout as delay } from 'node:timers/promises'
import { APIConnectionError, APIError } from 'openai'
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses'
import { getHeaderValue, getRetryAfterDurationMs } from '@modules/utils'
import openai from './client.mts'
import { getOpenAIResponseAttemptHooks } from './response-attempt-context.mts'
import { isOpenAIFlexResourceUnavailableError } from './rate-limit.mts'
import { isExplicitClientCancelError } from './response-errors.mts'

const INITIAL_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 8_000

type RawCreateOptions = Parameters<typeof openai.responses.create>[1]
type CreateResponse = (
  params: ResponseCreateParamsStreaming,
  options?: RawCreateOptions,
) => Promise<AsyncIterable<ResponseStreamEvent>>

/* no-mistakes: integration=openai */
export async function createOpenAIResponseWithRetries(
  params: ResponseCreateParamsStreaming,
  options?: RawCreateOptions,
): Promise<{ stream: AsyncIterable<ResponseStreamEvent>; requestStartedAt: Date }> {
  return await createOpenAICompatibleResponseWithRetries(
    async (request, requestOptions) => await openai.responses.create(request, requestOptions),
    params,
    options,
  )
}

/**
 * Applies the direct OpenAI transport's retry and uncertainty policy to an OpenAI-compatible
 * Responses endpoint. Callers must supply an endpoint that accepts the same SDK request shape.
 */
export async function createOpenAICompatibleResponseWithRetries(
  createResponse: CreateResponse,
  params: ResponseCreateParamsStreaming,
  options?: RawCreateOptions,
): Promise<{ stream: AsyncIterable<ResponseStreamEvent>; requestStartedAt: Date }> {
  const maxRetries = options?.maxRetries ?? 2
  const sdkOptions = { ...options, maxRetries: 0 }
  const hooks = getOpenAIResponseAttemptHooks()
  for (let attempt = 1; ; attempt += 1) {
    options?.signal?.throwIfAborted()
    const requestStartedAt = new Date()
    // oxlint-disable-next-line no-await-in-loop -- each hook belongs to the physical request it precedes
    await hooks?.beforeAttempt({ attempt, requestStartedAt })
    options?.signal?.throwIfAborted()
    try {
      // oxlint-disable-next-line no-await-in-loop -- a retry cannot begin until this physical request settles
      return { stream: await createResponse(params, sdkOptions), requestStartedAt }
    } catch (error) {
      const isFlexResourceUnavailable = isOpenAIFlexResourceUnavailableError(error)
      if (isFlexResourceUnavailable && attempt <= maxRetries) {
        // oxlint-disable-next-line no-await-in-loop -- retry delay gates the following physical request
        await waitForOpenAIResponseRetry(error, attempt - 1, options?.signal ?? undefined)
        continue
      }
      if (!isFlexResourceUnavailable && isUnknownBilledOpenAIResponseAttempt(error)) {
        // oxlint-disable-next-line no-await-in-loop -- uncertainty must persist before propagating a billed-ambiguous error
        await hooks?.onUnknownBilledAttempt({ requestStartedAt, error })
      }
      throw error
    }
  }
}

export async function waitForOpenAIResponseRetry(
  error: unknown,
  retryIndex: number,
  signal?: AbortSignal,
): Promise<void> {
  await delay(getOpenAIResponseRetryDelayMs(error, retryIndex), undefined, { signal })
}

export function getOpenAIResponseRetryDelayMs(error: unknown, retryIndex: number): number {
  const retryAfterMs = getRetryAfterMs(error)
  if (retryAfterMs !== null) return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS)
  const exponential = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** retryIndex, MAX_RETRY_DELAY_MS)
  return Math.floor(exponential * (0.75 + Math.random() * 0.25))
}

function getRetryAfterMs(error: unknown): number | null {
  if (!(error instanceof APIError) || !error.headers) return null
  const retryAfterMs = Number(getHeaderValue(error.headers, 'retry-after-ms'))
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) return retryAfterMs
  const retryAfter = getHeaderValue(error.headers, 'retry-after')
  const value = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter
  return getRetryAfterDurationMs(value) ?? null
}

function isUnknownBilledOpenAIResponseAttempt(error: unknown): boolean {
  if (isExplicitClientCancelError(error)) return false
  if (error instanceof APIConnectionError) return true
  if (!(error instanceof APIError)) return false
  return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500
}
