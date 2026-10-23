import { randomUUID } from 'node:crypto'
import { it, expect, describe } from 'vitest'
import { OpenAIResponseNotCompletedError } from '@vouchington/ai/openai'
import { findAiUsageRecordForResponseId, findAiUsageRecordForAgent } from '@voucha/test-helpers'
import {
  makeAgentModelCaller,
  makeModelCallResult,
  TEST_MODEL_SELECTION,
  TEST_OPENAI_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import { callStoryPostAgent, parseStoryPostOutput, type StoryPostModelCaller } from './agent.mts'
import { callReceiptedAgentModel } from '@agents/_shared'
import type { Story } from '@services/stories/types'
import type { Response } from 'openai/resources/responses/responses'

const makeStory = (overrides: Partial<Story> = {}): Story =>
  ({
    id: randomUUID(),
    title: 'Test Story Title',
    published_at: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  }) as Story

const itemSummaries = [
  { title: 'Article One', summary: 'Summary of article one.' },
  { title: 'Article Two', summary: 'Summary of article two.' },
]

describe('callStoryPostAgent', () => {
  it('stops replay when the prompt or schema contract version changes', async () => {
    const operationId = randomUUID()
    const callModel = makeAgentModelCaller({
      title: 'First title',
      ai_summary_markdown: 'First summary.',
    })
    const params = {
      agentSlug: 'story-post',
      operationId,
      promptVersion: 'story-post-test-v1',
      selection: TEST_MODEL_SELECTION,
      input: 'A fixed story prompt',
      safetyIdentifier: operationId,
      callModel,
    }
    await callReceiptedAgentModel(params)
    await expect(
      callReceiptedAgentModel({ ...params, promptVersion: 'story-post-test-v2' }),
    ).rejects.toThrow('request changed after reservation')
    expect(callModel).toHaveBeenCalledOnce()
  })

  it('reuses a completed paid receipt after a downstream retry', async () => {
    const story = makeStory()
    const callModel = makeAgentModelCaller({
      title: 'First title',
      ai_summary_markdown: 'First summary.',
    })
    const first = await callStoryPostAgent(story, itemSummaries, TEST_MODEL_SELECTION, callModel)
    const second = await callStoryPostAgent(story, itemSummaries, TEST_MODEL_SELECTION, callModel)

    expect(second).toEqual(first)
    expect(callModel).toHaveBeenCalledOnce()
  })

  it('stops changed story input or model selection from billing the same operation twice', async () => {
    const story = makeStory()
    const first = makeAgentModelCaller({ title: 'First', ai_summary_markdown: 'First.' })
    await callStoryPostAgent(story, itemSummaries, TEST_MODEL_SELECTION, first)

    const retry = makeAgentModelCaller({ title: 'Duplicate', ai_summary_markdown: 'Duplicate.' })
    await expect(
      callStoryPostAgent(
        { ...story, title: 'Retitled after dispatch' },
        itemSummaries,
        TEST_MODEL_SELECTION,
        retry,
      ),
    ).rejects.toThrow('request changed after reservation')
    await expect(
      callStoryPostAgent(story, itemSummaries, TEST_OPENAI_SELECTION, retry),
    ).rejects.toThrow('request changed after reservation')
    expect(first).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
  })

  it('allows an explicit new operation identity to make a fresh paid call', async () => {
    const story = makeStory()
    const callModel = makeAgentModelCaller({ title: 'First', ai_summary_markdown: 'First.' })
    await callStoryPostAgent(story, itemSummaries, TEST_MODEL_SELECTION, callModel)
    await callStoryPostAgent(
      story,
      itemSummaries,
      TEST_MODEL_SELECTION,
      callModel,
      `${story.id}:force-job`,
    )
    expect(callModel).toHaveBeenCalledTimes(2)
  })

  it('does not call the provider again after an ambiguous paid attempt', async () => {
    const story = makeStory()
    const callModel: StoryPostModelCaller = () =>
      Promise.reject(new Error('response lost after dispatch'))
    await expect(
      callStoryPostAgent(story, itemSummaries, TEST_MODEL_SELECTION, callModel),
    ).rejects.toThrow('response lost after dispatch')

    const retry = makeAgentModelCaller({ title: 'Duplicate', ai_summary_markdown: 'Duplicate.' })
    await expect(
      callStoryPostAgent(story, itemSummaries, TEST_MODEL_SELECTION, retry),
    ).rejects.toThrow('uncertain receipt')
    expect(retry).not.toHaveBeenCalled()
  })

  it('keeps a second job from calling the provider while the first paid call stalls', async () => {
    const story = makeStory()
    const started = Promise.withResolvers<void>()
    const provider = Promise.withResolvers<Awaited<ReturnType<StoryPostModelCaller>>>()
    const callModel: StoryPostModelCaller = () => {
      started.resolve()
      return provider.promise
    }
    const first = callStoryPostAgent(story, itemSummaries, TEST_MODEL_SELECTION, callModel)
    await started.promise

    const duplicate = makeAgentModelCaller({
      title: 'Duplicate',
      ai_summary_markdown: 'Duplicate.',
    })
    await expect(
      callStoryPostAgent(story, itemSummaries, TEST_MODEL_SELECTION, duplicate),
    ).rejects.toThrow('uncertain receipt')
    expect(duplicate).not.toHaveBeenCalled()

    provider.resolve(makeModelCallResult({ title: 'First', ai_summary_markdown: 'First.' }))
    await expect(first).resolves.toEqual({ title: 'First', ai_summary_markdown: 'First.' })
  })

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
    const story = makeStory()

    await callStoryPostAgent(story, itemSummaries, TEST_OPENAI_SELECTION, callModel)

    expect(callModel).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('Article One'),
      story.id,
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
