import { getHeaderValue, getRetryAfterDurationMs } from '@modules/utils/http'
import type { Response } from 'undici'
import type {
  ProviderErrorDetail,
  StructuredDecisionProviderFailure,
  StructuredDecisionRetryClass,
  StructuredDecisionTransport,
} from './types.mts'

type Rule =
  | StructuredDecisionRetryClass
  | ((detail: ProviderErrorDetail | undefined) => StructuredDecisionRetryClass)

type TransportClassification = {
  /** Exact statuses. A rule that reads the error body sees `undefined` when the body had none. */
  byStatus: Readonly<Record<number, Rule>>
  /** Every status not listed above. */
  otherStatus(status: number): StructuredDecisionRetryClass
}

const OPENROUTER_IN_FLIGHT_BUDGET = 'openrouter_in_flight_budget'

function statusOnly(status: number): StructuredDecisionRetryClass {
  return status === 408 || status === 429 || status >= 500 ? 'transient' : 'permanent'
}

/**
 * The one place a provider's HTTP failure becomes `transient` (the same request may succeed after
 * a wait) or `permanent` (it never will), per transport. Retry classification is deliberately
 * separate from billing: `isAmbiguousBilledHttpStatus` alone decides the spend-cap latch.
 *
 * OpenRouter (https://openrouter.ai/docs/api-reference/errors): an outage can answer 403, so a bare
 * 403 is transient and only a moderation flag or a guardrail block makes it permanent. 402 is
 * permanent unless it is the in-flight budget limit, which carries `Retry-After`. TypeSafe's body
 * semantics are not documented here, so it classifies by status alone.
 */
const CLASSIFICATION: Readonly<Record<StructuredDecisionTransport, TransportClassification>> = {
  openrouter: {
    byStatus: {
      400: 'permanent',
      401: 'permanent',
      402: detail =>
        detail?.limitSource === OPENROUTER_IN_FLIGHT_BUDGET ? 'transient' : 'permanent',
      403: detail => (detail?.moderation || detail?.guardrail ? 'permanent' : 'transient'),
      408: 'transient',
      429: 'transient',
      502: 'transient',
      503: 'transient',
    },
    otherStatus: statusOnly,
  },
  typesafe: { byStatus: {}, otherStatus: statusOnly },
}

/** No status means no response: a connection failure, which a later attempt may not repeat. */
export function classifyProviderFailure(
  transport: StructuredDecisionTransport,
  status: number | undefined,
  detail: ProviderErrorDetail | undefined,
): StructuredDecisionRetryClass {
  if (status === undefined) return 'transient'
  const { byStatus, otherStatus } = CLASSIFICATION[transport]
  const rule = byStatus[status]
  if (rule === undefined) return otherStatus(status)
  return typeof rule === 'function' ? rule(detail) : rule
}

/** The classified failure of a non-2xx response, with its `Retry-After` when it is retryable. */
export function classifyProviderResponse(
  transport: StructuredDecisionTransport,
  response: Response,
  detail: ProviderErrorDetail | undefined,
): StructuredDecisionProviderFailure {
  const retryClass = classifyProviderFailure(transport, response.status, detail)
  const header = getHeaderValue(response.headers, 'retry-after')
  const retryAfterMs = getRetryAfterDurationMs(Array.isArray(header) ? header[0] : header)
  return {
    retryClass,
    ...(retryClass === 'transient' && retryAfterMs !== null ? { retryAfterMs } : {}),
    ...(detail ? { detail } : {}),
  }
}
