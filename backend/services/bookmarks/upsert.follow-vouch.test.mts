import { it, expect, describe } from 'vitest'
import { bookmarkEntity, unbookmarkEntity } from './upsert.mts'
import { getBookmarksForEntity } from './get.mts'
import {
  getUserVouchElectionVote,
  upsertUserVouchElectionVotes,
} from '@services/elections-votes/user-vouch'
import { assertWithinContributionQuota } from '@services/contribution-gating/quota'
import { deleteUser } from '@services/users'
import {
  createTestUser,
  createTestUsersDirect,
  insertTestTopic,
  getEntityRelation,
  resetContributionQuota,
} from '@voucha/test-helpers'

// Each test uses a fresh user to avoid bloom filter backfill races between tests
// that run in parallel with the rest of the bookmarks test suite.

describe('Follow -> trust-vote coupling (issue #7257)', () => {
  it('following a user auto-casts Like (+1)', async () => {
    const user = await createTestUser()
    const target = await createTestUser()

    await bookmarkEntity(user, 'user', { id: target.id }, 'follow')

    const vote = await getUserVouchElectionVote(user.id, target.id)
    expect(vote?.choice).toBe('like')
  })

  it('an official account following a user does not cast a vouch', async () => {
    // `administrator` is one of the OFFICIAL_ROLE_SLUGS in isOfficialAccount(), and admins
    // also bypass contribution-gating -- so this proves the isOfficialAccount guard itself
    // blocks the cast (without it, the admin contribution-status bypass would let it through).
    const official = await createTestUser({ administrator: true })
    const target = await createTestUser()

    await bookmarkEntity(official, 'user', { id: target.id }, 'follow')

    const vote = await getUserVouchElectionVote(official.id, target.id)
    expect(vote).toBeNull()
  })

  it('a contribution-ineligible account following a user does not cast a vouch', async () => {
    // No verified email -> getContributionStatus returns allowed: false
    // (email_verification_required), which must skip the vouch cast without failing the follow.
    const unverified = await createTestUser({ withEmail: false })
    const target = await createTestUser()

    await expect(
      bookmarkEntity(unverified, 'user', { id: target.id }, 'follow'),
    ).resolves.toBeDefined()

    const vote = await getUserVouchElectionVote(unverified.id, target.id)
    expect(vote).toBeNull()
  })

  it('following a topic does not cast a vouch', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Follow Vouch Topic ${random}`,
      slug: `follow-vouch-topic-${random}`,
      createdById: user.id,
    })

    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')

    const before = await getBookmarksForEntity(user, 'topic', { id: topicId })
    expect(before.follow).toBe(true)

    // The user-vouch guard is scoped to entityTypeName === 'user'; a topic follow must
    // never write a `user_vouch_votes` row keyed by the topic id.
    const vote = await getUserVouchElectionVote(user.id, topicId)
    expect(vote).toBeNull()
  })

  it('self-follow does not cast a self-vouch', async () => {
    const user = await createTestUser()

    // Self-follow is not guarded anywhere upstream (route, bookmarkEntity's own predicate
    // lookup, or upsertEntityRelation), so it reaches this code path and must be guarded here.
    await expect(bookmarkEntity(user, 'user', { id: user.id }, 'follow')).resolves.toBeDefined()

    const vote = await getUserVouchElectionVote(user.id, user.id)
    expect(vote).toBeNull()
  })

  it('self-follow with a differently-cased UUID does not cast a self-vouch', async () => {
    const user = await createTestUser()

    // Route params are validated against UUID_REGEX (case-insensitive) but never normalized,
    // so an upper-cased self id must still be caught by the guard here.
    await expect(
      bookmarkEntity(user, 'user', { id: user.id.toUpperCase() }, 'follow'),
    ).resolves.toBeDefined()

    const vote = await getUserVouchElectionVote(user.id, user.id)
    expect(vote).toBeNull()
  })

  it('unfollowing does not retract the vouch (one-directional, matches disavow->mute asymmetry)', async () => {
    const user = await createTestUser()
    const target = await createTestUser()

    await bookmarkEntity(user, 'user', { id: target.id }, 'follow')
    const before = await getUserVouchElectionVote(user.id, target.id)
    expect(before?.choice).toBe('like')

    await unbookmarkEntity(user, 'user', { id: target.id }, 'follow')

    const after = await getUserVouchElectionVote(user.id, target.id)
    expect(after?.choice).toBe('like')
  })

  it('re-following after a disavow casts a fresh Like without retracting the mute', async () => {
    const user = await createTestUser()
    const target = await createTestUser()

    await bookmarkEntity(user, 'user', { id: target.id }, 'follow')

    // Disavowing auto-mutes and soft-deletes the follow (existing behavior).
    await upsertUserVouchElectionVotes(user.id, [{ entityId: target.id, score: -2 }])
    const afterDisavow = await getUserVouchElectionVote(user.id, target.id)
    expect(afterDisavow?.choice).toBe('disavow')

    // Re-following casts a new Like (+1). Vote rows are append-only, so the latest
    // row (highest id) for this voter/target pair reflects the current vouch state.
    await bookmarkEntity(user, 'user', { id: target.id }, 'follow')

    const latestVote = await getUserVouchElectionVote(user.id, target.id)
    expect(latestVote?.choice).toBe('like')

    // The mute created by the disavow is not retracted by the re-follow -- the
    // follow -> vouch coupling is one-directional, same as disavow -> mute.
    const muteRelations = await getEntityRelation('relation__user__mute__user', user.id, target.id)
    expect(muteRelations).toHaveLength(1)
    expect((muteRelations[0] as { deleted_at: Date | null }).deleted_at).toBeNull()
  })

  it('the auto-vouch cast is rate-limited per follower and does not block the follow itself', async () => {
    // The bookmarks route has no per-route rate limiting (unlike the explicit vouch-vote
    // route), so the cast uses its own 'user-follow-vouch-cast' limiter: threshold 31 allows
    // 30 casts per 60s window (addAndCheck adds before counting -- same convention as the
    // explicit vouch-vote route's budget). A fresh user keeps the rate-limit key unique to
    // this test run.
    const user = await createTestUser()
    // Follow targets are identity-only; bulk insert keeps this 31-user burst on two queries
    // instead of 31 concurrent createTestUser pools that exhaust CI postgres (53300).
    const targets = await createTestUsersDirect(31)

    for (const target of targets) {
      await bookmarkEntity(user, 'user', { id: target.id }, 'follow')
    }

    const votes = await Promise.all(
      targets.map(target => getUserVouchElectionVote(user.id, target.id)),
    )
    expect(votes.filter(vote => vote?.choice === 'like')).toHaveLength(30)

    // The 31st follow relation itself still succeeds -- only the vouch cast is throttled.
    const lastTarget = targets[30]!
    const bookmarks = await getBookmarksForEntity(user, 'user', { id: lastTarget.id })
    expect(bookmarks.follow).toBe(true)
  }, 60_000)

  it('a follower who has exhausted their daily contribution quota does not cast a vouch', async () => {
    // Quota is deliberately read-only here (getContributionQuota, not
    // assertWithinContributionQuota) -- exhaust it via the explicit-vote path's own
    // assertion, matching how a real user would hit the cap before following anyone.
    const user = await createTestUser()
    const target = await createTestUser()

    await resetContributionQuota(user.id)
    for (let i = 0; i < 10; i++) {
      await assertWithinContributionQuota(user.id, false, null)
    }

    await expect(bookmarkEntity(user, 'user', { id: target.id }, 'follow')).resolves.toBeDefined()

    const vote = await getUserVouchElectionVote(user.id, target.id)
    expect(vote).toBeNull()

    // The follow relation itself still succeeds -- only the vouch cast is skipped.
    const bookmarks = await getBookmarksForEntity(user, 'user', { id: target.id })
    expect(bookmarks.follow).toBe(true)
  })

  it('following a soft-deleted user does not cast a vouch', async () => {
    const user = await createTestUser()
    const target = await createTestUser()
    await deleteUser(target, target)

    await expect(bookmarkEntity(user, 'user', { id: target.id }, 'follow')).resolves.toBeDefined()

    const vote = await getUserVouchElectionVote(user.id, target.id)
    expect(vote).toBeNull()

    // The follow relation itself still succeeds -- only the vouch cast is skipped.
    const bookmarks = await getBookmarksForEntity(user, 'user', { id: target.id })
    expect(bookmarks.follow).toBe(true)
  })
})
