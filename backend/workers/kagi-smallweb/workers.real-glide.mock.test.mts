import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { background } from '@queues/background/queues'
import {
  KAGI_SMALLWEB_PROCESS_FEED_JOB,
  KAGI_SMALLWEB_SYNC_JOB,
} from '@queues/background/enqueues/kagi-smallweb-jobs'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { FEED_LIST_SOURCES } from '@services/kagi-smallweb/sources'
import { forgetFeedListValidators } from '@services/kagi-smallweb/fetch-feed-list'
import { kagiSmallWebImportConfig } from '@services/kagi-smallweb/import-config'
import { kagiSmallWebHandlers } from './workers.mts'

const fetchSpy = vi.hoisted(() => vi.fn<typeof import('undici').fetch>())
// The Small Web lists live on GitHub; replace only the external HTTP boundary.
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

describe('Kagi paged dispatcher through the background handler', () => {
  it('admits one list entry per page and resumes from the admitted feed URL', async () => {
    const suffix = randomUUID()
    const urls = [
      `https://kagi-page-${suffix}-a.example.com/feed.xml`,
      `https://kagi-page-${suffix}-b.example.com/feed.xml`,
    ].toSorted()
    const [web, comic, youtube] = FEED_LIST_SOURCES.map(source => source.url)
    const lists = new Map([
      [web!, urls.join('\n')],
      [comic!, ''],
      [youtube!, ''],
    ])
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(
      async input =>
        new Response(
          lists.get(
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
          ),
        ),
    )
    const restoreImport = overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, {
      enabled: true,
      candidate_batch_size: 1,
    })
    const restorePaged = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      kagi_page_size: 1,
      background_max_depth: 1_000_000,
    })
    await forgetFeedListValidators(FEED_LIST_SOURCES.map(source => source.name))
    const handler = kagiSmallWebHandlers.find(
      candidate => candidate.job.name === KAGI_SMALLWEB_SYNC_JOB.name,
    )
    if (!handler) throw new Error('Kagi sync handler is not registered')
    const root = await background.add(KAGI_SMALLWEB_SYNC_JOB.name, {})
    if (!root) throw new Error('Expected Kagi sync job admission')
    let continuation: Awaited<ReturnType<typeof background.getJob>> | undefined
    try {
      await handler.handle(root as Job<never>)
      const firstJobs = await Promise.all(
        urls.map(feedUrl =>
          background.searchJobs({
            name: KAGI_SMALLWEB_PROCESS_FEED_JOB.name,
            data: { feedUrl },
          }),
        ),
      )
      expect(firstJobs.flat()).toHaveLength(1)
      const admittedUrl = urls.find((_url, index) => firstJobs[index]!.length === 1)!
      const continuationJobs = await background.searchJobs({
        name: KAGI_SMALLWEB_SYNC_JOB.name,
        data: { cursor: admittedUrl },
      })
      expect(continuationJobs).toHaveLength(1)
      continuation = await background.getJob(continuationJobs[0]!.id)
      if (!continuation) throw new Error('Expected persisted Kagi continuation')

      await handler.handle(continuation as Job<never>)
      const finalJobs = await Promise.all(
        urls.map(feedUrl =>
          background.searchJobs({
            name: KAGI_SMALLWEB_PROCESS_FEED_JOB.name,
            data: { feedUrl },
          }),
        ),
      )
      expect(finalJobs.flat()).toHaveLength(2)
    } finally {
      restorePaged()
      restoreImport()
      fetchSpy.mockReset()
      await forgetFeedListValidators(FEED_LIST_SOURCES.map(source => source.name))
      await Promise.all([root.remove(), continuation?.remove()])
      for (const feedUrl of urls) {
        const jobs = await background.searchJobs({
          name: KAGI_SMALLWEB_PROCESS_FEED_JOB.name,
          data: { feedUrl },
        })
        await Promise.all(jobs.map(job => job.remove()))
      }
    }
  })
})
