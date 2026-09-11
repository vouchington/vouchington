import { describe, expect, it, vi } from 'vitest'
import type {
  SupportAgentRun,
  SupportMessage,
  SupportThreadWithStatus,
} from '@services/customer-support/types'
import type { BasicUser } from '@services/users/types'
import { generateSupportResponse, type GenerateSupportResponseDeps } from './generate-response.mts'

const thread = { id: 'thread-1', subject: 'Claim authority' } as SupportThreadWithStatus
const firstInbound = {
  id: 'message-1',
  support_thread_id: thread.id,
  direction: 'inbound',
  body_text: 'Stale inbound context.',
} as SupportMessage
const secondInbound = {
  ...firstInbound,
  id: 'message-2',
  body_text: 'Current inbound context.',
} as SupportMessage
const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }
const supportAgentUser = { roles: ['customer_support'] } as unknown as BasicUser

describe('generateSupportResponse keyed authority', () => {
  it('reloads claimed staff context after its reservation advances beyond the stale payload', async () => {
    const claimKeyedSupportAgentRun = vi
      .fn<NonNullable<GenerateSupportResponseDeps['claimKeyedSupportAgentRun']>>()
      .mockResolvedValue({
        id: 'staff-run',
        claim_token: 'staff-claim',
        support_thread_id: thread.id,
        support_message_id: secondInbound.id,
        model_name: 'gpt-5.4-nano',
        model_provider: 'openai',
      } as SupportAgentRun)
    const getSupportMessagesByThreadId = vi
      .fn<NonNullable<GenerateSupportResponseDeps['getSupportMessagesByThreadId']>>()
      .mockImplementation(async (_threadId, options) => ({
        results:
          options?.atOrBeforeMessageId === firstInbound.id
            ? [firstInbound]
            : [firstInbound, secondInbound],
        page_info: pageInfo,
      }))
    const runToolLoop = vi
      .fn<NonNullable<GenerateSupportResponseDeps['runToolLoop']>>()
      .mockResolvedValue({ text: null, iterations: 1, terminationReason: 'no_tool_calls' })
    const finalizeKeyedSupportAgentRun = vi
      .fn<NonNullable<GenerateSupportResponseDeps['finalizeKeyedSupportAgentRun']>>()
      .mockResolvedValue(true)

    await generateSupportResponse(thread.id, {
      idempotencyKey: 'staff-reservation-key',
      supportMessageId: firstInbound.id,
      getSupportThreadById: async () => thread,
      getSupportAgentRunByIdempotencyKey: async () => null,
      getSupportMessagesByThreadId,
      claimKeyedSupportAgentRun,
      runToolLoop,
      finalizeKeyedSupportAgentRun,
      getCustomerSupportAgentUser: async () => supportAgentUser,
    })

    expect(claimKeyedSupportAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ supportMessageId: firstInbound.id }),
    )
    expect(getSupportMessagesByThreadId.mock.calls.map(([, options]) => options)).toEqual([
      { limit: 20, atOrBeforeMessageId: firstInbound.id, readOnly: false },
      { limit: 20, atOrBeforeMessageId: secondInbound.id, readOnly: false },
    ])
    expect(runToolLoop.mock.calls[0]?.[0].input).toContain(secondInbound.body_text)
    expect(finalizeKeyedSupportAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ supportMessageId: secondInbound.id }),
    )
  })
})
