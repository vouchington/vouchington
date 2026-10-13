import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { callConversationTitleModel } from './generate-title.mts'

// The recorded Messages API body is served to the real `generateJson` through its `createMessage`
// dependency, so this agent's real schema validation and parser run on recorded wire JSON. The SDK
// transport is replayed in backend/modules/model-providers/generate.replay.no-data.mock.test.mts.
// The live counterpart is the non-gating smoke check in generate-title.anthropic.test.mts.
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

const INPUT = 'user: Can you help me plan a three day trip to Lisbon?'

describe('callConversationTitleModel against a recorded Anthropic response', () => {
  beforeEach(() => {
    replay.reset()
  })

  it('sends the title schema and input, and returns the parsed title with its billed usage', async () => {
    replay.respondWith(loadRecordedResponse('anthropic/messages-conversation-title.http'))

    const result = await callConversationTitleModel(INPUT, 'user-hash', ANTHROPIC_HAIKU_CALL)

    expect(replay.requests[0]?.json()).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: INPUT }],
      metadata: { user_id: 'user-hash' },
      output_config: {
        format: {
          type: 'json_schema',
          schema: { required: ['title'], additionalProperties: false },
        },
      },
    })
    expect(result.output).toEqual({ title: 'Planning a Three Day Lisbon Trip' })
    expect(result).toMatchObject({
      provider: 'anthropic',
      responseId: 'msg_01ReplayFixtureTitle',
      usage: { inputTokens: 511, outputTokens: 17 },
    })
    replay.assertDrained()
  })
})
