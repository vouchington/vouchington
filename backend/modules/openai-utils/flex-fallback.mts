import { getOpenAIFlexFallback } from '@vouchington/ai/openai'
import { recordOpenAiFlexFallback, type OpenAiFlexFallbackContext } from '@modules/on-error'

type FlexFallbackParams = { model?: string; service_tier?: string | null }

/**
 * One physical attempt: create the response and consume it to its terminal event. `priorAttempts`
 * is 0 for the first attempt and 1 for the resend; any non-zero value makes `beforeAttempt` see
 * `attempt > 1`, so the spend-cap guard runs again before a resend billed at the standard price.
 */
type OpenAIFlexFallbackAttempt<P, T> = (
  params: P | (Omit<P, 'service_tier'> & { service_tier: 'default' }),
  priorAttempts: number,
) => T

/**
 * Resends a `service_tier: 'flex'` request exactly once on the default tier when the provider
 * reports flex capacity unavailable. OpenRouter never falls back itself because default-tier
 * endpoints cost more than the tier requested, so the application owns that decision and the
 * metric. Non-flex requests, other errors, and a failed resend are unchanged.
 */
export async function withOpenAIFlexFallback<P extends FlexFallbackParams, T>(
  params: P,
  provider: OpenAiFlexFallbackContext['provider'],
  run: OpenAIFlexFallbackAttempt<P, Promise<T>>,
): Promise<T> {
  try {
    return await run(params, 0)
  } catch (err) {
    const fallback = getOpenAIFlexFallback(params, err)
    if (!fallback) throw err
    recordOpenAiFlexFallback({
      provider,
      model: params.model ?? 'unknown',
      trigger: fallback.trigger,
    })
    return run(fallback.params, 1)
  }
}
