import type {
  ResponseCreateParamsStreaming,
  ResponseInput,
  ResponseInputItem,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses'
import onError from '@modules/on-error'
import {
  getBackgroundResponseHooks,
  type BackgroundResponseLease,
} from './background-response-context.mts'
import { cancelOpenAIResponse } from './background-response-teardown.mts'
import { getOpenAIResponseAttemptHooks } from './response-attempt-context.mts'
import {
  OpenAIResponseNotCompletedError,
  OpenAIResponseStreamError,
  OpenAIResponseStreamIterationError,
  shouldLatchUnknownBilledOpenAIAttempt,
} from './response-errors.mts'
import { createOpenAIResponseWithRetries } from './response-retry.mts'
import { validateCompletedResponse, type OpenAIResponse } from './validate-completed-response.mts'

export * from './background-response-context.mts'
export * from './background-response-teardown.mts'
export * from './response-attempt-context.mts'
export * from './response-errors.mts'
export * from './validate-completed-response.mts'

type RawCreateParams = Parameters<typeof import('./client.mts').default.responses.create>[0]
type RawCreateOptions = Parameters<typeof import('./client.mts').default.responses.create>[1]
export type { ResponseStreamEvent }
export type ResponseStreamLike = AsyncIterable<ResponseStreamEvent>

export type OpenAIResponseInput = string | ResponseInput
export type OpenAIResponseInputItem = ResponseInputItem
// `background` is deliberately not part of the caller-visible params (#8836): streamOpenAIResponse
// always creates in the foreground (chat's TTFT budget can't absorb the ~4.5s background queueing
// delay measured in the background-mode spike, written up in the private
// vouchington/vouchington-docs repository) and createOpenAIResponse always creates in the
// background (durability against worker crashes/redeploys). Which one runs where is a two-call-site
// fact baked into this file, not a per-caller choice that could silently drift.
export type CreateResponseParams = Omit<RawCreateParams, 'input' | 'background'> & {
  input: OpenAIResponseInput
}

/* no-mistakes: integration=openai */
export async function createOpenAIResponse(
  params: CreateResponseParams,
  options?: RawCreateOptions,
): Promise<OpenAIResponse> {
  const response = await createOpenAIResponseStream(params, true, options)
  return await drainBackgroundOpenAIResponse(response.stream, response.requestStartedAt)
}

/* no-mistakes: integration=openai */
export function streamOpenAIResponse(
  params: CreateResponseParams,
  options?: RawCreateOptions,
): AsyncGenerator<{ delta: string }, OpenAIResponse> {
  return (async function* () {
    const response = await createOpenAIResponseStream(params, false, options)
    try {
      return yield* streamOpenAIResponseEvents(response.stream)
    } catch (error) {
      if (shouldLatchUnknownBilledOpenAIAttempt(error)) {
        await getOpenAIResponseAttemptHooks()?.onUnknownBilledAttempt({
          requestStartedAt: response.requestStartedAt,
          error,
        })
      }
      throw error
    }
  })()
}

/* no-mistakes: integration=openai */
async function createOpenAIResponseStream(
  params: CreateResponseParams,
  background: boolean,
  options?: RawCreateOptions,
): Promise<{ stream: ResponseStreamLike; requestStartedAt: Date }> {
  const streamParams: ResponseCreateParamsStreaming = { ...params, stream: true, background }
  return await createOpenAIResponseWithRetries(streamParams, options)
}

export async function* streamOpenAIResponseEvents(
  stream: ResponseStreamLike,
  onResponseId?: (responseId: string) => void | Promise<void>,
): AsyncGenerator<{ delta: string }, OpenAIResponse> {
  let emittedTextDelta = false
  let reportedResponseId = false
  for await (const event of iterateOpenAIResponseStream(stream, () => emittedTextDelta)) {
    if (!reportedResponseId && event.type === 'response.created') {
      reportedResponseId = true
      await onResponseId?.(event.response.id)
    }
    if (event.type === 'response.output_text.delta') {
      emittedTextDelta = true
      yield { delta: event.delta }
      continue
    }
    if (event.type === 'error') {
      throw new OpenAIResponseStreamError(event)
    }
    if (
      event.type === 'response.completed' ||
      event.type === 'response.failed' ||
      event.type === 'response.incomplete'
    ) {
      const response = validateCompletedResponse(event.response)
      // response.output_text is always populated by validateCompletedResponse (recomputed from
      // `output`, not trusted from the SDK -- see the comment on computeOutputText). If no delta
      // was ever streamed, this is the only place the caller gets the text from.
      if (!emittedTextDelta && response.output_text) yield { delta: response.output_text }
      return response
    }
  }
  throw new Error('OpenAI response stream ended without a terminal response')
}

/**
 * createOpenAIResponse's internal background stream consumer. Discards every delta —
 * createOpenAIResponse is the "give me the finished response" API, not a streaming one — and
 * reports the response id to whatever BackgroundResponseHooks are in scope (the agent-layer
 * usage-recording wrapper) as soon as it's known, via the AsyncLocalStorage context in
 * background-response-context.mts. On any failure after the id is known, cancels the response
 * before rethrowing so an aborted or crashed drain does not keep billing unattended.
 */
async function drainBackgroundOpenAIResponse(
  stream: ResponseStreamLike,
  requestStartedAt: Date,
): Promise<OpenAIResponse> {
  const hooks = getBackgroundResponseHooks()
  const attemptHooks = getOpenAIResponseAttemptHooks()
  let responseId: string | undefined
  let lease: BackgroundResponseLease | undefined
  const events = streamOpenAIResponseEvents(stream, async id => {
    responseId = id
    lease = await hooks?.onResponseCreated(id)
  })
  try {
    return await drainAsyncGenerator(events)
  } catch (cause) {
    // A response that reached a terminal failed/incomplete/cancelled status (e.g. max_output_tokens)
    // is already done billing — cancelling it is a wasted request on a routine path, exactly the RPM
    // cost this whole feature exists to avoid. Only an interrupted drain (abort, network failure,
    // process crash) -- or a response still queued/in_progress despite the error, matching the
    // sweeper's status check in reconcile.mts -- leaves a response worth cancelling.
    if (
      responseId &&
      (!(cause instanceof OpenAIResponseNotCompletedError) ||
        cause.status === 'queued' ||
        cause.status === 'in_progress')
    ) {
      await cancelOpenAIResponse(responseId).catch(onError)
    }
    if (!lease && shouldLatchUnknownBilledOpenAIAttempt(cause)) {
      await attemptHooks?.onUnknownBilledAttempt({ requestStartedAt, error: cause })
    }
    throw cause
  } finally {
    await lease?.stopAndSettle().catch(onError)
  }
}

async function drainAsyncGenerator<Yielded, Returned>(
  generator: AsyncGenerator<Yielded, Returned>,
): Promise<Returned> {
  let result = await generator.next()
  while (!result.done) {
    // oxlint-disable-next-line no-await-in-loop -- each .next() advances the SSE stream's cursor; it cannot resolve until the previous yield has
    result = await generator.next()
  }
  return result.value
}

async function* iterateOpenAIResponseStream(
  stream: ResponseStreamLike,
  hasEmittedTextDelta: () => boolean,
): AsyncGenerator<ResponseStreamEvent> {
  try {
    for await (const event of stream) yield event
  } catch (cause) {
    if (
      cause instanceof Error &&
      ['AbortError', 'APIUserAbortError', 'TimeoutError'].includes(cause.name)
    )
      throw cause
    throw new OpenAIResponseStreamIterationError(hasEmittedTextDelta(), { cause })
  }
}
