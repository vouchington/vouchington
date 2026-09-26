import { isAmbiguousBilledHttpStatus, isNetworkError } from '@modules/utils/http'
import type { Response } from 'undici'
import { decodeResult } from './decode.mts'
import { createTransportRequest, fetchStructuredDecisionProvider } from './transport.mts'
import {
  StructuredDecisionError,
  type CreateStructuredDecisionClientOptions,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionRequest,
  type StructuredDecisionResult,
  type StructuredDecisionUsage,
} from './types.mts'
import { validateRequest } from './validation.mts'

export function createStructuredDecisionClient(
  options: CreateStructuredDecisionClientOptions,
): StructuredDecisionClient {
  if (options.apiKey.trim().length === 0)
    throw new StructuredDecisionError(
      'invalid-request',
      'A structured-decision API key is required.',
    )
  const fetch = options.fetch ?? fetchStructuredDecisionProvider
  return {
    decide: async (request, signal) => {
      validateRequest(request)
      throwIfAborted(signal)
      const dispatch = createTransportRequest(options.transport, options.apiKey, request)
      const requestStartedAt = new Date()
      // The client makes exactly one attempt, so this is the only chance to recheck a billing
      // precondition (e.g. the daily spend cap) close to the physical request.
      await options.hooks?.beforeAttempt?.({ requestStartedAt })
      throwIfAborted(signal)
      return attemptDecision({
        dispatch,
        fetch,
        hooks: options.hooks,
        request,
        requestStartedAt,
        signal,
        transport: options.transport,
      })
    },
  }
}

type AttemptOptions = {
  dispatch: ReturnType<typeof createTransportRequest>
  fetch: StructuredDecisionFetch
  hooks: StructuredDecisionAttemptHooks | undefined
  request: StructuredDecisionRequest
  requestStartedAt: Date
  signal?: AbortSignal
  transport: CreateStructuredDecisionClientOptions['transport']
}

async function attemptDecision(options: AttemptOptions): Promise<StructuredDecisionResult> {
  let response: Response
  try {
    response = await options.fetch(options.dispatch.url, {
      method: 'POST',
      headers: options.dispatch.headers,
      body: JSON.stringify(options.dispatch.body),
      signal: options.signal,
    })
  } catch (error) {
    // Checked before classifying the error as ambiguous: `AbortSignal.timeout`'s abort surfaces
    // as a `DOMException` named `TimeoutError`, which `isNetworkError` also treats as a network
    // failure -- without this ordering, every caller-driven timeout/cancellation would latch an
    // uncertainty record it never actually caused.
    throwIfAborted(options.signal)
    if (isNetworkError(error)) await latchUnknownBilledAttempt(options, error)
    throw new StructuredDecisionError(
      'provider-error',
      'Structured-decision transport failed.',
      undefined,
      { cause: error },
    )
  }
  if (!response.ok) return rejectResponse(response, options)
  return decodeBilledResponse(response, options)
}

async function rejectResponse(response: Response, options: AttemptOptions): Promise<never> {
  const error = new StructuredDecisionError(
    'provider-error',
    `Structured-decision provider returned HTTP ${response.status}.`,
    response.status,
  )
  await cancelBody(response)
  if (isAmbiguousBilledHttpStatus(response.status)) await latchUnknownBilledAttempt(options, error)
  throw error
}

async function decodeBilledResponse(
  response: Response,
  options: AttemptOptions,
): Promise<StructuredDecisionResult> {
  let raw: unknown
  try {
    raw = await response.json()
  } catch (error) {
    // Any failure reading/parsing the body of a 2xx response is ambiguous, not just a
    // `SyntaxError` -- a truncated stream throws a plain connection error from `.json()` too, and
    // it is exactly as billing-ambiguous as malformed JSON.
    await latchUnknownBilledAttempt(options, error)
    throw new StructuredDecisionError(
      'invalid-response',
      'Provider returned malformed JSON.',
      undefined,
      { cause: error },
    )
  }
  // Usage is only validated/reported when a caller actually wants billing recorded: a caller
  // that passes no `onBilledResponse` hook keeps the old lenient behavior (decode proceeds even
  // if `usage` is absent or malformed), since nothing downstream depends on it in that case.
  if (options.hooks?.onBilledResponse) {
    const usage = parseBilledUsage(raw)
    if (!usage) {
      const error = new StructuredDecisionError(
        'invalid-response',
        'Provider response did not contain readable usage.',
      )
      await latchUnknownBilledAttempt(options, error)
      throw error
    }
    await options.hooks.onBilledResponse({
      id: record(raw) ? raw.id : undefined,
      model: record(raw) ? raw.model : undefined,
      usage,
      requestStartedAt: options.requestStartedAt,
    })
  }
  return decodeResult(raw, options.request, options.transport, options.dispatch.provider)
}

async function latchUnknownBilledAttempt(options: AttemptOptions, error: unknown): Promise<void> {
  await options.hooks?.onUnknownBilledAttempt?.({
    requestStartedAt: options.requestStartedAt,
    error,
  })
}

// Only `input_tokens`/`output_tokens` gate whether a 2xx is trustworthy enough to record --
// `cost` is passed through unchecked (including when absent or the wrong type): a missing or
// malformed cost is a pricing-fallback concern for the ledger writer
// (`getExplicitCostMicrounits`/`calcCostMicrounits`, `@services/ai-usage/record.mts`), which
// already fails closed to an unpriced row rather than something this transport-level boundary
// should reclassify as an uncertain-billing failure.
function parseBilledUsage(raw: unknown): StructuredDecisionUsage | null {
  if (!record(raw) || !record(raw.usage)) return null
  const { input_tokens, output_tokens, cost } = raw.usage
  if (!isFiniteNonNegative(input_tokens) || !isFiniteNonNegative(output_tokens)) return null
  return {
    input_tokens,
    output_tokens,
    ...(typeof cost === 'number' ? { cost } : {}),
  }
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // Best-effort connection cleanup must not replace the provider outcome.
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason
}
