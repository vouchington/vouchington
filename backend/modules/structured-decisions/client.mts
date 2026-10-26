import { isAmbiguousBilledHttpStatus } from '@modules/utils/http'
import { isNetworkError } from '@vouchington/http-transport/fetch'
import type { Response } from 'undici'
import {
  StructuredDecisionError,
  type StructuredDecisionRequest,
  type StructuredDecisionResult,
  classifyByStatus,
  classifyOpenRouterFailure,
  classifyProviderResponse,
  decodeResult,
  describeProviderErrorDetail,
  parseBilledUsage,
  readProviderErrorDetail,
  validateRequest,
} from '@vouchington/ai/structured-decisions'
import { createTransportRequest, fetchStructuredDecisionProvider } from './transport.mts'
import type {
  CreateStructuredDecisionClientOptions,
  StructuredDecisionAttemptHooks,
  StructuredDecisionClient,
  StructuredDecisionFetch,
} from './types.mts'

const OPENROUTER_MODEL = /^typesafe\/jev-1\.13(?:-[A-Za-z0-9.]+)?$/
const TYPESAFE_MODEL = /^(?:typesafe\/)?(?:jev-latest|jev-1\.13(?:\.0)?(?:-[A-Za-z0-9.]+)?)$/

function classifierFor(transport: CreateStructuredDecisionClientOptions['transport']) {
  return transport === 'openrouter' ? classifyOpenRouterFailure : classifyByStatus
}

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
      const dispatch = createTransportRequest(
        options.transport,
        options.apiKey,
        request,
        options.model,
      )
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
  } catch (err) {
    // Checked before classifying the error as ambiguous: `AbortSignal.timeout`'s abort surfaces
    // as a `DOMException` named `TimeoutError`, which `isNetworkError` also treats as a network
    // failure -- without this ordering, every caller-driven timeout/cancellation would latch an
    // uncertainty record it never actually caused.
    throwIfAborted(options.signal)
    if (isNetworkError(err)) await latchUnknownBilledAttempt(options, err)
    throw new StructuredDecisionError(
      'provider-error',
      'Structured-decision transport failed.',
      undefined,
      {
        cause: err,
        failure: { retryClass: classifierFor(options.transport)(undefined, undefined) },
      },
    )
  }
  if (!response.ok) return rejectResponse(response, options)
  return decodeBilledResponse(response, options)
}

async function rejectResponse(response: Response, options: AttemptOptions): Promise<never> {
  // Never throws: an unreadable or non-JSON body leaves the status as the only signal.
  const detail = await readProviderErrorDetail(response)
  const failure = classifyProviderResponse(classifierFor(options.transport), response, detail)
  const summary = detail && describeProviderErrorDetail(detail)
  const error = new StructuredDecisionError(
    'provider-error',
    `Structured-decision provider returned HTTP ${response.status}${summary ? ` (${summary})` : ''}.`,
    response.status,
    { failure },
  )
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
  } catch (err) {
    // Any failure reading/parsing the body of a 2xx response is ambiguous, not just a
    // `SyntaxError` -- a truncated stream throws a plain connection error from `.json()` too, and
    // it is exactly as billing-ambiguous as malformed JSON.
    await latchUnknownBilledAttempt(options, err)
    throw new StructuredDecisionError(
      'invalid-response',
      'Provider returned malformed JSON.',
      undefined,
      { cause: err },
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
      transport: options.transport,
      requestStartedAt: options.requestStartedAt,
    })
  }
  const isOpenRouter = options.transport === 'openrouter'
  return decodeResult(raw, options.request, {
    fallbackProvider: options.dispatch.provider,
    isExpectedModel: model => (isOpenRouter ? OPENROUTER_MODEL : TYPESAFE_MODEL).test(model),
    isExpectedProvider: provider => !isOpenRouter || provider === 'TypeSafe',
  })
}

async function latchUnknownBilledAttempt(options: AttemptOptions, error: unknown): Promise<void> {
  await options.hooks?.onUnknownBilledAttempt?.({
    requestStartedAt: options.requestStartedAt,
    error,
  })
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason
}
