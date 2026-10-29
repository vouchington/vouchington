import {
  type DecisionTransportRequest,
  type StructuredDecisionRequest,
  buildDecisionTransportRequest,
  buildOpenAIDecisionRequest,
} from '@vouchington/ai/structured-decisions'
import { getLongRunningExternalRequestDispatcher } from '@modules/utils/http'
import { fetch as undiciFetch, type Response } from 'undici'
import type { StructuredDecisionTransport } from './types.mts'
const OPENAI_DECISIONS_URL = 'https://api.openai.com/v1/decisions'
const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions'
const TYPESAFE_SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone'
const OPENAI_DECISION_MODEL = 'gpt-6-luna'
export function createTransportRequest(
  transport: StructuredDecisionTransport,
  apiKey: string,
  request: StructuredDecisionRequest,
  model?: string,
): DecisionTransportRequest {
  // OpenAI documents no `service_tier` (flex) for Decisions, so none is sent.
  if (transport === 'openai')
    return buildOpenAIDecisionRequest(
      { url: OPENAI_DECISIONS_URL, apiKey, model: model ?? OPENAI_DECISION_MODEL },
      request,
    )
  if (transport === 'typesafe')
    return buildDecisionTransportRequest(
      {
        url: TYPESAFE_SYSTEM_ONE_URL,
        provider: 'TypeSafe',
        apiKey,
        model: model ?? 'jev-latest',
      },
      request,
    )
  return buildDecisionTransportRequest(
    {
      url: OPENROUTER_DECISIONS_URL,
      provider: 'OpenRouter',
      apiKey,
      model: model ?? 'typesafe/jev-1.13',
      extraBody: { provider: { only: ['TypeSafe'], allow_fallbacks: false } },
    },
    request,
  )
}
/* no-mistakes: integration=openai */
/* no-mistakes: integration=typesafe */
/* no-mistakes: integration=openrouter */
export async function fetchStructuredDecisionProvider(
  url: string,
  init: Parameters<typeof undiciFetch>[1],
): Promise<Response> {
  return undiciFetch(url, {
    ...init,
    dispatcher: getLongRunningExternalRequestDispatcher(),
  })
}

/**
 * The environment credential for a classifier's transport. Direct TypeSafe has no deployed key, so
 * a classifier reconfigured to it throws here and its run ends through the client-unavailable path
 * instead of spending or looping. An unset key is rejected by the client. Tests pass `override` to
 * avoid process-wide credential mutation.
 */
export function structuredDecisionApiKey(
  transport: StructuredDecisionTransport,
  override?: string,
): string {
  if (transport === 'typesafe')
    throw new Error(`Structured decisions have no API key source for provider '${transport}'`)
  const env = transport === 'openai' ? process.env.OPENAI_API_KEY : process.env.OPENROUTER_API_KEY
  return override ?? env ?? ''
}
