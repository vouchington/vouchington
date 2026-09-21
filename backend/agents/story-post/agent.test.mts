import { it, expect, vi, beforeEach, describe } from 'vitest'
import { OpenAIResponseNotCompletedError } from '@agents/_shared'
import { findAiUsageRecordForAgent, pollUntilNotNull } from '@voucha/test-helpers'
import { callStoryPostAgent } from './agent.mts'
import type { Story } from '@services/stories/types'
import type { Response } from 'openai/resources/responses/responses'

const makeStory = (overrides: Partial<Story> = {}): Story =>
  ({
    id: 'story-123',
    title: 'Test Story Title',
    published_at: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  }) as Story

type CreateOpenAIResponse =
  typeof import('@modules/openai-utils/create-response').createOpenAIResponse

const makeTextResponse = (text: string) => ({
  id: 'resp-1',
  output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text }] }],
})

const itemSummaries = [
  { title: 'Article One', summary: 'Summary of article one.' },
  { title: 'Article Two', summary: 'Summary of article two.' },
]

describe('agent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns title and summary from valid JSON response', async () => {
    const jsonResponse = JSON.stringify({
      title: 'Concise Headline Here',
      ai_summary_markdown: 'A two sentence summary of the event.',
    })
    const createOpenAIResponse = vi
      .fn<CreateOpenAIResponse>()
      .mockResolvedValueOnce(makeTextResponse(jsonResponse) as never)

    const result = await callStoryPostAgent(makeStory(), itemSummaries, {
      createOpenAIResponse,
    })

    expect(result.title).toBe('Concise Headline Here')
    expect(result.ai_summary_markdown).toBe('A two sentence summary of the event.')
  })

  it('throws when response is unparseable JSON', async () => {
    const createOpenAIResponse = vi
      .fn<CreateOpenAIResponse>()
      .mockResolvedValueOnce(makeTextResponse('not valid json at all') as never)

    await expect(
      callStoryPostAgent(makeStory({ title: 'My Story' }), itemSummaries, {
        createOpenAIResponse,
      }),
    ).rejects.toThrow('Failed to parse LLM response as JSON')
  })

  it('truncates title to 100 characters', async () => {
    const longTitle = 'A'.repeat(150)
    const jsonResponse = JSON.stringify({
      title: longTitle,
      ai_summary_markdown: 'Summary.',
    })
    const createOpenAIResponse = vi
      .fn<CreateOpenAIResponse>()
      .mockResolvedValueOnce(makeTextResponse(jsonResponse) as never)

    const result = await callStoryPostAgent(makeStory(), itemSummaries, {
      createOpenAIResponse,
    })

    expect(result.title.length).toBe(100)
    expect(result.title).toBe('A'.repeat(100))
  })

  it('falls back to story title when parsed title is empty string', async () => {
    const jsonResponse = JSON.stringify({
      title: '',
      ai_summary_markdown: 'Some summary.',
    })
    const createOpenAIResponse = vi
      .fn<CreateOpenAIResponse>()
      .mockResolvedValueOnce(makeTextResponse(jsonResponse) as never)

    const result = await callStoryPostAgent(makeStory({ title: 'Fallback Title' }), itemSummaries, {
      createOpenAIResponse,
    })

    expect(result.title).toBe('Fallback Title')
  })

  it('uses Story as fallback title when story title is null and summary is valid', async () => {
    const createOpenAIResponse = vi
      .fn<CreateOpenAIResponse>()
      .mockResolvedValueOnce(
        makeTextResponse(JSON.stringify({ title: '', ai_summary_markdown: 'Summary.' })) as never,
      )

    const result = await callStoryPostAgent(makeStory({ title: null }), itemSummaries, {
      createOpenAIResponse,
    })

    expect(result.title).toBe('Story')
    expect(result.ai_summary_markdown).toBe('Summary.')
  })

  it('handles JSON wrapped in markdown code fences', async () => {
    const fencedJson =
      '```json\n{"title": "Fenced Title", "ai_summary_markdown": "Fenced summary."}\n```'
    const createOpenAIResponse = vi
      .fn<CreateOpenAIResponse>()
      .mockResolvedValueOnce(makeTextResponse(fencedJson) as never)

    const result = await callStoryPostAgent(makeStory(), itemSummaries, {
      createOpenAIResponse,
    })

    expect(result.title).toBe('Fenced Title')
    expect(result.ai_summary_markdown).toBe('Fenced summary.')
  })

  it('throws when ai_summary_markdown is missing from response', async () => {
    const jsonResponse = JSON.stringify({ title: 'Only Title' })
    const createOpenAIResponse = vi
      .fn<CreateOpenAIResponse>()
      .mockResolvedValueOnce(makeTextResponse(jsonResponse) as never)

    await expect(
      callStoryPostAgent(makeStory(), itemSummaries, { createOpenAIResponse }),
    ).rejects.toThrow('Invalid story post agent result')
  })

  it('throws when ai_summary_markdown is blank', async () => {
    const jsonResponse = JSON.stringify({ title: 'Only Title', ai_summary_markdown: '   ' })
    const createOpenAIResponse = vi
      .fn<CreateOpenAIResponse>()
      .mockResolvedValueOnce(makeTextResponse(jsonResponse) as never)

    await expect(
      callStoryPostAgent(makeStory(), itemSummaries, { createOpenAIResponse }),
    ).rejects.toThrow('Invalid story post agent result')
  })

  it('uses the OpenRouter model namespace and preserves safety_identifier', async () => {
    const jsonResponse = JSON.stringify({ title: 'Test', ai_summary_markdown: 'Summary.' })
    const createOpenAIResponse = vi
      .fn<CreateOpenAIResponse>()
      .mockResolvedValueOnce(makeTextResponse(jsonResponse) as never)

    const story = makeStory({ id: 'story-abc' })
    await callStoryPostAgent(story, itemSummaries, { createOpenAIResponse })

    expect(createOpenAIResponse).toHaveBeenCalledOnce()
    const callArgs = createOpenAIResponse.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.model).toBe('openai/gpt-5.4-nano')
    expect(callArgs.safety_identifier).toBe('story-abc')
  })

  it('records usage from a failed/incomplete response before rethrowing', async () => {
    // story-post has no post/community scope, so a queued retry after this failure is the only
    // chance to attribute the charge -- the call-site catch block must record from the thrown
    // OpenAIResponseNotCompletedError, not just from a successful response.
    const createOpenAIResponse = vi.fn<CreateOpenAIResponse>().mockRejectedValueOnce(
      new OpenAIResponseNotCompletedError('OpenAI response incomplete: max_output_tokens', {
        status: 'incomplete',
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: { input_tokens: 411, output_tokens: 61 },
        incomplete_details: { reason: 'max_output_tokens' },
      } as Response),
    )

    await expect(
      callStoryPostAgent(makeStory(), itemSummaries, { createOpenAIResponse }),
    ).rejects.toThrow('OpenAI response incomplete: max_output_tokens')

    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent('story-post', { inputTokens: 411, outputTokens: 61 }),
    )
    if (!row) throw new Error('ai_usage_records row was not written for the failed response')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')
    expect(row.pricing_status).toBe('priced')
  })
})
