import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenAI } from 'openai'

const openAIMocks = vi.hoisted(() => ({
  create:
    vi.fn<
      (
        params: OpenAI.Moderations.ModerationCreateParams,
        options?: OpenAI.RequestOptions,
      ) => Promise<OpenAI.Moderations.ModerationCreateResponse>
    >(),
}))

vi.mock<typeof import('openai')>(import('openai'), () => ({
  default: class MockOpenAI {
    moderations = { create: openAIMocks.create }
  } as unknown as typeof import('openai').default,
}))

import { requestOpenAIModeration } from './moderate.mts'

describe('OpenAI moderation integration boundary', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    openAIMocks.create.mockReset()
  })

  it('passes the idempotency key as an OpenAI SDK request option', async () => {
    const input = [{ type: 'text' as const, text: 'moderate this' }]
    openAIMocks.create.mockResolvedValueOnce({
      id: 'mod_test',
      model: 'omni-moderation-latest',
      results: [],
    })

    await requestOpenAIModeration(input, 'omni-moderation-latest', {
      idempotencyKey: 'moderation-key',
    })

    expect(openAIMocks.create).toHaveBeenCalledWith(
      { input, model: 'omni-moderation-latest' },
      { idempotencyKey: 'moderation-key' },
    )
  })

  it('bounds the complete moderation request and each provider attempt', async () => {
    const input = [{ type: 'text' as const, text: 'bounded moderation' }]
    const overallSignal = new AbortController().signal
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(overallSignal)
    openAIMocks.create.mockResolvedValueOnce({
      id: 'mod_bounded',
      model: 'omni-moderation-latest',
      results: [],
    })

    await requestOpenAIModeration(input, 'omni-moderation-latest', { apiSafetyCheck: true })

    expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000)
    expect(openAIMocks.create).toHaveBeenCalledExactlyOnceWith(
      { input, model: 'omni-moderation-latest' },
      { maxRetries: 1, timeout: 5_000, signal: overallSignal },
    )
    timeout.mockRestore()
  })

  it('leaves background moderation on the provider default deadline', async () => {
    const input = [{ type: 'text' as const, text: 'background moderation' }]
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    openAIMocks.create.mockResolvedValueOnce({
      id: 'mod_background',
      model: 'omni-moderation-latest',
      results: [],
    })

    await requestOpenAIModeration(input, 'omni-moderation-latest')

    expect(timeout).not.toHaveBeenCalled()
    expect(openAIMocks.create).toHaveBeenCalledExactlyOnceWith(
      { input, model: 'omni-moderation-latest' },
      {},
    )
    timeout.mockRestore()
  })
})
