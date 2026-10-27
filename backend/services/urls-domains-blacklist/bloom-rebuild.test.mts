import { afterEach, describe, expect, it, vi } from 'vitest'
import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { bloomFilterRebuildJobId } from '@queues/bloom-filters/config'
import { bloomFilters } from '@queues/bloom-filters/queues'
import { blocklistRebuildSnapshotIsStable } from '@voucha/test-helpers/blocklist-bloom-snapshot'
import { invalidateEmailBlocklistReadyMarker } from './email-bloom-filter.mts'
import { invalidateUrlBlocklistReadyMarker } from './bloom-filter.mts'
import { blocklistBloomReadyKey } from './ready-marker.mts'
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

  it('streams the blocklist on the replica transaction that checked visibility', async () => {
    const readyKey = `bloom-filter:email-blocklist:ready:same-snapshot-${crypto.randomUUID()}`
    try {
      await bumpBlocklistBloomGeneration(emailBlocklist)
      let stable = false
      await rebuildCurrentBlocklistBloomFilter({
        filter: emailBlocklist,
        readyKey,
        stream: async client => {
          stable = await blocklistRebuildSnapshotIsStable(client)
        },
      })
      expect(stable).toBe(true)
    } finally {
      await bloomValkeyClient.unlink([readyKey])
    }
  })

  it('removes the ready marker when the generation bump fails', async () => {
    const order: string[] = []
    vi.spyOn(bloomValkeyClient, 'invokeScript').mockImplementation(async () => {
      order.push('bump')
      throw new Error('bump failed')
    })
    vi.spyOn(bloomValkeyClient, 'unlink').mockImplementation(async keys => {
      order.push(keys.join(','))
      return 1
    })

    await expect(invalidateUrlBlocklistReadyMarker()).rejects.toThrow('bump failed')
    await expect(invalidateEmailBlocklistReadyMarker()).rejects.toThrow('bump failed')
    expect(order).toEqual([
      'bump',
      blocklistBloomReadyKey('url-blocklist'),
      'bump',
      blocklistBloomReadyKey('email-blocklist'),
    ])
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
