import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type * as CustomerSupport from '@services/customer-support/types'
import type { BasicUser } from '@services/users/types'
import { OpenAiSpendCapBreachError, type OpenAiSpendCapBreach } from '@services/ai-usage'
import { generateSupportResponse, type GenerateSupportResponseDeps } from './generate-response.mts'

const thread = {
  id: 'thread-1',
  subject: 'Spend cap breach',
} as CustomerSupport.SupportThreadWithStatus
const firstInbound = {
  id: 'message-1',
  support_thread_id: thread.id,
  direction: 'inbound',
  body_text: 'I need help with my account.',
  created_at: new Date('2026-01-01T00:00:00Z'),
} as CustomerSupport.SupportMessage
const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }
const supportAgentUser = {
  id: 'support-agent-1',
  username: 'customer-support',
  roles: ['customer_support'],
} as unknown as BasicUser

describe('generateSupportResponse mid-loop OpenAI spend-cap breach', () => {
  it('rethrows the breach without marking the run failed', async () => {
    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 10_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-03-01',
    }
    const updateClaimedSupportAgentRunError = vi
      .fn<NonNullable<GenerateSupportResponseDeps['updateClaimedSupportAgentRunError']>>()
      .mockResolvedValue(true)

    await expect(
      generateSupportResponse(thread.id, {
        idempotencyKey: 'spend-cap-breach',
        supportMessageId: firstInbound.id,
        getSupportThreadById: async () => thread,
        getSupportMessagesByThreadId: async () => ({
          results: [firstInbound],
          page_info: pageInfo,
        }),
        claimKeyedSupportAgentRun: async () =>
          ({
            id: randomUUID(),
            claim_token: randomUUID(),
            support_thread_id: thread.id,
            support_message_id: firstInbound.id,
            model_name: 'gpt-5.4-nano',
            model_provider: 'openai',
          }) as CustomerSupport.SupportAgentRun,
        runToolLoop: async () => {
          throw new OpenAiSpendCapBreachError(breach)
        },
        updateClaimedSupportAgentRunError,
        getCustomerSupportAgentUser: async () => supportAgentUser,
      }),
    ).rejects.toThrow(OpenAiSpendCapBreachError)

    expect(updateClaimedSupportAgentRunError).not.toHaveBeenCalled()
  })

  it('rethrows the breach for an unkeyed run instead of marking it failed', async () => {
    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 10_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-03-01',
    }
    const updateSupportAgentRunError = vi
      .fn<NonNullable<GenerateSupportResponseDeps['updateSupportAgentRunError']>>()
      .mockResolvedValue(undefined)

    await expect(
      generateSupportResponse(thread.id, {
        getSupportThreadById: async () => thread,
        getSupportMessagesByThreadId: async () => ({
          results: [firstInbound],
          page_info: pageInfo,
        }),
        createSupportAgentRun: async () =>
          ({
            id: randomUUID(),
            claim_token: null,
            support_thread_id: thread.id,
            support_message_id: firstInbound.id,
            model_name: 'gpt-5.4-nano',
            model_provider: 'openai',
          }) as CustomerSupport.SupportAgentRun,
        runToolLoop: async () => {
          throw new OpenAiSpendCapBreachError(breach)
        },
        updateSupportAgentRunError,
        getCustomerSupportAgentUser: async () => supportAgentUser,
      }),
    ).rejects.toThrow(OpenAiSpendCapBreachError)

    expect(updateSupportAgentRunError).not.toHaveBeenCalled()
  })
})
