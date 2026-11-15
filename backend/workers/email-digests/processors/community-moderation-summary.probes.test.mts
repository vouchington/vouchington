import { emptyModerationSummaryMetrics } from '@queues/background/enqueues/moderation-summary-state'
import { insertTestModerationSummaryCommunityCohort } from '@voucha/test-helpers/moderation-summary-count-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import { getMinUUIDv7ForDate } from '@modules/utils'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  claimCurrentModerationSummaryForTest,
  removeTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { claimTestModerationEmailSend } from '@voucha/test-helpers/moderation-summary-retention'
import {
  collectTestModerationSummaryState,
  createModerationSummaryCollection,
} from '@voucha/test-helpers/moderation-summary-collection'
import { observeTestPostgresQueryPools } from '@voucha/test-helpers/postgres-query-pool-observer'
import {
  hasModerationEmailSent,
  releaseUnsentModerationEmailClaim,
} from '@services/communities/moderation-summary-emails'
import { updateUserFields } from '@services/users/update-fields'
import { processSendCommunityModerationSummaryEmail } from './community-moderation-summary.mts'

describe('moderator digest replacement-chain delivery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('suppresses an old retry whose conditional mark loses to a replacement chain', async () => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
    const send = vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
    const user = await createTestUser()
    await updateUserFields(user.id, { is_moderation_emails_enabled: true })
    const community = await insertTestCommunity({ createdById: user.id })
    const membership = await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      role: 'owner',
    })
    const postId = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'Claim interleaving discussion',
      markdown: 'Pending',
      slug: `digest-claim-${crypto.randomUUID()}`,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user.id,
    })
    const { trackingKey, windowEnd, dispatchTimeZone } = await claimCurrentModerationSummaryForTest(
      user.id,
    )
    // A failed collection releases its unsent row; dispatch can claim the same period again.
    expect(await releaseUnsentModerationEmailClaim(user.id, trackingKey)).toBe(true)
    expect(await claimTestModerationEmailSend(user.id, trackingKey)).toBe(true)
    const end = new Date(windowEnd)
    const input = {
      userId: user.id,
      trackingKey,
      windowStart: new Date(end.getTime() - 86400000).toISOString(),
      windowEnd,
      uiLocale: 'en-US',
    }
    const collection = createModerationSummaryCollection()
    collection.phase = 'discussions'
    collection.afterMembershipId = membership.id
    collection.upperMembershipId = getMinUUIDv7ForDate(end)
    collection.eligibleCount = 1
    collection.top = [
      {
        communityId: community.id,
        pendingScore: 1,
        discussionPostId: null,
        metrics: { ...emptyModerationSummaryMetrics(), pending_post_reviews: 1 },
      },
    ]
    const variables = {
      generatedForDate: windowEnd.slice(0, 10),
      dispatchTimeZone,
      settingsUrl: 'https://example.test/settings',
      remainingCommunityCount: 0,
      communities: [],
      collection,
    }
    const oldRead = Promise.withResolvers<void>()
    const releaseOld = Promise.withResolvers<void>()
    // Pause only the old caller's JS continuation after its real primary read returned false.
    // The replacement runs outside this observer's AsyncLocalStorage scope.
    const old = observeTestPostgresQueryPools(
      'hasModerationEmailSent',
      () => processSendCommunityModerationSummaryEmail(input, variables),
      async () => {
        oldRead.resolve()
        await releaseOld.promise
      },
    )
    void old.catch(() => undefined)
    try {
      await Promise.race([
        oldRead.promise,
        old.then(() => {
          throw new Error('Old retry did not reach its pre-send check')
        }),
      ])
      await processSendCommunityModerationSummaryEmail(input, {
        ...variables,
        collection: { ...collection, eventId: crypto.randomUUID() },
      })
      expect(send).toHaveBeenCalledTimes(1)
      releaseOld.resolve()
      expect((await old).result).toBeNull()
      expect(send).toHaveBeenCalledTimes(1)
      expect(await hasModerationEmailSent(user.id, trackingKey)).toBe(true)
    } finally {
      releaseOld.resolve()
      await old.catch(() => undefined)
    }
  })
})

describe('moderator summary final selection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('does not count a revoked selected community among the other communities', async () => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
    const send = vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
    const user = await createTestUser()
    await updateUserFields(user.id, { is_moderation_emails_enabled: true })
    const ids = await insertTestModerationSummaryCommunityCohort(user.id)
    const end = new Date(),
      start = new Date(end.getTime() - 86400000)
    const collected = await collectTestModerationSummaryState(user.id, start, end, end)
    expect(collected.communities).toHaveLength(20)
    await removeTestCommunityMember(ids[0]!, user.id)
    const { trackingKey, windowEnd, dispatchTimeZone } = await claimCurrentModerationSummaryForTest(
      user.id,
    )
    await processSendCommunityModerationSummaryEmail(
      {
        userId: user.id,
        trackingKey,
        windowStart: start.toISOString(),
        windowEnd,
        uiLocale: 'en-US',
      },
      {
        ...collected,
        generatedForDate: windowEnd.slice(0, 10),
        dispatchTimeZone,
        settingsUrl: 'https://example.test/settings',
        remainingCommunityCount: 0,
      },
    )
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('And 1 more') }),
    )
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('And 2 more') }),
    )
  })
})
