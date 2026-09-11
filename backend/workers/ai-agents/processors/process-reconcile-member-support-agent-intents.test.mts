import { describe, expect, it, vi } from 'vitest'
import {
  processReconcileMemberSupportAgentIntents,
  type ReconcileMemberSupportAgentIntentsDeps,
} from './process-reconcile-member-support-agent-intents.mts'

describe('processReconcileMemberSupportAgentIntents', () => {
  it('enqueues each durable page before advancing its cursor', async () => {
    const first = {
      threadId: 'thread-one',
      supportMessageId: 'message-one',
      logicalJobId: 'support_member_thread__message-one__customer_support',
    }
    const second = {
      threadId: 'thread-two',
      supportMessageId: 'message-two',
      logicalJobId: 'support_member_thread__message-two__customer_support',
    }
    const events: string[] = []
    const listPendingMemberSupportAgentIntents = vi
      .fn<ReconcileMemberSupportAgentIntentsDeps['listPendingMemberSupportAgentIntents']>()
      .mockImplementationOnce(async () => {
        events.push('list:first')
        return {
          results: [first],
          page_info: { has_next_page: true, start_cursor: 'start', end_cursor: 'page-one' },
        }
      })
      .mockImplementationOnce(async () => {
        events.push('list:second')
        return {
          results: [second],
          page_info: { has_next_page: false, start_cursor: 'start', end_cursor: null },
        }
      })
    const enqueueOrRetryBulkCustomerSupport = vi
      .fn<ReconcileMemberSupportAgentIntentsDeps['enqueueOrRetryBulkCustomerSupport']>()
      .mockImplementation(async jobs => {
        events.push(`enqueue:${jobs[0]?.supportMessageId}`)
        return 0
      })

    await processReconcileMemberSupportAgentIntents({
      listPendingMemberSupportAgentIntents,
      enqueueOrRetryBulkCustomerSupport,
    })

    expect(listPendingMemberSupportAgentIntents).toHaveBeenNthCalledWith(1, {})
    expect(listPendingMemberSupportAgentIntents).toHaveBeenNthCalledWith(2, { after: 'page-one' })
    expect(enqueueOrRetryBulkCustomerSupport).toHaveBeenNthCalledWith(1, [first])
    expect(enqueueOrRetryBulkCustomerSupport).toHaveBeenNthCalledWith(2, [second])
    expect(events).toEqual([
      'list:first',
      'enqueue:message-one',
      'list:second',
      'enqueue:message-two',
    ])
  })

  it('does not enqueue when no member-created draft intent is pending', async () => {
    const enqueueOrRetryBulkCustomerSupport =
      vi.fn<ReconcileMemberSupportAgentIntentsDeps['enqueueOrRetryBulkCustomerSupport']>()

    await processReconcileMemberSupportAgentIntents({
      listPendingMemberSupportAgentIntents: async () => ({
        results: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }),
      enqueueOrRetryBulkCustomerSupport,
    })

    expect(enqueueOrRetryBulkCustomerSupport).toHaveBeenCalledWith([])
  })
})
