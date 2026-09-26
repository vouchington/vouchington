import { randomUUID } from 'node:crypto'
import { ValkeyBloomFilter, bloomValkeyClient, valkeyEvents } from '@data-stores/valkey'
import { getHostnamePolicyCandidates } from '@services/urls-hostnames/policies'
import { describe, expect, it } from 'vitest'
import { checkBloomFilters } from '../bloom-filter.mts'
import { isUrlBlocked } from '../domains.mts'
import { checkBloomFiltersRead } from '../read-repair.mts'

describe('isUrlBlocked bloom reads', () => {
  it('checks every hostname suffix in one ready bloom read', async () => {
    const token = randomUUID()
    const hostname = `www.${token}.invalid`
    const existsHits: string[] = []
    const mexistsHits: string[][] = []
    const onExists = (event: { name: string; item: string }): void => {
      if (event.name === 'url-blocklist' && event.item.includes(token)) existsHits.push(event.item)
    }
    const onMexists = (event: { name: string; items: string[] }): void => {
      if (event.name === 'url-blocklist' && event.items.some(item => item.includes(token))) {
        mexistsHits.push(event.items)
      }
    }

    valkeyEvents.on('bloom-filter:exists', onExists)
    valkeyEvents.on('bloom-filter:mexists', onMexists)
    try {
      await isUrlBlocked(hostname)
    } finally {
      valkeyEvents.off('bloom-filter:exists', onExists)
      valkeyEvents.off('bloom-filter:mexists', onMexists)
    }

    expect(existsHits).toEqual([])
    expect(mexistsHits).toEqual([getHostnamePolicyCandidates(hostname)])
  })
})

describe('checkBloomFiltersRead', () => {
  it('does not read Valkey when there are no suffixes', async () => {
    const reads: string[][] = []
    const results = await checkBloomFilters([])
    const directResults = await checkBloomFiltersRead({
      readyKey: 'unused-ready',
      liveKey: 'unused-live',
      values: [],
      mexistsIfReady: async (_readyKey, values) => {
        reads.push(values)
        return []
      },
      repairUnavailableRead: async () => {
        throw new Error('empty bloom read must not repair')
      },
    })

    expect(results).toEqual([])
    expect(directResults).toEqual([])
    expect(reads).toEqual([])
  })

  it('repairs once when the ready filter is absent', async () => {
    const repairs: string[] = []
    const results = await withBatchFilter(async (filter, readyKey) =>
      checkBloomFiltersRead({
        readyKey,
        liveKey: filter.getKey(),
        values: ['absent-a.example', 'absent-b.example'],
        mexistsIfReady: (key, values) => filter.mexistsIfReady(key, values),
        repairUnavailableRead: async () => {
          repairs.push('repair')
        },
      }),
    )

    expect(results).toEqual([null, null])
    expect(repairs).toEqual(['repair'])
  })

  it('returns definite misses from one ready filter without repair', async () => {
    const repairs: string[] = []
    const results = await withBatchFilter(async (filter, readyKey) => {
      await filter.ensureExists()
      await bloomValkeyClient.set(readyKey, 'ready')
      return checkBloomFiltersRead({
        readyKey,
        liveKey: filter.getKey(),
        values: ['missing-a.example', 'missing-b.example'],
        mexistsIfReady: (key, values) => filter.mexistsIfReady(key, values),
        repairUnavailableRead: async () => {
          repairs.push('repair')
        },
      })
    })

    expect(results).toEqual([false, false])
    expect(repairs).toEqual([])
  })

  it('keeps per-suffix membership from one ready filter', async () => {
    const results = await withBatchFilter(async (filter, readyKey) => {
      await filter.ensureExists()
      await filter.addOrThrow(['present.example'])
      await bloomValkeyClient.set(readyKey, 'ready')
      return checkBloomFiltersRead({
        readyKey,
        liveKey: filter.getKey(),
        values: ['present.example', 'absent.example'],
        mexistsIfReady: (key, values) => filter.mexistsIfReady(key, values),
        repairUnavailableRead: async () => {
          throw new Error('aligned bloom membership must not repair')
        },
      })
    })

    expect(results).toEqual([true, false])
  })

  it('repairs when a negative read sees an unusable live key', async () => {
    const liveKey = `bloom-filter:batch-corrupt-${randomUUID()}`
    await bloomValkeyClient.set(liveKey, 'corrupted')
    const repairs: string[] = []
    try {
      const results = await checkBloomFiltersRead({
        readyKey: `bloom-filter:batch-corrupt-ready-${randomUUID()}`,
        liveKey,
        values: ['maybe.example', 'absent.example'],
        mexistsIfReady: async () => [false, true],
        repairUnavailableRead: async () => {
          repairs.push('repair')
        },
      })
      expect(results).toEqual([null, null])
      expect(repairs).toEqual(['repair'])
    } finally {
      await bloomValkeyClient.unlink([liveKey])
    }
  })

  it('repairs when the bloom read returns the wrong number of results', async () => {
    const repairs: string[] = []
    const results = await checkBloomFiltersRead({
      readyKey: 'unused-ready',
      liveKey: 'unused-live',
      values: ['a.example', 'b.example'],
      mexistsIfReady: async () => [false],
      repairUnavailableRead: async () => {
        repairs.push('repair')
      },
    })

    expect(results).toEqual([null, null])
    expect(repairs).toEqual(['repair'])
  })

  it('repairs when the bloom read throws', async () => {
    const repairs: string[] = []
    const results = await checkBloomFiltersRead({
      readyKey: 'unused-ready',
      liveKey: 'unused-live',
      values: ['a.example'],
      mexistsIfReady: async () => {
        throw new Error('bloom read failed')
      },
      repairUnavailableRead: async () => {
        repairs.push('repair')
      },
    })

    expect(results).toEqual([null])
    expect(repairs).toEqual(['repair'])
  })
})

async function withBatchFilter<T>(
  run: (filter: ValkeyBloomFilter, readyKey: string) => Promise<T>,
): Promise<T> {
  const filter = new ValkeyBloomFilter({
    name: `url-blocklist-batch-${randomUUID()}`,
    capacity: 100,
    errorRate: 0.01,
    client: bloomValkeyClient,
  })
  const readyKey = `${filter.getKey()}:ready`
  try {
    return await run(filter, readyKey)
  } finally {
    await filter.deleteWithAdditionalKeys([readyKey])
  }
}
