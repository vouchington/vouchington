import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { callAppealModel } from './model.mts'

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

const INPUT =
  '## Original Action\nOriginal action: Warning\nReason: Off-topic post\n\n## Appeal Reason\nThe post was on topic.'

describe('callAppealModel against a recorded Anthropic response', () => {
  beforeEach(() => {
    replay.reset()
  })

  it('sends the appeal schema and input, and returns the parsed draft with its billed usage', async () => {
    replay.respondWith(loadRecordedResponse('anthropic/messages-appeal-resolution.http'))

    const result = await callAppealModel(INPUT, 'appellant-hash', ANTHROPIC_HAIKU_CALL)

    const body = replay.requests[0]?.json<Record<string, unknown>>()
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: INPUT }],
      metadata: { user_id: 'appellant-hash' },
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            required: ['recommended_action', 'public_response', 'internal_response'],
            additionalProperties: false,
            properties: { recommended_action: { enum: ['accept', 'deny', 'reduce'] } },
          },
        },
      },
    })
    expect(typeof body?.['system']).toBe('string')
    expect(result.output).toEqual({
      recommended_action: 'accept',
      public_response: expect.stringContaining('reversing the warning'),
      internal_response: expect.stringContaining('on topic'),
    })
    expect(result).toMatchObject({
      provider: 'anthropic',
      responseId: 'msg_01ReplayFixtureAppeal',
      usage: { inputTokens: 511, outputTokens: 17 },
    })
    replay.assertDrained()
  })
})
