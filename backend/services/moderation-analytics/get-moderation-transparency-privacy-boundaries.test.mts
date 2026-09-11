import crypto from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  createTestAgent,
  insertTestAgentModeration,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestAgentPrompt,
  insertTestModerationAppeal,
  insertTestModerationReport,
  insertTestModerationReportsForTarget,
  insertTestModeratorAction,
  insertTestPost,
  insertTestPostClearanceChange,
  insertTestUserWarning,
  resolveTestModerationAppeal,
} from '@voucha/test-helpers'
import { getRangeStart } from './get-moderation-analytics.mts'
import { getTransparencyRangeStart, getTransparencyWindow } from './all-time-transparency-pages.mts'
import {
  getCommunityModerationTransparency,
  getModerationTransparency,
} from './get-moderation-transparency.mts'

describe('moderation transparency privacy boundaries', () => {
  it('preserves raw rolling analytics ranges as exact durations', () => {
    const now = new Date('2026-08-16T15:42:13.456Z')

    expect(getRangeStart('today', now)).toEqual(new Date('2026-08-16T00:00:00.000Z'))
    expect(getRangeStart('7d', now)).toEqual(new Date('2026-08-09T15:42:13.456Z'))
    expect(getRangeStart('30d', now)).toEqual(new Date('2026-07-17T15:42:13.456Z'))
    expect(getRangeStart('90d', now)).toEqual(new Date('2026-05-18T15:42:13.456Z'))
  })

  it('aligns every short-range start to a complete UTC day', () => {
    const cutoff = new Date('2026-08-16T15:42:13.456Z')

    expect(getTransparencyRangeStart('today', cutoff)).toEqual(new Date('2026-08-16T00:00:00.000Z'))
    expect(getTransparencyRangeStart('7d', cutoff)).toEqual(new Date('2026-08-10T00:00:00.000Z'))
    expect(getTransparencyRangeStart('30d', cutoff)).toEqual(new Date('2026-07-18T00:00:00.000Z'))
    expect(getTransparencyRangeStart('90d', cutoff)).toEqual(new Date('2026-05-19T00:00:00.000Z'))
  })

  it.each([
    ['today', 1],
    ['7d', 7],
    ['30d', 30],
    ['90d', 90],
  ] as const)('uses exactly %s inclusive complete UTC cohort(s) for %i', (range, days) => {
    const cutoff = new Date('2026-08-16T23:59:59.999Z')
    const { periodStart, periodEnd } = getTransparencyWindow(range, cutoff)

    expect((periodEnd.getTime() - periodStart.getTime() + 1) / (24 * 60 * 60 * 1000)).toBe(days)
  })

  it('keeps community AI cohorts out of the overlapping global projection', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const postIds = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        insertTestPost({
          title: `Private community cohort ${index}`,
          slug: `private-community-cohort-${crypto.randomUUID()}`,
          createdById: author.id,
          markdown: 'Community-only moderation transparency event.',
          communityId: community.id,
        }),
      ),
    )
    await Promise.all(
      postIds.map((postId, occurredAtSequence) =>
        insertTestAgentModeration({
          postId,
          promptId: prompt.id,
          agentId: prompt.agent_id,
          occurredAt,
          occurredAtSequence,
        }),
      ),
    )

    const [global, scoped] = await Promise.all([
      getModerationTransparency('all', now),
      getCommunityModerationTransparency(community.id, 'all', now),
    ])
    expect(
      global.buckets.some(
        bucket =>
          bucket.date === `${occurredAt.toISOString().slice(0, 7)}-01` &&
          bucket.category === 'community_ai',
      ),
    ).toBe(false)
    expect(scoped.buckets).toContainEqual({
      date: `${occurredAt.toISOString().slice(0, 7)}-01`,
      metric: 'automated_moderation',
      category: 'community_ai',
      count: 20,
    })
  })

  it('keeps platform-agent community-post cohorts out of global transparency while disclosing their community aggregate', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const agent = await createTestAgent()
    const promptId = await insertTestAgentPrompt({ agentId: agent.id })
    const postIds = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        insertTestPost({
          title: `Platform community cohort ${index}`,
          slug: `platform-community-cohort-${crypto.randomUUID()}`,
          createdById: author.id,
          markdown: 'Platform moderation of a community post.',
          communityId: community.id,
        }),
      ),
    )
    await Promise.all(
      postIds.map((postId, occurredAtSequence) =>
        insertTestAgentModeration({
          postId,
          promptId,
          agentId: agent.id,
          occurredAt,
          occurredAtSequence,
        }),
      ),
    )

    const [global, scoped] = await Promise.all([
      getModerationTransparency('all', now),
      getCommunityModerationTransparency(community.id, 'all', now),
    ])
    expect(
      global.buckets.some(
        bucket =>
          bucket.date === `${occurredAt.toISOString().slice(0, 7)}-01` &&
          bucket.metric === 'automated_moderation' &&
          bucket.category === 'agent_moderation',
      ),
    ).toBe(false)
    expect(scoped.buckets).toContainEqual({
      date: `${occurredAt.toISOString().slice(0, 7)}-01`,
      metric: 'automated_moderation',
      category: 'agent_moderation',
      count: 20,
    })
  })

  it('excludes every community-scoped source from global transparency', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const [owner, author, moderator] = await Promise.all(
      Array.from({ length: 3 }, () => createTestUser()),
    )
    const community = await insertTestCommunity({ createdById: owner.id })
    const postId = await insertTestPost({
      title: `Scoped transparency ${crypto.randomUUID()}`,
      slug: `scoped-transparency-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Community-scoped moderation event.',
      communityId: community.id,
    })
    const reporters = await Promise.all(
      Array.from({ length: 20 }, () => createTestUser().then(user => user!.id)),
    )
    const appeals = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const appellant = await createTestUser()
        const warning = await insertTestUserWarning({
          userId: appellant.id,
          issuedById: moderator.id,
        })
        return insertTestModerationAppeal({
          appellantId: appellant.id,
          userWarningId: warning.id,
          communityId: community.id,
        })
      }),
    )

    await Promise.all([
      insertTestModerationReportsForTarget({
        reporterUserIds: reporters,
        entityType: 'post',
        entityId: postId,
        reason: 'harassment',
        createdAt: occurredAt,
      }),
      ...reporters.map((reporterUserId, index) =>
        insertTestModerationReport({
          reporterUserId,
          entityType: 'user',
          entityId: author.id,
          reason: 'other',
          createdAt: new Date(occurredAt.getTime() + index),
          communityId: community.id,
        }),
      ),
      ...Array.from({ length: 20 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'warn',
          communityId: community.id,
          occurredAt,
          occurredAtSequence,
        }),
      ),
      ...Array.from({ length: 20 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'pin',
          occurredAt,
          occurredAtSequence: 100 + occurredAtSequence,
        }),
      ),
      ...Array.from({ length: 20 }, (_, occurredAtSequence) =>
        insertTestPostClearanceChange({
          postId,
          status: 'rejected',
          moderationTransparencyCategories: ['spam_detection'],
          occurredAt,
          occurredAtSequence,
        }),
      ),
      ...appeals.map(appeal =>
        resolveTestModerationAppeal({
          appealId: appeal.id,
          resolvedAt: occurredAt,
          resolutionAction: 'deny',
        }),
      ),
    ])

    const global = await getModerationTransparency('7d', now)
    expect(global.buckets).toContainEqual({
      date: occurredAt.toISOString().slice(0, 10),
      metric: 'moderation_actions',
      category: 'pin',
      count: 20,
    })
    for (const scoped of [
      ['reports', 'harassment'],
      ['reports', 'other'],
      ['moderation_actions', 'warn'],
      ['automated_moderation', 'spam_detection'],
      ['appeals', 'deny'],
    ] as const) {
      expect(
        global.buckets.some(
          bucket =>
            bucket.date === occurredAt.toISOString().slice(0, 10) &&
            bucket.metric === scoped[0] &&
            bucket.category === scoped[1],
        ),
      ).toBe(false)
    }
  })
})

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}
