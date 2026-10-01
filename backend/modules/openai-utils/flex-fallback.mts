import { recordOpenAiFlexFallback, type OpenAiFlexFallbackContext } from '@modules/on-error'
import { isOpenAIFlexResourceUnavailableError } from './rate-limit.mts'
import { isOpenAIFlexCapacityFailedResponseError } from './response-errors.mts'

type FlexFallbackParams = { model?: string; service_tier?: string | null }

/**
 * One physical attempt: create the response and consume it to its terminal event. `priorAttempts`
 * is 0 for the first attempt and 1 for the resend; any non-zero value makes `beforeAttempt` see
 * `attempt > 1`, so the spend-cap guard runs again before a resend billed at the standard price.
 */
type OpenAIFlexFallbackAttempt<P, T> = (params: P, priorAttempts: number) => T

/**
 * Resends a `service_tier: 'flex'` request exactly once on the default tier when the provider
 * reports flex capacity unavailable — as the HTTP 429 `resource_unavailable` that outlasted the
 * free retry budget, or as a streamed `response.failed` (`server_error`, "Flex processing is
 * temporarily unavailable"). OpenAI documents standard processing as the remedy; OpenRouter never
 * falls back itself because default-tier endpoints cost more than the tier requested, so the
 * application owns that decision. Both conditions are positively unbilled, so the resend cannot
 * double-bill. Non-flex requests, other errors, and a failed resend are unchanged.
 */
export async function withOpenAIFlexFallback<P extends FlexFallbackParams, T>(
  params: P,
  provider: OpenAiFlexFallbackContext['provider'],
  run: OpenAIFlexFallbackAttempt<P, Promise<T>>,
): Promise<T> {
  try {
    return await run(params, 0)
  } catch (error) {
    const fallback = getOpenAIFlexFallbackParams(params, error, provider)
    if (!fallback) throw error
    return run(fallback, 1)
  }
}

/**
 * Generator form of {@link withOpenAIFlexFallback} for foreground streams. Once any delta has
 * reached the consumer the attempt can no longer be replaced without duplicating visible output,
 * so a failure after that point is rethrown instead of resent.
 */
export async function* streamWithOpenAIFlexFallback<P extends FlexFallbackParams, Y, R>(
  params: P,
  provider: OpenAiFlexFallbackContext['provider'],
  run: OpenAIFlexFallbackAttempt<P, AsyncGenerator<Y, R>>,
): AsyncGenerator<Y, R> {
  let yielded = false
  try {
    return yield* trackYields(run(params, 0), () => {
      yielded = true
    })
  } catch (error) {
    const fallback = yielded ? null : getOpenAIFlexFallbackParams(params, error, provider)
    if (!fallback) throw error
    return yield* run(fallback, 1)
  }
}

function getOpenAIFlexFallbackParams<P extends FlexFallbackParams>(
  params: P,
  error: unknown,
  provider: OpenAiFlexFallbackContext['provider'],
): P | null {
  if (params.service_tier !== 'flex') return null
  const model = params.model ?? 'unknown'
  if (isOpenAIFlexResourceUnavailableError(error)) {
    recordOpenAiFlexFallback({ provider, model, trigger: 'http_429' })
  } else if (isOpenAIFlexCapacityFailedResponseError(error)) {
    recordOpenAiFlexFallback({ provider, model, trigger: 'stream_failed' })
  } else {
    return null
  }
  return { ...params, service_tier: 'default' }
}

async function* trackYields<Y, R>(
  events: AsyncGenerator<Y, R>,
  onYield: () => void,
): AsyncGenerator<Y, R> {
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- each .next() advances the stream's cursor; it cannot resolve until the previous yield has
      const step = await events.next()
      if (step.done) return step.value
      onYield()
      yield step.value
    }
  } finally {
    // A consumer that stops early must still close the underlying stream; a no-op once finished.
    await events.return(undefined as R)
  }
}
