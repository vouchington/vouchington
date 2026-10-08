import { randomUUID } from 'node:crypto'
import { it, expect, describe } from 'vitest'
import { OpenAIResponseNotCompletedError } from '@modules/openai-utils/create-response'
import { findAiUsageRecordForResponseId, findAiUsageRecordForAgent } from '@voucha/test-helpers'
import {
  makeAgentModelCaller,
  makeModelCallResult,
  TEST_MODEL_SELECTION,
  TEST_OPENAI_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import { callStoryPostAgent, parseStoryPostOutput, type StoryPostModelCaller } from './agent.mts'
import type { Story } from '@services/stories/types'
import type { Response } from 'openai/resources/responses/responses'

const makeStory = (overrides: Partial<Story> = {}): Story =>
  ({
    id: 'story-123',
    title: 'Test Story Title',
    published_at: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  }) as Story

const itemSummaries = [
  { title: 'Article One', summary: 'Summary of article one.' },
  { title: 'Article Two', summary: 'Summary of article two.' },
]

describe('callStoryPostAgent', () => {
  it('returns the title and summary the model wrote', async () => {
    const result = await callStoryPostAgent(
      makeStory(),
      itemSummaries,
      TEST_MODEL_SELECTION,
      makeAgentModelCaller({
        title: 'Concise Headline Here',
        ai_summary_markdown: 'A two sentence summary of the event.',
      }),
    )

    expect(result).toEqual({
      title: 'Concise Headline Here',
      ai_summary_markdown: 'A two sentence summary of the event.',
    })
  })

  it('truncates the title to 100 characters', async () => {
    const result = await callStoryPostAgent(
      makeStory(),
      itemSummaries,
      TEST_MODEL_SELECTION,
      makeAgentModelCaller({ title: 'A'.repeat(150), ai_summary_markdown: 'Summary.' }),
    )

    expect(result.title).toBe('A'.repeat(100))
  })

  it.each([
    [
      'the story title when the model title is empty',
      { title: 'Fallback Title' },
      'Fallback Title',
    ],
    ['"Story" when the story has no title either', { title: null }, 'Story'],
  ])('falls back to %s', async (_name, story, expected) => {
    const result = await callStoryPostAgent(
      makeStory(story),
      itemSummaries,
      TEST_MODEL_SELECTION,
      makeAgentModelCaller({ title: '', ai_summary_markdown: 'Summary.' }),
    )

    expect(result.title).toBe(expected)
  })

  it('passes the story id as the safety identifier and the selection to the model caller', async () => {
    const callModel = makeAgentModelCaller({ title: 'Test', ai_summary_markdown: 'Summary.' })

    await callStoryPostAgent(
      makeStory({ id: 'story-abc' }),
      itemSummaries,
      TEST_OPENAI_SELECTION,
      callModel,
    )

    expect(callModel).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('Article One'),
      'story-abc',
      { selection: TEST_OPENAI_SELECTION, openaiTransport: 'openrouter' },
    )
  })

  it('records the call under the story-post agent with the served model', async () => {
    const responseId = `resp-story-${randomUUID()}`
    const callModel: StoryPostModelCaller = () =>
      Promise.resolve(
        makeModelCallResult(
          { title: 'T', ai_summary_markdown: 'S' },
          { responseId, model: 'claude-haiku-5-5' },
        ),
      )

    await callStoryPostAgent(makeStory(), itemSummaries, TEST_MODEL_SELECTION, callModel)

    await expect(findAiUsageRecordForResponseId(responseId)).resolves.toMatchObject({
      agent_slug: 'story-post',
      model_provider: 'anthropic',
      model: 'claude-haiku-5-5',
      pricing_status: 'priced',
    })
  })

  it('records usage from a failed/incomplete response before rethrowing', async () => {
    // story-post has no post/community scope, so a queued retry after this failure is the only
    // chance to attribute the charge: the call site must record from the thrown error.
    const callModel: StoryPostModelCaller = () =>
      Promise.reject(
        new OpenAIResponseNotCompletedError('OpenAI response incomplete: max_output_tokens', {
          status: 'incomplete',
          model: 'gpt-6-luna-2026-10-01',
          service_tier: 'flex',
          usage: { input_tokens: 411, output_tokens: 61 },
          incomplete_details: { reason: 'max_output_tokens' },
        } as Response),
      )

    await expect(
      callStoryPostAgent(makeStory(), itemSummaries, TEST_OPENAI_SELECTION, callModel),
    ).rejects.toThrow('OpenAI response incomplete: max_output_tokens')

    await expect(
      findAiUsageRecordForAgent('story-post', { inputTokens: 411, outputTokens: 61 }),
    ).resolves.toMatchObject({
      model_provider: 'openai',
      model: 'gpt-6-luna-2026-10-01',
      service_tier_id: 'flex',
      pricing_status: 'priced',
    })
  })
})

describe('parseStoryPostOutput', () => {
  it('rejects a blank summary', () => {
    expect(() => parseStoryPostOutput({ title: 'Only Title', ai_summary_markdown: '   ' })).toThrow(
      'Invalid story post agent result',
    )
  })

  it('accepts a non-blank summary', () => {
    const output = { title: 'T', ai_summary_markdown: 'S' }
    expect(parseStoryPostOutput(output)).toBe(output)
  })
})
