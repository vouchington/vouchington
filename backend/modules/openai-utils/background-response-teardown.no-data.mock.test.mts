import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelOpenAIResponse, retrieveOpenAIResponse } from './background-response-teardown.mts'
import { makeSdkResponse, makeSdkTextResponse } from './test-helpers/responses.mts'

type CancelMock = (responseId: string, options?: unknown) => Promise<unknown>
type RetrieveMock = (responseId: string, query: unknown, options?: unknown) => Promise<unknown>

const BACKGROUND_TEARDOWN_OPTIONS = { maxRetries: 0, timeout: 10_000 }

const openAIMocks = vi.hoisted(() => ({
  cancel: vi.fn<CancelMock>(),
  retrieve: vi.fn<RetrieveMock>(),
}))

vi.mock<typeof import('openai')>(import('openai'), () => ({
  default: class MockOpenAI {
    responses = {
      cancel: openAIMocks.cancel,
      retrieve: openAIMocks.retrieve,
    }
  } as unknown as typeof import('openai').default,
}))

describe('OpenAI background response teardown boundary', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    openAIMocks.cancel.mockReset()
    openAIMocks.retrieve.mockReset()
  })

  describe('cancelOpenAIResponse', () => {
    it('cancels with maxRetries: 0 and a short timeout, returning the raw SDK response', async () => {
      const response = makeSdkResponse({ status: 'cancelled' })
      openAIMocks.cancel.mockResolvedValueOnce(response)

      await expect(cancelOpenAIResponse('resp-1')).resolves.toBe(response)
      expect(openAIMocks.cancel).toHaveBeenCalledWith('resp-1', BACKGROUND_TEARDOWN_OPTIONS)
    })
  })

  describe('retrieveOpenAIResponse', () => {
    it('retrieves with maxRetries: 0 and a short timeout, returning the raw SDK response', async () => {
      const response = makeSdkTextResponse('hello')
      openAIMocks.retrieve.mockResolvedValueOnce(response)

      await expect(retrieveOpenAIResponse('resp-1')).resolves.toBe(response)
      expect(openAIMocks.retrieve).toHaveBeenCalledWith(
        'resp-1',
        undefined,
        BACKGROUND_TEARDOWN_OPTIONS,
      )
    })
  })
})
