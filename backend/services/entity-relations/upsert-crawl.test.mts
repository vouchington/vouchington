import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { upsertEntityRelation } from './upsert.mts'
import { softDeleteEntityRelation } from './delete.mts'
import { entityRelationMetadatum, type EntityRelationMetadata } from './metadata.mts'
import { stubUrlGuardsForSuite } from './test-support.mts'
import {
  createTestPost,
  createTestUser,
  createTestTopic,
  insertTestUrlDirect,
  waitForQueueJobs,
} from '@voucha/test-helpers'
import { crawlUrls } from '@queues/crawler/queues'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('upsert-crawl', () => {
  stubUrlGuardsForSuite()

  let user: PrivateUser
  let postRelatedUrlMetadata: EntityRelationMetadata
  let postCategoryTopicMetadata: EntityRelationMetadata

  beforeAll(async () => {
    user = await createTestUser()
    postRelatedUrlMetadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'url' && m.predicate === 'related',
    )!
    postCategoryTopicMetadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
    )!
  })

  beforeEach(async () => {
    await crawlUrls.obliterate()
  })

  describe('upsertEntityRelation with object_type=url', () => {
    it('enqueues a crawl for the URL when a post→related→url relation is created', async () => {
      const post = await createTestPost({ user })
      const url = await insertTestUrlDirect(
        user.id,
        `https://crawl-enqueue-test-1.example.com/page`,
      )
      expect(url).toBeTruthy()

      await upsertEntityRelation(user!, postRelatedUrlMetadata, post, [{ id: url!.id }])

      const jobs = await waitForQueueJobs(crawlUrls, j =>
        j.some(job => (job.data as { url_id: string }).url_id === url!.id),
      )
      expect(jobs.some(j => (j.data as { url_id: string }).url_id === url!.id)).toBe(true)
    })

    it('enqueues crawls for multiple URLs in a single call', async () => {
      const post = await createTestPost({ user })
      const url1 = await insertTestUrlDirect(
        user.id,
        `https://crawl-enqueue-test-2a.example.com/page`,
      )
      const url2 = await insertTestUrlDirect(
        user.id,
        `https://crawl-enqueue-test-2b.example.com/page`,
      )
      expect(url1).toBeTruthy()
      expect(url2).toBeTruthy()

      await upsertEntityRelation(user!, postRelatedUrlMetadata, post, [
        { id: url1!.id },
        { id: url2!.id },
      ])

      const jobs = await waitForQueueJobs(
        crawlUrls,
        j =>
          j.some(job => (job.data as { url_id: string }).url_id === url1!.id) &&
          j.some(job => (job.data as { url_id: string }).url_id === url2!.id),
      )
      expect(jobs.some(j => (j.data as { url_id: string }).url_id === url1!.id)).toBe(true)
      expect(jobs.some(j => (j.data as { url_id: string }).url_id === url2!.id)).toBe(true)
    })

    it('does not enqueue a crawl when object_type is topic', async () => {
      const post = await createTestPost({ user })
      const topic = await createTestTopic()

      await upsertEntityRelation(user!, postCategoryTopicMetadata, post, [topic])

      // Poll briefly; any crawl job would appear within the timeout
      const jobs = await waitForQueueJobs(crawlUrls, j => j.length > 0, 200)
      expect(jobs).toHaveLength(0)
    })

    it('enqueues a crawl when a soft-deleted URL relation is reactivated', async () => {
      const post = await createTestPost({ user })
      const url = await insertTestUrlDirect(
        user.id,
        `https://crawl-enqueue-test-4.example.com/page`,
      )
      expect(url).toBeTruthy()

      await upsertEntityRelation(user!, postRelatedUrlMetadata, post, [{ id: url!.id }])
      await softDeleteEntityRelation(user!, postRelatedUrlMetadata, post, [{ id: url!.id }])

      await crawlUrls.obliterate()
      await upsertEntityRelation(user!, postRelatedUrlMetadata, post, [{ id: url!.id }])

      const jobs = await waitForQueueJobs(crawlUrls, j =>
        j.some(job => (job.data as { url_id: string }).url_id === url!.id),
      )
      expect(jobs.some(j => (j.data as { url_id: string }).url_id === url!.id)).toBe(true)
    })
  })
})
