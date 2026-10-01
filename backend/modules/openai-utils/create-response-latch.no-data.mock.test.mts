import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpenAIResponse } from './create-response.mts'
import { runWithOpenAIResponseAttemptHooks } from './response-attempt-context.mts'
import { OpenAIResponseNotCompletedError } from './response-errors.mts'
import {
  makeErrorEvent,
  makeResponseStream,
  makeSdkResponse,
  makeStreamEvent,
} from '../../test-helpers/modules/openai-utils/responses.mts'

type CreateMock = (
  params: Parameters<typeof createOpenAIResponse>[0],
  options: Parameters<typeof createOpenAIResponse>[1],
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
          createOpenAIResponse(
            { model: 'gpt-4.1-mini', input: 'hello' },
            { signal: controller.signal },
          ),
      ),
    ).rejects.toThrow('This operation was aborted')

    expect(openAIMocks.create).not.toHaveBeenCalled()
    expect(onUnknownBilledAttempt).not.toHaveBeenCalled()
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
        async () => createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
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
        async () => createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
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

    await expect(
      runWithOpenAIResponseAttemptHooks(
        { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
        () => createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
      ),
    ).rejects.toBe(abort)

    expect(onUnknownBilledAttempt).not.toHaveBeenCalled()
  })
})
