import { describe, expect, it } from 'vitest'
import {
  cleanupRetiredSitemapGenerations,
  type retiredCleanupDependencies,
} from './retired-generation-cleanup.mts'
import type { RetiredSitemapGeneration } from './generation-storage.mts'

describe('retired sitemap cleanup', () => {
  it('waits for the cache grace period and deletes only a bounded page', async () => {
    const key = 'sitemaps/retired/records/11111111-1111-4111-8111-111111111111.json'
    const records = new Map<string, RetiredSitemapGeneration>([
      [
        key,
        {
          generation_id: '11111111-1111-4111-8111-111111111111',
          page_prefix: 'families/topics/11111111-1111-4111-8111-111111111111/',
          page_count: 3,
          next_page: 1,
          retire_after: '2026-10-24T00:00:00.000Z',
        },
      ],
    ])
    const deleted: string[] = []
    let cursor: string | null = null
    const dependencies: typeof retiredCleanupDependencies = {
      getSitemapsWorkLimit: () => 2,
      getRetiredSitemapCursor: async () => cursor,
      putRetiredSitemapCursor: async value => {
        cursor = value
      },
      listRetiredSitemapGenerationKeys: async (afterKey, limit) => {
        const available = [...records.keys()].filter(candidate => !afterKey || candidate > afterKey)
        return { keys: available.slice(0, limit), hasMore: available.length > limit }
      },
      getRetiredSitemapGeneration: async recordKey => records.get(recordKey) ?? null,
      putRetiredSitemapGeneration: async record => {
        records.set(key, record)
      },
      deleteRetiredSitemapGeneration: async recordKey => {
        records.delete(recordKey)
      },
      deleteSitemapObjects: async pageKeys => {
        deleted.push(...pageKeys)
      },
    }

    await cleanupRetiredSitemapGenerations(new Date('2026-10-23T00:00:00.000Z'), dependencies)
    expect(deleted).toEqual([])
    expect(records.get(key)?.next_page).toBe(1)

    const partial = await cleanupRetiredSitemapGenerations(
      new Date('2026-10-25T00:00:00.000Z'),
      dependencies,
    )
    expect(partial).toEqual({ deletedPages: 2, hasMore: true })
    expect(deleted).toEqual([
      'families/topics/11111111-1111-4111-8111-111111111111/1.xml',
      'families/topics/11111111-1111-4111-8111-111111111111/2.xml',
    ])
    expect(records.get(key)?.next_page).toBe(3)

    const final = await cleanupRetiredSitemapGenerations(
      new Date('2026-10-25T00:00:00.000Z'),
      dependencies,
    )
    expect(final.deletedPages).toBe(1)
    expect(records.size).toBe(0)
    expect(deleted.at(-1)).toBe('families/topics/11111111-1111-4111-8111-111111111111/3.xml')
    expect(final.hasMore).toBe(false)
  })
})
