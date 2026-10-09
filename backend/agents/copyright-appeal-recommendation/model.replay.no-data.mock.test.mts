import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { callCopyrightAppealRecommendationModel } from './model.mts'

// The recorded Messages API body is served to the real `generateJson` through its `createMessage`
// dependency, so this agent's real schema validation and parser run on recorded wire JSON. The SDK
// transport is replayed in backend/modules/model-providers/generate.replay.no-data.mock.test.mts.
// The live counterpart is the non-gating smoke check in model.anthropic.test.mts.
const replay = await vi.hoisted(async () => {
  const { createAnthropicMessageReplay } =
    await import('../../test-helpers/anthropic-message-replay.mts')
  return createAnthropicMessageReplay()
})

vi.mock<typeof import('@modules/model-providers/generate')>(
  import('@modules/model-providers/generate'),
  async importOriginal => {
    const actual = await importOriginal()
    const { replayGenerateJson } = await import('../../test-helpers/anthropic-message-replay.mts')
    return { ...actual, generateJson: replayGenerateJson(actual.generateJson, replay) }
  },
)

const INPUT = JSON.stringify({
  reason: 'I created this image.',
  targets: ['https://voucha.ai/posts/example'],
})
const FIXTURE = 'anthropic/messages-copyright-appeal-recommendation.http'

describe('callCopyrightAppealRecommendationModel against a recorded Anthropic response', () => {
  beforeEach(() => {
    replay.reset()
  })

  it('sends the recommendation schema and input, and returns the parsed advice with its billed usage', async () => {
    replay.respondWith(loadRecordedResponse(FIXTURE))

    const result = await callCopyrightAppealRecommendationModel(
      INPUT,
      'appeal-hash',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(replay.requests[0]?.json()).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: INPUT }],
      metadata: { user_id: 'appeal-hash' },
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            required: ['recommendation', 'rationale'],
            additionalProperties: false,
            properties: { recommendation: { enum: ['confirm', 'modify', 'reverse', 'uncertain'] } },
          },
        },
      },
    })
    expect(result.output).toEqual({
      recommendation: 'uncertain',
      rationale: expect.stringContaining('supplies no evidence'),
    })
    expect(result).toMatchObject({
      provider: 'anthropic',
      responseId: 'msg_01ReplayFixtureCopyrightAppeal',
      usage: { inputTokens: 511, outputTokens: 17 },
    })
    replay.assertDrained()
  })

  it('rejects a rationale past the bound as a permanent invalid response that is still billed', async () => {
    // The schema allows any string; the 10,000-character bound belongs to this agent's parser.
    replay.respondWith(
      loadRecordedResponse(FIXTURE, {
        replace: { 'The appeal asserts authorship': 'x'.repeat(10_001) },
      }),
    )

    const failure: unknown = await callCopyrightAppealRecommendationModel(
      INPUT,
      'appeal-hash',
      ANTHROPIC_HAIKU_CALL,
    ).catch((err: unknown) => err)

    expect(failure).toMatchObject({
      code: 'invalid-response',
      retryClass: 'permanent',
      billedResponse: {
        responseId: 'msg_01ReplayFixtureCopyrightAppeal',
        usage: { inputTokens: 511, outputTokens: 17 },
      },
    })
  })
})
