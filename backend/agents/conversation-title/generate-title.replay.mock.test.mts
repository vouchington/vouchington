import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { findAiUsageRecordForAgent } from '@voucha/test-helpers/entities/ai-usage'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { generateChatTitleFromInput } from './generate-title.mts'

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

describe('generateChatTitleFromInput against a recorded Anthropic response', () => {
  beforeEach(() => {
    replay.reset()
  })

  it('sends the title schema and input, and returns the parsed title', async () => {
    replay.respondWith(loadRecordedResponse('anthropic/messages-conversation-title.http'))

    const title = await generateChatTitleFromInput(
      INPUT,
      'user-hash',
      ANTHROPIC_HAIKU_CALL.selection,
    )

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
    expect(title).toEqual('Planning a Three Day Lisbon Trip')
    await expect(
      findAiUsageRecordForAgent('chat-generate-title', { inputTokens: 511, outputTokens: 17 }),
    ).resolves.toMatchObject({
      model_provider: 'anthropic',
      input_tokens: 511,
      output_tokens: 17,
    })
    replay.assertDrained()
  })
})
