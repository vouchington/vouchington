import { getRetryAfterDurationMs, isNetworkError } from '@modules/utils/http'
import type { Response } from 'undici'
import { decodeResult } from './decode.mts'
import { createTransportRequest, fetchStructuredDecisionProvider } from './transport.mts'
import {
  StructuredDecisionError,
  type CreateStructuredDecisionClientOptions,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionRequest,
  type StructuredDecisionResult,
  type StructuredDecisionSleep,
} from './types.mts'
import { validateRequest } from './validation.mts'

const MAX_ATTEMPTS = 3
export function createStructuredDecisionClient(
  options: CreateStructuredDecisionClientOptions,
): StructuredDecisionClient {
  if (options.apiKey.trim().length === 0)
    throw new StructuredDecisionError(
      'invalid-request',
      'A structured-decision API key is required.',
    )
  const fetch = options.fetch ?? fetchStructuredDecisionProvider
  const sleep = options.sleep ?? sleepWithAbort
  return {
    decide: async (request, signal) => {
      validateRequest(request)
      throwIfAborted(signal)
      const dispatch = createTransportRequest(options.transport, options.apiKey, request)
      return attemptDecision({
        attempt: 1,
        dispatch,
        fetch,
        request,
        signal,
        sleep,
        transport: options.transport,
      })
    },
  }
}
type AttemptOptions = {
  attempt: number
  dispatch: ReturnType<typeof createTransportRequest>
  fetch: StructuredDecisionFetch
  request: StructuredDecisionRequest
  signal?: AbortSignal
  sleep: StructuredDecisionSleep
  transport: CreateStructuredDecisionClientOptions['transport']
}
async function attemptDecision(options: AttemptOptions): Promise<StructuredDecisionResult> {
  try {
    const response = await options.fetch(options.dispatch.url, {
      method: 'POST',
      headers: options.dispatch.headers,
      body: JSON.stringify(options.dispatch.body),
      signal: options.signal,
    })
    if (!response.ok) return retryResponse(response, options)
    return decodeResult(
      await readJson(response),
      options.request,
      options.transport,
      options.dispatch.provider,
    )
  } catch (error) {
    if (error instanceof StructuredDecisionError) throw error
    throwIfAborted(options.signal)
    if (isNetworkError(error) && options.attempt < MAX_ATTEMPTS) {
      await options.sleep(100 * 2 ** (options.attempt - 1), options.signal)
      return attemptDecision({ ...options, attempt: options.attempt + 1 })
    }
    throw new StructuredDecisionError(
      'provider-error',
      'Structured-decision transport failed.',
      undefined,
      { cause: error },
    )
  }
}
async function retryResponse(
  response: Response,
  options: AttemptOptions,
): Promise<StructuredDecisionResult> {
  const error = new StructuredDecisionError(
    'provider-error',
    `Structured-decision provider returned HTTP ${response.status}.`,
    response.status,
  )
  await cancelBody(response)
  if (!isRetryableStatus(response.status) || options.attempt >= MAX_ATTEMPTS) throw error
  await options.sleep(retryAfterMs(response), options.signal)
  return attemptDecision({ ...options, attempt: options.attempt + 1 })
}
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new StructuredDecisionError(
      'invalid-response',
      'Provider returned malformed JSON.',
      undefined,
      { cause: error },
    )
  }
}
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 529 || status >= 500
}
function retryAfterMs(response: Response): number {
  return Math.min(getRetryAfterDurationMs(response.headers.get('retry-after')) ?? 100, 5_000)
}
async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // Best-effort connection cleanup must not replace the provider outcome.
  }
}
async function sleepWithAbort(durationMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onAbort = () => {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(signal?.reason)
    }
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, durationMs)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason
}
