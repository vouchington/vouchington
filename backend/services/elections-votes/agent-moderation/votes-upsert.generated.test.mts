import { afterAll, beforeAll, expect, it, describe } from 'vitest'
import {
  createTestAgent,
  createTestUser,
  getPostLLMModerations,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestPost,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { getAgentModerationElectionById } from './get-election.mts'
import { upsertAgentModerationElectionVotes } from './votes-upsert.mts'
import type { PrivateUser } from '@services/users/types'

// Reconstructed locally rather than imported from @services/entity-fetch: entity-fetch already
// depends on @services/elections-votes, so importing entity-fetch's cached getter back into
// elections-votes would create a fresh elections-votes<->entity-fetch cycle. Same cache
// instance/TTL/invalidation-keys as entity-fetch's getAgentModerationElectionByIdCached.
const getAgentModerationElectionByIdCached = caches.agent_moderation_elections.cacheGetByAny(
  getAgentModerationElectionById,
)

describe('votes-upsert.generated', () => {
  const touchedModerationIds = new Set<string>()

  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  afterAll(async () => {
    if (touchedModerationIds.size > 0) {
      await caches.agent_moderation_elections.invalidateCacheGetByAny(...touchedModerationIds)
    }
  })

  it('full agent moderation vote flow updates stats and refreshes cached election view', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    const postId = await insertTestPost({
      title: `Agent moderation vote flow ${random}`,
      slug: `agent-moderation-vote-flow-${random}`,
      createdById: user.id,
      markdown: 'Agent moderation vote flow markdown',
    })
    await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      flagged: false,
      results: { flagged: false, reason: 'Looks clean' },
    })

    const moderations = (await getPostLLMModerations(postId)) as Array<{ id: string }>
    const moderationId = moderations[0]?.id
    expect(moderationId).toBeDefined()
    if (!moderationId) {
      throw new Error('Agent moderation ID not found')
    }
    touchedModerationIds.add(moderationId)

    await caches.agent_moderation_elections.set(moderationId, {
      __entity_type: 'agent_moderation_election',
      id: moderationId,
      votes_score_net: -25,
      votes_count_up: 0,
      votes_count_down: 25,
    })
    expect((await getAgentModerationElectionByIdCached(moderationId))?.votes_score_net).toBe(-25)

    await upsertAgentModerationElectionVotes(user.id, [{ entityId: moderationId, score: 1 }])

    const refreshed = await waitForUpdatedElectionStats(moderationId)
    expect(refreshed?.votes_count_up).toBe(1)
    expect(refreshed?.votes_count_down).toBe(0)
    expect(refreshed?.votes_score_net).toBe(1)
  })

  it('upsertAgentModerationElectionVotes keeps the last score for duplicate election ids', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    const postId = await insertTestPost({
      title: `Agent moderation duplicate votes ${random}`,
      slug: `agent-moderation-duplicate-votes-${random}`,
      createdById: user.id,
      markdown: 'Agent moderation duplicate vote markdown',
    })
    await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      flagged: false,
      results: { flagged: false, reason: 'Looks clean' },
    })

    const moderations = (await getPostLLMModerations(postId)) as Array<{ id: string }>
    const moderationId = moderations[0]?.id
    expect(moderationId).toBeDefined()
    if (!moderationId) {
      throw new Error('Agent moderation ID not found')
    }
    touchedModerationIds.add(moderationId)

    const result = await upsertAgentModerationElectionVotes(user.id, [
      { entityId: moderationId, score: 1 },
      { entityId: moderationId, score: -1 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.score).toBe(-1)

    const refreshed = await waitForUpdatedElectionStats(moderationId, {
      votes_count_up: 0,
      votes_count_down: 1,
      votes_score_net: -1,
    })
    expect(refreshed?.votes_count_up).toBe(0)
    expect(refreshed?.votes_count_down).toBe(1)
    expect(refreshed?.votes_score_net).toBe(-1)
  })

  it('rolls back the ballot when its required transactional callback fails', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    const postId = await insertTestPost({
      title: `Agent moderation callback rollback ${random}`,
      slug: `agent-moderation-callback-rollback-${random}`,
      createdById: user.id,
      markdown: 'Agent moderation callback rollback markdown',
    })
    await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      flagged: false,
      results: { flagged: false, reason: 'Looks clean' },
    })

    const moderations = (await getPostLLMModerations(postId)) as Array<{ id: string }>
    const moderationId = moderations[0]?.id
    expect(moderationId).toBeDefined()
    if (!moderationId) throw new Error('Agent moderation ID not found')
    touchedModerationIds.add(moderationId)

    await expect(
      upsertAgentModerationElectionVotes(
        user.id,
        [{ entityId: moderationId, score: 1 }],
        undefined,
        async () => {
          throw new Error('feedback write failed')
        },
      ),
    ).rejects.toThrow('feedback write failed')

    const retry = await upsertAgentModerationElectionVotes(user.id, [
      { entityId: moderationId, score: 1 },
    ])
    expect(retry).toHaveLength(1)
    expect(retry[0]?.score).toBe(1)
  })

  async function waitForUpdatedElectionStats(
    moderationId: string,
    expected = {
      votes_count_up: 1,
      votes_count_down: 0,
      votes_score_net: 1,
    },
  ) {
    const latest = await pollUntilNotNull(
      async () => {
        await caches.agent_moderation_elections.invalidateCacheGetByAny(moderationId)
        const latest = await getAgentModerationElectionByIdCached(moderationId)
        if (
          latest &&
          latest.votes_count_up === expected.votes_count_up &&
          latest.votes_count_down === expected.votes_count_down &&
          latest.votes_score_net === expected.votes_score_net
        ) {
          return latest
        }
        return null
      },
      5000,
      100,
    )

    if (latest === null)
      throw new Error(
        `Agent moderation election stats did not converge in time: ${JSON.stringify({
          moderationId,
          expected,
        })}`,
      )
    return latest
  }
})
