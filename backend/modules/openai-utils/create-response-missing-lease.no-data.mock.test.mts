import { describe, expect, it, vi } from 'vitest'
import { createOpenAIResponse, OpenAIResponseNotCompletedError } from './create-response.mts'
import { runWithBackgroundResponseHooks } from './background-response-context.mts'
import { runWithOpenAIResponseAttemptHooks } from './response-attempt-context.mts'
import {
  makeSdkResponse,
  makeStreamEvent,
} from '../../test-helpers/modules/openai-utils/responses.mts'

type CreateMock = (
  params: Parameters<typeof createOpenAIResponse>[0],
  options: Parameters<typeof createOpenAIResponse>[1],
) => Promise<unknown>

const openAIMocks = vi.hoisted(() => ({
  create: vi.fn<CreateMock>(),
  cancel: vi.fn<(responseId: string, options?: unknown) => Promise<unknown>>(),
}))

vi.mock<typeof import('openai')>(import('openai'), async importOriginal => ({
  ...(await importOriginal()),
  default: class MockOpenAI {
    responses = {
      create: openAIMocks.create,
      cancel: openAIMocks.cancel,
    } as unknown as typeof import('openai').default
  } as unknown as typeof import('openai').default,
}))

describe('background response drain without a durable lease', () => {
  it('awaits accounting uncertainty after response.created when lease acquisition returns undefined', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const cause = new Error('socket closed')
    const stream: AsyncIterable<ReturnType<typeof makeStreamEvent>> = {
      async *[Symbol.asyncIterator]() {
        yield makeStreamEvent({
          type: 'response.created',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'in_progress', id: 'resp-no-lease' }),
        })
        throw cause
      },
    }
    openAIMocks.create.mockResolvedValueOnce(stream)
    openAIMocks.cancel.mockResolvedValueOnce(makeSdkResponse({ status: 'cancelled' }))
    let uncertaintySettled = false
    const onUnknownBilledAttempt = vi.fn<(value: unknown) => Promise<void>>(async () => {
      await Promise.resolve()
      uncertaintySettled = true
    })

    await expect(
      runWithOpenAIResponseAttemptHooks(
        { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
        async () =>
          await runWithBackgroundResponseHooks(
            { onResponseCreated: () => Promise.resolve(undefined) },
            () => createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
          ),
      ),
    ).rejects.toMatchObject({ cause })

    expect(uncertaintySettled).toBe(true)
    expect(onUnknownBilledAttempt).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ error: expect.objectContaining({ cause }) }),
    )
    expect(openAIMocks.cancel).toHaveBeenCalledTimes(1)
  })

  it('latches a lease-less terminal failed response that omitted usage', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    openAIMocks.create.mockResolvedValueOnce({
      async *[Symbol.asyncIterator]() {
        yield makeStreamEvent({
          type: 'response.failed',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'failed', usage: undefined }),
        })
      },
    })
    const onUnknownBilledAttempt = vi.fn<(value: unknown) => Promise<void>>(async () => {})

    await expect(
      runWithOpenAIResponseAttemptHooks(
        { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
        () => createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
      ),
    ).rejects.toBeInstanceOf(OpenAIResponseNotCompletedError)

    expect(onUnknownBilledAttempt).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ error: expect.any(OpenAIResponseNotCompletedError) }),
    )
  })
})
