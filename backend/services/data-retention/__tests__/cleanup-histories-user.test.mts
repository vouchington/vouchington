import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import {
  createHistoryRetentionWindow,
  insertFollowedImportAt,
  insertPendingImportAt,
  insertReferralAttributionAt,
  insertTopicRecommendationForRetention,
} from '@voucha/test-helpers/history-retention-seeds'
import {
  readReferralDetails,
  readRemainingHistoryIds,
  reserveHistoryRetentionFixtureIds,
} from '@voucha/test-helpers/history-retention-reads'
import { getReferralClickLog } from '../../attribution/click-log.mts'
import { streamReferralAttributions } from '../../account-data-requests/stream-consents.mts'
import { cleanupHistory } from '../cleanup-histories.mts'

const day = 24 * 60 * 60 * 1000

async function createRecommendationPost(userId: string): Promise<string> {
  const suffix = crypto.randomUUID()
  const postId = await insertTestPost({
    title: `Pending retention ${suffix}`,
    slug: `pending-retention-${suffix}`,
    markdown: 'Pending topic recommendation',
    createdById: userId,
    postType: 'topic_recommendation',
  })
  await insertTopicRecommendationForRetention(postId)
  return postId
}

describe('bounded import and referral history retention', () => {
  it('expires only imports followed more than 90 days ago', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds('followed_user_import_requests')
    const { base, ...range } = createHistoryRetentionWindow(5)
    const scoped = { ...range, batchSize: 1, maxBatches: 5 }
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const ids = [
      await insertFollowedImportAt(user.id, topic.id, base, new Date(base.getTime() + 5 * day)),
      await insertFollowedImportAt(
        user.id,
        topic.id,
        new Date(base.getTime() + 1),
        new Date(base.getTime() + 12 * day),
      ),
    ]
    ownedIds.push(...ids)

    const result = await cleanupHistory('followed_user_import_requests', {
      ...scoped,
      now: new Date(base.getTime() + 100 * day),
    })
    expect(result).toEqual({ scanned: 2, changed: 1, hasMore: false })
    expect(await readRemainingHistoryIds('followed_user_import_requests', ids)).toEqual([ids[1]])
  })

  it('expires pending imports only after 180 days', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds('pending_user_import_requests')
    const { base, ...range } = createHistoryRetentionWindow(5)
    const scoped = { ...range, batchSize: 1, maxBatches: 5 }
    const user = await createTestUser()
    const firstPostId = await createRecommendationPost(user.id)
    const secondPostId = await createRecommendationPost(user.id)
    const ids = [
      await insertPendingImportAt(user.id, firstPostId, base),
      await insertPendingImportAt(user.id, secondPostId, new Date(base.getTime() + 2)),
    ]
    ownedIds.push(...ids)

    const result = await cleanupHistory('pending_user_import_requests', {
      ...scoped,
      now: new Date(base.getTime() + 180 * day + 1),
    })
    expect(result).toEqual({ scanned: 1, changed: 1, hasMore: false })
    expect(await readRemainingHistoryIds('pending_user_import_requests', ids)).toEqual([ids[1]])
  })

  it('scrubs a 90-day click without losing its click log or GDPR export, then expires it at 24 months', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds('referral_attribution_expiry')
    const { base, ...range } = createHistoryRetentionWindow(5)
    const scoped = { ...range, batchSize: 1, maxBatches: 5 }
    const referrer = await createTestUser()
    const referred = await createTestUser()
    const oldId = await insertReferralAttributionAt(referrer.id, referred.id, base)
    const freshId = await insertReferralAttributionAt(
      referrer.id,
      referred.id,
      new Date(base.getTime() + 4),
    )
    const ids = [oldId, freshId]
    ownedIds.push(...ids)

    const scrub = await cleanupHistory('referral_attribution_scrub', {
      ...scoped,
      now: new Date(base.getTime() + 90 * day + 2),
    })
    expect(scrub).toEqual({ scanned: 1, changed: 1, hasMore: false })
    expect(await readReferralDetails(oldId)).toEqual({
      landing_url: null,
      utm_source: null,
      utm_medium: null,
    })
    expect((await readReferralDetails(freshId))?.landing_url).toBe('https://example.com/retention')
    expect((await getReferralClickLog(referrer.id)).clicks[oldId]?.landing_url).toBeNull()
    const exported = []
    for await (const row of streamReferralAttributions(referred.id)) exported.push(row)
    expect(exported.find(row => row.id === oldId)?.landing_url).toBeNull()

    const after24Months = new Date(
      Date.UTC(
        base.getUTCFullYear() + 2,
        base.getUTCMonth(),
        base.getUTCDate(),
        base.getUTCHours(),
        base.getUTCMinutes(),
        base.getUTCSeconds(),
        base.getUTCMilliseconds() + 2,
      ),
    )
    const expiry = await cleanupHistory('referral_attribution_expiry', {
      ...scoped,
      now: after24Months,
    })
    expect(expiry).toEqual({ scanned: 1, changed: 1, hasMore: false })
    expect(await readRemainingHistoryIds('referral_attribution_expiry', ids)).toEqual([freshId])
  })
})
