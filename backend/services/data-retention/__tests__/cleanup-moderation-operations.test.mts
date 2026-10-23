import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  acquireModerationOperationRetentionTestLock,
  createTestUser,
  deleteTestModerationRetentionRows,
  insertTestCommunity,
  insertTestModerationRetentionClaim,
  insertTestModerationRetentionReveal,
  insertTestPost,
  moderationRetentionRowExists,
  setTestModerationRetentionActivity,
} from '@voucha/test-helpers'
import { cleanupOldModerationMediaReveals, cleanupOldModerationQueueClaims } from '../cleanup.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

describe('moderation operation retention', () => {
  it('resumes a capped claim sweep and preserves a recently renewed old claim', async () => {
    const lock = await acquireModerationOperationRetentionTestLock()
    onTestFinished(() => lock.release())
    const moderator = await createTestUser()
    const community = await insertTestCommunity({ createdById: moderator.id })
    const posts = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        insertTestPost({
          createdById: moderator.id,
          slug: `retention-claim-${index}-${crypto.randomUUID()}`,
          title: 'Retention claim',
          markdown: 'body',
        }),
      ),
    )
    const fixtureAt = new Date(1_600_000_000_000 + Math.floor(Math.random() * 1_000_000))
    const ids = [0, 1].map(seq => uuidv7({ msecs: fixtureAt.getTime(), seq })).toSorted()
    onTestFinished(() => deleteTestModerationRetentionRows('claim', ids))
    const now = new Date(fixtureAt.getTime() + DAY_MS + 1)
    const options = { now, lowerBoundDate: fixtureAt, batchSize: 1, maxBatches: 1 }
    await insertTestModerationRetentionClaim({
      id: ids[0]!,
      communityId: community.id,
      postId: posts[0]!,
      claimedById: moderator.id,
      claimedAt: fixtureAt,
    })
    await insertTestModerationRetentionClaim({
      id: ids[1]!,
      communityId: community.id,
      postId: posts[1]!,
      claimedById: moderator.id,
      claimedAt: new Date(now.getTime() - 10 * 60_000),
    })

    const first = await cleanupOldModerationQueueClaims(options)
    expect(first).toEqual({ deleted: 1, hasMore: true, cursorId: ids[0] })
    const second = await cleanupOldModerationQueueClaims(options)
    expect(second).toEqual({ deleted: 0, hasMore: false, cursorId: null })
    expect(await moderationRetentionRowExists('claim', ids[1]!)).toBe(true)

    await setTestModerationRetentionActivity('claim', ids[1]!, fixtureAt)
    expect(await cleanupOldModerationQueueClaims(options)).toEqual({
      deleted: 1,
      hasMore: false,
      cursorId: null,
    })
    expect(await moderationRetentionRowExists('claim', ids[1]!)).toBe(false)
  })

  it('keeps a recently revealed row until the next cyclic sweep', async () => {
    const lock = await acquireModerationOperationRetentionTestLock()
    onTestFinished(() => lock.release())
    const fixtureAt = new Date(1_610_000_000_000 + Math.floor(Math.random() * 1_000_000))
    const ids = [0, 1].map(seq => uuidv7({ msecs: fixtureAt.getTime(), seq })).toSorted()
    const laterId = uuidv7({ msecs: fixtureAt.getTime() + 2 })
    onTestFinished(() => deleteTestModerationRetentionRows('reveal', [...ids, laterId]))
    const now = new Date(fixtureAt.getTime() + 7 * DAY_MS + 1)
    const options = { now, lowerBoundDate: fixtureAt, batchSize: 1, maxBatches: 1 }
    await insertTestModerationRetentionReveal({ id: ids[0]!, revealedAt: fixtureAt })
    await insertTestModerationRetentionReveal({
      id: ids[1]!,
      revealedAt: new Date(now.getTime() - 10 * 60_000),
    })
    await insertTestModerationRetentionReveal({ id: laterId, revealedAt: fixtureAt })

    expect(await cleanupOldModerationMediaReveals(options)).toEqual({
      deleted: 1,
      hasMore: true,
      cursorId: ids[0],
    })
    expect(
      await cleanupOldModerationMediaReveals({ ...options, now: new Date(now.getTime() + DAY_MS) }),
    ).toEqual({
      deleted: 0,
      hasMore: false,
      cursorId: null,
    })
    expect(await moderationRetentionRowExists('reveal', ids[1]!)).toBe(true)
    expect(await moderationRetentionRowExists('reveal', laterId)).toBe(true)

    await setTestModerationRetentionActivity('reveal', ids[1]!, fixtureAt)
    expect(
      await cleanupOldModerationMediaReveals({ ...options, now: new Date(now.getTime() + DAY_MS) }),
    ).toEqual({
      deleted: 1,
      hasMore: true,
      cursorId: ids[1],
    })
    expect(
      await cleanupOldModerationMediaReveals({ ...options, now: new Date(now.getTime() + DAY_MS) }),
    ).toEqual({
      deleted: 1,
      hasMore: false,
      cursorId: null,
    })
  })
})
