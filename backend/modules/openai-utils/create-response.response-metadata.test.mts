import { describe, expect, it, vi } from 'vitest'
import { streamOpenAIResponseEvents, OpenAIResponseNotCompletedError } from './create-response.mts'
import {
  makeResponseStream,
  makeSdkResponse,
  makeSdkTextResponse,
  makeStreamEvent,
} from '../../test-helpers/modules/openai-utils/responses.mts'

describe('streamOpenAIResponseEvents response metadata', () => {
  it.each(['queued', 'in_progress', 'cancelled', undefined] as const)(
    'rejects a completed-type event whose response carries the unexpected status %s',
    async status => {
      // Defensive parsing: validateCompletedResponse re-checks response.status itself rather than
      // trusting the event.type — this is what makes a cancelled response unreachable through the
      // normal create-and-stream path (cancellation only ever arrives via cancelOpenAIResponse's
      // own return value, never through this event stream).
      const response = makeSdkResponse({ status })
      const gen = streamOpenAIResponseEvents(
        makeResponseStream([
          makeStreamEvent({ type: 'response.completed', sequence_number: 1, response }),
        ]),
      )

      const error: unknown = await gen.next().catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(OpenAIResponseNotCompletedError)
      const notCompleted = error as OpenAIResponseNotCompletedError
      expect(notCompleted.status).toBe(status ?? 'missing')
      expect(notCompleted.usage).toEqual(response.usage)
    },
  )

  it('reports the response id via onResponseId as soon as response.created arrives', async () => {
    const response = makeSdkTextResponse('hello')
    const onResponseId = vi.fn<(responseId: string) => void>()
    const gen = streamOpenAIResponseEvents(
      makeResponseStream([
        makeStreamEvent({
          type: 'response.created',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'in_progress', id: 'resp-early' }),
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
      onResponseId,
    )

    await gen.next()
    expect(onResponseId).toHaveBeenCalledExactlyOnceWith('resp-early')
    await gen.next()
    expect(onResponseId).toHaveBeenCalledOnce()
  })

  it('does not report the response id a second time for a duplicate response.created event', async () => {
    const response = makeSdkTextResponse('hello')
    const onResponseId = vi.fn<(responseId: string) => void>()
    const gen = streamOpenAIResponseEvents(
      makeResponseStream([
        makeStreamEvent({
          type: 'response.created',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'in_progress', id: 'resp-first' }),
        }),
        makeStreamEvent({
          type: 'response.created',
          sequence_number: 2,
          response: makeSdkResponse({ status: 'in_progress', id: 'resp-second' }),
        }),
        makeStreamEvent({ type: 'response.completed', sequence_number: 3, response }),
      ]),
      onResponseId,
    )

    await gen.next()
    expect(onResponseId).toHaveBeenCalledExactlyOnceWith('resp-first')
  })
})
