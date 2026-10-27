import { afterEach, describe, expect, it, vi } from 'vitest'
import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { bloomFilterRebuildJobId } from '@queues/bloom-filters/config'
import { bloomFilters } from '@queues/bloom-filters/queues'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  blocklistRebuildSnapshotIsStable,
  openUncommittedPrimaryTransaction,
} from '@voucha/test-helpers/blocklist-bloom-snapshot'
import { invalidateEmailBlocklistReadyMarker } from './email-bloom-filter.mts'
import { invalidateUrlBlocklistReadyMarker } from './bloom-filter.mts'
import {
  blocklistBloomVisibilityRetriesKey,
  bumpBlocklistBloomGeneration,
  generationVisibleThrough,
  readBlocklistBloomGeneration,
} from './bloom-generation.mts'
import { blocklistBloomReadyKey } from './ready-marker.mts'
import { rebuildCurrentBlocklistBloomFilter } from './bloom-rebuild.mts'
import { urlsDomainsBlacklistWorkConfig } from './work-limits.mts'

const emailBlocklist = 'email-blocklist' as const
const emailPrimaryJobId = bloomFilterRebuildJobId(emailBlocklist)
const staleTransactionId = '999999999999999'
const retriesKey = blocklistBloomVisibilityRetriesKey(emailBlocklist)

async function removeQueuedRebuild(existing: unknown): Promise<void> {
  if (!existing) await (await bloomFilters.getJob(emailPrimaryJobId))?.remove()
}

describe('blocklist bloom rebuild generation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not snapshot a generation the replica cannot see yet', async () => {
    const existing = await bloomFilters.getJob(emailPrimaryJobId)
    const pending = await openUncommittedPrimaryTransaction()
    let streamed = false
    try {
      await bumpBlocklistBloomGeneration(emailBlocklist, pending.id)
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
      await pending.rollback()
      await bumpBlocklistBloomGeneration(emailBlocklist)
      await bloomValkeyClient.unlink([retriesKey])
      await removeQueuedRebuild(existing)
    }
  })

  it('stops retrying a generation the replica never sees once the cap is reached', async () => {
    const existing = await bloomFilters.getJob(emailPrimaryJobId)
    const restore = overrideDynamicConfigFieldsForTest(urlsDomainsBlacklistWorkConfig, {
      blocklist_bloom_visibility_retries: 1,
    })
    const pending = await openUncommittedPrimaryTransaction()
    const rebuild = () =>
      rebuildCurrentBlocklistBloomFilter({
        filter: emailBlocklist,
        readyKey: 'bloom-filter:email-blocklist:ready:cap',
        stream: async () => undefined,
      })
    try {
      await bumpBlocklistBloomGeneration(emailBlocklist, pending.id)
      await rebuild()
      await (await bloomFilters.getJob(emailPrimaryJobId))?.remove()
      await rebuild()
      expect(await bloomFilters.getJob(emailPrimaryJobId)).toBeFalsy()
      expect(await bloomValkeyClient.get(retriesKey)).toBeNull()
    } finally {
      restore()
      await pending.rollback()
      await bumpBlocklistBloomGeneration(emailBlocklist)
      await bloomValkeyClient.unlink([retriesKey])
      await removeQueuedRebuild(existing)
    }
  })

  it('replaces a generation the primary never issued and then streams', async () => {
    const existing = await bloomFilters.getJob(emailPrimaryJobId)
    const readyKey = `bloom-filter:email-blocklist:ready:stale-${crypto.randomUUID()}`
    let streams = 0
    const rebuild = () =>
      rebuildCurrentBlocklistBloomFilter({
        filter: emailBlocklist,
        readyKey,
        stream: async () => {
          streams += 1
        },
      })
    try {
      await bumpBlocklistBloomGeneration(emailBlocklist, staleTransactionId)
      await rebuild()
      const replaced = await readBlocklistBloomGeneration(emailBlocklist)
      expect(generationVisibleThrough(replaced)).not.toBe(staleTransactionId)
      expect(streams).toBe(0)
      expect(await bloomFilters.getJob(emailPrimaryJobId)).toBeTruthy()
      await rebuild()
      expect(streams).toBe(1)
    } finally {
      await bloomValkeyClient.unlink([readyKey])
      await removeQueuedRebuild(existing)
    }
  })

  it('keeps the newer transaction id when the older bump lands second', async () => {
    const newer = await bumpBlocklistBloomGeneration(emailBlocklist)
    const older = await bumpBlocklistBloomGeneration(emailBlocklist, '1')
    expect(generationVisibleThrough(older)).toBe(generationVisibleThrough(newer))
    expect(Number.parseInt(older, 10)).toBeGreaterThan(Number.parseInt(newer, 10))
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
