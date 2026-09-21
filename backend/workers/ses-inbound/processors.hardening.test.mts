import { describe, expect, it, vi } from 'vitest'
import { reconcileSesInboundEmails } from './processors.mts'

describe('SES inbound recovery reconciliation', () => {
  it('advances the PostgreSQL cursor only after each page fan-out is awaited', async () => {
    const first = {
      threadId: 'thread-first',
      supportMessageId: 'message-first',
      logicalJobId: 'support_inbound_email__message-first__customer_support',
    }
    const second = {
      threadId: 'thread-second',
      supportMessageId: 'message-second',
      logicalJobId: 'support_inbound_email__message-second__customer_support',
    }
    const events: string[] = []
    let releaseFirstEnqueue!: () => void
    const firstEnqueueGate = new Promise<void>(resolve => {
      releaseFirstEnqueue = resolve
    })
    type ReconcileDependencies = NonNullable<Parameters<typeof reconcileSesInboundEmails>[0]>
    const listCandidates = vi
      .fn<NonNullable<ReconcileDependencies['listInboundCustomerSupportRecoveryCandidates']>>()
      .mockImplementationOnce(async () => {
        events.push('list:first')
        return {
          results: [first],
          page_info: { has_next_page: true, start_cursor: 'start', end_cursor: 'opaque-page-1' },
        }
      })
      .mockImplementationOnce(async () => {
        events.push('list:second')
        return {
          results: [second],
          page_info: { has_next_page: false, start_cursor: 'start', end_cursor: null },
        }
      })
    const enqueueCustomerSupport = vi
      .fn<NonNullable<ReconcileDependencies['enqueueOrRetryBulkCustomerSupport']>>()
      .mockImplementationOnce(async () => {
        events.push('enqueue:first')
        await firstEnqueueGate
        return 0
      })
      .mockImplementationOnce(async () => {
        events.push('enqueue:second')
        return 0
      })

    const reconciliation = reconcileSesInboundEmails({
      listSesInboundObjects: async () => ({ objectKeys: [] }),
      listCopyrightSesInboundObjects: async () => ({ objectKeys: [] }),
      enqueueOrRetryBulkSesInboundProcess: async () => 0,
      listInboundCustomerSupportRecoveryCandidates: listCandidates,
      enqueueOrRetryBulkCustomerSupport: enqueueCustomerSupport,
    })
    await vi.waitFor(() => expect(enqueueCustomerSupport).toHaveBeenCalledTimes(1))
    expect(listCandidates).toHaveBeenCalledTimes(1)
    releaseFirstEnqueue()

    await expect(reconciliation).resolves.toEqual({ enqueued: 0, customerSupportEnqueued: 2 })
    expect(listCandidates).toHaveBeenNthCalledWith(1, {})
    expect(listCandidates).toHaveBeenNthCalledWith(2, { after: 'opaque-page-1' })
    expect(enqueueCustomerSupport).toHaveBeenNthCalledWith(1, [first])
    expect(enqueueCustomerSupport).toHaveBeenNthCalledWith(2, [second])
    expect(events).toEqual(['list:first', 'enqueue:first', 'list:second', 'enqueue:second'])
  })
})
