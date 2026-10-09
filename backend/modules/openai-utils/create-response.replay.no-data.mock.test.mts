import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import {
  createOpenAIResponse,
  OpenAIResponseStreamIterationError,
  runWithBackgroundResponseHooks,
  runWithOpenAIResponseAttemptHooks,
} from './create-response.mts'

// The recorded responses are served through the real OpenAI SDK's `fetch` option, so the SDK parses
// actual status lines, headers and SSE bytes (delivered in 41-byte pieces that ignore event
// boundaries). The live counterpart is the non-gating smoke check in
// backend/agents/_shared/__tests__/create-response.openai.test.mts.
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

type LatchHook = (attempt: { requestStartedAt: Date; error: unknown }) => Promise<void>

function withLatchHook(
  onUnknownBilledAttempt: ReturnType<typeof vi.fn<LatchHook>>,
  run: () => ReturnType<typeof createOpenAIResponse>,
) {
  return runWithOpenAIResponseAttemptHooks(
    { beforeAttempt: () => Promise.resolve(), onUnknownBilledAttempt },
    run,
  )
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
    const stopAndSettle = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const onResponseCreated = vi.fn<
      (responseId: string) => Promise<{ stopAndSettle: () => Promise<void> }>
    >(() => Promise.resolve({ stopAndSettle }))

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
    expect(stopAndSettle).toHaveBeenCalledOnce()
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

  it('latches an HTTP 500 on create and stops without a second request', async () => {
    replay.respondWith(loadRecordedResponse('openai/responses-create-server-error-500.http'))
    const onUnknownBilledAttempt = vi.fn<LatchHook>(() => Promise.resolve())

    await expect(
      withLatchHook(onUnknownBilledAttempt, () =>
        createOpenAIResponse({ model: 'gpt-6-luna', input: INPUT }),
      ),
    ).rejects.toMatchObject({ status: 500 })

    expect(onUnknownBilledAttempt).toHaveBeenCalledOnce()
    expect(replay.requests).toHaveLength(1)
  })

  it('latches a server_error that arrives in the stream before any delta, cancels the response, and stops', async () => {
    replay.respondWith(
      loadRecordedResponse('openai/responses-stream-error-server-error.http'),
      loadRecordedResponse('openai/responses-cancelled.http'),
    )
    const onUnknownBilledAttempt = vi.fn<LatchHook>(() => Promise.resolve())

    const error: unknown = await withLatchHook(onUnknownBilledAttempt, () =>
      createOpenAIResponse({ model: 'gpt-6-luna', input: INPUT }),
    ).catch((err: unknown) => err)

    // The SDK turns an `event: error` frame into its own APIError while it parses the stream, so
    // the drain reports an iteration failure before any text delta, with the provider code as cause.
    expect(error).toBeInstanceOf(OpenAIResponseStreamIterationError)
    expect(error).toMatchObject({ emittedTextDelta: false, cause: { code: 'server_error' } })
    expect(onUnknownBilledAttempt).toHaveBeenCalledOnce()
    // The recorded cancel answer was consumed: the created response cannot keep billing, and no
    // third response was queued because a replay of the request would have had none to receive.
    replay.assertDrained()
  })
})
