import crypto from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  deleteTestCommunityAgentPrompt,
  hardDeleteTestCommunity,
  hardDeleteTestPost,
  hardDeleteTestModerationPrompt,
  getTestModerationTransparencyStampFunctionDefinition,
  getTestAgentModerationTransparencyStamp,
  getTestCommunityModerationTransparencyRollupVersion,
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

describe('moderation transparency agent rollups', () => {
  it('locks projection parent rows before projection advisory locks', async () => {
    const definition = await getTestModerationTransparencyStampFunctionDefinition()
    const lockOrder = [
      'FROM agents WHERE id = NEW.agent_id FOR KEY SHARE',
      'FROM agent_prompts WHERE id = NEW.prompt_id FOR KEY SHARE',
      'FROM communities WHERE id = v_community_id FOR KEY SHARE',
      'FROM community_agent_prompts WHERE id = NEW.prompt_id FOR SHARE',
      "fn_lock_moderation_transparency_projection('agent', NEW.agent_id)",
      "fn_lock_moderation_transparency_projection('prompt', NEW.prompt_id)",
    ]
    let previousIndex = -1
    for (const lock of lockOrder) {
      const index = definition.indexOf(lock)
      expect(index).toBeGreaterThan(previousIndex)
      previousIndex = index
    }
  })
  it('ignores unrelated updates and protects the source projection', async () => {
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
    const before = await getCommunityRollupVersion(community.id)
    await touchTestAgentModeration(moderationId)
    await expect(getCommunityRollupVersion(community.id)).resolves.toEqual(before)
    await expect(
      setTestAgentModerationTransparencyCategory(moderationId, 'agent_moderation'),
    ).rejects.toThrow('agent moderation transparency projection is trigger-maintained')
    await expect(getCommunityRollupVersion(community.id)).resolves.toEqual(before)
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

  it('does not deadlock a hard prompt cascade with a concurrent moderation insert', async () => {
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const [existingPostId, insertingPostId] = await createPosts(2, community.id, author.id)
    await insertTestAgentModeration({
      postId: existingPostId!,
      promptId: prompt.id,
      agentId: prompt.agent_id,
    })

    const [deletion, insertion] = await Promise.allSettled([
      hardDeleteTestModerationPrompt(prompt.id),
      insertTestAgentModeration({
        postId: insertingPostId!,
        promptId: prompt.id,
        agentId: prompt.agent_id,
      }),
    ])

    expect(deletion).toMatchObject({ status: 'fulfilled' })
    const insertionOutcome =
      insertion.status === 'fulfilled' ? 'fulfilled' : (insertion.reason as { code?: string }).code
    expect(['fulfilled', '23503']).toContain(insertionOutcome)
  })

  it('does not deadlock direct community-prompt removal with a moderation insert', async () => {
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const [existingPostId, insertingPostId] = await createPosts(2, community.id, author.id)
    await insertTestAgentModeration({
      postId: existingPostId!,
      promptId: prompt.id,
      agentId: prompt.agent_id,
    })

    const [deletion, insertion] = await Promise.allSettled([
      deleteTestCommunityAgentPrompt(prompt.id),
      insertTestAgentModeration({
        postId: insertingPostId!,
        promptId: prompt.id,
        agentId: prompt.agent_id,
      }),
    ])

    expect(deletion).toMatchObject({ status: 'fulfilled' })
    if (insertion.status === 'rejected') throw insertion.reason
    const stamp = await getTestAgentModerationTransparencyStamp(insertion.value)
    expect(['agent_moderation', 'community_ai']).toContain(stamp?.category)
    expect(stamp?.communityId).toBe(community.id)
  })

  it('does not deadlock a community cascade with a moderation insert', async () => {
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const [postId] = await createPosts(1, community.id, author.id)

    const [deletion, insertion] = await Promise.allSettled([
      hardDeleteTestCommunity(community.id),
      insertTestAgentModeration({ postId: postId!, promptId: prompt.id, agentId: prompt.agent_id }),
    ])

    expect(deletion).toMatchObject({ status: 'fulfilled' })
    const insertionOutcome =
      insertion.status === 'fulfilled' ? 'fulfilled' : (insertion.reason as { code?: string }).code
    expect(['fulfilled', '23503']).toContain(insertionOutcome)
  })
})

async function expectCommunity(communityId: string, now: Date, buckets: unknown[]): Promise<void> {
  await expect(getCommunityModerationTransparency(communityId, 'all', now)).resolves.toEqual({
    range: 'all',
    buckets,
  })
}

async function getCommunityRollupVersion(
  communityId: string,
): Promise<{ count: number; rowVersion: string }> {
  const version = await getTestCommunityModerationTransparencyRollupVersion(communityId)
  expect(version).toBeDefined()
  return version!
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
