import { describe, expect, it, onTestFinished } from 'vitest'
import crypto from 'node:crypto'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  insertTestAgentModeration,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  getCommunityModerationTransparency,
  getModerationTransparency,
} from './get-moderation-transparency.mts'

describe('getCommunityModerationTransparency', () => {
  it('does not expose a continuation for an older sparse community cohort', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 5))
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const posts = await createTransparencyPosts(19, community.id, author.id, crypto.randomUUID())
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

  it('exposes a continuation for an older released community cohort', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 5))
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const posts = await createTransparencyPosts(20, community.id, author.id, crypto.randomUUID())
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

    await expect(
      getCommunityModerationTransparency(community.id, 'all', now),
    ).resolves.toMatchObject({
      range: 'all',
      buckets: [],
      next_cursor: expect.any(String),
    })
  })

  it('coarsens all-time global and community projections while withholding deleted prompts', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 5))
    const suffix = crypto.randomUUID().slice(0, 8)
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const [includedCommunity, excludedCommunity] = await Promise.all([
      insertTestCommunity({ createdById: owner.id }),
      insertTestCommunity({ createdById: owner.id }),
    ])
    const [livePrompt, deletedPrompt] = await Promise.all([
      insertTestCommunityAgentPrompt({ communityId: includedCommunity.id, createdById: owner.id }),
      insertTestCommunityAgentPrompt({
        communityId: excludedCommunity.id,
        createdById: owner.id,
        deletedAt: new Date(occurredAt.getTime() - 1),
      }),
    ])
    const [includedPosts, deletedPosts] = await Promise.all([
      createTransparencyPosts(22, includedCommunity.id, author.id, suffix),
      createTransparencyPosts(22, excludedCommunity.id, author.id, suffix),
    ])
    await Promise.all([
      ...includedPosts.map((postId, occurredAtSequence) =>
        insertTestAgentModeration({
          postId,
          promptId: livePrompt.id,
          agentId: livePrompt.agent_id,
          occurredAt,
          occurredAtSequence,
        }),
      ),
      ...deletedPosts.map((postId, occurredAtSequence) =>
        insertTestAgentModeration({
          postId,
          promptId: deletedPrompt.id,
          agentId: deletedPrompt.agent_id,
          occurredAt,
          occurredAtSequence,
        }),
      ),
    ])

    const [global, included, excluded] = await Promise.all([
      getModerationTransparency('all', now),
      getCommunityModerationTransparency(includedCommunity.id, 'all', now),
      getCommunityModerationTransparency(excludedCommunity.id, 'all', now),
    ])
    const communityBucket = {
      date: `${occurredAt.toISOString().slice(0, 7)}-01`,
      metric: 'automated_moderation',
      category: 'community_ai',
      count: 20,
    }

    expect(global.buckets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: communityBucket.date,
          metric: communityBucket.metric,
          category: communityBucket.category,
        }),
      ]),
    )
    expect(included.buckets).toEqual([communityBucket])
    expect(excluded.buckets).toEqual([])
  })

  it('keeps prompt events from before prompt deletion and withholds later events', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const suffix = crypto.randomUUID().slice(0, 8)
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const [historicalPrompt, deletedPrompt] = await Promise.all([
      insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
        deletedPromptAt: new Date(occurredAt.getTime() + 24 * 60 * 60 * 1000),
      }),
      insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
        deletedPromptAt: new Date(occurredAt.getTime() - 1),
      }),
    ])
    const posts = await createTransparencyPosts(40, community.id, author.id, suffix)
    await Promise.all([
      ...posts.slice(0, 20).map((postId, occurredAtSequence) =>
        insertTestAgentModeration({
          postId,
          promptId: historicalPrompt.id,
          agentId: historicalPrompt.agent_id,
          occurredAt,
          occurredAtSequence,
        }),
      ),
      ...posts.slice(20).map((postId, occurredAtSequence) =>
        insertTestAgentModeration({
          postId,
          promptId: deletedPrompt.id,
          agentId: deletedPrompt.agent_id,
          occurredAt,
          occurredAtSequence: 100 + occurredAtSequence,
        }),
      ),
    ])

    await expect(getCommunityModerationTransparency(community.id, 'all', now)).resolves.toEqual({
      range: 'all',
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

  it('uses the latest complete UTC day for the today range', async () => {
    const now = await uniqueTransparencyNow()
    const delayCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000)
    const completeDay = new Date(
      Date.UTC(
        delayCutoff.getUTCFullYear(),
        delayCutoff.getUTCMonth(),
        delayCutoff.getUTCDate() - 1,
      ),
    )
    const occurredAt = new Date(completeDay)
    occurredAt.setUTCHours(6, 0, 0, 0)
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const posts = await createTransparencyPosts(20, community.id, author.id, crypto.randomUUID())
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

    await expect(getCommunityModerationTransparency(community.id, 'today', now)).resolves.toEqual({
      range: 'today',
      buckets: [
        {
          date: completeDay.toISOString().slice(0, 10),
          metric: 'automated_moderation',
          category: 'community_ai',
          count: 20,
        },
      ],
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
        slug: `transparency-${suffix}-${communityId.replaceAll('-', '').slice(-12)}-${index}`,
        createdById: authorId,
        markdown: 'Test transparency aggregation.',
        communityId,
      }),
    ),
  )
}
