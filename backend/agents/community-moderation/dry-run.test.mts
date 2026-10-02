import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  findAiUsageRecordForResponseId,
  insertTestCommunity,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import {
  answerCommunityQuestions,
  readAskedQuestions,
  stallUntilAborted,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-provider'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import type { StructuredDecisionFetch } from '@modules/structured-decisions'
import { getAccountingUncertaintySource, SpendCapBreachError } from '@services/ai-usage'
import type { CommunityPromptDryRunConfiguration } from '@services/community-agent-prompts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { prepareCommunityPromptDryRun } from './dry-run.mts'

const configuration: CommunityPromptDryRunConfiguration = {
  questionTemplate: 'Does the post break this community rule: {{candidate}}',
  modelName: 'typesafe/jev-1.13',
  modelProvider: 'openrouter',
  thresholds: { lower: 0.2, upper: 0.8 },
}
const parts = [{ content: 'Buy cheap watches here', isTitle: true }, { content: 'Click the link' }]

const stalledFetch = vi.fn<StructuredDecisionFetch>(stallUntilAborted())

describe('community prompt dry run', () => {
  let communityId: string
  beforeAll(async () => {
    const owner = await createTestUser()
    communityId = (await insertTestCommunity({ createdById: owner.id })).id
  })

  async function prepare(
    fetch: StructuredDecisionFetch,
    overrides: Partial<CommunityPromptDryRunConfiguration> = {},
    callTimeoutMs?: number,
  ) {
    const prompt = { id: randomUUID(), text: 'No spam' }
    const dryRun = await prepareCommunityPromptDryRun(
      { communityId, prompt },
      {
        getConfiguration: async () => ({ ...configuration, ...overrides }),
        fetch,
        apiKey: 'test-key',
        callTimeoutMs,
      },
    )
    return { prompt, dryRun }
  }

  it('asks the previewed rule as the only question, over the post content', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const bodies: Record<string, unknown>[] = []
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) => {
        bodies.push(JSON.parse(stringFromUnknown(init?.body)) as Record<string, unknown>)
        return answerCommunityQuestions(init)
      })
      const { prompt, dryRun } = await prepare(fetch)

      await dryRun.classify(parts)

      expect(bodies).toHaveLength(1)
      const asked = readAskedQuestions({ body: JSON.stringify(bodies[0]) })
      expect(Object.keys(asked)).toEqual([prompt.id])
      expect(JSON.stringify(asked)).toContain('No spam')
      expect(bodies[0]!.state).toContain('Buy cheap watches here')
      expect(bodies[0]!.state).toContain('Click the link')
    })
  })

  it('loads the classifier configuration once however many posts it classifies', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const getConfiguration = vi.fn<() => Promise<CommunityPromptDryRunConfiguration>>(
        async () => configuration,
      )
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) =>
        answerCommunityQuestions(init),
      )
      const dryRun = await prepareCommunityPromptDryRun(
        { communityId, prompt: { id: randomUUID(), text: 'No spam' } },
        { getConfiguration, fetch, apiKey: 'test-key' },
      )

      await Promise.all([dryRun.classify(parts), dryRun.classify(parts), dryRun.classify(parts)])

      expect(getConfiguration).toHaveBeenCalledOnce()
      expect(fetch).toHaveBeenCalledTimes(3)
      expect(dryRun).toMatchObject({ modelName: 'typesafe/jev-1.13', modelProvider: 'openrouter' })
    })
  })

  it.each([
    { probability: 0.97, flagged: true },
    { probability: 0.5, flagged: false },
    { probability: 0.01, flagged: false },
  ])(
    'judges probability $probability against the pinned thresholds',
    async ({ probability, flagged }) => {
      await withReservedAiUsageDay(1_000_000, async () => {
        const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) =>
          answerCommunityQuestions(init, { probability }),
        )
        const { dryRun } = await prepare(fetch)

        await expect(dryRun.classify(parts)).resolves.toEqual({ flagged, probability })
      })
    },
  )

  it('bills the call to the community under the dry-run workload, with no post', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const responseId = `decision-${randomUUID()}`
      const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) =>
        answerCommunityQuestions(init, { responseId }),
      )
      const { dryRun } = await prepare(fetch)

      await dryRun.classify(parts)

      await expect(
        pollUntilNotNull(() => findAiUsageRecordForResponseId(responseId)),
      ).resolves.toMatchObject({
        agent_slug: 'community-moderation-dry-run',
        community_id: communityId,
        post_id: null,
        input_tokens: 12,
        output_tokens: 0,
      })
    })
  })

  it('refuses before any request when the daily spend cap is breached', async () => {
    await withReservedAiUsageDay(0, async () => {
      const fetch = vi.fn<StructuredDecisionFetch>()
      const { dryRun } = await prepare(fetch)

      await expect(dryRun.classify(parts)).rejects.toBeInstanceOf(SpendCapBreachError)
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  it('latches an ambiguous billed provider failure', async () => {
    await withReservedAiUsageDay(1_000_000, async day => {
      const { dryRun } = await prepare(async () => new Response('', { status: 503 }))

      await expect(dryRun.classify(parts)).rejects.toMatchObject({ code: 'provider-error' })
      await expect(getAccountingUncertaintySource(day)).resolves.toBe('unknown_billed_attempt')
    })
  })

  it('fails a stalled call at the per-call deadline without latching uncertainty', async () => {
    await withReservedAiUsageDay(1_000_000, async day => {
      const { dryRun } = await prepare(stalledFetch, {}, 20)

      await expect(dryRun.classify(parts)).rejects.toMatchObject({ name: 'TimeoutError' })
      await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
    })
  })

  it('stops a call when the caller cancels', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const { dryRun } = await prepare(stalledFetch)
      const cancel = new AbortController()

      const outcome = dryRun.classify(parts, cancel.signal)
      cancel.abort(new Error('preview cancelled'))

      await expect(outcome).rejects.toThrow('preview cancelled')
    })
  })

  it('has no API key source for a provider other than the one a real run uses', async () => {
    const fetch = vi.fn<StructuredDecisionFetch>()

    await expect(prepare(fetch, { modelProvider: 'typesafe' })).rejects.toThrow(
      "no API key source for provider 'typesafe'",
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
