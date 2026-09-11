import { describe, expect, it, onTestFinished } from 'vitest'
import crypto from 'node:crypto'
import { encodeCursor } from '@modules/pagination'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import {
  createTestUser,
  acquireTestModerationTransparencyDateReservation,
  deleteTestAgentModerations,
  deleteTestModeratorActions,
  insertTestAgentModeration,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestModeratorAction,
  insertTestPost,
} from '@voucha/test-helpers'
import { getTransparencyWindow } from './all-time-transparency-pages.mts'
import {
  getCommunityModerationTransparency,
  getModerationTransparency,
} from './get-moderation-transparency.mts'

describe('all-time moderation transparency pages', () => {
  it('offers a global continuation only for an older globally visible cohort', async () => {
    const now = new Date('1971-01-15T12:00:00.000Z')
    const older = new Date('1970-01-05T12:00:00.000Z')
    const [owner, author, moderator] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const moderationIds: string[] = []
    const moderatorActionIds: string[] = []
    onTestFinished(async () => {
      await deleteTestModeratorActions(moderatorActionIds)
      await deleteTestAgentModerations(moderationIds)
    })
    const postIds = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        insertTestPost({
          title: `Older scoped cursor cohort ${index}`,
          slug: `older-scoped-cursor-cohort-${crypto.randomUUID()}`,
          createdById: author.id,
          markdown: 'Community-only moderation transparency cursor fixture.',
          communityId: community.id,
        }),
      ),
    )
    await Promise.all(
      postIds.map(async (postId, occurredAtSequence) => {
        moderationIds.push(
          await insertTestAgentModeration({
            postId,
            promptId: prompt.id,
            agentId: prompt.agent_id,
            occurredAt: older,
            occurredAtSequence,
          }),
        )
      }),
    )

    await expect(
      getCommunityModerationTransparency(community.id, 'all', now),
    ).resolves.toMatchObject({ next_cursor: expect.any(String) })
    await expect(getModerationTransparency('all', now)).resolves.toMatchObject({
      buckets: expect.not.arrayContaining([expect.objectContaining({ category: 'community_ai' })]),
    })

    await Promise.all(
      Array.from({ length: 20 }, async (_, occurredAtSequence) => {
        const action = await insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'approve',
          occurredAt: older,
          occurredAtSequence,
        })
        moderatorActionIds.push(action.id)
      }),
    )
    await expect(getModerationTransparency('all', now)).resolves.toMatchObject({
      next_cursor: expect.any(String),
    })
  })

  it('rejects out-of-range timestamps for global and scoped community cursors before date math', () => {
    const cutoff = new Date('2026-08-14T12:00:00.000Z')
    const id = '0191ef72-7fd9-7000-8000-000000000001'
    for (const scope of [
      'moderation-transparency:global:month-desc',
      'moderation-transparency:community:0191ef72-7fd9-7000-8000-000000000002:month-desc',
    ]) {
      for (const timestamp of [
        0,
        1,
        Date.UTC(1970, 11, 1),
        0x1_0000_0000_0000,
        8_640_000_000_000_001,
      ]) {
        expect(() =>
          getTransparencyWindow('all', cutoff, encodeCursor({ timestamp, id, scope }), scope),
        ).toThrow(
          expect.objectContaining({
            status: 400,
            message: 'Invalid moderation transparency cursor',
          }),
        )
      }
    }
  })

  it('requires a signed UTC-month boundary and its exact UUIDv7 lower bound', () => {
    const cutoff = new Date('2026-08-14T12:00:00.000Z')
    const month = new Date('2026-07-01T00:00:00.000Z')
    const scope = 'moderation-transparency:global:month-desc'
    const exactId = getMinUUIDv7ForDate(month)
    for (const cursor of [
      { timestamp: month.getTime() + 1, id: getMinUUIDv7ForDate(new Date(month.getTime() + 1)) },
      { timestamp: month.getTime(), id: getMinUUIDv7ForDate(new Date(month.getTime() + 1)) },
    ]) {
      expect(() =>
        getTransparencyWindow('all', cutoff, encodeCursor({ ...cursor, scope }), scope),
      ).toThrow(
        expect.objectContaining({ status: 400, message: 'Invalid moderation transparency cursor' }),
      )
    }

    expect(() =>
      getTransparencyWindow(
        'all',
        cutoff,
        encodeCursor({ timestamp: month.getTime(), id: exactId, scope }),
        scope,
      ),
    ).not.toThrow()
  })

  it('does not disclose a sparse older cohort', async () => {
    const now = new Date(
      Date.UTC(1972, Number.parseInt(crypto.randomUUID().slice(0, 2), 16) % 12, 15, 12),
    )
    const moderator = await createTestUser()
    const older = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 5))
    await Promise.all(
      Array.from({ length: 19 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'approve',
          occurredAt: older,
          occurredAtSequence,
        }),
      ),
    )
    const page = await getModerationTransparency('all', now)
    expect(page.buckets).not.toContainEqual(expect.objectContaining({ category: 'approve' }))
  })

  it('does not combine multiple subthreshold daily cohorts into an all-time month', async () => {
    const now = await uniqueTransparencyNow()
    const moderator = await createTestUser()
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 5))
    const secondDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 6))
    await Promise.all([
      ...Array.from({ length: 19 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'warn',
          occurredAt: firstDay,
          occurredAtSequence,
        }),
      ),
      ...Array.from({ length: 19 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'warn',
          occurredAt: secondDay,
          occurredAtSequence,
        }),
      ),
    ])

    const page = await getModerationTransparency('all', now)

    expect(page.buckets).not.toContainEqual(
      expect.objectContaining({
        category: 'warn',
        date: `${firstDay.toISOString().slice(0, 7)}-01`,
      }),
    )
  })

  it('rolls individually released daily cohorts into their all-time month', async () => {
    const now = await uniqueTransparencyNow()
    const moderator = await createTestUser()
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 5))
    const secondDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 6))
    await Promise.all([
      ...Array.from({ length: 22 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'lock',
          occurredAt: firstDay,
          occurredAtSequence,
        }),
      ),
      ...Array.from({ length: 23 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'lock',
          occurredAt: secondDay,
          occurredAtSequence,
        }),
      ),
    ])

    await expect(getModerationTransparency('all', now)).resolves.toMatchObject({
      buckets: expect.arrayContaining([
        {
          date: `${firstDay.toISOString().slice(0, 7)}-01`,
          metric: 'moderation_actions',
          category: 'lock',
          count: 45,
        },
      ]),
    })
  })

  it('returns bounded UTC-month pages without gaps', async () => {
    const now = await uniqueTransparencyNow()
    const moderator = await createTestUser()
    const recent = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 5))
    const older = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth() + 11, 5))
    await Promise.all([
      ...Array.from({ length: 20 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'approve',
          occurredAt: recent,
          occurredAtSequence,
        }),
      ),
      ...Array.from({ length: 20 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'remove',
          occurredAt: older,
          occurredAtSequence,
        }),
      ),
    ])

    const first = await getModerationTransparency('all', now)
    expect(first.buckets).toContainEqual(bucket(recent, 'approve'))
    expect(first.buckets).not.toContainEqual(expect.objectContaining({ category: 'remove' }))
    expect(first.next_cursor).toEqual(expect.any(String))

    const second = await getModerationTransparency('all', now, first.next_cursor)
    expect(second.buckets).toContainEqual(bucket(older, 'remove'))
    expect(first.buckets.map(result => result.date)).toEqual(
      [...first.buckets.map(result => result.date)].sort().reverse(),
    )
    expect(second.buckets.map(result => result.date)).toEqual(
      [...second.buckets.map(result => result.date)].sort().reverse(),
    )
  })
})

function bucket(date: Date, category: string) {
  return {
    date: `${date.toISOString().slice(0, 7)}-01`,
    metric: 'moderation_actions',
    category,
    count: 20,
  }
}

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}
