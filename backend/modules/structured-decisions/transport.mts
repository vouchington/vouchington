import {
  buildDecisionTransportRequest,
  type StructuredDecisionRequest,
} from '@vouchington/ai/structured-decisions'
import { getLongRunningExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { fetch as undiciFetch, type Response } from 'undici'

import type { StructuredDecisionTransport } from './types.mts'
const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions'
const TYPESAFE_SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone'
export type TransportRequest = {
  body: Record<string, unknown>
  headers: Record<string, string>
  provider: string
  url: string
}
/**
 * @public Retained provisionally under issue #1360 and described in
 * `docs/overview/architecture/structured-decisions.md`; the internal client is a current owner,
 * while external consumers are unconfirmed. This export may be removed after intended-use review.
 */
export function createTransportRequest(
  transport: StructuredDecisionTransport,
  apiKey: string,
  request: StructuredDecisionRequest,
  model?: string,
): TransportRequest {
  return buildDecisionTransportRequest(
    {
      url: transport === 'typesafe' ? TYPESAFE_SYSTEM_ONE_URL : OPENROUTER_DECISIONS_URL,
      provider: transport === 'typesafe' ? 'TypeSafe' : 'OpenRouter',
      apiKey,
      model: model ?? (transport === 'typesafe' ? 'jev-latest' : 'typesafe/jev-1.13'),
      ...(transport === 'openrouter'
        ? { extraBody: { provider: { only: ['TypeSafe'], allow_fallbacks: false } } }
        : {}),
    },
    request,
  )
}
/* no-mistakes: integration=typesafe */
/* no-mistakes: integration=openrouter
 @public Retained provisionally under issue #1360 and described in
 `docs/overview/architecture/structured-decisions.md`; the internal client is a current owner,
 while external consumers are unconfirmed. This export may be removed after intended-use review.
*/
export async function fetchStructuredDecisionProvider(
  url: string,
  init: Parameters<typeof undiciFetch>[1],
): Promise<Response> {
  return undiciFetch(url, {
    ...init,
    dispatcher: getLongRunningExternalRequestDispatcher(),
  })
}
