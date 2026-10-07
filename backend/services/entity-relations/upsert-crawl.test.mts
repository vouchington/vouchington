import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { upsertEntityRelation } from './upsert.mts'
import { softDeleteEntityRelation } from './delete.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import '@voucha/test-helpers/entity-url-guard-registrations'
import {
  createTestPost,
  createTestUser,
  createTestTopic,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { createEntityRelationCrawlObserver } from '@voucha/test-helpers/entity-relation-crawl-observer'
import { crawlUrls } from '@queues/crawler/queues'

const postRelatedUrlMetadata = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  objectType: 'url',
  predicate: 'related',
})
const postCategoryTopicMetadata = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  objectType: 'topic',
  predicate: 'category',
})

describe('upsert-crawl', () => {
  describe('upsertEntityRelation with object_type=url', () => {
    it('enqueues a crawl for the URL when a post→related→url relation is created', async () => {
      const ownedObjectIds = new Set<string>()
      await using observer = createEntityRelationCrawlObserver(ownedObjectIds)
      const { ownedPromises } = observer
      const user = await createTestUser()
      const post = await createTestPost({ user })
      const url = await insertTestUrlDirect(
        user.id,
        `https://crawl-single-${randomUUID()}.example.com/page`,
      )
      expect(url).toBeTruthy()
      ownedObjectIds.add(url!.id)
      await upsertEntityRelation(user, postRelatedUrlMetadata, post, [{ id: url!.id }])

      expect(ownedPromises()).toHaveLength(1)
      const jobs = (await Promise.all(ownedPromises())).flat().filter(job => job != null)
      expect(jobs).toHaveLength(1)
      expect(jobs[0]!.data.url_id).toBe(url!.id)
      await expect(crawlUrls.getJob(jobs[0]!.id)).resolves.toMatchObject({
        name: 'crawl_url',
        data: { url_id: url!.id },
      })
    })

    it('enqueues crawls for multiple URLs in a single call', async () => {
      const ownedObjectIds = new Set<string>()
      await using observer = createEntityRelationCrawlObserver(ownedObjectIds)
      const { ownedPromises } = observer
      const user = await createTestUser()
      const post = await createTestPost({ user })
      const url1 = await insertTestUrlDirect(
        user.id,
        `https://crawl-multi-a-${randomUUID()}.example.com/page`,
      )
      const url2 = await insertTestUrlDirect(
        user.id,
        `https://crawl-multi-b-${randomUUID()}.example.com/page`,
      )
      expect(url1).toBeTruthy()
      expect(url2).toBeTruthy()
      ownedObjectIds.add(url1!.id)
      ownedObjectIds.add(url2!.id)
      await upsertEntityRelation(user, postRelatedUrlMetadata, post, [
        { id: url1!.id },
        { id: url2!.id },
      ])

      expect(ownedPromises()).toHaveLength(1)
      const jobs = (await Promise.all(ownedPromises())).flat().filter(job => job != null)
      expect(jobs.map(job => job.data.url_id).toSorted()).toEqual([url1!.id, url2!.id].toSorted())
      for (const job of jobs) {
        await expect(crawlUrls.getJob(job.id)).resolves.toMatchObject({
          name: 'crawl_url',
          data: { url_id: job.data.url_id },
        })
      }
    })

    it('does not enqueue a crawl when object_type is topic', async () => {
      const ownedObjectIds = new Set<string>()
      await using observer = createEntityRelationCrawlObserver(ownedObjectIds)
      const { enqueueSpy, ownedPromises } = observer
      const user = await createTestUser()
      const post = await createTestPost({ user })
      const url = await insertTestUrlDirect(
        user.id,
        `https://crawl-topic-control-${randomUUID()}.example.com/page`,
      )
      expect(url).toBeTruthy()
      ownedObjectIds.add(url!.id)
      await upsertEntityRelation(user, postRelatedUrlMetadata, post, [{ id: url!.id }])
      // Prove this call-through observer intercepts the real producer before the negative case.
      expect(ownedPromises()).toHaveLength(1)
      const jobs = (await Promise.all(ownedPromises())).flat().filter(job => job != null)
      expect(jobs).toHaveLength(1)
      await expect(crawlUrls.getJob(jobs[0]!.id)).resolves.toMatchObject({
        name: 'crawl_url',
        data: { url_id: url!.id },
      })

      const topic = await createTestTopic()
      ownedObjectIds.add(topic.id)
      const callCountBeforeTopic = enqueueSpy.mock.calls.length
      await upsertEntityRelation(user, postCategoryTopicMetadata, post, [topic])
      // upsert invokes its enqueue producer before returning; no timer or queue-wide scan is needed.
      expect(
        enqueueSpy.mock.calls
          .slice(callCountBeforeTopic)
          .some(([entries]) => entries.some(entry => entry.urlId === topic.id)),
      ).toBe(false)
    })

    it('enqueues a crawl when a soft-deleted URL relation is reactivated', async () => {
      const ownedObjectIds = new Set<string>()
      await using observer = createEntityRelationCrawlObserver(ownedObjectIds)
      const { ownedPromises } = observer
      const user = await createTestUser()
      const post = await createTestPost({ user })
      const url = await insertTestUrlDirect(
        user.id,
        `https://crawl-reactivate-${randomUUID()}.example.com/page`,
      )
      expect(url).toBeTruthy()
      ownedObjectIds.add(url!.id)
      await upsertEntityRelation(user, postRelatedUrlMetadata, post, [{ id: url!.id }])
      expect(ownedPromises()).toHaveLength(1)
      const firstJobs = (await Promise.all(ownedPromises())).flat().filter(job => job != null)
      expect(firstJobs).toHaveLength(1)
      const firstJob = firstJobs[0]!
      await expect(crawlUrls.getJob(firstJob.id)).resolves.toMatchObject({
        name: 'crawl_url',
        data: { url_id: url!.id },
      })
      await softDeleteEntityRelation(user, postRelatedUrlMetadata, post, [{ id: url!.id }])
      // Native debounce accepts a new job when the tracked job record is absent, without TTL reset.
      await firstJob.remove()
      await expect(crawlUrls.getJob(firstJob.id)).resolves.toBeNull()
      await upsertEntityRelation(user, postRelatedUrlMetadata, post, [{ id: url!.id }])

      expect(ownedPromises()).toHaveLength(2)
      const secondJobs = (await ownedPromises()[1]!).filter(job => job != null)
      expect(secondJobs).toHaveLength(1)
      expect(secondJobs[0]!.id).not.toBe(firstJob.id)
      await expect(crawlUrls.getJob(secondJobs[0]!.id)).resolves.toMatchObject({
        name: 'crawl_url',
        data: { url_id: url!.id },
      })
    })
  })
})
