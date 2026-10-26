import {
  type DecisionTransportRequest,
  type StructuredDecisionRequest,
  buildDecisionTransportRequest,
} from '@vouchington/ai/structured-decisions'
import { getLongRunningExternalRequestDispatcher } from '@modules/utils/http'
import { fetch as undiciFetch, type Response } from 'undici'
import type { StructuredDecisionTransport } from './types.mts'
const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions'
const TYPESAFE_SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone'
export function createTransportRequest(
  transport: StructuredDecisionTransport,
  apiKey: string,
  request: StructuredDecisionRequest,
  model?: string,
): DecisionTransportRequest {
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
