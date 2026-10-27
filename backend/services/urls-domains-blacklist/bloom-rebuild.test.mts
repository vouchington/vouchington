import type { Job } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wrapSingleProcessor } from '@data-stores/valkey-glide-mq/guarded-worker-processors'
import { bloomValkeyClient } from '@data-stores/valkey/clients'
import {
  BLOOM_FILTER_DEFAULTS,
  blocklistBloomRebuildFollowUpJobId,
  bloomFilterRebuildJobId,
  QUEUE_NAME,
} from '@queues/bloom-filters/config'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import { bloomFilters } from '@queues/bloom-filters/queues'
import {
  bumpBlocklistBloomGeneration,
  rebuildCurrentBlocklistBloomFilter,
} from './bloom-rebuild.mts'

const emailBlocklist = { filter: 'email-blocklist' } as const
const emailPrimaryJobId = bloomFilterRebuildJobId(emailBlocklist.filter)
const emailFollowUpJobId = blocklistBloomRebuildFollowUpJobId(emailBlocklist.filter)

describe('blocklist bloom rebuild generation', () => {
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

  it('does not snapshot a generation younger than the replica-lag margin', async () => {
    const existing = await bloomFilters.getJob(emailPrimaryJobId)
    let streamed = false
    try {
      await bumpBlocklistBloomGeneration(emailBlocklist.filter, Date.now())
      await rebuildCurrentBlocklistBloomFilter({
        filter: emailBlocklist.filter,
        readyKey: 'bloom-filter:email-blocklist:ready:coverage',
        stream: async () => {
          streamed = true
        },
      })
      expect(streamed).toBe(false)
      expect(await bloomFilters.getJob(emailPrimaryJobId)).toBeTruthy()
    } finally {
      await bumpBlocklistBloomGeneration(
        emailBlocklist.filter,
        Date.now() - BLOOM_FILTER_DEFAULTS.replicaLagSafetyMarginMs - 1,
      )
      if (!existing) await (await bloomFilters.getJob(emailPrimaryJobId))?.remove()
    }
  })

  it('reads numeric, binary, and empty script results as generation text', async () => {
    const invokeScript = vi.spyOn(bloomValkeyClient, 'invokeScript')
    invokeScript.mockResolvedValueOnce(7 as never)
    await expect(bumpBlocklistBloomGeneration(emailBlocklist.filter, 1)).resolves.toBe('7')

    invokeScript.mockResolvedValueOnce(Buffer.from('8:1') as never)
    await expect(bumpBlocklistBloomGeneration(emailBlocklist.filter, 1)).resolves.toBe('8:1')

    invokeScript.mockResolvedValueOnce({ unexpected: true } as never)
    await expect(bumpBlocklistBloomGeneration(emailBlocklist.filter, 1)).resolves.toBe('0')
  })
})

function unchangeableJob(): { changeDelay: () => Promise<void> } {
  return {
    changeDelay: async () => {
      throw new Error('Cannot change delay: invalid_state')
    },
  }
}
