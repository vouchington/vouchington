import type { Job } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wrapSingleProcessor } from '@data-stores/valkey-glide-mq/guarded-worker-processors'
import {
  blocklistBloomRebuildFollowUpJobId,
  bloomFilterRebuildJobId,
  QUEUE_NAME,
} from './config.mts'
import { enqueueRebuildBloomFilter } from './enqueues.mts'
import { bloomFilters } from './queues.mts'

const emailBlocklist = { filter: 'email-blocklist' } as const
const emailPrimaryJobId = bloomFilterRebuildJobId(emailBlocklist.filter)
const emailFollowUpJobId = blocklistBloomRebuildFollowUpJobId(emailBlocklist.filter)

describe('blocklist rebuild admission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries the primary id after the follow-up cannot move', async () => {
    let adds = 0
    vi.spyOn(bloomFilters, 'add').mockImplementation(async () => {
      adds += 1
      return (adds === 3 ? { id: emailPrimaryJobId } : null) as never
    })
    vi.spyOn(bloomFilters, 'getJob').mockResolvedValue(unchangeableJob() as never)

    await expect(enqueueRebuildBloomFilter(emailBlocklist)).resolves.toBeNull()
    expect(adds).toBe(3)
  })

  it('throws when every blocklist rebuild id is refused', async () => {
    vi.spyOn(bloomFilters, 'add').mockResolvedValue(null as never)
    vi.spyOn(bloomFilters, 'getJob').mockResolvedValue(unchangeableJob() as never)

    await expect(enqueueRebuildBloomFilter(emailBlocklist)).rejects.toThrow(
      'Blocklist bloom rebuild for email-blocklist was not admitted',
    )
  })

  it('rethrows a delay change that is not an admission refusal', async () => {
    const failure = new Error('connection reset')
    vi.spyOn(bloomFilters, 'add').mockResolvedValue(null as never)
    vi.spyOn(bloomFilters, 'getJob').mockResolvedValue({
      changeDelay: async () => {
        throw failure
      },
    } as never)

    await expect(enqueueRebuildBloomFilter(emailBlocklist)).rejects.toBe(failure)
  })

  it('skips the rebuild id that is already running and admits the follow-up', async () => {
    const existing = await bloomFilters.getJob(emailFollowUpJobId)
    const run = wrapSingleProcessor(
      QUEUE_NAME,
      async () => {
        await enqueueRebuildBloomFilter(emailBlocklist)
      },
      {},
    )
    try {
      await run({ id: emailPrimaryJobId, opts: {} } as Job)
      expect(await bloomFilters.getJob(emailFollowUpJobId)).toBeTruthy()
    } finally {
      if (!existing) await (await bloomFilters.getJob(emailFollowUpJobId))?.remove()
    }
  })
})

function unchangeableJob(): { changeDelay: () => Promise<void> } {
  return {
    changeDelay: async () => {
      throw new Error('Cannot change delay: invalid_state')
    },
  }
}
