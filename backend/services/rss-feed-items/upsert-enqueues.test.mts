import { backgroundCpu } from '@queues/background-cpu/queues'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import { PRIORITY_DEFAULT } from '@queues/content-analysis/config'
import { notifications } from '@queues/notifications/queues'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'
import { upsertRssFeedItems } from './upsert.mts'
import { rssFeedItemsWorkConfig } from './work-limits.mts'
import {
  BEDROCK_BATCH_MAX_VALUES,
  bedrockEmbeddingsBatchConfig,
} from '@services/bedrock-embeddings/batch/config'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'

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
    added,
    close: () => queue.off('added', onAdded),
    waitFor: (matches: (job: AddedJob) => boolean) => {
      if (added.some(matches)) return Promise.resolve()
      return new Promise<void>(resolve => waiters.push({ matches, resolve }))
    },
  }
}

async function removeOwnedLanguageJobs(id: string) {
  const jobs = await backgroundCpu.searchJobs({
    name: 'content-analysis.rss_feed_item',
    data: { id },
  })
  await Promise.all(jobs.map(job => job.remove()))
}

function languageJobFor(id: string) {
  return (job: AddedJob) =>
    job.name === 'content-analysis.rss_feed_item' &&
    typeof job.data === 'object' &&
    job.data !== null &&
    'id' in job.data &&
    job.data.id === id
}

function notificationJobFor(id: string) {
  return (job: AddedJob) =>
    job.name === 'notifications.processReconcileRssFeedItemNotifications' &&
    typeof job.data === 'object' &&
    job.data !== null &&
    'rssFeedItemId' in job.data &&
    job.data.rssFeedItemId === id
}

function feedItem(hostname: string, suffix: string) {
  return {
    categories: ['integration-category'],
    guid: `guid-${randomUUID()}`,
    link: `https://${hostname}/${suffix}`,
    title: `RSS item ${suffix}`,
  }
}

describe('RSS feed item post-upsert enqueue fanout', () => {
  let restoreBacklogThreshold: (() => void) | undefined

  beforeAll(async () => {
    await bedrockEmbeddingsBatchConfig.waitForInitialization()
    bedrockEmbeddingsBatchConfig.unsubscribe()
  })

  beforeEach(async () => {
    restoreBacklogThreshold = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      backlog_threshold: BEDROCK_BATCH_MAX_VALUES.backlog_threshold,
    })
  })

  afterEach(async () => {
    restoreBacklogThreshold?.()
    restoreBacklogThreshold = undefined
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([bedrockEmbeddingsBatchConfig, rssFeedItemsWorkConfig])
  })

  it('enqueues embedding, autotagger, notification, and language detection jobs', async () => {
    const feed = await insertTestRssFeedDirect({})
    const item = feedItem(`fanout-${randomUUID()}.example.com`, 'first')
    const language = observeAddedJobs(backgroundCpu)
    try {
      const [result] = await upsertRssFeedItems(feed.id, [item])
      expect(result).toMatchObject({ has_embedding: false })
      await language.waitFor(languageJobFor(result.id))
      const [embeddingJobs, aiAgentJobs, notificationJobs, languageDetectionJobs] =
        await Promise.all([
          backgroundCpu.searchJobs({
            name: 'bedrock-embeddings.rss_feed_item',
            data: { rss_feed_item_id: result.id },
          }),
          ai_agents.searchJobs({
            name: 'autotagger-rss-feed-item',
            data: { rss_feed_item_id: result.id },
          }),
          notifications.searchJobs({
            name: 'notifications.processReconcileRssFeedItemNotifications',
            data: { rssFeedItemId: result.id },
          }),
          backgroundCpu.searchJobs({
            name: 'content-analysis.rss_feed_item',
            data: { id: result.id },
          }),
        ])
      expect({
        aiAgent: aiAgentJobs.length > 0,
        embedding: embeddingJobs.length > 0,
        languageDetection: languageDetectionJobs.length > 0,
        notification: notificationJobs.length > 0,
      }).toEqual({ aiAgent: true, embedding: true, languageDetection: true, notification: true })
      expect(notificationJobs[0]?.data).toMatchObject({ rssFeedItemId: result.id })
      expect(notificationJobs[0]?.data).toHaveProperty('changeId', expect.any(String))
    } finally {
      language.close()
    }
  })

  it('enqueues notification and language detection jobs for newly source-linked existing rows', async () => {
    const hostname = `source-link-${randomUUID()}.example.com`
    const firstFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/first.xml`,
      topicHostname: `first-${hostname}`,
    })
    const secondFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/second.xml`,
      topicHostname: `second-${hostname}`,
    })
    const item = feedItem(hostname, 'shared')
    const firstLanguage = observeAddedJobs(backgroundCpu)
    const [created] = await upsertRssFeedItems(firstFeed.id, [item])
    await firstLanguage.waitFor(languageJobFor(created.id))
    firstLanguage.close()
    await removeOwnedLanguageJobs(created.id)
    const language = observeAddedJobs(backgroundCpu)
    const notification = observeAddedJobs(notifications)
    try {
      await expect(upsertRssFeedItems(secondFeed.id, [item])).resolves.toEqual([])
      await language.waitFor(languageJobFor(created.id))
      expect(notification.added.some(notificationJobFor(created.id))).toBe(true)
      const jobs = await backgroundCpu.searchJobs({
        name: 'content-analysis.rss_feed_item',
        data: { id: created.id },
      })
      expect(jobs.length).toBeGreaterThan(0)
    } finally {
      language.close()
      notification.close()
    }
  })

  it('bulk-enqueues language detection for every row with per-item options across chunks', async () => {
    const restoreBatchSize = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      enqueue_batch_size: 2,
    })
    const feed = await insertTestRssFeedDirect({})
    const hostname = `language-chunks-${randomUUID()}.example.com`
    const language = observeAddedJobs(backgroundCpu)
    try {
      const rows = await upsertRssFeedItems(feed.id, [
        feedItem(hostname, 'first'),
        feedItem(hostname, 'second'),
        feedItem(hostname, 'third'),
      ])
      expect(rows).toHaveLength(3)
      await Promise.all(rows.map(row => language.waitFor(languageJobFor(row.id))))
      for (const row of rows) {
        const jobs = await backgroundCpu.searchJobs({
          name: 'content-analysis.rss_feed_item',
          data: { id: row.id },
        })
        expect(jobs).toHaveLength(1)
        expect(jobs[0]?.opts).toMatchObject({
          priority: PRIORITY_DEFAULT,
          deduplication: {
            id: `content-analysis:language:rss_feed_item:${row.id}`,
            mode: 'debounce',
          },
        })
      }
    } finally {
      language.close()
      restoreBatchSize()
    }
  })

  it('narrows fanout to newly source-linked existing rows while returning all rows', async () => {
    const hostname = `selective-fanout-${randomUUID()}.example.com`
    const firstFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/first.xml`,
      topicHostname: `first-${hostname}`,
    })
    const secondFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/second.xml`,
      topicHostname: `second-${hostname}`,
    })
    const fanoutItem = feedItem(hostname, 'fanout')
    const skippedItem = feedItem(hostname, 'skipped')
    const firstLanguage = observeAddedJobs(backgroundCpu)
    const [createdFanout, createdSkipped] = await upsertRssFeedItems(firstFeed.id, [
      fanoutItem,
      skippedItem,
    ])
    await Promise.all(
      [createdFanout, createdSkipped].map(row => firstLanguage.waitFor(languageJobFor(row.id))),
    )
    firstLanguage.close()
    await Promise.all([createdFanout, createdSkipped].map(row => removeOwnedLanguageJobs(row.id)))
    const linkedLanguage = observeAddedJobs(backgroundCpu)
    await upsertRssFeedItems(secondFeed.id, [skippedItem])
    await linkedLanguage.waitFor(languageJobFor(createdSkipped.id))
    linkedLanguage.close()
    await removeOwnedLanguageJobs(createdFanout.id)
    const language = observeAddedJobs(backgroundCpu)
    const notification = observeAddedJobs(notifications)
    try {
      const result = await upsertRssFeedItems(secondFeed.id, [
        { ...fanoutItem, title: 'Revised title' },
        skippedItem,
      ])
      expect(result.map(row => row.id).toSorted()).toEqual(
        [createdFanout.id, createdSkipped.id].toSorted(),
      )
      await language.waitFor(languageJobFor(createdFanout.id))
      expect(notification.added.some(notificationJobFor(createdFanout.id))).toBe(true)
      expect(notification.added.some(notificationJobFor(createdSkipped.id))).toBe(false)
    } finally {
      language.close()
      notification.close()
    }
  })
})
