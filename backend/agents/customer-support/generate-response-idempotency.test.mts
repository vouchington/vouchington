import { describe, expect, it, vi } from 'vitest'
import type * as CustomerSupport from '@services/customer-support/types'
import type { BasicUser } from '@services/users/types'
import { generateSupportResponse, type GenerateSupportResponseDeps } from './generate-response.mts'
const thread = {
  id: 'thread-1',
  subject: 'Duplicate delivery',
} as CustomerSupport.SupportThreadWithStatus
const firstInbound = {
  id: 'message-1',
  support_thread_id: thread.id,
  direction: 'inbound',
  body_text: 'First inbound message.',
  created_at: new Date('2026-01-01T00:00:00Z'),
} as CustomerSupport.SupportMessage
const secondInbound = {
  ...firstInbound,
  id: 'message-2',
  body_text: 'Second inbound message.',
  created_at: new Date('2026-01-01T00:01:00Z'),
} as CustomerSupport.SupportMessage
const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }
const supportAgentUser = {
  id: 'support-agent-1',
  username: 'customer-support',
  roles: ['customer_support'],
} as unknown as BasicUser
describe('generateSupportResponse idempotency', () => {
  it('anchors two rapid inbound jobs to their distinct triggering messages', async () => {
    const claimKeyedSupportAgentRun = vi
      .fn<NonNullable<GenerateSupportResponseDeps['claimKeyedSupportAgentRun']>>()
      .mockImplementation(
        async params =>
          ({
            id: `run-for-${params.supportMessageId}`,
            claim_token: `claim-for-${params.supportMessageId}`,
            support_thread_id: thread.id,
            support_message_id: params.supportMessageId,
            model_name: 'gpt-5.4-nano',
            model_provider: 'openai',
          }) as CustomerSupport.SupportAgentRun,
      )
    const runToolLoop = vi
      .fn<NonNullable<GenerateSupportResponseDeps['runToolLoop']>>()
      .mockResolvedValue({ text: null, iterations: 1, terminationReason: 'no_tool_calls' })
    const finalizeKeyedSupportAgentRun = vi
      .fn<NonNullable<GenerateSupportResponseDeps['finalizeKeyedSupportAgentRun']>>()
      .mockResolvedValue(true)
    const getSupportMessagesByThreadId = vi
      .fn<NonNullable<GenerateSupportResponseDeps['getSupportMessagesByThreadId']>>()
      .mockImplementation(async (_threadId, options) => ({
        results:
          options?.atOrBeforeMessageId === firstInbound.id
            ? [firstInbound]
            : [firstInbound, secondInbound],
        page_info: pageInfo,
      }))
    const sharedDependencies = {
      getSupportThreadById: async () => thread,
      getSupportMessagesByThreadId,
      claimKeyedSupportAgentRun,
      runToolLoop,
      finalizeKeyedSupportAgentRun,
      getCustomerSupportAgentUser: async () => supportAgentUser,
    }
    await generateSupportResponse(thread.id, {
      ...sharedDependencies,
      idempotencyKey: 'inbound-first',
      supportMessageId: firstInbound.id,
    })
    await generateSupportResponse(thread.id, {
      ...sharedDependencies,
      idempotencyKey: 'inbound-second',
      supportMessageId: secondInbound.id,
    })
    expect(claimKeyedSupportAgentRun.mock.calls.map(([params]) => params.supportMessageId)).toEqual(
      [firstInbound.id, secondInbound.id],
    )
    expect(getSupportMessagesByThreadId.mock.calls.map(([, options]) => options)).toEqual([
      { limit: 20, atOrBeforeMessageId: firstInbound.id, readOnly: false },
      { limit: 20, atOrBeforeMessageId: secondInbound.id, readOnly: false },
    ])
    expect(runToolLoop.mock.calls[0]?.[0].input).toContain('First inbound message.')
    expect(runToolLoop.mock.calls[0]?.[0].input).not.toContain('Second inbound message.')
    expect(runToolLoop.mock.calls[1]?.[0].input).toContain('Second inbound message.')
  })

  it('loads a delayed trigger from an anchored window instead of the latest page', async () => {
    const triggeringInbound = {
      ...firstInbound,
      id: 'message-delayed-trigger',
      body_text: 'Delayed triggering message outside the latest context page.',
      created_at: new Date('2026-01-01T00:00:30Z'),
    } as CustomerSupport.SupportMessage
    const claimKeyedSupportAgentRun = vi
      .fn<NonNullable<GenerateSupportResponseDeps['claimKeyedSupportAgentRun']>>()
      .mockResolvedValue({
        id: 'run-for-missing-message',
        claim_token: 'claim-for-missing-message',
        support_thread_id: thread.id,
        support_message_id: triggeringInbound.id,
        model_name: 'gpt-5.4-nano',
        model_provider: 'openai',
      } as CustomerSupport.SupportAgentRun)
    const runToolLoop = vi
      .fn<NonNullable<GenerateSupportResponseDeps['runToolLoop']>>()
      .mockResolvedValue({
        text: 'Draft response for the triggering message.',
        iterations: 1,
        terminationReason: 'no_tool_calls',
      })
    const finalizeKeyedSupportAgentRun = vi
      .fn<NonNullable<GenerateSupportResponseDeps['finalizeKeyedSupportAgentRun']>>()
      .mockResolvedValue(true)
    const laterMessages = Array.from({ length: 20 }, (_, index) => ({
      ...secondInbound,
      id: `message-later-${index}`,
      body_text: `Later message ${index}`,
      created_at: new Date(secondInbound.created_at.getTime() + index + 1),
    })) as CustomerSupport.SupportMessage[]
    const getSupportMessagesByThreadId = vi
      .fn<NonNullable<GenerateSupportResponseDeps['getSupportMessagesByThreadId']>>()
      .mockImplementation(async (_threadId, options) => ({
        results: options?.atOrBeforeMessageId ? [firstInbound, triggeringInbound] : laterMessages,
        page_info: pageInfo,
      }))
    await generateSupportResponse(thread.id, {
      idempotencyKey: 'inbound-missing-from-page',
      supportMessageId: triggeringInbound.id,
      getSupportThreadById: async () => thread,
      getSupportMessagesByThreadId,
      claimKeyedSupportAgentRun,
      runToolLoop,
      finalizeKeyedSupportAgentRun,
      getCustomerSupportAgentUser: async () => supportAgentUser,
    })
    expect(claimKeyedSupportAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        supportMessageId: triggeringInbound.id,
        input: { thread_subject: thread.subject, message_count: 2 },
      }),
    )
    expect(getSupportMessagesByThreadId).toHaveBeenCalledWith(thread.id, {
      limit: 20,
      atOrBeforeMessageId: triggeringInbound.id,
      readOnly: false,
    })
    const input = runToolLoop.mock.calls[0]?.[0].input
    expect(input).toContain('First inbound message.')
    expect(input).toContain('Delayed triggering message outside the latest context page.')
    expect(input).not.toContain('Later message 0')
    expect(finalizeKeyedSupportAgentRun).toHaveBeenCalledWith({
      threadId: thread.id,
      supportMessageId: triggeringInbound.id,
      agentRunId: 'run-for-missing-message',
      claimToken: 'claim-for-missing-message',
      responseText: 'Draft response for the triggering message.',
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })
  })
  it('records and rethrows a keyed generation failure so the queue can retry it', async () => {
    const failure = new Error('OpenAI temporarily unavailable')
    const updateClaimedSupportAgentRunError = vi
      .fn<NonNullable<GenerateSupportResponseDeps['updateClaimedSupportAgentRunError']>>()
      .mockResolvedValue(true)
    await expect(
      generateSupportResponse(thread.id, {
        idempotencyKey: 'inbound-retryable-failure',
        supportMessageId: firstInbound.id,
        getSupportThreadById: async () => thread,
        getSupportMessagesByThreadId: async () => ({
          results: [firstInbound],
          page_info: pageInfo,
        }),
        claimKeyedSupportAgentRun: async () =>
          ({
            id: 'run-retryable-failure',
            claim_token: 'claim-retryable-failure',
            support_thread_id: thread.id,
            support_message_id: firstInbound.id,
            model_name: 'gpt-5.4-nano',
            model_provider: 'openai',
          }) as CustomerSupport.SupportAgentRun,
        runToolLoop: async () => {
          throw failure
        },
        updateClaimedSupportAgentRunError,
        getCustomerSupportAgentUser: async () => supportAgentUser,
      }),
    ).rejects.toBe(failure)
    expect(updateClaimedSupportAgentRunError).toHaveBeenCalledWith(
      'run-retryable-failure',
      'claim-retryable-failure',
      { error: failure.message },
    )
  })

  it('does not fail the queue attempt after a newer claim fenced a stale failure', async () => {
    const updateClaimedSupportAgentRunError = vi
      .fn<NonNullable<GenerateSupportResponseDeps['updateClaimedSupportAgentRunError']>>()
      .mockResolvedValue(false)
    await expect(
      generateSupportResponse(thread.id, {
        idempotencyKey: 'inbound-stale-failure',
        supportMessageId: firstInbound.id,
        getSupportThreadById: async () => thread,
        getSupportMessagesByThreadId: async () => ({
          results: [firstInbound],
          page_info: pageInfo,
        }),
        claimKeyedSupportAgentRun: async () =>
          ({
            id: 'run-stale-failure',
            claim_token: 'claim-stale-failure',
            support_thread_id: thread.id,
            support_message_id: firstInbound.id,
            model_name: 'gpt-5.4-nano',
            model_provider: 'openai',
          }) as CustomerSupport.SupportAgentRun,
        runToolLoop: async () => {
          throw new Error('Stale provider failure')
        },
        updateClaimedSupportAgentRunError,
        getCustomerSupportAgentUser: async () => supportAgentUser,
      }),
    ).resolves.toBeUndefined()
    expect(updateClaimedSupportAgentRunError).toHaveBeenCalledOnce()
  })

  it('rejects a keyed job retryably when its thread is missing', async () => {
    await expect(
      generateSupportResponse(thread.id, {
        idempotencyKey: 'missing-thread',
        supportMessageId: firstInbound.id,
        getSupportThreadById: async () => null,
      }),
    ).rejects.toThrow(`thread not found: ${thread.id}`)
  })

  it('rejects a keyed job retryably when its anchored message window is empty', async () => {
    await expect(
      generateSupportResponse(thread.id, {
        idempotencyKey: 'empty-window',
        supportMessageId: firstInbound.id,
        getSupportThreadById: async () => thread,
        getSupportMessagesByThreadId: async () => ({ results: [], page_info: pageInfo }),
      }),
    ).rejects.toThrow(`message window is empty: ${firstInbound.id}`)
  })

  it('rejects a keyed job retryably when its anchor is missing or not inbound', async () => {
    const outboundAnchor = {
      ...firstInbound,
      direction: 'outbound',
    } as CustomerSupport.SupportMessage
    const base = {
      idempotencyKey: 'invalid-anchor',
      getSupportThreadById: async () => thread,
    } as const
    await expect(
      generateSupportResponse(thread.id, {
        ...base,
        supportMessageId: 'message-missing',
        getSupportMessagesByThreadId: async () => ({
          results: [firstInbound],
          page_info: pageInfo,
        }),
      }),
    ).rejects.toThrow('triggering inbound message is unavailable: message-missing')
    await expect(
      generateSupportResponse(thread.id, {
        ...base,
        supportMessageId: outboundAnchor.id,
        getSupportMessagesByThreadId: async () => ({
          results: [outboundAnchor],
          page_info: pageInfo,
        }),
      }),
    ).rejects.toThrow(`triggering inbound message is unavailable: ${outboundAnchor.id}`)
  })
})
