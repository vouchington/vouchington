import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createClassifierFixture } from '@voucha/test-helpers/data-stores/psql/classifiers'
import {
  readDeletedSubjectClassifierRequestFacts,
  seedDeletedSubjectClassifierRequest,
  seedLivePostClassifierRequest,
} from '@voucha/test-helpers/classifier-request-retention'
import { withClassifierRetentionSweepLock } from '@voucha/test-helpers/classifier-retention-sweep-lock'
import { cleanupClassifierRecords } from '../cleanup-classifier-records.mts'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'

describe('deleted-subject classifier requests', () => {
  it('removes pending and settled requests in bounded pages before retained roots', async () => {
    const fixture = await createClassifierFixture()
    const dayMs = 24 * 60 * 60 * 1000
    const requestAt = new Date(Date.UTC(2000, 0, 1) + randomInt(20 * 365 * dayMs))
    const startedAt = new Date(requestAt.getTime() - 1)
    const post = await seedDeletedSubjectClassifierRequest({
      classifierId: fixture.classifierId,
      subject: 'post',
      settled: false,
      requestAt,
    })
    const feed = await seedDeletedSubjectClassifierRequest({
      classifierId: fixture.classifierId,
      subject: 'rss_feed_item',
      settled: true,
      requestAt: new Date(requestAt.getTime() + 1_000),
    })
    const liveRequestId = await seedLivePostClassifierRequest({
      classifierId: fixture.classifierId,
      postId: fixture.postId,
      requestAt: new Date(requestAt.getTime() + 2_000),
    })
    const facts = () =>
      readDeletedSubjectClassifierRequestFacts({
        postIdentityId: post.identityId,
        feedIdentityId: feed.identityId,
        requestIds: [post.requestId, feed.requestId, liveRequestId],
      })
    const roots = { post: [post.identityId], rss_feed_item: [feed.identityId] }
    expect(await facts()).toEqual({ requests: 3, postRoot: 1, feedRoot: 1 })
    expect((await cleanupRetainedIdentityRoots(2, roots)).map(page => page.deleted)).toEqual([0, 0])
    expect(await facts()).toEqual({ requests: 3, postRoot: 1, feedRoot: 1 })
    const options = {
      retentionDays: 90,
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: startedAt,
      now: new Date(requestAt.getTime() + 3_000),
    }
    await withClassifierRetentionSweepLock(async () => {
      const first = await cleanupClassifierRecords(options)
      expect(first.requests).toEqual({ scanned: 1, deleted: 1, hasMore: true })
      expect((await facts()).requests).toBe(2)
      const second = await cleanupClassifierRecords(options)
      expect(second.requests).toEqual({ scanned: 1, deleted: 1, hasMore: true })
      const third = await cleanupClassifierRecords(options)
      expect(third.requests).toEqual({ scanned: 1, deleted: 0, hasMore: false })
      expect((await facts()).requests).toBe(1)
    })
    expect((await cleanupRetainedIdentityRoots(2, roots)).map(page => page.deleted)).toEqual([1, 1])
    expect(await facts()).toEqual({ requests: 1, postRoot: 0, feedRoot: 0 })
  })
})
