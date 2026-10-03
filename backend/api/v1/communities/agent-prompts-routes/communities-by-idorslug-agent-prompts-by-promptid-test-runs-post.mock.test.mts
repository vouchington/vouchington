import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  findAiUsageRecordForResponseId,
  getLatestTestPromptTestTrainingFeedback,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityAgentPrompt,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { answerCommunityQuestions } from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-provider'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { PrivateUser } from '@services/users/types'
import { spendCapConfig } from '@services/ai-usage'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async importOriginal => ({
    ...(await importOriginal()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

const provider = vi.mocked(fetchStructuredDecisionProvider)
type AnswerOptions = NonNullable<Parameters<typeof answerCommunityQuestions>[1]>

function answerWith(options: AnswerOptions) {
  provider.mockImplementation(async (_url, init) => answerCommunityQuestions(init, options))
}

describe('POST /api/v1/communities/:idOrSlug/agent-prompts/:promptId/test-runs', () => {
  let owner: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
  })
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
    answerWith({ probability: 0.01 })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    provider.mockReset()
  })

  async function createPrompt() {
    const slug = `test-runs-mock-${randomUUID().slice(0, 8)}`
    const community = await insertTestCommunity({ createdById: owner.id, slug })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const request = createRequest()
    await request.authenticateAs(owner)
    const testRun = (body: Record<string, unknown>) =>
      request.post(`/api/v1/communities/${slug}/agent-prompts/${prompt.id}/test-runs`).send(body)
    return { community, prompt, testRun }
  }

  // enabled: false bypasses the real spend-cap DB read (spend-cap-guard.mts's own short-circuit),
  // so the success paths can't flake on unrelated ai_usage_records rows from other tests sharing
  // today's UTC window.
  async function withSpendCapDisabled(run: () => Promise<void>) {
    await spendCapConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    try {
      await run()
    } finally {
      restore()
    }
  }

  it('flags text the classifier is confident breaks the rule, with no reason', async () => {
    await withSpendCapDisabled(async () => {
      answerWith({ probability: 0.97 })
      const { testRun } = await createPrompt()

      const response = await testRun({ text: 'Sample content to moderate' }).expect(200)

      expect(response.body).toEqual({ flagged: true })
    })
  })

  it('does not flag text the classifier is confident is fine', async () => {
    await withSpendCapDisabled(async () => {
      const { testRun } = await createPrompt()

      const response = await testRun({ text: 'Sample content to moderate' }).expect(200)

      expect(response.body).toEqual({ flagged: false })
      expect(provider).toHaveBeenCalledOnce()
    })
  })

  it('asks the stored rule about the test text in one call', async () => {
    await withSpendCapDisabled(async () => {
      const asked: string[][] = []
      answerWith({ asked })
      const { prompt, testRun } = await createPrompt()

      await testRun({ text: 'Sample content to moderate' }).expect(200)

      expect(asked).toEqual([[prompt.id]])
      expect(stringFromUnknown(provider.mock.calls[0]![1]!.body)).toContain(
        'Sample content to moderate',
      )
    })
  })

  it('records the call against the community in the ai usage ledger', async () => {
    await withSpendCapDisabled(async () => {
      const responseId = `decision-${randomUUID()}`
      answerWith({ responseId })
      const { community, testRun } = await createPrompt()

      await testRun({ text: 'Sample content to moderate' }).expect(200)

      await expect(
        pollUntilNotNull(() => findAiUsageRecordForResponseId(responseId)),
      ).resolves.toMatchObject({
        agent_slug: 'community-moderation-dry-run',
        community_id: community.id,
        post_id: null,
        input_tokens: 12,
        output_tokens: 0,
      })
    })
  })

  it('saves the labelled run for training with the classifier model and probability', async () => {
    await withSpendCapDisabled(async () => {
      answerWith({ probability: 0.97 })
      const { community, prompt, testRun } = await createPrompt()

      await testRun({
        text: 'Sample content to moderate',
        save_for_training: true,
        expected_flagged: false,
      }).expect(200)

      const feedback = await getLatestTestPromptTestTrainingFeedback(community.id)
      expect(feedback?.label).toBe('false_positive')
      expect(feedback?.metadata).toEqual({
        prompt_id: prompt.id,
        classifier_model_name: expect.any(String),
        classifier_model_provider: 'openrouter',
        test_text: 'Sample content to moderate',
        expected_flagged: false,
        actual_flagged: true,
        actual_probability: 0.97,
      })
    })
  })

  it('requires expected_flagged to save a run for training', async () => {
    await withSpendCapDisabled(async () => {
      const { testRun } = await createPrompt()

      await testRun({ text: 'Sample content to moderate', save_for_training: true }).expect(422)
    })
  })

  it('returns 429 and does not call the provider when the daily spend cap is breached', async () => {
    await spendCapConfig.waitForInitialization()
    // 0 is the true kill-switch value (#8773 review round 4): totalMicrounits is never negative, so
    // this breaches on the very first call regardless of what other tests have written today.
    const restore = overrideDynamicConfigFieldsForTest(spendCapConfig, {
      daily_cap_microunits: 0,
    })
    try {
      const { testRun } = await createPrompt()

      await testRun({ text: 'Sample content to moderate' }).expect(429)

      expect(provider).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})
