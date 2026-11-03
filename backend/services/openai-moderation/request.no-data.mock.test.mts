import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpenAIModerationResponse } from '../../test-helpers/openai.mts'
import { createOpenAIModeration } from './request.mts'

// The OpenAI call is the provider edge; its wire shape is covered by the recorded replay in
// backend/modules/openai-utils/moderate.replay.no-data.mock.test.mts.
const requestOpenAIModeration = vi.hoisted(() =>
  vi.fn<typeof import('@modules/openai-utils/moderate').requestOpenAIModeration>(),
)

vi.mock<typeof import('@modules/openai-utils/moderate')>(
  import('@modules/openai-utils/moderate'),
  async importOriginal => ({ ...(await importOriginal()), requestOpenAIModeration }),
)

describe('request', () => {
  beforeEach(() => {
    requestOpenAIModeration.mockReset()
    requestOpenAIModeration.mockResolvedValueOnce(createOpenAIModerationResponse())
  })

  it('createOpenAIModeration wraps text inputs as { type: text, text }', async () => {
    await createOpenAIModeration(['hello', 'world'])

    expect(requestOpenAIModeration).toHaveBeenCalledWith(
      [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' },
      ],
      'omni-moderation-latest',
    )
  })

  it('createOpenAIModeration wraps image URLs as { type: image_url, image_url: { url } }', async () => {
    await createOpenAIModeration([], ['https://example.com/cat.png'])

    expect(requestOpenAIModeration).toHaveBeenCalledWith(
      [{ type: 'image_url', image_url: { url: 'https://example.com/cat.png' } }],
      'omni-moderation-latest',
    )
  })

  it('createOpenAIModeration sends mixed text and image inputs in order', async () => {
    await createOpenAIModeration(
      ['title', 'body'],
      ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    )

    expect(requestOpenAIModeration).toHaveBeenCalledWith(
      [
        { type: 'text', text: 'title' },
        { type: 'text', text: 'body' },
        { type: 'image_url', image_url: { url: 'https://example.com/a.jpg' } },
        { type: 'image_url', image_url: { url: 'https://example.com/b.jpg' } },
      ],
      'omni-moderation-latest',
    )
  })

  it('createOpenAIModeration handles undefined images_urls', async () => {
    await createOpenAIModeration(['only text'], undefined)

    expect(requestOpenAIModeration).toHaveBeenCalledWith(
      [{ type: 'text', text: 'only text' }],
      'omni-moderation-latest',
    )
  })

  it('marks an API safety check for the shorter request deadline', async () => {
    await createOpenAIModeration(['only text'], undefined, { apiSafetyCheck: true })

    expect(requestOpenAIModeration).toHaveBeenCalledWith(
      [{ type: 'text', text: 'only text' }],
      'omni-moderation-latest',
      { apiSafetyCheck: true },
    )
  })
})
