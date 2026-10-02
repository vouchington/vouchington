import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestUser, getPostLLMModerations, insertTestCommunity } from '@voucha/test-helpers'
import { createCommunityModerationFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-fixture'
import {
  answerCommunityQuestions,
  stallUntilAborted,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-provider'
import {
  getClassifierRunFacts,
  getClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import type { StructuredDecisionFetch } from '@modules/structured-decisions'
import { SpendCapBreachError } from '@services/ai-usage'
import type {
  CommunityAgentPromptSimulationPost,
  CommunityPromptDryRunConfiguration,
} from '@services/community-agent-prompts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { simulateCommunityPromptOnPosts } from './simulate.mts'

const configuration: CommunityPromptDryRunConfiguration = {
  questionTemplate: 'Does the post break this community rule: {{candidate}}',
  modelName: 'typesafe/jev-1.13',
  modelProvider: 'openrouter',
  thresholds: { lower: 0.2, upper: 0.8 },
}

const post = (
  id: string,
  overrides: Partial<CommunityAgentPromptSimulationPost> = {},
): CommunityAgentPromptSimulationPost => ({
  id,
  title: `Title ${id}`,
  markdown: `Body ${id}`,
  declared_language: null,
  lingua_rs_detected_language: null,
  post_type: 'text',
  created_by_id: null,
  approved_at: new Date(),
  content_excerpt: '',
  ...overrides,
})

const stateOf = (init: RequestInit | undefined): string =>
  (JSON.parse(stringFromUnknown(init?.body)) as { state: string }).state

describe('simulateCommunityPromptOnPosts', () => {
  let rule: { id: string; community_id: string; prompt: string }
  beforeAll(async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    rule = { id: randomUUID(), community_id: community.id, prompt: 'No spam' }
  })

  const options = (fetch: StructuredDecisionFetch, extra: { callTimeoutMs?: number } = {}) => ({
    getConfiguration: async () => configuration,
    fetch,
    apiKey: 'test-key',
    ...extra,
  })
  const stalls = (signals: AbortSignal[] = []) =>
    vi.fn<StructuredDecisionFetch>(stallUntilAborted(signals))

  it('makes no call and loads nothing for an empty sample', async () => {
    const fetch = vi.fn<StructuredDecisionFetch>()
    const getConfiguration = vi.fn<() => Promise<CommunityPromptDryRunConfiguration>>(
      async () => configuration,
    )

    await expect(
      simulateCommunityPromptOnPosts(rule, [], { ...options(fetch), getConfiguration }),
    ).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
    expect(getConfiguration).not.toHaveBeenCalled()
  })

  it('asks one question per post and keeps results in sample order', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const asked: string[][] = []
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) =>
        answerCommunityQuestions(init, {
          asked,
          probability: stateOf(init).includes('SPAMMY') ? 0.97 : 0.01,
        }),
      )
      const posts = [post('a'), post('b', { title: 'SPAMMY title' }), post('c')]

      await expect(simulateCommunityPromptOnPosts(rule, posts, options(fetch))).resolves.toEqual([
        { post_id: 'a', flagged: false },
        { post_id: 'b', flagged: true },
        { post_id: 'c', flagged: false },
      ])
      expect(asked).toEqual([[rule.id], [rule.id], [rule.id]])
    })
  })

  it('classifies a full 50-post sample with at most 8 calls in flight', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      let inFlight = 0
      let peak = 0
      let saturate = () => {}
      const saturated = new Promise<void>(resolve => (saturate = resolve))
      let release = () => {}
      const released = new Promise<void>(resolve => (release = resolve))
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) => {
        peak = Math.max(peak, ++inFlight)
        if (inFlight === 8) saturate()
        await released
        inFlight--
        return answerCommunityQuestions(init)
      })
      const posts = Array.from({ length: 50 }, (_, index) => post(`p${index}`))

      const pending = simulateCommunityPromptOnPosts(rule, posts, options(fetch))
      await saturated
      // Give a ninth call every chance to start while the first eight are held open.
      for (let turn = 0; turn < 20; turn++) await new Promise(resolve => setImmediate(resolve))
      expect(inFlight).toBe(8)
      expect(fetch).toHaveBeenCalledTimes(8)
      release()
      const results = await pending

      expect(results.map(result => result.post_id)).toEqual(posts.map(sample => sample.id))
      expect(fetch).toHaveBeenCalledTimes(50)
      expect(peak).toBe(8)
    })
  })

  it('previews the override text instead of the stored rule', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const questions: string[] = []
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) => {
        questions.push(stringFromUnknown(init?.body))
        return answerCommunityQuestions(init)
      })

      await simulateCommunityPromptOnPosts(rule, [post('a')], {
        ...options(fetch),
        promptOverride: 'No crypto giveaways',
      })

      expect(questions[0]).toContain('No crypto giveaways')
      expect(questions[0]).not.toContain('No spam')
    })
  })

  it('reads at most 4000 characters of a post, title first', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const states: string[] = []
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) => {
        states.push(stateOf(init))
        return answerCommunityQuestions(init)
      })
      const long = (head: string, tail: string) => `${head} ${'filler '.repeat(1000)}${tail}`

      await simulateCommunityPromptOnPosts(
        rule,
        [
          post('body', { markdown: long('BODY_HEAD', 'BODY_TAIL') }),
          post('title', { title: long('TITLE_HEAD', 'TITLE_TAIL'), markdown: 'BODY_AFTER_TITLE' }),
          post('empty', { title: ' ', markdown: ' ' }),
        ],
        options(fetch),
      )

      // Calls run concurrently, so the states arrive in no fixed order.
      const bodyState = states.find(state => state.includes('BODY_HEAD'))
      const titleState = states.find(state => state.includes('TITLE_HEAD'))
      expect(bodyState).toBeDefined()
      expect(bodyState).not.toContain('BODY_TAIL')
      expect(titleState).toBeDefined()
      expect(titleState).not.toContain('TITLE_TAIL')
      expect(titleState).not.toContain('BODY_AFTER_TITLE')
      expect(states).toHaveLength(3)
    })
  })

  it('fails the preview on the first failed call and cancels the calls still in flight', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const signals: AbortSignal[] = []
      const hangs = stalls(signals)
      const fetch = vi.fn<StructuredDecisionFetch>(async (url, init) => {
        if (fetch.mock.calls.length === 1) return new Response('', { status: 400 })
        return hangs(url, init)
      })
      const posts = Array.from({ length: 12 }, (_, index) => post(`p${index}`))

      await expect(
        simulateCommunityPromptOnPosts(rule, posts, options(fetch)),
      ).rejects.toMatchObject({ code: 'provider-error' })

      expect(fetch.mock.calls.length).toBeLessThan(12)
      expect(signals.length).toBeGreaterThan(0)
      expect(signals.every(signal => signal.aborted)).toBe(true)
    })
  })

  it('fails the preview when a call exceeds the per-call deadline', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      await expect(
        simulateCommunityPromptOnPosts(rule, [post('a')], options(stalls(), { callTimeoutMs: 20 })),
      ).rejects.toMatchObject({ name: 'TimeoutError' })
    })
  })

  it('makes no request once the daily spend cap is breached', async () => {
    await withReservedAiUsageDay(0, async () => {
      const fetch = vi.fn<StructuredDecisionFetch>()

      await expect(
        simulateCommunityPromptOnPosts(rule, [post('a'), post('b')], options(fetch)),
      ).rejects.toBeInstanceOf(SpendCapBreachError)
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  it('persists no classifier run, request or moderation for the posts it previews', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const fixture = await createCommunityModerationFixture()
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) =>
        answerCommunityQuestions(init, { probability: 0.97 }),
      )

      const results = await simulateCommunityPromptOnPosts(
        fixture.prompts[0]!,
        [post(fixture.postId)],
        { fetch, apiKey: 'test-key' },
      )

      expect(results).toEqual([{ post_id: fixture.postId, flagged: true }])
      expect(await getClassifierRunFacts(fixture.postId)).toEqual([])
      expect(await getClassifierRunRequestFacts(fixture.postId)).toEqual([])
      expect(await getPostLLMModerations(fixture.postId)).toEqual([])
    })
  })
})
