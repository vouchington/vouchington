import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createRandomString,
  createTestUser,
  createTestTopic,
  insertTestUrlDirect,
  insertTestStoryCategoryPublicationBatch,
  hardDeleteTestPosts,
  overrideDynamicConfigFieldsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import {
  deleteTestRssFeedRow,
  beforeTestRssFeedUuid,
  insertThreeTestFeedCrawls,
  countTestHardDeleteFeedCrawls,
} from '@voucha/test-helpers/rss-hard-delete-queries'
import { countTestFeedSources } from '@voucha/test-helpers/publication-test-queries'
import { createRssFeed } from '@services/rss-feeds/create'
import { hardDeleteRssFeedById } from '@services/rss-feeds/delete'
import {
  listHardDeleteRssFeedNextPages,
  enqueueNextHardDeleteRssFeedPages,
} from '@services/rss-feeds/hard-delete-next-page'
import { processRecoverRssFeedHardDeletes } from '@services/rss-feeds/hard-delete-recovery'
import { postPublicationWorkConfig } from '../../../services/post-publication/work-limits.mts'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { rssFeedHardDeletePageJobId } from '@queues/rss-feed-maintenance/enqueues/hard-delete'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../../data-stores/valkey-core/glide-mq-client.mts'
import { processRssFeedMaintenanceJob } from '../processors.mts'
import { hardDeleteRssFeedChildPage } from '@services/rss-feeds/hard-delete-child-page'
import {
  processHardDeleteRssFeedSourcePage,
  processHardDeleteRssFeedChildPage,
} from './hard-delete.mts'

describe('canonical hard-delete recovery pages', () => {
  it.each(['sources', 'crawls'] as const)(
    'joins a live later %s page and makes a stale post-commit retry read-only',
    async phase => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
          rss_feed_hard_delete_capture_batch_size: 1,
        }),
      )
      const user = await createTestUser()
      const nonce = createRandomString(10)
      const topic = await createTestTopic({ hostname: `recover-live-${nonce}.example.com` })
      const feed = await createRssFeed({
        provenance: WEB_PROVENANCE,
        skipRemoteValidation: true,
        rss_feed_url: `https://recover-live-${nonce}.example.com/feed.xml`,
        topic_id: topic.id,
        title: 'Native recovery',
      })
      onTestFinished(() => deleteTestRssFeedRow(feed.id))
      if (phase === 'sources') {
        const url = await insertTestUrlDirect(
          user.id,
          `https://recover-live-${nonce}.example.com/item`,
        )
        if (!url) throw new Error('Expected owned URL')
        const { postIds } = await insertTestStoryCategoryPublicationBatch({
          count: 3,
          categoryText: nonce,
          createdById: user.id,
          rssFeedId: feed.id,
          topicId: topic.id,
          urlId: url.id,
        })
        onTestFinished(() => hardDeleteTestPosts(postIds))
      } else await insertThreeTestFeedCrawls(feed.id)
      const countRows = () =>
        phase === 'sources' ? countTestFeedSources(feed.id) : countTestHardDeleteFeedCrawls(feed.id)
      const ownedIds = new Set<string>()
      const admissions: string[] = []
      let checkingRecovery = false
      const onAdded = (job: { id: string; data: unknown }) => {
        if ((job.data as { rssFeedId?: string }).rssFeedId !== feed.id) return
        ownedIds.add(job.id)
        if (checkingRecovery) admissions.push(job.id)
      }
      rssFeedMaintenance.on('added', onAdded)
      onTestFinished(async () => {
        rssFeedMaintenance.off('added', onAdded)
        await Promise.all(
          [...ownedIds].map(async id => (await rssFeedMaintenance.getJob(id))?.remove()),
        )
      })
      await hardDeleteRssFeedById(feed.id)
      if (phase === 'crawls') {
        await hardDeleteRssFeedChildPage(feed.id, 'setting_changes')
        await hardDeleteRssFeedChildPage(feed.id, 'setting_changes')
        await enqueueNextHardDeleteRssFeedPages([feed.id])
      }
      const [first] = await listHardDeleteRssFeedNextPages([feed.id])
      if (first?.phase !== phase) throw new Error('Expected source page')
      const initial = {
        rssFeedId: feed.id,
        pageCursor: first.cursor,
        ...(phase === 'crawls' ? { phase } : {}),
      }
      const rootId = rssFeedHardDeletePageJobId(initial, phase)
      const root = await rssFeedMaintenance.getJob(rootId)
      if (!root) throw new Error('Expected canonical initial delivery')
      const release = Promise.withResolvers<void>()
      let heldId: string | null = null
      const worker = await startRealGlideBackgroundLifecycle({
        queueNamePrefix: 'rss_delete_recovery',
        connection: { connection: workerQueueConnection, prefix: workerQueuePrefix },
        workerOptions: { blockTimeout: 100 },
        processor: async job => {
          if (job.id === heldId) await release.promise
          return processRssFeedMaintenanceJob(job)
        },
      })
      worker.registerBeforeClose(() => release.resolve())
      const nativeRoot = await worker.add(
        { name: root.name, options: root.opts },
        root.data as object,
        { jobId: root.id },
      )
      expect(await worker.settled(nativeRoot)).toBe('completed')
      expect(await worker.queue.getJob(rootId)).toBeNull()
      await root.remove()
      expect(await countRows()).toBe(2)
      const [second] = await listHardDeleteRssFeedNextPages([feed.id])
      if (second?.phase !== phase) throw new Error('Expected a later source page')
      const nextData = {
        rssFeedId: feed.id,
        pageCursor: second.cursor,
        ...(phase === 'crawls' ? { phase } : {}),
      }
      const nextId = rssFeedHardDeletePageJobId(nextData, phase)
      expect(nextId).not.toBe(rootId)
      const next = await rssFeedMaintenance.getJob(nextId)
      if (!next) throw new Error('Expected canonical continuation')
      heldId = nextId
      const nativeNext = await worker.add(
        { name: next.name, options: next.opts },
        next.data as object,
        { jobId: nextId },
      )
      await worker.activated(nativeNext, 1)
      checkingRecovery = true
      expect(
        await processRecoverRssFeedHardDeletes({ afterId: beforeTestRssFeedUuid(feed.id) }),
      ).toEqual({ admitted: 1 })
      // Simulate retry of the old descriptor after its deletion committed and continuation admission lost acknowledgement.
      if (phase === 'sources') await processHardDeleteRssFeedSourcePage(initial)
      else await processHardDeleteRssFeedChildPage({ ...initial, phase })
      checkingRecovery = false
      expect(admissions).toEqual([])
      expect(await rssFeedMaintenance.getJob(rootId)).toBeNull()
      const [currentRecoveryPage] = await listHardDeleteRssFeedNextPages([feed.id])
      expect(currentRecoveryPage).toMatchObject({ phase, cursor: nextData.pageCursor })
      expect(
        rssFeedHardDeletePageJobId(
          { rssFeedId: feed.id, pageCursor: currentRecoveryPage!.cursor },
          phase,
        ),
      ).toBe(nativeNext.id)
      expect(await countRows()).toBe(2)
      expect((await rssFeedMaintenance.getJob(nextId))?.data).toEqual(nextData)
      release.resolve()
      expect(await worker.settled(nativeNext)).toBe('completed')
      expect(await countRows()).toBe(1)
    },
  )
})
