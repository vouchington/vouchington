import { openAIUsageToModelUsage } from '@modules/model-providers/usage'
import type { OpenAIResponse } from './create-response.mts'
import {
  recordModelUsage,
  type RecordModelUsageDeps,
  type RecordModelUsageParams,
} from './record-model-usage.mts'

type RecordAgentResponseUsageParams = Omit<
  RecordModelUsageParams,
  'responseId' | 'provider' | 'model' | 'serviceTier' | 'usage'
> & {
  // Pick, not the full OpenAIResponse: also accepts an OpenAIResponseNotCompletedError (failed or
  // incomplete responses still bill tokens), so callers record from the thrown error.
  response: Pick<OpenAIResponse, 'usage' | 'model' | 'service_tier'> & { id?: string }
  /** Who made the model; every OpenAI-shaped response is OpenAI's unless a caller says otherwise. */
  provider?: RecordModelUsageParams['provider']
}

/**
 * Records an OpenAI-shaped response (a direct or OpenRouter Responses API result, or a jev
 * structured-decision answer, which reports the same `usage`) from what the provider actually
 * served, falling back to a distinguishable sentinel when the model or tier is missing so a
 * systematic mismatch is visible rather than silently priced wrong. Silently no-ops when the
 * response carried no `usage` (e.g. a test double that doesn't model the real API shape).
 */
export async function recordAgentResponseUsage(
  { response, provider = 'openai', ...rest }: RecordAgentResponseUsageParams,
  deps: Partial<RecordModelUsageDeps> = {},
): Promise<void> {
  if (!response.usage) return
  await recordModelUsage(
    {
      ...rest,
      responseId: response.id,
      provider,
      model: response.model ?? 'unknown-model',
      serviceTier: response.service_tier ?? 'unknown-tier',
      usage: openAIUsageToModelUsage(response.usage),
    },
    deps,
  )
}
