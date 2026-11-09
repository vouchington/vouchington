import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { PRIORITY_DEFAULT } from '@queues/content-analysis/config'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'
import { upsertRssFeedItems } from '../upsert.mts'

type AddedJob = { name: string; data: unknown }

function observeAddedJobs(queue: typeof backgroundCpu) {
  const added: AddedJob[] = []
  const waiters: Array<{ matches: (job: AddedJob) => boolean; resolve: () => void }> = []
  const onAdded = (job: AddedJob) => {
    added.push(job)
    for (const waiter of waiters) if (waiter.matches(job)) waiter.resolve()
  }
  queue.on('added', onAdded)
  return {
    close: () => queue.off('added', onAdded),
    waitFor: (matches: (job: AddedJob) => boolean) => {
      if (added.some(matches)) return Promise.resolve()
      return new Promise<void>(resolve => {
        waiters.push({ matches, resolve })
      })
    },
  }
}

function languageJobFor(id: string) {
  return (job: AddedJob) =>
    job.name === 'content-analysis.rss_feed_item' &&
    typeof job.data === 'object' &&
    job.data !== null &&
    'id' in job.data &&
    job.data.id === id
}

function searchLanguageJobs(id: string) {
  return backgroundCpu.searchJobs({
    name: 'content-analysis.rss_feed_item',
    data: { id },
  })
}

describe('upsertRssFeedItems language redetection', () => {
  const ownedIds: string[] = []

  afterEach(async () => {
    await Promise.all(
      ownedIds.splice(0).map(async id => {
        const jobs = await searchLanguageJobs(id)
        await Promise.all(jobs.map(job => job.remove()))
      }),
    )
  })

  it('queues an unchanged item once only when redetectLanguage is set', async () => {
    const feed = await insertTestRssFeedDirect({})
    const item = {
      guid: `language-redetect-${randomUUID()}`,
      link: `https://example.com/language-redetect-${randomUUID()}`,
      title: 'Unchanged item',
    }
    const language = observeAddedJobs(backgroundCpu)
    try {
      const [created] = await upsertRssFeedItems(feed.id, [item])
      assert(created)
      ownedIds.push(created.id)
      await language.waitFor(languageJobFor(created.id))
      const createdJobs = await searchLanguageJobs(created.id)
      expect(createdJobs.length).toBeGreaterThan(0)
      await Promise.all(createdJobs.map(job => job.remove()))
      expect(await searchLanguageJobs(created.id)).toEqual([])

      await upsertRssFeedItems(feed.id, [item], { redetectLanguage: false })
      expect(await searchLanguageJobs(created.id)).toEqual([])

      await upsertRssFeedItems(feed.id, [item], { redetectLanguage: true })
      const admitted = await searchLanguageJobs(created.id)
      expect(admitted).toHaveLength(1)
      expect(admitted[0]?.data).toEqual({ id: created.id })
      expect(admitted[0]?.opts).toMatchObject({
        priority: PRIORITY_DEFAULT,
        deduplication: {
          id: `content-analysis:language:rss_feed_item:${created.id}`,
          mode: 'debounce',
        },
      })
    } finally {
      language.close()
    }
  })
})
