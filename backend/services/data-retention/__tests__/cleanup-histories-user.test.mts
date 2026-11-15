import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestTopic, createTestUser } from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import {
  createHistoryRetentionWindow,
  insertFollowedImportAt,
  insertPendingImportAt,
  insertTopicRecommendationForRetention,
} from '@voucha/test-helpers/history-retention-seeds'
import {
  readRemainingHistoryIds,
  reserveHistoryRetentionFixtureIds,
} from '@voucha/test-helpers/history-retention-reads'
import { cleanupHistories } from '../cleanup-histories.mts'
import { listResidualCandidate, type HistoryKind } from '../cleanup-histories-candidates.mts'

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

describe('bounded import history retention', () => {
  it.each<HistoryKind>(['pending_user_import_requests', 'dynamic_configuration_revisions'])(
    'keeps the %s residual probe below the zero cursor',
    async kind => {
      await using transaction = await beginTransaction()
      const zeroId = '00000000-0000-0000-0000-000000000000'
      expect(await listResidualCandidate(transaction, kind, zeroId, zeroId, null)).toEqual([])
    },
  )

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

    const result = await cleanupHistories({
      kinds: ['followed_user_import_requests'],
      ...scoped,
      now: new Date(base.getTime() + 100 * day),
    }).then(cleanupResult => cleanupResult.followed_user_import_requests)
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

    const result = await cleanupHistories({
      kinds: ['pending_user_import_requests'],
      ...scoped,
      now: new Date(base.getTime() + 180 * day + 1),
    }).then(cleanupResult => cleanupResult.pending_user_import_requests)
    expect(result).toEqual({ scanned: 1, changed: 1, hasMore: false })
    expect(await readRemainingHistoryIds('pending_user_import_requests', ids)).toEqual([ids[1]])
  })
})
