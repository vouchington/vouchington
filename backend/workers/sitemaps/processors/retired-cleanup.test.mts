import { randomUUID } from 'node:crypto'
import { readAllQueueJobs, overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { spyOnSitemapObjectStore } from '@voucha/test-helpers/sitemap-object-store'
import { backgroundQueue as sitemapsQueue } from '@voucha/test-helpers/shared-background-queue'
import { processRetiredSitemapCleanup } from './retired-cleanup.mts'
import { sitemapsWorkConfig } from '@services/sitemaps/work-limits'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { putRetiredSitemapGeneration } from '@services/sitemaps/generation-storage'

type RetiredSitemapGeneration = Parameters<typeof putRetiredSitemapGeneration>[0]

describe('sitemap cleanup continuation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('drains record and child-page caps through real cleanup continuation jobs', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, {
        retired_generation_delete_page_size: 1,
        retired_generation_record_scan_limit: 1,
      }),
    )
    const generations = [randomUUID(), randomUUID()].toSorted()
    const objects = new Map<string, Buffer>()
    for (const generation of generations) {
      const record: RetiredSitemapGeneration = {
        generation_id: generation,
        page_prefix: `families/users/${generation}/`,
        page_count: 1,
        next_page: 1,
        retire_after: '2026-01-01T00:00:00.000Z',
      }
      objects.set(
        `sitemaps/retired/records/${generation}.json`,
        Buffer.from(JSON.stringify(record)),
      )
      objects.set(`${record.page_prefix}1.xml`, Buffer.from('page'))
    }
    spyOnSitemapObjectStore(objects, () => undefined)

    const beforeIds = new Set((await readAllQueueJobs(sitemapsQueue)).map(job => job.id))
    await processRetiredSitemapCleanup(new Date('2026-10-25T00:00:00.000Z'))
    const continuations = (await readAllQueueJobs(sitemapsQueue)).filter(
      job => !beforeIds.has(job.id) && job.name === 'sitemaps.processRetiredSitemapCleanup',
    )
    expect(continuations).toHaveLength(1)
    expect(continuations[0]!.opts.ordering).toEqual({ key: 'sitemaps:dispatcher', concurrency: 1 })
    expect(objects.has(`families/users/${generations[0]}/1.xml`)).toBe(false)
    expect(JSON.parse(objects.get('sitemaps/retired/_cursor.json')!.toString())).toEqual({
      after_key: `sitemaps/retired/records/${generations[0]}.json`,
    })

    await processRetiredSitemapCleanup(new Date('2026-10-25T00:00:00.000Z'))
    expect(
      generations.every(generation => !objects.has(`families/users/${generation}/1.xml`)),
    ).toBe(true)
    expect(JSON.parse(objects.get('sitemaps/retired/_cursor.json')!.toString())).toEqual({
      after_key: null,
    })
    const final = (await readAllQueueJobs(sitemapsQueue)).filter(
      job => !beforeIds.has(job.id) && job.name === 'sitemaps.processRetiredSitemapCleanup',
    )
    expect(final.map(job => job.id)).toEqual(continuations.map(job => job.id))
  })
})
