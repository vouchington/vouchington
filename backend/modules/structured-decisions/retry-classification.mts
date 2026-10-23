import {
  classifyByStatus,
  classifyOpenRouterFailure,
  classifyProviderResponse as classifyResponse,
  type ProviderErrorDetail,
  type StructuredDecisionProviderFailure,
  type StructuredDecisionRetryClass,
} from '@vouchington/ai/structured-decisions'
import type { Response } from 'undici'
import type { StructuredDecisionTransport } from './types.mts'

function classifier(transport: StructuredDecisionTransport) {
  return transport === 'openrouter' ? classifyOpenRouterFailure : classifyByStatus
}
export function classifyProviderFailure(
  transport: StructuredDecisionTransport,
  status: number | undefined,
  detail: ProviderErrorDetail | undefined,
): StructuredDecisionRetryClass {
  return classifier(transport)(status, detail)
}
export function classifyProviderResponse(
  transport: StructuredDecisionTransport,
  response: Response,
  detail: ProviderErrorDetail | undefined,
): StructuredDecisionProviderFailure {
  return classifyResponse(classifier(transport), response, detail)
}
