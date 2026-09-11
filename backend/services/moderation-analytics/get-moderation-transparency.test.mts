import { describe, expect, it, onTestFinished } from 'vitest'
import crypto from 'node:crypto'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  createSystemUser,
  insertTestAgentModeration,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestPostClearanceChange,
  insertTestModerationReportsForTarget,
  updateTestModerationReportReason,
  insertTestModerationAppeal,
  insertTestModeratorAction,
  insertTestPost,
  insertTestUserWarning,
  resolveTestModerationAppeal,
} from '@voucha/test-helpers'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import {
  getCommunityModerationTransparency,
  getModerationTransparency,
} from './get-moderation-transparency.mts'

describe('getModerationTransparency', () => {
  it('releases only mature global report and action cohorts rounded to five', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const suffix = crypto.randomUUID().slice(0, 8)
    const [author, moderator] = await Promise.all([createTestUser(), createTestUser()])
    const postId = await insertTestPost({
      title: `Transparency ${suffix}`,
      slug: `transparency-${suffix}`,
      createdById: author.id,
      markdown: 'Test transparency aggregation.',
    })
    const reporters = await Promise.all(
      Array.from({ length: 22 }, () => createTestUser().then(user => user!.id)),
    )

    await Promise.all([
      insertTestModerationReportsForTarget({
        reporterUserIds: reporters,
        entityType: 'post',
        entityId: postId,
        createdAt: occurredAt,
      }),
      ...Array.from({ length: 22 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'remove',
          occurredAt,
          occurredAtSequence,
        }),
      ),
    ])

    const transparency = await getModerationTransparency('all', now)
    const date = `${occurredAt.toISOString().slice(0, 7)}-01`

    expect(transparency.buckets).toEqual(
      expect.arrayContaining([
        { date, metric: 'reports', category: 'spam', count: 20 },
        { date, metric: 'moderation_actions', category: 'remove', count: 20 },
      ]),
    )
  })

  it('keeps a released report cohort in its original reason after a pending report is edited', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const [author, ...reporters] = await Promise.all(
      Array.from({ length: 21 }, () => createTestUser()),
    )
    const postId = await insertTestPost({
      title: `Transparency ${crypto.randomUUID()}`,
      slug: `transparency-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Test transparency aggregation.',
    })
    const reportIds = await insertTestModerationReportsForTarget({
      reporterUserIds: reporters.map(reporter => reporter.id),
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
      createdAt: occurredAt,
    })
    await updateTestModerationReportReason(reportIds[0]!, 'harassment')

    await expect(getModerationTransparency('all', now)).resolves.toMatchObject({
      buckets: expect.arrayContaining([
        {
          date: `${occurredAt.toISOString().slice(0, 7)}-01`,
          metric: 'reports',
          category: 'spam',
          count: 20,
        },
      ]),
    })
  })

  it('withholds community-agent events after their agent is deleted', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      deletedAgentAt: new Date(occurredAt.getTime() - 1),
    })
    const posts = await createTransparencyPosts(
      20,
      community.id,
      author.id,
      crypto.randomUUID().slice(0, 8),
    )
    await Promise.all(
      posts.map((postId, occurredAtSequence) =>
        insertTestAgentModeration({
          postId,
          promptId: prompt.id,
          agentId: prompt.agent_id,
          occurredAt,
          occurredAtSequence,
        }),
      ),
    )

    await expect(getCommunityModerationTransparency(community.id, 'all', now)).resolves.toEqual({
      range: 'all',
      buckets: [],
    })
  })

  it('classifies mature OpenAI, spam, and system clearance cohorts without leaking source records', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const suffix = crypto.randomUUID().slice(0, 8)
    const [author, systemActor] = await Promise.all([
      createTestUser(),
      createSystemUser(MODERATION_SYSTEM_USERNAME),
    ])
    const postIds = await Promise.all(
      ['openai', 'spam', 'system'].map(category =>
        insertTestPost({
          title: `Transparency ${category} ${suffix}`,
          slug: `transparency-${category}-${suffix}`,
          createdById: author.id,
          markdown: 'Test transparency classification.',
        }),
      ),
    )
    await Promise.all([
      ...Array.from({ length: 22 }, (_, occurredAtSequence) =>
        insertTestPostClearanceChange({
          postId: postIds[0]!,
          status: 'rejected',
          moderationTransparencyCategories: ['openai_omni'],
          occurredAt,
          occurredAtSequence,
        }),
      ),
      ...Array.from({ length: 22 }, (_, occurredAtSequence) =>
        insertTestPostClearanceChange({
          postId: postIds[1]!,
          status: 'rejected',
          moderationTransparencyCategories: ['spam_detection'],
          occurredAt,
          occurredAtSequence: 100 + occurredAtSequence,
        }),
      ),
      ...Array.from({ length: 22 }, (_, occurredAtSequence) =>
        insertTestPostClearanceChange({
          postId: postIds[2]!,
          status: 'rejected',
          changedById: systemActor.id,
          moderationTransparencyCategories: ['post_clearance_reject'],
          occurredAt,
          occurredAtSequence: 200 + occurredAtSequence,
        }),
      ),
    ])

    const transparency = await getModerationTransparency('all', now)
    const date = `${occurredAt.toISOString().slice(0, 7)}-01`
    expect(transparency.buckets).toEqual(
      expect.arrayContaining([
        { date, metric: 'automated_moderation', category: 'openai_omni', count: 20 },
        { date, metric: 'automated_moderation', category: 'spam_detection', count: 20 },
        { date, metric: 'automated_moderation', category: 'post_clearance_reject', count: 20 },
      ]),
    )
  })

  it('releases only mature resolved appeal cohorts', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const staff = await createTestUser()
    const appeals = await Promise.all(
      Array.from({ length: 22 }, async () => {
        const appellant = await createTestUser()
        const warning = await insertTestUserWarning({ userId: appellant.id, issuedById: staff.id })
        return insertTestModerationAppeal({ appellantId: appellant.id, userWarningId: warning.id })
      }),
    )
    await Promise.all(
      appeals.map(appeal =>
        resolveTestModerationAppeal({
          appealId: appeal.id,
          resolvedAt: occurredAt,
          resolutionAction: 'accept',
        }),
      ),
    )

    await expect(getModerationTransparency('all', now)).resolves.toMatchObject({
      buckets: expect.arrayContaining([
        {
          date: `${occurredAt.toISOString().slice(0, 7)}-01`,
          metric: 'appeals',
          category: 'accept',
          count: 20,
        },
      ]),
    })
  })
})

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}

async function createTransparencyPosts(
  count: number,
  communityId: string,
  authorId: string,
  suffix: string,
): Promise<string[]> {
  return Promise.all(
    Array.from({ length: count }, (_, index) =>
      insertTestPost({
        title: `Transparency ${suffix} ${index}`,
        slug: `transparency-${suffix}-${communityId.slice(0, 8)}-${index}`,
        createdById: authorId,
        markdown: 'Test transparency aggregation.',
        communityId,
      }),
    ),
  )
}
