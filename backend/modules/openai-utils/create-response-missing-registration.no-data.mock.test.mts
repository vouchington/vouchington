import { describe, expect, it, vi } from 'vitest'
import { createOpenAIResponse } from './create-response.mts'
import { OpenAIResponseNotCompletedError } from '@vouchington/ai/openai'
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

describe('background response drain without durable registration', () => {
  it('cancels a response after registration returns false', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const cause = new Error('socket closed')
    const stream: AsyncIterable<ReturnType<typeof makeStreamEvent>> = {
      async *[Symbol.asyncIterator]() {
        yield makeStreamEvent({
          type: 'response.created',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'in_progress', id: 'resp-no-registration' }),
        })
        throw cause
      },
    }
    openAIMocks.create.mockResolvedValueOnce(stream)
    openAIMocks.cancel.mockResolvedValueOnce(makeSdkResponse({ status: 'cancelled' }))

    await expect(
      runWithOpenAIResponseAttemptHooks({ beforeAttempt: () => Promise.resolve() }, async () =>
        runWithBackgroundResponseHooks({ onResponseCreated: () => Promise.resolve(false) }, () =>
          createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
        ),
      ),
    ).rejects.toMatchObject({ cause })

    expect(openAIMocks.cancel).toHaveBeenCalledTimes(1)
  })

  it('rejects an unregistered terminal failed response that omitted usage', async () => {
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

    await expect(
      runWithOpenAIResponseAttemptHooks({ beforeAttempt: () => Promise.resolve() }, () =>
        createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
      ),
    ).rejects.toBeInstanceOf(OpenAIResponseNotCompletedError)
  })
})
