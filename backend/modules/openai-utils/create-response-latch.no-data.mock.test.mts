import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamOpenAIResponse } from './create-response.mts'
import { runWithOpenAIResponseAttemptHooks } from './response-attempt-context.mts'
import { OpenAIResponseNotCompletedError } from './response-errors.mts'
import {
  makeErrorEvent,
  makeResponseStream,
  makeSdkResponse,
  makeStreamEvent,
} from './test-helpers/responses.mts'

type CreateMock = (
  params: Parameters<typeof streamOpenAIResponse>[0],
  options: Parameters<typeof streamOpenAIResponse>[1],
) => Promise<unknown>

const openAIMocks = vi.hoisted(() => ({ create: vi.fn<CreateMock>() }))

vi.mock<typeof import('openai')>(import('openai'), async importOriginal => ({
  ...(await importOriginal()),
  default: class MockOpenAI {
    responses = { create: openAIMocks.create } as unknown as typeof import('openai').default
  } as unknown as typeof import('openai').default,
}))

describe('OpenAI response stream latch decisions', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    openAIMocks.create.mockReset()
  })

  it('does not latch when the signal aborts during beforeAttempt', async () => {
    const controller = new AbortController()
    const onUnknownBilledAttempt = vi.fn<
      (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())

    await expect(
      runWithOpenAIResponseAttemptHooks(
        {
          beforeAttempt: async () => {
            controller.abort()
          },
          onUnknownBilledAttempt,
        },
        async () =>
          await streamOpenAIResponse(
            { model: 'gpt-4.1-mini', input: 'hello' },
            { signal: controller.signal },
          ).next(),
      ),
    ).rejects.toThrow('This operation was aborted')

    expect(openAIMocks.create).not.toHaveBeenCalled()
    expect(onUnknownBilledAttempt).not.toHaveBeenCalled()
  })

  it('latches a terminal failed stream that omitted usage', async () => {
    openAIMocks.create.mockResolvedValueOnce(
      makeResponseStream([
        makeStreamEvent({
          type: 'response.failed',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'failed', usage: undefined }),
        }),
      ]),
    )
    const onUnknownBilledAttempt = vi.fn<
      (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())

    await expect(
      runWithOpenAIResponseAttemptHooks(
        { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
        async () => await streamOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }).next(),
      ),
    ).rejects.toBeInstanceOf(OpenAIResponseNotCompletedError)

    expect(onUnknownBilledAttempt).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ error: expect.any(OpenAIResponseNotCompletedError) }),
    )
    const firstCall = onUnknownBilledAttempt.mock.calls[0]
    expect(firstCall).toBeDefined()
    const latchedError = firstCall[0].error
    expect(latchedError).toBeInstanceOf(OpenAIResponseNotCompletedError)
    if (!(latchedError instanceof OpenAIResponseNotCompletedError)) {
      throw new Error('expected OpenAIResponseNotCompletedError')
    }
    expect(latchedError.usage).toBeUndefined()
  })

  it('does not latch a terminal failed stream that carries usage', async () => {
    openAIMocks.create.mockResolvedValueOnce(
      makeResponseStream([
        makeStreamEvent({
          type: 'response.failed',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'failed' }),
        }),
      ]),
    )
    const onUnknownBilledAttempt = vi.fn<
      (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())

    await expect(
      runWithOpenAIResponseAttemptHooks(
        { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
        async () => await streamOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }).next(),
      ),
    ).rejects.toBeInstanceOf(OpenAIResponseNotCompletedError)

    expect(onUnknownBilledAttempt).not.toHaveBeenCalled()
  })

  it('does not latch a recoverable previous_response_not_found stream error', async () => {
    openAIMocks.create.mockResolvedValueOnce(
      makeResponseStream([
        makeErrorEvent({
          code: 'previous_response_not_found',
          message: 'The previous response expired',
          param: 'previous_response_id',
        }),
      ]),
    )
    const onUnknownBilledAttempt = vi.fn<
      (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())

    await expect(
      runWithOpenAIResponseAttemptHooks(
        { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
        async () => await streamOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }).next(),
      ),
    ).rejects.toMatchObject({
      code: 'previous_response_not_found',
      param: 'previous_response_id',
    })

    expect(onUnknownBilledAttempt).not.toHaveBeenCalled()
  })

  it('does not latch when the caller aborts an in-flight stream', async () => {
    const abort = new Error('This operation was aborted')
    abort.name = 'AbortError'
    const stream: AsyncIterable<ReturnType<typeof makeStreamEvent>> = {
      async *[Symbol.asyncIterator]() {
        yield makeStreamEvent({
          type: 'response.output_text.delta',
          content_index: 0,
          delta: 'partial',
          item_id: 'msg-test',
          logprobs: [],
          output_index: 0,
          sequence_number: 1,
        })
        throw abort
      },
    }
    openAIMocks.create.mockResolvedValueOnce(stream)
    const onUnknownBilledAttempt = vi.fn<
      (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())

    await runWithOpenAIResponseAttemptHooks(
      { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
      async () => {
        const generator = streamOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' })
        await expect(generator.next()).resolves.toEqual({
          done: false,
          value: { delta: 'partial' },
        })
        await expect(generator.next()).rejects.toBe(abort)
      },
    )

    expect(onUnknownBilledAttempt).not.toHaveBeenCalled()
  })
})
