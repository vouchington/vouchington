import { afterAll, beforeAll, expect, it, describe } from 'vitest'
import {
  createTestAgent,
  createTestUser,
  getPostLLMModerations,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestPost,
} from '@voucha/test-helpers'
import { onceElectionVoteStatsCompleted } from '@voucha/test-helpers/election-vote-stats'
import { holdQueueBulkAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { VOTE_AGGREGATION_UPDATE_ELECTION_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { caches } from '@services/entity-cache/caches'
import { getAgentModerationElectionsByIdBatch } from './get-election-batch.mts'
import { getAgentModerationElectionVote } from './votes-get.mts'
import { upsertAgentModerationElectionVotes } from './votes-upsert.mts'
import type { PrivateUser } from '@services/users/types'

// Reconstructed locally rather than imported from @services/entity-fetch: entity-fetch already
// depends on @services/elections-votes, so importing entity-fetch's cached getter back into
// elections-votes would create a fresh elections-votes<->entity-fetch cycle. Same cache
// instance/TTL/invalidation-keys as the agent-moderation batch cache.
const getAgentModerationElectionsByIdCachedBatch =
  caches.agent_moderation_elections.cacheGetByAnyBatch(getAgentModerationElectionsByIdBatch)

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
      results: { flagged: false },
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
    expect(
      (await getAgentModerationElectionsByIdCachedBatch([moderationId]))[0]?.votes_score_net,
    ).toBe(-25)

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
      results: { flagged: false },
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

  it('waits for agent moderation stats admission after committing the ballot', async () => {
    const suffix = crypto.randomUUID()
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    const postId = await insertTestPost({
      title: `Agent moderation admission ${suffix}`,
      slug: `agent-moderation-admission-${suffix}`,
      createdById: user.id,
      markdown: 'Agent moderation admission',
    })
    await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      flagged: false,
      results: { flagged: false },
    })
    const moderationId = ((await getPostLLMModerations(postId)) as Array<{ id: string }>)[0]?.id
    expect(moderationId).toBeDefined()
    if (!moderationId) throw new Error('Agent moderation ID not found')
    touchedModerationIds.add(moderationId)

    const jobName = VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name
    const admission = holdQueueBulkAdmission(
      voteAggregation,
      jobName,
      data =>
        typeof data === 'object' &&
        data !== null &&
        'electionId' in data &&
        data.electionId === moderationId &&
        'orderingKey' in data &&
        data.orderingKey === 'agent_moderation',
    )
    let entered = false
    void admission.entered.then(() => {
      entered = true
    })
    let settled = false
    let operation: ReturnType<typeof upsertAgentModerationElectionVotes> | undefined
    try {
      operation = upsertAgentModerationElectionVotes(user.id, [
        { entityId: moderationId, score: 1 },
      ]).finally(() => {
        settled = true
      })
      await admission.entered
      expect(await getAgentModerationElectionVote(user.id, moderationId)).toMatchObject({
        entity_id: moderationId,
        user_id: user.id,
        choice: 'accurate',
      })
      expect(settled).toBe(false)

      admission.release()
      const [votes, jobs] = await Promise.all([operation, admission.admitted])
      expect(votes).toEqual([expect.objectContaining({ entity_id: moderationId, score: 1 })])
      expect(jobs).toEqual([
        expect.objectContaining({
          name: jobName,
          data: { electionId: moderationId, orderingKey: 'agent_moderation' },
        }),
      ])
    } finally {
      admission.release()
      try {
        await operation?.catch(() => undefined)
        if (entered) await removeEnqueuedJobs([admission.admitted.catch(() => [])], jobName)
      } finally {
        admission.restore()
      }
    }
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
      results: { flagged: false },
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
    await onceElectionVoteStatsCompleted({
      electionId: moderationId,
      orderingKey: 'agent_moderation',
    })

    await caches.agent_moderation_elections.invalidateCacheGetByAny(moderationId)
    const [latest] = await getAgentModerationElectionsByIdCachedBatch([moderationId])
    expect(latest).toMatchObject(expected)
    return latest
  }
})
