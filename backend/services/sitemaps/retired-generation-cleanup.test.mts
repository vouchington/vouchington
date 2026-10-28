import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { spyOnSitemapObjectStore } from '@voucha/test-helpers/sitemap-object-store'
import { sitemapsWorkConfig } from './work-limits.mts'
import { cleanupRetiredSitemapGenerations } from './retired-generation-cleanup.mts'
import type { putRetiredSitemapGeneration } from './generation-storage.mts'

type RetiredSitemapGeneration = Parameters<typeof putRetiredSitemapGeneration>[0]

describe('retired sitemap cleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('waits for the cache grace period and deletes only a bounded page', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, {
        retired_generation_delete_page_size: 2,
        retired_generation_record_scan_limit: 1,
      }),
    )
    const generationId = '11111111-1111-4111-8111-111111111111'
    const recordKey = `sitemaps/retired/records/${generationId}.json`
    const pagePrefix = `families/topics/${generationId}/`
    const record: RetiredSitemapGeneration = {
      generation_id: generationId,
      page_prefix: pagePrefix,
      page_count: 3,
      next_page: 1,
      retire_after: '2026-10-24T00:00:00.000Z',
    }
    const objects = new Map<string, Buffer>([
      [recordKey, Buffer.from(JSON.stringify(record))],
      ...[1, 2, 3].map(page => [`${pagePrefix}${page}.xml`, Buffer.from('page')] as const),
    ])
    spyOnSitemapObjectStore(objects, () => undefined)

    await cleanupRetiredSitemapGenerations(new Date('2026-10-23T00:00:00.000Z'))
    expect([1, 2, 3].every(page => objects.has(`${pagePrefix}${page}.xml`))).toBe(true)
    expect(JSON.parse(objects.get(recordKey)!.toString()).next_page).toBe(1)

    const partial = await cleanupRetiredSitemapGenerations(new Date('2026-10-25T00:00:00.000Z'))
    expect(partial).toMatchObject({ deletedPages: 2, hasMore: true })
    expect(objects.has(`${pagePrefix}1.xml`)).toBe(false)
    expect(objects.has(`${pagePrefix}2.xml`)).toBe(false)
    expect(objects.has(`${pagePrefix}3.xml`)).toBe(true)
    expect(JSON.parse(objects.get(recordKey)!.toString()).next_page).toBe(3)

    const final = await cleanupRetiredSitemapGenerations(new Date('2026-10-25T00:00:00.000Z'))
    expect(final).toMatchObject({ deletedPages: 1, hasMore: false })
    expect(objects.has(`${pagePrefix}3.xml`)).toBe(false)
    expect(objects.has(recordKey)).toBe(false)
  })
})
