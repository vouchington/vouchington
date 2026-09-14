import { APIError, APIUserAbortError } from 'openai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamOpenAIResponse } from './create-response.mts'
import { runWithOpenAIResponseAttemptHooks } from './response-attempt-context.mts'
import {
  makeResponseStream,
  makeSdkTextResponse,
  makeStreamEvent,
} from '../../test-helpers/modules/openai-utils/responses.mts'

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

describe('OpenAI response attempt accounting boundary', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    openAIMocks.create.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the caller retry budget for free flex retries while forcing SDK retries to zero', async () => {
    const params = { model: 'gpt-4.1-mini', input: 'hello' } as Parameters<
      typeof streamOpenAIResponse
    >[0]
    const options = { maxRetries: 1 } as Parameters<typeof streamOpenAIResponse>[1]
    const flexUnavailable = new APIError(
      429,
      { code: 'resource_unavailable', message: 'Resource Unavailable' },
      'Resource Unavailable',
      new Headers(),
    )
    openAIMocks.create.mockRejectedValueOnce(flexUnavailable).mockResolvedValueOnce(
      makeResponseStream([
        makeStreamEvent({
          type: 'response.completed',
          sequence_number: 1,
          response: makeSdkTextResponse('ok'),
        }),
      ]),
    )
    const beforeAttempt = vi.fn<
      (value: { attempt: number; requestStartedAt: Date }) => Promise<void>
    >(() => Promise.resolve())
    vi.useFakeTimers()

    const result = runWithOpenAIResponseAttemptHooks(
      { beforeAttempt, onUnknownBilledAttempt: () => Promise.resolve() },
      async () => {
        const generator = streamOpenAIResponse(params, options)
        const first = generator.next()
        await vi.runAllTimersAsync()
        await first
        return await generator.next()
      },
    )

    await expect(result).resolves.toMatchObject({ done: true })
    expect(openAIMocks.create).toHaveBeenCalledTimes(2)
    expect(openAIMocks.create).toHaveBeenLastCalledWith(
      { ...params, stream: true, background: false },
      { maxRetries: 0 },
    )
    expect(beforeAttempt).toHaveBeenNthCalledWith(1, expect.objectContaining({ attempt: 1 }))
    expect(beforeAttempt).toHaveBeenNthCalledWith(2, expect.objectContaining({ attempt: 2 }))
  })

  it('latches an ordinary create failure and never sends a second physical request', async () => {
    const error = new APIError(
      429,
      { code: 'rate_limit_exceeded' },
      'Rate limit exceeded',
      new Headers(),
    )
    openAIMocks.create.mockRejectedValueOnce(error)
    const onUnknownBilledAttempt = vi.fn<
      (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())

    await expect(
      runWithOpenAIResponseAttemptHooks(
        { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
        async () => await streamOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }).next(),
      ),
    ).rejects.toBe(error)

    expect(openAIMocks.create).toHaveBeenCalledTimes(1)
    expect(onUnknownBilledAttempt).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ error }),
    )
  })

  it('throws an exhausted flex resource-unavailable error without latching it', async () => {
    const error = new APIError(
      429,
      { code: 'resource_unavailable', message: 'Resource Unavailable' },
      'Resource Unavailable',
      new Headers(),
    )
    openAIMocks.create.mockRejectedValue(error)
    const onUnknownBilledAttempt = vi.fn<
      (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())
    vi.useFakeTimers()

    const result = runWithOpenAIResponseAttemptHooks(
      { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
      async () => await streamOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }).next(),
    )
    const resultRejection = result.catch((error: unknown) => error)
    await vi.runAllTimersAsync()

    await expect(resultRejection).resolves.toBe(error)
    expect(openAIMocks.create).toHaveBeenCalledTimes(3)
    expect(onUnknownBilledAttempt).not.toHaveBeenCalled()
  })

  it('does not latch a non-billed bad request error', async () => {
    const error = new APIError(400, { code: 'invalid_request_error' }, 'Bad request', new Headers())
    openAIMocks.create.mockRejectedValueOnce(error)
    const onUnknownBilledAttempt = vi.fn<
      (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())

    await expect(
      runWithOpenAIResponseAttemptHooks(
        { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
        async () => await streamOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }).next(),
      ),
    ).rejects.toBe(error)

    expect(openAIMocks.create).toHaveBeenCalledTimes(1)
    expect(onUnknownBilledAttempt).not.toHaveBeenCalled()
  })

  it('does not latch an APIUserAbortError from create after dispatch', async () => {
    const error = new APIUserAbortError()
    openAIMocks.create.mockRejectedValueOnce(error)
    const onUnknownBilledAttempt = vi.fn<
      (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())

    await expect(
      runWithOpenAIResponseAttemptHooks(
        { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
        async () => await streamOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }).next(),
      ),
    ).rejects.toBe(error)

    expect(openAIMocks.create).toHaveBeenCalledTimes(1)
    expect(onUnknownBilledAttempt).not.toHaveBeenCalled()
  })

  it('does not latch or call OpenAI when the request signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const onUnknownBilledAttempt = vi.fn<
      (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
    >(() => Promise.resolve())

    await expect(
      runWithOpenAIResponseAttemptHooks(
        { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
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

  it('latches a foreground stream interruption without replaying already-yielded output', async () => {
    const cause = new Error('socket closed')
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
        throw cause
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
        await expect(generator.next()).rejects.toMatchObject({ cause })
      },
    )

    expect(openAIMocks.create).toHaveBeenCalledTimes(1)
    expect(onUnknownBilledAttempt).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ error: expect.objectContaining({ cause }) }),
    )
  })
})
