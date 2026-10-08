import Anthropic from '@anthropic-ai/sdk'
import type { BilledModelResponse } from './types.mts'
import {
  getHeaderValue,
  getRetryAfterDurationMs,
  isAmbiguousBilledHttpStatus,
} from '@modules/utils/http'

export type ModelProviderErrorCode =
  | 'client-unavailable'
  | 'credit-balance-too-low'
  | 'rate-limited'
  | 'overloaded'
  | 'server-error'
  | 'connection'
  | 'authentication'
  | 'permission'
  | 'invalid-request'
  | 'unsupported-parameter'
  | 'invalid-response'
  | 'refusal'
  | 'output-truncated'

/** The one classification every provider and transport failure maps onto. */
export type ModelProviderRetryClass = 'transient' | 'permanent'

export class ModelProviderError extends Error {
  readonly code: ModelProviderErrorCode
  readonly retryClass: ModelProviderRetryClass
  readonly status: number | undefined
  /** The provider's `Retry-After`, when it sent one on a transient failure. */
  readonly retryAfterMs: number | undefined
  /**
   * The request was sent but its outcome is unknown, so the provider may have billed it: a timeout
   * or network failure after sending, or a status such as 408/409/429/5xx. Callers record this as
   * an unknown billed attempt instead of dropping it.
   */
  readonly ambiguousBilled: boolean
  /**
   * Set when the provider answered 2xx and billed the call but the answer is unusable (a refusal,
   * a truncated or schema-invalid output). The ledger still records its usage.
   */
  readonly billedResponse: BilledModelResponse | undefined

  constructor(
    code: ModelProviderErrorCode,
    message: string,
    options: {
      retryClass: ModelProviderRetryClass
      status?: number
      retryAfterMs?: number
      ambiguousBilled?: boolean
      billedResponse?: BilledModelResponse
      cause?: unknown
    },
  ) {
    super(message, { cause: options.cause })
    this.name = 'ModelProviderError'
    this.code = code
    this.retryClass = options.retryClass
    this.status = options.status
    this.retryAfterMs = options.retryAfterMs
    this.ambiguousBilled = options.ambiguousBilled ?? false
    this.billedResponse = options.billedResponse
  }
}

const CREDIT_BALANCE_TOO_LOW = /credit balance is too low/i

function statusCode(status: number, message: string): ModelProviderErrorCode {
  if (status === 429) return 'rate-limited'
  if (status === 529) return 'overloaded'
  if (status >= 500) return 'server-error'
  if (status === 401) return 'authentication'
  if (status === 403) return 'permission'
  if (status === 400 && CREDIT_BALANCE_TOO_LOW.test(message)) return 'credit-balance-too-low'
  return 'invalid-request'
}

/**
 * Maps an Anthropic SDK failure onto the shared classification. 408, 429, 529 (overloaded) and 5xx
 * are transient and carry `retry-after`; a dropped connection is transient; every other 4xx is
 * permanent. "Credit balance too low" is permanent with its own code so the alarm can name it.
 * An abort is the caller's own, so it is returned unchanged.
 */
export function classifyAnthropicError(error: unknown): unknown {
  if (error instanceof Anthropic.APIUserAbortError) return error
  if (error instanceof Anthropic.APIConnectionError) {
    return new ModelProviderError('connection', 'Anthropic request failed to connect.', {
      retryClass: 'transient',
      ambiguousBilled: true,
      cause: error,
    })
  }
  if (!(error instanceof Anthropic.APIError) || error.status === undefined) return error
  const { status } = error
  const code = statusCode(status, error.message)
  const retryClass = status === 408 || status === 429 || status >= 500 ? 'transient' : 'permanent'
  const header = getHeaderValue(error.headers, 'retry-after')
  const retryAfterMs = getRetryAfterDurationMs(Array.isArray(header) ? header[0] : header)
  return new ModelProviderError(code, `Anthropic returned HTTP ${status} (${code}).`, {
    retryClass,
    status,
    ...(retryClass === 'transient' && retryAfterMs !== null ? { retryAfterMs } : {}),
    ambiguousBilled: isAmbiguousBilledHttpStatus(status),
    cause: error,
  })
}
