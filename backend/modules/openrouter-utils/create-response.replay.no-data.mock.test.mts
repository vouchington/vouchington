import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OpenAIResponseStreamIterationError,
  runWithOpenAIResponseAttemptHooks,
} from '@modules/openai-utils/create-response'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { createOpenRouterResponse, toOpenRouterModel } from './create-response.mts'

// The recorded responses are served through the real OpenAI SDK's `fetch` option (OpenRouter's
// OpenResponses endpoint is driven by that SDK), so the SDK parses actual status lines, headers
// and SSE bytes, including OpenRouter's `: OPENROUTER PROCESSING` keep-alive comments, delivered
// in 41-byte pieces that ignore event boundaries. The fixtures are hand-written from the
// documented wire format, not recorded. The live counterpart is the non-gating smoke check in
// create-response.openrouter.test.mts.
const replay = await vi.hoisted(async () => {
  const { createProviderReplay } = await import('../../test-helpers/provider-replay.mts')
  return createProviderReplay({ chunkBytes: 41 })
})

vi.mock<typeof import('openai')>(import('openai'), async importOriginal => {
  const actual = await importOriginal()
  const { replayClient } = await import('../../test-helpers/provider-replay.mts')
  return { ...actual, default: replayClient(actual.default, replay) }
})

const INPUT = 'Reply with exactly OK.'
const SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
}

type BeforeAttempt = (attempt: { attempt: number; requestStartedAt: Date }) => Promise<void>
type LatchHook = (attempt: { requestStartedAt: Date; error: unknown }) => Promise<void>

function makeHooks() {
  const beforeAttempt = vi.fn<BeforeAttempt>(() => Promise.resolve())
  const onUnknownBilledAttempt = vi.fn<LatchHook>(() => Promise.resolve())
  return { beforeAttempt, onUnknownBilledAttempt }
}

describe('createOpenRouterResponse against recorded OpenRouter responses', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    replay.reset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends one foreground streaming request and parses the completed response from the SSE bytes', async () => {
    replay.respondWith(
      loadRecordedResponse('openrouter/responses-stream-structured-completed.http'),
    )
    const hooks = makeHooks()

    const response = await runWithOpenAIResponseAttemptHooks(hooks, () =>
      createOpenRouterResponse({
        model: toOpenRouterModel('gpt-6-luna'),
        input: INPUT,
        max_output_tokens: 1024,
        safety_identifier: 'openrouter-replay-contract',
        service_tier: 'flex',
        prompt_cache_key: 'openrouter-replay-contract-v1',
        text: {
          format: { type: 'json_schema', name: 'openrouter_replay_contract', schema: SCHEMA },
        },
      }),
    )

    // The fields the usage ledger reads: id, the served model, the text, and the token counts
    // with OpenRouter's billed `cost`.
    expect(response).toMatchObject({
      id: 'gen-resp-1790000000-replayfixture0001',
      status: 'completed',
      model: 'openai/gpt-6-luna-20261001',
      usage: { input_tokens: 21, output_tokens: 6, cost: 0.00000357 },
    })
    expect(JSON.parse(response.output_text)).toEqual({ answer: 'OK' })
    expect(replay.requests).toHaveLength(1)
    expect(replay.requests[0]).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Bearer test-key', 'x-openrouter-metadata': 'enabled' },
    })
    // Foreground, unlike the direct OpenAI transport: nothing is created in the background.
    expect(replay.requests[0]?.json()).toMatchObject({
      model: 'openai/gpt-6-luna',
      input: INPUT,
      stream: true,
      background: false,
      max_output_tokens: 1024,
      safety_identifier: 'openrouter-replay-contract',
      service_tier: 'flex',
      prompt_cache_key: 'openrouter-replay-contract-v1',
      text: { format: { type: 'json_schema', name: 'openrouter_replay_contract', schema: SCHEMA } },
    })
    expect(hooks.beforeAttempt).toHaveBeenCalledOnce()
    expect(hooks.beforeAttempt.mock.calls[0]?.[0]).toMatchObject({ attempt: 1 })
    expect(hooks.onUnknownBilledAttempt).not.toHaveBeenCalled()
    replay.assertDrained()
  })

  it('latches an HTTP 500 on create and stops without a second request', async () => {
    replay.respondWith(loadRecordedResponse('openrouter/responses-create-server-error-500.http'))
    const hooks = makeHooks()

    await expect(
      runWithOpenAIResponseAttemptHooks(hooks, () =>
        createOpenRouterResponse({
          model: 'openai/gpt-6-luna',
          input: INPUT,
          service_tier: 'flex',
        }),
      ),
    ).rejects.toMatchObject({ status: 500 })

    expect(hooks.onUnknownBilledAttempt).toHaveBeenCalledOnce()
    // A non-flex failure is not resent on the default tier, and the SDK does not retry it.
    expect(replay.requests).toHaveLength(1)
    expect(hooks.beforeAttempt).toHaveBeenCalledOnce()
  })

  it.each([
    ['a top-level error object', 'openrouter/responses-stream-error-top-level.http'],
    ['an error event', 'openrouter/responses-stream-error-event.http'],
  ])(
    'latches a server_error that arrives as %s before any delta and stops',
    async (_framing, fixture) => {
      replay.respondWith(loadRecordedResponse(fixture))
      const hooks = makeHooks()

      const error: unknown = await runWithOpenAIResponseAttemptHooks(hooks, () =>
        createOpenRouterResponse({ model: 'openai/gpt-6-luna', input: INPUT }),
      ).catch((err: unknown) => err)

      // The SDK turns either error frame into its own APIError while it parses the stream, so the
      // drain reports an iteration failure before any text delta, with the provider code as cause.
      expect(error).toBeInstanceOf(OpenAIResponseStreamIterationError)
      expect(error).toMatchObject({ emittedTextDelta: false, cause: { code: 'server_error' } })
      expect(hooks.onUnknownBilledAttempt).toHaveBeenCalledOnce()
      // Foreground mode has no created response to cancel and no resend: one request, one answer.
      expect(replay.requests).toHaveLength(1)
      replay.assertDrained()
    },
  )
})
