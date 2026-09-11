import { describe, expect, it, vi } from 'vitest'
import { enqueueOrRetryBulkCustomerSupport } from './customer-support.mts'

describe('customer-support enqueues', () => {
  it('does not scan the failed queue for an empty recovery page', async () => {
    const enqueueBulk = vi.fn<() => Promise<never[]>>().mockResolvedValue([])
    const getFailedJobs = vi.fn<() => Promise<never[]>>().mockResolvedValue([])
    const getJob = vi.fn<() => Promise<null>>().mockResolvedValue(null)

    await expect(
      enqueueOrRetryBulkCustomerSupport([], { enqueueBulk, getJob, getFailedJobs }),
    ).resolves.toBe(0)
    expect(enqueueBulk).not.toHaveBeenCalled()
    expect(getJob).not.toHaveBeenCalled()
    expect(getFailedJobs).not.toHaveBeenCalled()
  })

  it('retries only retained failed jobs matching durable recovery candidates', async () => {
    const candidate = {
      threadId: 'thread-current',
      supportMessageId: 'message-current',
      logicalJobId: 'support_inbound_email__message-current__customer_support',
    }
    const retryCurrent = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const retryOther = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueueBulk = vi.fn<() => Promise<never[]>>().mockResolvedValue([])

    await expect(
      enqueueOrRetryBulkCustomerSupport([candidate], {
        enqueueBulk,
        getJob: async () => null,
        getFailedJobs: async () => [
          { id: candidate.logicalJobId, name: 'customer-support', retry: retryCurrent },
          { id: 'other-customer-support', name: 'customer-support', retry: retryOther },
          { id: candidate.logicalJobId, name: 'chat', retry: retryOther },
        ],
      }),
    ).resolves.toBe(1)

    expect(enqueueBulk).toHaveBeenCalledWith([candidate])
    expect(retryCurrent).toHaveBeenCalledOnce()
    expect(retryOther).not.toHaveBeenCalled()
  })

  it('removes only matching retained completed jobs before re-enqueueing', async () => {
    const candidate = {
      threadId: 'thread-orphan',
      supportMessageId: 'message-orphan',
      logicalJobId: 'support_inbound_email__message-orphan__customer_support',
    }
    const events: string[] = []
    const removeCurrent = vi.fn<() => Promise<void>>(async () => {
      events.push('remove')
    })
    const getStateCurrent = vi.fn<() => Promise<string>>().mockResolvedValue('completed')

    await expect(
      enqueueOrRetryBulkCustomerSupport([candidate], {
        getJob: async id =>
          id === candidate.logicalJobId
            ? {
                id,
                name: 'customer-support',
                getState: getStateCurrent,
                remove: removeCurrent,
              }
            : null,
        enqueueBulk: async () => {
          events.push('enqueue')
          return []
        },
        getFailedJobs: async () => [],
      }),
    ).resolves.toBe(0)

    expect(removeCurrent).toHaveBeenCalledOnce()
    expect(getStateCurrent).toHaveBeenCalledOnce()
    expect(events).toEqual(['remove', 'enqueue'])
  })

  it('does not remove a stable ID occupied by another job name', async () => {
    const candidate = {
      threadId: 'thread-wrong-name',
      supportMessageId: 'message-wrong-name',
      logicalJobId: 'support_inbound_email__message-wrong-name__customer_support',
    }
    const remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const getState = vi.fn<() => Promise<string>>().mockResolvedValue('completed')
    await enqueueOrRetryBulkCustomerSupport([candidate], {
      getJob: async id => ({ id, name: 'chat', getState, remove }),
      enqueueBulk: async () => [],
      getFailedJobs: async () => [],
    })
    expect(getState).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('aborts re-enqueue when retained completed-job removal fails', async () => {
    const candidate = {
      threadId: 'thread-remove-failure',
      supportMessageId: 'message-remove-failure',
      logicalJobId: 'support_inbound_email__message-remove-failure__customer_support',
    }
    const enqueueBulk = vi.fn<() => Promise<never[]>>().mockResolvedValue([])
    await expect(
      enqueueOrRetryBulkCustomerSupport([candidate], {
        getJob: async id => ({
          id,
          name: 'customer-support',
          getState: async () => 'completed',
          remove: async () => {
            throw new Error('remove failed')
          },
        }),
        enqueueBulk,
        getFailedJobs: async () => [],
      }),
    ).rejects.toThrow('remove failed')
    expect(enqueueBulk).not.toHaveBeenCalled()
  })
})
