import { afterEach, describe, expect, it, vi } from 'vitest'
import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { bloomFilterRebuildJobId } from '@queues/bloom-filters/config'
import { bloomFilters } from '@queues/bloom-filters/queues'
import {
  bumpBlocklistBloomGeneration,
  rebuildCurrentBlocklistBloomFilter,
} from './bloom-rebuild.mts'

const emailBlocklist = 'email-blocklist' as const
const emailPrimaryJobId = bloomFilterRebuildJobId(emailBlocklist)

describe('blocklist bloom rebuild generation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not snapshot a generation the replica cannot see', async () => {
    const existing = await bloomFilters.getJob(emailPrimaryJobId)
    let streamed = false
    try {
      await bumpBlocklistBloomGeneration(emailBlocklist, '999999999999999')
      await rebuildCurrentBlocklistBloomFilter({
        filter: emailBlocklist,
        readyKey: 'bloom-filter:email-blocklist:ready:coverage',
        stream: async () => {
          streamed = true
        },
      })
      expect(streamed).toBe(false)
      expect(await bloomFilters.getJob(emailPrimaryJobId)).toBeTruthy()
    } finally {
      await bumpBlocklistBloomGeneration(emailBlocklist)
      if (!existing) await (await bloomFilters.getJob(emailPrimaryJobId))?.remove()
    }
  })

  it('reads numeric, binary, and empty script results as generation text', async () => {
    const invokeScript = vi.spyOn(bloomValkeyClient, 'invokeScript')
    invokeScript.mockResolvedValueOnce(7 as never)
    await expect(bumpBlocklistBloomGeneration(emailBlocklist, '1')).resolves.toBe('7')

    invokeScript.mockResolvedValueOnce(Buffer.from('8:1') as never)
    await expect(bumpBlocklistBloomGeneration(emailBlocklist, '1')).resolves.toBe('8:1')

    invokeScript.mockResolvedValueOnce({ unexpected: true } as never)
    await expect(bumpBlocklistBloomGeneration(emailBlocklist, '1')).resolves.toBe('0')
  })
})
