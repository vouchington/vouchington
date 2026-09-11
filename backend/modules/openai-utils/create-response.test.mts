import { describe, expect, it } from 'vitest'
import {
  streamOpenAIResponseEvents,
  OpenAIResponseNotCompletedError,
  type ResponseStreamEvent,
} from './create-response.mts'
import {
  makeErrorEvent,
  makeResponseStream,
  makeSdkResponse,
  makeSdkTextResponse,
  makeStreamEvent,
} from './test-helpers/responses.mts'

describe('streamOpenAIResponseEvents', () => {
  it.each(['AbortError', 'APIUserAbortError', 'TimeoutError'])(
    'rethrows %s cancellation by identity before a text delta',
    async name => {
      const cancellation = new Error('cancelled')
      cancellation.name = name
      const gen = streamOpenAIResponseEvents(makeFailingResponseStream([], cancellation))

      await expect(gen.next()).rejects.toBe(cancellation)
    },
  )

  it.each(['AbortError', 'APIUserAbortError', 'TimeoutError'])(
    'rethrows %s cancellation by identity after a text delta',
    async name => {
      const cancellation = new Error('cancelled')
      cancellation.name = name
      const delta = makeStreamEvent({
        type: 'response.output_text.delta',
        content_index: 0,
        delta: 'partial',
        item_id: 'msg-test',
        logprobs: [],
        output_index: 0,
        sequence_number: 1,
      })
      const gen = streamOpenAIResponseEvents(makeFailingResponseStream([delta], cancellation))

      await expect(gen.next()).resolves.toEqual({
        done: false,
        value: { delta: 'partial' },
      })
      await expect(gen.next()).rejects.toBe(cancellation)
    },
  )

  it('wraps an iterator failure before any text delta with its cause', async () => {
    const cause = new Error('socket closed')
    const gen = streamOpenAIResponseEvents(makeFailingResponseStream([], cause))

    await expect(gen.next()).rejects.toMatchObject({
      message: 'OpenAI response stream iteration failed before any text delta was emitted',
      cause,
    })
  })

  it('wraps an iterator failure after a text delta with its cause', async () => {
    const cause = new Error('socket closed')
    const delta = makeStreamEvent({
      type: 'response.output_text.delta',
      content_index: 0,
      delta: 'partial',
      item_id: 'msg-test',
      logprobs: [],
      output_index: 0,
      sequence_number: 1,
    })
    const gen = streamOpenAIResponseEvents(makeFailingResponseStream([delta], cause))

    await expect(gen.next()).resolves.toEqual({ done: false, value: { delta: 'partial' } })
    await expect(gen.next()).rejects.toMatchObject({
      message: 'OpenAI response stream iteration failed after at least one text delta was emitted',
      cause,
    })
  })

  it('yields completed response text when the stream has no text deltas', async () => {
    const response = makeSdkTextResponse('hello')
    const gen = streamOpenAIResponseEvents(
      makeResponseStream([
        makeStreamEvent({ type: 'response.completed', sequence_number: 1, response }),
      ]),
    )

    await expect(gen.next()).resolves.toEqual({ done: false, value: { delta: 'hello' } })
    await expect(gen.next()).resolves.toEqual({
      done: true,
      value: expect.objectContaining({ id: response.id, status: 'completed' }),
    })
  })

  it('does not duplicate completed response text after text deltas', async () => {
    const response = makeSdkTextResponse('hello')
    const gen = streamOpenAIResponseEvents(
      makeResponseStream([
        makeStreamEvent({
          type: 'response.output_text.delta',
          content_index: 0,
          delta: 'hello',
          item_id: 'msg-test',
          logprobs: [],
          output_index: 0,
          sequence_number: 1,
        }),
        makeStreamEvent({ type: 'response.completed', sequence_number: 2, response }),
      ]),
    )

    await expect(gen.next()).resolves.toEqual({ done: false, value: { delta: 'hello' } })
    await expect(gen.next()).resolves.toEqual({
      done: true,
      value: expect.objectContaining({ id: response.id, status: 'completed' }),
    })
  })

  it('ignores a real nonterminal SDK event while preserving text deltas', async () => {
    const response = makeSdkTextResponse('hello')
    const gen = streamOpenAIResponseEvents(
      makeResponseStream([
        makeStreamEvent({
          type: 'response.in_progress',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'in_progress' }),
        }),
        makeStreamEvent({
          type: 'response.output_text.delta',
          content_index: 0,
          delta: 'hello',
          item_id: 'msg-test',
          logprobs: [],
          output_index: 0,
          sequence_number: 2,
        }),
        makeStreamEvent({ type: 'response.completed', sequence_number: 3, response }),
      ]),
    )

    await expect(gen.next()).resolves.toEqual({ done: false, value: { delta: 'hello' } })
    await expect(gen.next()).resolves.toEqual({
      done: true,
      value: expect.objectContaining({ id: response.id, status: 'completed' }),
    })
  })

  it('throws a failed terminal response error carrying billed usage after already-yielded text', async () => {
    const response = makeSdkResponse({
      status: 'failed',
      error: { code: 'server_error', message: 'provider failed' },
      service_tier: 'flex',
    })
    const gen = streamOpenAIResponseEvents(
      makeResponseStream([
        makeStreamEvent({
          type: 'response.output_text.delta',
          content_index: 0,
          delta: 'partial',
          item_id: 'msg-test',
          logprobs: [],
          output_index: 0,
          sequence_number: 1,
        }),
        makeStreamEvent({ type: 'response.failed', sequence_number: 2, response }),
      ]),
    )

    await expect(gen.next()).resolves.toEqual({ done: false, value: { delta: 'partial' } })
    const error: unknown = await gen.next().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(OpenAIResponseNotCompletedError)
    const notCompleted = error as OpenAIResponseNotCompletedError
    expect(notCompleted.code).toBe('server_error')
    expect(notCompleted.status).toBe('failed')
    expect(notCompleted.usage).toEqual(response.usage)
    expect(notCompleted.model).toBe(response.model)
    expect(notCompleted.service_tier).toBe('flex')
  })

  it('throws an incomplete terminal response error carrying billed usage', async () => {
    const response = makeSdkResponse({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      service_tier: 'default',
    })
    const gen = streamOpenAIResponseEvents(
      makeResponseStream([
        makeStreamEvent({ type: 'response.incomplete', sequence_number: 1, response }),
      ]),
    )

    const error: unknown = await gen.next().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(OpenAIResponseNotCompletedError)
    const notCompleted = error as OpenAIResponseNotCompletedError
    expect(notCompleted.reason).toBe('max_output_tokens')
    expect(notCompleted.status).toBe('incomplete')
    expect(notCompleted.usage).toEqual(response.usage)
    expect(notCompleted.service_tier).toBe('default')
  })

  it('throws raw OpenAI stream error events', async () => {
    const gen = streamOpenAIResponseEvents(makeResponseStream([makeErrorEvent()]))

    await expect(gen.next()).rejects.toThrow('OpenAI response error (rate_limit): try later')
  })

  it('fails when the stream ends without a terminal event', async () => {
    const gen = streamOpenAIResponseEvents(
      makeResponseStream([
        makeStreamEvent({
          type: 'response.in_progress',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'in_progress' }),
        }),
      ]),
    )

    await expect(gen.next()).rejects.toThrow(
      'OpenAI response stream ended without a terminal response',
    )
  })
})

function makeFailingResponseStream(
  events: ResponseStreamEvent[],
  error: Error,
): AsyncIterable<ResponseStreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event
      throw error
    },
  }
}
