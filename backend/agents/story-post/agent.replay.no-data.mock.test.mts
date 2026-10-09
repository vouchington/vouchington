import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { callStoryPostModel } from './agent.mts'

// The recorded Messages API body is served to the real `generateJson` through its `createMessage`
// dependency, so this agent's real schema validation and parser run on recorded wire JSON. The SDK
// transport is replayed in backend/modules/model-providers/generate.replay.no-data.mock.test.mts.
// The live counterpart is the non-gating smoke check in agent.anthropic.test.mts.
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
  'Story title: Storm hits coast\nPublished: 2026-10-01\n\nSource articles:\nArticle 1:\nTitle: Storm makes landfall\nSummary: A storm made landfall overnight, cutting power to 40,000 homes.'

describe('callStoryPostModel against a recorded Anthropic response', () => {
  beforeEach(() => {
    replay.reset()
  })

  it('sends the story schema and input, and returns the parsed post with its billed usage', async () => {
    replay.respondWith(loadRecordedResponse('anthropic/messages-story-post.http'))

    const result = await callStoryPostModel(INPUT, 'story-id', ANTHROPIC_HAIKU_CALL)

    expect(replay.requests[0]?.json()).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: INPUT }],
      metadata: { user_id: 'story-id' },
      output_config: {
        format: {
          type: 'json_schema',
          schema: { required: ['title', 'ai_summary_markdown'], additionalProperties: false },
        },
      },
    })
    expect(result.output).toEqual({
      title: 'Storm Cuts Power To 40,000 Homes',
      ai_summary_markdown: expect.stringContaining('**40,000 homes**'),
    })
    expect(result).toMatchObject({
      provider: 'anthropic',
      responseId: 'msg_01ReplayFixtureStory',
      usage: { inputTokens: 511, outputTokens: 17 },
    })
    replay.assertDrained()
  })

  it('rejects a blank summary as a permanent invalid response that is still billed', async () => {
    // The schema accepts whitespace; a post without a summary is the parser's rejection.
    replay.respondWith(loadRecordedResponse('anthropic/messages-story-post-blank-summary.http'))

    const failure: unknown = await callStoryPostModel(
      INPUT,
      'story-id',
      ANTHROPIC_HAIKU_CALL,
    ).catch((err: unknown) => err)

    expect(failure).toMatchObject({
      code: 'invalid-response',
      retryClass: 'permanent',
      billedResponse: {
        responseId: 'msg_01ReplayFixtureStoryBlank',
        usage: { inputTokens: 511, outputTokens: 17 },
      },
    })
  })
})
