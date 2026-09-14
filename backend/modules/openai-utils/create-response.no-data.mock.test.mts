import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOpenAIResponse,
  streamOpenAIResponse,
  OpenAIResponseNotCompletedError,
} from './create-response.mts'
import { runWithBackgroundResponseHooks } from './background-response-context.mts'
import { runWithOpenAIResponseAttemptHooks } from './response-attempt-context.mts'
import {
  makeResponseStream,
  makeSdkResponse,
  makeSdkTextResponse,
  makeStreamEvent,
} from '../../test-helpers/modules/openai-utils/responses.mts'

type CreateMock = (
  params: Parameters<typeof createOpenAIResponse>[0],
  options: Parameters<typeof createOpenAIResponse>[1],
) => Promise<unknown>
type CancelMock = (responseId: string, options?: unknown) => Promise<unknown>

const BACKGROUND_TEARDOWN_OPTIONS = { maxRetries: 0, timeout: 10_000 }

const openAIMocks = vi.hoisted(() => ({
  create: vi.fn<CreateMock>(),
  cancel: vi.fn<CancelMock>(),
}))

vi.mock<typeof import('openai')>(import('openai'), async importOriginal => ({
  ...(await importOriginal()),
  default: class MockOpenAI {
    responses = {
      create: openAIMocks.create,
      cancel: openAIMocks.cancel,
    }
  } as unknown as typeof import('openai').default,
}))

describe('OpenAI response integration boundary', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    openAIMocks.create.mockReset()
    openAIMocks.cancel.mockReset()
  })

  describe('createOpenAIResponse', () => {
    it('creates in the background and drains the stream to the app projection', async () => {
      const response = makeSdkTextResponse('answer', { service_tier: 'flex' })
      const input = [
        { type: 'message' as const, role: 'user' as const, content: 'Question' },
        { type: 'message' as const, role: 'assistant' as const, content: 'Answer' },
      ]
      openAIMocks.create.mockResolvedValueOnce(
        makeResponseStream([
          makeStreamEvent({
            type: 'response.created',
            sequence_number: 1,
            response: makeSdkResponse({ status: 'in_progress' }),
          }),
          makeStreamEvent({ type: 'response.completed', sequence_number: 2, response }),
        ]),
      )

      await expect(createOpenAIResponse({ model: 'gpt-4.1-mini', input })).resolves.toEqual({
        id: response.id,
        model: response.model,
        status: 'completed',
        output: response.output,
        output_text: 'answer',
        usage: response.usage,
        service_tier: 'flex',
      })

      expect(openAIMocks.create).toHaveBeenCalledWith(
        { model: 'gpt-4.1-mini', input, stream: true, background: true },
        { maxRetries: 0 },
      )
      // The happy path is exactly one OpenAI request -- the whole point of draining a background
      // stream instead of polling (#8836's rate-limit constraint). MockOpenAI above never defines
      // a `retrieve` method, so any accidental call to it would already throw synchronously; this
      // asserts the `create` side of the same guarantee explicitly rather than relying only on
      // toHaveBeenCalledWith, which does not bound the call count on its own.
      expect(openAIMocks.create).toHaveBeenCalledTimes(1)
      expect(openAIMocks.cancel).not.toHaveBeenCalled()
    })

    it('throws failed responses carrying the billed usage on the error, without cancelling', async () => {
      const response = makeSdkResponse({
        status: 'failed',
        error: { code: 'invalid_prompt', message: 'prompt rejected' },
        service_tier: 'flex',
      })
      openAIMocks.create.mockResolvedValueOnce(
        makeResponseStream([
          makeStreamEvent({
            type: 'response.created',
            sequence_number: 1,
            response: makeSdkResponse({ status: 'in_progress' }),
          }),
          makeStreamEvent({ type: 'response.failed', sequence_number: 2, response }),
        ]),
      )

      const error: unknown = await createOpenAIResponse({
        model: 'gpt-4.1-mini',
        input: 'hello',
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(OpenAIResponseNotCompletedError)
      const notCompleted = error as OpenAIResponseNotCompletedError
      expect(notCompleted.code).toBe('invalid_prompt')
      expect(notCompleted.status).toBe('failed')
      expect(notCompleted.usage).toEqual(response.usage)
      expect(notCompleted.model).toBe(response.model)
      expect(notCompleted.service_tier).toBe('flex')
      // A terminal failed response has already finished billing -- cancelling it would waste a
      // request on a routine path (e.g. every prompt the model refuses).
      expect(openAIMocks.cancel).not.toHaveBeenCalled()
    })

    it('throws incomplete responses carrying the billed usage on the error, without cancelling', async () => {
      const response = makeSdkResponse({
        status: 'incomplete',
        incomplete_details: { reason: 'content_filter' },
        service_tier: 'default',
      })
      openAIMocks.create.mockResolvedValueOnce(
        makeResponseStream([
          makeStreamEvent({
            type: 'response.created',
            sequence_number: 1,
            response: makeSdkResponse({ status: 'in_progress' }),
          }),
          makeStreamEvent({ type: 'response.incomplete', sequence_number: 2, response }),
        ]),
      )

      const error: unknown = await createOpenAIResponse({
        model: 'gpt-4.1-mini',
        input: 'hello',
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(OpenAIResponseNotCompletedError)
      const notCompleted = error as OpenAIResponseNotCompletedError
      expect(notCompleted.reason).toBe('content_filter')
      expect(notCompleted.status).toBe('incomplete')
      expect(notCompleted.usage).toEqual(response.usage)
      expect(notCompleted.model).toBe(response.model)
      expect(notCompleted.service_tier).toBe('default')
      // max_output_tokens and similar are routine terminal outcomes, not interrupted drains.
      expect(openAIMocks.cancel).not.toHaveBeenCalled()
    })

    it('cancels the response when stream iteration fails after the response is created', async () => {
      const cause = new Error('socket closed')
      const failingStream: AsyncIterable<ReturnType<typeof makeStreamEvent>> = {
        async *[Symbol.asyncIterator]() {
          yield makeStreamEvent({
            type: 'response.created',
            sequence_number: 1,
            response: makeSdkResponse({ status: 'in_progress', id: 'resp-abc' }),
          })
          throw cause
        },
      }
      openAIMocks.create.mockResolvedValueOnce(failingStream)
      openAIMocks.cancel.mockResolvedValueOnce(
        makeSdkResponse({ status: 'cancelled', id: 'resp-abc' }),
      )

      const stopAndSettle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const onResponseCreated = vi
        .fn<(responseId: string) => Promise<{ stopAndSettle: () => Promise<void> }>>()
        .mockResolvedValue({ stopAndSettle })
      const onUnknownBilledAttempt = vi.fn<
        (attempt: { requestStartedAt: Date; error: unknown }) => Promise<void>
      >(() => Promise.resolve())
      await expect(
        runWithOpenAIResponseAttemptHooks(
          { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
          async () =>
            await runWithBackgroundResponseHooks({ onResponseCreated }, () =>
              createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
            ),
        ),
      ).rejects.toMatchObject({
        message: 'OpenAI response stream iteration failed before any text delta was emitted',
        cause,
      })

      expect(onResponseCreated).toHaveBeenCalledExactlyOnceWith('resp-abc')
      expect(openAIMocks.cancel).toHaveBeenCalledWith('resp-abc', BACKGROUND_TEARDOWN_OPTIONS)
      expect(stopAndSettle).toHaveBeenCalledTimes(1)
      expect(onUnknownBilledAttempt).not.toHaveBeenCalled()
    })

    it('does not cancel when the stream fails before any response id is known', async () => {
      const cause = new Error('connection refused')
      // Not a generator -- a hand-rolled iterator whose next() rejects immediately. Simulating
      // this with `async *[Symbol.asyncIterator]() { throw cause }` would never reach a `yield`,
      // which the require-yield lint rule (correctly) flags as suspicious elsewhere.
      const failingStream: AsyncIterable<ReturnType<typeof makeStreamEvent>> = {
        [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(cause) }),
      }
      openAIMocks.create.mockResolvedValueOnce(failingStream)

      const onUnknownBilledAttempt = vi.fn<
        (attempt: { requestStartedAt: Date; error: unknown }) => Promise<void>
      >(() => Promise.resolve())
      await expect(
        runWithOpenAIResponseAttemptHooks(
          { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
          () => createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
        ),
      ).rejects.toMatchObject({ cause })

      expect(openAIMocks.cancel).not.toHaveBeenCalled()
      expect(onUnknownBilledAttempt).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ error: expect.objectContaining({ cause }) }),
      )
    })

    it('does not throw when no BackgroundResponseHooks are in scope', async () => {
      const response = makeSdkTextResponse('hello')
      openAIMocks.create.mockResolvedValueOnce(
        makeResponseStream([
          makeStreamEvent({ type: 'response.completed', sequence_number: 1, response }),
        ]),
      )

      await expect(
        createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
      ).resolves.toMatchObject({ id: response.id })
    })
  })

  describe('streamOpenAIResponse', () => {
    it('creates in the foreground, deferring SDK stream creation until iteration', async () => {
      const params = { model: 'gpt-4.1-mini', input: 'hello' } as Parameters<
        typeof streamOpenAIResponse
      >[0]
      const options = { timeout: 1000 } as Parameters<typeof streamOpenAIResponse>[1]
      const response = makeSdkTextResponse('hello')
      openAIMocks.create.mockResolvedValueOnce(
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

      const gen = streamOpenAIResponse(params, options)
      expect(openAIMocks.create).not.toHaveBeenCalled()
      await expect(gen.next()).resolves.toEqual({ done: false, value: { delta: 'hello' } })
      await expect(gen.next()).resolves.toEqual({
        done: true,
        value: expect.objectContaining({ id: response.id, status: 'completed' }),
      })
      expect(openAIMocks.create).toHaveBeenCalledWith(
        { ...params, stream: true, background: false },
        { ...options, maxRetries: 0 },
      )
      expect(openAIMocks.cancel).not.toHaveBeenCalled()
    })
  })
})
