import crypto from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  deleteTestCommunityAgentPrompt,
  hardDeleteTestPost,
  insertTestAgentModeration,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestPost,
  setTestAgentDeletedAt,
  setTestAgentModerationDeletedAt,
  setTestAgentModerationTransparencyCategory,
  setTestCommunityAgentPromptDeletedAt,
  setTestCommunityAgentPromptCommunity,
  setTestModerationPromptDeletedAt,
  touchTestAgentModeration,
} from '@voucha/test-helpers'
import {
  getCommunityModerationTransparency,
  getModerationTransparency,
} from './get-moderation-transparency.mts'
import { releaseTestWindow } from './release-test-window.mts'

describe('moderation transparency agent rollups', () => {
  it('protects the stamped source projection from direct rewrites', async () => {
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const [postId] = await createPosts(1, community.id, author.id)
    const moderationId = await insertTestAgentModeration({
      postId: postId!,
      promptId: prompt.id,
      agentId: prompt.agent_id,
    })
    await touchTestAgentModeration(moderationId)
    await expect(
      setTestAgentModerationTransparencyCategory(moderationId, 'agent_moderation'),
    ).rejects.toThrow('agent moderation transparency projection is trigger-maintained')
  })
  it('keeps a released cohort immutable through source and parent lifecycle changes', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const postIds = await createPosts(20, community.id, author.id)
    const moderationIds = await Promise.all(
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
    const expected = {
      date: `${occurredAt.toISOString().slice(0, 7)}-01`,
      metric: 'automated_moderation',
      category: 'community_ai',
      count: 20,
    }
    await expectCommunity(community.id, now, [expected])
    await setTestAgentModerationDeletedAt(moderationIds[0]!, now)
    await expectCommunity(community.id, now, [expected])
    await setTestAgentModerationDeletedAt(moderationIds[0]!, null)

    const beforeEvent = new Date(occurredAt.getTime() - 1)
    for (const setDeletedAt of [
      (deletedAt: Date | null) => setTestModerationPromptDeletedAt(prompt.id, deletedAt),
      (deletedAt: Date | null) => setTestAgentDeletedAt(prompt.agent_id, deletedAt),
      (deletedAt: Date | null) => setTestCommunityAgentPromptDeletedAt(prompt.id, deletedAt),
    ]) {
      await setDeletedAt(beforeEvent)
      await expectCommunity(community.id, now, [expected])
      await setDeletedAt(null)
      await expectCommunity(community.id, now, [expected])
    }

    const movedCommunity = await insertTestCommunity({ createdById: owner.id })
    await setTestCommunityAgentPromptCommunity(prompt.id, movedCommunity.id)
    await expectCommunity(community.id, now, [expected])
    await expectCommunity(movedCommunity.id, now, [])
    await deleteTestCommunityAgentPrompt(prompt.id)
    await expectCommunity(community.id, now, [expected])
    const global = await getModerationTransparency('all', now)
    expect(global.buckets.some(bucket => bucket.category === 'community_ai')).toBe(false)
  })
  it('preserves an older released community cohort after hard post cascades', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 18, 5))
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const postIds = await createPosts(20, community.id, author.id)
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

    await releaseTestWindow(now)
    const firstPage = await getCommunityModerationTransparency(community.id, 'all', now)
    expect(firstPage).toMatchObject({
      buckets: [],
      next_cursor: expect.any(String),
    })
    await Promise.all(postIds.map(postId => hardDeleteTestPost(postId)))
    await expect(
      getCommunityModerationTransparency(community.id, 'all', now, firstPage.next_cursor),
    ).resolves.toMatchObject({
      buckets: [
        {
          date: `${occurredAt.toISOString().slice(0, 7)}-01`,
          metric: 'automated_moderation',
          category: 'community_ai',
          count: 20,
        },
      ],
    })
  })
})

async function expectCommunity(communityId: string, now: Date, buckets: unknown[]): Promise<void> {
  await releaseTestWindow(now)
  await expect(getCommunityModerationTransparency(communityId, 'all', now)).resolves.toEqual({
    range: 'all',
    buckets,
  })
}

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(reservation.release)
  return reservation.now
}

async function createPosts(
  count: number,
  communityId: string,
  authorId: string,
): Promise<string[]> {
  const suffix = crypto.randomUUID()
  return Promise.all(
    Array.from({ length: count }, (_, index) =>
      insertTestPost({
        title: `Transparency lifecycle ${suffix} ${index}`,
        slug: `transparency-lifecycle-${suffix}-${index}`,
        createdById: authorId,
        markdown: 'Test transparency lifecycle aggregation.',
        communityId,
      }),
    ),
  )
}
