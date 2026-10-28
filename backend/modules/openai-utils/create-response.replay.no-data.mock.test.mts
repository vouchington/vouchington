import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import {
  createOpenAIResponse,
  runWithBackgroundResponseHooks,
  runWithOpenAIResponseAttemptHooks,
} from './create-response.mts'
import { OpenAIResponseStreamIterationError } from '@vouchington/ai/openai'

// The recorded responses are served through the real OpenAI SDK's `fetch` option, so the SDK parses
// actual status lines, headers and SSE bytes (delivered in 41-byte pieces that ignore event
// boundaries).
const replay = await vi.hoisted(async () => {
  const { createProviderReplay } = await import('../../test-helpers/provider-replay.mts')
  return createProviderReplay({ chunkBytes: 41 })
})

vi.mock<typeof import('openai')>(import('openai'), async importOriginal => {
  const actual = await importOriginal()
  const { replayClient } = await import('../../test-helpers/provider-replay.mts')
  return { ...actual, default: replayClient(actual.default, replay) }
})

const INPUT = 'Reply with the single word OK and nothing else.'

function withAttemptHook(run: () => ReturnType<typeof createOpenAIResponse>) {
  return runWithOpenAIResponseAttemptHooks({ beforeAttempt: () => Promise.resolve() }, run)
}

describe('createOpenAIResponse against recorded OpenAI responses', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    replay.reset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends one background streaming request and parses the completed response from the SSE bytes', async () => {
    replay.respondWith(loadRecordedResponse('openai/responses-stream-text-completed.http'))
    const onResponseCreated = vi.fn<(responseId: string) => Promise<boolean>>(() =>
      Promise.resolve(true),
    )

    const response = await runWithBackgroundResponseHooks({ onResponseCreated }, () =>
      createOpenAIResponse({ model: 'gpt-6-luna', input: INPUT }),
    )

    // The fields the usage ledger reads: id, the served model and tier, and the token counts.
    expect(response).toMatchObject({
      id: 'resp_replay_fixture',
      status: 'completed',
      output_text: 'OK',
      model: 'gpt-6-luna-2026-10-01',
      service_tier: 'default',
      usage: { input_tokens: 17, output_tokens: 6 },
    })
    expect(onResponseCreated).toHaveBeenCalledExactlyOnceWith('resp_replay_fixture')
    expect(replay.requests).toHaveLength(1)
    expect(replay.requests[0]).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Bearer test-key' },
    })
    expect(replay.requests[0]?.json()).toMatchObject({
      model: 'gpt-6-luna',
      input: INPUT,
      stream: true,
      background: true,
    })
    replay.assertDrained()
  })

  it('rejects an HTTP 500 on create and stops without a second request', async () => {
    replay.respondWith(loadRecordedResponse('openai/responses-create-server-error-500.http'))

    await expect(
      withAttemptHook(() => createOpenAIResponse({ model: 'gpt-6-luna', input: INPUT })),
    ).rejects.toMatchObject({ status: 500 })
    expect(replay.requests).toHaveLength(1)
  })

  it('cancels a response when server_error arrives before any delta', async () => {
    replay.respondWith(
      loadRecordedResponse('openai/responses-stream-error-server-error.http'),
      loadRecordedResponse('openai/responses-cancelled.http'),
    )

    const error: unknown = await withAttemptHook(() =>
      createOpenAIResponse({ model: 'gpt-6-luna', input: INPUT }),
    ).catch((err: unknown) => err)

    // The SDK turns an `event: error` frame into its own APIError while it parses the stream, so
    // the drain reports an iteration failure before any text delta, with the provider code as cause.
    expect(error).toBeInstanceOf(OpenAIResponseStreamIterationError)
    expect(error).toMatchObject({ emittedTextDelta: false, cause: { code: 'server_error' } })
    // The recorded cancel answer was consumed: the created response cannot keep billing, and no
    // third response was queued because a replay of the request would have had none to receive.
    replay.assertDrained()
  })

  it('reports a missing previous response delivered as an SSE error', async () => {
    replay.respondWith(loadRecordedResponse('openai/responses-stream-error-previous-response.http'))

    const error: unknown = await withAttemptHook(() =>
      createOpenAIResponse({
        model: 'gpt-6-luna',
        input: INPUT,
        previous_response_id: 'resp_expired',
      }),
    ).catch((err: unknown) => err)

    expect(error).toBeInstanceOf(OpenAIResponseStreamIterationError)
    expect(error).toMatchObject({
      cause: {
        status: undefined,
        code: 'previous_response_not_found',
        param: 'previous_response_id',
      },
    })
    expect(replay.requests).toHaveLength(1)
    replay.assertDrained()
  })
})
