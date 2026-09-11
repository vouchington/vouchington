import { describe, expect, it, vi } from 'vitest'
import type * as CustomerSupport from '@services/customer-support/types'
import type { BasicUser } from '@services/users/types'
import { generateSupportResponse, type GenerateSupportResponseDeps } from './generate-response.mts'

const thread = {
  id: 'thread-1',
  subject: 'Durable support response',
} as CustomerSupport.SupportThreadWithStatus
const inbound = {
  id: 'message-1',
  support_thread_id: thread.id,
  direction: 'inbound',
  body_text: 'Please help.',
} as CustomerSupport.SupportMessage
const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }
const supportAgentUser = { roles: ['customer_support'] } as unknown as BasicUser

describe('generateSupportResponse keyed model provenance', () => {
  it('returns before model or draft work when a live durable run already owns the key', async () => {
    const claimKeyedSupportAgentRun = vi
      .fn<NonNullable<GenerateSupportResponseDeps['claimKeyedSupportAgentRun']>>()
      .mockResolvedValue(null)
    const createSupportAgentRun =
      vi.fn<NonNullable<GenerateSupportResponseDeps['createSupportAgentRun']>>()
    const runToolLoop = vi.fn<NonNullable<GenerateSupportResponseDeps['runToolLoop']>>()
    const finalizeKeyedSupportAgentRun =
      vi.fn<NonNullable<GenerateSupportResponseDeps['finalizeKeyedSupportAgentRun']>>()

    await generateSupportResponse(thread.id, {
      idempotencyKey: 'support_inbound_email__message-1__customer_support',
      supportMessageId: inbound.id,
      getSupportThreadById: async () => thread,
      getSupportMessagesByThreadId: async () => ({ results: [inbound], page_info: pageInfo }),
      claimKeyedSupportAgentRun,
      createSupportAgentRun,
      runToolLoop,
      finalizeKeyedSupportAgentRun,
    })

    expect(createSupportAgentRun).not.toHaveBeenCalled()
    expect(runToolLoop).not.toHaveBeenCalled()
    expect(finalizeKeyedSupportAgentRun).not.toHaveBeenCalled()
  })

  it('executes a reclaimed keyed run with its persisted OpenAI model', async () => {
    const runToolLoop = vi
      .fn<NonNullable<GenerateSupportResponseDeps['runToolLoop']>>()
      .mockResolvedValue({ text: null, iterations: 1, terminationReason: 'no_tool_calls' })

    await generateSupportResponse(thread.id, {
      idempotencyKey: 'member-durable-model',
      supportMessageId: inbound.id,
      getSupportThreadById: async () => thread,
      getSupportMessagesByThreadId: async () => ({ results: [inbound], page_info: pageInfo }),
      claimKeyedSupportAgentRun: async () =>
        ({
          id: 'persisted-model-run',
          claim_token: 'persisted-model-claim',
          support_thread_id: thread.id,
          support_message_id: inbound.id,
          model_name: 'gpt-5.4-nano',
          model_provider: 'openai',
        }) as CustomerSupport.SupportAgentRun,
      runToolLoop,
      finalizeKeyedSupportAgentRun: async () => true,
      getCustomerSupportAgentUser: async () => supportAgentUser,
    })

    expect(runToolLoop).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.4-nano' }))
  })

  it('does not execute a keyed run through OpenAI when its recorded provider differs', async () => {
    const runToolLoop = vi.fn<NonNullable<GenerateSupportResponseDeps['runToolLoop']>>()
    const updateClaimedSupportAgentRunError = vi
      .fn<NonNullable<GenerateSupportResponseDeps['updateClaimedSupportAgentRunError']>>()
      .mockResolvedValue(true)

    await expect(
      generateSupportResponse(thread.id, {
        idempotencyKey: 'member-unsupported-provider',
        supportMessageId: inbound.id,
        getSupportThreadById: async () => thread,
        getSupportMessagesByThreadId: async () => ({ results: [inbound], page_info: pageInfo }),
        claimKeyedSupportAgentRun: async () =>
          ({
            id: 'unsupported-provider-run',
            claim_token: 'unsupported-provider-claim',
            support_thread_id: thread.id,
            support_message_id: inbound.id,
            model_name: 'claude-sonnet-5',
            model_provider: 'anthropic',
          }) as CustomerSupport.SupportAgentRun,
        runToolLoop,
        updateClaimedSupportAgentRunError,
      }),
    ).rejects.toThrow('unsupported durable run provider: anthropic')

    expect(runToolLoop).not.toHaveBeenCalled()
    expect(updateClaimedSupportAgentRunError).toHaveBeenCalledWith(
      'unsupported-provider-run',
      'unsupported-provider-claim',
      { error: 'generateSupportResponse: unsupported durable run provider: anthropic' },
    )
  })

  it('records a non-keyed provider failure on its durable run', async () => {
    const updateSupportAgentRunError = vi
      .fn<NonNullable<GenerateSupportResponseDeps['updateSupportAgentRunError']>>()
      .mockResolvedValue(undefined)

    await generateSupportResponse(thread.id, {
      getSupportThreadById: async () => thread,
      getSupportMessagesByThreadId: async () => ({ results: [inbound], page_info: pageInfo }),
      createSupportAgentRun: async () =>
        ({
          id: 'non-keyed-provider-failure',
          support_thread_id: thread.id,
          support_message_id: inbound.id,
          model_name: 'claude-sonnet-5',
          model_provider: 'anthropic',
        }) as CustomerSupport.SupportAgentRun,
      updateSupportAgentRunError,
    })

    expect(updateSupportAgentRunError).toHaveBeenCalledWith('non-keyed-provider-failure', {
      error: 'generateSupportResponse: unsupported durable run provider: anthropic',
    })
  })
})
