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
