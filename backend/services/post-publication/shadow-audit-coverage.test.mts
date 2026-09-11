import {
  beginTransaction,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  insertTestCommunity,
  insertTestPost,
  insertTestPostStory,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  acknowledgePostPublicationDirtyWork,
  acknowledgePostPublicationProjectionReceipts,
  claimPostPublicationDirtyWork,
  reconcilePostPublicationDirtyWork,
  recordPostPublicationChange,
} from './index.mts'
import { runPostPublicationShadowAudit } from './shadow-audit.mts'

describe('post publication shadow audit coverage', () => {
  it('counts every scoped candidate separately from one pending-work discrepancy', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected source-page user fixture')
    const suffix = randomUUID()
    const prefix = `${suffix.slice(0, 8)}-${suffix.slice(9, 12)}`
    const cursor = `${prefix}0-7000-8000-000000000000`
    const cleanPostId = `${prefix}1-7000-8000-000000000001`
    const driftPostId = `${prefix}2-7000-8000-000000000002`
    const [community, topic] = await Promise.all([
      insertTestCommunity({ createdById: user.id }),
      createTestTopic({ user }),
    ])
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await Promise.all([
      insertTestPost({
        id: cleanPostId,
        title: `Shadow clean ${suffix}`,
        slug: `shadow-clean-${suffix}`,
        markdown: 'Clean source-page row.',
        createdById: user.id,
        communityId: community.id,
      }),
      insertTestPost({
        id: driftPostId,
        title: `Shadow drift ${suffix}`,
        slug: `shadow-drift-${suffix}`,
        markdown: 'Drift source-page row.',
        createdById: user.id,
        communityId: community.id,
      }),
    ])
    const [cleanItem, driftItem, cleanStory, driftStory] = await Promise.all([
      createTestRssFeedItemWithUrl(feedId),
      createTestRssFeedItemWithUrl(feedId),
      insertTestStory(),
      insertTestStory(),
    ])
    await Promise.all([
      setTestItemStoryId(cleanItem.id, cleanStory.id),
      setTestItemStoryId(driftItem.id, driftStory.id),
      insertTestPostStory(cleanPostId, cleanStory.id, user.id),
      insertTestPostStory(driftPostId, driftStory.id, user.id),
    ])
    await using cleanCaptureQuery = await beginTransaction()
    const cleanWork = await recordPostPublicationChange(cleanCaptureQuery, {
      scope: { type: 'post', postId: cleanPostId },
      reason: 'post_created',
    })
    await cleanCaptureQuery.commit()
    const cleanClaim = await claimPostPublicationDirtyWork(cleanWork, 60)
    if (!cleanClaim) throw new Error('Expected clean source-page lease')
    const cleanResult = await reconcilePostPublicationDirtyWork(cleanClaim)
    await acknowledgePostPublicationProjectionReceipts(cleanClaim, cleanResult.posts)
    await acknowledgePostPublicationDirtyWork({
      id: cleanClaim.id,
      generation: cleanClaim.generation,
      leaseToken: cleanClaim.lease_token,
    })
    await using driftCaptureQuery = await beginTransaction()
    const driftWork = await recordPostPublicationChange(driftCaptureQuery, {
      scope: { type: 'post', postId: driftPostId },
      reason: 'post_created',
    })
    await driftCaptureQuery.commit()
    const driftClaim = await claimPostPublicationDirtyWork(driftWork, 60)
    if (!driftClaim) throw new Error('Expected pending-drift lease')
    const driftResult = await reconcilePostPublicationDirtyWork(driftClaim)
    await expect(
      acknowledgePostPublicationProjectionReceipts(driftClaim, driftResult.posts),
    ).resolves.toBe(true)

    await expect(
      runPostPublicationShadowAudit({ dryRun: true, limit: 2, cursor }),
    ).resolves.toMatchObject({
      scannedByScope: { post: 2, author: 2, community: 2, rssFeed: 2 },
      discrepanciesByScope: { post: 1, author: 1, community: 1, rssFeed: 1 },
      checkpoint: driftPostId,
      hasMore: true,
    })
  })
})
