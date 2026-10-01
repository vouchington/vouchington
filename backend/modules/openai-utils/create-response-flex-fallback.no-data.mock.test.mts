import { APIError } from 'openai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runWithBackgroundResponseHooks } from './background-response-context.mts'
import { createOpenAIResponse } from './create-response.mts'
import { runWithOpenAIResponseAttemptHooks } from './response-attempt-context.mts'
import {
  makeFlexCapacityFailedStream,
  makeResponseStream,
  makeSdkResponse,
  makeSdkTextResponse,
  makeStreamEvent,
} from '../../test-helpers/modules/openai-utils/responses.mts'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

type Params = Parameters<typeof createOpenAIResponse>[0]
type CreateMock = (params: Params, options: unknown) => Promise<unknown>

const mocks = vi.hoisted(() => ({
  create: vi.fn<CreateMock>(),
  cancel: vi.fn<(responseId: string) => Promise<unknown>>(),
}))

vi.mock<typeof import('openai')>(import('openai'), async importOriginal => ({
  ...(await importOriginal()),
  default: class MockOpenAI {
    responses = { create: mocks.create, cancel: mocks.cancel }
  } as unknown as typeof import('openai').default,
}))

const flexParams = { model: 'gpt-5.4-nano', input: 'hello', service_tier: 'flex' } as Params

function createdEvent(id: string) {
  return makeStreamEvent({
    type: 'response.created',
    sequence_number: 1,
    response: makeSdkResponse({ status: 'in_progress', id }),
  })
}

function completedStream(id = 'resp-default') {
  return makeResponseStream([
    createdEvent(id),
    makeStreamEvent({
      type: 'response.completed',
      sequence_number: 2,
      response: makeSdkTextResponse('ok', { id, service_tier: 'default' }),
    }),
  ])
}

function makeHooks() {
  const beforeAttempt = vi.fn<
    (value: { attempt: number; requestStartedAt: Date }) => Promise<void>
  >(() => Promise.resolve())
  const onUnknownBilledAttempt = vi.fn<
    (value: { requestStartedAt: Date; error: unknown }) => Promise<void>
  >(() => Promise.resolve())
  return { beforeAttempt, onUnknownBilledAttempt }
}

describe('OpenAI flex capacity fallback', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    mocks.create.mockReset()
    mocks.cancel.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resends a failed background flex response on the default tier and tracks the resend', async () => {
    mocks.create
      .mockResolvedValueOnce(
        makeResponseStream([
          createdEvent('resp-flex-failed'),
          ...(await collect(makeFlexCapacityFailedStream())),
        ]),
      )
      .mockResolvedValueOnce(completedStream())
    const stopAndSettle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const onResponseCreated = vi
      .fn<(responseId: string) => Promise<{ stopAndSettle: () => Promise<void> }>>()
      .mockResolvedValue({ stopAndSettle })
    const hooks = makeHooks()

    const result = await runWithOpenAIResponseAttemptHooks(hooks, () =>
      runWithBackgroundResponseHooks({ onResponseCreated }, () => createOpenAIResponse(flexParams)),
    )

    expect(result).toMatchObject({ id: 'resp-default', service_tier: 'default' })
    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(mocks.create).toHaveBeenNthCalledWith(
      1,
      { ...flexParams, stream: true, background: true },
      { maxRetries: 0 },
    )
    expect(mocks.create).toHaveBeenNthCalledWith(
      2,
      { ...flexParams, service_tier: 'default', stream: true, background: true },
      { maxRetries: 0 },
    )
    expect(onResponseCreated.mock.calls.map(([id]) => id)).toEqual([
      'resp-flex-failed',
      'resp-default',
    ])
    expect(stopAndSettle).toHaveBeenCalledTimes(2)
    // A response that reached the failed status is finished; cancelling it would waste a request.
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(hooks.onUnknownBilledAttempt).not.toHaveBeenCalled()
    expect(hooks.beforeAttempt.mock.calls.map(([value]) => value.attempt)).toEqual([1, 2])
    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith('openai_flex_fallback', {
      level: 'warning',
      tags: { reason: 'openai_flex_fallback', provider: 'openai', trigger: 'stream_failed' },
      extra: { model: 'gpt-5.4-nano' },
    })
  })

  it('resends once on the default tier after the free flex 429 retries are exhausted', async () => {
    const flexUnavailable = new APIError(
      429,
      { code: 'resource_unavailable', message: 'Resource Unavailable' },
      'Resource Unavailable',
      new Headers(),
    )
    mocks.create
      .mockRejectedValueOnce(flexUnavailable)
      .mockRejectedValueOnce(flexUnavailable)
      .mockResolvedValueOnce(completedStream())
    const hooks = makeHooks()
    vi.useFakeTimers()

    const result = runWithOpenAIResponseAttemptHooks(hooks, () =>
      createOpenAIResponse(flexParams, { maxRetries: 1 }),
    )
    await vi.runAllTimersAsync()

    await expect(result).resolves.toMatchObject({ id: 'resp-default' })
    expect(mocks.create).toHaveBeenCalledTimes(3)
    expect(mocks.create.mock.calls.map(([params]) => params.service_tier)).toEqual([
      'flex',
      'flex',
      'default',
    ])
    // Only the first physical request skips the spend-cap guard (`attempt === 1`).
    expect(hooks.beforeAttempt.mock.calls.map(([value]) => value.attempt > 1)).toEqual([
      false,
      true,
      true,
    ])
    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
      'openai_flex_fallback',
      expect.objectContaining({
        tags: expect.objectContaining({ provider: 'openai', trigger: 'http_429' }),
      }),
    )
  })

  it('records an unknown model when the flex request names none', async () => {
    const { model: _model, ...withoutModel } = flexParams
    mocks.create
      .mockResolvedValueOnce(makeFlexCapacityFailedStream())
      .mockResolvedValueOnce(completedStream())

    await createOpenAIResponse(withoutModel as Params)

    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
      'openai_flex_fallback',
      expect.objectContaining({ extra: { model: 'unknown' } }),
    )
  })

  it('does not resend a streamed flex capacity failure for a non-flex request', async () => {
    mocks.create.mockResolvedValueOnce(makeFlexCapacityFailedStream())

    await expect(
      createOpenAIResponse({ ...flexParams, service_tier: 'auto' }),
    ).rejects.toMatchObject({ status: 'failed', code: 'server_error' })

    expect(mocks.create).toHaveBeenCalledOnce()
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
  })
})

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of iterable) items.push(item)
  return items
}
