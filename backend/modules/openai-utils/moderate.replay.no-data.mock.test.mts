import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { requestOpenAIModeration } from './moderate.mts'

// The recorded `/moderations` responses are served through the real OpenAI SDK's `fetch` option, so
// the SDK parses actual wire bytes. The live counterpart is the non-gating smoke check in
// backend/services/openai-moderation/__tests__/posts.openai.test.mts.
const replay = await vi.hoisted(async () => {
  const { createProviderReplay } = await import('../../test-helpers/provider-replay.mts')
  return createProviderReplay()
})

vi.mock<typeof import('openai')>(import('openai'), async importOriginal => {
  const actual = await importOriginal()
  const { replayClient } = await import('../../test-helpers/provider-replay.mts')
  return { ...actual, default: replayClient(actual.default, replay) }
})

const INPUT = [
  { type: 'text' as const, text: 'a title' },
  { type: 'image_url' as const, image_url: { url: 'https://example.com/cat.png' } },
]

describe('requestOpenAIModeration against recorded OpenAI responses', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    replay.reset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends the model and the input as given and returns the recorded verdict', async () => {
    replay.respondWith(loadRecordedResponse('openai/moderations-clear.http'))

    const response = await requestOpenAIModeration(INPUT, 'omni-moderation-latest')

    expect(replay.requests[0]).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Bearer test-key' },
    })
    expect(replay.requests[0]?.json()).toEqual({ model: 'omni-moderation-latest', input: INPUT })
    expect(response.results).toHaveLength(1)
    expect(response.results[0]).toMatchObject({
      flagged: false,
      categories: { violence: false, harassment: false },
    })
    replay.assertDrained()
  })
})
