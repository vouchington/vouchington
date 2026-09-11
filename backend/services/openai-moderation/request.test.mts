import { afterEach, expect, it, vi, describe } from 'vitest'
import type { OpenAI } from '@modules/openai-utils'
import { createOpenAIModeration } from './request.mts'

const requestOpenAIModeration = vi.fn<VitestLooseMock>()
const dependencies = { requestOpenAIModeration }

describe('request', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const emptyResponse: OpenAI.Moderations.ModerationCreateResponse = {
    id: 'mod_test',
    model: 'omni-moderation-latest',
    results: [],
  }

  it('createOpenAIModeration wraps text inputs as { type: text, text }', async () => {
    requestOpenAIModeration.mockResolvedValueOnce(emptyResponse)

    await createOpenAIModeration(['hello', 'world'], undefined, { dependencies })

    expect(requestOpenAIModeration).toHaveBeenCalledWith(
      [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' },
      ],
      'omni-moderation-latest',
    )
  })

  it('createOpenAIModeration wraps image URLs as { type: image_url, image_url: { url } }', async () => {
    requestOpenAIModeration.mockResolvedValueOnce(emptyResponse)

    await createOpenAIModeration([], ['https://example.com/cat.png'], { dependencies })

    expect(requestOpenAIModeration).toHaveBeenCalledWith(
      [{ type: 'image_url', image_url: { url: 'https://example.com/cat.png' } }],
      'omni-moderation-latest',
    )
  })

  it('createOpenAIModeration sends mixed text and image inputs in order', async () => {
    requestOpenAIModeration.mockResolvedValueOnce(emptyResponse)

    await createOpenAIModeration(
      ['title', 'body'],
      ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      { dependencies },
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
    requestOpenAIModeration.mockResolvedValueOnce(emptyResponse)

    await createOpenAIModeration(['only text'], undefined, { dependencies })

    expect(requestOpenAIModeration).toHaveBeenCalledWith(
      [{ type: 'text', text: 'only text' }],
      'omni-moderation-latest',
    )
  })

  it('forwards an idempotency key to the OpenAI moderation boundary', async () => {
    requestOpenAIModeration.mockResolvedValueOnce(emptyResponse)

    await createOpenAIModeration(['only text'], undefined, {
      dependencies,
      idempotencyKey: 'moderation-key',
    })

    expect(requestOpenAIModeration).toHaveBeenCalledWith(
      [{ type: 'text', text: 'only text' }],
      'omni-moderation-latest',
      { idempotencyKey: 'moderation-key' },
    )
  })

  it('marks an API safety check for the shorter request deadline', async () => {
    requestOpenAIModeration.mockResolvedValueOnce(emptyResponse)

    await createOpenAIModeration(['only text'], undefined, {
      dependencies,
      apiSafetyCheck: true,
      idempotencyKey: 'moderation-key',
    })

    expect(requestOpenAIModeration).toHaveBeenCalledWith(
      [{ type: 'text', text: 'only text' }],
      'omni-moderation-latest',
      { apiSafetyCheck: true, idempotencyKey: 'moderation-key' },
    )
  })
})
