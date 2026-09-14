import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityAgentPrompt,
  findAiUsageRecordForAgent,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { PrivateUser } from '@services/users/types'
import { openAiSpendCapConfig } from '@services/ai-usage'
import { createOpenAIResponse } from '@modules/openai-utils/create-response'

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

describe('POST /api/v1/communities/:idOrSlug/agent-prompts/:promptId/test-runs', () => {
  let owner: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()

    vi.mocked(createOpenAIResponse).mockImplementation(async () => ({
      id: `resp_test_run_${randomUUID()}`,
      status: 'completed',
      output: [
        {
          id: 'msg_test_run',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: '{"flagged":false,"reason":"Safe content."}',
              annotations: [],
              logprobs: [],
            },
          ],
        },
      ],
      output_text: '{"flagged":false,"reason":"Safe content."}',
      usage: { input_tokens: 50, output_tokens: 20 },
      model: 'gpt-5.4-nano-2026-03-17',
      service_tier: 'flex',
    }))
  })

  it('returns the moderation result for the test text', async () => {
    // enabled: false bypasses the real spend-cap DB read (spend-cap-guard.mts's own
    // short-circuit), so this success path can't flake on unrelated ai_usage_records rows from
    // other tests sharing today's UTC window.
    await openAiSpendCapConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
    try {
      const slug = `test-runs-mock-${randomUUID().slice(0, 8)}`
      const community = await insertTestCommunity({ createdById: owner.id, slug })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
      })

      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .post(`/api/v1/communities/${slug}/agent-prompts/${prompt.id}/test-runs`)
        .send({ text: 'Sample content to moderate' })
        .expect(200)

      expect(response.body).toMatchObject({ flagged: false, reason: 'Safe content.' })
    } finally {
      restore()
    }
  })

  it('records ai usage for the test run', async () => {
    await openAiSpendCapConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
    try {
      const slug = `test-runs-mock-${randomUUID().slice(0, 8)}`
      const community = await insertTestCommunity({ createdById: owner.id, slug })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
      })
      const agentSlug = `community-prompt-${prompt.id}`

      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .post(`/api/v1/communities/${slug}/agent-prompts/${prompt.id}/test-runs`)
        .send({ text: 'Sample content to moderate' })
        .expect(200)

      const row = await pollUntilNotNull(() =>
        findAiUsageRecordForAgent(agentSlug, { inputTokens: 50, outputTokens: 20 }),
      )
      if (!row) throw new Error('ai_usage_records row was not written for the test run')
      expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
      expect(row.service_tier).toBe('flex')
      expect(row.community_id).toBe(community.id)
      expect(row.pricing_status).toBe('priced')
    } finally {
      restore()
    }
  })

  it('returns 429 and does not call OpenAI when the daily spend cap is breached', async () => {
    await openAiSpendCapConfig.waitForInitialization()
    // 0 is the true kill-switch value (#8773 review round 4): totalMicrounits is never negative, so
    // this breaches on the very first call regardless of what other tests have written today.
    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      daily_cap_microunits: 0,
    })
    // This mock isn't cleared between tests in this file -- prior tests in this describe block
    // already called it, so clear call history (not the beforeAll implementation) before asserting.
    vi.mocked(createOpenAIResponse).mockClear()
    try {
      const slug = `test-runs-mock-${randomUUID().slice(0, 8)}`
      const community = await insertTestCommunity({ createdById: owner.id, slug })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
      })

      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .post(`/api/v1/communities/${slug}/agent-prompts/${prompt.id}/test-runs`)
        .send({ text: 'Sample content to moderate' })
        .expect(429)

      expect(createOpenAIResponse).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})
