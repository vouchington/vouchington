/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Routed to backend-no-data-mocks for the project-level @sentry/node mock (vitest.setup.sentry-mock.mts); asserts sentryCaptureMessageMock, which the real recordOpenAiFlexFallback calls. The transport is injected through deps, so there is no in-file vi.mock and the rule's unnecessaryMock branch fires; the .mock suffix is load-bearing for routing. */
import { APIError } from 'openai'
import { describe, expect, it, vi } from 'vitest'
import { runWithOpenAIResponseAttemptHooks } from '@modules/openai-utils/response-attempt-context'
import {
  makeFlexCapacityFailedStream,
  makeResponseStream,
  makeSdkTextResponse,
  makeStreamEvent,
} from '../../test-helpers/modules/openai-utils/responses.mts'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { createOpenRouterResponse } from './create-response.mts'

type CreateResponse = NonNullable<
  NonNullable<Parameters<typeof createOpenRouterResponse>[2]>['createResponse']
>
type Params = Parameters<typeof createOpenRouterResponse>[0]

const flexParams = {
  model: 'openai/gpt-5.4-nano',
  input: 'hello',
  service_tier: 'flex',
} as Params

function completedStream() {
  return makeResponseStream([
    makeStreamEvent({
      type: 'response.completed',
      sequence_number: 1,
      response: makeSdkTextResponse('ok', { id: 'resp-default', service_tier: 'default' }),
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

describe('OpenRouter flex capacity fallback', () => {
  it('resends a streamed flex capacity failure exactly once on the default tier', async () => {
    const createResponse = vi
      .fn<CreateResponse>()
      .mockResolvedValueOnce(makeFlexCapacityFailedStream() as never)
      .mockResolvedValueOnce(completedStream() as never)
    const hooks = makeHooks()

    const result = await runWithOpenAIResponseAttemptHooks(hooks, () =>
      createOpenRouterResponse(flexParams, undefined, { createResponse }),
    )

    expect(result).toMatchObject({ id: 'resp-default', service_tier: 'default' })
    expect(createResponse).toHaveBeenCalledTimes(2)
    expect(createResponse.mock.calls[0]?.[0]).toMatchObject({
      service_tier: 'flex',
      input: 'hello',
    })
    expect(createResponse.mock.calls[1]?.[0]).toMatchObject({
      service_tier: 'default',
      input: 'hello',
      model: 'openai/gpt-5.4-nano',
      stream: true,
      background: false,
    })
    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith('openai_flex_fallback', {
      level: 'warning',
      tags: { reason: 'openai_flex_fallback', provider: 'openrouter', trigger: 'stream_failed' },
      extra: { model: 'openai/gpt-5.4-nano' },
    })
    // The failed flex attempt is known to be unbilled, so it must not fail-close the spend cap.
    expect(hooks.onUnknownBilledAttempt).not.toHaveBeenCalled()
    // The resend is a second physical request, so the spend-cap guard sees attempt 2.
    expect(hooks.beforeAttempt.mock.calls.map(([value]) => value.attempt)).toEqual([1, 2])
  })

  it('resends a flex 429 that outlasted the free retry budget on the default tier', async () => {
    const flexUnavailable = new APIError(
      429,
      { code: 'resource_unavailable', message: 'Resource Unavailable' },
      'Resource Unavailable',
      new Headers(),
    )
    const createResponse = vi
      .fn<CreateResponse>()
      .mockRejectedValueOnce(flexUnavailable)
      .mockResolvedValueOnce(completedStream() as never)

    const result = await createOpenRouterResponse(flexParams, { maxRetries: 0 }, { createResponse })

    expect(result).toMatchObject({ id: 'resp-default' })
    expect(createResponse).toHaveBeenCalledTimes(2)
    expect(createResponse.mock.calls[1]?.[0]).toMatchObject({ service_tier: 'default' })
    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
      'openai_flex_fallback',
      expect.objectContaining({
        tags: expect.objectContaining({ provider: 'openrouter', trigger: 'http_429' }),
      }),
    )
  })

  it('does not resend again when the default-tier attempt also fails', async () => {
    const createResponse = vi
      .fn<CreateResponse>()
      .mockResolvedValueOnce(makeFlexCapacityFailedStream() as never)
      .mockResolvedValueOnce(makeFlexCapacityFailedStream({ service_tier: 'default' }) as never)

    await expect(
      createOpenRouterResponse(flexParams, undefined, { createResponse }),
    ).rejects.toMatchObject({ status: 'failed', code: 'server_error' })

    expect(createResponse).toHaveBeenCalledTimes(2)
    expect(sentryCaptureMessageMock).toHaveBeenCalledOnce()
  })

  it('does not resend a non-flex request', async () => {
    const createResponse = vi
      .fn<CreateResponse>()
      .mockResolvedValueOnce(makeFlexCapacityFailedStream() as never)

    await expect(
      createOpenRouterResponse({ ...flexParams, service_tier: 'default' }, undefined, {
        createResponse,
      }),
    ).rejects.toMatchObject({ status: 'failed', code: 'server_error' })

    expect(createResponse).toHaveBeenCalledOnce()
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a different server error',
      makeFlexCapacityFailedStream({
        error: { code: 'server_error', message: 'The server had an error processing your request' },
      }),
    ],
    [
      'a failure that carries usage',
      makeFlexCapacityFailedStream({
        usage: {
          input_tokens: 5,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens: 1,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 6,
        },
      }),
    ],
  ])('does not resend a flex request that failed with %s', async (_label, stream) => {
    const createResponse = vi.fn<CreateResponse>().mockResolvedValueOnce(stream as never)

    await expect(
      createOpenRouterResponse(flexParams, undefined, { createResponse }),
    ).rejects.toMatchObject({ status: 'failed' })

    expect(createResponse).toHaveBeenCalledOnce()
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
  })

  it('does not resend a flex request rejected for another reason', async () => {
    const badRequest = new APIError(400, { code: 'invalid_request_error' }, 'Bad', new Headers())
    const createResponse = vi.fn<CreateResponse>().mockRejectedValueOnce(badRequest)

    await expect(createOpenRouterResponse(flexParams, undefined, { createResponse })).rejects.toBe(
      badRequest,
    )

    expect(createResponse).toHaveBeenCalledOnce()
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
  })
})
